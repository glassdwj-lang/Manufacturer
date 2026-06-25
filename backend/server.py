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
from typing import Optional

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import APIRouter, FastAPI
from starlette.middleware.cors import CORSMiddleware

from _associate_importer import run_import_and_record
from deps import client, db
from routes import (
    admin_router,
    auth_router,
    meta_router,
    orders_router,
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
api_router.include_router(admin_router)
api_router.include_router(meta_router)
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Scheduler: daily associate sync ----
scheduler: Optional[AsyncIOScheduler] = None


@app.on_event("startup")
async def _start_scheduler():
    global scheduler
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
        scheduler.start()
        logger.info(
            "Associate sync scheduled daily at %02d:%02d %s", hour, minute, tz_name
        )
    except Exception as e:
        logger.warning("Could not start scheduler: %s", e)


@app.on_event("shutdown")
async def _stop_scheduler():
    if scheduler:
        scheduler.shutdown(wait=False)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
