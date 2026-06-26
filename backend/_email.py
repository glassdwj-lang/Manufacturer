"""Resend-powered transactional email helper.

Centralises Resend configuration and provides a small, typed surface
for the rest of the backend to use. Today this is consumed by the CAD
file forwarding endpoint; tomorrow it can be reused for IGI sharing,
client onboarding, audit alerts, etc.

Design notes
------------
* The Resend API key is loaded from `RESEND_API_KEY` in `.env` so it
  never enters source control or the client bundle.
* The default FROM address is the Resend sandbox sender
  `onboarding@resend.dev` (no DNS verification needed). When the user
  verifies a real domain they can switch by editing `RESEND_FROM`.
* `send_cad_files_email` builds a deliberately conservative HTML body
  (plain `<ul>` + `<a>`, inline styles, no JS) so every common email
  client renders it cleanly.
"""
from __future__ import annotations

import logging
import os
from html import escape
from typing import Iterable, List, Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
RESEND_FROM = os.getenv(
    "RESEND_FROM", "Somnio Atelier <onboarding@resend.dev>"
).strip()
RESEND_REPLY_TO = (os.getenv("RESEND_REPLY_TO") or "").strip() or None


_resend_ready = False


def _ensure_resend():
    """Lazy-import + configure resend so the backend can still start
    if the SDK is missing in some environments. We raise a clean
    ValueError when send is actually attempted."""
    global _resend_ready
    if _resend_ready:
        return
    if not RESEND_API_KEY:
        raise ValueError(
            "Resend is not configured — RESEND_API_KEY is missing."
        )
    import resend  # local import keeps cold-start cheap

    resend.api_key = RESEND_API_KEY
    _resend_ready = True


def _fmt_bytes(b: Optional[int]) -> str:
    if not b:
        return ""
    if b < 1024:
        return f"{b} B"
    if b < 1024 * 1024:
        return f"{b / 1024:.1f} KB"
    if b < 1024 * 1024 * 1024:
        return f"{b / (1024 * 1024):.1f} MB"
    return f"{b / (1024 * 1024 * 1024):.2f} GB"


def build_cad_email_html(
    *,
    sender_name: Optional[str],
    order_ref: Optional[str],
    jewelry_name: Optional[str],
    message: Optional[str],
    files: Iterable[dict],
) -> str:
    """Render the HTML body for a CAD-file forwarding email."""
    safe_message = escape(message.strip()) if message and message.strip() else None
    rows = []
    for f in files:
        name = escape(str(f.get("name") or "CAD file"))
        url = escape(str(f.get("secure_url") or ""))
        if not url:
            continue
        size = _fmt_bytes(f.get("bytes"))
        size_html = (
            f'<span style="color:#888;font-size:12px;margin-left:8px;">{size}</span>'
            if size
            else ""
        )
        rows.append(
            f'<li style="margin:8px 0;">'
            f'<a href="{url}" style="color:#B87333;text-decoration:none;font-weight:600;">'
            f"{name}</a>{size_html}"
            f"</li>"
        )
    list_html = "\n".join(rows) or (
        '<li style="color:#888;">No files attached.</li>'
    )

    intro_parts = []
    who = escape(sender_name.strip()) if sender_name and sender_name.strip() else "Somnio Atelier"
    intro_parts.append(
        f"{who} has shared CAD files with you for review."
    )
    if order_ref or jewelry_name:
        bits = []
        if jewelry_name:
            bits.append(escape(str(jewelry_name)))
        if order_ref:
            bits.append(f"({escape(str(order_ref))})")
        intro_parts.append(" ".join(bits))

    intro_html = (
        '<p style="margin:0 0 12px 0;color:#222;">'
        + " ".join(intro_parts)
        + "</p>"
    )

    message_html = (
        f'<p style="margin:0 0 16px 0;color:#444;white-space:pre-wrap;'
        f'border-left:3px solid #B87333;padding:8px 12px;background:#FAFAFA;">'
        f"{safe_message}</p>"
        if safe_message
        else ""
    )

    return f"""<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#FFF;">
    <div style="max-width:560px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:24px;">
        <h1 style="font-size:18px;letter-spacing:4px;color:#B87333;margin:0;font-weight:600;">SOMNIO.CO</h1>
        <p style="margin:4px 0 0 0;font-size:11px;letter-spacing:2px;color:#888;text-transform:uppercase;">CAD File Forward</p>
      </div>
      {intro_html}
      {message_html}
      <p style="margin:16px 0 8px 0;color:#222;font-weight:600;">Files</p>
      <ul style="padding-left:18px;margin:0 0 24px 0;">
        {list_html}
      </ul>
      <p style="font-size:11px;color:#888;margin-top:32px;border-top:1px solid #EEE;padding-top:16px;">
        Tap any file name above to download it directly from Cloudinary.
        Links are persistent — bookmark this email if you need to retrieve
        the files again later.
      </p>
    </div>
  </body>
</html>"""


def send_cad_files_email(
    *,
    recipients: List[str],
    subject: Optional[str],
    message: Optional[str],
    sender_name: Optional[str],
    sender_email: Optional[str],
    order_ref: Optional[str],
    jewelry_name: Optional[str],
    files: List[dict],
) -> dict:
    """Send the CAD-forwarding email. Returns the raw Resend response.

    Raises ValueError for configuration / validation issues so the caller
    can map them to a sensible HTTP status.
    """
    _ensure_resend()
    import resend  # safe — _ensure_resend imported it already

    cleaned_recipients = [r.strip() for r in (recipients or []) if r and r.strip()]
    if not cleaned_recipients:
        raise ValueError("At least one recipient email is required.")
    if not files:
        raise ValueError("At least one CAD file must be selected.")

    html = build_cad_email_html(
        sender_name=sender_name,
        order_ref=order_ref,
        jewelry_name=jewelry_name,
        message=message,
        files=files,
    )

    subj = (subject or "").strip()
    if not subj:
        if jewelry_name and order_ref:
            subj = f"CAD files — {jewelry_name} ({order_ref})"
        elif jewelry_name:
            subj = f"CAD files — {jewelry_name}"
        elif order_ref:
            subj = f"CAD files for commission {order_ref}"
        else:
            subj = "CAD files from Somnio Atelier"

    params = {
        "from": RESEND_FROM,
        "to": cleaned_recipients,
        "subject": subj,
        "html": html,
    }
    if sender_email and sender_email.strip():
        params["reply_to"] = sender_email.strip()
    elif RESEND_REPLY_TO:
        params["reply_to"] = RESEND_REPLY_TO

    try:
        response = resend.Emails.send(params)
        logger.info(
            "Resend email sent | recipients=%s | subject=%s | id=%s",
            cleaned_recipients,
            subj,
            (response or {}).get("id") if isinstance(response, dict) else response,
        )
        return response if isinstance(response, dict) else {"raw": str(response)}
    except Exception as exc:  # noqa: BLE001 — surface upstream details
        logger.exception("Resend send failed: %s", exc)
        raise
