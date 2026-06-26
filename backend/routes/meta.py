"""Public meta endpoints (countries list, states list, root health check)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from _countries_data import COUNTRY_META, get_country_meta
from _translation import COUNTRY_LIST, language_for_country

router = APIRouter(tags=["meta"])


@router.get("/meta/countries")
async def list_countries():
    """Public list used by the country dropdown.

    Each entry surfaces the localized language, dial code, the noun used for
    the country's first-level subdivision (e.g. State, Province, Region…),
    a phone number mask, and the full ordered states list. The frontend uses
    everything here to build a fully country-aware new/edit-user form.
    """
    rows = []
    for code, name in COUNTRY_LIST:
        lang_tag, lang_name = language_for_country(code)
        meta = get_country_meta(code)
        rows.append(
            {
                "code": code,
                "name": name,
                "language": lang_tag,
                "language_name": lang_name,
                "dial_code": meta["dial_code"],
                "state_label": meta["state_label"],
                "phone_format": meta["phone_format"],
                "states": meta["states"],
            }
        )
    return rows


@router.get("/meta/countries/{country_code}/states")
async def list_states(country_code: str):
    """Standalone endpoint to fetch just the states list for a country.

    The full list is already included in ``/meta/countries`` but this route is
    useful if the frontend wants to lazy-load on country change without
    re-pulling the entire payload.
    """
    code = (country_code or "").upper()
    if code not in COUNTRY_META:
        raise HTTPException(status_code=404, detail="Unknown country code")
    return get_country_meta(code)


@router.get("/")
async def root():
    return {"app": "Somnio.Co Atelier API", "status": "ok"}
