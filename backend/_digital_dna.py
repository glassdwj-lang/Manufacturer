"""
Digital DNA — luxury provenance certificate PDF.

Renders the 26-step journey for a single order with:
- Order ref, jewelry name, client name (as visible to the viewer's role)
- Manufacturer ALIAS only — real workshop names never appear
- Localized step titles (based on the viewer's preferred language, falling back to English)
- China (Asia/Shanghai) timestamps for every completed step
- Optional manufacturer notes (auto-translated when available)
- Optional thumbnails (up to 2 small images per step)

Dark luxury aesthetic that matches the app: ink-black background + champagne gold.
"""
from __future__ import annotations
import base64
import io
import re
from datetime import datetime
from typing import Any
import pytz

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader

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

PAGE_W, PAGE_H = A4
LEFT = 20 * mm
RIGHT = PAGE_W - 20 * mm
BOTTOM = 22 * mm


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


def _decode_photo(raw: str) -> ImageReader | None:
    """Accepts a data URI or bare base64 string. Returns an ImageReader."""
    if not raw or not isinstance(raw, str):
        return None
    try:
        if raw.startswith("data:"):
            _, b64 = raw.split(",", 1)
        else:
            b64 = raw
        # Strip whitespace defensively
        b64 = re.sub(r"\s+", "", b64)
        data = base64.b64decode(b64, validate=False)
        return ImageReader(io.BytesIO(data))
    except Exception:
        return None


def _wrap(text: str, c: canvas.Canvas, max_w: float, font: str, size: float) -> list[str]:
    """Crude word-wrap helper that respects pixel widths for the active font."""
    out: list[str] = []
    if not text:
        return out
    for para in text.splitlines():
        words = para.split(" ")
        line = ""
        for w in words:
            cand = (line + " " + w).strip()
            if c.stringWidth(cand, font, size) <= max_w:
                line = cand
            else:
                if line:
                    out.append(line)
                line = w
        if line:
            out.append(line)
    return out


def _draw_masthead(c: canvas.Canvas, lang_name: str, order_ref: str) -> None:
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.6)
    c.line(LEFT, PAGE_H - 22 * mm, RIGHT, PAGE_H - 22 * mm)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(LEFT, PAGE_H - 18 * mm, "SOMNIO.CO · ATELIER")
    c.setFillColor(SUB)
    c.setFont("Helvetica", 8)
    c.drawRightString(
        RIGHT,
        PAGE_H - 18 * mm,
        f"DIGITAL DNA · {(order_ref or lang_name).upper()}",
    )


def _new_page(c: canvas.Canvas, lang_name: str, order_ref: str) -> float:
    c.showPage()
    _draw_masthead(c, lang_name, order_ref)
    return PAGE_H - 30 * mm


def build_digital_dna_pdf(
    order: dict,
    viewer: dict,
    include_notes: bool = False,
    include_photos: bool = False,
) -> bytes:
    """Returns the PDF bytes for the given order, localized for the viewer.

    When ``include_notes`` is True, the manufacturer's notes for each completed
    step are rendered (translated to the viewer's language when a translation
    exists, otherwise the original). When ``include_photos`` is True, up to two
    small thumbnails per step are inlined at low resolution.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # ---- viewer's language pack ----
    lang_tag, lang_name = language_for_country(viewer.get("country") or "AU")
    pack = _pack_for(lang_tag)
    step_titles = {s["n"]: s["title"] for s in (pack or {}).get("steps", [])} if pack else {}
    phase_titles = {p["code"]: p["title"] for p in (pack or {}).get("phases", [])} if pack else {}

    def localize_step(s: dict) -> tuple[str, str]:
        st = step_titles.get(s["step_number"], s["title"])
        pt = phase_titles.get(s["phase"], s.get("phase_title", ""))
        return st, pt

    order_ref = order.get("order_ref", "")
    _draw_masthead(c, lang_name, order_ref)

    # ---- title block ----
    c.setFillColor(TEXT)
    c.setFont("Helvetica", 28)
    c.drawString(LEFT, PAGE_H - 38 * mm, "Digital DNA")
    c.setFillColor(SUB)
    c.setFont("Helvetica", 9)
    c.drawString(LEFT, PAGE_H - 44 * mm, "Provenance certificate · 26-step traceable journey")

    # ---- order summary ----
    y = PAGE_H - 62 * mm

    def kv(label: str, value: str, y_pos: float) -> None:
        c.setFillColor(GOLD)
        c.setFont("Helvetica-Bold", 7)
        c.drawString(LEFT, y_pos, label.upper())
        c.setFillColor(TEXT)
        c.setFont("Helvetica", 11)
        c.drawString(LEFT, y_pos - 5 * mm, value or "—")

    kv("REFERENCE", order_ref, y)
    kv("PIECE", order.get("jewelry_name", "—"), y - 12 * mm)
    kv("CLIENT", order.get("client_name", "—"), y - 24 * mm)
    alias = order.get("manufacturer_alias") or "Somnio.Co Atelier"
    kv("WORKSHOP", alias, y - 36 * mm)
    if order.get("sku"):
        kv("SKU", order["sku"], y - 48 * mm)

    progress = order.get("progress") or {}
    done = progress.get("completed_count", 0)
    total = progress.get("total", 26)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 7)
    c.drawRightString(RIGHT, y, "PROGRESS")
    c.setFillColor(TEXT)
    c.setFont("Helvetica", 11)
    c.drawRightString(RIGHT, y - 5 * mm, f"{done} / {total} steps")
    c.setFillColor(SUB)
    c.setFont("Helvetica", 8)
    status = "Completed" if done >= total else "In Progress"
    c.drawRightString(RIGHT, y - 10 * mm, status)

    # Include flags badge
    if include_notes or include_photos:
        flags = []
        if include_notes:
            flags.append("Notes")
        if include_photos:
            flags.append("Thumbnails")
        c.setFillColor(GOLD_DIM)
        c.setFont("Helvetica-Bold", 7)
        c.drawRightString(RIGHT, y - 15 * mm, "INCLUDES")
        c.setFillColor(SUB)
        c.setFont("Helvetica", 8)
        c.drawRightString(RIGHT, y - 19 * mm, " · ".join(flags))

    c.setStrokeColor(BORDER)
    c.line(LEFT, PAGE_H - 118 * mm, RIGHT, PAGE_H - 118 * mm)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 7)
    c.drawString(LEFT, PAGE_H - 125 * mm, "26-STEP JOURNEY")

    # ---- step list ----
    y_cursor = PAGE_H - 135 * mm
    line_h = 7 * mm
    text_col_w = RIGHT - LEFT - 14 * mm  # leave room for the timestamp on the right
    last_phase: str | None = None

    for s in order.get("steps", []):
        # Pre-calc the vertical room this step will need.
        needed = line_h
        notes_src = ""
        if include_notes and s.get("completed"):
            notes_src = (s.get("notes_translated") or s.get("notes") or "").strip()
        notes_lines: list[str] = []
        if notes_src:
            notes_lines = _wrap(notes_src, c, text_col_w - 12 * mm, "Helvetica-Oblique", 8.5)
            notes_lines = notes_lines[:3]  # cap to 3 lines per step
            needed += 4 * mm + len(notes_lines) * 4 * mm
        thumb_imgs: list[ImageReader] = []
        if include_photos and s.get("completed"):
            for raw in (s.get("photos") or [])[:2]:
                img = _decode_photo(raw)
                if img is not None:
                    thumb_imgs.append(img)
        if thumb_imgs:
            needed += 22 * mm

        # Page break if we'd overflow.
        if y_cursor - needed < BOTTOM:
            y_cursor = _new_page(c, lang_name, order_ref)
            last_phase = None

        # Phase header (only when changing).
        title, phase_title = localize_step(s)
        if s["phase"] != last_phase:
            if y_cursor - 8 * mm < BOTTOM:
                y_cursor = _new_page(c, lang_name, order_ref)
            c.setFillColor(GOLD_DIM)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(LEFT, y_cursor, f"PHASE {s['phase']} · {phase_title}")
            y_cursor -= 6 * mm
            last_phase = s["phase"]

        done_flag = bool(s.get("completed"))
        step_num = str(s["step_number"]).zfill(2)
        c.setFillColor(GOLD if done_flag else MUTE)
        c.setFont("Helvetica-Bold", 9)
        c.drawString(LEFT + 2 * mm, y_cursor, step_num)
        c.setFillColor(TEXT if done_flag else SUB)
        c.setFont("Helvetica", 10)
        c.drawString(LEFT + 14 * mm, y_cursor, title)
        ts = _format_china(s.get("completed_at_china")) if done_flag else "Pending"
        c.setFillColor(GOLD if done_flag else MUTE)
        c.setFont("Helvetica", 8)
        c.drawRightString(RIGHT, y_cursor, ts)
        y_cursor -= line_h

        # Notes
        if notes_lines:
            c.setFillColor(SUB)
            c.setFont("Helvetica-Oblique", 8.5)
            y_cursor += 3 * mm  # tighten the gap after the title row
            for ln in notes_lines:
                if y_cursor < BOTTOM + 4 * mm:
                    y_cursor = _new_page(c, lang_name, order_ref)
                    c.setFillColor(SUB)
                    c.setFont("Helvetica-Oblique", 8.5)
                c.drawString(LEFT + 14 * mm, y_cursor, ln)
                y_cursor -= 4 * mm
            y_cursor -= 1 * mm

        # Thumbnails
        if thumb_imgs:
            if y_cursor - 22 * mm < BOTTOM:
                y_cursor = _new_page(c, lang_name, order_ref)
            thumb_h = 20 * mm
            x = LEFT + 14 * mm
            for img in thumb_imgs:
                try:
                    iw, ih = img.getSize()
                except Exception:
                    iw, ih = 1, 1
                aspect = iw / ih if ih else 1.0
                thumb_w = min(thumb_h * aspect, 30 * mm)
                # Subtle gold frame.
                c.setStrokeColor(GOLD_DIM)
                c.setLineWidth(0.4)
                c.rect(x - 0.5, y_cursor - thumb_h - 0.5, thumb_w + 1, thumb_h + 1, fill=0, stroke=1)
                try:
                    c.drawImage(
                        img,
                        x,
                        y_cursor - thumb_h,
                        width=thumb_w,
                        height=thumb_h,
                        preserveAspectRatio=True,
                        anchor="sw",
                        mask="auto",
                    )
                except Exception:
                    # Silently skip an unreadable image rather than aborting the PDF.
                    pass
                x += thumb_w + 4 * mm
            y_cursor -= thumb_h + 4 * mm

    # ---- footer ----
    c.setStrokeColor(BORDER)
    c.line(LEFT, 18 * mm, RIGHT, 18 * mm)
    c.setFillColor(MUTE)
    c.setFont("Helvetica", 7)
    generated_at = datetime.now(CHINA_TZ).strftime("Generated %d %b %Y · %H:%M CST")
    c.drawString(LEFT, 12 * mm, generated_at)
    c.drawRightString(RIGHT, 12 * mm, "© Somnio.Co — Provenance secured by Atelier Digital DNA")

    c.save()
    return buf.getvalue()
