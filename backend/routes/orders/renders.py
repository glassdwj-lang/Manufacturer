"""Renders folder — vendor (cad_renderer) uploads land in
``order.pending_renders`` and must be approved by an admin before they
move into the client-visible ``order.renders`` array. This mirrors the
step-photo approval flow so users have one consistent moderation
mental model across the app.

Routes (all mounted under /api):
  PUT    /orders/{id}/cad-renderer            -- admin assigns / clears the vendor
  GET    /orders/{id}/renders                  -- list (scope-filtered by role)
  POST   /orders/{id}/renders                  -- upload (admin -> live, vendor -> pending)
  POST   /orders/{id}/renders/{rid}/approve    -- admin promotes a pending render
  POST   /orders/{id}/renders/{rid}/reject     -- admin removes a pending render
  DELETE /orders/{id}/renders/{rid}            -- admin always; vendor only for own pending uploads
"""
from __future__ import annotations

from ._shared import (
    APIRouter,
    BaseModel,
    Depends,
    HTTPException,
    Request,
    db,
    get_current_user,
    now_china_iso,
    record_event,
    require_roles,
    uuid,
)

router = APIRouter(tags=["orders"])


class RenderFilePayload(BaseModel):
    name: str
    secure_url: str
    public_id: str | None = None
    format: str | None = None
    bytes: int | None = None
    resource_type: str | None = None


class CadRendererAssignmentPayload(BaseModel):
    cad_renderer_id: str | None = None


# ---- Assignment -----------------------------------------------------------
@router.put("/orders/{order_id}/cad-renderer")
async def assign_cad_renderer(
    order_id: str,
    body: CadRendererAssignmentPayload,
    request: Request,
    user=Depends(require_roles("admin")),
):
    """Assign (or clear with ``cad_renderer_id=null``) the CAD/render vendor
    for a commission. Admin-only. The vendor's login dashboard is filtered
    on this field so assignment is the moment the vendor gets visibility.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    new_id = (body.cad_renderer_id or "").strip() or None

    vendor_name: str | None = None
    if new_id:
        vendor = await db.users.find_one(
            {"id": new_id, "role": "cad_renderer"}, {"_id": 0}
        )
        if not vendor:
            raise HTTPException(
                status_code=400,
                detail="cad_renderer_id does not match any CAD/Render vendor.",
            )
        vendor_name = vendor.get("name") or vendor.get("email")

    update_doc: dict = {}
    if new_id is None:
        update_doc["$unset"] = {"cad_renderer_id": "", "cad_renderer_name": ""}
    else:
        update_doc["$set"] = {
            "cad_renderer_id": new_id,
            "cad_renderer_name": vendor_name,
        }
    await db.orders.update_one({"id": order_id}, update_doc)

    await record_event(
        db,
        request,
        "order.cad_renderer.assigned" if new_id else "order.cad_renderer.cleared",
        user=user,
        meta={
            "order_id": order_id,
            "previous_vendor_id": order.get("cad_renderer_id"),
            "new_vendor_id": new_id,
            "vendor_name": vendor_name,
        },
    )
    request.state.activity_logged = True
    return {
        "ok": True,
        "cad_renderer_id": new_id,
        "cad_renderer_name": vendor_name,
    }


# ---- Renders list / upload / moderate -------------------------------------
def _can_view_order(user: dict, order: dict) -> bool:
    role = user.get("role")
    if role == "admin":
        return True
    if role == "manufacturer":
        return order.get("manufacturer_id") == user.get("id")
    if role == "associate":
        return order.get("associate_id") == user.get("id")
    if role == "client":
        return order.get("client_id") == user.get("id")
    if role == "cad_renderer":
        return order.get("cad_renderer_id") == user.get("id")
    return False


@router.get("/orders/{order_id}/renders")
async def list_renders(order_id: str, user=Depends(get_current_user)):
    """Returns the renders bundle for the commission.

    Visibility:
    * Admin            -> live renders + every pending entry
    * Assigned vendor  -> live renders + ONLY their own pending uploads
    * Manufacturer     -> live renders only (no pending until promoted)
    * Associate/Client -> live renders only
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not _can_view_order(user, order):
        raise HTTPException(status_code=403)

    live = order.get("renders") or []
    pending_all = order.get("pending_renders") or []
    role = user.get("role")
    if role == "admin":
        pending = pending_all
    elif role == "cad_renderer":
        pending = [p for p in pending_all if p.get("uploaded_by") == user.get("id")]
    else:
        # Manufacturers / associates / clients never see the pending list.
        pending = []
    return {
        "renders": live,
        "pending_renders": pending,
        "cad_renderer_id": order.get("cad_renderer_id"),
        "cad_renderer_name": order.get("cad_renderer_name"),
    }


@router.post("/orders/{order_id}/renders")
async def add_render(
    order_id: str,
    body: RenderFilePayload,
    request: Request,
    user=Depends(require_roles("admin", "associate", "cad_renderer")),
):
    """Attach a render. Admin/Associate uploads land in ``renders`` (live);
    CAD/Render vendor uploads land in ``pending_renders`` awaiting an
    admin/associate approval. Mirrors the CAD-file pipeline so the
    moderation mental model stays consistent across the app.

    Vendors must be the *assigned* vendor for the commission, otherwise 403.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "cad_renderer" and order.get("cad_renderer_id") != user["id"]:
        raise HTTPException(
            status_code=403,
            detail="You are not assigned to this commission.",
        )
    if not body.secure_url or not body.name:
        raise HTTPException(status_code=400, detail="name and secure_url required")

    entry = {
        "id": str(uuid.uuid4()),
        "name": body.name.strip(),
        "secure_url": body.secure_url,
        "public_id": body.public_id,
        "format": (body.format or "").lower() or None,
        "bytes": body.bytes,
        "resource_type": body.resource_type or "image",
        "uploaded_at": now_china_iso(),
        "uploaded_by": user["id"],
        "uploaded_by_email": user.get("email"),
        "uploaded_by_role": user["role"],
    }
    target_field = (
        "renders" if user["role"] in ("admin", "associate") else "pending_renders"
    )
    await db.orders.update_one(
        {"id": order_id},
        {"$push": {target_field: entry}},
    )
    await record_event(
        db,
        request,
        f"order.render.{'added' if target_field == 'renders' else 'submitted'}",
        user=user,
        meta={
            "order_id": order_id,
            "file_name": entry["name"],
            "format": entry["format"],
            "bytes": entry["bytes"],
            "queue": target_field,
        },
    )
    # Fan out an in-app notification (best-effort) — admins + the assigned
    # manufacturer see new renders without polling the order page.
    try:
        from _notifications import notify_admins_and_manufacturer

        is_pending = target_field == "pending_renders"
        await notify_admins_and_manufacturer(
            db,
            order=order,
            actor_user_id=user["id"],
            type="render.pending" if is_pending else "render.added",
            title=(
                "Render upload awaiting review"
                if is_pending
                else "Render added"
            ),
            body=(
                f"{user.get('name') or user.get('email')} uploaded "
                f"{entry['name']} on {order.get('order_ref') or order_id}"
            ),
            link_route="/renders/[id]",
            link_params={"id": order_id},
            payload={
                "order_id": order_id,
                "order_ref": order.get("order_ref"),
                "jewelry_name": order.get("jewelry_name"),
                "render_id": entry["id"],
                "file_name": entry["name"],
                "queue": target_field,
            },
        )
    except Exception:
        pass
    request.state.activity_logged = True
    return {"render": entry, "queue": target_field}


@router.post("/orders/{order_id}/renders/{render_id}/approve")
async def approve_render(
    order_id: str,
    render_id: str,
    request: Request,
    user=Depends(require_roles("admin", "associate")),
):
    """Promote a pending render to live. Admin or associate."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    pending = order.get("pending_renders") or []
    target = next((p for p in pending if p.get("id") == render_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Pending render not found")

    promoted = {
        **target,
        "approved_at": now_china_iso(),
        "approved_by": user.get("id"),
        "approved_by_email": user.get("email"),
    }
    await db.orders.update_one(
        {"id": order_id},
        {
            "$pull": {"pending_renders": {"id": render_id}},
            "$push": {"renders": promoted},
        },
    )
    await record_event(
        db,
        request,
        "order.render.approved",
        user=user,
        meta={
            "order_id": order_id,
            "render_id": render_id,
            "file_name": target.get("name"),
        },
    )
    request.state.activity_logged = True
    return {"ok": True, "render": promoted}


@router.post("/orders/{order_id}/renders/{render_id}/reject")
async def reject_render(
    order_id: str,
    render_id: str,
    request: Request,
    user=Depends(require_roles("admin", "associate")),
):
    """Reject a pending render. Removes it from the pending queue. The
    Cloudinary asset itself is intentionally NOT touched so admins can
    inspect / re-upload manually if needed (mirrors the photo soft-bin)."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    pending = order.get("pending_renders") or []
    target = next((p for p in pending if p.get("id") == render_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Pending render not found")

    await db.orders.update_one(
        {"id": order_id},
        {"$pull": {"pending_renders": {"id": render_id}}},
    )
    await record_event(
        db,
        request,
        "order.render.rejected",
        user=user,
        meta={
            "order_id": order_id,
            "render_id": render_id,
            "file_name": target.get("name"),
        },
    )
    request.state.activity_logged = True
    return {"ok": True}


@router.delete("/orders/{order_id}/renders/{render_id}")
async def remove_render(
    order_id: str,
    render_id: str,
    request: Request,
    user=Depends(require_roles("admin", "cad_renderer")),
):
    """Remove a render from either queue.

    * Admin can remove anything (live or pending).
    * Vendor can only remove a pending entry they uploaded themselves
      (gives them a way to undo a misclick before approval).
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    live = order.get("renders") or []
    pending = order.get("pending_renders") or []
    target_field: str | None = None
    target: dict | None = None
    if any(r.get("id") == render_id for r in live):
        target_field = "renders"
        target = next(r for r in live if r.get("id") == render_id)
    elif any(p.get("id") == render_id for p in pending):
        target_field = "pending_renders"
        target = next(p for p in pending if p.get("id") == render_id)
    if not target_field or not target:
        raise HTTPException(status_code=404, detail="Render not found")

    if user["role"] == "cad_renderer":
        if target_field != "pending_renders":
            raise HTTPException(
                status_code=403,
                detail="Approved renders can only be removed by an admin.",
            )
        if target.get("uploaded_by") != user["id"]:
            raise HTTPException(
                status_code=403,
                detail="You can only remove pending renders you uploaded.",
            )

    await db.orders.update_one(
        {"id": order_id},
        {"$pull": {target_field: {"id": render_id}}},
    )
    await record_event(
        db,
        request,
        "order.render.removed",
        user=user,
        meta={
            "order_id": order_id,
            "render_id": render_id,
            "file_name": target.get("name"),
            "queue": target_field,
        },
    )
    request.state.activity_logged = True
    return {"ok": True}



# ----------------------------------------------------------------------------
# Render-moderation email
#
# Mirrors the photo moderation-email pipeline: an admin / associate can
# send a HOLD or REJECT email (with a 24h replacement deadline for REJECT)
# to the original render uploader (CAD vendor) — and optionally execute
# the underlying reject mutation atomically.
#
# Renders don't have a "hold" queue today; HOLD just sends the email
# without touching the queue, REJECT sends the email then removes the
# pending render so it disappears from the admin approval queue.
# ----------------------------------------------------------------------------


class RenderModerationEmailBody(BaseModel):
    kind: str  # "hold" | "reject"
    recipient_email: str | None = None
    subject: str | None = None
    message: str | None = None
    # When True (default) the underlying reject is executed atomically
    # after the email send succeeds.  HOLD is informational only because
    # renders have no on-hold queue.
    also_action: bool = True


@router.post("/orders/{order_id}/renders/{render_id}/moderation-email")
async def send_render_moderation_email(
    order_id: str,
    render_id: str,
    body: RenderModerationEmailBody,
    request: Request,
    user=Depends(require_roles("admin", "associate")),
):
    from datetime import datetime, timedelta, timezone
    from _email import send_moderation_email

    if body.kind not in ("hold", "reject"):
        raise HTTPException(status_code=400, detail="kind must be 'hold' or 'reject'")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Look for the render in both pending and live queues — REJECT only
    # operates on pending, HOLD is informational so it tolerates either.
    pending = order.get("pending_renders") or []
    live = order.get("renders") or []
    target = next(
        (r for r in pending if r.get("id") == render_id),
        None,
    ) or next((r for r in live if r.get("id") == render_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Render not found")
    if body.kind == "reject" and target not in pending:
        raise HTTPException(
            status_code=400,
            detail="Only pending renders can be rejected.",
        )

    # Resolve recipient — caller can override, otherwise prefer the
    # uploader's email if we recorded it, then fall back to the order's
    # assigned cad_renderer's email on file.
    recipient = (body.recipient_email or "").strip()
    if not recipient and target.get("uploaded_by_email"):
        recipient = target["uploaded_by_email"]
    if not recipient and target.get("uploaded_by"):
        uploader = await db.users.find_one(
            {"id": target["uploaded_by"]}, {"_id": 0, "email": 1}
        )
        recipient = (uploader or {}).get("email") or ""
    if not recipient and order.get("cad_renderer_id"):
        cad = await db.users.find_one(
            {"id": order["cad_renderer_id"]}, {"_id": 0, "email": 1}
        )
        recipient = (cad or {}).get("email") or ""
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
            photo_url=target.get("secure_url") or "",
            order_ref=order.get("order_ref"),
            jewelry_name=order.get("jewelry_name"),
            step_number=None,
            step_title=f"Render · {target.get('name') or 'file'}",
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
        raise HTTPException(
            status_code=502, detail=f"Email failed: {exc}"
        ) from exc

    # Atomically execute the underlying reject after email succeeds.
    action_done = False
    if body.also_action and body.kind == "reject":
        await db.orders.update_one(
            {"id": order_id},
            {"$pull": {"pending_renders": {"id": render_id}}},
        )
        action_done = True

    await record_event(
        db,
        request,
        f"order.render.{body.kind}_emailed",
        user=user,
        meta={
            "order_id": order_id,
            "render_id": render_id,
            "file_name": target.get("name"),
            "recipient": recipient,
            "deadline": deadline_iso,
            "action_executed": action_done,
        },
    )
    request.state.activity_logged = True

    return {
        "ok": True,
        "kind": body.kind,
        "recipient": result.get("recipient", recipient),
        "sent_at": sent_at_iso,
        "deadline": deadline_iso,
        "action_executed": action_done,
    }
