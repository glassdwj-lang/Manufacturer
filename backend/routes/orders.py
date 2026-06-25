"""Order routes: list/get/create, complete step, forward step, customs, Digital DNA."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from _digital_dna import build_digital_dna_pdf
from _translation import language_for_country, translate as translate_text
from deps import db, get_current_user, require_roles
from helpers import (
    list_strip,
    now_china_iso,
    progress_summary,
    strip_order_for_role,
)
from models import CustomsDocs, ForwardUpdate, OrderCreate, StepUpdate
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
        "manufacturer_alias": manufacturer.get("alias") or "Somnio.Co Atelier",
        "associate_id": associate_id,
        "jewelry_name": data.jewelry_name,
        "sku": data.sku or "",
        "description": data.description or "",
        "status": "in_progress",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_at_china": now_china_iso(),
        "steps": build_initial_steps(),
        "customs": {"airway_bill": None, "customs_document": None, "notes": ""},
    }
    await db.orders.insert_one(order)
    return strip_order_for_role(order, user)


@router.get("/orders")
async def list_orders(user=Depends(get_current_user)):
    q: dict = {}
    if user["role"] == "manufacturer":
        q["manufacturer_id"] = user["id"]
    elif user["role"] == "associate":
        q["associate_id"] = user["id"]
    elif user["role"] == "client":
        q["client_id"] = user["id"]
    orders = (
        await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    )
    return [list_strip(o, user) for o in orders]


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

    update_fields = {
        "steps.$.completed": True,
        "steps.$.completed_at_china": china_iso,
        "steps.$.completed_at_utc": utc_iso,
        "steps.$.notes": body.notes or "",
        "steps.$.notes_translated": translated_note,
        "steps.$.notes_target_lang": target_lang if translated_note else "",
        "steps.$.photos": body.photos or [],
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


@router.put("/orders/{order_id}/customs")
async def update_customs(
    order_id: str, body: CustomsDocs, user=Depends(require_roles("admin"))
):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    customs = order.get("customs", {})
    if body.airway_bill is not None:
        customs["airway_bill"] = body.airway_bill
    if body.customs_document is not None:
        customs["customs_document"] = body.customs_document
    if body.notes is not None:
        customs["notes"] = body.notes
    customs["updated_at_china"] = now_china_iso()
    await db.orders.update_one({"id": order_id}, {"$set": {"customs": customs}})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return strip_order_for_role(updated, user)


@router.get("/orders/{order_id}/customs")
async def get_customs(order_id: str, user=Depends(require_roles("admin"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order.get("customs", {})


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
        order.get("manufacturer_alias") or "Somnio.Co Atelier"
    )
    masked["progress"] = progress_summary(order["steps"])

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
