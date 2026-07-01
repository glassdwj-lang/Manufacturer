"""Request-For-Quote (RFQ) pipeline — Phase A.

The RFQ is the *unifying artefact* of the whole quoting journey. A
client (or an associate acting on behalf of a client) creates one via
either a preference form or by favouriting a piece and tweaking its
attributes. The RFQ is stamped with a unique, human-readable serial
number that follows the workpiece from intake all the way to the final
client-facing quotation and, later, to the manufactured order.

Status lifecycle
================

::

    draft                    (owner still editing, not yet visible to admin)
      │  POST /submit
      ▼
    submitted                (on HOLD — admin review queue)
      │  POST /assign
      ▼
    sent_to_manufacturer     (one or more manufacturers can respond)
      │  POST /variants  (up to 6 variants, restricted fields)
      ▼
    manufacturer_responded
      │  POST /import-to-quote  (creates a `quotes` doc, links back)
      ▼
    imported_to_quote
      │  (admin finalises the quote, marks client_quoted from the
      │   quotes router — see quotes.py)
      ▼
    client_quoted            (terminal for the RFQ; commercial output
                              lives on the linked quote / order)

Serial number
=============

Format: ``SCO-{yyyy}-{seq:05d}``. The counter lives in the
``counters`` collection under ``_id = "rfq_serial_{yyyy}"`` and is
atomically incremented with `$inc + upsert=True` so concurrent
inserts never collide.

Role gating
===========

* client, associate — create, view own, submit
* admin — full CRUD, assign to manufacturer(s), import to quote
* manufacturer — view RFQs assigned to them, submit variants only
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from deps import db, get_current_user, require_roles

router = APIRouter()


# ----------------------------------------------------------------------
# Constants
# ----------------------------------------------------------------------
STATUS_DRAFT = "draft"
STATUS_SUBMITTED = "submitted"
STATUS_SENT_TO_MFG = "sent_to_manufacturer"
STATUS_MFG_RESPONDED = "manufacturer_responded"
STATUS_IMPORTED = "imported_to_quote"
STATUS_CLIENT_QUOTED = "client_quoted"
STATUS_CANCELLED = "cancelled"

ALL_STATUSES = {
    STATUS_DRAFT,
    STATUS_SUBMITTED,
    STATUS_SENT_TO_MFG,
    STATUS_MFG_RESPONDED,
    STATUS_IMPORTED,
    STATUS_CLIENT_QUOTED,
    STATUS_CANCELLED,
}

MAX_MFG_VARIANTS = 6


# ----------------------------------------------------------------------
# Schemas
# ----------------------------------------------------------------------
class Preferences(BaseModel):
    """Client-side preference-form payload. Deliberately generous —
    every field is optional so a client can favourite a piece and
    submit with almost nothing, or fill it out from scratch.

    Additional bespoke fields can be dropped into ``extras`` without
    a migration.
    """

    piece_type: Optional[str] = None            # ring | pendant | earrings…
    metal_preference: Optional[str] = None      # 18k WG, PT950, …
    stone_type: Optional[str] = None            # natural diamond, LG, moiss.
    stone_shape: Optional[str] = None           # OV, RD, EM, …
    stone_carat_target: Optional[float] = None
    color_grade: Optional[str] = None           # D, E, F, …
    clarity_grade: Optional[str] = None         # VVS1, VS1, …
    ring_size: Optional[str] = None
    budget_min_aud: Optional[float] = None
    budget_max_aud: Optional[float] = None
    target_timeline_weeks: Optional[int] = None
    inspiration_notes: Optional[str] = None
    inspiration_image_urls: List[str] = Field(default_factory=list)
    extras: Dict[str, Any] = Field(default_factory=dict)


class FavoriteSource(BaseModel):
    """When the RFQ was seeded from an existing render/library asset."""

    source_type: Optional[str] = None           # render | gallery | order
    source_id: Optional[str] = None             # render id / gallery id
    source_order_id: Optional[str] = None       # if favourited off an order
    source_url: Optional[str] = None            # snapshot URL of the asset
    adjustments: Dict[str, Any] = Field(default_factory=dict)


class ManufacturerVariant(BaseModel):
    """One of up to :data:`MAX_MFG_VARIANTS` responses a manufacturer
    can attach to an RFQ. Only these fields are settable by the
    manufacturer role — everything else on the RFQ stays admin-only.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    label: Optional[str] = None                 # 'Option A', '18k YG + LG'…
    price_usd: Optional[float] = None
    metal: Optional[str] = None                 # e.g. '18k YG'
    stone_kind: Optional[str] = None            # 'lab_diamond' | 'moissanite'
    lab_diamond_size_ct: Optional[float] = None
    lab_diamond_color: Optional[str] = None
    lab_diamond_clarity: Optional[str] = None
    piece_weight_g: Optional[float] = None
    lead_time_days: Optional[int] = None
    notes: Optional[str] = None
    submitted_at: Optional[str] = None
    submitted_by: Optional[str] = None          # manufacturer user id


class RFQ(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    serial_number: str                          # SCO-2026-00001
    status: str = STATUS_DRAFT

    # Origination -----------------------------------------------------
    owner_id: str                               # client or associate uid
    owner_role: str                             # 'client' | 'associate'
    created_by: Optional[str] = None
    origin: str = "preference"                  # 'preference' | 'favorite'
    preferences: Optional[Preferences] = None
    favorite_source: Optional[FavoriteSource] = None

    # Assignment ------------------------------------------------------
    assigned_manufacturer_ids: List[str] = Field(default_factory=list)
    variants: List[ManufacturerVariant] = Field(default_factory=list)

    # Downstream links -----------------------------------------------
    linked_order_id: Optional[str] = None
    linked_quote_id: Optional[str] = None

    # Admin bookkeeping ----------------------------------------------
    admin_notes: Optional[str] = None
    history: List[Dict[str, Any]] = Field(default_factory=list)

    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    submitted_at: Optional[str] = None
    deleted: bool = False


# --- Request payloads --------------------------------------------------
class RFQCreatePayload(BaseModel):
    origin: str = "preference"                  # 'preference' | 'favorite'
    preferences: Optional[Preferences] = None
    favorite_source: Optional[FavoriteSource] = None
    submit_immediately: bool = False            # skip 'draft' state


class RFQUpdatePayload(BaseModel):
    """Owner (client/associate) edits — only allowed while status=draft."""

    preferences: Optional[Preferences] = None
    favorite_source: Optional[FavoriteSource] = None


class AdminAssignPayload(BaseModel):
    manufacturer_ids: List[str]
    admin_notes: Optional[str] = None


class AdminNotePayload(BaseModel):
    admin_notes: str


class VariantSubmitPayload(BaseModel):
    """Manufacturer submits or replaces their variants (up to 6)."""

    variants: List[ManufacturerVariant]


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
async def _next_serial() -> str:
    """Atomically bump the yearly counter and return the formatted serial.

    Uses ``findAndModify``-style upsert so two racing requests can't
    both grab the same number.
    """
    year = datetime.now(timezone.utc).year
    counter_id = f"rfq_serial_{year}"
    result = await db.counters.find_one_and_update(
        {"_id": counter_id},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,  # motor: pymongo.ReturnDocument.AFTER
    )
    seq = (result or {}).get("seq", 1)
    return f"SCO-{year}-{seq:05d}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _history_entry(user: dict, event: str, **extra: Any) -> Dict[str, Any]:
    entry = {
        "at": _now_iso(),
        "by": user.get("id"),
        "by_role": user.get("role"),
        "event": event,
    }
    entry.update(extra)
    return entry


async def _load_rfq(rfq_id: str) -> Dict[str, Any]:
    rfq = await db.rfqs.find_one(
        {"id": rfq_id, "deleted": {"$ne": True}}, {"_id": 0}
    )
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return rfq


def _assert_owner_or_admin(rfq: dict, user: dict) -> None:
    role = user.get("role")
    if role == "admin":
        return
    if rfq.get("owner_id") == user.get("id"):
        return
    raise HTTPException(status_code=403, detail="Not permitted on this RFQ")


def _assert_assigned_manufacturer(rfq: dict, user: dict) -> None:
    if user.get("role") != "manufacturer":
        raise HTTPException(status_code=403, detail="Manufacturer role required")
    if user.get("id") not in rfq.get("assigned_manufacturer_ids", []):
        raise HTTPException(
            status_code=403, detail="RFQ not assigned to this manufacturer"
        )


# ----------------------------------------------------------------------
# CLIENT / ASSOCIATE endpoints — create + own list + edit while draft
# ----------------------------------------------------------------------
@router.post("/rfqs", summary="Create a new RFQ (client or associate)")
async def create_rfq(
    body: RFQCreatePayload,
    user=Depends(require_roles("client", "associate", "admin")),
):
    if body.origin not in ("preference", "favorite"):
        raise HTTPException(
            status_code=400, detail="origin must be 'preference' or 'favorite'"
        )
    serial = await _next_serial()
    initial_status = STATUS_SUBMITTED if body.submit_immediately else STATUS_DRAFT
    rfq = RFQ(
        serial_number=serial,
        status=initial_status,
        owner_id=user.get("id"),
        owner_role=user.get("role"),
        created_by=user.get("id"),
        origin=body.origin,
        preferences=body.preferences,
        favorite_source=body.favorite_source,
        submitted_at=_now_iso() if body.submit_immediately else None,
    )
    rfq.history.append(
        _history_entry(user, "created", origin=body.origin, status=initial_status)
    )
    doc = rfq.model_dump()
    await db.rfqs.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/rfqs/mine", summary="List RFQs owned by the current user")
async def list_my_rfqs(
    user=Depends(require_roles("client", "associate")),
):
    cursor = (
        db.rfqs.find(
            {"owner_id": user.get("id"), "deleted": {"$ne": True}}, {"_id": 0}
        ).sort("updated_at", -1)
    )
    return [d async for d in cursor]


@router.patch("/rfqs/{rfq_id}", summary="Edit an RFQ (owner while draft, or admin)")
async def update_rfq(
    rfq_id: str,
    body: RFQUpdatePayload,
    user=Depends(get_current_user),
):
    rfq = await _load_rfq(rfq_id)
    _assert_owner_or_admin(rfq, user)
    if user.get("role") != "admin" and rfq.get("status") != STATUS_DRAFT:
        raise HTTPException(
            status_code=400,
            detail="RFQ can only be edited by owner while status='draft'",
        )
    patch: Dict[str, Any] = {"updated_at": _now_iso()}
    if body.preferences is not None:
        patch["preferences"] = body.preferences.model_dump()
    if body.favorite_source is not None:
        patch["favorite_source"] = body.favorite_source.model_dump()
    history_entry = _history_entry(user, "updated")
    await db.rfqs.update_one(
        {"id": rfq_id}, {"$set": patch, "$push": {"history": history_entry}}
    )
    rfq.update(patch)
    rfq.setdefault("history", []).append(history_entry)
    return rfq


@router.post("/rfqs/{rfq_id}/submit", summary="Submit a draft RFQ for admin review")
async def submit_rfq(
    rfq_id: str,
    user=Depends(get_current_user),
):
    rfq = await _load_rfq(rfq_id)
    _assert_owner_or_admin(rfq, user)
    if rfq.get("status") != STATUS_DRAFT:
        raise HTTPException(
            status_code=400,
            detail=f"Only draft RFQs can be submitted (current: {rfq.get('status')})",
        )
    patch = {
        "status": STATUS_SUBMITTED,
        "submitted_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    entry = _history_entry(user, "submitted")
    await db.rfqs.update_one({"id": rfq_id}, {"$set": patch, "$push": {"history": entry}})
    rfq.update(patch)
    rfq.setdefault("history", []).append(entry)
    return rfq


# ----------------------------------------------------------------------
# ADMIN endpoints
# ----------------------------------------------------------------------
@router.get("/admin/rfqs", summary="Admin: list RFQs, optional status filter")
async def admin_list_rfqs(
    status: Optional[str] = None,
    user=Depends(require_roles("admin")),
):
    query: Dict[str, Any] = {"deleted": {"$ne": True}}
    if status:
        if status not in ALL_STATUSES:
            raise HTTPException(status_code=400, detail="Unknown status filter")
        query["status"] = status
    cursor = db.rfqs.find(query, {"_id": 0}).sort("updated_at", -1)
    return [d async for d in cursor]


@router.get("/admin/rfqs/{rfq_id}", summary="Admin: fetch a single RFQ")
async def admin_get_rfq(
    rfq_id: str,
    user=Depends(require_roles("admin")),
):
    return await _load_rfq(rfq_id)


@router.post(
    "/admin/rfqs/{rfq_id}/assign",
    summary="Admin: assign RFQ to one or more manufacturers",
)
async def admin_assign_rfq(
    rfq_id: str,
    body: AdminAssignPayload,
    user=Depends(require_roles("admin")),
):
    if not body.manufacturer_ids:
        raise HTTPException(status_code=400, detail="At least one manufacturer id required")
    rfq = await _load_rfq(rfq_id)
    if rfq.get("status") not in (STATUS_SUBMITTED, STATUS_SENT_TO_MFG, STATUS_MFG_RESPONDED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot assign from status '{rfq.get('status')}'",
        )
    # Validate all manufacturer IDs actually exist and hold that role.
    users = await db.users.find(
        {"id": {"$in": body.manufacturer_ids}, "role": "manufacturer"},
        {"_id": 0, "id": 1},
    ).to_list(length=100)
    found_ids = {u["id"] for u in users}
    missing = [m for m in body.manufacturer_ids if m not in found_ids]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown manufacturer ids: {', '.join(missing)}",
        )
    patch = {
        "assigned_manufacturer_ids": body.manufacturer_ids,
        "status": STATUS_SENT_TO_MFG,
        "updated_at": _now_iso(),
    }
    if body.admin_notes is not None:
        patch["admin_notes"] = body.admin_notes
    entry = _history_entry(
        user, "assigned", manufacturer_ids=body.manufacturer_ids
    )
    await db.rfqs.update_one(
        {"id": rfq_id}, {"$set": patch, "$push": {"history": entry}}
    )
    rfq.update(patch)
    rfq.setdefault("history", []).append(entry)
    return rfq


@router.post(
    "/admin/rfqs/{rfq_id}/note",
    summary="Admin: attach a free-form admin note to an RFQ",
)
async def admin_note_rfq(
    rfq_id: str,
    body: AdminNotePayload,
    user=Depends(require_roles("admin")),
):
    await _load_rfq(rfq_id)  # 404 if missing
    entry = _history_entry(user, "note")
    await db.rfqs.update_one(
        {"id": rfq_id},
        {
            "$set": {"admin_notes": body.admin_notes, "updated_at": _now_iso()},
            "$push": {"history": entry},
        },
    )
    return await _load_rfq(rfq_id)


@router.delete("/admin/rfqs/{rfq_id}", summary="Admin: soft-delete an RFQ")
async def admin_delete_rfq(
    rfq_id: str,
    user=Depends(require_roles("admin")),
):
    res = await db.rfqs.update_one(
        {"id": rfq_id, "deleted": {"$ne": True}},
        {
            "$set": {
                "deleted": True,
                "deleted_at": _now_iso(),
                "deleted_by": user.get("id"),
            }
        },
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="RFQ not found")
    return {"ok": True}


# ----------------------------------------------------------------------
# MANUFACTURER endpoints
# ----------------------------------------------------------------------
@router.get(
    "/manufacturer/rfqs",
    summary="Manufacturer: list RFQs assigned to me",
)
async def mfg_list_rfqs(
    user=Depends(require_roles("manufacturer")),
):
    cursor = db.rfqs.find(
        {
            "assigned_manufacturer_ids": user.get("id"),
            "deleted": {"$ne": True},
        },
        {"_id": 0},
    ).sort("updated_at", -1)
    return [d async for d in cursor]


@router.get(
    "/manufacturer/rfqs/{rfq_id}",
    summary="Manufacturer: view a single assigned RFQ",
)
async def mfg_get_rfq(
    rfq_id: str,
    user=Depends(require_roles("manufacturer")),
):
    rfq = await _load_rfq(rfq_id)
    _assert_assigned_manufacturer(rfq, user)
    return rfq


@router.post(
    "/manufacturer/rfqs/{rfq_id}/variants",
    summary="Manufacturer: submit up to 6 pricing/spec variants for the RFQ",
)
async def mfg_submit_variants(
    rfq_id: str,
    body: VariantSubmitPayload,
    user=Depends(require_roles("manufacturer")),
):
    if len(body.variants) == 0:
        raise HTTPException(status_code=400, detail="At least one variant required")
    if len(body.variants) > MAX_MFG_VARIANTS:
        raise HTTPException(
            status_code=400,
            detail=f"At most {MAX_MFG_VARIANTS} variants allowed per submission",
        )
    rfq = await _load_rfq(rfq_id)
    _assert_assigned_manufacturer(rfq, user)
    if rfq.get("status") not in (STATUS_SENT_TO_MFG, STATUS_MFG_RESPONDED):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit variants from status '{rfq.get('status')}'",
        )

    stamped = []
    now = _now_iso()
    for v in body.variants:
        payload = v.model_dump()
        payload["submitted_at"] = now
        payload["submitted_by"] = user.get("id")
        stamped.append(payload)

    # Replace this manufacturer's variants (identified by submitted_by),
    # keep any variants from other manufacturers assigned to the same RFQ.
    other = [
        vv for vv in rfq.get("variants", [])
        if vv.get("submitted_by") and vv["submitted_by"] != user.get("id")
    ]
    merged = other + stamped
    entry = _history_entry(user, "variants_submitted", count=len(stamped))
    await db.rfqs.update_one(
        {"id": rfq_id},
        {
            "$set": {
                "variants": merged,
                "status": STATUS_MFG_RESPONDED,
                "updated_at": now,
            },
            "$push": {"history": entry},
        },
    )
    rfq["variants"] = merged
    rfq["status"] = STATUS_MFG_RESPONDED
    rfq["updated_at"] = now
    rfq.setdefault("history", []).append(entry)
    return rfq


# ----------------------------------------------------------------------
# Import to Quote (Phase E preview)
# ----------------------------------------------------------------------
@router.post(
    "/admin/rfqs/{rfq_id}/import-to-quote",
    summary="Admin: pick one manufacturer variant and pre-fill a new quote from it",
)
async def admin_import_rfq_to_quote(
    rfq_id: str,
    variant_id: str,
    user=Depends(require_roles("admin")),
):
    rfq = await _load_rfq(rfq_id)
    if rfq.get("status") not in (STATUS_MFG_RESPONDED, STATUS_IMPORTED):
        raise HTTPException(
            status_code=400,
            detail=(
                "RFQ must have manufacturer responses before it can be "
                "imported into a quote"
            ),
        )
    variant = next(
        (v for v in rfq.get("variants", []) if v.get("id") == variant_id), None
    )
    if not variant:
        raise HTTPException(status_code=404, detail="Variant not found on RFQ")

    # Build a Quote pre-filled from the variant. Any missing spreadsheet
    # inputs default to zero — admin will refine on the quote form.
    prefs = rfq.get("preferences") or {}
    quote_id = str(uuid4())
    now = _now_iso()
    quote_doc = {
        "id": quote_id,
        "rfq_id": rfq_id,
        "rfq_serial_number": rfq.get("serial_number"),
        "order_id": rfq.get("linked_order_id"),
        "order_ref": None,
        "jewelry_name": prefs.get("piece_type"),
        "status": "draft",
        "inputs": {
            "piece_description": prefs.get("piece_type"),
            "metal_spec": variant.get("metal") or prefs.get("metal_preference"),
            "stone_spec": (
                variant.get("stone_kind")
                or prefs.get("stone_type")
                or None
            ),
            "ring_cost_usd": variant.get("price_usd") or 0.0,
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

    entry = _history_entry(
        user, "imported_to_quote", variant_id=variant_id, quote_id=quote_id
    )
    await db.rfqs.update_one(
        {"id": rfq_id},
        {
            "$set": {
                "status": STATUS_IMPORTED,
                "linked_quote_id": quote_id,
                "updated_at": now,
            },
            "$push": {"history": entry},
        },
    )
    return {"rfq_id": rfq_id, "quote_id": quote_id, "quote": quote_doc}
