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
