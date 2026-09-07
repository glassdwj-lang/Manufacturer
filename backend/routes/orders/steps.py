"""Per-step operations: complete / edit / reopen / forward / translate.

The `forward_step` endpoint's `@router.post(...)` decorator was missing in
the original monolithic `orders.py` (and preserved that way during the
package refactor). It is now restored — see the explanatory note above
`forward_step` below.
"""
from __future__ import annotations

from ._shared import (
    APIRouter,
    Depends,
    FileEmailPayload,
    ForwardUpdate,
    HTTPException,
    Request,
    StepUpdate,
    datetime,
    db,
    get_current_user,
    language_for_country,
    language_for_user,
    now_china_iso,
    record_event,
    require_roles,
    sanitize_recipients,
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
    # Respect the client's manual `preferred_language` override before
    # falling back to country-derived language. This ensures e.g. an
    # AU-based client who set their dashboard to Chinese still receives
    # translated workshop notes.
    target_lang, target_lang_name = language_for_user(client or {})
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
    # Seed the multi-language cache so `ensure_translations_for_viewer`
    # surfaces this translation on read instead of overwriting it with
    # an empty fallback.
    if translated_note:
        update_fields[f"steps.$.notes_i18n.{target_lang}"] = translated_note
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

    # In-app notification fan-out — admins (+ assigned manufacturer) need
    # to know when new photos are queued for moderation so they don't
    # have to poll the Media Approvals page. We deliberately fire AFTER
    # the DB write so a partially-failed write doesn't leave a stranded
    # notification.
    newly_pending = [u for u in final_pending if u not in existing_pending]
    if newly_pending and user["role"] == "manufacturer":
        try:
            from _notifications import notify_admins_and_manufacturer

            count = len(newly_pending)
            await notify_admins_and_manufacturer(
                db,
                order=order,
                actor_user_id=user["id"],
                type="step_photo.pending",
                title=(
                    "1 photo awaiting approval"
                    if count == 1
                    else f"{count} photos awaiting approval"
                ),
                body=(
                    f"{user.get('name') or user.get('email')} completed step "
                    f"{step_number:02d} on {order.get('order_ref') or order_id}"
                ),
                link_route="/approvals",
                payload={
                    "order_id": order_id,
                    "order_ref": order.get("order_ref"),
                    "jewelry_name": order.get("jewelry_name"),
                    "step_number": step_number,
                    "count": count,
                },
            )
        except Exception as exc:  # noqa: BLE001
            # Notification failure must NEVER fail the step completion.
            import logging
            logging.getLogger(__name__).warning(
                "Failed to fan out step-photo pending notification: %s", exc
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
    target_lang, target_lang_name = language_for_user(client or {})
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
                **(
                    {f"steps.$.notes_i18n.{target_lang}": translated_note}
                    if translated_note
                    else {}
                ),
                "steps.$.photos": final_live,
                "steps.$.pending_photos": final_pending,
                "steps.$.updated_at_china": now_china_iso(),
                "steps.$.updated_by": user["email"],
            }
        },
    )
    # In-app fan-out (same pattern as /complete) so admins find their
    # moderation queue without polling the screen.
    newly_pending = [u for u in final_pending if u not in existing_pending]
    if newly_pending and user["role"] == "manufacturer":
        try:
            from _notifications import notify_admins_and_manufacturer

            count = len(newly_pending)
            await notify_admins_and_manufacturer(
                db,
                order=order,
                actor_user_id=user["id"],
                type="step_photo.pending",
                title=(
                    "1 photo awaiting approval"
                    if count == 1
                    else f"{count} photos awaiting approval"
                ),
                body=(
                    f"{user.get('name') or user.get('email')} amended step "
                    f"{step_number:02d} on {order.get('order_ref') or order_id}"
                ),
                link_route="/approvals",
                payload={
                    "order_id": order_id,
                    "order_ref": order.get("order_ref"),
                    "jewelry_name": order.get("jewelry_name"),
                    "step_number": step_number,
                    "count": count,
                },
            )
        except Exception as exc:  # noqa: BLE001
            import logging
            logging.getLogger(__name__).warning(
                "Failed to fan out step-photo pending notification: %s", exc
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


# Forward a completed step to the client. Previously the `@router.post(...)`
# decorator was missing in `orders.py`, which caused the frontend's
# `api.forwardStep` call to silently 404 in production. The decorator is
# restored here so step forwarding works again.
@router.post("/orders/{order_id}/steps/{step_number}/forward")
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
    target_lang, target_lang_name = language_for_user(client_doc or {})
    translated_review = ""
    if body.review_note and not target_lang.lower().startswith("en"):
        t = await translate_text(body.review_note, target_lang, target_lang_name)
        if t:
            translated_review = t
    china_iso = now_china_iso()
    update_set = {
        "steps.$.forwarded_to_client": True,
        "steps.$.forwarded_at": china_iso,
        "steps.$.associate_review_note": body.review_note or "",
        "steps.$.associate_review_note_translated": translated_review,
    }
    # Seed the multi-language cache so `ensure_translations_for_viewer`
    # surfaces this translation on read instead of overwriting it with
    # an empty fallback.
    if translated_review:
        update_set[f"steps.$.associate_review_note_i18n.{target_lang}"] = translated_review
    res = await db.orders.update_one(
        {"id": order_id, "steps.step_number": step_number},
        {"$set": update_set},
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


# ---------------------------------------------------------------------
# Forward workshop step photos to arbitrary recipients (client, customs,
# etc.) via Resend. Mirrors the CAD/IGI/customs file-forwarding UX —
# the email body renders clickable Cloudinary links, no attachments.
# ---------------------------------------------------------------------
@router.post("/orders/{order_id}/steps/{step_number}/photos/email")
async def email_step_photos(
    order_id: str,
    step_number: int,
    body: FileEmailPayload,
    request: Request,
    user=Depends(require_roles("admin", "associate", "manufacturer")),
):
    """Email a selection of a step's approved photos as download links.

    File model — step photos are stored as raw URL strings so we
    synthesize pseudo-file dicts on the fly:
      id      = ``photo-{index}``
      name    = ``Step NN — Title — {index+1}``
      secure_url = the URL itself
    """
    from _email import send_files_email  # lazy + cycle-safe

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    role = user["role"]
    # Explicit None guard — an order with a null manufacturer_id must
    # never fall through to "matches every mfg's user_id != None" logic.
    if role == "manufacturer" and (
        not order.get("manufacturer_id") or order["manufacturer_id"] != user["id"]
    ):
        raise HTTPException(status_code=403)
    if role == "associate" and (
        not order.get("associate_id") or order["associate_id"] != user["id"]
    ):
        raise HTTPException(status_code=403)

    step = next(
        (s for s in order["steps"] if s["step_number"] == step_number), None
    )
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    cleaned = sanitize_recipients(body.recipients)
    if not cleaned:
        raise HTTPException(
            status_code=400, detail="Add at least one valid recipient email."
        )
    if len(cleaned) > 50:
        raise HTTPException(
            status_code=400, detail="Maximum 50 recipients per email."
        )

    photos = step.get("photos") or []
    if not photos:
        raise HTTPException(
            status_code=400, detail="This step has no approved photos to forward."
        )

    step_title = step.get("title") or f"Step {step_number}"
    files = []
    for idx, url in enumerate(photos):
        if not url:
            continue
        pid = f"photo-{idx}"
        files.append({
            "id": pid,
            "name": f"Step {int(step_number):02d} · Photo {idx + 1}",
            "secure_url": url,
        })
    # Honour the file_ids filter (from checkbox UI). Empty list => send
    # every photo, matching the CAD/IGI email conventions.
    if body.file_ids:
        selected_ids = set(body.file_ids)
        files = [f for f in files if f["id"] in selected_ids]
    if not files:
        raise HTTPException(
            status_code=400, detail="None of the selected photos were found."
        )

    # Prepend the step title to the intro so recipients see context.
    intro_message = body.message
    if step_title and step_title not in (body.message or ""):
        intro_message = (
            f"Step {int(step_number):02d} — {step_title}\n\n"
            + (body.message or "")
        ).strip()

    try:
        provider_response = send_files_email(
            kind="step_photos",
            recipients=cleaned,
            subject=body.subject,
            message=intro_message,
            sender_name=user.get("name"),
            sender_email=user.get("email"),
            order_ref=order.get("order_ref"),
            jewelry_name=order.get("jewelry_name"),
            files=files,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Email provider error: {exc}"
        ) from exc

    await record_event(
        db,
        request,
        "order.step.photos.emailed",
        user=user,
        meta={
            "order_id": order_id,
            "step_number": step_number,
            "recipients": cleaned,
            "photo_count": len(files),
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
        "file_count": len(files),
        "provider_id": (
            provider_response.get("id")
            if isinstance(provider_response, dict)
            else None
        ),
    }
