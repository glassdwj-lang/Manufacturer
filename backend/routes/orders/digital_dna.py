"""Digital DNA PDF: build & serve the per-order traceability certificate."""
from __future__ import annotations

from ._shared import (
    APIRouter,
    Depends,
    HTTPException,
    Response,
    build_digital_dna_pdf,
    db,
    ensure_translations_for_viewer,
    get_current_user,
    progress_summary,
)

router = APIRouter(tags=["orders"])


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
