"""In-app notification helpers — used by CAD/Render upload endpoints (and
anywhere else that wants to fan out an alert) to drop entries into the
`notifications` Mongo collection.

The collection schema (one doc per (user, event) pair):
    {
        "id":           str,           # uuid
        "user_id":      str,           # recipient
        "type":         str,           # "cad.uploaded" | "render.uploaded" | ...
        "title":        str,
        "body":         str,
        "link_route":   str | None,    # expo-router path, e.g. "/cad-files/<id>"
        "link_params":  dict | None,   # extra params for navigation
        "payload":      dict | None,   # raw context for the row
        "created_at":   ISO str,
        "read_at":      ISO str | None,
    }
"""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def create_notifications(
    db,
    *,
    audience_user_ids: list[str],
    type: str,
    title: str,
    body: str,
    link_route: str | None = None,
    link_params: dict | None = None,
    payload: dict | None = None,
) -> list[str]:
    """Insert one notification per audience user. Returns the inserted IDs."""
    if not audience_user_ids:
        return []
    seen: set[str] = set()
    now = _now_iso()
    docs = []
    for uid in audience_user_ids:
        if not uid or uid in seen:
            continue
        seen.add(uid)
        docs.append(
            {
                "id": str(uuid.uuid4()),
                "user_id": uid,
                "type": type,
                "title": title,
                "body": body,
                "link_route": link_route,
                "link_params": link_params,
                "payload": payload,
                "created_at": now,
                "read_at": None,
            }
        )
    if not docs:
        return []
    try:
        await db.notifications.insert_many(docs)
    except Exception as exc:  # noqa: BLE001 — never block the upload flow on a notif failure
        logger.exception("Failed to insert notifications: %s", exc)
        return []
    return [d["id"] for d in docs]


async def notify_admins_and_manufacturer(
    db,
    *,
    order: dict,
    actor_user_id: str,
    type: str,
    title: str,
    body: str,
    link_route: str | None = None,
    link_params: dict | None = None,
    payload: dict | None = None,
) -> list[str]:
    """Fan out a notification to every admin AND the order's assigned
    manufacturer. The actor (the person who triggered the event) is
    intentionally excluded so people don't get notified about their own
    actions."""
    audience: list[str] = []
    # All admins
    admins = await db.users.find(
        {"role": "admin"}, {"_id": 0, "id": 1}
    ).to_list(200)
    audience.extend(a["id"] for a in admins if a.get("id"))
    # Assigned manufacturer
    mfg_id = order.get("manufacturer_id")
    if mfg_id:
        audience.append(mfg_id)
    # Strip the actor — they triggered it, no need to ping themselves.
    audience = [uid for uid in audience if uid and uid != actor_user_id]
    return await create_notifications(
        db,
        audience_user_ids=audience,
        type=type,
        title=title,
        body=body,
        link_route=link_route,
        link_params=link_params,
        payload=payload,
    )
