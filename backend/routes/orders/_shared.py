"""Shared imports + helpers used by every orders sub-router.

Keeping all the cross-cutting plumbing here (DB handle, role guard,
models, helpers) lets the per-domain files (`crud`, `steps`, `cad`,
`igi`, `customs`, `digital_dna`) stay focused on the routes they own.

Every sub-module imports from this file rather than re-importing
directly, so a future migration (e.g. swapping the activity-log
backend) only needs to touch one place.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel

from _activity_log import record_event
from _digital_dna import build_digital_dna_pdf
from _notes_translation import ensure_translations_for_viewer
from _translation import language_for_country, translate as translate_text
from deps import db, get_current_user, require_roles
from helpers import (
    language_for_user,
    list_strip,
    now_china_iso,
    progress_summary,
    strip_order_for_role,
)
from models import (
    BulkDeletePayload,
    CustomsDocs,
    CustomsFilePayload,
    ForwardUpdate,
    OrderCreate,
    StepUpdate,
)
from phases import build_initial_steps

__all__ = [
    # Re-exports — convenient for sub-modules.
    "APIRouter",
    "Depends",
    "HTTPException",
    "Query",
    "Request",
    "Response",
    "BaseModel",
    "datetime",
    "timezone",
    "uuid",
    "record_event",
    "build_digital_dna_pdf",
    "ensure_translations_for_viewer",
    "language_for_country",
    "language_for_user",
    "translate_text",
    "db",
    "get_current_user",
    "require_roles",
    "list_strip",
    "now_china_iso",
    "progress_summary",
    "strip_order_for_role",
    "BulkDeletePayload",
    "CustomsDocs",
    "CustomsFilePayload",
    "ForwardUpdate",
    "OrderCreate",
    "StepUpdate",
    "build_initial_steps",
    # Local helpers.
    "FileEmailPayload",
    "sanitize_recipients",
    "customs_kind_field",
    "CUSTOMS_KIND_MAP",
]


# ---- Email payload (shared by CAD / IGI / customs email routes) -----------
class FileEmailPayload(BaseModel):
    """Common request body for every file-forwarding endpoint.

    Identical for CAD, IGI, customs and airway-bill emails — keeping a
    single class means clients don't have to learn three near-identical
    schemas and there's only one place to validate when the contract
    evolves (e.g. attachment support, CC/BCC, etc.).
    """

    recipients: list[str]
    file_ids: list[str]
    subject: str | None = None
    message: str | None = None


def sanitize_recipients(values: list[str] | None) -> list[str]:
    """Strip + dedupe + lightly validate email recipients.

    Mirrors the (light) frontend regex so the user gets matching error
    messages whichever side rejects them. The Resend SDK does the final
    strict validation before sending.
    """
    cleaned: list[str] = []
    seen: set[str] = set()
    for r in values or []:
        v = (r or "").strip()
        if not v or "@" not in v or "." not in v.split("@", 1)[1]:
            continue
        key = v.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(v)
    return cleaned


# ---- Customs file rosters --------------------------------------------------
# The customs sub-document keeps two parallel file arrays. The public URL
# uses kebab-case while the Mongo field uses snake_case; this map is the
# single source of truth for both.
CUSTOMS_KIND_MAP = {
    "airway-bill": "airway_bill_files",
    "customs": "customs_files",
}


def customs_kind_field(kind: str) -> str:
    if kind not in CUSTOMS_KIND_MAP:
        raise HTTPException(
            status_code=400,
            detail="kind must be 'airway-bill' or 'customs'",
        )
    return CUSTOMS_KIND_MAP[kind]
