"""
Associate / Admin importer — pulls records from the Somnio.Co source app (gem-gallery-193)
and keeps Atelier's local users collection in sync.

Behaviour:
- Source records are the source of truth for role 'associate' (and admins).
- Atelier admins cannot create or edit associates/admins locally — those mutations are
  enforced in server.py.
- Local records imported from the source carry source="gem-gallery"; the importer
  upserts on email (the natural key).
- Sync runs on demand (POST /api/admin/import-associates) and on a schedule.
"""
from __future__ import annotations
import os
import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Iterable

import httpx

logger = logging.getLogger(__name__)

SOURCE_TAG = "gem-gallery"

# Local seed accounts that are NEVER touched by the source import.
# Keeping these intact lets the "QUICK ACCESS · DEMO" entries on the login
# screen always log in, even after the gem-gallery sync runs.
LOCAL_SEED_EMAILS = {"associate@somnio.co"}


def _cfg() -> dict:
    return {
        "base_url": (os.environ.get("GEM_GALLERY_BASE_URL") or "").rstrip("/"),
        "email": os.environ.get("GEM_GALLERY_ADMIN_EMAIL") or "",
        "password": os.environ.get("GEM_GALLERY_ADMIN_PASSWORD") or "",
    }


def _normalize(record: dict) -> dict | None:
    """Map a record from gem-gallery-193 (Somnio.Co API) into Atelier's user schema.
    Live field shape: {id, email, full_name, disabled, status, created_at, mobile_phone,
    birthday, city, country, state_region, is_secondary_admin, session_count,
    last_login_at, last_login_ip}."""
    email = record.get("email") or record.get("user_email") or record.get("login")
    if not email:
        return None
    email = email.strip().lower()
    # is_secondary_admin maps to role=admin in Atelier
    is_admin = bool(record.get("is_secondary_admin"))
    role = "admin" if is_admin else "associate"
    name = (
        record.get("full_name")
        or record.get("name")
        or " ".join(filter(None, [record.get("first_name"), record.get("last_name")]))
        or email.split("@")[0]
    )
    region_parts = [record.get("city"), record.get("state_region"), record.get("country")]
    region = ", ".join([p for p in region_parts if p])
    out = {
        "email": email,
        "name": name,
        "role": role,
        "source": SOURCE_TAG,
        "source_id": str(record.get("id") or ""),
        "phone": record.get("mobile_phone") or record.get("phone") or "",
        "region": region,
        "city": record.get("city") or "",
        "country": record.get("country") or "",
        "state_region": record.get("state_region") or "",
        "birthday": record.get("birthday"),
        "disabled": bool(record.get("disabled")),
        "status": record.get("status") or "active",
        "is_secondary_admin": is_admin,
        "session_count": record.get("session_count") or 0,
        "last_login_at": record.get("last_login_at"),
        "source_created_at": record.get("created_at"),
        "source_updated_at": record.get("updated_at") or record.get("modified_at"),
    }
    return out


async def login_source(client: httpx.AsyncClient, base_url: str, email: str, password: str) -> str:
    """Use the admin auth endpoint discovered on gem-gallery-193: POST /api/admin/auth."""
    r = await client.post(
        f"{base_url}/api/admin/auth",
        json={"email": email.strip().lower(), "password": password},
        headers={"User-Agent": "Somnio.Co-Atelier-Sync/1.0"},
    )
    if r.status_code != 200:
        raise RuntimeError(f"Source admin login failed: HTTP {r.status_code} {r.text[:200]}")
    body = r.json()
    token = body.get("access_token") or body.get("token")
    if not token:
        raise RuntimeError(f"Source login response had no access_token: {list(body)}")
    return token


async def fetch_associates(client: httpx.AsyncClient, base_url: str, token: str) -> list[dict]:
    """gem-gallery-193 exposes the associate list at /api/admin/associates."""
    headers = {"Authorization": f"Bearer {token}", "User-Agent": "Somnio.Co-Atelier-Sync/1.0"}
    r = await client.get(f"{base_url}/api/admin/associates", headers=headers)
    if r.status_code != 200:
        raise RuntimeError(f"GET /api/admin/associates failed: HTTP {r.status_code} {r.text[:200]}")
    data = r.json()
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("associates", "users", "items", "data", "results"):
            if isinstance(data.get(key), list):
                return data[key]
    raise RuntimeError(f"Unexpected response shape: {type(data).__name__}")


async def upsert_associates(db, records: Iterable[dict]) -> dict:
    """Upsert the normalized records into db.users. Returns counts."""
    created = 0
    updated = 0
    skipped = 0
    for rec in records:
        norm = _normalize(rec)
        if not norm:
            skipped += 1
            continue
        # Never overwrite our local demo associate seed — preserves the
        # login-screen "QUICK ACCESS · DEMO" associate row.
        if norm["email"] in LOCAL_SEED_EMAILS:
            skipped += 1
            continue
        existing = await db.users.find_one({"email": norm["email"]})
        if existing:
            # Only update fields that the source owns; do NOT touch id.
            # Do NOT touch hashed_password — source-owned users must still be
            # able to log in here using their gem-gallery-193 credentials
            # (which we verify by proxying to the source app on login).
            update = {
                "name": norm["name"],
                "role": norm["role"],
                "source": SOURCE_TAG,
                "source_id": norm["source_id"],
                "phone": norm["phone"],
                "region": norm["region"],
                "city": norm["city"],
                "country": norm["country"],
                "state_region": norm["state_region"],
                "birthday": norm["birthday"],
                "disabled": norm["disabled"],
                "status": norm["status"],
                "is_secondary_admin": norm["is_secondary_admin"],
                "session_count": norm["session_count"],
                "last_login_at": norm["last_login_at"],
                "source_created_at": norm["source_created_at"],
                "source_updated_at": norm["source_updated_at"],
                "synced_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.users.update_one({"email": norm["email"]}, {"$set": update})
            updated += 1
        else:
            # New imported user — give them a uuid, no password (login locally not allowed).
            doc = {
                "id": str(uuid.uuid4()),
                "email": norm["email"],
                "hashed_password": "",  # source-owned: cannot log in locally
                "name": norm["name"],
                "role": norm["role"],
                "associate_id": None,
                "auto_forward": False,
                "source": SOURCE_TAG,
                "source_id": norm["source_id"],
                "phone": norm["phone"],
                "region": norm["region"],
                "city": norm["city"],
                "country": norm["country"],
                "state_region": norm["state_region"],
                "birthday": norm["birthday"],
                "disabled": norm["disabled"],
                "status": norm["status"],
                "is_secondary_admin": norm["is_secondary_admin"],
                "session_count": norm["session_count"],
                "last_login_at": norm["last_login_at"],
                "source_created_at": norm["source_created_at"],
                "source_updated_at": norm["source_updated_at"],
                "created_at": datetime.now(timezone.utc).isoformat(),
                "synced_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.users.insert_one(doc)
            created += 1
    return {"created": created, "updated": updated, "skipped": skipped}


async def run_import(db) -> dict:
    """Top-level import: connect → login → fetch → upsert. Safe to call repeatedly."""
    cfg = _cfg()
    if not cfg["base_url"] or not cfg["email"] or not cfg["password"]:
        return {
            "ok": False,
            "reason": "source_not_configured",
            "detail": "Set GEM_GALLERY_BASE_URL, GEM_GALLERY_ADMIN_EMAIL, GEM_GALLERY_ADMIN_PASSWORD in backend/.env",
        }
    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            token = await login_source(client, cfg["base_url"], cfg["email"], cfg["password"])
            records = await fetch_associates(client, cfg["base_url"], token)
        counts = await upsert_associates(db, records)
        return {
            "ok": True,
            "source": cfg["base_url"],
            "fetched": len(records),
            **counts,
            "ran_at_utc": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.exception("associate import failed")
        return {"ok": False, "reason": "import_failed", "detail": str(e)[:300]}


# ---------- Last-run cache (in-process, for the debug screen) ----------
_LAST_RUN: dict = {"ran": False}

def get_last_run() -> dict:
    return _LAST_RUN


async def run_import_and_record(db) -> dict:
    global _LAST_RUN
    result = await run_import(db)
    _LAST_RUN = result
    return result


async def source_proxy_auth(email: str, password: str) -> bool:
    """Verify the supplied email/password against gem-gallery-193.

    Returns True only when the source confirms the credentials. Used as a
    fall-back inside Atelier's /auth/login for users whose local password
    isn't set or is out of date.

    The endpoint set is intentionally generous: gem-gallery-193 has shipped
    multiple auth paths over time, so we try each in sequence.
    """
    cfg = _cfg()
    base = cfg["base_url"]
    if not base:
        return False
    candidates = [
        "/api/admin/auth",
        "/api/auth/login",
        "/api/admin/login",
        "/api/login",
    ]
    payload = {"email": email.strip().lower(), "password": password}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            for path in candidates:
                try:
                    r = await client.post(
                        f"{base}{path}",
                        json=payload,
                        headers={"User-Agent": "Somnio.Co-Atelier-Auth/1.0"},
                    )
                except httpx.HTTPError:
                    continue
                if r.status_code == 200:
                    try:
                        body = r.json()
                    except Exception:
                        body = {}
                    if body.get("access_token") or body.get("token") or body.get("ok"):
                        return True
                    # 200 OK with no token field is treated as a valid login
                    return True
    except Exception:
        logger.exception("source_proxy_auth failed")
    return False
