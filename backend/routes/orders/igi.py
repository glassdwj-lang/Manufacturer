"""IGI certificates: list / add / remove + email forwarding.

Same data shape and audit pattern as CAD files. Stored under
``order.igi_certificates``; admin + manufacturer (scoped to their own
order) can upload / delete. Manufacturers may only delete files they
themselves uploaded — matches the customs roster behaviour.
"""
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


class IgiCertFilePayload(BaseModel):
    name: str
    secure_url: str
    public_id: str | None = None
    format: str | None = None
    bytes: int | None = None
    resource_type: str | None = None


@router.get("/orders/{order_id}/igi-certificates")
async def list_igi_certificates(
    order_id: str,
    user=Depends(require_roles("admin", "associate", "manufacturer")),
):
    """Returns ``{igi_certificates, pending_igi_certificates}``.

    Visibility mirrors the CAD pipeline:
    * **admin / associate** see everything
    * **manufacturer** sees live + only their own pending submissions
    """
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    live = order.get("igi_certificates") or []
    pending_all = order.get("pending_igi_certificates") or []
    if user["role"] in ("admin", "associate"):
        pending = pending_all
    elif user["role"] == "manufacturer":
        pending = [p for p in pending_all if p.get("uploaded_by") == user["id"]]
    else:
        pending = []
    return {"igi_certificates": live, "pending_igi_certificates": pending}


@router.post("/orders/{order_id}/igi-certificates")
async def add_igi_certificate(
    order_id: str,
    body: IgiCertFilePayload,
    request: Request,
    user=Depends(require_roles("admin", "associate", "manufacturer")),
):
    """Attach an IGI certificate to the order. Admin/Associate uploads land
    directly in ``igi_certificates`` (live); Manufacturer uploads land in
    ``pending_igi_certificates`` until promoted by an admin/associate."""
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
    target_field = (
        "igi_certificates"
        if user["role"] in ("admin", "associate")
        else "pending_igi_certificates"
    )
    await db.orders.update_one(
        {"id": order_id},
        {"$push": {target_field: entry}},
    )
    await record_event(
        db,
        request,
        f"order.igi_certificate.{'added' if target_field == 'igi_certificates' else 'submitted'}",
        user=user,
        meta={
            "order_id": order_id,
            "file_name": entry["name"],
            "format": entry["format"],
            "bytes": entry["bytes"],
            "queue": target_field,
        },
    )
    request.state.activity_logged = True
    return {"file": entry, "queue": target_field}


@router.post("/orders/{order_id}/igi-certificates/{file_id}/approve")
async def approve_igi_certificate(
    order_id: str,
    file_id: str,
    request: Request,
    user=Depends(require_roles("admin", "associate")),
):
    """Promote a pending IGI certificate to live. Admin or associate."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    pending = order.get("pending_igi_certificates") or []
    target = next((p for p in pending if p.get("id") == file_id), None)
    if not target:
        raise HTTPException(
            status_code=404, detail="Pending IGI certificate not found"
        )
    promoted = {
        **target,
        "approved_at": now_china_iso(),
        "approved_by": user.get("id"),
        "approved_by_email": user.get("email"),
    }
    await db.orders.update_one(
        {"id": order_id},
        {
            "$pull": {"pending_igi_certificates": {"id": file_id}},
            "$push": {"igi_certificates": promoted},
        },
    )
    await record_event(
        db,
        request,
        "order.igi_certificate.approved",
        user=user,
        meta={
            "order_id": order_id,
            "file_id": file_id,
            "file_name": target.get("name"),
        },
    )
    request.state.activity_logged = True
    return {"ok": True, "file": promoted}


@router.post("/orders/{order_id}/igi-certificates/{file_id}/reject")
async def reject_igi_certificate(
    order_id: str,
    file_id: str,
    request: Request,
    user=Depends(require_roles("admin", "associate")),
):
    """Reject a pending IGI certificate. Removes it from the pending queue."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    pending = order.get("pending_igi_certificates") or []
    target = next((p for p in pending if p.get("id") == file_id), None)
    if not target:
        raise HTTPException(
            status_code=404, detail="Pending IGI certificate not found"
        )
    await db.orders.update_one(
        {"id": order_id},
        {"$pull": {"pending_igi_certificates": {"id": file_id}}},
    )
    await record_event(
        db,
        request,
        "order.igi_certificate.rejected",
        user=user,
        meta={
            "order_id": order_id,
            "file_id": file_id,
            "file_name": target.get("name"),
        },
    )
    request.state.activity_logged = True
    return {"ok": True}


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


@router.post("/orders/{order_id}/igi-certificates/email")
async def email_igi_certificates(
    order_id: str,
    body: FileEmailPayload,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    """Forward a selection of IGI certificates via Resend (Cloudinary links)."""
    from _email import send_files_email

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
        raise HTTPException(
            status_code=400, detail="Maximum 50 recipients per email."
        )

    all_files = order.get("igi_certificates") or []
    if not all_files:
        raise HTTPException(
            status_code=400, detail="This commission has no IGI certificates."
        )
    if body.file_ids:
        selected = [f for f in all_files if f.get("id") in set(body.file_ids)]
    else:
        selected = list(all_files)
    if not selected:
        raise HTTPException(
            status_code=400, detail="None of the selected certificates were found.",
        )

    try:
        provider_response = send_files_email(
            kind="igi",
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
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Email provider error: {exc}"
        ) from exc

    await record_event(
        db,
        request,
        "order.igi_certificate.emailed",
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
