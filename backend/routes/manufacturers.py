"""Manufacturer directory — Somnio.Co is the source of truth.

Companion collection to ``users``: a *directory entry* is the business
identity of a workshop (name, code, phone, country, notes, status).
It does not necessarily have a login — many gem-gallery-193 entries
are contact-only. If a workshop does have a Somnio login, its
``users`` document carries ``manufacturer_id`` pointing back here.

Design
======
* Somnio owns the ``code``; gem-gallery mirrors it.
* Every mutation is pushed to gem-gallery via
  ``_gem_gallery_manufacturer_sync``. If gem-gallery is asleep the
  local doc is marked ``pending_sync=True`` with the error captured;
  ``POST /admin/manufacturers/sync-pending`` drains the retry queue.
* ``status`` is one of ``active|paused|burned`` — matching
  gem-gallery's vocabulary. Once ``burned`` the code cannot be reused
  (a broadcast referencing it fails).
* ``bootstrap`` is idempotent: pulling gem-gallery's current list
  and inserting missing entries, then pushing any Somnio-local
  workshops that don't yet have a remote counterpart.

Endpoints (all ``/api/admin/manufacturers`` unless noted)
==========================================================

* GET    /                          List (filters: include_paused, include_burned)
* GET    /next-code                 Read the next allocatable code
* POST   /                          Create + push
* GET    /{id}                      Fetch one
* PATCH  /{id}                      Update + push
* POST   /{id}/status               Change status (active|paused|burned) + push
* POST   /bootstrap                 One-shot two-way reconciliation
* POST   /sync-pending              Retry any docs with pending_sync=True
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field

from deps import db, require_roles
from _gem_gallery_manufacturer_sync import (
    change_status_remote,
    create_remote,
    list_remote,
    update_remote,
)

logger = logging.getLogger(__name__)
router = APIRouter()


STATUS_ACTIVE = "active"
STATUS_PAUSED = "paused"
STATUS_BURNED = "burned"
ALL_STATUSES = {STATUS_ACTIVE, STATUS_PAUSED, STATUS_BURNED}

# The counter document that hands out the next available manufacturer
# code. Kept in the shared ``counters`` collection alongside the RFQ
# serial counters.
CODE_COUNTER_ID = "manufacturer_next_code"


# ----------------------------------------------------------------------
# Schemas
# ----------------------------------------------------------------------
class Manufacturer(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    code: int
    code_display: str
    name: str
    name_lower: str
    contact_email: EmailStr
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None
    status: str = STATUS_ACTIVE
    gem_gallery_id: Optional[str] = None
    pending_sync: bool = False
    last_sync_at: Optional[str] = None
    last_sync_error: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    created_by: Optional[str] = None
    deleted: bool = False


class ManufacturerCreatePayload(BaseModel):
    name: str
    contact_email: EmailStr
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None


class ManufacturerPatchPayload(BaseModel):
    name: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    country: Optional[str] = None
    notes: Optional[str] = None


class StatusChangePayload(BaseModel):
    status: str


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _display(code: int) -> str:
    return f"{code:02d}"


async def _peek_next_code() -> int:
    """Read the counter WITHOUT bumping it — for display and dry-runs."""
    doc = await db.counters.find_one({"_id": CODE_COUNTER_ID})
    return (doc or {}).get("seq", 0) + 1


async def _allocate_code() -> int:
    """Atomically bump the counter and return the new code."""
    doc = await db.counters.find_one_and_update(
        {"_id": CODE_COUNTER_ID},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    return int((doc or {}).get("seq", 1))


async def _sync_after_create(local: Manufacturer) -> Manufacturer:
    """Push a fresh mfr to gem-gallery; record result on the doc."""
    ok, body = await create_remote(local.model_dump())
    now = _now_iso()
    if ok and isinstance(body, dict):
        local.gem_gallery_id = body.get("id")
        local.pending_sync = False
        local.last_sync_at = now
        local.last_sync_error = None
    else:
        local.pending_sync = True
        local.last_sync_at = now
        local.last_sync_error = str(body)[:400]
    return local


async def _sync_after_update(local: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    now = _now_iso()
    if not local.get("gem_gallery_id"):
        # Local record was never pushed; queue a full create instead.
        ok, body = await create_remote(local)
        if ok and isinstance(body, dict):
            local["gem_gallery_id"] = body.get("id")
    else:
        ok, body = await update_remote(local["gem_gallery_id"], patch)
    if ok:
        local["pending_sync"] = False
        local["last_sync_at"] = now
        local["last_sync_error"] = None
    else:
        local["pending_sync"] = True
        local["last_sync_at"] = now
        local["last_sync_error"] = str(body)[:400]
    return local


# ----------------------------------------------------------------------
# CRUD endpoints
# ----------------------------------------------------------------------
@router.get(
    "/admin/manufacturers",
    summary="List manufacturers (filters: include_paused, include_burned)",
)
async def list_manufacturers(
    include_paused: bool = Query(True),
    include_burned: bool = Query(True),
    user=Depends(require_roles("admin")),
):
    q: Dict[str, Any] = {"deleted": {"$ne": True}}
    excluded: List[str] = []
    if not include_paused:
        excluded.append(STATUS_PAUSED)
    if not include_burned:
        excluded.append(STATUS_BURNED)
    if excluded:
        q["status"] = {"$nin": excluded}
    cursor = db.manufacturers.find(q, {"_id": 0}).sort("code", 1)
    return [d async for d in cursor]


@router.get("/admin/manufacturers/next-code", summary="Peek the next code that would be allocated")
async def next_code(user=Depends(require_roles("admin"))):
    return {"next_code": await _peek_next_code()}


@router.post("/admin/manufacturers", summary="Create a manufacturer + push to gem-gallery")
async def create_manufacturer(
    body: ManufacturerCreatePayload,
    user=Depends(require_roles("admin")),
):
    # Guard against duplicate names to keep both systems tidy.
    existing = await db.manufacturers.find_one(
        {"name_lower": body.name.strip().lower(), "deleted": {"$ne": True}},
        {"_id": 0, "id": 1},
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"A manufacturer named '{body.name}' already exists")

    code = await _allocate_code()
    m = Manufacturer(
        code=code,
        code_display=_display(code),
        name=body.name.strip(),
        name_lower=body.name.strip().lower(),
        contact_email=body.contact_email,
        contact_name=body.contact_name,
        contact_phone=body.contact_phone,
        country=body.country,
        notes=body.notes,
        created_by=user.get("id"),
    )
    m = await _sync_after_create(m)
    await db.manufacturers.insert_one(m.model_dump())
    doc = m.model_dump()
    return doc


@router.get("/admin/manufacturers/{mid}", summary="Fetch a single manufacturer")
async def get_manufacturer(mid: str, user=Depends(require_roles("admin"))):
    d = await db.manufacturers.find_one({"id": mid, "deleted": {"$ne": True}}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Manufacturer not found")
    return d


@router.patch("/admin/manufacturers/{mid}", summary="Update a manufacturer + push change to gem-gallery")
async def patch_manufacturer(
    mid: str,
    body: ManufacturerPatchPayload,
    user=Depends(require_roles("admin")),
):
    d = await db.manufacturers.find_one({"id": mid, "deleted": {"$ne": True}}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Manufacturer not found")
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if "name" in patch:
        patch["name"] = patch["name"].strip()
        patch["name_lower"] = patch["name"].lower()
    patch["updated_at"] = _now_iso()
    d.update(patch)
    d = await _sync_after_update(d, patch)
    await db.manufacturers.update_one({"id": mid}, {"$set": d})
    return d


@router.post(
    "/admin/manufacturers/{mid}/status",
    summary="Change status (active|paused|burned) + push to gem-gallery",
)
async def change_status(
    mid: str,
    body: StatusChangePayload,
    user=Depends(require_roles("admin")),
):
    if body.status not in ALL_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {sorted(ALL_STATUSES)}")
    d = await db.manufacturers.find_one({"id": mid, "deleted": {"$ne": True}}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Manufacturer not found")
    # Match gem-gallery's terminal rule: once burned, the record is
    # permanently retired. Create a fresh manufacturer with a new code
    # instead of trying to reactivate.
    current = d.get("status", STATUS_ACTIVE)
    if current == STATUS_BURNED and body.status != STATUS_BURNED:
        raise HTTPException(
            status_code=400,
            detail=(
                "Burned manufacturers are permanently retired and cannot be "
                "reactivated. Create a NEW manufacturer record (with a NEW code) instead."
            ),
        )
    if current == body.status:
        return d  # no-op — nothing to sync
    now = _now_iso()
    patch: Dict[str, Any] = {"status": body.status, "updated_at": now}
    if d.get("gem_gallery_id"):
        ok, remote = await change_status_remote(d["gem_gallery_id"], body.status)
        if ok:
            patch["pending_sync"] = False
            patch["last_sync_at"] = now
            patch["last_sync_error"] = None
        else:
            patch["pending_sync"] = True
            patch["last_sync_at"] = now
            patch["last_sync_error"] = str(remote)[:400]
    else:
        patch["pending_sync"] = True
        patch["last_sync_error"] = "no gem_gallery_id"
    await db.manufacturers.update_one({"id": mid}, {"$set": patch})
    d.update(patch)
    return d


@router.post(
    "/admin/manufacturers/sync-pending",
    summary="Retry all docs stuck with pending_sync=True",
)
async def sync_pending(user=Depends(require_roles("admin"))):
    cursor = db.manufacturers.find({"pending_sync": True, "deleted": {"$ne": True}}, {"_id": 0})
    results: List[Dict[str, Any]] = []
    async for d in cursor:
        actions: List[str] = []
        # 1) Ensure there's a gem_gallery_id — create if missing.
        if not d.get("gem_gallery_id"):
            ok, body = await create_remote(d)
            if ok and isinstance(body, dict):
                d["gem_gallery_id"] = body.get("id")
                actions.append("created_remote")
        # 2) Sync business fields (PATCH parent).
        d = await _sync_after_update(
            d,
            {k: d.get(k) for k in
             ("name", "contact_email", "contact_name", "contact_phone", "country", "notes")},
        )
        actions.append("patched_fields")
        # 3) Sync status (PATCH /status) — this is a *separate* remote
        # endpoint and was the missing step. Only reset pending_sync
        # if BOTH the field-patch and the status-patch succeeded.
        status_ok = True
        status_err: Optional[str] = None
        if d.get("gem_gallery_id"):
            status_ok, remote = await change_status_remote(d["gem_gallery_id"], d.get("status", STATUS_ACTIVE))
            actions.append("patched_status")
            if not status_ok:
                status_err = str(remote)[:400]
        d["pending_sync"] = bool(d.get("pending_sync")) or not status_ok
        d["last_sync_at"] = _now_iso()
        if status_err:
            d["last_sync_error"] = status_err
        elif not d["pending_sync"]:
            d["last_sync_error"] = None
        await db.manufacturers.update_one({"id": d["id"]}, {"$set": d})
        results.append({
            "id": d["id"],
            "code_display": d.get("code_display"),
            "actions": actions,
            "pending_sync": d.get("pending_sync"),
            "last_sync_error": d.get("last_sync_error"),
        })
    return {"retried": len(results), "results": results}


# ----------------------------------------------------------------------
# Bootstrap — two-way reconciliation, one-shot
# ----------------------------------------------------------------------
@router.post(
    "/admin/manufacturers/bootstrap",
    summary="Adopt gem-gallery's mfrs and push any Somnio-only workshops",
)
async def bootstrap(user=Depends(require_roles("admin"))):
    """One-shot reconciliation:

    1. Pull gem-gallery's manufacturer list (including paused + burned).
    2. For each remote entry we don't already have locally, insert a
       Somnio doc using the remote's ``id`` verbatim as our ``id`` (so
       cross-refs are trivial), copying code + all business fields.
    3. Bump Somnio's ``next_code`` counter past whatever gem-gallery
       has already handed out.
    4. For any Somnio ``users`` doc with ``role="manufacturer"`` that
       doesn't yet have a directory entry, create one with a fresh
       code and push it to gem-gallery.
    5. Return a per-record summary.
    """
    report: Dict[str, Any] = {
        "adopted_from_gem_gallery": [],
        "pushed_to_gem_gallery": [],
        "skipped": [],
        "errors": [],
    }
    now = _now_iso()

    # ---------- 1) pull remote ----------
    try:
        remote = await list_remote(include_burned=True, include_paused=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"gem-gallery list failed: {exc}")
    max_remote_code = 0
    for r in remote:
        code = int(r.get("code") or 0)
        max_remote_code = max(max_remote_code, code)
        local = await db.manufacturers.find_one(
            {"$or": [{"id": r.get("id")}, {"gem_gallery_id": r.get("id")}]},
            {"_id": 0},
        )
        if local:
            report["skipped"].append({"id": r.get("id"), "name": r.get("name"),
                                       "reason": "already in Somnio directory"})
            continue
        adopted = {
            "id": r.get("id") or str(uuid4()),
            "code": code or 0,
            "code_display": r.get("code_display") or _display(code),
            "name": r.get("name") or "Unnamed workshop",
            "name_lower": (r.get("name_lower") or r.get("name", "")).lower(),
            "contact_email": r.get("contact_email") or "unknown@example.com",
            "contact_name": r.get("contact_name"),
            "contact_phone": r.get("contact_phone"),
            "country": r.get("country"),
            "notes": r.get("notes"),
            "status": r.get("status") or STATUS_ACTIVE,
            "gem_gallery_id": r.get("id"),
            "pending_sync": False,
            "last_sync_at": now,
            "last_sync_error": None,
            "created_at": r.get("created_at") or now,
            "updated_at": r.get("updated_at") or now,
            "created_by": user.get("id"),
            "deleted": False,
        }
        await db.manufacturers.insert_one(adopted)
        report["adopted_from_gem_gallery"].append(
            {"id": adopted["id"], "code": adopted["code_display"], "name": adopted["name"]}
        )

    # ---------- 2) bump local counter past max remote code ----------
    current_seq = (await db.counters.find_one({"_id": CODE_COUNTER_ID}) or {}).get("seq", 0)
    if max_remote_code > current_seq:
        await db.counters.update_one(
            {"_id": CODE_COUNTER_ID},
            {"$set": {"seq": max_remote_code}},
            upsert=True,
        )

    # ---------- 3) push any Somnio-only manufacturer users ----------
    cursor = db.users.find({"role": "manufacturer"}, {"_id": 0, "id": 1, "email": 1, "name": 1,
                                                       "manufacturer_id": 1, "country": 1})
    async for u in cursor:
        if u.get("manufacturer_id"):
            existing = await db.manufacturers.find_one(
                {"id": u["manufacturer_id"], "deleted": {"$ne": True}}, {"_id": 0}
            )
            if existing:
                report["skipped"].append({"user": u.get("email"),
                                           "reason": f"already linked to directory {existing['code_display']}"})
                continue
        # Look up by email in existing directory (avoid duplicates)
        by_email = await db.manufacturers.find_one(
            {"contact_email": u.get("email"), "deleted": {"$ne": True}}, {"_id": 0}
        )
        if by_email:
            await db.users.update_one({"id": u["id"]}, {"$set": {"manufacturer_id": by_email["id"]}})
            report["skipped"].append({"user": u.get("email"),
                                       "reason": f"matched existing directory {by_email['code_display']} by email"})
            continue

        code = await _allocate_code()
        payload = ManufacturerCreatePayload(
            name=u.get("name") or u.get("email", "Unknown"),
            contact_email=u.get("email"),
            contact_name=u.get("name"),
            contact_phone=None,
            country=u.get("country"),
            notes="Auto-created during bootstrap from Somnio user record.",
        )
        m = Manufacturer(
            code=code,
            code_display=_display(code),
            name=payload.name.strip(),
            name_lower=payload.name.strip().lower(),
            contact_email=payload.contact_email,
            contact_name=payload.contact_name,
            country=payload.country,
            notes=payload.notes,
            created_by=user.get("id"),
        )
        m = await _sync_after_create(m)
        await db.manufacturers.insert_one(m.model_dump())
        await db.users.update_one({"id": u["id"]}, {"$set": {"manufacturer_id": m.id}})
        report["pushed_to_gem_gallery"].append({
            "user": u.get("email"),
            "code": m.code_display,
            "gem_gallery_id": m.gem_gallery_id,
            "pending_sync": m.pending_sync,
            "sync_error": m.last_sync_error,
        })

    return report
