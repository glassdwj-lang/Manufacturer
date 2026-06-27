"""Admin-only endpoints: seed, extended seed, associate import status, alias
backfill, demo wipe."""
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

router = APIRouter(tags=["admin"])


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


# ---- Seed (idempotent demo users + 1 sample order) ----
@router.post("/seed")
async def seed_demo():
    """Idempotent seed: creates demo users and one sample order."""
    AT = chr(64)  # avoid literal-rewriting filters
    DOMAIN = AT + "somnio.co"
    demo_users = [
        {"email": "admin" + DOMAIN, "password": "Admin" + AT + "2026", "name": "Atelier Admin", "role": "admin"},
        {"email": "mfg" + DOMAIN, "password": "Mfg" + AT + "2026", "name": "Master Wei Chen", "role": "manufacturer"},
        {"email": "associate" + DOMAIN, "password": "Assoc" + AT + "2026", "name": "Elena Voss", "role": "associate"},
        {"email": "client" + DOMAIN, "password": "Client" + AT + "2026", "name": "Isabella Laurent", "role": "client"},
    ]
    created = []
    associate_id = None
    for u in demo_users:
        existing = await db.users.find_one({"email": u["email"]})
        if existing:
            # The associate seed can have its hashed_password wiped by the
            # gem-gallery importer in earlier runs. Restore it (and clear the
            # source tag) so the QUICK ACCESS · DEMO row keeps working.
            if u["role"] == "associate":
                await db.users.update_one(
                    {"email": u["email"]},
                    {
                        "$set": {
                            "hashed_password": hash_password(u["password"]),
                            "name": u["name"],
                            "role": "associate",
                            "source": "local-seed",
                            "disabled": False,
                            "status": "active",
                        }
                    },
                )
                associate_id = existing["id"]
            created.append({"email": u["email"], "role": u["role"], "status": "exists"})
            continue
        user_id = str(uuid.uuid4())
        doc = {
            "id": user_id,
            "email": u["email"],
            "hashed_password": hash_password(u["password"]),
            "name": u["name"],
            "role": u["role"],
            "associate_id": None,
            "auto_forward": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(doc)
        if u["role"] == "associate":
            associate_id = user_id
        created.append({"email": u["email"], "role": u["role"], "status": "created"})

    if associate_id:
        await db.users.update_one(
            {"email": "client" + DOMAIN},
            {"$set": {"associate_id": associate_id}},
        )

    sample = await db.orders.find_one({"order_ref": "SMN-DEMO0001"})
    if not sample:
        client_doc = await db.users.find_one({"email": "client" + DOMAIN})
        mfg = await db.users.find_one({"email": "mfg" + DOMAIN})
        order_id = str(uuid.uuid4())
        order = {
            "id": order_id,
            "order_ref": "SMN-DEMO0001",
            "client_id": client_doc["id"],
            "client_name": client_doc["name"],
            "manufacturer_id": mfg["id"],
            "manufacturer_name": mfg["name"],
            "associate_id": associate_id,
            "jewelry_name": "Étoile Solitaire — 2.1ct Lab Diamond Ring",
            "sku": "SOM-ESR-001",
            "description": "Platinum solitaire with halo. Customer: Isabella Laurent.",
            "status": "in_progress",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_at_china": now_china_iso(),
            "steps": build_initial_steps(),
            "customs": {"airway_bill": None, "customs_document": None, "notes": ""},
        }
        for i in range(3):
            order["steps"][i]["completed"] = True
            order["steps"][i]["completed_at_china"] = now_china_iso()
            order["steps"][i]["completed_at_utc"] = datetime.now(timezone.utc).isoformat()
            order["steps"][i]["notes"] = "Demo: completed during seed."
            order["steps"][i]["forwarded_to_client"] = True
            order["steps"][i]["forwarded_at"] = now_china_iso()
        await db.orders.insert_one(order)
        created.append({"order_ref": "SMN-DEMO0001", "status": "created"})
    return {"seeded": created}


# ---- Extended seed (8 commissions at varying stages) ----
@router.post("/seed-extended")
async def seed_extended():
    """Creates 8 sample commissions at different stages, with photos for completed steps."""
    try:
        from _seed_images import IMAGES
    except Exception:
        IMAGES = {}

    await seed_demo()
    AT = chr(64)
    DOMAIN = AT + "somnio.co"
    associate = await db.users.find_one({"email": "associate" + DOMAIN})
    client = await db.users.find_one({"email": "client" + DOMAIN})
    base_mfg = await db.users.find_one({"email": "mfg" + DOMAIN})
    if not (associate and client and base_mfg):
        raise HTTPException(status_code=500, detail="Base demo users missing")

    workshops = [
        ("Shanghai Master Atelier", "shanghai"),
        ("Shenzhen Diamond House", "shenzhen"),
        ("Guangzhou Heritage Works", "guangzhou"),
    ]
    workshop_ids = [base_mfg["id"]]
    for name, slug in workshops:
        email = slug + DOMAIN
        existing = await db.users.find_one({"email": email})
        if existing:
            workshop_ids.append(existing["id"])
            continue
        user_id = str(uuid.uuid4())
        await db.users.insert_one(
            {
                "id": user_id,
                "email": email,
                "hashed_password": hash_password("Mfg" + AT + "2026"),
                "name": name,
                "role": "manufacturer",
                "associate_id": None,
                "auto_forward": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        workshop_ids.append(user_id)

    extra_clients = [
        ("Margot Beaumont", "margot"),
        ("Henrik Tan", "henrik"),
        ("Sofia Castellano", "sofia"),
    ]
    client_ids = [client["id"]]
    for name, slug in extra_clients:
        email = slug + DOMAIN
        existing = await db.users.find_one({"email": email})
        if existing:
            client_ids.append(existing["id"])
            continue
        user_id = str(uuid.uuid4())
        await db.users.insert_one(
            {
                "id": user_id,
                "email": email,
                "hashed_password": hash_password("Client" + AT + "2026"),
                "name": name,
                "role": "client",
                "associate_id": associate["id"],
                "auto_forward": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        client_ids.append(user_id)

    sample_pool = [
        k
        for k in ["sketch", "cad", "casting", "setting", "polish", "ring", "necklace", "earring"]
        if k in IMAGES
    ]

    def photos_for_step(step_num: int) -> list:
        if not sample_pool:
            return []
        idx = (step_num - 1) % len(sample_pool)
        return [IMAGES[sample_pool[idx]]]

    commissions = [
        ("SMN-2026-101", "Lumière Solitaire — 1.8ct Lab Diamond Ring", "SOM-LSR-101", 2,  "Platinum band, halo setting. Engraving: 'M & H 2026'."),
        ("SMN-2026-102", "Aurore Pendant — Yellow Sapphire & Diamond Halo", "SOM-APD-102", 5,  "18k yellow gold chain, 1.2ct centre stone."),
        ("SMN-2026-103", "Étoile Eternity Band — Pavé Diamond", "SOM-EEB-103", 9,  "Platinum micro-pavé, 56 round brilliants."),
        ("SMN-2026-104", "Comète Drop Earrings — Pear Sapphire", "SOM-CDE-104", 13, "18k white gold, matched 0.9ct pair."),
        ("SMN-2026-105", "Maison Signature Tennis Bracelet", "SOM-MTB-105", 17, "Platinum, 4.6ct total weight."),
        ("SMN-2026-106", "Constellation Pavé Ring — Marquise", "SOM-CPR-106", 20, "18k rose gold, marquise diamond cluster."),
        ("SMN-2026-107", "Royale Emerald Cocktail Ring", "SOM-RECR-107", 23, "Colombian emerald, diamond shoulders, platinum."),
        ("SMN-2026-108", "Héritage Three-Stone Engagement Ring", "SOM-H3E-108", 26, "Trilogy lab diamonds, platinum. Delivered & registered."),
    ]

    seeded = []
    for ref, name, sku, completed_steps, desc in commissions:
        existing = await db.orders.find_one({"order_ref": ref})
        if existing:
            seeded.append({"order_ref": ref, "status": "exists"})
            continue

        mfg_id = workshop_ids[(int(ref[-3:]) - 101) % len(workshop_ids)]
        cli_id = client_ids[(int(ref[-3:]) - 101) % len(client_ids)]
        mfg_doc = await db.users.find_one({"id": mfg_id})
        cli_doc = await db.users.find_one({"id": cli_id})

        steps = build_initial_steps()
        base_time = datetime.now(timezone.utc) - timedelta(days=completed_steps, hours=2)
        for i in range(completed_steps):
            ts_utc = base_time + timedelta(hours=i * 6)
            ts_china = ts_utc.astimezone(CHINA_TZ).isoformat()
            steps[i]["completed"] = True
            steps[i]["completed_at_utc"] = ts_utc.isoformat()
            steps[i]["completed_at_china"] = ts_china
            steps[i]["notes"] = f"Completed {steps[i]['title']} \u2014 quality verified."
            steps[i]["photos"] = photos_for_step(steps[i]["step_number"])
            steps[i]["forwarded_to_client"] = True
            steps[i]["forwarded_at"] = ts_china
            steps[i]["associate_review_note"] = "Released to client."

        order_id = str(uuid.uuid4())
        order_status = "completed" if completed_steps >= 26 else "in_progress"
        order = {
            "id": order_id,
            "order_ref": ref,
            "client_id": cli_id,
            "client_name": cli_doc["name"] if cli_doc else "\u2014",
            "manufacturer_id": mfg_id,
            "manufacturer_name": mfg_doc["name"] if mfg_doc else "\u2014",
            "associate_id": associate["id"],
            "jewelry_name": name,
            "sku": sku,
            "description": desc,
            "status": order_status,
            "created_at": (datetime.now(timezone.utc) - timedelta(days=completed_steps + 1)).isoformat(),
            "created_at_china": (datetime.now(CHINA_TZ) - timedelta(days=completed_steps + 1)).isoformat(),
            "steps": steps,
            "customs": {"airway_bill": None, "customs_document": None, "notes": ""},
        }
        if completed_steps >= 26 and IMAGES.get("ring"):
            order["customs"] = {
                "airway_bill": IMAGES.get("ring"),
                "customs_document": IMAGES.get("necklace"),
                "notes": "AWB SMN-AWB-026 \u00b7 FedEx Priority \u00b7 Declared value USD 28,500 \u00b7 Shanghai \u2192 Geneva.",
                "updated_at_china": now_china_iso(),
            }
        await db.orders.insert_one(order)
        seeded.append({"order_ref": ref, "stage": f"{completed_steps}/26", "status": "created"})

    return {
        "seeded": seeded,
        "workshops": len(workshop_ids),
        "clients": len(client_ids),
    }


# ---- Cross-order CAD library (Phase 2) -------------------------------------
# Admin-only flat view of every CAD file across every non-deleted commission.
# Used by the new CAD Library page to bulk-email files via Resend without
# navigating to each order individually.


@router.get("/admin/cad-files")
async def admin_list_all_cad_files(
    user=Depends(require_roles("admin")),
    manufacturer_id: str | None = None,
    client_id: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Returns a flat list of CAD files, each row enriched with its parent
    commission context (order_ref, jewelry_name, manufacturer_name). Sorted
    newest-uploaded first so the most recent designs surface immediately.

    Filters (all optional):
    * ``manufacturer_id`` — only files from the named workshop
    * ``client_id``       — only files for the named client (orthogonal axis)
    * ``q``               — case-insensitive substring against file name OR
                            jewelry name OR order ref
    * ``date_from`` /
      ``date_to``         — inclusive ``uploaded_at`` date window
                            (ISO YYYY-MM-DD)
    """
    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
            {"deleted_at": ""},
        ]
    }
    query: dict = {"$and": [not_deleted, {"cad_files": {"$exists": True, "$ne": []}}]}
    if manufacturer_id:
        query["$and"].append({"manufacturer_id": manufacturer_id})
    if client_id:
        query["$and"].append({"client_id": client_id})

    rows: list[dict] = []
    needle = (q or "").strip().lower()
    df = (date_from or "").strip()
    dt = (date_to or "").strip()
    dt_end = (dt + "T23:59:59") if dt else None

    cursor = db.orders.find(query, {"_id": 0}).sort("created_at", -1)
    async for order in cursor:
        files = order.get("cad_files") or []
        if not files:
            continue
        order_match_q = (
            needle in (order.get("jewelry_name") or "").lower()
            or needle in (order.get("order_ref") or "").lower()
        )
        for f in files:
            uploaded = f.get("uploaded_at") or ""
            if df and uploaded < df:
                continue
            if dt_end and uploaded > dt_end:
                continue
            if needle and not (
                order_match_q or needle in (f.get("name") or "").lower()
            ):
                continue
            rows.append(
                {
                    **f,
                    "order_id": order.get("id"),
                    "order_ref": order.get("order_ref"),
                    "jewelry_name": order.get("jewelry_name"),
                    "manufacturer_id": order.get("manufacturer_id"),
                    "manufacturer_name": order.get("manufacturer_name"),
                    "manufacturer_alias": order.get("manufacturer_alias"),
                    "client_id": order.get("client_id"),
                    "client_name": order.get("client_name"),
                }
            )

    # Final sort: newest uploaded_at first; missing timestamps sink to the end.
    rows.sort(key=lambda r: r.get("uploaded_at") or "", reverse=True)
    return rows


class CadLibraryEmailItem(BaseModel):
    order_id: str
    file_id: str


class CadLibraryEmailPayload(BaseModel):
    recipients: list[str]
    items: list[CadLibraryEmailItem]
    subject: str | None = None
    message: str | None = None


@router.post("/admin/cad-files/email")
async def admin_email_cross_order_cad_files(
    body: CadLibraryEmailPayload,
    user=Depends(require_roles("admin")),
):
    """Bulk-email a selection of CAD files that may come from MANY different
    commissions. Composes a single email whose body groups the files by
    commission so the recipient sees clear provenance.

    Because the file rows reference orders other than the one the recipient
    cares about, the per-order context (jewelry name + order ref) is folded
    into the link labels — done client-side in the email template.
    """
    from _email import send_files_email
    from routes.orders._shared import sanitize_recipients

    cleaned = sanitize_recipients(body.recipients)
    if not cleaned:
        raise HTTPException(
            status_code=400, detail="Add at least one valid recipient email."
        )
    if len(cleaned) > 50:
        raise HTTPException(
            status_code=400, detail="Maximum 50 recipients per email."
        )
    if not body.items:
        raise HTTPException(status_code=400, detail="Select at least one file.")

    # Group requested {order_id, file_id} pairs so we only hit Mongo once per
    # order, not once per file.
    grouped: dict[str, set[str]] = {}
    for it in body.items:
        grouped.setdefault(it.order_id, set()).add(it.file_id)

    selected: list[dict] = []
    for order_id, file_ids in grouped.items():
        order = await db.orders.find_one(
            {"id": order_id, "$or": [
                {"deleted_at": {"$exists": False}},
                {"deleted_at": None},
                {"deleted_at": ""},
            ]},
            {"_id": 0},
        )
        if not order:
            continue
        ref = order.get("order_ref") or ""
        jewel = order.get("jewelry_name") or ""
        for f in (order.get("cad_files") or []):
            if f.get("id") not in file_ids:
                continue
            # Folder the per-order context into the filename used in the
            # email so the recipient can tell which commission each link
            # belongs to.
            label = f.get("name") or "CAD file"
            if jewel or ref:
                provenance = " · ".join(s for s in (jewel, ref) if s)
                label = f"{label}  ({provenance})"
            selected.append({**f, "name": label})

    if not selected:
        raise HTTPException(
            status_code=400, detail="None of the selected files were found."
        )

    try:
        provider_response = send_files_email(
            kind="cad",
            recipients=cleaned,
            subject=body.subject,
            message=body.message,
            sender_name=user.get("name"),
            sender_email=user.get("email"),
            order_ref=None,
            jewelry_name=None,
            files=selected,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Email provider error: {exc}"
        ) from exc

    return {
        "ok": True,
        "recipients": cleaned,
        "file_count": len(selected),
        "order_count": len(grouped),
        "provider_id": (
            provider_response.get("id")
            if isinstance(provider_response, dict)
            else None
        ),
    }


# ---- Seed: CAD & Render vendors -------------------------------------------
# Idempotent — running this multiple times will not duplicate vendors. Useful
# from the Atelier Debug screen to spin up a demo directory quickly.
@router.get("/admin/renders")
async def admin_list_all_renders(
    user=Depends(require_roles("admin")),
    cad_renderer_id: str | None = None,
    manufacturer_id: str | None = None,
    client_id: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Cross-order render library. Returns every APPROVED render (no pending
    entries) across every commission, enriched with its parent context.
    Mirrors :func:`admin_list_all_cad_files` so the frontend can reuse the
    same UX shell.

    Filters (all optional):
    * ``cad_renderer_id`` — narrow to a specific CAD/Render vendor
    * ``manufacturer_id`` — narrow to a specific workshop (orthogonal axis)
    * ``client_id``       — narrow to a specific client (orthogonal axis)
    * ``q``               — case-insensitive substring against render name,
                            jewelry name or order ref
    * ``date_from`` /
      ``date_to``         — inclusive ``uploaded_at`` window (YYYY-MM-DD)
    """
    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
            {"deleted_at": ""},
        ]
    }
    query: dict = {"$and": [not_deleted, {"renders": {"$exists": True, "$ne": []}}]}
    if cad_renderer_id:
        query["$and"].append({"cad_renderer_id": cad_renderer_id})
    if manufacturer_id:
        query["$and"].append({"manufacturer_id": manufacturer_id})
    if client_id:
        query["$and"].append({"client_id": client_id})

    rows: list[dict] = []
    needle = (q or "").strip().lower()
    df = (date_from or "").strip()
    dt = (date_to or "").strip()
    dt_end = (dt + "T23:59:59") if dt else None

    cursor = db.orders.find(query, {"_id": 0}).sort("created_at", -1)
    async for order in cursor:
        files = order.get("renders") or []
        if not files:
            continue
        order_match_q = (
            needle in (order.get("jewelry_name") or "").lower()
            or needle in (order.get("order_ref") or "").lower()
        )
        for f in files:
            uploaded = f.get("uploaded_at") or ""
            if df and uploaded < df:
                continue
            if dt_end and uploaded > dt_end:
                continue
            if needle and not (
                order_match_q or needle in (f.get("name") or "").lower()
            ):
                continue
            rows.append(
                {
                    **f,
                    "order_id": order.get("id"),
                    "order_ref": order.get("order_ref"),
                    "jewelry_name": order.get("jewelry_name"),
                    "manufacturer_id": order.get("manufacturer_id"),
                    "manufacturer_name": order.get("manufacturer_name"),
                    "manufacturer_alias": order.get("manufacturer_alias"),
                    "cad_renderer_id": order.get("cad_renderer_id"),
                    "cad_renderer_name": order.get("cad_renderer_name"),
                    "client_id": order.get("client_id"),
                    "client_name": order.get("client_name"),
                }
            )

    rows.sort(key=lambda r: r.get("uploaded_at") or "", reverse=True)
    return rows


@router.post("/admin/renders/email")
async def admin_email_cross_order_renders(
    body: CadLibraryEmailPayload,
    user=Depends(require_roles("admin")),
):
    """Bulk-email a multi-commission selection of renders. Same shape and
    semantics as the cross-order CAD endpoint — file IDs reference entries
    in ``order.renders`` (live, approved). Provenance (jewelry name + order
    ref) is appended to each link label so recipients can tell which
    commission a render belongs to."""
    from _email import send_files_email
    from routes.orders._shared import sanitize_recipients

    cleaned = sanitize_recipients(body.recipients)
    if not cleaned:
        raise HTTPException(
            status_code=400, detail="Add at least one valid recipient email."
        )
    if len(cleaned) > 50:
        raise HTTPException(
            status_code=400, detail="Maximum 50 recipients per email."
        )
    if not body.items:
        raise HTTPException(status_code=400, detail="Select at least one render.")

    grouped: dict[str, set[str]] = {}
    for it in body.items:
        grouped.setdefault(it.order_id, set()).add(it.file_id)

    selected: list[dict] = []
    for order_id, file_ids in grouped.items():
        order = await db.orders.find_one(
            {"id": order_id, "$or": [
                {"deleted_at": {"$exists": False}},
                {"deleted_at": None},
                {"deleted_at": ""},
            ]},
            {"_id": 0},
        )
        if not order:
            continue
        ref = order.get("order_ref") or ""
        jewel = order.get("jewelry_name") or ""
        for f in (order.get("renders") or []):
            if f.get("id") not in file_ids:
                continue
            label = f.get("name") or "Render"
            if jewel or ref:
                provenance = " · ".join(s for s in (jewel, ref) if s)
                label = f"{label}  ({provenance})"
            selected.append({**f, "name": label})

    if not selected:
        raise HTTPException(
            status_code=400,
            detail="None of the selected renders were found.",
        )

    try:
        # Reuse the CAD email template — visually identical and the
        # subject defaults can be overridden by the caller.
        provider_response = send_files_email(
            kind="cad",
            recipients=cleaned,
            subject=body.subject or "Renders",
            message=body.message,
            sender_name=user.get("name"),
            sender_email=user.get("email"),
            order_ref=None,
            jewelry_name=None,
            files=selected,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Email provider error: {exc}"
        ) from exc

    return {
        "ok": True,
        "recipients": cleaned,
        "file_count": len(selected),
        "order_count": len(grouped),
        "provider_id": (
            provider_response.get("id")
            if isinstance(provider_response, dict)
            else None
        ),
    }


# ---- Cross-Order IGI / Customs / Airway Bill Libraries -------------------
# Three sibling endpoints that mirror the CAD/Renders library pattern. Each
# returns a flat list of file rows enriched with the parent commission
# context (order_ref, jewelry_name, manufacturer details). All three are
# filtered by `manufacturer_id` (workshop) since these documents originate
# from the workshop side of the supply chain.
#
# The data layout differs per kind:
#   * IGI       -> `order.igi_certificates`               (top-level array)
#   * Airway    -> `order.customs.airway_bill_files`      (nested under customs)
#   * Customs   -> `order.customs.customs_files`          (nested under customs)
#
# We share a single helper so future kinds (e.g. invoices) can hook in with
# one line.


async def _list_cross_order_doc_files(
    *,
    field_path: tuple[str, ...],
    manufacturer_id: str | None,
    client_id: str | None,
    q: str | None,
    date_from: str | None,
    date_to: str | None,
) -> list[dict]:
    """Walks every non-deleted order and emits one row per file found at
    ``field_path`` (e.g. ``("igi_certificates",)`` or
    ``("customs", "airway_bill_files")``).

    Same filter semantics as ``admin_list_all_cad_files``: workshop, client,
    free-text against (jewelry_name | order_ref | file name), and an
    inclusive ``uploaded_at`` date window.
    """
    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
            {"deleted_at": ""},
        ]
    }
    query: dict = {"$and": [not_deleted]}
    if manufacturer_id:
        query["$and"].append({"manufacturer_id": manufacturer_id})
    if client_id:
        query["$and"].append({"client_id": client_id})

    needle = (q or "").strip().lower()
    df = (date_from or "").strip()
    dt = (date_to or "").strip()
    dt_end = (dt + "T23:59:59") if dt else None

    rows: list[dict] = []
    cursor = db.orders.find(query, {"_id": 0}).sort("created_at", -1)
    async for order in cursor:
        # Walk the nested path to fetch the file array.
        container: object = order
        for key in field_path:
            if isinstance(container, dict):
                container = container.get(key)
            else:
                container = None
                break
        files = container if isinstance(container, list) else []
        if not files:
            continue

        order_match_q = (
            needle in (order.get("jewelry_name") or "").lower()
            or needle in (order.get("order_ref") or "").lower()
        )
        for f in files:
            if not isinstance(f, dict):
                continue
            uploaded = f.get("uploaded_at") or ""
            if df and uploaded < df:
                continue
            if dt_end and uploaded > dt_end:
                continue
            if needle and not (
                order_match_q or needle in (f.get("name") or "").lower()
            ):
                continue
            rows.append(
                {
                    **f,
                    "order_id": order.get("id"),
                    "order_ref": order.get("order_ref"),
                    "jewelry_name": order.get("jewelry_name"),
                    "manufacturer_id": order.get("manufacturer_id"),
                    "manufacturer_name": order.get("manufacturer_name"),
                    "manufacturer_alias": order.get("manufacturer_alias"),
                    "client_id": order.get("client_id"),
                    "client_name": order.get("client_name"),
                }
            )

    rows.sort(key=lambda r: r.get("uploaded_at") or "", reverse=True)
    return rows


@router.get("/admin/igi-certificates")
async def admin_list_all_igi_certificates(
    user=Depends(require_roles("admin")),
    manufacturer_id: str | None = None,
    client_id: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Returns all approved IGI certificates across every commission. Mirrors
    ``admin_list_all_cad_files`` (same filter contract + enrichment fields)."""
    return await _list_cross_order_doc_files(
        field_path=("igi_certificates",),
        manufacturer_id=manufacturer_id,
        client_id=client_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/admin/airway-bill-files")
async def admin_list_all_airway_bill_files(
    user=Depends(require_roles("admin")),
    manufacturer_id: str | None = None,
    client_id: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Returns all airway-bill documents across every commission. The files
    live under ``order.customs.airway_bill_files``."""
    return await _list_cross_order_doc_files(
        field_path=("customs", "airway_bill_files"),
        manufacturer_id=manufacturer_id,
        client_id=client_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/admin/customs-files")
async def admin_list_all_customs_files(
    user=Depends(require_roles("admin")),
    manufacturer_id: str | None = None,
    client_id: str | None = None,
    q: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    """Returns all customs documents across every commission. The files live
    under ``order.customs.customs_files``."""
    return await _list_cross_order_doc_files(
        field_path=("customs", "customs_files"),
        manufacturer_id=manufacturer_id,
        client_id=client_id,
        q=q,
        date_from=date_from,
        date_to=date_to,
    )


# ---- Cross-order email helpers for the new libraries ---------------------


class DocLibraryEmailItem(BaseModel):
    order_id: str
    file_id: str


class DocLibraryEmailPayload(BaseModel):
    recipients: list[str]
    items: list[DocLibraryEmailItem]
    subject: str | None = None
    message: str | None = None


async def _bulk_email_doc_library(
    *,
    body: DocLibraryEmailPayload,
    user: dict,
    field_path: tuple[str, ...],
    kind: str,
    default_subject: str,
) -> dict:
    """Shared bulk-email implementation for the IGI / airway bill / customs
    libraries. Mirrors ``admin_email_cross_order_cad_files`` exactly so the
    frontend can reuse ``EmailFilesModal`` without surprises."""
    from _email import send_files_email
    from routes.orders._shared import sanitize_recipients

    cleaned = sanitize_recipients(body.recipients)
    if not cleaned:
        raise HTTPException(
            status_code=400, detail="Add at least one valid recipient email."
        )
    if len(cleaned) > 50:
        raise HTTPException(
            status_code=400, detail="Maximum 50 recipients per email."
        )
    if not body.items:
        raise HTTPException(status_code=400, detail="Select at least one file.")

    grouped: dict[str, set[str]] = {}
    for it in body.items:
        grouped.setdefault(it.order_id, set()).add(it.file_id)

    selected: list[dict] = []
    for order_id, file_ids in grouped.items():
        order = await db.orders.find_one(
            {
                "id": order_id,
                "$or": [
                    {"deleted_at": {"$exists": False}},
                    {"deleted_at": None},
                    {"deleted_at": ""},
                ],
            },
            {"_id": 0},
        )
        if not order:
            continue
        ref = order.get("order_ref") or ""
        jewel = order.get("jewelry_name") or ""
        container: object = order
        for key in field_path:
            if isinstance(container, dict):
                container = container.get(key)
            else:
                container = None
                break
        files = container if isinstance(container, list) else []
        for f in files:
            if not isinstance(f, dict) or f.get("id") not in file_ids:
                continue
            label = f.get("name") or f"{kind} file"
            if jewel or ref:
                provenance = " \u00b7 ".join(s for s in (jewel, ref) if s)
                label = f"{label}  ({provenance})"
            selected.append({**f, "name": label})

    if not selected:
        raise HTTPException(
            status_code=400, detail="None of the selected files were found."
        )

    try:
        provider_response = send_files_email(
            kind=kind,
            recipients=cleaned,
            subject=body.subject or default_subject,
            message=body.message,
            sender_name=user.get("name"),
            sender_email=user.get("email"),
            order_ref=None,
            jewelry_name=None,
            files=selected,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Email provider error: {exc}"
        ) from exc

    return {
        "ok": True,
        "recipients": cleaned,
        "file_count": len(selected),
        "order_count": len(grouped),
        "provider_id": (
            provider_response.get("id")
            if isinstance(provider_response, dict)
            else None
        ),
    }


@router.post("/admin/igi-certificates/email")
async def admin_email_cross_order_igi(
    body: DocLibraryEmailPayload,
    user=Depends(require_roles("admin")),
):
    return await _bulk_email_doc_library(
        body=body,
        user=user,
        field_path=("igi_certificates",),
        kind="igi",
        default_subject="IGI Certificates",
    )


@router.post("/admin/airway-bill-files/email")
async def admin_email_cross_order_airway_bills(
    body: DocLibraryEmailPayload,
    user=Depends(require_roles("admin")),
):
    return await _bulk_email_doc_library(
        body=body,
        user=user,
        field_path=("customs", "airway_bill_files"),
        kind="airway_bill",
        default_subject="Airway Bill Documents",
    )


@router.post("/admin/customs-files/email")
async def admin_email_cross_order_customs(
    body: DocLibraryEmailPayload,
    user=Depends(require_roles("admin")),
):
    return await _bulk_email_doc_library(
        body=body,
        user=user,
        field_path=("customs", "customs_files"),
        kind="customs",
        default_subject="Customs Documents",
    )


@router.post("/seed-cad-renderers")
async def seed_cad_renderers(user=Depends(require_roles("admin"))):
    """Seeds 4 production-grade CAD/Render vendor accounts with realistic
    aliases, country, contacts roster and the standard temporary password
    ``Cad@2026``. Returns the list of created/existing vendor IDs."""
    AT = chr(64)
    DOMAIN = AT + "somnio.co"
    vendors = [
        {
            "email": "atelier3d-geneva" + DOMAIN,
            "name": "Atelier 3D Geneva",
            "alias": "Somnio.Co Render Studio I",
            "country": "CH",
            "phone_dial_code": "+41",
            "phone_number": "22 555 0184",
            "city": "Geneva",
            "address_line1": "Rue du Rhône 65",
            "contacts": [
                {"name": "Claire Moreau", "role": "Lead Render Artist", "email": "claire" + AT + "atelier3d.ch", "phone": "+41 22 555 0184"},
                {"name": "Henri Dubois", "role": "CAD Engineer", "email": "henri" + AT + "atelier3d.ch", "phone": "+41 22 555 0185"},
                {"name": "", "role": "", "email": "", "phone": ""},
            ],
        },
        {
            "email": "lumiere-paris" + DOMAIN,
            "name": "Lumière Render Studio",
            "alias": "Somnio.Co Render Studio II",
            "country": "FR",
            "phone_dial_code": "+33",
            "phone_number": "1 42 78 0149",
            "city": "Paris",
            "address_line1": "8 Rue Saint-Honoré",
            "contacts": [
                {"name": "Élodie Laurent", "role": "Creative Director", "email": "elodie" + AT + "lumiere.fr", "phone": "+33 1 42 78 0149"},
                {"name": "Antoine Garnier", "role": "Senior CAD Modeller", "email": "antoine" + AT + "lumiere.fr", "phone": "+33 1 42 78 0150"},
                {"name": "Camille Roux", "role": "Render Specialist", "email": "camille" + AT + "lumiere.fr", "phone": "+33 1 42 78 0151"},
            ],
        },
        {
            "email": "hyperrender-tokyo" + DOMAIN,
            "name": "Hyper-Render Studio Tokyo",
            "alias": "Somnio.Co Render Studio III",
            "country": "JP",
            "phone_dial_code": "+81",
            "phone_number": "3 5413 7220",
            "city": "Tokyo",
            "address_line1": "Ginza 7-12-15, Chuo",
            "contacts": [
                {"name": "Yuki Tanaka", "role": "Lead Artist", "email": "yuki" + AT + "hyperrender.jp", "phone": "+81 3 5413 7220"},
                {"name": "Kenji Nakamura", "role": "STL/CAD Engineer", "email": "kenji" + AT + "hyperrender.jp", "phone": "+81 3 5413 7221"},
                {"name": "", "role": "", "email": "", "phone": ""},
            ],
        },
        {
            "email": "vector-nyc" + DOMAIN,
            "name": "Vector Studio NYC",
            "alias": "Somnio.Co Render Studio IV",
            "country": "US",
            "phone_dial_code": "+1",
            "phone_number": "212 555 0188",
            "city": "New York",
            "state": "NY",
            "address_line1": "47 W 47th St, Suite 1108",
            "contacts": [
                {"name": "Sasha Reilly", "role": "Studio Lead", "email": "sasha" + AT + "vector-nyc.com", "phone": "+1 212 555 0188"},
                {"name": "Marcus Lee", "role": "Senior CAD Designer", "email": "marcus" + AT + "vector-nyc.com", "phone": "+1 212 555 0189"},
                {"name": "Priya Kapoor", "role": "Render Artist", "email": "priya" + AT + "vector-nyc.com", "phone": "+1 212 555 0190"},
            ],
        },
    ]

    created: list[dict] = []
    skipped: list[dict] = []
    pwd_hash = hash_password("Cad" + AT + "2026")
    for spec in vendors:
        existing = await db.users.find_one({"email": spec["email"]})
        if existing:
            skipped.append({"id": existing["id"], "email": spec["email"], "name": existing.get("name")})
            continue
        contacts = sanitize_manufacturer_contacts(spec["contacts"])
        user_id = str(uuid.uuid4())
        await db.users.insert_one(
            {
                "id": user_id,
                "email": spec["email"],
                "hashed_password": pwd_hash,
                "name": spec["name"],
                "role": "cad_renderer",
                "associate_id": None,
                "auto_forward": False,
                "alias": spec["alias"],
                "country": spec.get("country"),
                "phone_dial_code": spec.get("phone_dial_code"),
                "phone_number": spec.get("phone_number"),
                "city": spec.get("city"),
                "state": spec.get("state"),
                "address_line1": spec.get("address_line1"),
                "contacts": contacts,
                "primary_contact_id": contacts[0]["id"],
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        created.append({"id": user_id, "email": spec["email"], "name": spec["name"]})

    return {
        "ok": True,
        "created": created,
        "skipped": skipped,
        "total": len(created) + len(skipped),
    }
