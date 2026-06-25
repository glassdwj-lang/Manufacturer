"""
Digital DNA — luxury provenance certificate PDF.

Renders the 26-step journey for a single order with:
- Order ref, jewelry name, client name (as visible to the viewer's role)
- Manufacturer ALIAS only — real workshop names never appear
- Localized step titles (based on the viewer's preferred language, falling back to English)
- China (Asia/Shanghai) timestamps for every completed step

Dark luxury aesthetic that matches the app: ink-black background + champagne gold.
"""
from __future__ import annotations
import io
from datetime import datetime
from typing import Any
import pytz

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm

from _step_translations import STEP_I18N
from _translation import language_for_country

BG = HexColor("#0A0A0A")
GOLD = HexColor("#D4AF37")
GOLD_DIM = HexColor("#8B7128")
TEXT = HexColor("#F5F5F5")
SUB = HexColor("#A3A3A3")
MUTE = HexColor("#6B6B6B")
BORDER = HexColor("#333333")
CHINA_TZ = pytz.timezone("Asia/Shanghai")


def _format_china(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return d.astimezone(CHINA_TZ).strftime("%d %b %Y · %H:%M CST")
    except Exception:
        return iso


def _pack_for(lang: str) -> dict | None:
    return STEP_I18N.get(lang)


def build_digital_dna_pdf(order: dict, viewer: dict) -> bytes:
    """Returns the PDF bytes for the given order, localized for the viewer."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4

    # ---- viewer's language pack ----
    lang_tag, lang_name = language_for_country(viewer.get("country") or "AU")
    pack = _pack_for(lang_tag)
    step_titles = {s["n"]: s["title"] for s in (pack or {}).get("steps", [])} if pack else {}
    phase_titles = {p["code"]: p["title"] for p in (pack or {}).get("phases", [])} if pack else {}

    def localize_step(s: dict) -> tuple[str, str]:
        st = step_titles.get(s["step_number"], s["title"])
        pt = phase_titles.get(s["phase"], s.get("phase_title", ""))
        return st, pt

    # ---- page 1 background + masthead ----
    def draw_bg():
        c.setFillColor(BG)
        c.rect(0, 0, w, h, fill=1, stroke=0)
    draw_bg()

    # Top gold rule
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.6)
    c.line(20 * mm, h - 22 * mm, w - 20 * mm, h - 22 * mm)

    # Masthead
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(20 * mm, h - 18 * mm, "SOMNIO · ATELIER")
    c.setFillColor(SUB)
    c.setFont("Helvetica", 8)
    c.drawRightString(w - 20 * mm, h - 18 * mm, f"DIGITAL DNA · {lang_name.upper()}")

    # Title
    c.setFillColor(TEXT)
    c.setFont("Helvetica", 28)
    c.drawString(20 * mm, h - 38 * mm, "Digital DNA")
    c.setFillColor(SUB)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, h - 44 * mm, "Provenance certificate · 26-step traceable journey")

    # Order block
    y = h - 62 * mm
    def kv(label: str, value: str, y_pos: float):
        c.setFillColor(GOLD)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(20 * mm, y_pos, label.upper())
        c.setFillColor(TEXT)
        c.setFont("Helvetica", 11)
        c.drawString(20 * mm, y_pos - 5 * mm, value or "—")

    kv("REFERENCE", order.get("order_ref", "—"), y)
    kv("PIECE", order.get("jewelry_name", "—"), y - 12 * mm)
    kv("CLIENT", order.get("client_name", "—"), y - 24 * mm)
    # Workshop = alias only (never the real name)
    alias = order.get("manufacturer_alias") or "Somnio Atelier"
    kv("WORKSHOP", alias, y - 36 * mm)
    if order.get("sku"):
        kv("SKU", order["sku"], y - 48 * mm)

    progress = order.get("progress") or {}
    done = progress.get("completed_count", 0)
    total = progress.get("total", 26)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 7)
    c.drawRightString(w - 20 * mm, y, "PROGRESS")
    c.setFillColor(TEXT)
    c.setFont("Helvetica", 11)
    c.drawRightString(w - 20 * mm, y - 5 * mm, f"{done} / {total} steps")
    c.setFillColor(SUB)
    c.setFont("Helvetica", 8)
    status = "Completed" if done >= total else "In Progress"
    c.drawRightString(w - 20 * mm, y - 10 * mm, status)

    # Section divider
    c.setStrokeColor(BORDER)
    c.line(20 * mm, h - 118 * mm, w - 20 * mm, h - 118 * mm)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(20 * mm, h - 125 * mm, "26-STEP JOURNEY")

    # Step list — fits one column on A4 with tight spacing.
    list_top = h - 135 * mm
    line_h = 7 * mm
    steps = order.get("steps", [])
    last_phase = None
    y_cursor = list_top
    for s in steps:
        if y_cursor < 25 * mm:
            c.showPage()
            draw_bg()
            c.setStrokeColor(GOLD)
            c.line(20 * mm, h - 22 * mm, w - 20 * mm, h - 22 * mm)
            c.setFillColor(GOLD)
            c.setFont("Helvetica-Bold", 9)
            c.drawString(20 * mm, h - 18 * mm, "SOMNIO · ATELIER")
            c.setFillColor(SUB)
            c.setFont("Helvetica", 8)
            c.drawRightString(w - 20 * mm, h - 18 * mm, f"DIGITAL DNA · {order.get('order_ref','')}")
            y_cursor = h - 30 * mm

        title, phase_title = localize_step(s)
        if s["phase"] != last_phase:
            c.setFillColor(GOLD_DIM)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(20 * mm, y_cursor, f"PHASE {s['phase']} · {phase_title}")
            y_cursor -= 6 * mm
            last_phase = s["phase"]

        done_flag = bool(s.get("completed"))
        step_num = str(s["step_number"]).zfill(2)
        # Number column
        c.setFillColor(GOLD if done_flag else MUTE)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(22 * mm, y_cursor, step_num)
        # Title
        c.setFillColor(TEXT if done_flag else SUB)
        c.setFont("Helvetica", 10)
        c.drawString(34 * mm, y_cursor, title)
        # Timestamp / status
        ts = _format_china(s.get("completed_at_china")) if done_flag else "Pending"
        c.setFillColor(GOLD if done_flag else MUTE)
        c.setFont("Helvetica", 8)
        c.drawRightString(w - 20 * mm, y_cursor, ts)

        y_cursor -= line_h

    # Footer on the last page
    c.setStrokeColor(BORDER)
    c.line(20 * mm, 18 * mm, w - 20 * mm, 18 * mm)
    c.setFillColor(MUTE)
    c.setFont("Helvetica", 7)
    generated_at = datetime.now(CHINA_TZ).strftime("Generated %d %b %Y · %H:%M CST")
    c.drawString(20 * mm, 12 * mm, generated_at)
    c.drawRightString(w - 20 * mm, 12 * mm, "© Somnio.Co — Provenance secured by Atelier Digital DNA")

    c.save()
    return buf.getvalue()
