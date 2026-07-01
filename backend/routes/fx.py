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

Metals spot rates (XAU / XAG / XPT) are also fetched from a free
keyless source (``gold-api.com``) and cached daily. Purity-adjusted
per-gram rates for the alloys Somnio actually uses (10k / 14k / 18k
gold, Pt950 platinum, S925 sterling silver) are computed on demand
and snapshotted onto each new quote so the number the atelier saw at
the time of quoting is preserved forever.
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

# ---------------------------------------------------------------------
# Metals-spot constants (Somnio-specific alloy purities)
# ---------------------------------------------------------------------
_METAL_SOURCE = "gold-api.com"
_METAL_URLS = {
    "XAU": "https://api.gold-api.com/price/XAU",  # Gold
    "XAG": "https://api.gold-api.com/price/XAG",  # Silver
    "XPT": "https://api.gold-api.com/price/XPT",  # Platinum
}
# 1 troy ounce = 31.1034768 grams (industry standard).
TROY_OZ_G = 31.1034768
# Purity fractions of the atelier's standard alloys.
ALLOY_PURITY: Dict[str, tuple[str, float]] = {
    "gold_10k":       ("XAU", 10 / 24),        # 41.6667 %
    "gold_14k":       ("XAU", 14 / 24),        # 58.3333 %
    "gold_18k":       ("XAU", 18 / 24),        # 75.0000 %
    "platinum_pt950": ("XPT", 0.950),          # 95.0000 %
    "silver_s925":    ("XAG", 0.925),          # 92.5000 %
}


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


async def _fetch_metals_upstream() -> Dict[str, float]:
    """Fetch XAU / XAG / XPT spot prices (USD per troy ounce)."""
    out: Dict[str, float] = {}
    async with httpx.AsyncClient(timeout=8.0) as client:
        for sym, url in _METAL_URLS.items():
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            price = data.get("price")
            if price is None:
                raise RuntimeError(f"{sym}: missing price in upstream payload")
            out[sym] = round(float(price), 4)
    return out


def _derive_alloy_grams(spot_toz: Dict[str, float]) -> Dict[str, float]:
    """Turn raw spot-per-troy-ounce prices into purity-adjusted USD/g.

    Formula::
        usd_per_gram = (spot_usd_per_toz / 31.1034768) * purity_fraction
    """
    return {
        alloy: round((spot_toz[base_sym] / TROY_OZ_G) * purity, 4)
        for alloy, (base_sym, purity) in ALLOY_PURITY.items()
    }


async def get_metal_snapshot(force: bool = False) -> Dict[str, Any]:
    """Public helper — returns the current (cached ≤ 24 h) metals snapshot.

    Used both by the ``/fx/metal-spot`` endpoint and by ``routes.quotes``
    when snapshotting a brand-new quote at creation time.
    """
    doc = await db.fx_rates.find_one({"pair": "METAL_SPOT"}, {"_id": 0})
    now = datetime.now(timezone.utc)

    if doc and not force:
        try:
            fetched = datetime.fromisoformat(doc["captured_at"])
            if now - fetched < timedelta(hours=_CACHE_HOURS):
                return {**doc, "stale": False}
        except Exception:
            pass

    try:
        spot_toz = await _fetch_metals_upstream()
    except Exception as exc:  # noqa: BLE001
        log.warning("Metals upstream fetch failed: %s", exc)
        if doc:
            return {**doc, "stale": True, "error": str(exc)}
        raise HTTPException(status_code=502, detail=f"metals fetch failed: {exc}") from exc

    snapshot = {
        "pair": "METAL_SPOT",
        "captured_at": now.isoformat(),
        "source": _METAL_SOURCE,
        "spot_usd_per_toz": spot_toz,
        "usd_per_gram": _derive_alloy_grams(spot_toz),
    }
    await db.fx_rates.update_one({"pair": "METAL_SPOT"}, {"$set": snapshot}, upsert=True)
    return {**snapshot, "stale": False}


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
    return await get_usd_aud_snapshot(force=force)


async def get_usd_aud_snapshot(force: bool = False) -> Dict[str, Any]:
    """Public helper — returns the current (cached ≤ 24 h) USD→AUD snapshot.

    Shared by the ``/fx/usd-aud`` endpoint *and* ``routes.quotes`` so that
    creating a quote captures the exact mid-market rate we would have
    served to the UI at that moment.
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



@router.get(
    "/fx/metal-spot",
    summary="Live metal spot prices (XAU / XAG / XPT), cached 24 h, "
            "with purity-adjusted USD/g for 10k, 14k, 18k gold + Pt950 + S925.",
)
async def get_metal_spot(
    force: bool = False,
    user=Depends(require_roles("admin")),
):
    """Response shape::

        {
          "captured_at": "2026-07-01T13:15:52+00:00",
          "source": "gold-api.com",
          "spot_usd_per_toz": {"XAU": 4022.30, "XAG": 58.55, "XPT": 1572.00},
          "usd_per_gram": {
            "gold_10k": 53.88, "gold_14k": 75.44, "gold_18k": 96.99,
            "platinum_pt950": 48.02, "silver_s925": 1.74
          },
          "stale": false
        }
    """
    return await get_metal_snapshot(force=force)
