"""Customs sub-document: textual fields + airway-bill / customs files + email."""
from __future__ import annotations

from ._shared import (
    APIRouter,
    CustomsDocs,
    CustomsFilePayload,
    Depends,
    FileEmailPayload,
    HTTPException,
    Request,
    customs_kind_field,
    db,
    now_china_iso,
    record_event,
    require_roles,
    sanitize_recipients,
    strip_order_for_role,
    uuid,
)

router = APIRouter(tags=["orders"])


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
    field = customs_kind_field(kind)
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
    field = customs_kind_field(kind)
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


@router.post("/orders/{order_id}/customs/files/{kind}/email")
async def email_customs_files(
    order_id: str,
    kind: str,
    body: FileEmailPayload,
    request: Request,
    user=Depends(require_roles("admin", "manufacturer")),
):
    """Forward a selection of customs / airway-bill files via Resend."""
    from _email import send_files_email  # local import: lazy + cycle-safe

    field = customs_kind_field(kind)
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

    all_files = (order.get("customs", {}) or {}).get(field) or []
    pretty = "airway-bill" if kind == "airway-bill" else "customs"
    if not all_files:
        raise HTTPException(
            status_code=400,
            detail=f"This commission has no {pretty} files.",
        )
    if body.file_ids:
        selected = [f for f in all_files if f.get("id") in set(body.file_ids)]
    else:
        selected = list(all_files)
    if not selected:
        raise HTTPException(
            status_code=400,
            detail=f"None of the selected {pretty} files were found.",
        )

    email_kind = "airway_bill" if kind == "airway-bill" else "customs"
    try:
        provider_response = send_files_email(
            kind=email_kind,
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
        f"order.customs.{email_kind}.emailed",
        user=user,
        meta={
            "order_id": order_id,
            "kind": kind,
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
