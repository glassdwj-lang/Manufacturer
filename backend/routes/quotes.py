"""Quotation module — the internal cost-and-margin calculator used
by the atelier to produce a quote for a commission.

v1 (this file) captures every field in the "S.Co Associates" quote
template as a single first-class Pydantic model, exposes CRUD +
compute endpoints for admins, and stores each quote as a document in
the ``quotes`` collection.

All numeric totals + margins are computed server-side inside
:pyfunc:`compute_totals` so the frontend never has to trust its own
arithmetic. Currency is AUD for the atelier-facing totals; some
inputs (ring cost, box, freight) can be captured in USD and are
converted with the ``usd_to_aud_rate`` stored on the quote.

Field-level access control (manufacturer sees only certain fields) is
NOT enforced yet — the admin form has the full field set per the
user's request; role-based masking will be layered on top later once
they confirm which fields are manufacturer-editable.

Endpoints (all under ``/api/quotes``):

* ``POST   /``               (admin) create
* ``GET    /``               (admin) list
* ``GET    /{id}``           (admin) fetch a quote
* ``PATCH  /{id}``           (admin) update inputs — totals recomputed
* ``DELETE /{id}``           (admin) soft-delete
* ``POST   /compute``        (admin) preview totals without persisting
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from deps import db, get_current_user, require_roles
from routes.fx import get_metal_snapshot, get_usd_aud_snapshot

router = APIRouter()


# ----------------------------------------------------------------------
# Schemas
# ----------------------------------------------------------------------
class DiscountTier(BaseModel):
    """One row of the discount / commission-payout matrix.

    ``discount_pct`` is applied to the retail sell price to derive the
    tier's sell price, then the payout figure is derived from the
    remaining margin. Both figures are recomputed server-side.
    """

    label: Optional[str] = None
    discount_pct: float = 0.0
    # Computed:
    sell_ex_gst: Optional[float] = None
    margin_left: Optional[float] = None
    payout_figure_usd: Optional[float] = None


class QuoteInputs(BaseModel):
    """Every input cell from the S.Co quote template. Groupings match
    the spreadsheet's top-to-bottom flow for easy audit."""

    # --- Product spec + main-piece USD costs ---------------------------
    piece_description: Optional[str] = Field(
        default=None,
        description="Free-form piece descriptor (e.g. 'Ring - OV 4ct & 18k white gold')",
    )
    metal_spec: Optional[str] = None
    stone_spec: Optional[str] = None
    ring_cost_usd: float = 0.0
    includes_hidden_halo_pave: bool = False
    hidden_halo_pave_cost_usd: float = 0.0
    extra_cut_cost_usd: float = 0.0
    cad_rendering_cost_usd: float = 0.0
    provenance_cost_usd: float = 0.0
    certification_cost_usd: float = 0.0
    box_packaging_cost_usd: float = 0.0
    air_freight_cost_usd: float = 0.0

    # --- Currency conversion ------------------------------------------
    # ``usd_to_aud_rate`` is the *effective* rate applied to USD costs.
    # It defaults to the live mid-market rate + optional bank buffer,
    # but the admin can override manually. The two optional fields below
    # are stored purely for audit / provenance of that effective rate.
    usd_to_aud_rate: float = 1.50
    fx_live_rate: Optional[float] = None
    fx_adjustment_pct: Optional[float] = 0.0

    # --- Post-conversion AUD costs ------------------------------------
    custom_clearance_aud: float = 0.0
    australian_delivery_aud: float = 0.0
    intl_transaction_fees_aud: float = 0.0
    duty_or_chafta_aud: float = 0.0
    # Optional %-mode overrides for the two flexible fields.  When
    # ``*_mode == "percent"`` the compute engine ignores the ``*_aud``
    # dollar figure and instead derives it from ``*_pct * base``, where
    # ``base`` is one of:
    #   * ``usd_x_fx``      — Total USD costs × effective FX rate
    #   * ``cost_pre_fees`` — USD×FX + customs + AU delivery (i.e. the
    #     cost price *before* the two flexible fees are added — avoids
    #     circular dependency)
    # Existing quotes without these fields default to ``amount`` mode
    # and keep working unchanged.
    intl_transaction_fees_mode: str = "amount"     # amount | percent
    intl_transaction_fees_pct: float = 0.0
    intl_transaction_fees_base: str = "usd_x_fx"
    duty_or_chafta_mode: str = "amount"
    duty_or_chafta_pct: float = 0.0
    duty_or_chafta_base: str = "usd_x_fx"

    # --- Margin / GST -------------------------------------------------
    markup_pct: float = 0.0
    gst_pct: float = 10.0

    # --- Commission tiers ---------------------------------------------
    discount_tiers: List[DiscountTier] = Field(default_factory=list)


class QuoteTotals(BaseModel):
    """Server-computed subtotals + final numbers, all in AUD unless
    the field name says otherwise."""

    total_usd_costs: float
    total_cost_aud: float
    cost_price_aud: float
    markup_amount_aud: float
    retail_sell_price_ex_gst_aud: float
    gst_amount_aud: float
    total_sell_price_inc_gst_aud: float
    gross_profit_margin_aud: float
    gross_profit_margin_pct: float
    discount_tiers: List[DiscountTier]


class Quote(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    order_id: Optional[str] = None
    order_ref: Optional[str] = None
    jewelry_name: Optional[str] = None
    status: str = "draft"  # draft | ready | sent
    inputs: QuoteInputs
    totals: Optional[QuoteTotals] = None
    # Historical snapshot of metal spot prices (USD/g for 10k/14k/18k
    # gold, Pt950, S925) captured at the moment the quote was created.
    # Locked forever — never updated after quote creation.
    metal_spot_snapshot: Optional[dict] = None
    # Historical snapshot of the live USD→AUD mid-market rate at the
    # moment the quote was created. Provides an audit trail so an admin
    # can see what the market was doing 3+ months later and compare it
    # to the ``inputs.usd_to_aud_rate`` (which is the effective rate the
    # atelier actually used, incl. bank buffer).
    fx_snapshot: Optional[dict] = None
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    deleted: bool = False


class QuoteCreatePayload(BaseModel):
    order_id: Optional[str] = None
    inputs: QuoteInputs


class QuotePatchPayload(BaseModel):
    inputs: Optional[QuoteInputs] = None
    status: Optional[str] = None


# ----------------------------------------------------------------------
# Compute engine
# ----------------------------------------------------------------------
def compute_totals(inputs: QuoteInputs) -> QuoteTotals:
    """Deterministic calculator. Mirrors the spreadsheet's cascade:

    1. Sum every USD line into ``total_usd_costs``.
    2. Convert to AUD at ``usd_to_aud_rate`` → ``total_cost_aud``.
    3. Add the AUD-native ancillary costs → ``cost_price_aud``.
    4. Apply markup → ``retail_sell_price_ex_gst_aud``.
    5. Apply GST → ``total_sell_price_inc_gst_aud``.
    6. Compute margin against ``cost_price_aud``.
    7. Recompute every discount tier.
    """
    usd = (
        inputs.ring_cost_usd
        + (inputs.hidden_halo_pave_cost_usd if inputs.includes_hidden_halo_pave else 0.0)
        + inputs.extra_cut_cost_usd
        + inputs.cad_rendering_cost_usd
        + inputs.provenance_cost_usd
        + inputs.certification_cost_usd
        + inputs.box_packaging_cost_usd
        + inputs.air_freight_cost_usd
    )
    rate = inputs.usd_to_aud_rate or 1.0
    total_cost_aud = usd * rate
    # Base for %-mode flexible fees. ``cost_pre_fees`` deliberately
    # excludes intl_txn + duty so those two never depend on themselves.
    cost_pre_fees = (
        total_cost_aud
        + inputs.custom_clearance_aud
        + inputs.australian_delivery_aud
    )
    _BASE_MAP = {
        "usd_x_fx": total_cost_aud,
        "cost_pre_fees": cost_pre_fees,
    }

    def _resolve(mode: str, pct: float, amount_aud: float, base_key: str) -> float:
        """Return the AUD amount honoring the mode/base config."""
        if mode == "percent":
            base = _BASE_MAP.get(base_key, total_cost_aud)
            return base * (pct / 100.0)
        return amount_aud

    intl_txn_aud = _resolve(
        inputs.intl_transaction_fees_mode,
        inputs.intl_transaction_fees_pct,
        inputs.intl_transaction_fees_aud,
        inputs.intl_transaction_fees_base,
    )
    duty_aud = _resolve(
        inputs.duty_or_chafta_mode,
        inputs.duty_or_chafta_pct,
        inputs.duty_or_chafta_aud,
        inputs.duty_or_chafta_base,
    )

    cost_price = (
        total_cost_aud
        + inputs.custom_clearance_aud
        + inputs.australian_delivery_aud
        + intl_txn_aud
        + duty_aud
    )
    markup_amount = cost_price * (inputs.markup_pct / 100.0)
    retail_ex_gst = cost_price + markup_amount
    gst_amount = retail_ex_gst * (inputs.gst_pct / 100.0)
    total_inc_gst = retail_ex_gst + gst_amount
    gross_margin = retail_ex_gst - cost_price
    gross_margin_pct = (gross_margin / retail_ex_gst * 100.0) if retail_ex_gst else 0.0

    # Recompute each discount tier.
    tiers: List[DiscountTier] = []
    for tier in inputs.discount_tiers:
        # Sell price after discount, ex GST — sits below retail_ex_gst.
        sell_ex_gst = retail_ex_gst * (1.0 - tier.discount_pct / 100.0)
        margin_left = sell_ex_gst - cost_price
        # Convert margin back to USD for parity with the payout column
        # in the template.
        payout_usd = margin_left / rate if rate else 0.0
        tiers.append(
            DiscountTier(
                label=tier.label,
                discount_pct=tier.discount_pct,
                sell_ex_gst=round(sell_ex_gst, 2),
                margin_left=round(margin_left, 2),
                payout_figure_usd=round(payout_usd, 2),
            )
        )

    return QuoteTotals(
        total_usd_costs=round(usd, 2),
        total_cost_aud=round(total_cost_aud, 2),
        cost_price_aud=round(cost_price, 2),
        markup_amount_aud=round(markup_amount, 2),
        retail_sell_price_ex_gst_aud=round(retail_ex_gst, 2),
        gst_amount_aud=round(gst_amount, 2),
        total_sell_price_inc_gst_aud=round(total_inc_gst, 2),
        gross_profit_margin_aud=round(gross_margin, 2),
        gross_profit_margin_pct=round(gross_margin_pct, 2),
        discount_tiers=tiers,
    )


# ----------------------------------------------------------------------
# CRUD endpoints
# ----------------------------------------------------------------------
@router.post("/quotes", summary="Create a new quote (admin only)")
async def create_quote(
    body: QuoteCreatePayload,
    user=Depends(require_roles("admin")),
):
    inputs = body.inputs
    order_ref = None
    jewelry_name = None
    if body.order_id:
        order = await db.orders.find_one(
            {"id": body.order_id}, {"_id": 0, "order_ref": 1, "jewelry_name": 1}
        )
        if order:
            order_ref = order.get("order_ref")
            jewelry_name = order.get("jewelry_name")
    quote = Quote(
        order_id=body.order_id,
        order_ref=order_ref,
        jewelry_name=jewelry_name,
        inputs=inputs,
        totals=compute_totals(inputs),
        created_by=user.get("id"),
    )
    doc = quote.model_dump()
    await db.quotes.insert_one(doc)
    doc.pop("_id", None)
    return doc


@router.get("/quotes", summary="List quotes (admin only)")
async def list_quotes(user=Depends(require_roles("admin"))):
    cursor = db.quotes.find(
        {"deleted": {"$ne": True}}, {"_id": 0}
    ).sort("updated_at", -1)
    return [q async for q in cursor]


@router.post(
    "/quotes/compute",
    summary="Preview totals for a set of inputs without persisting.",
)
async def preview_totals(
    inputs: QuoteInputs,
    user=Depends(require_roles("admin")),
):
    return compute_totals(inputs).model_dump()


@router.get("/quotes/{quote_id}", summary="Fetch a quote (admin only)")
async def get_quote(
    quote_id: str,
    user=Depends(require_roles("admin")),
):
    q = await db.quotes.find_one({"id": quote_id, "deleted": {"$ne": True}}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    # Lazy backfill for pre-metal-spot legacy quotes: if the snapshot is
    # missing, capture today's rates and persist so the value is stable
    # from this point on.
    if q.get("metal_spot_snapshot") is None:
        try:
            snap = await get_metal_snapshot()
            snap = {k: v for k, v in snap.items() if k != "pair"}
            await db.quotes.update_one(
                {"id": quote_id}, {"$set": {"metal_spot_snapshot": snap}}
            )
            q["metal_spot_snapshot"] = snap
        except Exception:  # noqa: BLE001 — leave null if upstream is down
            pass
    # Same lazy backfill for the USD→AUD rate snapshot.
    if q.get("fx_snapshot") is None:
        try:
            snap = await get_usd_aud_snapshot()
            snap = {k: v for k, v in snap.items() if k != "pair"}
            await db.quotes.update_one(
                {"id": quote_id}, {"$set": {"fx_snapshot": snap}}
            )
            q["fx_snapshot"] = snap
        except Exception:  # noqa: BLE001
            pass
    return q


@router.patch(
    "/quotes/{quote_id}",
    summary="Update a quote's inputs (totals recomputed) or status.",
)
async def patch_quote(
    quote_id: str,
    body: QuotePatchPayload,
    user=Depends(require_roles("admin")),
):
    q = await db.quotes.find_one({"id": quote_id, "deleted": {"$ne": True}}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    patch: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.inputs is not None:
        totals = compute_totals(body.inputs)
        patch["inputs"] = body.inputs.model_dump()
        patch["totals"] = totals.model_dump()
    if body.status is not None:
        if body.status not in ("draft", "ready", "sent"):
            raise HTTPException(
                status_code=400,
                detail="status must be one of draft | ready | sent",
            )
        patch["status"] = body.status
    await db.quotes.update_one({"id": quote_id}, {"$set": patch})
    q.update(patch)
    return q


@router.delete("/quotes/{quote_id}", summary="Soft-delete a quote.")
async def delete_quote(
    quote_id: str,
    user=Depends(require_roles("admin")),
):
    res = await db.quotes.update_one(
        {"id": quote_id, "deleted": {"$ne": True}},
        {
            "$set": {
                "deleted": True,
                "deleted_at": datetime.now(timezone.utc).isoformat(),
                "deleted_by": user.get("id"),
            }
        },
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Quote not found")
    return {"ok": True}
