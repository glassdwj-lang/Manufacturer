"""Request-For-Quote (RFQ) pipeline — Option C (hybrid).

Two RFQ origins live side-by-side, sharing the same collection & schema:

1. ``origin="gem_gallery"`` — RFQs authored by associates inside
   **gem-gallery-193**. That app remains the source of truth for the
   preference snapshot, the per-manufacturer serial numbers, and the
   broadcast lifecycle. Somnio.Co mirrors those documents into its
   local ``rfqs`` collection (via read-through ingest or the inbound
   webhook), storing every field verbatim — we never regenerate a
   serial for these.

2. ``origin="admin_bespoke"`` — RFQs an atelier admin creates locally
   inside Somnio.Co when a piece is *not* in the gem-gallery lookbook
   or catalog and the admin needs manufacturer pricing on it. These
   are minted here and follow the exact same serialisation format so
   both origins are indistinguishable downstream.

Serial format (from gem-gallery-193 production data)
=====================================================

::

    serial_storage:  "SC-01-1-2606-002"    ← DB/API form
    serial_display:  "SC 01 1 2606 002"    ← human-readable
    serial_engraved: "SC0112606002"        ← for laser engraving

    ┌────┬───────────────┬───────────────┬─────────┬────────┐
    │ SC │ 01            │ 1             │ 2606    │ 002    │
    ├────┼───────────────┼───────────────┼─────────┼────────┤
    │brand│ manufacturer │ piece_type    │  YYMM   │ seq    │
    │code │ code (2-digit)│ (int taxonomy)│         │(3-digit)│
    └────┴───────────────┴───────────────┴─────────┴────────┘

Rules:

* One RFQ produces **one serial per broadcast recipient**, not one
  per RFQ. Broadcasting to 3 manufacturers → 3 serials.
* ``seq`` scopes by ``(brand, manufacturer_code, yymm)``.
* Each broadcast expires after **14 days**. Admin may grant **one**
  14-day extension (holiday allowance) via
  ``POST /admin/rfqs/{id}/broadcasts/{bid}/extend``.

Endpoints (all under ``/api``)
==============================

Client / associate::
    POST  /rfqs                     (admin_bespoke or manual test only —
                                     production origin path is gem-gallery)
    GET   /rfqs/mine

Admin::
    GET   /admin/rfqs               (list, filter by status/origin)
    GET   /admin/rfqs/{id}
    POST  /admin/rfqs               (admin-bespoke create: "call up a
                                     preference" from admin)
    PATCH /admin/rfqs/{id}
    DELETE /admin/rfqs/{id}
    POST  /admin/rfqs/{id}/broadcast                       (allocate serials)
    POST  /admin/rfqs/{id}/broadcasts/{bid}/extend         (+14 days, one-shot)
    POST  /admin/rfqs/{id}/broadcasts/{bid}/response       (record mfg reply)
    POST  /admin/rfqs/{id}/import-to-quote?broadcast_id=…  (pre-fill a quote)
    POST  /admin/rfqs/ingest-from-gem-gallery              (read-through sync)

Webhook (inbound from gem-gallery-193)::
    POST  /gem-gallery/rfq-broadcast-updated

Manufacturer::
    GET   /manufacturer/rfqs        (broadcasts assigned to me, not-expired)
    GET   /manufacturer/rfqs/{id}
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel, Field

from deps import db, get_current_user, require_roles

router = APIRouter()


# ----------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------
# RFQ-level statuses. Kept close to gem-gallery's own vocabulary so a
# mirrored document doesn't need translation.
STATUS_PENDING_REVIEW = "pending_review"        # gem-gallery uses this
STATUS_BROADCASTING = "broadcasting"
STATUS_BROADCAST_COMPLETE = "broadcast_complete"
STATUS_IMPORTED = "imported_to_quote"
STATUS_CLIENT_QUOTED = "client_quoted"
STATUS_CANCELLED = "cancelled"
STATUS_DRAFT = "draft"                          # admin-bespoke pre-submit

ALL_STATUSES = {
    STATUS_PENDING_REVIEW,
    STATUS_BROADCASTING,
    STATUS_BROADCAST_COMPLETE,
    STATUS_IMPORTED,
    STATUS_CLIENT_QUOTED,
    STATUS_CANCELLED,
    STATUS_DRAFT,
}

# Broadcast-level statuses per gem-gallery.
BC_PENDING = "pending"
BC_SENT = "sent"
BC_SEND_FAILED = "send_failed"
BC_RESPONDED = "responded"
BC_EXPIRED = "expired"

BROADCAST_INITIAL_TTL_DAYS = 14
BROADCAST_EXTENSION_DAYS = 14

# Admin-bespoke brand default. Overridable via env.
ADMIN_BESPOKE_BRAND = os.environ.get("SOMNIO_BESPOKE_BRAND_CODE", "SB")

# --- Piece-type taxonomy (mirrors gem-gallery numeric ids) -----------
PIECE_TYPES: Dict[int, str] = {
    1: "Ring",
    2: "Pendant",
    3: "Earrings",
    4: "Bracelet",
    5: "Necklace",
    6: "Brooch",
    7: "Cufflinks",
    8: "Other",
}


# ----------------------------------------------------------------------
# Schemas
# ----------------------------------------------------------------------
class PreferenceSnapshot(BaseModel):
    """The atelier preference form. Mirrors gem-gallery-193's shape
    exactly so mirrored documents drop straight in.
    """

    id: Optional[str] = None
    name: Optional[str] = None
    ring_type: Optional[str] = None
    ring_size: Optional[str] = None
    metal_preferences: List[str] = Field(default_factory=list)
    metal_preference: Optional[str] = None          # singular gem-gallery uses
    gold_karat: Optional[str] = None
    main_stone_type: Optional[str] = None
    stone_shape: Optional[str] = None
    stone_shapes: List[str] = Field(default_factory=list)
    carat_weight: Optional[str] = None
    color_grade: Optional[str] = None
    clarity_grade: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    budget_currency: Optional[str] = None
    other_ring_elements: Optional[str] = None
    inscription_text: Optional[str] = None
    favourite_styles: List[str] = Field(default_factory=list)
    inspiration_image_urls: List[str] = Field(default_factory=list)
    extras: Dict[str, Any] = Field(default_factory=dict)


class Broadcast(BaseModel):
    """A single manufacturer's copy of an RFQ, uniquely serialised."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    rfq_id: str
    manufacturer_id: str
    manufacturer_code: int
    manufacturer_name_internal: Optional[str] = None
    manufacturer_email: Optional[str] = None

    # Serial triple — three renderings of the same underlying number.
    brand: str                                       # "SC" / "SA" / "SB" …
    piece_type: int                                   # 1..8
    yymm: str                                         # "2606"
    seq: int                                          # scope: (brand, mfr, yymm)
    serial_storage: str
    serial_display: str
    serial_engraved: str

    # Lifecycle
    allocated_at: str
    expires_at: str
    extension_granted: bool = False
    extension_granted_by: Optional[str] = None
    extension_granted_at: Optional[str] = None

    status: str = BC_PENDING                          # pending/sent/send_failed/responded/expired
    quote_url_public: Optional[str] = None
    email_message_id: Optional[str] = None
    email_error: Optional[str] = None
    included_attachment_count: int = 0
    admin_notes: Optional[str] = None

    # Manufacturer's captured response (used when the broadcast is
    # bespoke and no gem-gallery `quote_url_public` exists, or when
    # admin transcribes an email/phone reply).
    response: Optional[Dict[str, Any]] = None
    response_recorded_at: Optional[str] = None
    response_recorded_by: Optional[str] = None


class RFQ(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    origin: str                                      # "gem_gallery" | "admin_bespoke"
    external_id: Optional[str] = None                # gem-gallery's own id, if any

    # Owner + submitter (gem-gallery-mirrored fields kept verbatim)
    session_id: Optional[str] = None
    entry_id: Optional[str] = None
    user_id: Optional[str] = None                     # gem-gallery user id
    submitted_by_email: Optional[str] = None
    submitted_by_name: Optional[str] = None
    client_name: Optional[str] = None

    # Categorisation
    brand: str                                       # 2-letter brand code
    category: Optional[str] = None                   # "rings" | "pendants" …
    piece_type: int                                  # numeric id
    piece_type_label: Optional[str] = None

    # Content
    preference_snapshot: Optional[PreferenceSnapshot] = None
    attachment_ids: List[str] = Field(default_factory=list)
    admin_attachments: List[Dict[str, Any]] = Field(default_factory=list)

    # Lifecycle
    status: str = STATUS_PENDING_REVIEW
    fingerprint: Optional[str] = None
    submitted_at: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_broadcast_at: Optional[str] = None
    broadcast_count: int = 0
    broadcasts: List[Broadcast] = Field(default_factory=list)

    # Downstream links
    linked_order_id: Optional[str] = None
    linked_quote_id: Optional[str] = None

    # Audit
    admin_notes: Optional[str] = None
    history: List[Dict[str, Any]] = Field(default_factory=list)

    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    deleted: bool = False


# --- Request payloads --------------------------------------------------
class AdminBespokeCreatePayload(BaseModel):
    """Admin "calls up a preference" for a piece that isn't in the
    catalog/lookbook, to price it with manufacturers."""

    client_name: Optional[str] = None
    brand: Optional[str] = None                      # defaults to SB
    piece_type: int
    category: Optional[str] = None
    preference_snapshot: PreferenceSnapshot
    admin_notes: Optional[str] = None
    submit_immediately: bool = True


class AdminRFQPatchPayload(BaseModel):
    client_name: Optional[str] = None
    brand: Optional[str] = None
    piece_type: Optional[int] = None
    category: Optional[str] = None
    preference_snapshot: Optional[PreferenceSnapshot] = None
    admin_notes: Optional[str] = None
    status: Optional[str] = None


class BroadcastRequestPayload(BaseModel):
    manufacturer_ids: List[str]
    admin_notes: Optional[str] = None
    include_attachment_ids: List[str] = Field(default_factory=list)


class BroadcastResponsePayload(BaseModel):
    """Admin transcribes the manufacturer's reply, or manufacturer
    submits directly. Uses a free-form dict so the shape can evolve
    without a migration — canonical keys mirror gem-gallery's variant
    fields.
    """

    price_usd: Optional[float] = None
    metal: Optional[str] = None
    stone_kind: Optional[str] = None                 # 'lab_diamond'|'moissanite'
    lab_diamond_size_ct: Optional[float] = None
    lab_diamond_color: Optional[str] = None
    lab_diamond_clarity: Optional[str] = None
    piece_weight_g: Optional[float] = None
    lead_time_days: Optional[int] = None
    notes: Optional[str] = None
    extras: Dict[str, Any] = Field(default_factory=dict)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def _yymm(dt: datetime) -> str:
    return f"{dt.year % 100:02d}{dt.month:02d}"


def _history(user: dict, event: str, **extra: Any) -> Dict[str, Any]:
    entry = {
        "at": _now_iso(),
        "by": user.get("id"),
        "by_role": user.get("role"),
        "actor": user.get("email"),
        "event": event,
    }
    entry.update(extra)
    return entry


def _format_serial(brand: str, mfr_code: int, piece_type: int, yymm: str, seq: int) -> Dict[str, str]:
    """Produce the storage, display, and engraved renderings."""
    parts = (brand.upper(), f"{mfr_code:02d}", str(piece_type), yymm, f"{seq:03d}")
    return {
        "serial_storage": "-".join(parts),
        "serial_display": " ".join(parts),
        "serial_engraved": "".join(parts),
    }


async def _allocate_serial(brand: str, mfr_code: int, piece_type: int) -> Dict[str, Any]:
    """Atomically allocate the next serial for a (brand, manufacturer, yymm) scope.

    We `$inc` a counter document keyed by that triple so concurrent
    broadcasts to the same manufacturer within the same calendar month
    never collide.
    """
    dt = _now()
    yymm = _yymm(dt)
    counter_id = f"serial_{brand.upper()}_{mfr_code:02d}_{yymm}"
    result = await db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = (result or {}).get("seq", 1)
    triple = _format_serial(brand, mfr_code, piece_type, yymm, seq)
    return {"brand": brand.upper(), "mfr_code": mfr_code, "piece_type": piece_type,
            "yymm": yymm, "seq": seq, **triple}


async def _load_rfq(rfq_id: str) -> Dict[str, Any]:
    rfq = await db.rfqs.find_one({"id": rfq_id, "deleted": {"$ne": True}}, {"_id": 0})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return rfq


def _assert_admin_or_owner(rfq: dict, user: dict) -> None:
    role = user.get("role")
    if role == "admin":
        return
    if rfq.get("user_id") == user.get("id"):
        return
    if rfq.get("submitted_by_email") and rfq["submitted_by_email"].lower() == (user.get("email") or "").lower():
        return
    raise HTTPException(status_code=403, detail="Not permitted on this RFQ")


def _expire_dates(now: Optional[datetime] = None, days: int = BROADCAST_INITIAL_TTL_DAYS) -> str:
    now = now or _now()
    return (now + timedelta(days=days)).isoformat()


def _mark_expired(broadcast: dict) -> dict:
    """If a broadcast's expires_at has passed and it hasn't been
    responded to, flip its status to `expired`. Returns the possibly
    mutated dict; caller decides whether to persist.
    """
    if broadcast.get("status") in (BC_RESPONDED, BC_EXPIRED):
        return broadcast
    exp = broadcast.get("expires_at")
    if not exp:
        return broadcast
    try:
        exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
    except ValueError:
        return broadcast
    if _now() >= exp_dt:
        broadcast["status"] = BC_EXPIRED
    return broadcast


# ----------------------------------------------------------------------
# ADMIN: bespoke create + CRUD
# ----------------------------------------------------------------------
@router.post("/admin/rfqs", summary="Admin bespoke: call up a preference and create an RFQ for pricing")
async def admin_create_bespoke_rfq(
    body: AdminBespokeCreatePayload,
    user=Depends(require_roles("admin")),
):
    if body.piece_type not in PIECE_TYPES:
        raise HTTPException(status_code=400, detail=f"piece_type must be one of {list(PIECE_TYPES)}")
    brand = (body.brand or ADMIN_BESPOKE_BRAND).upper()
    if len(brand) != 2 or not brand.isalpha():
        raise HTTPException(status_code=400, detail="brand must be a 2-letter code")

    rfq = RFQ(
        origin="admin_bespoke",
        brand=brand,
        client_name=body.client_name,
        piece_type=body.piece_type,
        piece_type_label=PIECE_TYPES[body.piece_type],
        category=body.category,
        preference_snapshot=body.preference_snapshot,
        admin_notes=body.admin_notes,
        submitted_by_email=user.get("email"),
        submitted_by_name=user.get("name"),
        user_id=user.get("id"),
        status=STATUS_PENDING_REVIEW if body.submit_immediately else STATUS_DRAFT,
        submitted_at=_now_iso() if body.submit_immediately else None,
    )
    rfq.history.append(_history(user, "admin_bespoke_created",
                                brand=brand, piece_type=body.piece_type))
    doc = rfq.model_dump()
    await db.rfqs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/admin/rfqs", summary="Admin: list RFQs (optional status/origin filters)")
async def admin_list_rfqs(
    status: Optional[str] = None,
    origin: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    q: Dict[str, Any] = {"deleted": {"$ne": True}}
    if status:
        if status not in ALL_STATUSES:
            raise HTTPException(status_code=400, detail="Unknown status filter")
        q["status"] = status
    if origin:
        if origin not in ("gem_gallery", "admin_bespoke"):
            raise HTTPException(status_code=400, detail="origin must be gem_gallery|admin_bespoke")
        q["origin"] = origin
    cursor = db.rfqs.find(q, {"_id": 0}).sort("updated_at", -1)
    docs = [d async for d in cursor]
    # Lazily flip expired broadcasts so the UI shows correct states.
    for d in docs:
        for bc in d.get("broadcasts", []):
            _mark_expired(bc)
    return docs


@router.get("/admin/rfqs/{rfq_id}", summary="Admin: fetch a single RFQ (expiry lazily reconciled)")
async def admin_get_rfq(rfq_id: str, user=Depends(require_roles("admin"))):
    rfq = await _load_rfq(rfq_id)
    changed = False
    for bc in rfq.get("broadcasts", []):
        prev = bc.get("status")
        _mark_expired(bc)
        if bc.get("status") != prev:
            changed = True
    if changed:
        await db.rfqs.update_one({"id": rfq_id}, {"$set": {"broadcasts": rfq["broadcasts"],
                                                            "updated_at": _now_iso()}})
    return rfq


@router.patch("/admin/rfqs/{rfq_id}", summary="Admin: edit RFQ header/preference")
async def admin_patch_rfq(
    rfq_id: str,
    body: AdminRFQPatchPayload,
    user=Depends(require_roles("admin")),
):
    rfq = await _load_rfq(rfq_id)
    patch: Dict[str, Any] = {"updated_at": _now_iso()}
    changed_fields: List[str] = []
    for k in ("client_name", "brand", "piece_type", "category", "admin_notes"):
        v = getattr(body, k)
        if v is not None:
            patch[k] = v.upper() if k == "brand" else v
            changed_fields.append(k)
    if body.piece_type is not None:
        if body.piece_type not in PIECE_TYPES:
            raise HTTPException(status_code=400, detail="Unknown piece_type")
        patch["piece_type_label"] = PIECE_TYPES[body.piece_type]
    if body.preference_snapshot is not None:
        patch["preference_snapshot"] = body.preference_snapshot.model_dump()
        changed_fields.append("preference_snapshot")
    if body.status is not None:
        if body.status not in ALL_STATUSES:
            raise HTTPException(status_code=400, detail="Unknown status")
        patch["status"] = body.status
        changed_fields.append("status")
    entry = _history(user, "admin_edit", fields=changed_fields)
    await db.rfqs.update_one({"id": rfq_id}, {"$set": patch, "$push": {"history": entry}})
    rfq.update(patch)
    rfq.setdefault("history", []).append(entry)
    return rfq


@router.delete("/admin/rfqs/{rfq_id}", summary="Admin: soft-delete an RFQ")
async def admin_delete_rfq(rfq_id: str, user=Depends(require_roles("admin"))):
    res = await db.rfqs.update_one(
        {"id": rfq_id, "deleted": {"$ne": True}},
        {"$set": {"deleted": True, "deleted_at": _now_iso(), "deleted_by": user.get("id")}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return {"ok": True}


# ----------------------------------------------------------------------
# ADMIN: broadcast (allocate serials per manufacturer)
# ----------------------------------------------------------------------
@router.post(
    "/admin/rfqs/{rfq_id}/broadcast",
    summary="Admin: broadcast RFQ to one or more manufacturers; each gets a fresh serial",
)
async def admin_broadcast_rfq(
    rfq_id: str,
    body: BroadcastRequestPayload,
    user=Depends(require_roles("admin")),
):
    if not body.manufacturer_ids:
        raise HTTPException(status_code=400, detail="At least one manufacturer id required")
    rfq = await _load_rfq(rfq_id)
    if rfq.get("status") in (STATUS_CANCELLED,):
        raise HTTPException(status_code=400, detail="RFQ is cancelled")

    # `manufacturer_ids` are DIRECTORY ids (from the `manufacturers`
    # collection — Somnio is source of truth). Look up code, name,
    # gem_gallery_id, and any linked login user.
    mfrs = await db.manufacturers.find(
        {"id": {"$in": body.manufacturer_ids}, "deleted": {"$ne": True}},
        {"_id": 0},
    ).to_list(length=200)
    by_id = {m["id"]: m for m in mfrs}
    missing = [m for m in body.manufacturer_ids if m not in by_id]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown manufacturer directory ids: {', '.join(missing)}",
        )
    inactive = [m["id"] for m in mfrs if m.get("status") in ("paused", "burned")]
    if inactive:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot broadcast to paused/burned manufacturers: {', '.join(inactive)}",
        )

    # Resolve optional Somnio login user for each directory entry.
    linked_users = await db.users.find(
        {"manufacturer_id": {"$in": body.manufacturer_ids}, "role": "manufacturer"},
        {"_id": 0, "id": 1, "manufacturer_id": 1, "email": 1},
    ).to_list(length=200)
    user_by_mfr = {u["manufacturer_id"]: u for u in linked_users}

    brand = rfq.get("brand") or ADMIN_BESPOKE_BRAND
    piece_type = rfq.get("piece_type") or 8
    now = _now()

    # Existing broadcasts stay; we append new ones.
    existing = list(rfq.get("broadcasts", []))
    new_broadcasts: List[Broadcast] = []
    for dir_id in body.manufacturer_ids:
        mfr = by_id[dir_id]
        login = user_by_mfr.get(dir_id) or {}
        alloc = await _allocate_serial(brand, int(mfr["code"]), piece_type)
        bc = Broadcast(
            rfq_id=rfq_id,
            manufacturer_id=login.get("id") or dir_id,  # login user id if any, else dir id
            manufacturer_code=int(mfr["code"]),
            manufacturer_name_internal=mfr.get("name"),
            manufacturer_email=mfr.get("contact_email"),
            brand=alloc["brand"],
            piece_type=alloc["piece_type"],
            yymm=alloc["yymm"],
            seq=alloc["seq"],
            serial_storage=alloc["serial_storage"],
            serial_display=alloc["serial_display"],
            serial_engraved=alloc["serial_engraved"],
            allocated_at=now.isoformat(),
            expires_at=_expire_dates(now, days=BROADCAST_INITIAL_TTL_DAYS),
            status=BC_PENDING,
            included_attachment_count=len(body.include_attachment_ids),
            admin_notes=body.admin_notes,
        )
        # Stash directory id + gem_gallery_id on the broadcast for
        # downstream cross-referencing (quotes + gem-gallery push-backs).
        bc_dict = bc.model_dump()
        bc_dict["manufacturer_directory_id"] = dir_id
        bc_dict["manufacturer_gem_gallery_id"] = mfr.get("gem_gallery_id")
        new_broadcasts.append(bc_dict)  # type: ignore[arg-type]

    merged = existing + new_broadcasts
    entry = _history(
        user, "broadcast",
        manufacturer_ids=body.manufacturer_ids,
        allocated_serials=[b["serial_storage"] for b in new_broadcasts],
    )
    await db.rfqs.update_one(
        {"id": rfq_id},
        {
            "$set": {
                "broadcasts": merged,
                "status": STATUS_BROADCAST_COMPLETE,
                "broadcast_count": len(merged),
                "last_broadcast_at": now.isoformat(),
                "updated_at": now.isoformat(),
            },
            "$push": {"history": entry},
        },
    )
    rfq["broadcasts"] = merged
    rfq["status"] = STATUS_BROADCAST_COMPLETE
    rfq["broadcast_count"] = len(merged)
    rfq["last_broadcast_at"] = now.isoformat()
    rfq["updated_at"] = now.isoformat()
    rfq.setdefault("history", []).append(entry)
    return rfq


@router.post(
    "/admin/rfqs/{rfq_id}/broadcasts/{broadcast_id}/extend",
    summary="Admin: grant one 14-day extension to a broadcast (holiday allowance, one-shot)",
)
async def admin_extend_broadcast(
    rfq_id: str,
    broadcast_id: str,
    user=Depends(require_roles("admin")),
):
    rfq = await _load_rfq(rfq_id)
    bcs = rfq.get("broadcasts", [])
    target = next((b for b in bcs if b.get("id") == broadcast_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Broadcast not found on this RFQ")
    if target.get("extension_granted"):
        raise HTTPException(status_code=400, detail="Extension already granted for this broadcast")
    if target.get("status") == BC_RESPONDED:
        raise HTTPException(status_code=400, detail="Broadcast already responded — extension not applicable")

    # Extend from whichever is later: current expires_at, or now.
    try:
        current_exp = datetime.fromisoformat((target.get("expires_at") or "").replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        current_exp = _now()
    base = max(current_exp, _now())
    new_exp = (base + timedelta(days=BROADCAST_EXTENSION_DAYS)).isoformat()

    target["expires_at"] = new_exp
    target["extension_granted"] = True
    target["extension_granted_by"] = user.get("id")
    target["extension_granted_at"] = _now_iso()
    if target.get("status") == BC_EXPIRED:
        # Reopen the broadcast — same URL, extended window.
        target["status"] = BC_SENT if target.get("email_message_id") else BC_PENDING

    entry = _history(user, "broadcast_extended", broadcast_id=broadcast_id, new_expires_at=new_exp)
    await db.rfqs.update_one(
        {"id": rfq_id},
        {"$set": {"broadcasts": bcs, "updated_at": _now_iso()}, "$push": {"history": entry}},
    )
    return {"ok": True, "broadcast": target}


@router.post(
    "/admin/rfqs/{rfq_id}/broadcasts/{broadcast_id}/response",
    summary="Record a manufacturer's response (admin transcribes or mfg posts directly)",
)
async def record_broadcast_response(
    rfq_id: str,
    broadcast_id: str,
    body: BroadcastResponsePayload,
    user=Depends(get_current_user),
):
    rfq = await _load_rfq(rfq_id)
    bcs = rfq.get("broadcasts", [])
    target = next((b for b in bcs if b.get("id") == broadcast_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Broadcast not found on this RFQ")

    role = user.get("role")
    if role == "manufacturer" and target.get("manufacturer_id") != user.get("id"):
        raise HTTPException(status_code=403, detail="Not your broadcast")
    if role not in ("admin", "manufacturer"):
        raise HTTPException(status_code=403, detail="Admin or manufacturer role required")

    _mark_expired(target)
    if target.get("status") == BC_EXPIRED:
        raise HTTPException(status_code=400, detail="Broadcast has expired; grant an extension first")

    target["response"] = body.model_dump()
    target["response_recorded_at"] = _now_iso()
    target["response_recorded_by"] = user.get("id")
    target["status"] = BC_RESPONDED

    entry = _history(user, "response_recorded", broadcast_id=broadcast_id,
                     serial=target.get("serial_storage"))
    await db.rfqs.update_one(
        {"id": rfq_id},
        {"$set": {"broadcasts": bcs, "updated_at": _now_iso()}, "$push": {"history": entry}},
    )
    return {"ok": True, "broadcast": target}


def _derive_metal_atoms(prefs: dict, resp: dict | None = None) -> dict:
    """Derive atomic metal attributes from RFQ preferences + broadcast
    response. Response's ``metal`` wins over prefs' ``metal_preference``
    / ``gold_karat``. Emits ``metal_type`` (e.g. "18K White Gold") and
    ``metal_weight_g`` (float, from response's ``piece_weight_g``).
    """
    prefs = prefs or {}
    resp = resp or {}

    # --- metal_type ---------------------------------------------------
    # Prefer the manufacturer's confirmed material name. Fall back to the
    # atelier ask ("18k" karat + "white gold" preference).
    raw = (resp.get("metal") or "").strip()
    if not raw:
        karat = str(prefs.get("gold_karat") or "").strip()
        pref  = str(prefs.get("metal_preference") or "").strip()
        # If both are set, combine "18K" + "white gold" → "18K White Gold".
        parts: list[str] = []
        if karat:
            parts.append(karat if karat.upper().endswith("K") else f"{karat}K")
        if pref:
            parts.append(pref)
        raw = " ".join(parts)
    # Normalise casing — "18K White Gold" reads better than "18k white gold".
    metal_type: str | None
    if raw:
        # Special-case "K" so we don't lowercase "18K" → "18k".
        metal_type = " ".join(
            (w.upper() if len(w) <= 3 and w.upper().endswith("K") else w.capitalize())
            for w in raw.split()
        )
    else:
        metal_type = None

    # --- metal_weight_g ----------------------------------------------
    w = resp.get("piece_weight_g")
    if w is not None:
        try:
            w = float(w)
        except (TypeError, ValueError):
            w = None
    return {"metal_type": metal_type, "metal_weight_g": w}


def _compose_metal_spec(atoms: dict) -> str:
    """Human-readable metal spec — "18K White Gold, 6g"."""
    parts: list[str] = []
    mt = (atoms.get("metal_type") or "").strip()
    if mt:
        parts.append(mt)
    w = atoms.get("metal_weight_g")
    try:
        if w is not None and float(w) > 0:
            parts.append(f"{float(w):g}g")
    except (TypeError, ValueError):
        pass
    return ", ".join(parts)


def _derive_stone_atoms(prefs: dict, resp: dict | None = None) -> dict:
    """Derive atomic stone attributes from an RFQ's ``preference_snapshot``
    and (optional) manufacturer broadcast ``response``. Response fields
    win over preferences because they're the manufacturer's confirmed
    specs, but the atoms always fall back to the atelier's ask.

    Emits keys: ``diamond_type`` (lab|natural), ``diamond_carat``,
    ``diamond_shape``, ``diamond_color``, ``diamond_clarity``.
    Empty / missing sources yield ``None`` (never a spurious "0" or "").
    """
    prefs = prefs or {}
    resp = resp or {}

    # --- diamond_type -------------------------------------------------
    # ``stone_kind`` in the response is canonical: 'lab_diamond' /
    # 'natural_diamond' / 'moissanite'. Fall back to prefs.main_stone_type
    # which uses the same vocabulary via gem-gallery.
    stone_kind = (
        (resp.get("stone_kind") or prefs.get("main_stone_type") or "")
        .strip()
        .lower()
        .replace(" ", "_")
    )
    if "lab" in stone_kind:
        diamond_type = "lab"
    elif "natural" in stone_kind or stone_kind == "diamond":
        diamond_type = "natural"
    else:
        # Moissanite, sapphire, etc. — leave blank so admin sees an
        # untouched Type toggle and knows to confirm.
        diamond_type = None

    # --- diamond_carat -----------------------------------------------
    # Response has a numeric ``lab_diamond_size_ct``; prefs is a free-form
    # ``carat_weight`` string like "3ct" / "3.0 - 3.5". Parse defensively.
    ct: float | None = None
    raw_ct = resp.get("lab_diamond_size_ct")
    if raw_ct is not None:
        try:
            ct = float(raw_ct)
        except (TypeError, ValueError):
            ct = None
    if ct is None:
        raw = str(prefs.get("carat_weight") or "").strip()
        if raw:
            # Extract the first numeric token — handles "3", "3ct",
            # "3.0", "3-3.5", "3 – 3.5", "3ct approx", etc.
            import re
            m = re.search(r"\d+(?:\.\d+)?", raw)
            if m:
                try:
                    ct = float(m.group(0))
                except ValueError:
                    ct = None

    # --- diamond_shape -----------------------------------------------
    shape = (
        prefs.get("stone_shape")
        or (prefs.get("stone_shapes") or [None])[0]
        or None
    )
    if shape:
        shape = str(shape).strip().title() or None

    # --- diamond_color / clarity -------------------------------------
    color = (
        resp.get("lab_diamond_color") or prefs.get("color_grade") or None
    )
    if color:
        color = str(color).strip().upper() or None

    clarity = (
        resp.get("lab_diamond_clarity") or prefs.get("clarity_grade") or None
    )
    if clarity:
        clarity = str(clarity).strip().upper() or None

    return {
        "diamond_type": diamond_type,
        "diamond_carat": ct,
        "diamond_shape": shape,
        "diamond_color": color,
        "diamond_clarity": clarity,
    }


def _compose_stone_spec(atoms: dict) -> str:
    """Human-readable ``stone_spec`` from atomic fields — mirrors the
    frontend composer so PDFs and back-end templates render identically.
    """
    parts: list[str] = []
    t = (atoms.get("diamond_type") or "").strip()
    if t:
        parts.append(f"{t} diamond")
    ct = atoms.get("diamond_carat")
    try:
        if ct is not None and float(ct) > 0:
            # Trim trailing .0 for cleaner display ("3ct" not "3.0ct").
            f = float(ct)
            parts.append(f"{f:g}ct")
    except (TypeError, ValueError):
        pass
    for k in ("diamond_shape", "diamond_color", "diamond_clarity"):
        v = (atoms.get(k) or "").strip() if isinstance(atoms.get(k), str) else atoms.get(k)
        if v:
            parts.append(str(v))
    return " | ".join(parts)


# ----------------------------------------------------------------------
# ADMIN: import a broadcast response into a Quote
# ----------------------------------------------------------------------
@router.post(
    "/admin/rfqs/{rfq_id}/import-to-quote",
    summary="Admin: turn a responded broadcast into a draft Quote",
)
async def admin_import_broadcast_to_quote(
    rfq_id: str,
    broadcast_id: str = Query(...),
    user=Depends(require_roles("admin")),
):
    rfq = await _load_rfq(rfq_id)
    bc = next((b for b in rfq.get("broadcasts", []) if b.get("id") == broadcast_id), None)
    if not bc:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    if not bc.get("response"):
        raise HTTPException(status_code=400, detail="Broadcast has no recorded response yet")

    prefs = rfq.get("preference_snapshot") or {}
    resp = bc.get("response") or {}
    now = _now_iso()
    quote_id = str(uuid4())
    # Auto-derive atomic diamond fields from prefs + response so the
    # Stone-Spec row is prefilled — admin can still overwrite before send.
    stone_atoms = _derive_stone_atoms(prefs, resp)
    metal_atoms = _derive_metal_atoms(prefs, resp)
    stone_spec_composed = _compose_stone_spec(stone_atoms) or (
        resp.get("stone_kind") or prefs.get("main_stone_type") or ""
    )
    metal_spec_composed = _compose_metal_spec(metal_atoms) or (
        resp.get("metal") or prefs.get("metal_preference") or ""
    )
    quote_doc = {
        "id": quote_id,
        "rfq_id": rfq_id,
        "broadcast_id": broadcast_id,
        "serial_storage": bc.get("serial_storage"),
        "serial_display": bc.get("serial_display"),
        "serial_engraved": bc.get("serial_engraved"),
        "brand": bc.get("brand"),
        "manufacturer_code": bc.get("manufacturer_code"),
        "piece_type": bc.get("piece_type"),
        "yymm": bc.get("yymm"),
        "seq": bc.get("seq"),
        "order_id": rfq.get("linked_order_id"),
        "jewelry_name": prefs.get("name") or rfq.get("piece_type_label"),
        "status": "draft",
        "inputs": {
            "piece_description": prefs.get("name") or rfq.get("piece_type_label"),
            "metal_spec": metal_spec_composed,
            "stone_spec": stone_spec_composed,
            # Atomic metal + stone fields — power the split Product-Spec
            # rows on the frontend and Market-Anchor filtering.
            **metal_atoms,
            **stone_atoms,
            "ring_cost_usd": resp.get("price_usd") or 0.0,
            "includes_hidden_halo_pave": False,
            "hidden_halo_pave_cost_usd": 0.0,
            "extra_cut_cost_usd": 0.0,
            "cad_rendering_cost_usd": 0.0,
            "provenance_cost_usd": 0.0,
            "certification_cost_usd": 0.0,
            "box_packaging_cost_usd": 0.0,
            "air_freight_cost_usd": 0.0,
            "usd_to_aud_rate": 1.5,
            "custom_clearance_aud": 0.0,
            "australian_delivery_aud": 0.0,
            "intl_transaction_fees_aud": 0.0,
            "duty_or_chafta_aud": 0.0,
            "markup_pct": 0.0,
            "gst_pct": 10.0,
            "discount_tiers": [],
        },
        "totals": None,
        "created_by": user.get("id"),
        "created_at": now,
        "updated_at": now,
        "deleted": False,
    }
    await db.quotes.insert_one(quote_doc)
    quote_doc.pop("_id", None)

    entry = _history(user, "imported_to_quote", broadcast_id=broadcast_id, quote_id=quote_id)
    await db.rfqs.update_one(
        {"id": rfq_id},
        {
            "$set": {"status": STATUS_IMPORTED, "linked_quote_id": quote_id, "updated_at": now},
            "$push": {"history": entry},
        },
    )
    return {"rfq_id": rfq_id, "broadcast_id": broadcast_id, "quote_id": quote_id, "quote": quote_doc}


# ----------------------------------------------------------------------
# ADMIN: ingest / sync from gem-gallery-193
# ----------------------------------------------------------------------
async def _gg_admin_token(c: httpx.AsyncClient, base: str) -> str:
    """Log into gem-gallery-193 using the shared admin creds."""
    email = os.environ.get("GEM_GALLERY_ADMIN_EMAIL")
    pw = os.environ.get("GEM_GALLERY_ADMIN_PASSWORD")
    if not (base and email and pw):
        raise HTTPException(
            status_code=503,
            detail="gem-gallery credentials not configured on this pod",
        )
    r = await c.post(f"{base}/api/admin/auth", json={"email": email, "password": pw})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"gem-gallery auth failed: HTTP {r.status_code}")
    return r.json()["access_token"]


def _upsert_from_gem_gallery(record: dict) -> dict:
    """Turn a gem-gallery /api/admin/rfq/{id} payload into our RFQ shape.

    We keep the record's own id + fields verbatim so cross-referencing is
    trivial, and stamp origin="gem_gallery" plus a mirror timestamp.
    """
    now = _now_iso()
    doc = {
        "id": record.get("id") or str(uuid4()),
        "origin": "gem_gallery",
        "external_id": record.get("id"),
        "session_id": record.get("session_id"),
        "entry_id": record.get("entry_id"),
        "user_id": record.get("user_id"),
        "submitted_by_email": record.get("submitted_by_email"),
        "submitted_by_name": record.get("submitted_by_name"),
        "client_name": record.get("client_name"),
        "brand": (record.get("brand") or "").upper() or "SC",
        "category": record.get("category"),
        "piece_type": int(record.get("piece_type") or 8),
        "piece_type_label": record.get("piece_type_label"),
        "preference_snapshot": record.get("preference_snapshot"),
        "attachment_ids": record.get("attachment_ids", []),
        "admin_attachments": record.get("admin_attachments", []),
        "status": record.get("status") or STATUS_PENDING_REVIEW,
        "fingerprint": record.get("fingerprint"),
        "submitted_at": record.get("submitted_at"),
        "updated_at": record.get("updated_at") or now,
        "last_broadcast_at": record.get("last_broadcast_at"),
        "broadcast_count": record.get("broadcast_count", 0),
        "broadcasts": record.get("broadcasts", []),  # verbatim — trusted origin
        "admin_notes": record.get("admin_notes"),
        "history": record.get("history", []),
        "created_at": record.get("submitted_at") or now,
        "deleted": False,
        "mirrored_at": now,
    }
    return doc


@router.post(
    "/admin/rfqs/ingest-from-gem-gallery",
    summary="Admin: pull the current RFQ queue from gem-gallery-193 and mirror locally",
)
async def admin_ingest_from_gem_gallery(user=Depends(require_roles("admin"))):
    base = (os.environ.get("GEM_GALLERY_BASE_URL") or "").rstrip("/")
    if not base:
        raise HTTPException(status_code=503, detail="GEM_GALLERY_BASE_URL not configured")
    async with httpx.AsyncClient(timeout=30) as c:
        token = await _gg_admin_token(c, base)
        H = {"Authorization": f"Bearer {token}"}
        r = await c.get(f"{base}/api/admin/rfq/queue", headers=H)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"queue fetch failed HTTP {r.status_code}")
        summaries = r.json()
        upserted = 0
        for summary in summaries:
            rid = summary.get("id")
            if not rid:
                continue
            rd = await c.get(f"{base}/api/admin/rfq/{rid}", headers=H)
            if rd.status_code != 200:
                continue
            doc = _upsert_from_gem_gallery(rd.json())
            await db.rfqs.update_one(
                {"id": doc["id"], "origin": "gem_gallery"},
                {"$set": doc},
                upsert=True,
            )
            upserted += 1
    return {"ok": True, "upserted": upserted, "source": base}


# ----------------------------------------------------------------------
# WEBHOOK: gem-gallery-193 pushes broadcast lifecycle updates
# ----------------------------------------------------------------------
@router.post(
    "/gem-gallery/rfq-broadcast-updated",
    summary="Inbound webhook: gem-gallery pushes an RFQ or broadcast update",
)
async def gg_webhook(
    payload: Dict[str, Any],
    x_gem_gallery_signature: Optional[str] = Header(default=None, alias="X-Gem-Gallery-Signature"),
):
    expected = os.environ.get("GEM_GALLERY_WEBHOOK_SECRET")
    if expected:
        if not x_gem_gallery_signature or x_gem_gallery_signature != expected:
            raise HTTPException(status_code=401, detail="bad signature")
    record = payload.get("rfq") or payload
    if not record.get("id"):
        raise HTTPException(status_code=400, detail="payload missing rfq.id")
    doc = _upsert_from_gem_gallery(record)
    await db.rfqs.update_one(
        {"id": doc["id"], "origin": "gem_gallery"},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "id": doc["id"]}


# ----------------------------------------------------------------------
# MANUFACTURER: view broadcasts assigned to me
# ----------------------------------------------------------------------
@router.get("/manufacturer/rfqs", summary="Manufacturer: my active broadcasts (not-expired)")
async def mfg_list_broadcasts(user=Depends(require_roles("manufacturer"))):
    cursor = db.rfqs.find(
        {"deleted": {"$ne": True}, "broadcasts.manufacturer_id": user.get("id")},
        {"_id": 0},
    ).sort("updated_at", -1)
    out = []
    async for doc in cursor:
        mine = [b for b in doc.get("broadcasts", []) if b.get("manufacturer_id") == user.get("id")]
        for b in mine:
            _mark_expired(b)
        # Only surface the manufacturer's own broadcasts + the pref snapshot.
        out.append({
            "id": doc["id"],
            "brand": doc.get("brand"),
            "piece_type": doc.get("piece_type"),
            "piece_type_label": doc.get("piece_type_label"),
            "client_name": doc.get("client_name"),
            "preference_snapshot": doc.get("preference_snapshot"),
            "attachment_ids": doc.get("attachment_ids", []),
            "broadcasts": mine,
            "status": doc.get("status"),
            "updated_at": doc.get("updated_at"),
        })
    return out


@router.get("/manufacturer/rfqs/{rfq_id}", summary="Manufacturer: view a single assigned RFQ")
async def mfg_get_rfq(rfq_id: str, user=Depends(require_roles("manufacturer"))):
    rfq = await _load_rfq(rfq_id)
    mine = [b for b in rfq.get("broadcasts", []) if b.get("manufacturer_id") == user.get("id")]
    if not mine:
        raise HTTPException(status_code=403, detail="RFQ not assigned to you")
    for b in mine:
        _mark_expired(b)
    return {
        "id": rfq["id"],
        "brand": rfq.get("brand"),
        "piece_type": rfq.get("piece_type"),
        "piece_type_label": rfq.get("piece_type_label"),
        "client_name": rfq.get("client_name"),
        "preference_snapshot": rfq.get("preference_snapshot"),
        "attachment_ids": rfq.get("attachment_ids", []),
        "broadcasts": mine,
        "status": rfq.get("status"),
        "updated_at": rfq.get("updated_at"),
    }
