"""
Somnio.Co Atelier — 26-Step Jewelry Manufacturing Tracker.

This module is intentionally thin: it builds the FastAPI app, mounts the
routers from `routes/`, applies CORS, and owns the daily Associate-sync
scheduler. All endpoint logic lives in `routes/*.py`.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from _associate_importer import run_import_and_record
from deps import client, db
from routes import (
    admin_core_router,
    admin_cross_order_router,
    admin_dashboard_router,
    admin_seed_router,
    approvals_router,
    auth_router,
    meta_router,
    notifications_router,
    orders_router,
    manufacturers_router,
    quotes_router,
    rfqs_router,
    fx_router,
    competitors_router,
    uploads_router,
    users_router,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ---- App ----
app = FastAPI(title="Somnio.Co Atelier API")
api_router = APIRouter(prefix="/api")
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(orders_router)
api_router.include_router(admin_core_router)
api_router.include_router(admin_seed_router)
api_router.include_router(admin_cross_order_router)
api_router.include_router(admin_dashboard_router)
api_router.include_router(meta_router)
api_router.include_router(uploads_router)
api_router.include_router(approvals_router)
api_router.include_router(notifications_router)
api_router.include_router(manufacturers_router)
api_router.include_router(quotes_router)
api_router.include_router(rfqs_router)
api_router.include_router(fx_router)
api_router.include_router(competitors_router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- Activity-log middleware -------------------------------------------------
# Any mutating endpoint (POST/PUT/PATCH/DELETE) that hasn't already recorded
# a richer event itself will be logged here with a generic action name derived
# from the HTTP method + path. Handlers that record their own event simply set
# ``request.state.activity_logged = True`` to suppress this fallback.
from _activity_log import record_event  # noqa: E402

_LOGGED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_SKIP_PATHS = {"/api/auth/login", "/api/auth/me", "/api/auth/register"}


def _derive_action(method: str, path: str) -> str:
    parts = [p for p in path.strip("/").split("/") if p]
    if parts and parts[0] == "api":
        parts = parts[1:]
    # Replace UUID-like / numeric path segments with ``:id`` to keep the action
    # name stable across resources.
    cleaned = []
    for p in parts:
        if "-" in p and len(p) >= 32:
            cleaned.append(":id")
        elif p.isdigit():
            cleaned.append(":id")
        else:
            cleaned.append(p)
    return f"http.{method.lower()}." + ".".join(cleaned or ["root"])


@app.middleware("http")
async def _activity_log_middleware(request, call_next):
    response = await call_next(request)
    try:
        method = request.method.upper()
        path = request.url.path
        if method not in _LOGGED_METHODS or path in _SKIP_PATHS:
            return response
        if getattr(request.state, "activity_logged", False):
            return response
        if response.status_code >= 400:
            return response
        # Pull the authenticated user out of request.state if our auth
        # dependency stashed one there; otherwise fall back to SYSTEM.
        user = getattr(request.state, "current_user", None)
        actor = None
        if not user:
            actor = "anon"
        await record_event(
            db,
            request,
            _derive_action(method, path),
            user=user,
            actor_email=actor,
            meta={"path": path, "status": response.status_code},
        )
    except Exception:
        pass
    return response
# ----------------------------------------------------------------------------


# ---- Scheduler: daily associate sync ----
scheduler: Optional[AsyncIOScheduler] = None


@app.on_event("startup")
async def _start_scheduler():
    global scheduler
    # One-shot alias migration: rename legacy 'Somnio.Co Atelier N' to
    # 'Somnio.Co Atelier Workshop N' on users + orders. Safe & idempotent.
    try:
        from helpers import migrate_workshop_aliases
        res = await migrate_workshop_aliases()
        if res["users_updated"] or res["orders_updated"]:
            logger.info("Workshop alias migration: %s", res)
    except Exception as e:
        logger.warning("Workshop alias migration failed: %s", e)
    try:
        tz_name = os.environ.get("ASSOCIATE_SYNC_TZ", "Australia/Sydney")
        hour = int(os.environ.get("ASSOCIATE_SYNC_HOUR", "0"))
        minute = int(os.environ.get("ASSOCIATE_SYNC_MINUTE", "1"))
        scheduler = AsyncIOScheduler(timezone=pytz.timezone(tz_name))
        scheduler.add_job(
            lambda: asyncio.create_task(run_import_and_record(db)),
            CronTrigger(hour=hour, minute=minute),
            id="associate_sync",
            replace_existing=True,
        )
        # Monthly gem-gallery-193 country/state lookup sync — runs at 00:05
        # on the first day of every month in the same timezone.
        from _gem_gallery_meta_sync import sync_country_meta_from_gem_gallery
        from _countries_data import reset_overlay_cache

        async def _monthly_meta_sync():
            try:
                summary = await sync_country_meta_from_gem_gallery()
                reset_overlay_cache()
                # Persist a tiny audit trail so admins can inspect the last
                # run from the DB without grepping logs.
                await db.gem_gallery_meta_runs.insert_one(
                    {"summary": summary, "at": datetime.now(timezone.utc).isoformat()}
                )
            except Exception as exc:  # pragma: no cover - background task
                logger.exception("Monthly gem-gallery meta sync failed: %s", exc)

        scheduler.add_job(
            lambda: asyncio.create_task(_monthly_meta_sync()),
            CronTrigger(day="1", hour=0, minute=5),
            id="gem_gallery_meta_sync",
            replace_existing=True,
        )

        # Hourly expiry sweep — flips any RFQ broadcasts whose
        # `expires_at` is in the past to `status="expired"`. Also
        # nudges the RFQ's `updated_at` so admin lists reorder.
        async def _sweep_expired_broadcasts() -> None:
            try:
                now_iso = datetime.now(timezone.utc).isoformat()
                touched = 0
                cursor = db.rfqs.find(
                    {
                        "deleted": {"$ne": True},
                        "broadcasts": {
                            "$elemMatch": {
                                "status": {"$in": ["pending", "sent"]},
                                "expires_at": {"$lt": now_iso},
                            }
                        },
                    },
                    {"_id": 0, "id": 1, "broadcasts": 1},
                )
                async for doc in cursor:
                    changed = False
                    for b in doc.get("broadcasts", []):
                        if (
                            b.get("status") in ("pending", "sent")
                            and (b.get("expires_at") or "") < now_iso
                        ):
                            b["status"] = "expired"
                            changed = True
                    if changed:
                        await db.rfqs.update_one(
                            {"id": doc["id"]},
                            {"$set": {"broadcasts": doc["broadcasts"], "updated_at": now_iso}},
                        )
                        touched += 1
                if touched:
                    logger.info("Broadcast expiry sweep flipped %d RFQ(s)", touched)
            except Exception as exc:  # pragma: no cover - background task
                logger.exception("Broadcast expiry sweep failed: %s", exc)

        scheduler.add_job(
            _sweep_expired_broadcasts,   # coroutine — AsyncIOScheduler runs it on the loop
            CronTrigger(minute=17),   # every hour at :17
            id="broadcast_expiry_sweep",
            replace_existing=True,
        )
        scheduler.start()
        logger.info(
            "Associate sync scheduled daily at %02d:%02d %s", hour, minute, tz_name
        )
        logger.info(
            "Gem-gallery meta sync scheduled monthly on day 1 at 00:05 %s", tz_name
        )
        logger.info("Broadcast expiry sweep scheduled hourly at :17")
    except Exception as e:
        logger.warning("Could not start scheduler: %s", e)


@app.on_event("shutdown")
async def _stop_scheduler():
    if scheduler:
        scheduler.shutdown(wait=False)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
