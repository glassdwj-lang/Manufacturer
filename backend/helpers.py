"""Domain helpers used by multiple route modules.

Keeps password hashing, order-shaping (`_strip_order_for_role`), and the
manufacturer-alias allocator in one place so the routers stay thin.
"""
from __future__ import annotations

from datetime import datetime

import bcrypt

from _step_translations import STEP_I18N
from _translation import language_for_country
from deps import CHINA_TZ, db


# ---- Password hashing ----
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# ---- Time ----
def now_china_iso() -> str:
    return datetime.now(CHINA_TZ).isoformat()


# ---- Order/step shaping ----
def progress_summary(steps: list) -> dict:
    total = len(steps)
    done = sum(1 for s in steps if s["completed"])
    last = None
    for s in steps:
        if s["completed"]:
            last = s["step_number"]
    return {
        "completed_count": done,
        "total": total,
        "current_step": (last + 1) if last and last < total else (1 if done == 0 else None),
    }


async def _next_manufacturer_alias() -> str:
    """Compute the next 'Somnio.Co Atelier N' alias not already in use."""
    cursor = db.users.find(
        {"role": "manufacturer", "alias": {"$exists": True, "$ne": ""}},
        {"_id": 0, "alias": 1},
    )
    used: set[int] = set()
    async for row in cursor:
        a = row.get("alias", "")
        parts = a.split()
        if parts and parts[-1].isdigit():
            used.add(int(parts[-1]))
    n = 1
    while n in used:
        n += 1
    return f"Somnio.Co Atelier {n}"


SUPPORTED_MANUAL_LANGS = {
    "en": "English",
    "zh": "中文",
    "fr": "Français",
    "it": "Italiano",
}


def language_for_user(user: dict) -> tuple[str, str]:
    """Resolve the effective language pack for a viewer.

    Priority: user's manual `preferred_language` → country-derived language.
    The returned tag is normalized so it always maps onto one of the
    pre-translated step packs (`en`, `zh`, `fr`, `it`).
    """
    pref = (user.get("preferred_language") or "").strip().lower()
    if pref in SUPPORTED_MANUAL_LANGS:
        return pref, SUPPORTED_MANUAL_LANGS[pref]
    country = user.get("country") or "AU"
    return language_for_country(country)


def user_to_public(u: dict) -> dict:
    country = u.get("country") or "AU"
    lang_tag, lang_name = language_for_country(country)
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "alias": u.get("alias", ""),
        "role": u["role"],
        "associate_id": u.get("associate_id"),
        "auto_forward": u.get("auto_forward", False),
        "source": u.get("source", "local"),
        "country": country,
        "language": lang_tag,
        "language_name": lang_name,
        "preferred_language": u.get("preferred_language") or None,
    }


def strip_order_for_role(order: dict, user: dict) -> dict:
    """Shape a single order document for the calling viewer.

    - Strips `_id`.
    - Hides customs blobs from non-admins.
    - Masks the manufacturer name with the alias for client + associate.
    - Localizes step titles / phase titles when the client's country maps to a
      pre-translated language pack.
    - Hides un-forwarded step details from the client.
    """
    o = {k: v for k, v in order.items() if k != "_id"}
    if user["role"] != "admin":
        # Customs and airway-bill data is strictly admin-only. We don't even
        # leak whether documents exist (no `has_docs` indicator) — the entire
        # `customs` field is dropped from non-admin responses.
        o.pop("customs", None)

    # Mask manufacturer real name with alias for client and associate views.
    if user["role"] in ("client", "associate"):
        alias = o.get("manufacturer_alias") or "Somnio.Co Atelier"
        o["manufacturer_name"] = alias

    # Pick a language pack to localize titles/phase_titles/descriptions.
    # Effective language now respects the viewer's manual override too — not
    # just the client's country. This lets associates/admins/manufacturers
    # who have set `preferred_language` see the same localized step titles
    # that clients in that language already see.
    pack = None
    lang_tag, _ = language_for_user(user)
    if lang_tag and not lang_tag.lower().startswith("en"):
        pack = STEP_I18N.get(lang_tag)
    if pack:
        step_map = {s["n"]: s for s in pack.get("steps", [])}
        phase_map = {p["code"]: p["title"] for p in pack.get("phases", [])}
        localized_steps = []
        for s in o["steps"]:
            t = step_map.get(s["step_number"], {})
            localized_steps.append(
                {
                    **s,
                    "title": t.get("title", s["title"]),
                    "description": t.get("description", s.get("description", "")),
                    "phase_title": phase_map.get(s["phase"], s.get("phase_title", "")),
                }
            )
        o["steps"] = localized_steps

    if user["role"] == "client":
        # Hide steps that aren't forwarded yet
        visible_steps = []
        for s in o["steps"]:
            if s["completed"] and s.get("forwarded_to_client"):
                visible_steps.append(s)
            else:
                visible_steps.append(
                    {
                        **s,
                        "completed": s["completed"] and s.get("forwarded_to_client", False),
                        "completed_at_china": s["completed_at_china"] if s.get("forwarded_to_client") else None,
                        "completed_at_utc": s["completed_at_utc"] if s.get("forwarded_to_client") else None,
                        "notes": s["notes"] if s.get("forwarded_to_client") else "",
                        "notes_translated": s.get("notes_translated", "") if s.get("forwarded_to_client") else "",
                        "notes_target_lang": s.get("notes_target_lang", "") if s.get("forwarded_to_client") else "",
                        "photos": s["photos"] if s.get("forwarded_to_client") else [],
                        "associate_review_note": s.get("associate_review_note", "") if s.get("forwarded_to_client") else "",
                        "associate_review_note_translated": s.get("associate_review_note_translated", "") if s.get("forwarded_to_client") else "",
                    }
                )
        o["steps"] = visible_steps
    o["progress"] = progress_summary(order["steps"])
    return o


def list_strip(order: dict, user: dict) -> dict:
    """Light version for list views — no photo blobs."""
    o = strip_order_for_role(order, user)
    light_steps = [
        {
            "step_number": s["step_number"],
            "title": s["title"],
            "phase": s["phase"],
            "completed": s["completed"],
            "completed_at_china": s.get("completed_at_china"),
            "forwarded_to_client": s.get("forwarded_to_client", False),
        }
        for s in o["steps"]
    ]
    o["steps"] = light_steps
    return o
