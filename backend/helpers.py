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


WORKSHOP_ALIAS_PREFIX = "Somnio.Co Atelier Workshop"
LEGACY_WORKSHOP_ALIAS_PREFIX = "Somnio.Co Atelier"
WORKSHOP_FALLBACK = "Somnio.Co Atelier Workshop"


async def _next_manufacturer_alias() -> str:
    """Compute the next 'Somnio.Co Atelier Workshop N' alias not already in use."""
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
    return f"{WORKSHOP_ALIAS_PREFIX} {n}"


async def migrate_workshop_aliases() -> dict:
    """One-shot migration: rename legacy 'Somnio.Co Atelier N' aliases to
    'Somnio.Co Atelier Workshop N' on users and orders. Idempotent."""
    import re
    users_updated = 0
    orders_updated = 0
    pattern = re.compile(rf"^{re.escape(LEGACY_WORKSHOP_ALIAS_PREFIX)} (\d+)$")
    async for u in db.users.find(
        {"role": "manufacturer", "alias": {"$regex": rf"^{re.escape(LEGACY_WORKSHOP_ALIAS_PREFIX)} \d+$"}},
        {"_id": 0, "id": 1, "alias": 1},
    ):
        m = pattern.match(u.get("alias", ""))
        if not m:
            continue
        new_alias = f"{WORKSHOP_ALIAS_PREFIX} {m.group(1)}"
        await db.users.update_one({"id": u["id"]}, {"$set": {"alias": new_alias}})
        users_updated += 1
        r = await db.orders.update_many(
            {"manufacturer_id": u["id"], "manufacturer_alias": u["alias"]},
            {"$set": {"manufacturer_alias": new_alias}},
        )
        orders_updated += r.modified_count
    # Also catch any stray orders that reference legacy alias even when their
    # mfg user has been re-aliased.
    async for o in db.orders.find(
        {"manufacturer_alias": {"$regex": rf"^{re.escape(LEGACY_WORKSHOP_ALIAS_PREFIX)} \d+$"}},
        {"_id": 0, "id": 1, "manufacturer_alias": 1},
    ):
        m = pattern.match(o.get("manufacturer_alias", ""))
        if not m:
            continue
        new_alias = f"{WORKSHOP_ALIAS_PREFIX} {m.group(1)}"
        await db.orders.update_one({"id": o["id"]}, {"$set": {"manufacturer_alias": new_alias}})
        orders_updated += 1
    return {"users_updated": users_updated, "orders_updated": orders_updated}


SUPPORTED_MANUAL_LANGS = {
    "en": "English",
    "zh": "中文",
    "fr": "Français",
    "it": "Italiano",
}

# Maps the short manual-override code stored on the user document
# (`preferred_language` ∈ {en, zh, fr, it}) onto the BCP-47 tag that
# `STEP_I18N` is actually keyed by. Without this mapping the dashboard
# would pick "zh" and the i18n lookup would silently miss the "zh-CN"
# pack — leaving step titles in English.
_MANUAL_LANG_TO_PACK_TAG = {
    "en": "en",
    "zh": "zh-CN",
    "fr": "fr",
    "it": "it",
}


def language_for_user(user: dict) -> tuple[str, str]:
    """Resolve the effective language pack for a viewer.

    Priority: user's manual `preferred_language` → country-derived language.
    The returned tag is normalized so it always maps onto one of the
    pre-translated step packs (e.g. `en`, `zh-CN`, `fr`, `it`).
    """
    pref = (user.get("preferred_language") or "").strip().lower()
    if pref in SUPPORTED_MANUAL_LANGS:
        tag = _MANUAL_LANG_TO_PACK_TAG.get(pref, pref)
        return tag, SUPPORTED_MANUAL_LANGS[pref]
    country = user.get("country") or "AU"
    return language_for_country(country)


def user_to_public(u: dict) -> dict:
    country = u.get("country") or "AU"
    lang_tag, lang_name = language_for_country(country)
    pub = {
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
    if u.get("role") == "manufacturer":
        pub["contacts"] = sanitize_manufacturer_contacts(u.get("contacts"))
        pub["primary_contact_id"] = u.get("primary_contact_id")
    return pub


# ---- Manufacturer contacts --------------------------------------------------
# Each manufacturer maintains exactly 3 contact slots. Missing entries are
# padded with empty placeholders so the front-end can render a stable grid.
import uuid as _uuid_lib  # noqa: E402

CONTACT_FIELDS = (
    "name",
    "company_title",
    "country",
    "mobile_number",
    "whatsapp_number",
    "wechat_id",
    "other_label",
    "other_value",
    "email",
)


def _empty_contact() -> dict:
    row = {"id": str(_uuid_lib.uuid4())}
    for f in CONTACT_FIELDS:
        row[f] = None
    return row


def sanitize_manufacturer_contacts(raw) -> list[dict]:
    """Coerce whatever's on disk into exactly 3 valid contact rows."""
    out: list[dict] = []
    if isinstance(raw, list):
        for entry in raw[:3]:
            if not isinstance(entry, dict):
                continue
            row = {"id": entry.get("id") or str(_uuid_lib.uuid4())}
            for f in CONTACT_FIELDS:
                v = entry.get(f)
                if isinstance(v, str):
                    v = v.strip() or None
                row[f] = v
            out.append(row)
    while len(out) < 3:
        out.append(_empty_contact())
    return out


def normalize_primary_contact_id(contacts: list[dict], primary_id: str | None) -> str | None:
    if not contacts:
        return None
    ids = [c.get("id") for c in contacts]
    if primary_id and primary_id in ids:
        return primary_id
    # Default to the first contact that has a name (otherwise the first slot).
    for c in contacts:
        if c.get("name"):
            return c.get("id")
    return ids[0]


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
        alias = o.get("manufacturer_alias") or WORKSHOP_FALLBACK
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
                visible_steps.append(
                    {
                        **s,
                        # Pending / on-hold / rejected media MUST never reach
                        # the client view — only the approved `photos[]` does.
                        "pending_photos": [],
                        "on_hold_photos": [],
                        "rejected_photos": [],
                    }
                )
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
                        "pending_photos": [],
                        "on_hold_photos": [],
                        "rejected_photos": [],
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
