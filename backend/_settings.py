"""
Lightweight singleton-document app settings layer.

We persist runtime-toggleable feature flags in a single mongo document
(``app_settings`` collection, ``_id = "default"``). The current flag set:

  - ``associate_approval_enabled``  — when False, only admins can moderate
                                       the photo approval queue. Defaults to
                                       True so associates can act out of the
                                       box; flip via PUT /api/admin/settings.

Adding a new flag is a two-step recipe: add the key to ``DEFAULT_SETTINGS``
and add it to the Pydantic ``SettingsPatch`` in :mod:`models`.
"""
from __future__ import annotations
import logging

from deps import db

logger = logging.getLogger(__name__)

DEFAULT_SETTINGS: dict = {
    "associate_approval_enabled": True,
}


async def get_settings() -> dict:
    doc = await db.app_settings.find_one({"_id": "default"}) or {}
    merged = {**DEFAULT_SETTINGS}
    for k in DEFAULT_SETTINGS:
        if k in doc:
            merged[k] = doc[k]
    return merged


async def update_settings(patch: dict) -> dict:
    sanitized = {k: v for k, v in patch.items() if k in DEFAULT_SETTINGS}
    if sanitized:
        await db.app_settings.update_one(
            {"_id": "default"},
            {"$set": sanitized},
            upsert=True,
        )
    return await get_settings()
