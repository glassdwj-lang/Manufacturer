"""
Quote PDF exporter.

Renders a compact, atelier-branded PDF for a Somnio quote so the admin
can email / archive the quote outside the app. The layout is a single
page (A4) with:

    1. Header    — Somnio logo strip + quote serial (SMN- / dwj-)
    2. Piece     — piece_description, metal spec, stone spec
    3. Costs     — USD line items + AUD line items (post-FX)
    4. Totals    — retail ex-GST, GST, total inc-GST, margin
    5. Tiers     — any discount tiers with their derived sell price

Deliberately compact — a real client-facing quote will be a much
richer artifact (see the digital DNA PDF); this is the admin's
internal audit / archive artifact.
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Any, Dict, Optional

from reportlab.lib.colors import HexColor, black
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


# Palette mirrors the app so PDFs look coherent with the UI.
GOLD = HexColor("#B87333")
GOLD_DIM = HexColor("#8B7128")
BG_TINT = HexColor("#F7F5F1")
TEXT = HexColor("#111111")
SUB = HexColor("#555555")
MUTE = HexColor("#8A8A8A")
BORDER = HexColor("#DDDDDD")

PAGE_W, PAGE_H = A4
LEFT = 18 * mm
RIGHT = PAGE_W - 18 * mm
CONTENT_W = RIGHT - LEFT


def _fmt_money(value: Any, unit: str = "AUD", decimals: int = 2) -> str:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return "—"
    return f"{unit} {n:,.{decimals}f}"


def _fmt_pct(value: Any, decimals: int = 2) -> str:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return "—"
    return f"{n:.{decimals}f}%"


def _line(c: canvas.Canvas, y: float) -> None:
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.4)
    c.line(LEFT, y, RIGHT, y)


def _kv_row(
    c: canvas.Canvas,
    y: float,
    label: str,
    value: str,
    *,
    bold: bool = False,
    accent: bool = False,
    label_size: int = 9,
    value_size: int = 9,
) -> None:
    c.setFillColor(SUB if not accent else GOLD_DIM)
    c.setFont("Helvetica", label_size)
    c.drawString(LEFT, y, label)
    c.setFillColor(GOLD if accent else TEXT)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", value_size)
    c.drawRightString(RIGHT, y, value)


def _section_header(c: canvas.Canvas, y: float, title: str) -> float:
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(LEFT, y, title.upper())
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.6)
    c.line(LEFT, y - 3, RIGHT, y - 3)
    return y - 12


def build_quote_pdf(quote: Dict[str, Any]) -> bytes:
    """Build the quote PDF as a bytes payload."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Somnio Quote — {quote.get('freelance_serial') or quote.get('order_ref') or quote.get('id','')}")

    inputs = quote.get("inputs") or {}
    totals = quote.get("totals") or {}

    # --- 1. Header --------------------------------------------------------
    y = PAGE_H - 20 * mm
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(LEFT, y, "SOMNIO.CO")
    c.setFillColor(MUTE)
    c.setFont("Helvetica", 8)
    c.drawString(LEFT, y - 10, "ATELIER · QUOTE")
    # Right side: serial + date
    serial = (
        quote.get("freelance_serial")
        or quote.get("order_ref")
        or (quote.get("id") or "")[:8]
    )
    c.setFillColor(TEXT)
    c.setFont("Helvetica-Bold", 12)
    c.drawRightString(RIGHT, y, serial.upper() if serial else "QUOTE")
    c.setFillColor(MUTE)
    c.setFont("Helvetica", 8)
    printed_at = datetime.utcnow().strftime("%d %b %Y · %H:%M UTC")
    c.drawRightString(RIGHT, y - 10, printed_at)

    _line(c, y - 16)
    y = y - 26

    # --- 2. Piece spec ----------------------------------------------------
    y = _section_header(c, y, "Piece")
    piece = (inputs.get("piece_description") or quote.get("jewelry_name") or "—")
    metal = (inputs.get("metal_spec") or "")
    stone = (inputs.get("stone_spec") or "")

    c.setFillColor(TEXT)
    c.setFont("Helvetica-Bold", 11)
    # Wrap piece name to 2 lines if long
    max_chars = 60
    piece_line1 = piece[:max_chars]
    piece_line2 = piece[max_chars: max_chars * 2] if len(piece) > max_chars else ""
    c.drawString(LEFT, y, piece_line1)
    y -= 14
    if piece_line2:
        c.drawString(LEFT, y, piece_line2)
        y -= 14

    c.setFillColor(SUB)
    c.setFont("Helvetica", 9)
    if metal:
        c.drawString(LEFT, y, f"Metal: {metal}")
        y -= 11
    if stone:
        c.drawString(LEFT, y, f"Stone: {stone}")
        y -= 11
    if quote.get("status"):
        c.drawString(LEFT, y, f"Status: {quote['status'].upper()}")
        y -= 11
    y -= 6

    # --- 3. USD costs ----------------------------------------------------
    y = _section_header(c, y, "USD Costs")

    usd_rows = [
        ("Ring cost", inputs.get("ring_cost_usd")),
    ]
    if inputs.get("includes_hidden_halo_pave"):
        usd_rows.append(("  ↳ Hidden halo pavé", inputs.get("hidden_halo_pave_cost_usd")))
    usd_rows.extend([
        ("Extra cut", inputs.get("extra_cut_cost_usd")),
        ("CAD rendering", inputs.get("cad_rendering_cost_usd")),
        ("Provenance", inputs.get("provenance_cost_usd")),
        ("Certification", inputs.get("certification_cost_usd")),
        ("Box & packaging", inputs.get("box_packaging_cost_usd")),
        ("Air freight", inputs.get("air_freight_cost_usd")),
    ])
    usd_subtotal = 0.0
    for label, val in usd_rows:
        if val in (None, "", 0) and not label.startswith("Ring"):
            continue
        try:
            usd_subtotal += float(val or 0)
        except (TypeError, ValueError):
            pass
        _kv_row(c, y, label, _fmt_money(val, "USD"))
        y -= 11

    # USD subtotal
    y -= 2
    _line(c, y + 4)
    _kv_row(c, y - 4, "USD subtotal (pre-FX)", _fmt_money(usd_subtotal, "USD"), bold=True, accent=True)
    y -= 18

    # --- 4. FX + AUD costs ----------------------------------------------
    y = _section_header(c, y, "Currency Conversion")
    fx_rate = inputs.get("usd_to_aud_rate") or inputs.get("fx_live_rate")
    fx_buffer = inputs.get("fx_adjustment_pct")
    _kv_row(c, y, "USD → AUD rate applied", _fmt_money(fx_rate, "×", 4) if fx_rate else "—")
    y -= 11
    if fx_buffer not in (None, "", 0):
        _kv_row(c, y, "Bank buffer / adjustment", _fmt_pct(fx_buffer))
        y -= 11
    y -= 6

    y = _section_header(c, y, "AUD Costs")
    aud_rows = [
        ("Customs clearance", inputs.get("custom_clearance_aud")),
        ("Australian delivery", inputs.get("australian_delivery_aud")),
    ]
    for label, val in aud_rows:
        if val in (None, "", 0):
            continue
        _kv_row(c, y, label, _fmt_money(val, "AUD"))
        y -= 11
    # Flex fees
    for key, label in (
        ("intl_transaction_fees", "Intl transaction fees"),
        ("duty_or_chafta", "Duty / CHAFTA"),
    ):
        mode = inputs.get(f"{key}_mode") or "amount"
        pct = inputs.get(f"{key}_pct")
        amt = inputs.get(f"{key}_aud")
        if mode == "percent" and pct not in (None, "", 0):
            _kv_row(c, y, label, _fmt_pct(pct))
        elif amt not in (None, "", 0):
            _kv_row(c, y, label, _fmt_money(amt, "AUD"))
        else:
            continue
        y -= 11
    y -= 6

    # --- 5. Totals -------------------------------------------------------
    y = _section_header(c, y, "Totals")
    _kv_row(c, y, "Retail sell price (ex-GST)",
            _fmt_money(totals.get("retail_sell_price_ex_gst_aud"), "AUD"))
    y -= 11
    gst_pct = inputs.get("gst_pct") or 10
    _kv_row(c, y, f"GST ({_fmt_pct(gst_pct)})",
            _fmt_money(totals.get("gst_amount_aud"), "AUD"))
    y -= 11
    _kv_row(c, y, "Total sell price (inc-GST)",
            _fmt_money(totals.get("total_sell_price_inc_gst_aud"), "AUD"),
            bold=True, accent=True, label_size=10, value_size=11)
    y -= 14
    _kv_row(c, y, "Gross profit margin (AUD)",
            _fmt_money(totals.get("gross_profit_margin_aud"), "AUD"))
    y -= 11
    _kv_row(c, y, "Gross profit margin (%)",
            _fmt_pct(totals.get("gross_profit_margin_pct")))
    y -= 14

    # --- 6. Discount tiers ----------------------------------------------
    tiers = totals.get("discount_tiers") or inputs.get("discount_tiers") or []
    if tiers:
        y = _section_header(c, y, "Discount Tiers")
        c.setFillColor(SUB)
        c.setFont("Helvetica-Bold", 8)
        c.drawString(LEFT, y, "TIER")
        c.drawString(LEFT + 60 * mm, y, "%")
        c.drawRightString(RIGHT, y, "SELL (ex-GST)")
        y -= 10
        c.setFont("Helvetica", 9)
        c.setFillColor(TEXT)
        for tier in tiers:
            label = str(tier.get("label") or "—")[:40]
            pct = tier.get("discount_pct")
            sell = tier.get("sell_ex_gst")
            c.drawString(LEFT, y, label)
            c.drawString(LEFT + 60 * mm, y, _fmt_pct(pct))
            c.drawRightString(RIGHT, y, _fmt_money(sell, "AUD"))
            y -= 11
            if y < 30 * mm:
                break

    # --- Footer ----------------------------------------------------------
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.4)
    c.line(LEFT, 20 * mm, RIGHT, 20 * mm)
    c.setFillColor(MUTE)
    c.setFont("Helvetica", 7)
    c.drawString(LEFT, 15 * mm,
                 "Somnio.Co Atelier · confidential quote · totals recomputed server-side at export time")
    c.drawRightString(RIGHT, 15 * mm, printed_at)

    c.showPage()
    c.save()
    return buf.getvalue()
