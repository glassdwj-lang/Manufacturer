"""Order routes: list/get/create, complete step, forward step, customs, Digital DNA."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel

from _activity_log import record_event
from _digital_dna import build_digital_dna_pdf
from _notes_translation import ensure_translations_for_viewer
from _translation import language_for_country, translate as translate_text
from deps import db, get_current_user, require_roles
from helpers import (
    list_strip,
    now_china_iso,
    progress_summary,
    strip_order_for_role,
)
from models import (
    BulkDeletePayload,
    CustomsDocs,
    CustomsFilePayload,
    ForwardUpdate,
    OrderCreate,
    StepUpdate,
)
from phases import build_initial_steps

router = APIRouter(tags=["orders"])


@router.post("/orders")
async def create_order(
    data: OrderCreate, user=Depends(require_roles("admin", "associate"))
):
    client = await db.users.find_one({"id": data.client_id, "role": "client"})
    if not client:
        raise HTTPException(status_code=400, detail="Invalid client")
    manufacturer = await db.users.find_one(
        {"id": data.manufacturer_id, "role": "manufacturer"}
    )
    if not manufacturer:
        raise HTTPException(status_code=400, detail="Invalid manufacturer")
    associate_id = (
        data.associate_id
        or client.get("associate_id")
        or (user["id"] if user["role"] == "associate" else None)
    )

    order_id = str(uuid.uuid4())
    order = {
        "id": order_id,
        "order_ref": f"SMN-{order_id[:8].upper()}",
        "client_id": data.client_id,
        "client_name": client["name"],
        "manufacturer_id": data.manufacturer_id,
        "manufacturer_name": manufacturer["name"],
        "manufacturer_alias": manufacturer.get("alias") or "Somnio.Co Atelier Workshop",
        "associate_id": associate_id,
        "jewelry_name": data.jewelry_name,
        "sku": data.sku or "",
        "description": data.description or "",
        "status": "in_progress",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_at_china": now_china_iso(),
        "steps": build_initial_steps(),
        "customs": {
            "airway_bill": None,
            "customs_document": None,
            "airway_bill_text": "",
            "airway_bill_files": [],
            "customs_files": [],
            "notes": "",
        },
    }
    await db.orders.insert_one(order)
    return strip_order_for_role(order, user)


@router.get("/orders")
async def list_orders(
    user=Depends(get_current_user),
    client_id: str | None = Query(default=None),
    manufacturer_id: str | None = Query(default=None),
    associate_id: str | None = Query(default=None),
    q: str | None = Query(default=None, description="Jewelry-type / order-name substring (case-insensitive)"),
    date_from: str | None = Query(default=None, description="ISO date (YYYY-MM-DD); inclusive lower bound on created_at"),
    date_to: str | None = Query(default=None, description="ISO date (YYYY-MM-DD); inclusive upper bound on created_at"),
):
    """Returns the calling user's visible orders. Soft-deleted commissions
    are excluded — they live exclusively in /admin/recycle-bin.

    Filters:
    * ``client_id`` / ``manufacturer_id`` / ``associate_id`` — admin can filter
      across any of these; non-admins have the matching id locked to their
      own (any conflicting filter is silently ignored).
    * ``q`` — case-insensitive substring against ``jewelry_name``.
    * ``date_from`` / ``date_to`` — inclusive date window on ``created_at``.
    """
    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
            {"deleted_at": ""},
        ]
    }
    role_filter: dict = {}
    if user["role"] == "manufacturer":
        role_filter["manufacturer_id"] = user["id"]
    elif user["role"] == "associate":
        role_filter["associate_id"] = user["id"]
    elif user["role"] == "client":
        role_filter["client_id"] = user["id"]

    extra: dict = {}
    if user["role"] == "admin":
        if client_id:
            extra["client_id"] = client_id
        if manufacturer_id:
            extra["manufacturer_id"] = manufacturer_id
        if associate_id:
            extra["associate_id"] = associate_id
    elif user["role"] == "associate":
        # An associate can narrow their own list down to a specific client /
        # workshop, but never break role-scope.
        if client_id:
            extra["client_id"] = client_id
        if manufacturer_id:
            extra["manufacturer_id"] = manufacturer_id

    if q:
        # MongoDB regex with safe escape so users can't accidentally type a
        # regex special character and break the query.
        import re as _re

        extra["jewelry_name"] = {
            "$regex": _re.escape(q.strip()),
            "$options": "i",
        }

    if date_from or date_to:
        # ``created_at`` is an ISO-8601 string (lexicographically sortable for
        # YYYY-MM-DD…), so a plain $gte / $lte on the prefix works correctly.
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from.strip()
        if date_to:
            # Inclusive day-end: 2026-06-26 matches up to 2026-06-26T23:59:59.
            rng["$lte"] = date_to.strip() + "T23:59:59"
        extra["created_at"] = rng

    parts = [not_deleted]
    if role_filter:
        parts.append(role_filter)
    if extra:
        parts.append(extra)
    query = {"$and": parts} if len(parts) > 1 else parts[0]
    orders = (
        await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    )
    return [list_strip(o, user) for o in orders]


@router.delete("/orders/{order_id}")
async def soft_delete_order(order_id: str, user=Depends(require_roles("admin"))):
    """Admin-only soft delete. Sets `deleted_at`; the order disappears from
    the active list and lives in the Recycle Bin indefinitely. Restore or
    purge it from `/admin/recycle-bin`."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("deleted_at"):
        return {"ok": True, "already_deleted": True, "deleted_at": order["deleted_at"]}
    now_utc = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "deleted_at": now_utc,
                "deleted_at_china": now_china_iso(),
                "deleted_by": user["email"],
            }
        },
    )
    return {"ok": True, "deleted_at": now_utc}


@router.post("/orders/bulk-delete")
async def bulk_soft_delete_orders(
    body: BulkDeletePayload, user=Depends(require_roles("admin"))
):
    """Admin-only bulk soft-delete (used by the orders-list multi-select)."""
    if not body.ids:
        return {"ok": True, "deleted": 0}
    now_utc = datetime.now(timezone.utc).isoformat()
    res = await db.orders.update_many(
        {
            "id": {"$in": body.ids},
            "$or": [
                {"deleted_at": {"$exists": False}},
                {"deleted_at": None},
                {"deleted_at": ""},
            ],
        },
        {
            "$set": {
                "deleted_at": now_utc,
                "deleted_at_china": now_china_iso(),
                "deleted_by": user["email"],
            }
        },
    )
    return {"ok": True, "deleted": res.modified_count}


# ---- Recycle bin (admin only) ----
@router.get("/admin/recycle-bin")
async def admin_recycle_bin(user=Depends(require_roles("admin"))):
    """Lists soft-deleted commissions, most recent first. Restore or purge
    individually from the corresponding endpoints below."""
    cursor = db.orders.find(
        {"deleted_at": {"$nin": [None, ""]}},
        {"_id": 0},
    ).sort("deleted_at", -1)
    rows = []
    async for o in cursor:
        # Light projection — same shape as the regular orders list, with
        # additional deleted_* fields and progress.
        light = list_strip(o, user)
        light["deleted_at"] = o.get("deleted_at")
        light["deleted_at_china"] = o.get("deleted_at_china")
        light["deleted_by"] = o.get("deleted_by")
        rows.append(light)
    return rows


@router.post("/admin/recycle-bin/{order_id}/restore")
async def admin_restore_order(order_id: str, user=Depends(require_roles("admin"))):
    """Restore a soft-deleted commission back to the active list."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.get("deleted_at"):
        return {"ok": True, "already_active": True}
    await db.orders.update_one(
        {"id": order_id},
        {
            "$unset": {
                "deleted_at": "",
                "deleted_at_china": "",
                "deleted_by": "",
            }
        },
    )
    return {"ok": True, "restored_by": user["email"]}


@router.delete("/admin/recycle-bin/{order_id}/purge")
async def admin_purge_order(order_id: str, user=Depends(require_roles("admin"))):
    """Hard-delete a soft-deleted commission from the database. Irreversible."""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.get("deleted_at"):
        raise HTTPException(
            status_code=400,
            detail="Order is still active — soft-delete it first before purging.",
        )
    res = await db.orders.delete_one({"id": order_id})
    return {"ok": True, "purged": res.deleted_count == 1, "purged_by": user["email"]}


# ---- Order CRUD continued ----
@router.get("/orders/{order_id}")
async def get_order(order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "associate" and order["associate_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "client" and order["client_id"] != user["id"]:
        raise HTTPException(status_code=403)
    # Translate every step's notes + associate review note into the viewer's
    # preferred language (cached per language on the step). Skips for English.
    await ensure_translations_for_viewer(order, user)
    return strip_order_for_role(order, user)


@router.post("/orders/{order_id}/steps/{step_number}/complete")
async def complete_step(
    order_id: str,
    step_number: int,
    body: StepUpdate,
    user=Depends(require_roles("manufacturer", "admin")),
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)

    client = await db.users.find_one({"id": order["client_id"]})
    auto_forward = client.get("auto_forward", False) if client else False
    client_country = (client or {}).get("country") or "AU"
    target_lang, target_lang_name = language_for_country(client_country)
    translated_note = ""
    if body.notes and not target_lang.lower().startswith("en"):
        t = await translate_text(body.notes, target_lang, target_lang_name)
        if t:
            translated_note = t

    china_iso = now_china_iso()
    utc_iso = datetime.now(timezone.utc).isoformat()

    # Photo approval gating: manufacturer-uploaded photos go to a per-step
    # `pending_photos` queue and are NOT exposed to clients until an admin or
    # the assigned associate approves them. Admin/associate uploads bypass
    # the queue and land directly in `photos[]`.
    existing_step = next(
        (s for s in (order.get("steps") or []) if s["step_number"] == step_number), {}
    )
    existing_live = list(existing_step.get("photos") or [])
    existing_pending = list(existing_step.get("pending_photos") or [])

    incoming_live = list(body.photos or [])
    incoming_pending = list(body.pending_photos or [])

    if user["role"] == "manufacturer":
        # Manufacturers cannot alter live (already-approved) photos: pin them
        # to whatever the DB currently has. Any "extra" URL the client sent in
        # `photos` that isn't already approved is treated as a new upload and
        # routed into the pending queue for review.
        appended_to_pending = [u for u in incoming_live if u and u not in existing_live]
        final_live = existing_live
        final_pending = list(dict.fromkeys(incoming_pending + appended_to_pending))
    else:
        # Admin (and any future privileged role): trust the client payload.
        final_live = incoming_live
        final_pending = (
            incoming_pending if body.pending_photos is not None else existing_pending
        )

    update_fields = {
        "steps.$.completed": True,
        "steps.$.completed_at_china": china_iso,
        "steps.$.completed_at_utc": utc_iso,
        "steps.$.notes": body.notes or "",
        "steps.$.notes_translated": translated_note,
        "steps.$.notes_target_lang": target_lang if translated_note else "",
        "steps.$.photos": final_live,
        "steps.$.pending_photos": final_pending,
        "steps.$.forwarded_to_client": auto_forward,
        "steps.$.forwarded_at": china_iso if auto_forward else None,
    }
    res = await db.orders.update_one(
        {"id": order_id, "steps.step_number": step_number},
        {"$set": update_fields},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Step not found")

    if step_number == 26:
        await db.orders.update_one(
            {"id": order_id}, {"$set": {"status": "completed"}}
        )

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return strip_order_for_role(updated, user)


@router.post("/orders/{order_id}/steps/{step_number}/update")
async def update_completed_step(
    order_id: str,
    step_number: int,
    body: StepUpdate,
    user=Depends(require_roles("manufacturer", "admin")),
):
    """Edit notes/photos on an already-completed step *without* changing the
    completion timestamp or the forwarding state. Use this to correct a typo
    or add a forgotten photo after the step was finalised."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    step = next((s for s in order["steps"] if s["step_number"] == step_number), None)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    if not step.get("completed"):
        raise HTTPException(
            status_code=400,
            detail="Step is not completed yet — use /complete instead.",
        )

    client = await db.users.find_one({"id": order["client_id"]})
    client_country = (client or {}).get("country") or "AU"
    target_lang, target_lang_name = language_for_country(client_country)
    translated_note = ""
    if body.notes and not target_lang.lower().startswith("en"):
        t = await translate_text(body.notes, target_lang, target_lang_name)
        if t:
            translated_note = t

    # Apply the same gating logic as /complete: manufacturer uploads land in
    # pending_photos, admin uploads land in photos directly.
    existing_live = list(step.get("photos") or [])
    existing_pending = list(step.get("pending_photos") or [])
    incoming_live = list(body.photos or [])
    incoming_pending = list(body.pending_photos or [])
    if user["role"] == "manufacturer":
        appended_to_pending = [u for u in incoming_live if u and u not in existing_live]
        final_live = existing_live
        final_pending = list(dict.fromkeys(incoming_pending + appended_to_pending))
    else:
        final_live = incoming_live
        final_pending = (
            incoming_pending if body.pending_photos is not None else existing_pending
        )

    await db.orders.update_one(
        {"id": order_id, "steps.step_number": step_number},
        {
            "$set": {
                "steps.$.notes": body.notes or "",
                "steps.$.notes_translated": translated_note,
                "steps.$.notes_target_lang": target_lang if translated_note else "",
                "steps.$.photos": final_live,
                "steps.$.pending_photos": final_pending,
                "steps.$.updated_at_china": now_china_iso(),
                "steps.$.updated_by": user["email"],
            }
        },
    )
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return strip_order_for_role(updated, user)


@router.post("/orders/{order_id}/steps/{step_number}/reopen")
async def reopen_step(
    order_id: str,
    step_number: int,
    user=Depends(require_roles("manufacturer", "admin")),
):
    """Un-mark a completed step. Clears completion + forwarding state but
    preserves the notes and photos so the manufacturer can amend and
    re-complete without re-uploading from scratch."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    step = next((s for s in order["steps"] if s["step_number"] == step_number), None)
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    if not step.get("completed"):
        return {"ok": True, "already_open": True}

    await db.orders.update_one(
        {"id": order_id, "steps.step_number": step_number},
        {
            "$set": {
                "steps.$.completed": False,
                "steps.$.completed_at_china": None,
                "steps.$.completed_at_utc": None,
                "steps.$.forwarded_to_client": False,
                "steps.$.forwarded_at": None,
                "steps.$.reopened_at_china": now_china_iso(),
                "steps.$.reopened_by": user["email"],
            }
        },
    )
    # If reopening step 26, downgrade the order status back to in_progress.
    if step_number == 26:
        await db.orders.update_one(
            {"id": order_id}, {"$set": {"status": "in_progress"}}
        )

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return strip_order_for_role(updated, user)
async def forward_step(
    order_id: str,
    step_number: int,
    body: ForwardUpdate,
    user=Depends(require_roles("associate", "admin")),
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "associate" and order["associate_id"] != user["id"]:
        raise HTTPException(status_code=403)
    client_doc = await db.users.find_one({"id": order["client_id"]})
    client_country = (client_doc or {}).get("country") or "AU"
    target_lang, target_lang_name = language_for_country(client_country)
    translated_review = ""
    if body.review_note and not target_lang.lower().startswith("en"):
        t = await translate_text(body.review_note, target_lang, target_lang_name)
        if t:
            translated_review = t
    china_iso = now_china_iso()
    res = await db.orders.update_one(
        {"id": order_id, "steps.step_number": step_number},
        {
            "$set": {
                "steps.$.forwarded_to_client": True,
                "steps.$.forwarded_at": china_iso,
                "steps.$.associate_review_note": body.review_note or "",
                "steps.$.associate_review_note_translated": translated_review,
            }
        },
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Step not found")
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return strip_order_for_role(updated, user)

@router.post("/orders/{order_id}/steps/{step_number}/translate")
async def translate_step_note(
    order_id: str,
    step_number: int,
    body: dict,
    user=Depends(get_current_user),
):
    """On-demand translation of a step's note (and any associate review note)
    into an arbitrary target language. Used by the "Translate to {language}"
    button when a viewer's manual language pick differs from the language
    auto-translated at completion time.

    Does NOT mutate the order — returns the translation only.
    """
    target = (body.get("target_lang") or "").strip()
    target_name = (body.get("target_lang_name") or "").strip()
    if not target:
        raise HTTPException(status_code=400, detail="target_lang is required")
    if not target_name:
        target_name = target.upper()

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "associate" and order["associate_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "client" and order["client_id"] != user["id"]:
        raise HTTPException(status_code=403)

    step = next(
        (s for s in order["steps"] if s["step_number"] == step_number), None
    )
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    note = (step.get("notes") or "").strip()
    review_note = (step.get("associate_review_note") or "").strip()

    note_t = ""
    review_t = ""
    if note and not target.lower().startswith("en"):
        try:
            note_t = await translate_text(note, target, target_name) or ""
        except Exception:
            note_t = ""
    if review_note and not target.lower().startswith("en"):
        try:
            review_t = await translate_text(review_note, target, target_name) or ""
        except Exception:
            review_t = ""

    return {
        "target_lang": target,
        "target_lang_name": target_name,
        "notes_translated": note_t or note,
        "associate_review_note_translated": review_t or review_note,
    }




@router.put("/orders/{order_id}/customs")
async def update_customs(
    order_id: str,
    body: CustomsDocs,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    """Update the textual fields on the customs block: ``notes`` (admin only)
    and ``airway_bill_text`` (admin + manufacturer). The legacy single-image
    fields (``airway_bill`` / ``customs_document``) are also accepted for
    backward compatibility but the new flow uses the multi-file endpoints
    below.
    """
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)

    customs = order.get("customs", {}) or {}

    # Manufacturer may only touch the airway-bill text (used for tracking
    # number / shipper notes); everything else is admin-only.
    if user["role"] == "manufacturer":
        if body.airway_bill_text is not None:
            customs["airway_bill_text"] = body.airway_bill_text
    else:
        if body.airway_bill is not None:
            customs["airway_bill"] = body.airway_bill
        if body.customs_document is not None:
            customs["customs_document"] = body.customs_document
        if body.airway_bill_text is not None:
            customs["airway_bill_text"] = body.airway_bill_text
        if body.notes is not None:
            customs["notes"] = body.notes
    customs["updated_at_china"] = now_china_iso()
    await db.orders.update_one({"id": order_id}, {"$set": {"customs": customs}})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return strip_order_for_role(updated, user)


@router.get("/orders/{order_id}/customs")
async def get_customs(
    order_id: str, user=Depends(require_roles("admin", "manufacturer"))
):
    """Return the customs block (notes, airway bill text + files, customs
    document files). Admin sees every order; manufacturer only their own."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    customs = order.get("customs", {}) or {}
    # Ensure the new array fields are always present (empty list default).
    customs.setdefault("airway_bill_files", [])
    customs.setdefault("customs_files", [])
    customs.setdefault("airway_bill_text", "")
    customs.setdefault("notes", "")
    return customs


# ---- Multi-file customs uploads --------------------------------------------
# ``kind`` (path param) is either "airway-bill" or "customs". The file list
# is stored under ``customs.airway_bill_files`` / ``customs.customs_files``
# inside the order document.
_CUSTOMS_KIND_MAP = {
    "airway-bill": "airway_bill_files",
    "customs": "customs_files",
}


def _customs_kind_field(kind: str) -> str:
    if kind not in _CUSTOMS_KIND_MAP:
        raise HTTPException(
            status_code=400,
            detail="kind must be 'airway-bill' or 'customs'",
        )
    return _CUSTOMS_KIND_MAP[kind]


@router.post("/orders/{order_id}/customs/files/{kind}")
async def add_customs_file(
    order_id: str,
    kind: str,
    body: CustomsFilePayload,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    """Attach a file (already uploaded to Cloudinary) to either the airway-bill
    or the customs-document roster of an order."""
    field = _customs_kind_field(kind)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if not body.secure_url or not body.name:
        raise HTTPException(status_code=400, detail="name and secure_url required")
    entry = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "secure_url": body.secure_url,
        "public_id": body.public_id,
        "format": (body.format or "").lower() or None,
        "bytes": body.bytes,
        "resource_type": body.resource_type or "raw",
        "uploaded_at": now_china_iso(),
        "uploaded_by": user["id"],
        "uploaded_by_email": user.get("email"),
    }
    await db.orders.update_one(
        {"id": order_id},
        {"$push": {f"customs.{field}": entry}},
    )
    await record_event(
        db,
        request,
        f"order.customs.{kind.replace('-', '_')}.added",
        user=user,
        meta={
            "order_id": order_id,
            "file_name": entry["name"],
            "format": entry["format"],
            "bytes": entry["bytes"],
            "kind": kind,
        },
    )
    request.state.activity_logged = True
    return entry


@router.delete("/orders/{order_id}/customs/files/{kind}/{file_id}")
async def remove_customs_file(
    order_id: str,
    kind: str,
    file_id: str,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    """Detach a file from the airway-bill or customs-document roster. The
    underlying Cloudinary asset is left in place (mirrors the CAD-files flow).
    """
    field = _customs_kind_field(kind)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    files = (order.get("customs", {}) or {}).get(field) or []
    target = next((f for f in files if f.get("id") == file_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Customs file not found")
    # Manufacturers may only remove a file they themselves uploaded — keeps
    # the audit trail honest and prevents accidental cross-deletion.
    if (
        user["role"] == "manufacturer"
        and target.get("uploaded_by") != user["id"]
    ):
        raise HTTPException(
            status_code=403,
            detail="You can only remove files you uploaded.",
        )
    await db.orders.update_one(
        {"id": order_id},
        {"$pull": {f"customs.{field}": {"id": file_id}}},
    )
    await record_event(
        db,
        request,
        f"order.customs.{kind.replace('-', '_')}.removed",
        user=user,
        meta={
            "order_id": order_id,
            "file_name": target.get("name"),
            "file_id": file_id,
            "kind": kind,
        },
    )
    request.state.activity_logged = True
    return {"ok": True}


# ----------------------------- CAD files -------------------------------------
# Per-order roster of uploaded CAD files (stored on Cloudinary as "raw"
# assets). Admins can attach any number of files; the front-end uses the
# secure_url to deep-link / download.
class CadFilePayload(BaseModel):
    name: str
    secure_url: str
    public_id: str | None = None
    format: str | None = None  # cloudinary's reported file extension
    bytes: int | None = None
    resource_type: str | None = None


@router.get("/orders/{order_id}/cad-files")
async def list_cad_files(
    order_id: str, user=Depends(require_roles("admin", "manufacturer"))
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    return order.get("cad_files", [])


@router.post("/orders/{order_id}/cad-files")
async def add_cad_file(
    order_id: str,
    body: CadFilePayload,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    """Register a CAD file *after* it has been uploaded directly to Cloudinary
    via the signed-upload flow. Stores the metadata on the order so the
    front-end can render the file list / handle deletes. Admin can manage
    every order; manufacturer is scoped to their own commissions."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if not body.secure_url or not body.name:
        raise HTTPException(status_code=400, detail="name and secure_url required")
    entry = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "secure_url": body.secure_url,
        "public_id": body.public_id,
        "format": (body.format or "").lower() or None,
        "bytes": body.bytes,
        "resource_type": body.resource_type or "raw",
        "uploaded_at": now_china_iso(),
        "uploaded_by": user["id"],
        "uploaded_by_email": user.get("email"),
    }
    await db.orders.update_one(
        {"id": order_id},
        {"$push": {"cad_files": entry}},
    )
    await record_event(
        db,
        request,
        "order.cad_file.added",
        user=user,
        meta={
            "order_id": order_id,
            "file_name": entry["name"],
            "format": entry["format"],
            "bytes": entry["bytes"],
        },
    )
    request.state.activity_logged = True
    return entry


@router.delete("/orders/{order_id}/cad-files/{file_id}")
async def remove_cad_file(
    order_id: str,
    file_id: str,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    files = order.get("cad_files") or []
    target = next((f for f in files if f.get("id") == file_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="CAD file not found")
    # Manufacturers can only remove files they uploaded themselves so the
    # audit trail stays honest. Admin retains full delete power.
    if (
        user["role"] == "manufacturer"
        and target.get("uploaded_by") != user["id"]
    ):
        raise HTTPException(
            status_code=403,
            detail="You can only remove CAD files you uploaded.",
        )
    await db.orders.update_one(
        {"id": order_id},
        {"$pull": {"cad_files": {"id": file_id}}},
    )
    await record_event(
        db,
        request,
        "order.cad_file.removed",
        user=user,
        meta={
            "order_id": order_id,
            "file_name": target.get("name"),
            "file_id": file_id,
        },
    )
    request.state.activity_logged = True
    return {"ok": True}


# ---- CAD file forwarding via email (Resend) -------------------------------
# Admin + manufacturer (scoped to their own commission) can forward a
# subset of CAD files to one or more external email addresses. The email
# body contains clickable Cloudinary download links — no attachments, so
# we never bump against Resend's 40 MB attachment ceiling.


class CadEmailPayload(BaseModel):
    recipients: list[str]
    file_ids: list[str]
    subject: str | None = None
    message: str | None = None


@router.post("/orders/{order_id}/cad-files/email")
async def email_cad_files(
    order_id: str,
    body: CadEmailPayload,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    from _email import send_cad_files_email  # local import: lazy + cycle-safe

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)

    # Recipient sanity check — we trust the frontend's basic regex but
    # do a server-side guard too. Strip + dedupe.
    cleaned: list[str] = []
    seen: set[str] = set()
    for r in body.recipients or []:
        v = (r or "").strip()
        if not v or "@" not in v or "." not in v.split("@", 1)[1]:
            continue
        key = v.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(v)
    if not cleaned:
        raise HTTPException(
            status_code=400, detail="Add at least one valid recipient email."
        )
    if len(cleaned) > 50:
        # Resend's per-call recipient ceiling — surface a friendly error
        # rather than letting Resend reject the whole payload.
        raise HTTPException(
            status_code=400, detail="Maximum 50 recipients per email."
        )

    all_files = order.get("cad_files") or []
    if not all_files:
        raise HTTPException(
            status_code=400, detail="This commission has no CAD files."
        )
    if body.file_ids:
        selected = [f for f in all_files if f.get("id") in set(body.file_ids)]
    else:
        selected = list(all_files)
    if not selected:
        raise HTTPException(
            status_code=400, detail="None of the selected CAD files were found."
        )

    try:
        provider_response = send_cad_files_email(
            recipients=cleaned,
            subject=body.subject,
            message=body.message,
            sender_name=user.get("name"),
            sender_email=user.get("email"),
            order_ref=order.get("order_ref"),
            jewelry_name=order.get("jewelry_name"),
            files=selected,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — provider failures bubble as 502
        raise HTTPException(
            status_code=502, detail=f"Email provider error: {exc}"
        ) from exc

    await record_event(
        db,
        request,
        "order.cad_file.emailed",
        user=user,
        meta={
            "order_id": order_id,
            "recipients": cleaned,
            "file_ids": [f.get("id") for f in selected],
            "file_count": len(selected),
            "provider_id": (
                provider_response.get("id")
                if isinstance(provider_response, dict)
                else None
            ),
        },
    )
    request.state.activity_logged = True
    return {
        "ok": True,
        "recipients": cleaned,
        "file_count": len(selected),
        "provider_id": (
            provider_response.get("id")
            if isinstance(provider_response, dict)
            else None
        ),
    }


# ---- IGI Certificates ------------------------------------------------------
# Same data shape and audit pattern as CAD files. Stored under
# ``order.igi_certificates``; admin + manufacturer (scoped to their own order)
# can upload / delete. Manufacturers may only delete files they themselves
# uploaded — matches the customs roster behaviour.


class IgiCertFilePayload(BaseModel):
    name: str
    secure_url: str
    public_id: str | None = None
    format: str | None = None
    bytes: int | None = None
    resource_type: str | None = None


@router.get("/orders/{order_id}/igi-certificates")
async def list_igi_certificates(
    order_id: str, user=Depends(require_roles("admin", "manufacturer"))
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    return order.get("igi_certificates", [])


@router.post("/orders/{order_id}/igi-certificates")
async def add_igi_certificate(
    order_id: str,
    body: IgiCertFilePayload,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    """Attach an IGI certificate (already uploaded to Cloudinary) to the order.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if not body.secure_url or not body.name:
        raise HTTPException(status_code=400, detail="name and secure_url required")
    entry = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "secure_url": body.secure_url,
        "public_id": body.public_id,
        "format": (body.format or "").lower() or None,
        "bytes": body.bytes,
        "resource_type": body.resource_type or "raw",
        "uploaded_at": now_china_iso(),
        "uploaded_by": user["id"],
        "uploaded_by_email": user.get("email"),
    }
    await db.orders.update_one(
        {"id": order_id},
        {"$push": {"igi_certificates": entry}},
    )
    await record_event(
        db,
        request,
        "order.igi_certificate.added",
        user=user,
        meta={
            "order_id": order_id,
            "file_name": entry["name"],
            "format": entry["format"],
            "bytes": entry["bytes"],
        },
    )
    request.state.activity_logged = True
    return entry


@router.delete("/orders/{order_id}/igi-certificates/{file_id}")
async def remove_igi_certificate(
    order_id: str,
    file_id: str,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    files = order.get("igi_certificates") or []
    target = next((f for f in files if f.get("id") == file_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="IGI certificate not found")
    # Manufacturers can only remove files they uploaded themselves —
    # keeps the audit trail honest.
    if (
        user["role"] == "manufacturer"
        and target.get("uploaded_by") != user["id"]
    ):
        raise HTTPException(
            status_code=403,
            detail="You can only remove certificates you uploaded.",
        )
    await db.orders.update_one(
        {"id": order_id},
        {"$pull": {"igi_certificates": {"id": file_id}}},
    )
    await record_event(
        db,
        request,
        "order.igi_certificate.removed",
        user=user,
        meta={
            "order_id": order_id,
            "file_name": target.get("name"),
            "file_id": file_id,
        },
    )
    request.state.activity_logged = True
    return {"ok": True}



@router.get("/orders/{order_id}/digital-dna")
async def order_digital_dna(
    order_id: str,
    include_notes: bool = False,
    include_photos: bool = False,
    user=Depends(get_current_user),
):
    """Returns the Digital DNA PDF certificate for an order. Available to every
    role that can already see the order; manufacturer real name is never included.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "associate" and order["associate_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "client" and order["client_id"] != user["id"]:
        raise HTTPException(status_code=403)

    masked = dict(order)
    masked["manufacturer_name"] = (
        order.get("manufacturer_alias") or "Somnio.Co Atelier Workshop"
    )
    masked["progress"] = progress_summary(order["steps"])
    # Translate all step notes into the viewer's language before rendering.
    await ensure_translations_for_viewer(masked, user)

    pdf_bytes = build_digital_dna_pdf(
        masked,
        user,
        include_notes=include_notes,
        include_photos=include_photos,
    )
    suffix_bits = []
    if include_notes:
        suffix_bits.append("notes")
    if include_photos:
        suffix_bits.append("photos")
    suffix = ("-" + "-".join(suffix_bits)) if suffix_bits else ""
    filename = (
        f"Somnio.Co-DigitalDNA-{order.get('order_ref','order')}{suffix}.pdf"
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
