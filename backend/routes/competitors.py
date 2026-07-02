"""Competitor market-anchor comparison.

Given a Somnio quote, this module scrapes a curated library of
competitor jewellery sites, extracts pricing on pieces that match the
RFQ's key parameters (metal / diamond ct / shape / cut / color /
clarity) and returns a **price-anchor** side-by-side. It is *not* a
like-for-like matching engine — the goal is to help the atelier see
where their quote sits in the market.

Design:
* Sites are declared in ``COMPETITOR_LIBRARY`` (below). Each entry
  carries a ``strategy`` field selecting the extraction pipeline:
    - ``shopify_json``  → GET /products.json (public Shopify endpoint,
      no LLM required, cheapest & most reliable)
    - ``html_llm``      → GET the URL, feed the trimmed HTML plus the
      RFQ's search criteria to Claude Haiku 4.5 and ask it to return a
      structured JSON payload of comparable pieces. Fall back to Sonnet
      4.5 when confidence is low.
    - ``playwright_llm`` (Phase 2 — not yet implemented) → Playwright
      renders the page first for JS-heavy sites.
* Results are cached per ``(quote_id, site_id)`` in ``competitor_snapshots``
  so the atelier can revisit the same quote months later and still see
  the market anchor from the day it was quoted.
* All requests use a respectful posture: real ``User-Agent`` identifying
  Somnio, single-shot per URL, no continuous crawling.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from deps import db, require_roles

# --- LLM stack (Emergent LLM key) -------------------------------------
from dotenv import load_dotenv
load_dotenv()
from emergentintegrations.llm.chat import LlmChat, UserMessage  # noqa: E402

router = APIRouter()
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------
# Site library — colour-coded by feasibility. Only ``active=True`` sites
# will be scraped when the atelier requests a comparison.
# ---------------------------------------------------------------------
COMPETITOR_LIBRARY: List[Dict[str, Any]] = [
    {
        "id": "bradleys",
        "name": "Bradley's Jewellers",
        "base_url": "https://bradleysthejewellers.com",
        "products_json": "https://bradleysthejewellers.com/products.json",
        "search_url": "https://bradleysthejewellers.com/collections/engagement-rings",
        "strategy": "shopify_json",
        "feasibility": "easy",
        "active": True,
    },
    {
        "id": "cullen",
        "name": "Cullen Jewellery",
        "base_url": "https://cullenjewellery.com",
        "search_url": "https://cullenjewellery.com/lab-diamond-engagement-rings",
        "strategy": "html_llm",
        "feasibility": "good",
        "active": True,
    },
    {
        "id": "michaelhill",
        "name": "Michael Hill",
        "base_url": "https://www.michaelhill.com.au",
        # Previous /engagement-rings 404'd. Category root under /rings/
        # keeps the page reachable while the LLM narrows to bridal.
        "search_url": "https://www.michaelhill.com.au/rings/engagement",
        "strategy": "html_llm",
        "feasibility": "good",
        "active": True,
    },
    {
        "id": "larsen",
        "name": "Larsen Jewellery",
        "base_url": "https://larsenjewellery.com.au",
        "search_url": "https://larsenjewellery.com.au/engagement-rings",
        "strategy": "playwright_llm",
        "feasibility": "playwright_needed",
        "active": True,
    },
    {
        "id": "savoirfaire",
        "name": "Savoir-Faire Jewellery",
        "base_url": "https://savoir-fairejewellery.com.au",
        "search_url": "https://savoir-fairejewellery.com.au/collections/engagement-rings",
        "strategy": "playwright_llm",
        "feasibility": "playwright_needed",
        "active": True,
    },
    {
        "id": "austenblake",
        "name": "Austen & Blake",
        "base_url": "https://www.austenblake.com.au",
        "search_url": "https://www.austenblake.com.au/engagement-rings",
        "strategy": "html_llm",
        "feasibility": "cloudflare_blocked",
        "active": False,     # Cloudflare Turnstile — needs Phase 3 solution
    },
    {
        "id": "diamondsfactory",
        "name": "Diamonds Factory",
        "base_url": "https://www.diamondsfactory.com",
        "search_url": "https://www.diamondsfactory.com/au/engagement-rings",
        "strategy": "html_llm",
        "feasibility": "cloudflare_blocked",
        "active": False,
    },
    # --- US market (Phase 2) ------------------------------------------
    {
        "id": "gabrielny",
        "name": "Gabriel & Co.",
        "base_url": "https://www.gabrielny.com",
        # Was /fashion-rings — wrong product family. Bridal collection
        # gives us actual engagement rings to compare against.
        "search_url": "https://www.gabrielny.com/collections/bridal-jewelry-engagement-rings",
        "strategy": "html_llm",
        "feasibility": "good",
        "active": True,
    },
    {
        "id": "rarecarat",
        "name": "Rare Carat",
        "base_url": "https://www.rarecarat.com",
        "search_url": "https://www.rarecarat.com/engagement-rings",
        "strategy": "html_llm",
        "feasibility": "good",
        "active": True,
    },
    {
        "id": "diamondnexus",
        "name": "Diamond Nexus",
        "base_url": "https://www.diamondnexus.com",
        "search_url": "https://www.diamondnexus.com/collections/engagement-rings",
        "strategy": "html_llm",
        "feasibility": "good",
        "active": True,
    },
    {
        "id": "bluenile",
        "name": "Blue Nile",
        "base_url": "https://www.bluenile.com",
        # Was /build-your-ring — configurator page with no product rows.
        # Ready-to-wear engagement rings listing is scrapeable.
        "search_url": "https://www.bluenile.com/engagement-rings/",
        "strategy": "playwright_llm",
        "feasibility": "playwright_needed",
        "active": True,
    },
    {
        "id": "jamesallen",
        "name": "James Allen",
        "base_url": "https://www.jamesallen.com",
        "search_url": "https://www.jamesallen.com/engagement-rings/",
        "strategy": "playwright_llm",
        "feasibility": "playwright_needed",
        "active": True,
    },
    # Tory Burch removed — fashion / costume jewellery, not comparable
    # to fine bridal atelier product. James Allen replaces the slot.
]


def _build_search_url(site: Dict[str, Any], criteria: Dict[str, Any]) -> str:
    """Return a criteria-aware search URL for the site, or the default.

    Many competitor sites accept common URL params (?carat=, ?shape=,
    ?color=) that filter their listing to something much closer to the
    RFQ. Where a site supports it, we bake the criteria into the URL —
    the LLM then has a MUCH tighter listing to parse (5-20 exact matches
    instead of a generic 100-product front page) and results are far
    more precise.

    Falls back to the site's canonical ``search_url`` if the site
    doesn't have a known query API or the criteria are missing.
    """
    shape = (criteria.get("shape") or "").strip().lower()
    ct = criteria.get("diamond_ct")
    try:
        ct_f = float(ct) if ct not in (None, "", 0) else None
    except (TypeError, ValueError):
        ct_f = None
    dtype = (criteria.get("diamond_type") or "").strip().lower()

    if site["id"] == "bluenile" and shape:
        # Blue Nile supports /engagement-rings/<shape>-cut/
        # e.g. /engagement-rings/round-cut-diamond-engagement-rings
        return f"https://www.bluenile.com/engagement-rings/{shape}-cut/"
    if site["id"] == "jamesallen" and shape:
        # James Allen: /engagement-rings/round/, /oval/, etc.
        return f"https://www.jamesallen.com/engagement-rings/{shape}/"
    if site["id"] == "rarecarat" and shape and ct_f:
        # Rare Carat query API: shape + min/max carat window.
        low, high = max(ct_f - 0.25, 0.30), ct_f + 0.25
        return (
            f"https://www.rarecarat.com/browse-diamonds"
            f"?shape={shape}&caratsMin={low:.2f}&caratsMax={high:.2f}"
        )
    if site["id"] == "cullen" and dtype == "natural":
        # Cullen has separate lab / natural landing pages.
        return "https://cullenjewellery.com/natural-diamond-engagement-rings"
    return site["search_url"]

_UA = "Somnio-QuoteAnchor/1.0 (contact: admin@somnio.co)"
_MAX_HTML_KB = 90  # trim HTML to ~90KB before feeding to LLM to control cost
_TIMEOUT_SECONDS = 12


# ---------------------------------------------------------------------
# Extraction pipelines
# ---------------------------------------------------------------------
async def _extract_shopify(site: Dict[str, Any], criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Fetch ``/products.json`` and return up to 5 rings priced above 0.

    Shopify's public products endpoint returns full product structure
    with variants + prices — no LLM required. We do light filtering on
    the title for keywords the RFQ cares about (metal, cut, shape).
    """
    url = site["products_json"]
    async with httpx.AsyncClient(timeout=_TIMEOUT_SECONDS, headers={"User-Agent": _UA}) as client:
        resp = await client.get(url, params={"limit": 30})
        resp.raise_for_status()
        data = resp.json()

    products = data.get("products", [])
    # Score each product by how many RFQ tokens appear in its title.
    tokens = [str(v).lower() for v in criteria.values() if v]
    scored: List[tuple[float, Dict[str, Any]]] = []
    for p in products:
        title = (p.get("title") or "").lower()
        body = (p.get("body_html") or "").lower()
        if not title:
            continue
        variants = p.get("variants") or []
        v = variants[0] if variants else {}
        try:
            price_aud = float(v.get("price") or 0)
        except (TypeError, ValueError):
            continue
        if price_aud <= 0:
            continue
        score = sum(1 for tok in tokens if tok in title or tok in body[:2000])
        scored.append((score, {
            "product_name": p.get("title"),
            "price_aud": round(price_aud, 2),
            "url": f"{site['base_url']}/products/{p.get('handle')}",
            "snippet": (p.get("body_html") or "").replace("\n", " ")[:200],
            "confidence": min(1.0, 0.4 + 0.15 * score),
        }))
    scored.sort(key=lambda x: -x[0])
    return [item[1] for item in scored[:5]]


async def _extract_html_llm(
    site: Dict[str, Any],
    criteria: Dict[str, Any],
    prefer_haiku: bool = True,
    prefetched_html: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Fetch the site's search URL as HTML and let Claude extract matches.

    Tries Haiku 4.5 first (cheap). If Haiku returns nothing or every
    match has confidence < 0.6, retries once with Sonnet 4.5.

    ``prefetched_html`` — if provided, skip the httpx fetch and use this
    HTML instead (used by the Playwright pipeline to avoid double-fetch).
    """
    if prefetched_html is not None:
        html = prefetched_html
    else:
        # Criteria-aware URL: query params are baked in when the site
        # supports them (Blue Nile, James Allen, Rare Carat, Cullen).
        url = _build_search_url(site, criteria)
        try:
            async with httpx.AsyncClient(
                timeout=_TIMEOUT_SECONDS,
                headers={"User-Agent": _UA, "Accept": "text/html,application/xhtml+xml"},
                follow_redirects=True,
            ) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                html = resp.text
        except Exception as exc:  # noqa: BLE001
            log.warning("html fetch failed for %s: %s", site["id"], exc)
            return []

    # --- JSON-LD extraction ------------------------------------------
    # Most modern e-commerce sites (Shopify, BigCommerce, custom SEO)
    # embed structured Product / ItemList data in
    # <script type="application/ld+json"> tags. This is 100× cleaner
    # than raw HTML for LLM parsing — schema.org Product objects have
    # name, price, priceCurrency, brand, description all in JSON.
    # We pull them out FIRST, then strip all scripts/styles from the
    # HTML that remains.
    ld_blocks: List[str] = []
    for m in re.finditer(
        r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        html, flags=re.DOTALL | re.IGNORECASE,
    ):
        block = m.group(1).strip()
        # Keep only blocks that mention Product / Offer schemas — skips
        # BreadcrumbList / Organization noise that inflates prompt cost.
        if re.search(r'"@type"\s*:\s*"(?:Product|ItemList|AggregateOffer|Offer)"', block, re.IGNORECASE):
            ld_blocks.append(block)
        if len(ld_blocks) >= 6:  # cap payload — 6 product schemas is plenty
            break

    # Now strip all scripts + styles + comments to slim the HTML.
    html = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.DOTALL)
    html = re.sub(r"\s+", " ", html)
    if len(html) > _MAX_HTML_KB * 1024:
        html = html[: _MAX_HTML_KB * 1024]

    api_key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not api_key:
        log.error("EMERGENT_LLM_KEY missing")
        return []

    system_prompt = (
        "You are a market-research extractor for a luxury jewellery atelier. "
        "You are given (a) any JSON-LD schema.org Product payloads that the "
        "site ships in <script type=application/ld+json>, and (b) the trimmed "
        "raw HTML. Prefer JSON-LD when present — it's structured and reliable. "
        "Return up to 5 comparable engagement rings whose price > 0. "
        "STRICTLY match the RFQ's diamond_type (lab vs natural). "
        "Respond with a JSON array only (no prose). Each object MUST have keys: "
        "product_name, price_aud (float — convert from USD @ 1.50 or GBP @ 1.90 "
        "when the site's priceCurrency isn't AUD, and mention the currency in "
        "snippet), metal, diamond_ct (float or null), shape, cut, color, clarity, "
        f"url (absolute — prepend {site['base_url']} if relative), "
        "snippet (≤180 chars — include original currency + any diamond_type "
        "detail such as 'lab-grown' or 'natural'), confidence "
        "(0..1 — how closely the piece matches the RFQ). "
        "Reject pieces whose diamond_type disagrees with the RFQ. "
        "If a spec is unclear, set it null instead of guessing."
    )
    criteria_line = json.dumps({k: v for k, v in criteria.items() if v}, ensure_ascii=False)

    # Build the user message — JSON-LD block goes FIRST so the LLM sees
    # the structured payload before the noisy HTML fallback.
    ld_section = ""
    if ld_blocks:
        joined = "\n---\n".join(ld_blocks)
        # Cap to ~20KB — schema.org payloads are usually much smaller.
        if len(joined) > 20 * 1024:
            joined = joined[: 20 * 1024]
        ld_section = f"JSON-LD product schemas found on the page:\n{joined}\n\n"

    user_text = (
        f"RFQ criteria: {criteria_line}\n\n"
        f"Site: {site['name']} ({site['base_url']})\n\n"
        f"{ld_section}"
        f"HTML (trimmed):\n{html}\n\n"
        "Return the JSON array."
    )

    async def _run(model_name: str) -> List[Dict[str, Any]]:
        chat = LlmChat(
            api_key=api_key,
            session_id=f"compare-{site['id']}-{uuid4()}",
            system_message=system_prompt,
        ).with_model("anthropic", model_name)
        try:
            reply = await chat.send_message(UserMessage(text=user_text))
        except Exception as exc:  # noqa: BLE001
            log.warning("LLM %s failed for %s: %s", model_name, site["id"], exc)
            return []
        # Peel any ```json fences.
        m = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", reply, flags=re.DOTALL)
        payload = m.group(1) if m else reply.strip()
        # Also handle plain-array response.
        if not payload.lstrip().startswith("["):
            m2 = re.search(r"(\[.*\])", payload, flags=re.DOTALL)
            payload = m2.group(1) if m2 else "[]"
        try:
            parsed = json.loads(payload)
            if isinstance(parsed, list):
                return parsed[:5]
        except json.JSONDecodeError as exc:
            log.warning("LLM %s JSON parse failed for %s: %s", model_name, site["id"], exc)
        return []

    # Haiku first when frugal, else Sonnet.
    if prefer_haiku:
        results = await _run("claude-haiku-4-5-20251001")
        avg_conf = (
            sum(float(r.get("confidence") or 0) for r in results) / len(results)
            if results else 0.0
        )
        if not results or avg_conf < 0.6:
            log.info("escalating %s to Sonnet (haiku avg_conf=%.2f)", site["id"], avg_conf)
            sonnet_results = await _run("claude-sonnet-4-5-20250929")
            if sonnet_results:
                return sonnet_results
        return results
    return await _run("claude-sonnet-4-5-20250929")


async def _extract_playwright_llm(site: Dict[str, Any], criteria: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Render the search URL with Playwright first, then hand off to LLM.

    Necessary for JS-heavy SPAs (Larsen, Savoir-Faire, Blue Nile) whose
    price/product data doesn't appear in the initial HTML. We wait for
    the DOM to settle, grab the fully-rendered ``document.body.innerHTML``,
    then reuse the same LLM extraction as the ``html_llm`` strategy.
    """
    from playwright.async_api import async_playwright
    # Criteria-aware URL — Blue Nile / James Allen accept shape in path.
    url = _build_search_url(site, criteria)
    html = ""
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            try:
                ctx = await browser.new_context(user_agent=_UA, viewport={"width": 1440, "height": 900})
                page = await ctx.new_page()
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                # Give the SPA a moment to hydrate + render prices.
                try:
                    await page.wait_for_load_state("networkidle", timeout=8000)
                except Exception:
                    pass  # some sites never go idle — no big deal
                html = await page.content()
            finally:
                await browser.close()
    except Exception as exc:  # noqa: BLE001
        log.warning("playwright render failed for %s: %s", site["id"], exc)
        return []
    if not html:
        return []
    return await _extract_html_llm(site, criteria, prefetched_html=html)


async def _extract_site(site: Dict[str, Any], criteria: Dict[str, Any]) -> Dict[str, Any]:
    """Dispatch to the strategy declared on the site."""
    started = datetime.now(timezone.utc)
    try:
        if site["strategy"] == "shopify_json":
            matches = await _extract_shopify(site, criteria)
        elif site["strategy"] == "html_llm":
            matches = await _extract_html_llm(site, criteria)
        elif site["strategy"] == "playwright_llm":
            matches = await _extract_playwright_llm(site, criteria)
        else:
            matches = []
        error = None
    except Exception as exc:  # noqa: BLE001 — always want a snapshot even on failure
        log.exception("extractor crashed for %s", site["id"])
        matches = []
        error = str(exc)
    return {
        "site_id": site["id"],
        "site_name": site["name"],
        "base_url": site["base_url"],
        "feasibility": site["feasibility"],
        "strategy": site["strategy"],
        "matches": matches,
        "match_count": len(matches),
        "scraped_at": started.isoformat(),
        "error": error,
    }


# ---------------------------------------------------------------------
# Public routes
# ---------------------------------------------------------------------
class CompareRequest(BaseModel):
    force: bool = False        # bypass cached snapshots
    sites: Optional[List[str]] = None   # restrict to these site ids


class CompetitorPatch(BaseModel):
    """Admin-editable fields on a competitor site override.

    All optional so PATCH can toggle ``active`` without needing to
    resend the URLs, or update just the URL without touching active.
    """
    base_url: Optional[str] = None
    search_url: Optional[str] = None
    active: Optional[bool] = None
    notes: Optional[str] = None


async def _effective_competitor_library() -> List[Dict[str, Any]]:
    """Merge the hardcoded ``COMPETITOR_LIBRARY`` with any per-site
    overrides admin has saved in ``db.competitor_sites``.

    Precedence: DB values win over library defaults on ``base_url``,
    ``search_url``, ``active`` and ``notes``. Everything else (strategy,
    products_json, feasibility, name, id) stays from the library —
    those are structural and shouldn't be user-editable.
    """
    overrides: Dict[str, Dict[str, Any]] = {}
    async for doc in db.competitor_sites.find({}, {"_id": 0}):
        overrides[doc["id"]] = doc
    merged: List[Dict[str, Any]] = []
    for site in COMPETITOR_LIBRARY:
        s = dict(site)
        ov = overrides.get(site["id"])
        if ov:
            for k in ("base_url", "search_url", "active", "notes"):
                if k in ov and ov[k] is not None:
                    s[k] = ov[k]
        merged.append(s)
    return merged


@router.get("/admin/competitors", summary="List competitor library with admin overrides")
async def list_competitors_admin(user=Depends(require_roles("admin"))):
    return [
        {k: v for k, v in s.items() if k != "products_json"}
        for s in await _effective_competitor_library()
    ]


@router.patch(
    "/admin/competitors/{site_id}",
    summary="Update a competitor's URL / active flag (admin overlay)",
)
async def update_competitor(
    site_id: str,
    body: CompetitorPatch,
    user=Depends(require_roles("admin")),
):
    # Validate the id exists in the underlying library.
    if not any(s["id"] == site_id for s in COMPETITOR_LIBRARY):
        raise HTTPException(status_code=404, detail=f"Unknown competitor: {site_id}")
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields provided")
    patch["id"] = site_id
    await db.competitor_sites.update_one(
        {"id": site_id},
        {"$set": patch},
        upsert=True,
    )
    # Return the updated effective row so the client can sync state.
    merged = await _effective_competitor_library()
    return next((s for s in merged if s["id"] == site_id), None)


@router.post(
    "/admin/competitors/{site_id}/reset",
    summary="Discard admin overrides and restore hardcoded defaults",
)
async def reset_competitor(
    site_id: str,
    user=Depends(require_roles("admin")),
):
    await db.competitor_sites.delete_one({"id": site_id})
    merged = await _effective_competitor_library()
    return next((s for s in merged if s["id"] == site_id), None)


@router.get("/competitors", summary="List competitor library (admin)")
async def list_competitors(user=Depends(require_roles("admin"))):
    return [
        {k: v for k, v in s.items() if k != "products_json"}
        for s in await _effective_competitor_library()
    ]


@router.post("/quotes/{quote_id}/compare", summary="Run market-anchor comparison for a quote")
async def compare_quote(
    quote_id: str,
    body: CompareRequest,
    user=Depends(require_roles("admin")),
):
    quote = await db.quotes.find_one({"id": quote_id, "deleted": {"$ne": True}}, {"_id": 0})
    if not quote:
        raise HTTPException(status_code=404, detail="Quote not found")

    inputs = quote.get("inputs") or {}
    # RFQ criteria — the atelier's parameters that drive fit-scoring.
    criteria = {
        "metal": inputs.get("metal_type") or inputs.get("metal") or "",
        "diamond_type": inputs.get("diamond_type") or "",
        "diamond_ct": inputs.get("diamond_carat") or inputs.get("ct"),
        "shape": inputs.get("diamond_shape") or inputs.get("shape") or "",
        "cut": inputs.get("diamond_cut") or inputs.get("cut") or "",
        "color": inputs.get("diamond_color") or inputs.get("color") or "",
        "clarity": inputs.get("diamond_clarity") or inputs.get("clarity") or "",
        "piece_description": inputs.get("piece_description") or quote.get("jewelry_name") or "",
    }

    # Which sites to scrape (merges DB overrides with the hardcoded library).
    library = await _effective_competitor_library()
    requested_ids = set(body.sites) if body.sites else None
    active_sites = [
        s for s in library
        if s.get("active") and (requested_ids is None or s["id"] in requested_ids)
    ]

    results: List[Dict[str, Any]] = []
    for site in active_sites:
        # Cache lookup unless ``force``.
        if not body.force:
            cached = await db.competitor_snapshots.find_one(
                {"quote_id": quote_id, "site_id": site["id"]}, {"_id": 0}
            )
            if cached:
                cached["cached"] = True
                results.append(cached)
                continue
        # Fresh scrape.
        snap = await _extract_site(site, criteria)
        snap["quote_id"] = quote_id
        await db.competitor_snapshots.update_one(
            {"quote_id": quote_id, "site_id": site["id"]},
            {"$set": snap},
            upsert=True,
        )
        snap["cached"] = False
        results.append(snap)
        # Respectful 2s spacing between calls.
        await asyncio.sleep(2)

    return {
        "quote_id": quote_id,
        "criteria": criteria,
        "results": results,
    }


@router.get("/quotes/{quote_id}/comparisons", summary="Fetch cached comparisons")
async def get_comparisons(
    quote_id: str,
    user=Depends(require_roles("admin")),
):
    snaps = await db.competitor_snapshots.find(
        {"quote_id": quote_id}, {"_id": 0}
    ).to_list(length=50)
    return {"quote_id": quote_id, "results": snaps}


# ---------------------------------------------------------------------
# Helper: fire-and-forget comparison for a fresh quote.
#
# Called from ``routes.quotes`` on quote-create. Runs in the background
# so quote creation returns instantly to the UI; comparison results
# populate the ``competitor_snapshots`` collection as each site
# resolves and are visible when the atelier opens the Market Anchor
# section on the new quote.
# ---------------------------------------------------------------------
async def run_comparison_background(quote_id: str) -> None:
    """Kick off a full comparison sweep for a newly-created quote.

    Silently swallows all errors — the quote must succeed even if the
    scraper stack is temporarily broken. Each site's result is upserted
    into ``competitor_snapshots`` so the UI shows partial progress as
    the sweep runs.
    """
    try:
        quote = await db.quotes.find_one({"id": quote_id, "deleted": {"$ne": True}}, {"_id": 0})
        if not quote:
            return
        inputs = quote.get("inputs") or {}
        criteria = {
            "metal": inputs.get("metal_type") or inputs.get("metal") or "",
            "diamond_ct": inputs.get("diamond_carat") or inputs.get("ct"),
            "shape": inputs.get("diamond_shape") or inputs.get("shape") or "",
            "cut": inputs.get("diamond_cut") or inputs.get("cut") or "",
            "color": inputs.get("diamond_color") or inputs.get("color") or "",
            "clarity": inputs.get("diamond_clarity") or inputs.get("clarity") or "",
            "piece_description": inputs.get("piece_description") or quote.get("jewelry_name") or "",
        }
        active_sites = [s for s in await _effective_competitor_library() if s.get("active")]
        for site in active_sites:
            # Skip if snapshot already cached (idempotent — safe to re-fire).
            existing = await db.competitor_snapshots.find_one(
                {"quote_id": quote_id, "site_id": site["id"]}, {"_id": 1}
            )
            if existing:
                continue
            snap = await _extract_site(site, criteria)
            snap["quote_id"] = quote_id
            await db.competitor_snapshots.update_one(
                {"quote_id": quote_id, "site_id": site["id"]},
                {"$set": snap},
                upsert=True,
            )
            await asyncio.sleep(2)  # respectful spacing
    except Exception:  # noqa: BLE001
        log.exception("background comparison failed for quote %s", quote_id)
