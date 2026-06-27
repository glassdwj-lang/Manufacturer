"""Admin core endpoints (insights, translation debug, syncs, activity, maintenance).
Extracted from the monolithic routes/admin.py during the refactor sweep."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from _associate_importer import get_last_run, run_import_and_record
from _translation import COUNTRY_LIST, language_for_country, translate as translate_text
from deps import CHINA_TZ, db, require_roles
from helpers import _next_manufacturer_alias, hash_password, now_china_iso, sanitize_manufacturer_contacts
from phases import build_initial_steps
from pydantic import BaseModel

router = APIRouter(tags=["admin-core"])



# -------------------------------------------------------------------------
# Daily insights — bar chart on the home dashboard
# -------------------------------------------------------------------------
@router.get("/admin/insights/daily")
async def admin_insights_daily(
    days: int = 30,
    date_from: str | None = None,
    date_to: str | None = None,
    user=Depends(require_roles("admin", "associate")),
):
    """Returns a daily volume summary for the home-dashboard bar chart.

    Window controls (mutually exclusive — explicit range wins):
      * ``days`` — rolling N-day window ending today (default 30, clamped 1–365)
      * ``date_from`` / ``date_to`` — explicit inclusive YYYY-MM-DD window;
        when present these override ``days``.

    Each bucket combines three atelier-wide signals into a single stacked bar:

    * ``commissions`` — orders created on that day (uses ``created_at`` UTC)
    * ``forwarded``   — step forwards to the client (uses ``steps.forwarded_at``
                        which is stored in China-local ISO)
    * ``dnas``        — orders where the *final* step (#26) was completed on
                        that day, i.e. Digital DNA officially ready to issue

    Scope is atelier-wide for both admin and associate viewers.
    Soft-deleted orders are ignored.
    """
    today = datetime.now(timezone.utc).date()

    # Resolve the window.
    if date_from or date_to:
        try:
            start = (
                datetime.fromisoformat(date_from).date()
                if date_from
                else today - timedelta(days=29)
            )
        except ValueError:
            start = today - timedelta(days=29)
        try:
            end = (
                datetime.fromisoformat(date_to).date() if date_to else today
            )
        except ValueError:
            end = today
        if end < start:
            start, end = end, start
        # Hard cap so the response never explodes if someone picks a huge
        # custom range (e.g. multi-year). 366 buckets covers a full year.
        span = (end - start).days + 1
        if span > 366:
            start = end - timedelta(days=365)
            span = 366
        days = span
        window_start = start
    else:
        days = max(1, min(int(days or 30), 365))
        window_start = today - timedelta(days=days - 1)
        end = today

    # Initialise buckets so the response always has `days` rows even if
    # some days are zero. Keys are ISO date strings (YYYY-MM-DD).
    buckets: dict[str, dict[str, int]] = {
        (window_start + timedelta(days=i)).isoformat(): {
            "commissions": 0,
            "forwarded": 0,
            "dnas": 0,
        }
        for i in range(days)
    }
    start_iso = window_start.isoformat()

    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
            {"deleted_at": ""},
        ]
    }
    cursor = db.orders.find(
        not_deleted, {"_id": 0, "created_at": 1, "steps": 1}
    )
    async for o in cursor:
        ca = (o.get("created_at") or "")[:10]
        if ca >= start_iso and ca in buckets:
            buckets[ca]["commissions"] += 1
        for s in o.get("steps") or []:
            fa = (s.get("forwarded_at") or "")[:10]
            if fa and fa in buckets:
                buckets[fa]["forwarded"] += 1
            if s.get("step_number") == 26 and s.get("completed"):
                cc = (s.get("completed_at_china") or s.get("completed_at_utc") or "")[:10]
                if cc and cc in buckets:
                    buckets[cc]["dnas"] += 1

    series = [
        {
            "date": d,
            "commissions": v["commissions"],
            "forwarded": v["forwarded"],
            "dnas": v["dnas"],
            "total": v["commissions"] + v["forwarded"] + v["dnas"],
        }
        for d, v in sorted(buckets.items())
    ]
    totals = {
        "commissions": sum(b["commissions"] for b in buckets.values()),
        "forwarded": sum(b["forwarded"] for b in buckets.values()),
        "dnas": sum(b["dnas"] for b in buckets.values()),
    }
    return {
        "days": days,
        "start": series[0]["date"] if series else None,
        "end": series[-1]["date"] if series else None,
        "series": series,
        "totals": totals,
    }


# ---- Test translation (admin debug, exercises the Claude integration) ----
class TestTranslateBody(BaseModel):
    text: str
    target_lang: str = ""           # e.g. "fr"
    target_lang_name: str = ""      # e.g. "French"
    country: str = ""               # optional: derive lang from country instead


@router.post("/admin/test-translate")
async def admin_test_translate(
    body: TestTranslateBody, user=Depends(require_roles("admin"))
):
    """Run a one-off translation through the same Claude pipeline used by
    `complete_step`. Useful for sanity-checking the integration and the
    Universal LLM Key budget without having to ping-pong roles."""
    target = (body.target_lang or "").strip()
    name = (body.target_lang_name or "").strip()
    if body.country and not target:
        target, name = language_for_country(body.country.upper())
    if not target:
        target, name = "en", "English"
    if target.lower().startswith("en"):
        return {
            "ok": True,
            "source": body.text,
            "target_lang": target,
            "target_lang_name": name,
            "translation": body.text,
            "note": "Target is English — original returned unchanged.",
        }
    if not body.text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    try:
        result = await translate_text(body.text, target, name)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Translation backend error: {e}")
    return {
        "ok": bool(result),
        "source": body.text,
        "target_lang": target,
        "target_lang_name": name,
        "translation": result or "",
        "note": (
            "Empty translation — check backend logs (likely a Claude / LLM key error)."
            if not result
            else None
        ),
    }


@router.get("/admin/test-translate/languages")
async def admin_translate_languages(user=Depends(require_roles("admin"))):
    """Helper for the picker — returns {code, name, language, language_name}
    for every supported country so the test panel can offer the same dropdown
    used elsewhere in the app."""
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


# ---- Associate sync ----
@router.post("/admin/import-associates")
async def import_associates(user=Depends(require_roles("admin"))):
    """Manual trigger for the associate sync."""
    return await run_import_and_record(db)


@router.get("/admin/import-associates/status")
async def import_associates_status(user=Depends(require_roles("admin"))):
    """Last-run result + scheduled job info."""
    sched_info = {
        "tz": os.environ.get("ASSOCIATE_SYNC_TZ", "Australia/Sydney"),
        "hour": int(os.environ.get("ASSOCIATE_SYNC_HOUR", "0")),
        "minute": int(os.environ.get("ASSOCIATE_SYNC_MINUTE", "1")),
    }
    return {"last_run": get_last_run(), "schedule": sched_info}


# ---- Gem-gallery country / state lookup sync ----
@router.post("/admin/sync-gem-gallery-meta")
async def admin_sync_gem_gallery_meta(user=Depends(require_roles("admin"))):
    """Manual trigger for the monthly country/state/region sync from
    gem-gallery-193. Returns a summary of additions/updates."""
    from _gem_gallery_meta_sync import sync_country_meta_from_gem_gallery
    from _countries_data import reset_overlay_cache

    summary = await sync_country_meta_from_gem_gallery()
    reset_overlay_cache()
    await db.gem_gallery_meta_runs.insert_one(
        {
            "summary": summary,
            "at": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
            "trigger": "manual",
            "by_user": user["id"],
        }
    )
    return summary


@router.get("/admin/sync-gem-gallery-meta/status")
async def admin_sync_gem_gallery_meta_status(user=Depends(require_roles("admin"))):
    """Return the last gem-gallery meta-sync run, if any."""
    doc = await db.gem_gallery_meta_runs.find_one(sort=[("at", -1)])
    if doc:
        doc.pop("_id", None)
    return {
        "last_run": doc,
        "schedule": {
            "tz": os.environ.get("ASSOCIATE_SYNC_TZ", "Australia/Sydney"),
            "day": 1,
            "hour": 0,
            "minute": 5,
            "description": "First day of every month at 00:05",
        },
    }


# ---- Activity log ----
@router.get("/admin/activity-log")
async def admin_activity_log(
    limit: int = 200,
    offset: int = 0,
    action: str | None = None,
    actor_email: str | None = None,
    user=Depends(require_roles("admin")),
):
    """Mirrors the gem-gallery-193 ``/api/admin/activity-log`` shape.

    Supports lightweight filtering by ``action`` (exact match) and
    ``actor_email`` (case-insensitive partial). Results are ordered
    newest-first and capped at 1000 to protect the client."""
    q: dict = {}
    if action:
        q["action"] = action
    if actor_email:
        q["actor_email"] = {"$regex": actor_email.replace(".", r"\."), "$options": "i"}
    limit = max(1, min(int(limit), 1000))
    offset = max(0, int(offset))
    cur = (
        db.activity_log.find(q, {"_id": 0})
        .sort("at", -1)
        .skip(offset)
        .limit(limit)
    )
    rows = await cur.to_list(limit)
    total = await db.activity_log.count_documents(q)
    return {"rows": rows, "total": total, "limit": limit, "offset": offset}


@router.get("/admin/activity-log/actions")
async def admin_activity_log_actions(user=Depends(require_roles("admin"))):
    """Distinct action names — useful to populate a filter dropdown."""
    actions = await db.activity_log.distinct("action")
    return {"actions": sorted(actions)}


# ---- Alias backfill ----
@router.post("/admin/backfill-aliases")
async def admin_backfill_aliases(user=Depends(require_roles("admin"))):
    """Assigns 'Somnio.Co Atelier N' to any manufacturer that doesn't have an alias yet,
    and stamps the manufacturer_alias on existing orders."""
    assigned = []
    async for m in db.users.find(
        {"role": "manufacturer", "$or": [{"alias": {"$exists": False}}, {"alias": ""}]},
        {"_id": 0, "id": 1, "name": 1},
    ):
        alias = await _next_manufacturer_alias()
        await db.users.update_one({"id": m["id"]}, {"$set": {"alias": alias}})
        assigned.append({"id": m["id"], "name": m["name"], "alias": alias})
    propagated = 0
    async for mfg in db.users.find(
        {"role": "manufacturer", "alias": {"$exists": True, "$ne": ""}},
        {"_id": 0, "id": 1, "alias": 1},
    ):
        r = await db.orders.update_many(
            {
                "manufacturer_id": mfg["id"],
                "$or": [
                    {"manufacturer_alias": {"$exists": False}},
                    {"manufacturer_alias": ""},
                ],
            },
            {"$set": {"manufacturer_alias": mfg["alias"]}},
        )
        propagated += r.modified_count
    return {
        "assigned": assigned,
        "count": len(assigned),
        "orders_stamped": propagated,
    }


# ---- Demo wipe ----
@router.post("/admin/wipe-demo")
async def admin_wipe_demo(user=Depends(require_roles("admin"))):
    """DESTRUCTIVE - QA only. Deletes ALL orders and ALL users except the calling admin.
    Re-run /api/seed and /api/seed-extended afterwards to repopulate."""
    o_res = await db.orders.delete_many({})
    u_res = await db.users.delete_many({"id": {"$ne": user["id"]}})
    return {
        "ok": True,
        "orders_deleted": o_res.deleted_count,
        "users_deleted": u_res.deleted_count,
        "preserved_admin": user["email"],
    }


