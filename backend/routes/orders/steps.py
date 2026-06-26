"""Per-step operations: complete / edit / reopen / forward / translate.

NOTE — `forward_step` was historically missing its `@router.post(...)`
decorator in `orders.py`, so the `/orders/{id}/steps/{n}/forward`
endpoint silently 404s in production despite the frontend calling
`api.forwardStep`. The refactor preserves the original behaviour
(decorator omitted) to honour the \"zero behavior change\" promise,
but the bug is flagged here for a follow-up fix.
"""
from __future__ import annotations

from ._shared import (
    APIRouter,
    Depends,
    ForwardUpdate,
    HTTPException,
    StepUpdate,
    datetime,
    db,
    get_current_user,
    language_for_country,
    now_china_iso,
    require_roles,
    strip_order_for_role,
    timezone,
    translate_text,
)

router = APIRouter(tags=["orders"])


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


# DEAD CODE — preserved from `orders.py` exactly. The `@router.post(...)`
# decorator was missing in the original file, which means the
# /orders/{id}/steps/{n}/forward endpoint never registered with FastAPI.
# The frontend's `api.forwardStep` currently 404s. We intentionally do
# NOT add the decorator here to honour zero-behaviour-change; flag this
# as the first follow-up after refactor verification.
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
    into an arbitrary target language. Used by the \"Translate to {language}\"
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
