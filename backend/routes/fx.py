"""Foreign-exchange endpoint — provides a **cached-daily** USD→AUD
reference rate used by the quotation calculator.

Design:
* Rate is fetched from a public, keyless mid-market source
  (``open.er-api.com``) at most once per 24 hours.
* Cached in the ``fx_rates`` Mongo collection, keyed by the currency
  pair (``USD_AUD``).
* If the upstream provider is unreachable the endpoint returns the
  stale cached rate with a ``stale: true`` flag so the UI never breaks.
* An optional ``?force=true`` query bypasses the cache — reserved for
  admin/debug use.

The rate returned here is the **raw mid-market** rate. Any per-quote
bank-buffer / adjustment percentage is layered on top of this rate by
the frontend (and stored on the quote itself for audit).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import httpx
from fastapi import APIRouter, Depends, HTTPException

from deps import db, require_roles

router = APIRouter()
log = logging.getLogger(__name__)

_CACHE_HOURS = 24
_PAIR = "USD_AUD"
_SOURCE_PRIMARY = "open.er-api.com"
_URL_PRIMARY = "https://open.er-api.com/v6/latest/USD"


async def _fetch_upstream() -> Dict[str, Any]:
    """Fetch a fresh USD-based rate table from the primary provider."""
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(_URL_PRIMARY)
        resp.raise_for_status()
        data = resp.json()
    if data.get("result") != "success":
        raise RuntimeError(f"upstream returned non-success payload: {data!r}")
    aud = data.get("rates", {}).get("AUD")
    if aud is None:
        raise RuntimeError("AUD missing from upstream response")
    return {
        "rate": round(float(aud), 6),
        "source": _SOURCE_PRIMARY,
        "upstream_updated_at": data.get("time_last_update_utc"),
    }


@router.get("/fx/usd-aud", summary="Live USD→AUD rate (cached 24 h)")
async def get_usd_aud_rate(
    force: bool = False,
    user=Depends(require_roles("admin")),
):
    """Return the cached USD→AUD rate, refreshing at most once per day.

    Response schema::

        {
          "pair": "USD_AUD",
          "rate": 1.5432,
          "fetched_at": "2026-06-12T04:11:22+00:00",
          "source": "open.er-api.com",
          "upstream_updated_at": "Wed, 12 Jun 2026 00:00:01 +0000",
          "stale": false           # true only when upstream was down
        }
    """
    doc = await db.fx_rates.find_one({"pair": _PAIR}, {"_id": 0})
    now = datetime.now(timezone.utc)

    # Serve fresh cache if within 24h.
    if doc and not force:
        try:
            fetched = datetime.fromisoformat(doc["fetched_at"])
            if now - fetched < timedelta(hours=_CACHE_HOURS):
                return {**doc, "stale": False}
        except Exception:
            # Corrupted timestamp — fall through to refresh.
            pass

    # Cache miss / expired — hit upstream.
    try:
        fresh = await _fetch_upstream()
    except Exception as exc:  # noqa: BLE001 — we want any failure to fall back
        log.warning("FX upstream fetch failed: %s", exc)
        if doc:
            return {**doc, "stale": True, "error": str(exc)}
        raise HTTPException(status_code=502, detail=f"FX fetch failed: {exc}") from exc

    new_doc = {
        "pair": _PAIR,
        "rate": fresh["rate"],
        "fetched_at": now.isoformat(),
        "source": fresh["source"],
        "upstream_updated_at": fresh.get("upstream_updated_at"),
    }
    await db.fx_rates.update_one({"pair": _PAIR}, {"$set": new_doc}, upsert=True)
    return {**new_doc, "stale": False}
