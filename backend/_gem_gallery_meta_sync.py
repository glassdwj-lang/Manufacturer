"""Monthly gem-gallery-193 country/state/region sync.

The Somnio.Co source app (gem-gallery-193) embeds its canonical
``STATES_BY_COUNTRY`` lookup and ``COUNTRY_ISO`` map directly inside the Metro
JS bundle served at ``/node_modules/expo-router/entry.bundle``. Because that
file is rebuilt on every deploy we never cache the URL — we always re-derive
the bundle URL from the gem-gallery HTML root, then regex out the data blocks.

The extracted lookup is written verbatim to ``_countries_overlay.json`` next
to ``_countries_data.py``. ``_countries_data.get_country_meta`` reads the
overlay at runtime so that fresh entries take effect without a redeploy.

Run modes:

* Manual:      ``POST /api/admin/sync-gem-gallery-meta`` (admin only).
* Scheduled:   first day of every month at 00:05 Australia/Sydney via the
  apscheduler instance configured in ``server.py``.
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import httpx

from _translation import COUNTRY_LIST

logger = logging.getLogger(__name__)

OVERLAY_PATH = Path(__file__).resolve().parent / "_countries_overlay.json"

# Reverse lookup: full English country name (as used by gem-gallery) -> ISO-2.
# We seed it from ``COUNTRY_LIST`` so any country we already serve in the
# dropdown will be matched; the sync also opportunistically promotes new
# names that gem-gallery introduces.
def _seed_name_to_iso() -> Dict[str, str]:
    return {name: code for code, name in COUNTRY_LIST}


def _bundle_url(base_url: str) -> str:
    """gem-gallery is an Expo Router web build — the JS bundle lives at the
    same path on every deploy. Hardcoding it is safer than parsing the HTML
    because Cloudflare/Expo can change the wrapper anytime."""
    return (
        f"{base_url.rstrip('/')}"
        "/node_modules/expo-router/entry.bundle"
        "?platform=web&dev=true&hot=false&lazy=true"
        "&transform.engine=hermes&transform.routerRoot=app"
        "&unstable_transformProfile=hermes-stable"
    )


def _balanced_block(src: str, start_idx: int, open_ch: str = "{", close_ch: str = "}") -> str:
    """Return the substring starting at ``start_idx`` (which must point at an
    opening brace) up to the matching closing brace, respecting string
    literals and escape sequences."""
    depth = 0
    in_str = False
    str_ch = ""
    esc = False
    for i in range(start_idx, len(src)):
        ch = src[i]
        if esc:
            esc = False
            continue
        if in_str:
            if ch == "\\":
                esc = True
            elif ch == str_ch:
                in_str = False
            continue
        if ch in ('"', "'"):
            in_str = True
            str_ch = ch
            continue
        if ch == open_ch:
            depth += 1
        elif ch == close_ch:
            depth -= 1
            if depth == 0:
                return src[start_idx : i + 1]
    raise ValueError("Unbalanced braces while scanning bundle")


def _extract_country_iso_map(src: str) -> Dict[str, str]:
    """Parse the ``const COUNTRY_ISO = { ... };`` block out of the bundle."""
    m = re.search(r"COUNTRY_ISO\s*=\s*(\{)", src)
    if not m:
        return {}
    blob = _balanced_block(src, m.end() - 1)
    # Convert to JSON-ish: wrap unquoted keys in quotes.
    cleaned = re.sub(r"([{,]\s*)([A-Za-z_][\w]*)\s*:", r'\1"\2":', blob)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Fallback: pull key/value pairs out one by one.
        out: Dict[str, str] = {}
        for km in re.finditer(r'(?:"([^"]+)"|([A-Za-z_]\w*))\s*:\s*"([^"]+)"', blob):
            key = km.group(1) or km.group(2)
            out[key] = km.group(3)
        return out


def _extract_states_by_country(src: str) -> Dict[str, List[str]]:
    """Parse the ``const STATES_BY_COUNTRY = { ... };`` block."""
    m = re.search(r"STATES_BY_COUNTRY\s*=\s*(\{)", src)
    if not m:
        return {}
    blob = _balanced_block(src, m.end() - 1)
    out: Dict[str, List[str]] = {}
    # Each top-level entry: "<Country>": [ {label: "..", value: ".."}, ... ]
    pattern = re.compile(
        r'(?:"([^"\\]+)"|([A-Za-z][\w ]*))\s*:\s*\[(.*?)\]\s*(?:,|\})',
        re.DOTALL,
    )
    for em in pattern.finditer(blob):
        name = em.group(1) or em.group(2)
        body = em.group(3)
        labels = re.findall(r'label:\s*"([^"]+)"', body)
        if labels:
            out[name] = labels
    return out


def _state_code(name: str, fallback_index: int) -> str:
    """Derive a short, stable code for a state label.

    * "Victoria (VIC)" -> "VIC"
    * "Auckland"       -> "AUK"  (first 3 chars uppercase, deterministic)
    * "Hawke's Bay"    -> "HKB"
    """
    m = re.search(r"\(([^()]+)\)\s*$", name)
    if m:
        return m.group(1).strip().upper().replace(" ", "")
    # Fallback: take first letters of words, trimmed to a useful prefix.
    parts = [p for p in re.split(r"[\s\-\.']+", name) if p]
    if len(parts) >= 2:
        initials = "".join(p[0] for p in parts[:4]).upper()
        if len(initials) >= 2:
            return initials
    base = re.sub(r"[^A-Za-z]", "", name).upper()
    return base[:4] or f"X{fallback_index:02d}"


def _gem_gallery_settings() -> Tuple[str, str, str]:
    return (
        (os.environ.get("GEM_GALLERY_BASE_URL") or "").rstrip("/"),
        os.environ.get("GEM_GALLERY_ADMIN_EMAIL") or "",
        os.environ.get("GEM_GALLERY_ADMIN_PASSWORD") or "",
    )


async def _fetch_bundle(base_url: str) -> str:
    async with httpx.AsyncClient(timeout=90) as client:
        r = await client.get(_bundle_url(base_url))
        r.raise_for_status()
        return r.text


def _read_overlay() -> Dict[str, Any]:
    if not OVERLAY_PATH.exists():
        return {}
    try:
        return json.loads(OVERLAY_PATH.read_text())
    except Exception:
        return {}


def _write_overlay(data: Dict[str, Any]) -> None:
    OVERLAY_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


async def sync_country_meta_from_gem_gallery() -> Dict[str, Any]:
    """Fetch the gem-gallery-193 bundle, extract STATES_BY_COUNTRY +
    COUNTRY_ISO, and persist them into ``_countries_overlay.json``. Returns
    a summary dict for logging / UI display.
    """
    base_url, *_ = _gem_gallery_settings()
    if not base_url:
        return {
            "ok": False,
            "detail": "GEM_GALLERY_BASE_URL not configured in backend/.env",
        }

    started = datetime.now(timezone.utc).isoformat()
    try:
        src = await _fetch_bundle(base_url)
    except Exception as exc:
        logger.exception("gem-gallery bundle fetch failed: %s", exc)
        return {"ok": False, "detail": f"Bundle fetch failed: {exc}"}

    iso_map_from_bundle = _extract_country_iso_map(src)
    states_by_name = _extract_states_by_country(src)
    if not states_by_name:
        return {
            "ok": False,
            "detail": "Could not locate STATES_BY_COUNTRY in gem-gallery bundle",
        }

    # Merge name->ISO maps. Source-of-truth precedence: bundle > our seed.
    name_to_iso = _seed_name_to_iso()
    for nm, iso in iso_map_from_bundle.items():
        name_to_iso[nm] = iso.upper()

    # Build the overlay dictionary keyed by ISO-2.
    overlay_countries: Dict[str, Any] = {}
    unmatched_names: List[str] = []
    for country_name, labels in states_by_name.items():
        iso = name_to_iso.get(country_name)
        if not iso:
            unmatched_names.append(country_name)
            continue
        states = []
        for idx, label in enumerate(labels):
            states.append({"code": _state_code(label, idx), "name": label})
        overlay_countries[iso] = {"name": country_name, "states": states}

    prev = _read_overlay()
    prev_countries = (prev.get("countries") or {}) if isinstance(prev, dict) else {}

    added_countries: List[str] = []
    updated_countries: List[str] = []
    added_states: Dict[str, List[str]] = {}
    for iso, payload in overlay_countries.items():
        prev_entry = prev_countries.get(iso) or {}
        prev_names = {s.get("name") for s in (prev_entry.get("states") or [])}
        new_names = {s["name"] for s in payload["states"]}
        if not prev_entry:
            added_countries.append(iso)
        elif prev_names != new_names:
            updated_countries.append(iso)
            additions = sorted(new_names - prev_names)
            if additions:
                added_states[iso] = additions

    overlay = {
        "source": "gem-gallery-193",
        "synced_at": started,
        "iso_map": {k: v.upper() for k, v in iso_map_from_bundle.items()},
        "countries": overlay_countries,
        "unmatched_country_names": sorted(set(unmatched_names)),
    }
    _write_overlay(overlay)

    summary = {
        "ok": True,
        "synced_at": started,
        "country_count": len(overlay_countries),
        "added_countries": added_countries,
        "updated_countries": updated_countries,
        "added_states": added_states,
        "unmatched_country_names": overlay["unmatched_country_names"],
    }
    logger.info("gem-gallery country meta sync: %s", summary)
    return summary
