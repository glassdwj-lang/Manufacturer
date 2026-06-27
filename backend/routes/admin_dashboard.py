"""Admin dashboard aggregator. One endpoint that returns every tile so the
front-end can render the entire screen with a single round-trip."""
from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from _associate_importer import SOURCE_TAG, get_last_run
from deps import db, require_roles

router = APIRouter(tags=["admin-dashboard"])


def _iso_n_days_ago(n: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=n)).isoformat()


def _range_iso_bounds(date_from: str | None, date_to: str | None):
    """Return (from_iso, to_iso) as full UTC midnight bounds, or None when
    the corresponding side wasn't supplied. ``date_to`` is inclusive — we
    push it to the end of the day so a same-day pick still matches rows
    created later in the day.
    """
    from_iso: str | None = None
    to_iso: str | None = None
    if date_from:
        try:
            d = datetime.fromisoformat(date_from)
            from_iso = d.replace(
                hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc
            ).isoformat()
        except ValueError:
            from_iso = None
    if date_to:
        try:
            d = datetime.fromisoformat(date_to)
            to_iso = d.replace(
                hour=23,
                minute=59,
                second=59,
                microsecond=999_000,
                tzinfo=timezone.utc,
            ).isoformat()
        except ValueError:
            to_iso = None
    return from_iso, to_iso


@router.get("/admin/dashboard")
async def admin_dashboard(
    date_from: str | None = None,
    date_to: str | None = None,
    user=Depends(require_roles("admin")),
):
    # ---- Date-range guard ----
    from_iso, to_iso = _range_iso_bounds(date_from, date_to)
    range_active = bool(from_iso or to_iso)

    def _date_filter(field: str) -> dict:
        """Build a Mongo subclause for ``field`` falling in [from, to]."""
        if not range_active:
            return {}
        clause: dict = {}
        if from_iso:
            clause["$gte"] = from_iso
        if to_iso:
            clause["$lte"] = to_iso
        return {field: clause}

    # ---- Commissions overview ----
    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
            {"deleted_at": ""},
        ]
    }
    base_filter: dict = {"$and": [not_deleted]}
    if range_active:
        base_filter["$and"].append(_date_filter("created_at"))

    total = await db.orders.count_documents(base_filter)
    completed_filter = {
        "$and": [
            *base_filter["$and"],
            {"completed_at": {"$exists": True, "$ne": None}},
        ]
    }
    completed = await db.orders.count_documents(completed_filter)
    active = total - completed
    by_phase: dict[int, int] = defaultdict(int)
    cursor = db.orders.find(
        base_filter, {"current_step_index": 1, "completed_at": 1, "_id": 0}
    )
    async for row in cursor:
        if row.get("completed_at"):
            continue
        idx = row.get("current_step_index")
        if isinstance(idx, int):
            by_phase[idx + 1] += 1

    # ---- Top manufacturers ----
    pipeline = [
        {
            "$match": {
                "$and": [
                    *base_filter["$and"],
                    {"manufacturer_id": {"$ne": None}},
                ]
            }
        },
        {"$group": {"_id": "$manufacturer_id", "active_count": {"$sum": 1}}},
        {"$sort": {"active_count": -1}},
        {"$limit": 5},
    ]
    top_raw = await db.orders.aggregate(pipeline).to_list(5)
    top_ids = [r["_id"] for r in top_raw if r["_id"]]
    workshops = await db.users.find(
        {"id": {"$in": top_ids}}, {"_id": 0, "id": 1, "name": 1, "alias": 1, "email": 1}
    ).to_list(len(top_ids))
    by_id = {w["id"]: w for w in workshops}
    top_manufacturers = [
        {
            "id": r["_id"],
            "name": (by_id.get(r["_id"]) or {}).get("name") or "—",
            "alias": (by_id.get(r["_id"]) or {}).get("alias") or "",
            "email": (by_id.get(r["_id"]) or {}).get("email") or "",
            "active_count": r["active_count"],
        }
        for r in top_raw
    ]

    # ---- Recent activity ----
    activity_filter: dict = {}
    if range_active:
        activity_filter = _date_filter("at")
    recent = await (
        db.activity_log.find(activity_filter, {"_id": 0}).sort("at", -1).limit(5)
    ).to_list(5)

    # ---- Pending approvals + missing contacts (structural — not range-filtered) ----
    approvals_cur = db.orders.aggregate(
        [
            {"$match": not_deleted},
            {"$unwind": "$steps"},
            {"$unwind": "$steps.photos"},
            {"$match": {"steps.photos.status": "hold"}},
            {"$count": "total"},
        ]
    )
    approvals_doc = await approvals_cur.to_list(1)
    approvals_pending = approvals_doc[0]["total"] if approvals_doc else 0

    mfgs = await db.users.find(
        {"role": "manufacturer"}, {"_id": 0, "id": 1, "contacts": 1}
    ).to_list(1000)
    missing_contacts = 0
    for m in mfgs:
        contacts = m.get("contacts") or []
        if not any((c or {}).get("name") for c in contacts):
            missing_contacts += 1
    workshops_total = len(mfgs)

    # ---- New users buckets ----
    iso_7 = _iso_n_days_ago(7)
    iso_30 = _iso_n_days_ago(30)

    async def _new_count(role: str, since: str) -> int:
        return await db.users.count_documents(
            {"role": role, "created_at": {"$gte": since}}
        )

    async def _new_count_range(role: str) -> int:
        """Count users with role created in the active range. When no range
        is active, returns the count of *all* users for that role so the
        front-end can still show a meaningful number."""
        clause: dict = {"role": role}
        if range_active:
            cf = _date_filter("created_at")
            if cf:
                clause.update(cf)
        return await db.users.count_documents(clause)

    new_users = {
        # Legacy 7d/30d buckets — keep so the dashboard renders the rolling
        # split when no explicit range is selected.
        "client_7d": await _new_count("client", iso_7),
        "client_30d": await _new_count("client", iso_30),
        "manufacturer_7d": await _new_count("manufacturer", iso_7),
        "manufacturer_30d": await _new_count("manufacturer", iso_30),
        "associate_7d": await _new_count("associate", iso_7),
        "associate_30d": await _new_count("associate", iso_30),
        # New: a single count per role for the *currently selected* range.
        "client_in_range": await _new_count_range("client"),
        "manufacturer_in_range": await _new_count_range("manufacturer"),
        "associate_in_range": await _new_count_range("associate"),
    }

    # ---- Sync status ----
    associate_status = {
        "last_run": get_last_run(),
        "schedule": {
            "tz": os.environ.get("ASSOCIATE_SYNC_TZ", "Australia/Sydney"),
            "hour": int(os.environ.get("ASSOCIATE_SYNC_HOUR", "0")),
            "minute": int(os.environ.get("ASSOCIATE_SYNC_MINUTE", "1")),
            "description": "Daily at 00:01",
        },
    }
    gem_doc = await db.gem_gallery_meta_runs.find_one(sort=[("at", -1)])
    if gem_doc:
        gem_doc.pop("_id", None)
    gem_status = {
        "last_run": gem_doc,
        "schedule": {
            "tz": os.environ.get("ASSOCIATE_SYNC_TZ", "Australia/Sydney"),
            "day": 1,
            "hour": 0,
            "minute": 5,
            "description": "First day of every month at 00:05",
        },
    }

    return {
        "commissions": {
            "total": total,
            "active": active,
            "completed": completed,
            "by_phase": dict(sorted(by_phase.items())),
        },
        "top_manufacturers": top_manufacturers,
        "recent_activity": recent,
        "approvals_pending": approvals_pending,
        "missing_contacts": missing_contacts,
        "workshops_total": workshops_total,
        "new_users": new_users,
        "sync_status": {
            "associate_sync": associate_status,
            "gem_gallery_meta": gem_status,
        },
        "range": {
            "active": range_active,
            "date_from": date_from or None,
            "date_to": date_to or None,
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source_tag": SOURCE_TAG,
    }
