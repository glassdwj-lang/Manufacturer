"""Outbound manufacturer sync — Somnio.Co → gem-gallery-193.

Somnio.Co (this app) is the source of truth for manufacturer identity,
codes, and status. gem-gallery-193 acts as a downstream mirror: every
manufacturer create / update / status-change here is pushed there so
both apps stay in step.

Design choices
==============
* One-way outbound. gem-gallery never writes back to Somnio's mfr
  directory. We *do* support an idempotent "ingest" (read-only) for
  the one-shot bootstrap and for periodic reconciliation.
* Best-effort with pending-sync flags. When the push fails (gem-gallery
  is asleep, network hiccup, 5xx…) the local doc is marked
  ``pending_sync=True`` with the error captured on
  ``last_sync_error``. A retry endpoint on the router drains the queue.
* Token cache: gem-gallery's admin session is cached in-memory for
  ~15 minutes so we don't hammer ``/api/admin/auth`` on every push.
* PATCH quirk: gem-gallery ignores ``None`` on PATCH — it treats null
  as "no change". To *clear* a field we send an empty string. This
  helper handles the translation.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

_TOKEN_CACHE: Dict[str, Any] = {"token": None, "expires_at": None}
_LOCK = asyncio.Lock()


def _base() -> Optional[str]:
    b = os.environ.get("GEM_GALLERY_BASE_URL")
    return b.rstrip("/") if b else None


def _clear_null_values_for_patch(payload: Dict[str, Any]) -> Dict[str, Any]:
    """gem-gallery's PATCH ignores ``None``. Rewrite null→"" so the
    caller's intent to *clear* actually lands on the remote side.
    """
    out: Dict[str, Any] = {}
    for k, v in payload.items():
        if v is None:
            out[k] = ""
        else:
            out[k] = v
    return out


async def _admin_token(c: httpx.AsyncClient) -> str:
    """Fetch (or reuse) a gem-gallery admin JWT."""
    async with _LOCK:
        now = datetime.now(timezone.utc)
        if _TOKEN_CACHE["token"] and _TOKEN_CACHE["expires_at"] and _TOKEN_CACHE["expires_at"] > now:
            return _TOKEN_CACHE["token"]
        base = _base()
        email = os.environ.get("GEM_GALLERY_ADMIN_EMAIL")
        pw = os.environ.get("GEM_GALLERY_ADMIN_PASSWORD")
        if not (base and email and pw):
            raise RuntimeError("gem-gallery credentials not configured")
        r = await c.post(f"{base}/api/admin/auth", json={"email": email, "password": pw})
        if r.status_code != 200:
            raise RuntimeError(f"gem-gallery auth failed HTTP {r.status_code}")
        tok = r.json()["access_token"]
        _TOKEN_CACHE["token"] = tok
        _TOKEN_CACHE["expires_at"] = now + timedelta(minutes=15)
        return tok


def _headers(token: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ----------------------------------------------------------------------
# Public helpers — each returns (ok, remote_body_or_error_str)
# ----------------------------------------------------------------------
async def list_remote(include_burned: bool = True, include_paused: bool = True) -> List[Dict[str, Any]]:
    base = _base()
    if not base:
        return []
    async with httpx.AsyncClient(timeout=25) as c:
        tok = await _admin_token(c)
        r = await c.get(
            f"{base}/api/admin/manufacturers?include_burned={str(include_burned).lower()}"
            f"&include_paused={str(include_paused).lower()}",
            headers=_headers(tok),
        )
        r.raise_for_status()
        return r.json()


async def create_remote(payload: Dict[str, Any]) -> Tuple[bool, Any]:
    """Push a new manufacturer to gem-gallery.

    Only the fields gem-gallery accepts are forwarded (name, contact_email,
    contact_name, contact_phone, country, notes). Somnio-internal fields
    like `code` or `status` are managed by gem-gallery's own allocator
    on their side.
    """
    base = _base()
    if not base:
        return False, "GEM_GALLERY_BASE_URL not set"
    body = {k: v for k, v in payload.items() if k in
            ("name", "contact_email", "contact_name", "contact_phone", "country", "notes")}
    async with httpx.AsyncClient(timeout=25) as c:
        try:
            tok = await _admin_token(c)
            r = await c.post(f"{base}/api/admin/manufacturers", json=body, headers=_headers(tok))
            if r.status_code >= 400:
                logger.warning("gg mfr create failed %s %s", r.status_code, r.text[:200])
                return False, f"HTTP {r.status_code}: {r.text[:250]}"
            return True, r.json()
        except Exception as exc:  # noqa: BLE001 — surface as pending_sync
            logger.warning("gg mfr create exception: %s", exc)
            return False, f"exception: {exc}"


async def update_remote(gem_gallery_id: str, patch: Dict[str, Any]) -> Tuple[bool, Any]:
    base = _base()
    if not base or not gem_gallery_id:
        return False, "missing base_url or gem_gallery_id"
    body = _clear_null_values_for_patch(
        {k: v for k, v in patch.items() if k in
         ("name", "contact_email", "contact_name", "contact_phone", "country", "notes")}
    )
    if not body:
        return True, {"noop": True}
    async with httpx.AsyncClient(timeout=25) as c:
        try:
            tok = await _admin_token(c)
            r = await c.patch(f"{base}/api/admin/manufacturers/{gem_gallery_id}",
                              json=body, headers=_headers(tok))
            if r.status_code >= 400:
                return False, f"HTTP {r.status_code}: {r.text[:250]}"
            return True, r.json()
        except Exception as exc:  # noqa: BLE001
            return False, f"exception: {exc}"


async def change_status_remote(gem_gallery_id: str, status: str) -> Tuple[bool, Any]:
    base = _base()
    if not base or not gem_gallery_id:
        return False, "missing base_url or gem_gallery_id"
    async with httpx.AsyncClient(timeout=25) as c:
        try:
            tok = await _admin_token(c)
            # gem-gallery-193 expects PATCH on the /status sub-resource (POST returns 405).
            r = await c.patch(
                f"{base}/api/admin/manufacturers/{gem_gallery_id}/status",
                json={"status": status},
                headers=_headers(tok),
            )
            if r.status_code >= 400:
                return False, f"HTTP {r.status_code}: {r.text[:250]}"
            return True, r.json()
        except Exception as exc:  # noqa: BLE001
            return False, f"exception: {exc}"


async def next_code_remote() -> Optional[int]:
    """Ask gem-gallery for its next available code — used only for
    dry-run comparison during bootstrap; Somnio owns code allocation."""
    base = _base()
    if not base:
        return None
    async with httpx.AsyncClient(timeout=25) as c:
        try:
            tok = await _admin_token(c)
            r = await c.get(f"{base}/api/admin/manufacturers/next-code", headers=_headers(tok))
            if r.status_code != 200:
                return None
            body = r.json()
            return int(body.get("next_code")) if body else None
        except Exception:  # noqa: BLE001
            return None
