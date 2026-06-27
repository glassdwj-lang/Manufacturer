"""In-app notifications API — list / count / mark-read for the current user."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from deps import db, get_current_user

router = APIRouter(tags=["notifications"])


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/notifications")
async def list_notifications(
    limit: int = 50,
    unread_only: bool = False,
    user=Depends(get_current_user),
):
    """Newest-first list of the caller's notifications. Clamped to 100."""
    limit = max(1, min(int(limit or 50), 100))
    query: dict = {"user_id": user["id"]}
    if unread_only:
        query["read_at"] = None
    cursor = (
        db.notifications.find(query, {"_id": 0})
        .sort("created_at", -1)
        .limit(limit)
    )
    items = await cursor.to_list(limit)
    unread = await db.notifications.count_documents(
        {"user_id": user["id"], "read_at": None}
    )
    return {"items": items, "unread_count": unread}


@router.get("/notifications/unread-count")
async def unread_count(user=Depends(get_current_user)):
    count = await db.notifications.count_documents(
        {"user_id": user["id"], "read_at": None}
    )
    return {"unread_count": count}


@router.post("/notifications/{notification_id}/read")
async def mark_one_read(notification_id: str, user=Depends(get_current_user)):
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": user["id"]},
        {"$set": {"read_at": _iso_now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    unread = await db.notifications.count_documents(
        {"user_id": user["id"], "read_at": None}
    )
    return {"ok": True, "unread_count": unread}


@router.post("/notifications/mark-all-read")
async def mark_all_read(user=Depends(get_current_user)):
    result = await db.notifications.update_many(
        {"user_id": user["id"], "read_at": None},
        {"$set": {"read_at": _iso_now()}},
    )
    return {"ok": True, "marked": result.modified_count, "unread_count": 0}


@router.delete("/notifications/{notification_id}")
async def delete_notification(notification_id: str, user=Depends(get_current_user)):
    result = await db.notifications.delete_one(
        {"id": notification_id, "user_id": user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"ok": True}
