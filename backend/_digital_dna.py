"""
Digital DNA — luxury provenance certificate PDF.

Renders the 26-step journey for a single order with full localization
support (en/zh-CN/fr/it) of both step titles AND the static chrome
(headings, labels, footer). Uses ReportLab's built-in `STSong-Light` CID
font for Chinese glyphs and falls back to Helvetica for the latin scripts.
"""
from __future__ import annotations
import base64
import io
import logging
import re
import urllib.request
from datetime import datetime
from typing import Any
import pytz

from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader

from _step_translations import STEP_I18N
from helpers import language_for_user

log = logging.getLogger(__name__)

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


# ---- CJK font registration (lazy, idempotent) ----
_CJK_REGISTERED = False


def _ensure_cjk_font() -> None:
    global _CJK_REGISTERED
    if _CJK_REGISTERED:
        return
    try:
        pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
        _CJK_REGISTERED = True
    except Exception:
        pass


# ---- PDF UI translations (mirror frontend i18n for the static chrome) ----
PDF_I18N: dict[str, dict[str, str]] = {
    "en": {
        "title": "Digital DNA",
        "subtitle": "Provenance certificate · 26-step traceable journey",
        "reference": "REFERENCE",
        "piece": "PIECE",
        "client": "CLIENT",
        "workshop": "WORKSHOP",
        "sku": "SKU",
        "progress": "PROGRESS",
        "steps_done": "{done} / {total} steps",
        "status_done": "Completed",
        "status_progress": "In Progress",
        "includes": "INCLUDES",
        "includes_notes": "Notes",
        "includes_photos": "Thumbnails",
        "journey": "26-STEP JOURNEY",
        "phase_label": "PHASE {p} · {title}",
        "pending": "Pending",
        "generated": "Generated {when}",
        "footer": "© Somnio.Co — Provenance secured by Atelier Digital DNA",
        "masthead": "SOMNIO.CO · ATELIER",
        "dna_label": "DIGITAL DNA · {ref}",
    },
    "zh-CN": {
        "title": "数字 DNA",
        "subtitle": "工艺溯源证书 · 26 步可追溯之旅",
        "reference": "编号",
        "piece": "作品",
        "client": "客户",
        "workshop": "工坊",
        "sku": "货号",
        "progress": "进度",
        "steps_done": "{done} / {total} 步",
        "status_done": "已完成",
        "status_progress": "进行中",
        "includes": "包含",
        "includes_notes": "备注",
        "includes_photos": "缩略图",
        "journey": "26 步工艺之旅",
        "phase_label": "阶段 {p} · {title}",
        "pending": "待完成",
        "generated": "生成于 {when}",
        "footer": "© Somnio.Co — 数字 DNA 工艺溯源",
        "masthead": "SOMNIO.CO · 工作室",
        "dna_label": "数字 DNA · {ref}",
    },
    "fr": {
        "title": "ADN Numérique",
        "subtitle": "Certificat de provenance · parcours traçable en 26 étapes",
        "reference": "RÉFÉRENCE",
        "piece": "PIÈCE",
        "client": "CLIENT",
        "workshop": "ATELIER",
        "sku": "SKU",
        "progress": "AVANCEMENT",
        "steps_done": "{done} / {total} étapes",
        "status_done": "Terminé",
        "status_progress": "En cours",
        "includes": "INCLUS",
        "includes_notes": "Notes",
        "includes_photos": "Vignettes",
        "journey": "PARCOURS EN 26 ÉTAPES",
        "phase_label": "PHASE {p} · {title}",
        "pending": "En attente",
        "generated": "Généré le {when}",
        "footer": "© Somnio.Co — Provenance certifiée par l’ADN numérique",
        "masthead": "SOMNIO.CO · ATELIER",
        "dna_label": "ADN NUMÉRIQUE · {ref}",
    },
    "it": {
        "title": "DNA Digitale",
        "subtitle": "Certificato di provenienza · percorso tracciabile in 26 passi",
        "reference": "RIFERIMENTO",
        "piece": "PEZZO",
        "client": "CLIENTE",
        "workshop": "ATELIER",
        "sku": "SKU",
        "progress": "AVANZAMENTO",
        "steps_done": "{done} / {total} passi",
        "status_done": "Completato",
        "status_progress": "In corso",
        "includes": "INCLUDE",
        "includes_notes": "Note",
        "includes_photos": "Miniature",
        "journey": "PERCORSO IN 26 PASSI",
        "phase_label": "FASE {p} · {title}",
        "pending": "In attesa",
        "generated": "Generato il {when}",
        "footer": "© Somnio.Co — Provenienza garantita dal DNA Digitale",
        "masthead": "SOMNIO.CO · ATELIER",
        "dna_label": "DNA DIGITALE · {ref}",
    },
}


def _has_cjk(s: str) -> bool:
    return any("\u4e00" <= c <= "\u9fff" for c in s)


def _pick_font(text: str, bold: bool = False) -> tuple[str, bool]:
    """Return (font_name, is_cjk). Falls back to Helvetica when no CJK is present."""
    if _has_cjk(text):
        _ensure_cjk_font()
        if _CJK_REGISTERED:
            return ("STSong-Light", True)
    return ("Helvetica-Bold" if bold else "Helvetica", False)


def _format_china(iso: str | None) -> str:
    if not iso:
        return "—"
    try:
        d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        # Date + time only — no timezone acronym.
        return d.astimezone(CHINA_TZ).strftime("%d %b %Y · %H:%M")
    except Exception:
        return iso


def _strip_tz_label(s: str) -> str:
    """Removes any trailing 'CST' (and similar TZ acronyms) from a formatted
    timestamp so clients see the date/time without the China-specific tag."""
    if not s:
        return s
    return s.replace(" CST", "").replace(" UTC", "").rstrip()


def _pack_for(lang: str) -> dict | None:
    return STEP_I18N.get(lang)


def _t(lang: str, key: str, **vars: Any) -> str:
    row = PDF_I18N.get(lang) or PDF_I18N["en"]
    s = row.get(key) or PDF_I18N["en"].get(key, key)
    for k, v in vars.items():
        s = s.replace("{" + k + "}", str(v))
    return s


def _is_video_url(raw: str) -> bool:
    """Cloudinary video URLs live under /video/upload/ — those have no
    extractable still frame, so we skip them in the PDF."""
    return "/video/upload/" in (raw or "")


def _decode_photo(raw: str) -> ImageReader | None:
    """Resolve a photo reference (Cloudinary URL **or** base64 data URI) to an
    ImageReader the PDF engine can embed. Returns ``None`` on any failure so
    callers can silently skip the thumbnail without breaking the certificate.
    """
    if not raw or not isinstance(raw, str):
        return None
    # Cloudinary video URLs cannot be embedded as still images.
    if _is_video_url(raw):
        return None
    try:
        # Remote URL → fetch the bytes (short timeout, no auth).
        if raw.startswith("http://") or raw.startswith("https://"):
            # Force a JPEG transform on Cloudinary URLs so we never feed
            # WEBP / HEIC / GIF into ReportLab — which only handles common
            # raster formats reliably. The "f_jpg" transformation tells
            # Cloudinary to deliver a JPEG regardless of source format.
            url = raw
            if "/image/upload/" in url:
                url = url.replace(
                    "/image/upload/",
                    "/image/upload/f_jpg,q_auto:good,w_800/",
                    1,
                )
            req = urllib.request.Request(
                url, headers={"User-Agent": "Somnio.Co/DigitalDNA"}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = resp.read(6_000_000)  # 6 MB cap per thumbnail
            return ImageReader(io.BytesIO(data))
        # Base64 / data URI fallback (legacy).
        if raw.startswith("data:"):
            _, b64 = raw.split(",", 1)
        else:
            b64 = raw
        b64 = re.sub(r"\s+", "", b64)
        data = base64.b64decode(b64, validate=False)
        return ImageReader(io.BytesIO(data))
    except Exception as e:
        log.warning("Digital DNA: failed to load thumbnail %.80s — %s", raw, e)
        return None


def _draw_text(c: canvas.Canvas, x: float, y: float, text: str, size: float, bold: bool = False, right: bool = False) -> None:
    """Picks the correct font (CJK vs Latin) automatically for the given text."""
    font, _ = _pick_font(text, bold=bold)
    c.setFont(font, size)
    if right:
        c.drawRightString(x, y, text)
    else:
        c.drawString(x, y, text)


def _wrap(text: str, c: canvas.Canvas, max_w: float, font: str, size: float) -> list[str]:
    """Crude word-wrap helper that respects pixel widths for the active font."""
    out: list[str] = []
    if not text:
        return out
    words = text.split()
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


def _draw_masthead(c: canvas.Canvas, lang_tag: str, order_ref: str) -> None:
    c.setFillColor(BG)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setStrokeColor(GOLD)
    c.setLineWidth(0.6)
    c.line(LEFT, PAGE_H - 22 * mm, RIGHT, PAGE_H - 22 * mm)
    c.setFillColor(GOLD)
    _draw_text(c, LEFT, PAGE_H - 18 * mm, _t(lang_tag, "masthead"), 9, bold=True)
    c.setFillColor(SUB)
    _draw_text(
        c,
        RIGHT,
        PAGE_H - 18 * mm,
        _t(lang_tag, "dna_label", ref=(order_ref or "").upper()),
        8,
        right=True,
    )


def _new_page(c: canvas.Canvas, lang_tag: str, order_ref: str) -> float:
    c.showPage()
    _draw_masthead(c, lang_tag, order_ref)
    return PAGE_H - 30 * mm


def build_digital_dna_pdf(
    order: dict,
    viewer: dict,
    include_notes: bool = False,
    include_photos: bool = False,
) -> bytes:
    """Returns localized PDF bytes for the given order.

    Localization respects the viewer's manual ``preferred_language`` first,
    then falls back to the country-derived language (matches `helpers.language_for_user`).
    Client viewers see provenance steps without raw CST timestamps — only the
    completion state is surfaced ("Forwarded" / "Pending").
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)

    # Effective language. `language_for_user` already returns the BCP-47 tag
    # that matches STEP_I18N (e.g. "zh-CN"), so we can use it as-is for both
    # the step pack and our PDF chrome lookup.
    lang_tag, _lang_name = language_for_user(viewer)
    # Normalise to one of the supported PDF chrome packs.
    chrome_tag = lang_tag if lang_tag in PDF_I18N else (
        "zh-CN" if lang_tag.startswith("zh") else
        "fr" if lang_tag.startswith("fr") else
        "it" if lang_tag.startswith("it") else "en"
    )
    pack = _pack_for(lang_tag)
    step_titles = {s["n"]: s["title"] for s in (pack or {}).get("steps", [])} if pack else {}
    phase_titles = {p["code"]: p["title"] for p in (pack or {}).get("phases", [])} if pack else {}

    def localize_step(s: dict) -> tuple[str, str]:
        st = step_titles.get(s["step_number"], s["title"])
        pt = phase_titles.get(s["phase"], s.get("phase_title", ""))
        return st, pt

    order_ref = order.get("order_ref", "")
    _draw_masthead(c, chrome_tag, order_ref)

    # Title block
    c.setFillColor(TEXT)
    _draw_text(c, LEFT, PAGE_H - 38 * mm, _t(chrome_tag, "title"), 28)
    c.setFillColor(SUB)
    _draw_text(c, LEFT, PAGE_H - 44 * mm, _t(chrome_tag, "subtitle"), 9)

    # Order summary
    y = PAGE_H - 62 * mm

    def kv(label: str, value: str, y_pos: float) -> None:
        c.setFillColor(GOLD)
        _draw_text(c, LEFT, y_pos, label.upper(), 7, bold=True)
        c.setFillColor(TEXT)
        _draw_text(c, LEFT, y_pos - 5 * mm, value or "—", 11)

    kv(_t(chrome_tag, "reference"), order_ref, y)
    kv(_t(chrome_tag, "piece"), order.get("jewelry_name", "—"), y - 12 * mm)
    kv(_t(chrome_tag, "client"), order.get("client_name", "—"), y - 24 * mm)
    alias = order.get("manufacturer_alias") or "Somnio.Co Atelier Workshop"
    kv(_t(chrome_tag, "workshop"), alias, y - 36 * mm)
    if order.get("sku"):
        kv(_t(chrome_tag, "sku"), order["sku"], y - 48 * mm)

    progress = order.get("progress") or {}
    done = progress.get("completed_count", 0)
    total = progress.get("total", 26)
    c.setFillColor(GOLD)
    _draw_text(c, RIGHT, y, _t(chrome_tag, "progress"), 7, bold=True, right=True)
    c.setFillColor(TEXT)
    _draw_text(c, RIGHT, y - 5 * mm, _t(chrome_tag, "steps_done", done=done, total=total), 11, right=True)
    c.setFillColor(SUB)
    status = _t(chrome_tag, "status_done") if done >= total else _t(chrome_tag, "status_progress")
    _draw_text(c, RIGHT, y - 10 * mm, status, 8, right=True)

    if include_notes or include_photos:
        flags = []
        if include_notes:
            flags.append(_t(chrome_tag, "includes_notes"))
        if include_photos:
            flags.append(_t(chrome_tag, "includes_photos"))
        c.setFillColor(GOLD_DIM)
        _draw_text(c, RIGHT, y - 15 * mm, _t(chrome_tag, "includes"), 7, bold=True, right=True)
        c.setFillColor(SUB)
        _draw_text(c, RIGHT, y - 19 * mm, " · ".join(flags), 8, right=True)

    c.setStrokeColor(BORDER)
    c.line(LEFT, PAGE_H - 118 * mm, RIGHT, PAGE_H - 118 * mm)
    c.setFillColor(GOLD)
    _draw_text(c, LEFT, PAGE_H - 125 * mm, _t(chrome_tag, "journey"), 7, bold=True)

    # Step list
    y_cursor = PAGE_H - 135 * mm
    line_h = 7 * mm
    text_col_w = RIGHT - LEFT - 14 * mm
    last_phase: str | None = None

    for s in order.get("steps", []):
        needed = line_h
        notes_src = ""
        if include_notes and s.get("completed"):
            notes_src = (s.get("notes_translated") or s.get("notes") or "").strip()
        notes_lines: list[str] = []
        if notes_src:
            notes_font, _ = _pick_font(notes_src)
            notes_lines = _wrap(notes_src, c, text_col_w - 12 * mm, notes_font, 8.5)
            notes_lines = notes_lines[:3]
            needed += 4 * mm + len(notes_lines) * 4 * mm
        thumb_imgs: list[ImageReader] = []
        if include_photos and s.get("completed"):
            for raw in (s.get("photos") or [])[:2]:
                img = _decode_photo(raw)
                if img is not None:
                    thumb_imgs.append(img)
        if thumb_imgs:
            needed += 22 * mm

        if y_cursor - needed < BOTTOM:
            y_cursor = _new_page(c, chrome_tag, order_ref)
            last_phase = None

        title, phase_title = localize_step(s)
        if s["phase"] != last_phase:
            if y_cursor - 8 * mm < BOTTOM:
                y_cursor = _new_page(c, chrome_tag, order_ref)
            c.setFillColor(GOLD_DIM)
            label = _t(chrome_tag, "phase_label", p=s["phase"], title=phase_title)
            _draw_text(c, LEFT, y_cursor, label, 8, bold=True)
            y_cursor -= 6 * mm
            last_phase = s["phase"]

        done_flag = bool(s.get("completed"))
        step_num = str(s["step_number"]).zfill(2)
        c.setFillColor(GOLD if done_flag else MUTE)
        _draw_text(c, LEFT + 2 * mm, y_cursor, step_num, 9, bold=True)
        c.setFillColor(TEXT if done_flag else SUB)
        _draw_text(c, LEFT + 14 * mm, y_cursor, title, 10)
        ts = _format_china(s.get("completed_at_china")) if done_flag else _t(chrome_tag, "pending")
        c.setFillColor(GOLD if done_flag else MUTE)
        _draw_text(c, RIGHT, y_cursor, ts, 8, right=True)
        y_cursor -= line_h

        if notes_lines:
            c.setFillColor(SUB)
            y_cursor += 3 * mm
            for ln in notes_lines:
                if y_cursor < BOTTOM + 4 * mm:
                    y_cursor = _new_page(c, chrome_tag, order_ref)
                    c.setFillColor(SUB)
                # Use the same font we measured the wrap against.
                font, _ = _pick_font(ln)
                # Italic style isn't available for STSong-Light; degrade gracefully.
                c.setFont(font if font == "STSong-Light" else "Helvetica-Oblique", 8.5)
                c.drawString(LEFT + 14 * mm, y_cursor, ln)
                y_cursor -= 4 * mm
            y_cursor -= 1 * mm

        if thumb_imgs:
            if y_cursor - 22 * mm < BOTTOM:
                y_cursor = _new_page(c, chrome_tag, order_ref)
            thumb_h = 20 * mm
            x = LEFT + 14 * mm
            for img in thumb_imgs:
                try:
                    iw, ih = img.getSize()
                except Exception:
                    iw, ih = 1, 1
                aspect = iw / ih if ih else 1.0
                thumb_w = min(thumb_h * aspect, 30 * mm)
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
                    pass
                x += thumb_w + 4 * mm
            y_cursor -= thumb_h + 4 * mm

    # Footer
    c.setStrokeColor(BORDER)
    c.line(LEFT, 18 * mm, RIGHT, 18 * mm)
    c.setFillColor(MUTE)
    # No CST anywhere in the PDF — date + time only.
    generated_at = datetime.now(CHINA_TZ).strftime("%d %b %Y · %H:%M")
    _draw_text(c, LEFT, 12 * mm, _t(chrome_tag, "generated", when=generated_at), 7)
    _draw_text(c, RIGHT, 12 * mm, _t(chrome_tag, "footer"), 7, right=True)

    c.save()
    return buf.getvalue()
