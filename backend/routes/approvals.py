"""
Photo approval queue + 60-day recycle bin.

Manufacturers' uploads land in ``step.pending_photos``. Admins (always) and
the owning associate of the commission can:

  - **Approve** → moves the URL to ``step.photos`` (live; client sees it)
  - **Hold**    → moves to ``step.on_hold_photos`` (hidden from client,
                  flagged for further investigation, still moderatable)
  - **Reject**  → moves to ``step.rejected_photos`` (soft-delete bin with
                  60-day retention; admin can reinstate). Cloudinary asset
                  is preserved so reinstatement is lossless.

Routes:
  - ``GET  /api/photos/pending``     — pending + on-hold queue (moderator-scoped)
  - ``POST /api/photos/approve``     — promote to live
  - ``POST /api/photos/hold``        — flag for further investigation
  - ``POST /api/photos/reject``      — soft-delete to bin
  - ``GET  /api/photos/recycled``    — recycle bin items within 60 days
  - ``POST /api/photos/reinstate``   — pull from bin back to pending
  - ``POST /api/photos/purge``       — admin manual purge of >60d entries
"""
from __future__ import annotations
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from _settings import get_settings, update_settings
from deps import db, get_current_user
from helpers import now_china_iso
from models import PhotoApprovalAction, SettingsPatch

logger = logging.getLogger(__name__)
router = APIRouter()

RECYCLE_RETENTION_DAYS = 60


def _can_moderate(user: dict, order: dict, settings: dict | None = None) -> bool:
    role = user.get("role")
    if role == "admin":
        return True
    if role == "associate" and order.get("associate_id") == user.get("id"):
        # Honour the global on/off switch for associate approval rights.
        s = settings or {}
        return bool(s.get("associate_approval_enabled", True))
    return False


def _viewer_scope(user: dict) -> dict:
    role = user.get("role")
    if role == "admin":
        return {}
    if role == "associate":
        return {"associate_id": user.get("id")}
    return {"_block_": True}


def _parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


# ------------------------------------------------------------ App settings
@router.get("/admin/settings")
async def fetch_settings(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403)
    return await get_settings()


@router.put("/admin/settings")
async def patch_settings(body: SettingsPatch, user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403)
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    return await update_settings(patch)


@router.get("/admin/pending-counts")
async def admin_pending_counts(user=Depends(get_current_user)):
    """Aggregate pending counts across every approval surface — photos,
    on-hold photos, pending CAD files, pending IGI certificates, and
    pending renders. Returns a flat ``{total, photos, on_hold, cad,
    igi, renders}`` payload that the home dashboard can display next to
    the Media Approvals tile without pulling the full queue.

    Scoped via :func:`_viewer_scope` so associates only count their own
    commissions and non-moderators get an empty payload.
    """
    scope = _viewer_scope(user)
    empty = {
        "total": 0,
        "photos": 0,
        "on_hold": 0,
        "cad": 0,
        "igi": 0,
        "renders": 0,
    }
    if scope.get("_block_"):
        return empty

    pipeline = [
        {"$match": scope},
        {
            "$project": {
                "_id": 0,
                "pending_photos": {
                    "$sum": {
                        "$map": {
                            "input": "$steps",
                            "as": "s",
                            "in": {
                                "$size": {
                                    "$ifNull": ["$$s.pending_photos", []]
                                }
                            },
                        }
                    }
                },
                "on_hold_photos": {
                    "$sum": {
                        "$map": {
                            "input": "$steps",
                            "as": "s",
                            "in": {
                                "$size": {
                                    "$ifNull": ["$$s.on_hold_photos", []]
                                }
                            },
                        }
                    }
                },
                "cad": {"$size": {"$ifNull": ["$pending_cad_files", []]}},
                "igi": {
                    "$size": {"$ifNull": ["$pending_igi_certificates", []]}
                },
                "renders": {"$size": {"$ifNull": ["$pending_renders", []]}},
            }
        },
        {
            "$group": {
                "_id": None,
                "photos": {"$sum": "$pending_photos"},
                "on_hold": {"$sum": "$on_hold_photos"},
                "cad": {"$sum": "$cad"},
                "igi": {"$sum": "$igi"},
                "renders": {"$sum": "$renders"},
            }
        },
    ]
    result = await db.orders.aggregate(pipeline).to_list(length=1)
    if not result:
        return empty
    row = result[0]
    photos = row.get("photos", 0) or 0
    on_hold = row.get("on_hold", 0) or 0
    cad = row.get("cad", 0) or 0
    igi = row.get("igi", 0) or 0
    renders = row.get("renders", 0) or 0
    return {
        "total": photos + on_hold + cad + igi + renders,
        "photos": photos,
        "on_hold": on_hold,
        "cad": cad,
        "igi": igi,
        "renders": renders,
    }


# ------------------------------------------------------------ Queue listing
@router.get("/photos/pending")
async def list_pending_photos(user=Depends(get_current_user)):
    """Pending + on-hold items the caller is allowed to moderate."""
    scope = _viewer_scope(user)
    if scope.get("_block_"):
        raise HTTPException(status_code=403)

    cursor = db.orders.find(
        {
            **scope,
            "$or": [
                {"steps.pending_photos.0": {"$exists": True}},
                {"steps.on_hold_photos.0": {"$exists": True}},
            ],
        },
        {
            "_id": 0,
            "id": 1,
            "order_ref": 1,
            "client_name": 1,
            "jewelry_name": 1,
            "manufacturer_alias": 1,
            "manufacturer_name": 1,
            "manufacturer_id": 1,
            "associate_id": 1,
            "steps": 1,
        },
    ).sort("created_at", -1)
    # Latest commission first → newest manufacturer activity surfaces at
    # the top of the queue. Within each step we then iterate the photo
    # arrays in reverse so the most-recently-appended URL appears first
    # (uploads append to the end of pending_photos[]).

    # First pass: build the queue while collecting manufacturer ids so we
    # can resolve their email addresses in a single round-trip below.
    queue: list[dict] = []
    mfg_ids: set[str] = set()
    async for o in cursor:
        mfg_id = o.get("manufacturer_id")
        if mfg_id:
            mfg_ids.add(mfg_id)
        # Walk steps in reverse step_number too — the highest-numbered
        # step is usually the most recently worked-on segment of the
        # commission.
        for s in reversed(o.get("steps") or []):
            for status_field, status_label in (
                ("pending_photos", "pending"),
                ("on_hold_photos", "on_hold"),
            ):
                # Reverse the photo array — uploads append to the end,
                # so reversing yields newest-first within the step.
                for url in reversed(s.get(status_field) or []):
                    queue.append(
                        {
                            "order_id": o["id"],
                            "order_ref": o.get("order_ref"),
                            "client_name": o.get("client_name"),
                            "jewelry_name": o.get("jewelry_name"),
                            "manufacturer_alias": (
                                o.get("manufacturer_alias")
                                or o.get("manufacturer_name")
                            ),
                            "manufacturer_id": mfg_id,
                            "step_number": s["step_number"],
                            "step_title": s.get("title"),
                            "step_phase": s.get("phase"),
                            "photo_url": url,
                            "status": status_label,
                        }
                    )

    # Batched manufacturer-email join so the front-end's moderation email
    # modal can show "Sending to …" without making a second round-trip.
    if mfg_ids:
        mfgs = await db.users.find(
            {"id": {"$in": list(mfg_ids)}},
            {"_id": 0, "id": 1, "email": 1, "name": 1},
        ).to_list(len(mfg_ids))
        by_id = {m["id"]: m for m in mfgs if m.get("id")}
        for it in queue:
            mfg = by_id.get(it.get("manufacturer_id") or "")
            it["manufacturer_email"] = (mfg or {}).get("email") or ""
            it["manufacturer_name"] = (mfg or {}).get("name") or it.get(
                "manufacturer_alias"
            )

    return {
        "count": len(queue),
        "pending_count": sum(1 for i in queue if i["status"] == "pending"),
        "on_hold_count": sum(1 for i in queue if i["status"] == "on_hold"),
        "items": queue,
    }


# ------------------------------------------------------------ Recycle bin
@router.get("/photos/recycled")
async def list_recycled_photos(user=Depends(get_current_user)):
    """Items in the soft-delete bin, still within the 60-day window."""
    scope = _viewer_scope(user)
    if scope.get("_block_"):
        raise HTTPException(status_code=403)

    cursor = db.orders.find(
        {**scope, "steps.rejected_photos.0": {"$exists": True}},
        {
            "_id": 0,
            "id": 1,
            "order_ref": 1,
            "client_name": 1,
            "jewelry_name": 1,
            "manufacturer_alias": 1,
            "manufacturer_name": 1,
            "associate_id": 1,
            "steps": 1,
        },
    )
    cutoff = datetime.now(timezone.utc) - timedelta(days=RECYCLE_RETENTION_DAYS)
    items: list[dict] = []
    async for o in cursor:
        for s in o.get("steps") or []:
            for entry in s.get("rejected_photos") or []:
                if not isinstance(entry, dict):
                    # Legacy plain-string entries — surface them with no metadata.
                    entry = {"photo_url": entry}
                rejected_at = _parse_iso(entry.get("rejected_at_utc")) or _parse_iso(
                    entry.get("rejected_at_china")
                )
                if rejected_at and rejected_at < cutoff:
                    continue  # past retention — still in DB until purge runs
                expires_at = (
                    rejected_at + timedelta(days=RECYCLE_RETENTION_DAYS)
                    if rejected_at
                    else None
                )
                days_remaining = (
                    int((expires_at - datetime.now(timezone.utc)).total_seconds() // 86400)
                    if expires_at
                    else None
                )
                items.append(
                    {
                        "order_id": o["id"],
                        "order_ref": o.get("order_ref"),
                        "client_name": o.get("client_name"),
                        "jewelry_name": o.get("jewelry_name"),
                        "step_number": s["step_number"],
                        "step_title": s.get("title"),
                        "step_phase": s.get("phase"),
                        "photo_url": entry.get("photo_url"),
                        "rejected_by": entry.get("rejected_by"),
                        "rejected_at": entry.get("rejected_at_utc")
                        or entry.get("rejected_at_china"),
                        "days_remaining": days_remaining,
                    }
                )
    return {"count": len(items), "items": items}


# ------------------------------------------------------------ Moderation
async def _move_photo(
    user: dict,
    body: PhotoApprovalAction,
    *,
    from_fields: tuple[str, ...],
    to_field: str | None,
    extra_log: dict | None = None,
):
    """Shared helper: remove the URL from ``from_fields`` arrays and push to
    ``to_field`` (or ``rejected_photos`` entry if to_field is None +
    extra_log carries the entry to push)."""
    order = await db.orders.find_one({"id": body.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    settings = await get_settings()
    if not _can_moderate(user, order, settings):
        raise HTTPException(status_code=403)
    step = next(
        (s for s in (order.get("steps") or []) if s["step_number"] == body.step_number),
        None,
    )
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    found_in: str | None = None
    for f in from_fields:
        if body.photo_url in (step.get(f) or []):
            found_in = f
            break
    if not found_in:
        raise HTTPException(
            status_code=404,
            detail=f"Photo not found in any of {list(from_fields)}",
        )

    updates: dict = {}

    # Remove from the source list.
    new_source = [u for u in (step.get(found_in) or []) if u != body.photo_url]
    updates[f"steps.$.{found_in}"] = new_source

    # Push into the target list (live / on_hold / pending).
    if to_field is not None:
        new_dest = list(step.get(to_field) or [])
        if body.photo_url not in new_dest:
            new_dest.append(body.photo_url)
        updates[f"steps.$.{to_field}"] = new_dest

    # Soft-delete: push structured entry into rejected_photos.
    if extra_log is not None:
        new_bin = list(step.get("rejected_photos") or [])
        # Strip any earlier entry referencing the same URL so the timer resets.
        new_bin = [
            e
            for e in new_bin
            if not (isinstance(e, dict) and e.get("photo_url") == body.photo_url)
        ]
        new_bin.append(extra_log)
        updates["steps.$.rejected_photos"] = new_bin

    updates["steps.$.last_moderated_at_china"] = now_china_iso()
    updates["steps.$.last_moderated_by"] = user["email"]

    await db.orders.update_one(
        {"id": body.order_id, "steps.step_number": body.step_number},
        {"$set": updates},
    )
    return {"ok": True, "moved_from": found_in, "to": to_field or "rejected_photos"}


@router.post("/photos/approve")
async def approve_photo(body: PhotoApprovalAction, user=Depends(get_current_user)):
    return await _move_photo(
        user, body, from_fields=("pending_photos", "on_hold_photos"), to_field="photos"
    )


@router.post("/photos/hold")
async def hold_photo(body: PhotoApprovalAction, user=Depends(get_current_user)):
    """Flags the photo for further investigation. Stays hidden from clients."""
    return await _move_photo(
        user,
        body,
        from_fields=("pending_photos",),
        to_field="on_hold_photos",
    )


@router.post("/photos/reject")
async def reject_photo(body: PhotoApprovalAction, user=Depends(get_current_user)):
    log_entry = {
        "photo_url": body.photo_url,
        "rejected_by": user["email"],
        "rejected_at_china": now_china_iso(),
        "rejected_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    return await _move_photo(
        user,
        body,
        from_fields=("pending_photos", "on_hold_photos", "photos"),
        to_field=None,
        extra_log=log_entry,
    )


# ----------------------------------------------------------------------------
# Moderation email — notifies the uploader that their image has been put on
# hold or rejected, with optional inline execution of the underlying action.
# ----------------------------------------------------------------------------

class ModerationEmailBody(PhotoApprovalAction):
    kind: str  # "hold" | "reject"
    recipient_email: str | None = None
    subject: str | None = None
    message: str | None = None
    # When True, the moderation action (hold or reject) is executed atomically
    # right after the email send succeeds. When False the endpoint only sends.
    also_action: bool = True


@router.post("/photos/moderation-email")
async def send_photo_moderation_email(
    body: ModerationEmailBody, user=Depends(get_current_user)
):
    """Send a HOLD or REJECT email to the uploader, then optionally perform
    the action. The action is gated by the same moderation rules as the
    direct /photos/hold and /photos/reject endpoints."""
    from _email import send_moderation_email

    if body.kind not in ("hold", "reject"):
        raise HTTPException(status_code=400, detail="kind must be 'hold' or 'reject'")

    order = await db.orders.find_one(
        {"id": body.order_id},
        {
            "_id": 0,
            "id": 1,
            "order_ref": 1,
            "jewelry_name": 1,
            "manufacturer_id": 1,
            "manufacturer_alias": 1,
            "associate_id": 1,
            "steps": 1,
        },
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _can_moderate(user, order, await get_settings()):
        raise HTTPException(status_code=403, detail="Cannot moderate this order")

    step = next(
        (s for s in (order.get("steps") or []) if s["step_number"] == body.step_number),
        None,
    )
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    # Resolve recipient — caller can override, otherwise we use the order's
    # manufacturer's email on file.
    recipient = (body.recipient_email or "").strip()
    if not recipient and order.get("manufacturer_id"):
        mfg = await db.users.find_one(
            {"id": order["manufacturer_id"]}, {"_id": 0, "email": 1, "name": 1}
        )
        recipient = (mfg or {}).get("email") or ""
    if not recipient:
        raise HTTPException(
            status_code=400,
            detail="No recipient email available — please provide one explicitly.",
        )

    now_utc = datetime.now(timezone.utc)
    sent_at_iso = now_utc.strftime("%Y-%m-%d %H:%M UTC")
    deadline_iso = (
        (now_utc + timedelta(hours=24)).strftime("%Y-%m-%d %H:%M UTC")
        if body.kind == "reject"
        else None
    )

    try:
        result = send_moderation_email(
            kind=body.kind,
            recipient_email=recipient,
            photo_url=body.photo_url,
            order_ref=order.get("order_ref"),
            jewelry_name=order.get("jewelry_name"),
            step_number=step.get("step_number"),
            step_title=step.get("title"),
            moderator_name=user.get("name") or user.get("email"),
            moderator_email=user.get("email"),
            message=body.message,
            sent_at_iso=sent_at_iso,
            deadline_iso=deadline_iso,
            subject_override=body.subject,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve)) from ve
    except Exception as exc:  # noqa: BLE001
        logger.exception("Moderation email failed: %s", exc)
        raise HTTPException(
            status_code=502, detail=f"Email failed: {exc}"
        ) from exc

    action_result = None
    if body.also_action:
        action_payload = PhotoApprovalAction(
            order_id=body.order_id,
            step_number=body.step_number,
            photo_url=body.photo_url,
        )
        if body.kind == "hold":
            action_result = await hold_photo(action_payload, user)
        else:
            action_result = await reject_photo(action_payload, user)

    return {
        "ok": True,
        "email": result,
        "recipient": recipient,
        "sent_at": sent_at_iso,
        "deadline": deadline_iso,
        "action": action_result,
    }


@router.post("/photos/reinstate")
async def reinstate_photo(body: PhotoApprovalAction, user=Depends(get_current_user)):
    """Pull a soft-deleted item out of the recycle bin and back into the
    pending queue so another decision can be made."""
    order = await db.orders.find_one({"id": body.order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can reinstate")
    step = next(
        (s for s in (order.get("steps") or []) if s["step_number"] == body.step_number),
        None,
    )
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")
    bin_entries = list(step.get("rejected_photos") or [])
    keep: list = []
    found = False
    for e in bin_entries:
        url = e.get("photo_url") if isinstance(e, dict) else e
        if url == body.photo_url and not found:
            found = True  # drop this one
            continue
        keep.append(e)
    if not found:
        raise HTTPException(status_code=404, detail="Photo not in recycle bin")
    pending = list(step.get("pending_photos") or [])
    if body.photo_url not in pending:
        pending.append(body.photo_url)
    await db.orders.update_one(
        {"id": body.order_id, "steps.step_number": body.step_number},
        {
            "$set": {
                "steps.$.rejected_photos": keep,
                "steps.$.pending_photos": pending,
                "steps.$.last_moderated_at_china": now_china_iso(),
                "steps.$.last_moderated_by": user["email"],
            }
        },
    )
    return {"ok": True, "reinstated": body.photo_url}


@router.post("/photos/purge")
async def purge_expired(user=Depends(get_current_user)):
    """Drop every rejected_photo whose timestamp is older than 60 days. Idempotent."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403)
    cutoff = datetime.now(timezone.utc) - timedelta(days=RECYCLE_RETENTION_DAYS)
    purged = 0
    cursor = db.orders.find(
        {"steps.rejected_photos.0": {"$exists": True}},
        {"_id": 0, "id": 1, "steps": 1},
    )
    async for o in cursor:
        for s in o.get("steps") or []:
            entries = s.get("rejected_photos") or []
            if not entries:
                continue
            kept: list = []
            for e in entries:
                if not isinstance(e, dict):
                    kept.append(e)
                    continue
                ts = _parse_iso(e.get("rejected_at_utc")) or _parse_iso(
                    e.get("rejected_at_china")
                )
                if ts and ts < cutoff:
                    purged += 1
                    continue
                kept.append(e)
            if len(kept) != len(entries):
                await db.orders.update_one(
                    {"id": o["id"], "steps.step_number": s["step_number"]},
                    {"$set": {"steps.$.rejected_photos": kept}},
                )
    return {"ok": True, "purged": purged}
