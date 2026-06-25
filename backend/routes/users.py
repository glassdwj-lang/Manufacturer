"""User CRUD + alias/country/auto-forward management."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from _associate_importer import SOURCE_TAG
from deps import db, require_roles
from helpers import _next_manufacturer_alias, hash_password, user_to_public
from models import AutoForwardToggle, UserAliasUpdate, UserCountryUpdate, UserCreate

router = APIRouter(tags=["users"])


@router.get("/users")
async def list_users(
    role: Optional[str] = None,
    user=Depends(require_roles("admin", "associate")),
):
    q: dict = {}
    if role:
        q["role"] = role
    users = await db.users.find(q, {"_id": 0, "hashed_password": 0}).to_list(1000)
    return [user_to_public(u) for u in users]


@router.post("/users")
async def admin_create_user(data: UserCreate, user=Depends(require_roles("admin"))):
    """Admin-only: create a new user. Associates and admins are managed by the
    source app (gem-gallery-193) and cannot be created locally."""
    if data.role in ("associate", "admin"):
        raise HTTPException(
            status_code=400,
            detail="Associates and admins are managed by the source app and cannot be created here.",
        )
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": data.email.lower(),
        "hashed_password": hash_password(data.password),
        "name": data.name,
        "role": data.role,
        "associate_id": data.associate_id,
        "auto_forward": False,
        "source": "local",
        "country": (data.country or "AU").upper(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if data.role == "manufacturer":
        user_doc["alias"] = await _next_manufacturer_alias()
    await db.users.insert_one(user_doc)
    return user_to_public(user_doc)


@router.put("/users/{user_id}/alias")
async def admin_set_alias(
    user_id: str, body: UserAliasUpdate, user=Depends(require_roles("admin"))
):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] != "manufacturer":
        raise HTTPException(status_code=400, detail="Alias is only used for manufacturers.")
    alias = (body.alias or "").strip()
    if not alias:
        raise HTTPException(status_code=400, detail="Alias cannot be empty")
    await db.users.update_one({"id": user_id}, {"$set": {"alias": alias}})
    return {"ok": True, "alias": alias}


@router.put("/users/{user_id}/country")
async def admin_update_country(
    user_id: str,
    body: UserCountryUpdate,
    user=Depends(require_roles("admin", "associate")),
):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] != "client":
        raise HTTPException(status_code=400, detail="Country is only tracked for clients.")
    if user["role"] == "associate" and target.get("associate_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your client")
    code = (body.country or "AU").upper()
    await db.users.update_one({"id": user_id}, {"$set": {"country": code}})
    return {"ok": True, "country": code}


@router.put("/users/{user_id}/auto-forward")
async def set_auto_forward(
    user_id: str,
    body: AutoForwardToggle,
    user=Depends(require_roles("admin", "associate")),
):
    """Associate toggling the auto-forward on a client they manage."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user["role"] == "associate" and target.get("associate_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your client")
    await db.users.update_one(
        {"id": user_id}, {"$set": {"auto_forward": body.auto_forward}}
    )
    return {"ok": True, "auto_forward": body.auto_forward}


@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, user=Depends(require_roles("admin"))):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = await db.users.find_one({"id": user_id})
    if target and target.get("source") == SOURCE_TAG:
        raise HTTPException(
            status_code=400,
            detail="This user is mirrored from the source app and cannot be deleted here.",
        )
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}
