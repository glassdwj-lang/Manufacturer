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


def _cfg() -> dict:
    return {
        "base_url": (os.environ.get("GEM_GALLERY_BASE_URL") or "").rstrip("/"),
        "email": os.environ.get("GEM_GALLERY_ADMIN_EMAIL") or "",
        "password": os.environ.get("GEM_GALLERY_ADMIN_PASSWORD") or "",
    }


def _normalize(record: dict) -> dict | None:
    """Map a record from the source schema into the local user schema.
    The exact field names in the source aren't 100% known yet, so we try a few
    common variants and keep whatever is present. Email is required."""
    email = (
        record.get("email")
        or record.get("user_email")
        or record.get("emailAddress")
        or record.get("login")
    )
    if not email:
        return None
    email = email.strip().lower()
    role_raw = (record.get("role") or record.get("user_role") or "associate").lower()
    role = "admin" if "admin" in role_raw else "associate"
    name = (
        record.get("name")
        or record.get("full_name")
        or record.get("display_name")
        or " ".join(filter(None, [record.get("first_name"), record.get("last_name")]))
        or email.split("@")[0]
    )
    out = {
        "email": email,
        "name": name,
        "role": role,
        "source": SOURCE_TAG,
        "source_id": str(record.get("id") or record.get("_id") or record.get("uuid") or ""),
        "phone": record.get("phone") or record.get("mobile") or "",
        "region": record.get("region") or record.get("country") or "",
        "source_updated_at": record.get("updated_at") or record.get("modified_at"),
    }
    return out


async def login_source(client: httpx.AsyncClient, base_url: str, email: str, password: str) -> str:
    r = await client.post(f"{base_url}/api/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        raise RuntimeError(f"Source login failed: HTTP {r.status_code} {r.text[:200]}")
    body = r.json()
    token = body.get("access_token") or body.get("token") or body.get("jwt")
    if not token:
        raise RuntimeError(f"Source login response had no token: {list(body)}")
    return token


async def fetch_associates(client: httpx.AsyncClient, base_url: str, token: str) -> list[dict]:
    """Try a handful of likely endpoints. First non-404 with a JSON list wins."""
    headers = {"Authorization": f"Bearer {token}"}
    candidates = [
        "/api/admin/associates",
        "/api/admin/users?role=associate",
        "/api/associates",
        "/api/users?role=associate",
        "/api/admin/team",
    ]
    last_err = ""
    for path in candidates:
        try:
            r = await client.get(f"{base_url}{path}", headers=headers)
        except Exception as e:
            last_err = f"{path} -> {e}"
            continue
        if r.status_code == 200:
            try:
                data = r.json()
            except Exception:
                continue
            if isinstance(data, list):
                logger.info("Source associates fetched from %s (%d rows)", path, len(data))
                return data
            if isinstance(data, dict):
                for key in ("associates", "users", "items", "data", "results"):
                    if isinstance(data.get(key), list):
                        logger.info("Source associates fetched from %s.%s (%d rows)", path, key, len(data[key]))
                        return data[key]
        last_err = f"{path} -> HTTP {r.status_code} {r.text[:120]}"
    raise RuntimeError(f"Could not locate associates endpoint. Last response: {last_err}")


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
        existing = await db.users.find_one({"email": norm["email"]})
        if existing:
            # Only update fields that the source owns; do NOT touch password / id.
            update = {
                "name": norm["name"],
                "role": norm["role"],
                "source": SOURCE_TAG,
                "source_id": norm["source_id"],
                "phone": norm["phone"],
                "region": norm["region"],
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
