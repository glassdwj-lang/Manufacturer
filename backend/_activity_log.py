"""Activity log — mirrors the gem-gallery-193 ``activity_log`` collection.

Schema (per row in MongoDB):
    {
      id:            str (uuid4),
      at:            ISO-8601 string with timezone,
      actor_email:   str (the user who performed the action, or "SYSTEM"),
      action:        str (dotted namespace, e.g. "admin.login", "user.created"),
      ip:            str | None,
      user_agent:    str | None,
      meta:          dict (free-form payload),
    }

A single ``record_event`` helper is intentionally the only public surface so
that every event in the codebase carries the same shape and the front-end can
render them uniformly.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Mapping, Optional

from fastapi import Request

logger = logging.getLogger(__name__)


def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    # Honour the standard reverse-proxy header (kubernetes ingress sets it).
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    if request.client:
        return request.client.host
    return None


def _user_agent(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    return request.headers.get("user-agent")


def _actor_email(user: Optional[Mapping[str, Any]]) -> str:
    if not user:
        return "SYSTEM"
    return str(user.get("email") or user.get("id") or "SYSTEM")


async def record_event(
    db: Any,
    request: Optional[Request],
    action: str,
    user: Optional[Mapping[str, Any]] = None,
    meta: Optional[Mapping[str, Any]] = None,
    actor_email: Optional[str] = None,
) -> None:
    """Insert one row into the ``activity_log`` collection. Never raises —
    we treat audit logging as best-effort so a logging failure can never
    take down a real user request."""
    try:
        row = {
            "id": str(uuid.uuid4()),
            "at": datetime.now(timezone.utc).isoformat(),
            "actor_email": actor_email or _actor_email(user),
            "action": action,
            "ip": _client_ip(request),
            "user_agent": _user_agent(request),
            "meta": dict(meta or {}),
        }
        await db.activity_log.insert_one(row)
    except Exception as exc:  # pragma: no cover
        logger.warning("activity_log insert failed for %s: %s", action, exc)


def fire_and_forget(
    db: Any,
    request: Optional[Request],
    action: str,
    user: Optional[Mapping[str, Any]] = None,
    meta: Optional[Mapping[str, Any]] = None,
    actor_email: Optional[str] = None,
) -> None:
    """Synchronous spawner so caller doesn't have to ``await``. Useful in
    middleware where awaiting would block the response."""
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        loop.create_task(
            record_event(db, request, action, user, meta=meta, actor_email=actor_email)
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("activity_log scheduling failed: %s", exc)
