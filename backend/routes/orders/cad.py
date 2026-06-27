"""CAD files: list / add / remove + email forwarding."""
from __future__ import annotations

from ._shared import (
    APIRouter,
    BaseModel,
    Depends,
    FileEmailPayload,
    HTTPException,
    Request,
    db,
    now_china_iso,
    record_event,
    require_roles,
    sanitize_recipients,
    uuid,
)

router = APIRouter(tags=["orders"])


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
    order_id: str,
    user=Depends(require_roles("admin", "associate", "manufacturer")),
):
    """Returns ``{cad_files, pending_cad_files}``.

    Visibility rules:
    * **admin / associate** — see everything (live + every pending entry)
    * **manufacturer** — sees live + ONLY pending entries they themselves
      uploaded, so they can still delete their own queued submissions but
      can't peek into other workshops' pending uploads.
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)

    live = order.get("cad_files") or []
    pending_all = order.get("pending_cad_files") or []
    if user["role"] in ("admin", "associate"):
        pending = pending_all
    elif user["role"] == "manufacturer":
        pending = [p for p in pending_all if p.get("uploaded_by") == user["id"]]
    else:
        pending = []
    return {"cad_files": live, "pending_cad_files": pending}


@router.post("/orders/{order_id}/cad-files")
async def add_cad_file(
    order_id: str,
    body: CadFilePayload,
    request: Request,
    user=Depends(require_roles("admin", "associate", "manufacturer")),
):
    """Register a CAD file *after* it has been uploaded directly to Cloudinary.

    Approval flow (mirrors step-photo + render pipelines):
    * **admin / associate** uploads land directly in ``cad_files`` (live).
    * **manufacturer** uploads land in ``pending_cad_files`` and must be
      promoted by an admin/associate before clients/customs can see them.
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
        "uploaded_by_role": user["role"],
    }
    target_field = "cad_files" if user["role"] in ("admin", "associate") else "pending_cad_files"
    await db.orders.update_one(
        {"id": order_id},
        {"$push": {target_field: entry}},
    )
    await record_event(
        db,
        request,
        f"order.cad_file.{'added' if target_field == 'cad_files' else 'submitted'}",
        user=user,
        meta={
            "order_id": order_id,
            "file_name": entry["name"],
            "format": entry["format"],
            "bytes": entry["bytes"],
            "queue": target_field,
        },
    )
    # Fan out an in-app notification to admins + the assigned manufacturer
    # so they can spot fresh CAD uploads without polling the order page.
    try:
        from _notifications import notify_admins_and_manufacturer

        is_pending = target_field == "pending_cad_files"
        await notify_admins_and_manufacturer(
            db,
            order=order,
            actor_user_id=user["id"],
            type="cad.pending" if is_pending else "cad.added",
            title=(
                "CAD upload awaiting review"
                if is_pending
                else "CAD file added"
            ),
            body=(
                f"{user.get('name') or user.get('email')} uploaded "
                f"{entry['name']} on {order.get('order_ref') or order_id}"
            ),
            link_route="/cad-files/[id]",
            link_params={"id": order_id},
            payload={
                "order_id": order_id,
                "order_ref": order.get("order_ref"),
                "jewelry_name": order.get("jewelry_name"),
                "file_id": entry["id"],
                "file_name": entry["name"],
                "queue": target_field,
            },
        )
    except Exception:
        # Notifications are best-effort — never block uploads.
        pass
    request.state.activity_logged = True
    return {"file": entry, "queue": target_field}


@router.post("/orders/{order_id}/cad-files/{file_id}/approve")
async def approve_cad_file(
    order_id: str,
    file_id: str,
    request: Request,
    user=Depends(require_roles("admin", "associate")),
):
    """Promote a pending CAD file to live. Admin or associate."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    pending = order.get("pending_cad_files") or []
    target = next((p for p in pending if p.get("id") == file_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Pending CAD file not found")

    promoted = {
        **target,
        "approved_at": now_china_iso(),
        "approved_by": user.get("id"),
        "approved_by_email": user.get("email"),
    }
    await db.orders.update_one(
        {"id": order_id},
        {
            "$pull": {"pending_cad_files": {"id": file_id}},
            "$push": {"cad_files": promoted},
        },
    )
    await record_event(
        db,
        request,
        "order.cad_file.approved",
        user=user,
        meta={
            "order_id": order_id,
            "file_id": file_id,
            "file_name": target.get("name"),
        },
    )
    request.state.activity_logged = True
    return {"ok": True, "file": promoted}


@router.post("/orders/{order_id}/cad-files/{file_id}/reject")
async def reject_cad_file(
    order_id: str,
    file_id: str,
    request: Request,
    user=Depends(require_roles("admin", "associate")),
):
    """Reject a pending CAD file. Removes it from the pending queue. The
    Cloudinary asset itself is intentionally NOT deleted so admins can
    inspect or re-upload manually (matches the photo soft-bin pattern)."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    pending = order.get("pending_cad_files") or []
    target = next((p for p in pending if p.get("id") == file_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Pending CAD file not found")

    await db.orders.update_one(
        {"id": order_id},
        {"$pull": {"pending_cad_files": {"id": file_id}}},
    )
    await record_event(
        db,
        request,
        "order.cad_file.rejected",
        user=user,
        meta={
            "order_id": order_id,
            "file_id": file_id,
            "file_name": target.get("name"),
        },
    )
    request.state.activity_logged = True
    return {"ok": True}


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


@router.post("/orders/{order_id}/cad-files/email")
async def email_cad_files(
    order_id: str,
    body: FileEmailPayload,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    """Forward a selection of CAD files to one or more recipients via Resend.

    The email body contains clickable Cloudinary download links — no
    attachments, so we never bump against Resend's 40 MB attachment ceiling.
    Admin can email any commission's files; manufacturer is scoped to their
    own orders.
    """
    from _email import send_files_email  # local import: lazy + cycle-safe

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)

    cleaned = sanitize_recipients(body.recipients)
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
        provider_response = send_files_email(
            kind="cad",
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
