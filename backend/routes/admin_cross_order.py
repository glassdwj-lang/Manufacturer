"""Admin cross-order library endpoints (CAD, Renders, IGI, Customs, Airway Bills)
plus the cad_renderer seed. Extracted from the monolithic routes/admin.py."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from _associate_importer import get_last_run, run_import_and_record
from _translation import COUNTRY_LIST, language_for_country, translate as translate_text
from deps import CHINA_TZ, db, require_roles
from helpers import _next_manufacturer_alias, hash_password, now_china_iso, sanitize_manufacturer_contacts
from phases import build_initial_steps
from pydantic import BaseModel

router = APIRouter(tags=["admin-cross-order"])

# ---- Cross-order CAD library (Phase 2) -------------------------------------
# Admin-only flat view of every CAD file across every non-deleted commission.
# Used by the new CAD Library page to bulk-email files via Resend without
# navigating to each order individually.


@router.get("/admin/cad-files")
async def admin_list_all_cad_files(
    user=Depends(require_roles("admin")),
    manufacturer_id: str | None = None,
    client_id: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Returns a flat list of CAD files, each row enriched with its parent
    commission context (order_ref, jewelry_name, manufacturer_name). Sorted
    newest-uploaded first so the most recent designs surface immediately.

    Filters (all optional):
    * ``manufacturer_id`` — only files from the named workshop
    * ``client_id``       — only files for the named client (orthogonal axis)
    * ``q``               — case-insensitive substring against file name OR
                            jewelry name OR order ref
    * ``date_from`` /
      ``date_to``         — inclusive ``uploaded_at`` date window
                            (ISO YYYY-MM-DD)
    """
    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
            {"deleted_at": ""},
        ]
    }
    query: dict = {"$and": [not_deleted, {"cad_files": {"$exists": True, "$ne": []}}]}
    if manufacturer_id:
        query["$and"].append({"manufacturer_id": manufacturer_id})
    if client_id:
        query["$and"].append({"client_id": client_id})

    rows: list[dict] = []
    needle = (q or "").strip().lower()
    df = (date_from or "").strip()
    dt = (date_to or "").strip()
    dt_end = (dt + "T23:59:59") if dt else None

    cursor = db.orders.find(query, {"_id": 0}).sort("created_at", -1)
    async for order in cursor:
        files = order.get("cad_files") or []
        if not files:
            continue
        order_match_q = (
            needle in (order.get("jewelry_name") or "").lower()
            or needle in (order.get("order_ref") or "").lower()
        )
        for f in files:
            uploaded = f.get("uploaded_at") or ""
            if df and uploaded < df:
                continue
            if dt_end and uploaded > dt_end:
                continue
            if needle and not (
                order_match_q or needle in (f.get("name") or "").lower()
            ):
                continue
            rows.append(
                {
                    **f,
                    "order_id": order.get("id"),
                    "order_ref": order.get("order_ref"),
                    "jewelry_name": order.get("jewelry_name"),
                    "manufacturer_id": order.get("manufacturer_id"),
                    "manufacturer_name": order.get("manufacturer_name"),
                    "manufacturer_alias": order.get("manufacturer_alias"),
                    "client_id": order.get("client_id"),
                    "client_name": order.get("client_name"),
                }
            )

    # Final sort: newest uploaded_at first; missing timestamps sink to the end.
    rows.sort(key=lambda r: r.get("uploaded_at") or "", reverse=True)
    return rows


class CadLibraryEmailItem(BaseModel):
    order_id: str
    file_id: str


class CadLibraryEmailPayload(BaseModel):
    recipients: list[str]
    items: list[CadLibraryEmailItem]
    subject: str | None = None
    message: str | None = None


@router.post("/admin/cad-files/email")
async def admin_email_cross_order_cad_files(
    body: CadLibraryEmailPayload,
    user=Depends(require_roles("admin")),
):
    """Bulk-email a selection of CAD files that may come from MANY different
    commissions. Composes a single email whose body groups the files by
    commission so the recipient sees clear provenance.

    Because the file rows reference orders other than the one the recipient
    cares about, the per-order context (jewelry name + order ref) is folded
    into the link labels — done client-side in the email template.
    """
    from _email import send_files_email
    from routes.orders._shared import sanitize_recipients

    cleaned = sanitize_recipients(body.recipients)
    if not cleaned:
        raise HTTPException(
            status_code=400, detail="Add at least one valid recipient email."
        )
    if len(cleaned) > 50:
        raise HTTPException(
            status_code=400, detail="Maximum 50 recipients per email."
        )
    if not body.items:
        raise HTTPException(status_code=400, detail="Select at least one file.")

    # Group requested {order_id, file_id} pairs so we only hit Mongo once per
    # order, not once per file.
    grouped: dict[str, set[str]] = {}
    for it in body.items:
        grouped.setdefault(it.order_id, set()).add(it.file_id)

    selected: list[dict] = []
    for order_id, file_ids in grouped.items():
        order = await db.orders.find_one(
            {"id": order_id, "$or": [
                {"deleted_at": {"$exists": False}},
                {"deleted_at": None},
                {"deleted_at": ""},
            ]},
            {"_id": 0},
        )
        if not order:
            continue
        ref = order.get("order_ref") or ""
        jewel = order.get("jewelry_name") or ""
        for f in (order.get("cad_files") or []):
            if f.get("id") not in file_ids:
                continue
            # Folder the per-order context into the filename used in the
            # email so the recipient can tell which commission each link
            # belongs to.
            label = f.get("name") or "CAD file"
            if jewel or ref:
                provenance = " · ".join(s for s in (jewel, ref) if s)
                label = f"{label}  ({provenance})"
            selected.append({**f, "name": label})

    if not selected:
        raise HTTPException(
            status_code=400, detail="None of the selected files were found."
        )

    try:
        provider_response = send_files_email(
            kind="cad",
            recipients=cleaned,
            subject=body.subject,
            message=body.message,
            sender_name=user.get("name"),
            sender_email=user.get("email"),
            order_ref=None,
            jewelry_name=None,
            files=selected,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Email provider error: {exc}"
        ) from exc

    return {
        "ok": True,
        "recipients": cleaned,
        "file_count": len(selected),
        "order_count": len(grouped),
        "provider_id": (
            provider_response.get("id")
            if isinstance(provider_response, dict)
            else None
        ),
    }


# ---- Seed: CAD & Render vendors -------------------------------------------
# Idempotent — running this multiple times will not duplicate vendors. Useful
# from the Atelier Debug screen to spin up a demo directory quickly.
@router.get("/admin/renders")
async def admin_list_all_renders(
    user=Depends(require_roles("admin")),
    cad_renderer_id: str | None = None,
    manufacturer_id: str | None = None,
    client_id: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Cross-order render library. Returns every APPROVED render (no pending
    entries) across every commission, enriched with its parent context.
    Mirrors :func:`admin_list_all_cad_files` so the frontend can reuse the
    same UX shell.

    Filters (all optional):
    * ``cad_renderer_id`` — narrow to a specific CAD/Render vendor
    * ``manufacturer_id`` — narrow to a specific workshop (orthogonal axis)
    * ``client_id``       — narrow to a specific client (orthogonal axis)
    * ``q``               — case-insensitive substring against render name,
                            jewelry name or order ref
    * ``date_from`` /
      ``date_to``         — inclusive ``uploaded_at`` window (YYYY-MM-DD)
    """
    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
            {"deleted_at": ""},
        ]
    }
    query: dict = {"$and": [not_deleted, {"renders": {"$exists": True, "$ne": []}}]}
    if cad_renderer_id:
        query["$and"].append({"cad_renderer_id": cad_renderer_id})
    if manufacturer_id:
        query["$and"].append({"manufacturer_id": manufacturer_id})
    if client_id:
        query["$and"].append({"client_id": client_id})

    rows: list[dict] = []
    needle = (q or "").strip().lower()
    df = (date_from or "").strip()
    dt = (date_to or "").strip()
    dt_end = (dt + "T23:59:59") if dt else None

    cursor = db.orders.find(query, {"_id": 0}).sort("created_at", -1)
    async for order in cursor:
        files = order.get("renders") or []
        if not files:
            continue
        order_match_q = (
            needle in (order.get("jewelry_name") or "").lower()
            or needle in (order.get("order_ref") or "").lower()
        )
        for f in files:
            uploaded = f.get("uploaded_at") or ""
            if df and uploaded < df:
                continue
            if dt_end and uploaded > dt_end:
                continue
            if needle and not (
                order_match_q or needle in (f.get("name") or "").lower()
            ):
                continue
            rows.append(
                {
                    **f,
                    "order_id": order.get("id"),
                    "order_ref": order.get("order_ref"),
                    "jewelry_name": order.get("jewelry_name"),
                    "manufacturer_id": order.get("manufacturer_id"),
                    "manufacturer_name": order.get("manufacturer_name"),
                    "manufacturer_alias": order.get("manufacturer_alias"),
                    "cad_renderer_id": order.get("cad_renderer_id"),
                    "cad_renderer_name": order.get("cad_renderer_name"),
                    "client_id": order.get("client_id"),
                    "client_name": order.get("client_name"),
                }
            )

    rows.sort(key=lambda r: r.get("uploaded_at") or "", reverse=True)
    return rows


@router.post("/admin/renders/email")
async def admin_email_cross_order_renders(
    body: CadLibraryEmailPayload,
    user=Depends(require_roles("admin")),
):
    """Bulk-email a multi-commission selection of renders. Same shape and
    semantics as the cross-order CAD endpoint — file IDs reference entries
    in ``order.renders`` (live, approved). Provenance (jewelry name + order
    ref) is appended to each link label so recipients can tell which
    commission a render belongs to."""
    from _email import send_files_email
    from routes.orders._shared import sanitize_recipients

    cleaned = sanitize_recipients(body.recipients)
    if not cleaned:
        raise HTTPException(
            status_code=400, detail="Add at least one valid recipient email."
        )
    if len(cleaned) > 50:
        raise HTTPException(
            status_code=400, detail="Maximum 50 recipients per email."
        )
    if not body.items:
        raise HTTPException(status_code=400, detail="Select at least one render.")

    grouped: dict[str, set[str]] = {}
    for it in body.items:
        grouped.setdefault(it.order_id, set()).add(it.file_id)

    selected: list[dict] = []
    for order_id, file_ids in grouped.items():
        order = await db.orders.find_one(
            {"id": order_id, "$or": [
                {"deleted_at": {"$exists": False}},
                {"deleted_at": None},
                {"deleted_at": ""},
            ]},
            {"_id": 0},
        )
        if not order:
            continue
        ref = order.get("order_ref") or ""
        jewel = order.get("jewelry_name") or ""
        for f in (order.get("renders") or []):
            if f.get("id") not in file_ids:
                continue
            label = f.get("name") or "Render"
            if jewel or ref:
                provenance = " · ".join(s for s in (jewel, ref) if s)
                label = f"{label}  ({provenance})"
            selected.append({**f, "name": label})

    if not selected:
        raise HTTPException(
            status_code=400,
            detail="None of the selected renders were found.",
        )

    try:
        # Reuse the CAD email template — visually identical and the
        # subject defaults can be overridden by the caller.
        provider_response = send_files_email(
            kind="cad",
            recipients=cleaned,
            subject=body.subject or "Renders",
            message=body.message,
            sender_name=user.get("name"),
            sender_email=user.get("email"),
            order_ref=None,
            jewelry_name=None,
            files=selected,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Email provider error: {exc}"
        ) from exc

    return {
        "ok": True,
        "recipients": cleaned,
        "file_count": len(selected),
        "order_count": len(grouped),
        "provider_id": (
            provider_response.get("id")
            if isinstance(provider_response, dict)
            else None
        ),
    }


# ---- Cross-Order IGI / Customs / Airway Bill Libraries -------------------
# Three sibling endpoints that mirror the CAD/Renders library pattern. Each
# returns a flat list of file rows enriched with the parent commission
# context (order_ref, jewelry_name, manufacturer details). All three are
# filtered by `manufacturer_id` (workshop) since these documents originate
# from the workshop side of the supply chain.
#
# The data layout differs per kind:
#   * IGI       -> `order.igi_certificates`               (top-level array)
#   * Airway    -> `order.customs.airway_bill_files`      (nested under customs)
#   * Customs   -> `order.customs.customs_files`          (nested under customs)
#
# We share a single helper so future kinds (e.g. invoices) can hook in with
# one line.


async def _list_cross_order_doc_files(
    *,
    field_path: tuple[str, ...],
    manufacturer_id: str | None,
    client_id: str | None,
    q: str | None,
    date_from: str | None,
    date_to: str | None,
) -> list[dict]:
    """Walks every non-deleted order and emits one row per file found at
    ``field_path`` (e.g. ``("igi_certificates",)`` or
    ``("customs", "airway_bill_files")``).

    Same filter semantics as ``admin_list_all_cad_files``: workshop, client,
    free-text against (jewelry_name | order_ref | file name), and an
    inclusive ``uploaded_at`` date window.
    """
    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
            {"deleted_at": ""},
        ]
    }
    query: dict = {"$and": [not_deleted]}
    if manufacturer_id:
        query["$and"].append({"manufacturer_id": manufacturer_id})
    if client_id:
        query["$and"].append({"client_id": client_id})

    needle = (q or "").strip().lower()
    df = (date_from or "").strip()
    dt = (date_to or "").strip()
    dt_end = (dt + "T23:59:59") if dt else None

    rows: list[dict] = []
    cursor = db.orders.find(query, {"_id": 0}).sort("created_at", -1)
    async for order in cursor:
        # Walk the nested path to fetch the file array.
        container: object = order
        for key in field_path:
            if isinstance(container, dict):
                container = container.get(key)
            else:
                container = None
                break
        files = container if isinstance(container, list) else []
        if not files:
            continue

        order_match_q = (
            needle in (order.get("jewelry_name") or "").lower()
            or needle in (order.get("order_ref") or "").lower()
        )
        for f in files:
            if not isinstance(f, dict):
                continue
            uploaded = f.get("uploaded_at") or ""
            if df and uploaded < df:
                continue
            if dt_end and uploaded > dt_end:
                continue
            if needle and not (
                order_match_q or needle in (f.get("name") or "").lower()
            ):
                continue
            rows.append(
                {
                    **f,
                    "order_id": order.get("id"),
                    "order_ref": order.get("order_ref"),
                    "jewelry_name": order.get("jewelry_name"),
                    "manufacturer_id": order.get("manufacturer_id"),
                    "manufacturer_name": order.get("manufacturer_name"),
                    "manufacturer_alias": order.get("manufacturer_alias"),
                    "client_id": order.get("client_id"),
                    "client_name": order.get("client_name"),
                }
            )

    rows.sort(key=lambda r: r.get("uploaded_at") or "", reverse=True)
    return rows


@router.get("/admin/igi-certificates")
async def admin_list_all_igi_certificates(
    user=Depends(require_roles("admin")),
    manufacturer_id: str | None = None,
    client_id: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Returns all approved IGI certificates across every commission. Mirrors
    ``admin_list_all_cad_files`` (same filter contract + enrichment fields)."""
    return await _list_cross_order_doc_files(
        field_path=("igi_certificates",),
        manufacturer_id=manufacturer_id,
        client_id=client_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/admin/airway-bill-files")
async def admin_list_all_airway_bill_files(
    user=Depends(require_roles("admin")),
    manufacturer_id: str | None = None,
    client_id: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Returns all airway-bill documents across every commission. The files
    live under ``order.customs.airway_bill_files``."""
    return await _list_cross_order_doc_files(
        field_path=("customs", "airway_bill_files"),
        manufacturer_id=manufacturer_id,
        client_id=client_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/admin/customs-files")
async def admin_list_all_customs_files(
    user=Depends(require_roles("admin")),
    manufacturer_id: str | None = None,
    client_id: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Returns all customs documents across every commission. The files live
    under ``order.customs.customs_files``."""
    return await _list_cross_order_doc_files(
        field_path=("customs", "customs_files"),
        manufacturer_id=manufacturer_id,
        client_id=client_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


# ---- Cross-order email helpers for the new libraries ---------------------


class DocLibraryEmailItem(BaseModel):
    order_id: str
    file_id: str


class DocLibraryEmailPayload(BaseModel):
    recipients: list[str]
    items: list[DocLibraryEmailItem]
    subject: str | None = None
    message: str | None = None


async def _bulk_email_doc_library(
    *,
    body: DocLibraryEmailPayload,
    user: dict,
    field_path: tuple[str, ...],
    kind: str,
    default_subject: str,
) -> dict:
    """Shared bulk-email implementation for the IGI / airway bill / customs
    libraries. Mirrors ``admin_email_cross_order_cad_files`` exactly so the
    frontend can reuse ``EmailFilesModal`` without surprises."""
    from _email import send_files_email
    from routes.orders._shared import sanitize_recipients

    cleaned = sanitize_recipients(body.recipients)
    if not cleaned:
        raise HTTPException(
            status_code=400, detail="Add at least one valid recipient email."
        )
    if len(cleaned) > 50:
        raise HTTPException(
            status_code=400, detail="Maximum 50 recipients per email."
        )
    if not body.items:
        raise HTTPException(status_code=400, detail="Select at least one file.")

    grouped: dict[str, set[str]] = {}
    for it in body.items:
        grouped.setdefault(it.order_id, set()).add(it.file_id)

    selected: list[dict] = []
    for order_id, file_ids in grouped.items():
        order = await db.orders.find_one(
            {
                "id": order_id,
                "$or": [
                    {"deleted_at": {"$exists": False}},
                    {"deleted_at": None},
                    {"deleted_at": ""},
                ],
            },
            {"_id": 0},
        )
        if not order:
            continue
        ref = order.get("order_ref") or ""
        jewel = order.get("jewelry_name") or ""
        container: object = order
        for key in field_path:
            if isinstance(container, dict):
                container = container.get(key)
            else:
                container = None
                break
        files = container if isinstance(container, list) else []
        for f in files:
            if not isinstance(f, dict) or f.get("id") not in file_ids:
                continue
            label = f.get("name") or f"{kind} file"
            if jewel or ref:
                provenance = " \u00b7 ".join(s for s in (jewel, ref) if s)
                label = f"{label}  ({provenance})"
            selected.append({**f, "name": label})

    if not selected:
        raise HTTPException(
            status_code=400, detail="None of the selected files were found."
        )

    try:
        provider_response = send_files_email(
            kind=kind,
            recipients=cleaned,
            subject=body.subject or default_subject,
            message=body.message,
            sender_name=user.get("name"),
            sender_email=user.get("email"),
            order_ref=None,
            jewelry_name=None,
            files=selected,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Email provider error: {exc}"
        ) from exc

    return {
        "ok": True,
        "recipients": cleaned,
        "file_count": len(selected),
        "order_count": len(grouped),
        "provider_id": (
            provider_response.get("id")
            if isinstance(provider_response, dict)
            else None
        ),
    }


@router.post("/admin/igi-certificates/email")
async def admin_email_cross_order_igi(
    body: DocLibraryEmailPayload,
    user=Depends(require_roles("admin")),
):
    return await _bulk_email_doc_library(
        body=body,
        user=user,
        field_path=("igi_certificates",),
        kind="igi",
        default_subject="IGI Certificates",
    )


@router.post("/admin/airway-bill-files/email")
async def admin_email_cross_order_airway_bills(
    body: DocLibraryEmailPayload,
    user=Depends(require_roles("admin")),
):
    return await _bulk_email_doc_library(
        body=body,
        user=user,
        field_path=("customs", "airway_bill_files"),
        kind="airway_bill",
        default_subject="Airway Bill Documents",
    )


@router.post("/admin/customs-files/email")
async def admin_email_cross_order_customs(
    body: DocLibraryEmailPayload,
    user=Depends(require_roles("admin")),
):
    return await _bulk_email_doc_library(
        body=body,
        user=user,
        field_path=("customs", "customs_files"),
        kind="customs",
        default_subject="Customs Documents",
    )


@router.post("/seed-cad-renderers")
async def seed_cad_renderers(user=Depends(require_roles("admin"))):
    """Seeds 4 production-grade CAD/Render vendor accounts with realistic
    aliases, country, contacts roster and the standard temporary password
    ``Cad@2026``. Returns the list of created/existing vendor IDs."""
    AT = chr(64)
    DOMAIN = AT + "somnio.co"
    vendors = [
        {
            "email": "atelier3d-geneva" + DOMAIN,
            "name": "Atelier 3D Geneva",
            "alias": "Somnio.Co Render Studio I",
            "country": "CH",
            "phone_dial_code": "+41",
            "phone_number": "22 555 0184",
            "city": "Geneva",
            "address_line1": "Rue du Rhône 65",
            "contacts": [
                {"name": "Claire Moreau", "role": "Lead Render Artist", "email": "claire" + AT + "atelier3d.ch", "phone": "+41 22 555 0184"},
                {"name": "Henri Dubois", "role": "CAD Engineer", "email": "henri" + AT + "atelier3d.ch", "phone": "+41 22 555 0185"},
                {"name": "", "role": "", "email": "", "phone": ""},
            ],
        },
        {
            "email": "lumiere-paris" + DOMAIN,
            "name": "Lumière Render Studio",
            "alias": "Somnio.Co Render Studio II",
            "country": "FR",
            "phone_dial_code": "+33",
            "phone_number": "1 42 78 0149",
            "city": "Paris",
            "address_line1": "8 Rue Saint-Honoré",
            "contacts": [
                {"name": "Élodie Laurent", "role": "Creative Director", "email": "elodie" + AT + "lumiere.fr", "phone": "+33 1 42 78 0149"},
                {"name": "Antoine Garnier", "role": "Senior CAD Modeller", "email": "antoine" + AT + "lumiere.fr", "phone": "+33 1 42 78 0150"},
                {"name": "Camille Roux", "role": "Render Specialist", "email": "camille" + AT + "lumiere.fr", "phone": "+33 1 42 78 0151"},
            ],
        },
        {
            "email": "hyperrender-tokyo" + DOMAIN,
            "name": "Hyper-Render Studio Tokyo",
            "alias": "Somnio.Co Render Studio III",
            "country": "JP",
            "phone_dial_code": "+81",
            "phone_number": "3 5413 7220",
            "city": "Tokyo",
            "address_line1": "Ginza 7-12-15, Chuo",
            "contacts": [
                {"name": "Yuki Tanaka", "role": "Lead Artist", "email": "yuki" + AT + "hyperrender.jp", "phone": "+81 3 5413 7220"},
                {"name": "Kenji Nakamura", "role": "STL/CAD Engineer", "email": "kenji" + AT + "hyperrender.jp", "phone": "+81 3 5413 7221"},
                {"name": "", "role": "", "email": "", "phone": ""},
            ],
        },
        {
            "email": "vector-nyc" + DOMAIN,
            "name": "Vector Studio NYC",
            "alias": "Somnio.Co Render Studio IV",
            "country": "US",
            "phone_dial_code": "+1",
            "phone_number": "212 555 0188",
            "city": "New York",
            "state": "NY",
            "address_line1": "47 W 47th St, Suite 1108",
            "contacts": [
                {"name": "Sasha Reilly", "role": "Studio Lead", "email": "sasha" + AT + "vector-nyc.com", "phone": "+1 212 555 0188"},
                {"name": "Marcus Lee", "role": "Senior CAD Designer", "email": "marcus" + AT + "vector-nyc.com", "phone": "+1 212 555 0189"},
                {"name": "Priya Kapoor", "role": "Render Artist", "email": "priya" + AT + "vector-nyc.com", "phone": "+1 212 555 0190"},
            ],
        },
    ]

    created: list[dict] = []
    skipped: list[dict] = []
    pwd_hash = hash_password("Cad" + AT + "2026")
    for spec in vendors:
        existing = await db.users.find_one({"email": spec["email"]})
        if existing:
            skipped.append({"id": existing["id"], "email": spec["email"], "name": existing.get("name")})
            continue
        contacts = sanitize_manufacturer_contacts(spec["contacts"])
        user_id = str(uuid.uuid4())
        await db.users.insert_one(
            {
                "id": user_id,
                "email": spec["email"],
                "hashed_password": pwd_hash,
                "name": spec["name"],
                "role": "cad_renderer",
                "associate_id": None,
                "auto_forward": False,
                "alias": spec["alias"],
                "country": spec.get("country"),
                "phone_dial_code": spec.get("phone_dial_code"),
                "phone_number": spec.get("phone_number"),
                "city": spec.get("city"),
                "state": spec.get("state"),
                "address_line1": spec.get("address_line1"),
                "contacts": contacts,
                "primary_contact_id": contacts[0]["id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        created.append({"id": user_id, "email": spec["email"], "name": spec["name"]})

    return {
        "ok": True,
        "created": created,
        "skipped": skipped,
        "total": len(created) + len(skipped),
    }

