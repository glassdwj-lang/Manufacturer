"""Public meta endpoints (countries list, root health check)."""
from __future__ import annotations

from fastapi import APIRouter

from _translation import COUNTRY_LIST, language_for_country

router = APIRouter(tags=["meta"])


@router.get("/meta/countries")
async def list_countries():
    """Public list used by the country dropdown — code, name, language."""
    rows = []
    for code, name in COUNTRY_LIST:
        lang_tag, lang_name = language_for_country(code)
        rows.append(
            {
                "code": code,
                "name": name,
                "language": lang_tag,
                "language_name": lang_name,
            }
        )
    return rows


@router.get("/")
async def root():
    return {"app": "Somnio.Co Atelier API", "status": "ok"}
