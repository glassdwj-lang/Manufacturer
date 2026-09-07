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

import asyncio
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field
from pymongo import ReturnDocument

from deps import db, get_current_user, require_roles
from routes.competitors import run_comparison_background
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
    # Atomic metal attributes — mirror the stone-atoms pattern so the
    # Product Spec row can render two aligned inputs (Type | Weight).
    metal_type: Optional[str] = None         # e.g. "18K White Gold"
    metal_weight_g: Optional[float] = None   # grams
    stone_spec: Optional[str] = None
    # Atomic stone attributes — enable structured competitor matching &
    # feed the composed ``stone_spec`` display string on the client quote.
    diamond_type: Optional[str] = None       # "lab" | "natural"
    diamond_carat: Optional[float] = None
    diamond_shape: Optional[str] = None      # e.g. Round / Oval / Emerald
    diamond_color: Optional[str] = None      # e.g. D / E / F
    diamond_clarity: Optional[str] = None    # e.g. VVS1 / VS2 / SI1
    ring_cost_usd: float = 0.0
    includes_hidden_halo_pave: bool = False
    hidden_halo_pave_cost_usd: float = 0.0
    extra_cut_cost_usd: float = 0.0
    # Standard atelier defaults — cover the typical CAD / provenance /
    # cert / packaging / freight baseline on every new quote. Admin can
    # override per quote.
    cad_rendering_cost_usd: float = 45.0
    provenance_cost_usd: float = 35.0
    certification_cost_usd: float = 80.0
    box_packaging_cost_usd: float = 35.0
    air_freight_cost_usd: float = 60.0
    # Bulk-shipment support for air freight — admin can enter a total
    # bulk cost + a divisor (number of pieces in the shipment); the
    # frontend auto-populates ``air_freight_cost_usd`` = bulk / divisor.
    # Both persisted so the calculation is auditable and re-editable.
    # Defaults: bulk = $60 (matches the flat per-unit baseline), divisor
    # = 0 (i.e. bulk-split OFF; admin sets a real divisor when doing a
    # multi-piece shipment).
    air_freight_bulk_cost_usd: Optional[float] = 60.0
    air_freight_divisor: Optional[float] = 0.0
    # One-shot backfill flag — see get_quote's ``defaults_seeded_v3``
    # block. Declared here so it survives Pydantic strict-field pruning
    # on every PATCH (otherwise re-seeding would trigger forever and
    # admin could never persist an explicit $0 on a defaulted field).
    defaults_seeded_v2: Optional[bool] = None
    defaults_seeded_v3: Optional[bool] = None

    # --- Currency conversion ------------------------------------------
    # ``usd_to_aud_rate`` is the *effective* rate applied to USD costs.
    # It defaults to the live mid-market rate + optional bank buffer,
    # but the admin can override manually. The two optional fields below
    # are stored purely for audit / provenance of that effective rate.
    usd_to_aud_rate: float = 1.50
    fx_live_rate: Optional[float] = None
    # Default bank buffer of 5% on top of live FX. Overridable per-quote.
    fx_adjustment_pct: Optional[float] = 5.0

    # --- Post-conversion AUD costs ------------------------------------
    # Standard atelier defaults so a fresh quote always includes the
    # usual customs + AU-delivery baseline. Admin can override per quote.
    custom_clearance_aud: float = 120.0
    australian_delivery_aud: float = 100.0
    # Bulk-shipment support for customs clearance — mirrors the air
    # freight pattern: total customs cost ÷ pieces in shipment = per-
    # unit customs, which flows into ``custom_clearance_aud``.
    # Defaults: bulk = $120 (matches the flat per-unit baseline),
    # divisor = 0 (bulk-split OFF; admin sets a real divisor when doing
    # a multi-piece shipment).
    custom_clearance_bulk_aud: Optional[float] = 120.0
    custom_clearance_divisor: Optional[float] = 0.0
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
    # Defaults are percent-mode at 5% each — the standard atelier
    # baseline; admin can flip to $-mode at any time.
    intl_transaction_fees_mode: str = "percent"    # amount | percent
    intl_transaction_fees_pct: float = 5.0
    intl_transaction_fees_base: str = "usd_x_fx"
    duty_or_chafta_mode: str = "percent"
    duty_or_chafta_pct: float = 5.0
    duty_or_chafta_base: str = "usd_x_fx"

    # --- Margin / GST -------------------------------------------------
    # Markup can be entered as a % of ``cost_price_aud`` (Total AUD
    # amount) or as a fixed $ AUD amount. When ``markup_mode == "amount"``
    # the compute engine ignores ``markup_pct`` and uses ``markup_amount_aud``
    # directly (deriving ``markup_pct`` for display).
    markup_pct: float = 0.0
    markup_mode: str = "percent"        # percent | amount
    markup_amount_aud: float = 0.0      # only read when mode == "amount"
    gst_pct: float = 10.0
    gst_mode: str = "percent"           # percent | amount
    gst_amount_aud: float = 0.0         # only read when mode == "amount"
    # --- Margin distribution ------------------------------------------
    # Splits the ``gross_profit_margin_aud`` (i.e. the markup portion,
    # NOT retail or gross sale) across four buckets. All four should
    # sum to 100 % (validated visually in the UI, non-blocking).
    distribution_somnio_pct: float = 45.0
    distribution_associate_pct: float = 45.0
    distribution_adv_marketing_pct: float = 5.0
    distribution_tech_maintenance_pct: float = 5.0

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
    # --- Freelance mode ------------------------------------------------
    # When ``is_freelance`` is True the quote uses the independent
    # ``dwj-XXXX`` serial namespace and is *not* tied to an RFQ / brand
    # broadcast. The counter lives on ``counters/freelance_quote_seq``
    # and is completely disjoint from the SC / SA / SB piece-type flow.
    is_freelance: bool = False
    freelance_serial: Optional[str] = None       # e.g. "dwj-0001"
    freelance_seq: Optional[int] = None          # numeric counter value
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
    # Client-facing display title. Admin can override the auto-derived
    # name (from RFQ prefs or piece description) at any time. Empty
    # string clears it and falls back to derivation on the frontend.
    jewelry_name: Optional[str] = None


class FreelanceQuoteCreatePayload(BaseModel):
    """Freeform payload for a freelance-mode quote (dwj-XXXX serial).
    All fields optional so the admin can spin up a shell and fill it in."""

    piece_description: Optional[str] = None
    jewelry_name: Optional[str] = None
    inputs: Optional[QuoteInputs] = None


async def _next_freelance_seq() -> int:
    """Atomically allocate the next freelance serial counter value.

    Uses a single upserting ``find_one_and_update`` on
    ``counters/freelance_quote_seq`` so concurrent creates never collide.
    """
    doc = await db.counters.find_one_and_update(
        {"_id": "freelance_quote_seq"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return int(doc["value"])


def _freelance_serial(seq: int) -> str:
    """Format ``dwj-0001`` — 4-digit zero-pad, room for 9,999 quotes.
    Widens to 5 digits at 10,000+ so the format never truncates."""
    if seq < 10000:
        return f"dwj-{seq:04d}"
    return f"dwj-{seq}"


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
    markup_amount = (
        inputs.markup_amount_aud
        if inputs.markup_mode == "amount"
        else cost_price * (inputs.markup_pct / 100.0)
    )
    retail_ex_gst = cost_price + markup_amount
    gst_amount = (
        inputs.gst_amount_aud
        if inputs.gst_mode == "amount"
        else retail_ex_gst * (inputs.gst_pct / 100.0)
    )
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
    # Fire-and-forget competitor comparison sweep. Runs in background so
    # the API returns instantly; results appear in the Market Anchor
    # panel over the next 30-90s as each site resolves.
    asyncio.create_task(run_comparison_background(doc["id"]))
    return doc


@router.get("/quotes", summary="List quotes (admin only)")
async def list_quotes(
    freelance: Optional[str] = Query(
        None,
        description="Filter: 'true' → freelance only, 'false' → brand only, omit → all",
    ),
    user=Depends(require_roles("admin")),
):
    q: dict = {"deleted": {"$ne": True}}
    if freelance == "true":
        q["is_freelance"] = True
    elif freelance == "false":
        # Include legacy quotes (missing the field) alongside explicitly
        # non-freelance ones — anything not marked True is "brand".
        q["$or"] = [{"is_freelance": {"$ne": True}}, {"is_freelance": {"$exists": False}}]
    cursor = db.quotes.find(q, {"_id": 0}).sort("updated_at", -1)
    return [q async for q in cursor]


# ----------------------------------------------------------------------
# Freelance quote — spins up a dwj-XXXX serialised quote OUTSIDE the
# SC/SA/SB brand namespace. No RFQ / broadcast linkage. Counter lives
# in ``counters/freelance_quote_seq`` and is fully independent.
# ----------------------------------------------------------------------
@router.post(
    "/quotes/freelance",
    summary="Create a freelance-mode quote (dwj-XXXX serial, no RFQ link)",
)
async def create_freelance_quote(
    body: FreelanceQuoteCreatePayload,
    user=Depends(require_roles("admin")),
):
    # Allocate the next freelance serial atomically.
    seq = await _next_freelance_seq()
    serial = _freelance_serial(seq)

    inputs = body.inputs or QuoteInputs()
    # Prefill the piece description on the inputs so the quote card
    # shows a meaningful label immediately.
    if body.piece_description and not inputs.piece_description:
        inputs = inputs.model_copy(update={"piece_description": body.piece_description})

    quote = Quote(
        jewelry_name=body.jewelry_name or body.piece_description,
        inputs=inputs,
        totals=compute_totals(inputs),
        created_by=user.get("id"),
        is_freelance=True,
        freelance_serial=serial,
        freelance_seq=seq,
    )
    doc = quote.model_dump()
    await db.quotes.insert_one(doc)
    doc.pop("_id", None)
    return doc


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

    # --- One-shot backfill of atelier defaults --------------------------
    # Applies the standard baseline (bank buffer 5 %, intl-fees 5 %,
    # duty 5 %, customs $120, AU delivery $100, GST 10 %, markup 0 %,
    # CAD $45, provenance $35, cert $80, packaging $35, air freight $60)
    # ONLY on quotes that were created before this default set existed
    # AND whose current value is 0 / None / missing. Guarded by the
    # ``defaults_seeded_v2`` flag so subsequent admin edits (including
    # explicit zeros) are never overwritten on re-open.
    inputs = q.get("inputs") or {}
    if not inputs.get("defaults_seeded_v3"):
        # (field, default) — only applied when the current value is
        # falsy (0, None, missing). Modes are seeded to "percent" so the
        # % baseline actually takes effect on legacy quotes.
        seeds: dict = {}
        # --- AUD-side pass-through fees ---
        if not inputs.get("fx_adjustment_pct"):
            seeds["fx_adjustment_pct"] = 5.0
        if not inputs.get("custom_clearance_aud"):
            seeds["custom_clearance_aud"] = 120.0
        if not inputs.get("australian_delivery_aud"):
            seeds["australian_delivery_aud"] = 100.0
        if not inputs.get("intl_transaction_fees_pct") and \
                not inputs.get("intl_transaction_fees_aud"):
            seeds["intl_transaction_fees_pct"] = 5.0
            seeds["intl_transaction_fees_mode"] = "percent"
        if not inputs.get("duty_or_chafta_pct") and \
                not inputs.get("duty_or_chafta_aud"):
            seeds["duty_or_chafta_pct"] = 5.0
            seeds["duty_or_chafta_mode"] = "percent"
        if not inputs.get("gst_pct"):
            seeds["gst_pct"] = 10.0
            seeds["gst_mode"] = "percent"
        # Markup default is 0 — set the mode + flag so UI renders %.
        seeds["markup_mode"] = inputs.get("markup_mode") or "percent"
        # --- USD-side ancillary costs ---
        if not inputs.get("cad_rendering_cost_usd"):
            seeds["cad_rendering_cost_usd"] = 45.0
        if not inputs.get("provenance_cost_usd"):
            seeds["provenance_cost_usd"] = 35.0
        if not inputs.get("certification_cost_usd"):
            seeds["certification_cost_usd"] = 80.0
        if not inputs.get("box_packaging_cost_usd"):
            seeds["box_packaging_cost_usd"] = 35.0
        if not inputs.get("air_freight_cost_usd"):
            seeds["air_freight_cost_usd"] = 60.0
        # Air freight bulk / divisor — seeded even if the per-unit is
        # already set, because these atomic fields are new. Only seeds
        # where truly missing (None) — an admin who explicitly zeroed
        # the divisor (bulk-split OFF) keeps their choice.
        if inputs.get("air_freight_bulk_cost_usd") is None:
            seeds["air_freight_bulk_cost_usd"] = 60.0
        if inputs.get("air_freight_divisor") is None:
            seeds["air_freight_divisor"] = 0.0
        # Same bulk/divisor pattern for customs clearance.
        if inputs.get("custom_clearance_bulk_aud") is None:
            seeds["custom_clearance_bulk_aud"] = 120.0
        if inputs.get("custom_clearance_divisor") is None:
            seeds["custom_clearance_divisor"] = 0.0
        # Retire the v1 flag and stamp v3 — future default expansions
        # bump the version so existing quotes catch up cleanly.
        seeds["defaults_seeded_v3"] = True
        seeds.pop("defaults_seeded_v2", None)
        if seeds:
            mongo_set = {f"inputs.{k}": v for k, v in seeds.items()}
            await db.quotes.update_one({"id": quote_id}, {"$set": mongo_set})
            inputs.update(seeds)
            q["inputs"] = inputs
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
    if body.jewelry_name is not None:
        # Empty string clears the override — frontend then falls back to
        # the piece description automatically.
        patch["jewelry_name"] = body.jewelry_name.strip() or None
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


# ---------------------------------------------------------------------
# Duplicate an existing quote — clones inputs + jewelry_name into a
# fresh draft. Preserves the linked order_id / RFQ context so cost
# tracking still ties back to the original commission. Freelance
# quotes get a NEW dwj- serial (never re-uses the source counter).
# ---------------------------------------------------------------------
@router.post(
    "/quotes/{quote_id}/duplicate",
    summary="Duplicate a quote — clones inputs into a fresh draft.",
)
async def duplicate_quote(
    quote_id: str,
    user=Depends(require_roles("admin")),
):
    src = await db.quotes.find_one(
        {"id": quote_id, "deleted": {"$ne": True}}, {"_id": 0}
    )
    if not src:
        raise HTTPException(status_code=404, detail="Quote not found")

    src_inputs = src.get("inputs") or {}
    try:
        cloned_inputs = QuoteInputs(**src_inputs)
    except Exception:
        # Legacy quotes may have extra / stale keys — start from a
        # blank slate then overlay the raw dict onto it.
        cloned_inputs = QuoteInputs()
        for k, v in src_inputs.items():
            if hasattr(cloned_inputs, k):
                setattr(cloned_inputs, k, v)

    freelance = bool(src.get("is_freelance"))
    freelance_serial = None
    freelance_seq = None
    if freelance:
        freelance_seq = await _next_freelance_seq()
        freelance_serial = _freelance_serial(freelance_seq)

    # Name for the clone: append "(copy)" so admin can tell them apart
    # while still keeping the source name visible for context.
    base_name = src.get("jewelry_name") or cloned_inputs.piece_description or ""
    cloned_name = f"{base_name} (copy)" if base_name else "Untitled (copy)"

    dup = Quote(
        order_id=src.get("order_id"),
        order_ref=src.get("order_ref"),
        jewelry_name=cloned_name,
        inputs=cloned_inputs,
        totals=compute_totals(cloned_inputs),
        created_by=user.get("id"),
        is_freelance=freelance,
        freelance_serial=freelance_serial,
        freelance_seq=freelance_seq,
        status="draft",
    )
    doc = dup.model_dump()
    await db.quotes.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ---------------------------------------------------------------------
# PDF export — compact atelier-branded quote artifact for archive /
# email. Deliberately not the full client-facing brochure — that's the
# Digital DNA certificate. This is the admin's internal audit trail.
# ---------------------------------------------------------------------
@router.get(
    "/quotes/{quote_id}/pdf",
    summary="Export a quote as a compact atelier-branded PDF.",
)
async def export_quote_pdf(
    quote_id: str,
    user=Depends(require_roles("admin")),
):
    from _quote_pdf import build_quote_pdf   # lazy import — cheap on server boot

    q = await db.quotes.find_one(
        {"id": quote_id, "deleted": {"$ne": True}}, {"_id": 0}
    )
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")

    pdf_bytes = build_quote_pdf(q)
    serial = (
        q.get("freelance_serial")
        or q.get("order_ref")
        or (q.get("id") or "")[:8]
    )
    filename = f"Somnio-Quote-{serial}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )




# ---------------------------------------------------------------------
# Stone-Spec prefill from the linked RFQ / display-card data
# ---------------------------------------------------------------------
@router.get(
    "/quotes/{quote_id}/stone-spec-prefill",
    summary="Suggest atomic metal + stone fields from the linked RFQ preferences + response",
)
async def stone_spec_prefill(
    quote_id: str,
    user=Depends(require_roles("admin")),
):
    """Returns the diamond_* + metal_* atoms derived from the linked
    RFQ's preference_snapshot + matching broadcast response.
    Non-destructive: the client decides whether to apply / overwrite.

    Shape:
      {"source": "rfq"|"none",
       "atoms": {diamond_type, diamond_carat, diamond_shape,
                 diamond_color, diamond_clarity,
                 metal_type, metal_weight_g},
       "composed_stone":  "lab diamond | 3ct | Round | D | VVS2",
       "composed_metal":  "18K White Gold, 6g"}
    """
    from routes.rfqs import (  # local import to avoid cycles
        _compose_metal_spec,
        _compose_stone_spec,
        _derive_metal_atoms,
        _derive_stone_atoms,
    )

    q = await db.quotes.find_one(
        {"id": quote_id, "deleted": {"$ne": True}}, {"_id": 0}
    )
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")

    rfq_id = q.get("rfq_id")
    if not rfq_id:
        # Freelance / manual quotes have no linked RFQ — return an empty
        # skeleton so the UI can gracefully disable the Pull button.
        return {"source": "none", "atoms": {},
                "composed_stone": "", "composed_metal": "",
                # Legacy alias kept for backward-compat with earlier client.
                "composed": ""}

    rfq = await db.rfqs.find_one(
        {"id": rfq_id, "deleted": {"$ne": True}}, {"_id": 0}
    )
    if not rfq:
        return {"source": "none", "atoms": {},
                "composed_stone": "", "composed_metal": "",
                "composed": ""}

    prefs = rfq.get("preference_snapshot") or {}
    resp: dict = {}
    if q.get("broadcast_id"):
        bc = next(
            (b for b in rfq.get("broadcasts", []) if b.get("id") == q["broadcast_id"]),
            None,
        )
        if bc:
            resp = bc.get("response") or {}

    stone_atoms = _derive_stone_atoms(prefs, resp)
    metal_atoms = _derive_metal_atoms(prefs, resp)
    composed_stone = _compose_stone_spec(stone_atoms)
    composed_metal = _compose_metal_spec(metal_atoms)
    return {
        "source": "rfq",
        "atoms": {**stone_atoms, **metal_atoms},
        "composed_stone": composed_stone,
        "composed_metal": composed_metal,
        # Legacy alias — earlier version returned just the stone string.
        "composed": composed_stone,
        "rfq_id": rfq_id,
    }
