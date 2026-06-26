"""User CRUD + alias/country/auto-forward management."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from _associate_importer import SOURCE_TAG
from deps import db, get_current_user, require_roles
from helpers import _next_manufacturer_alias, hash_password, user_to_public, SUPPORTED_MANUAL_LANGS
from models import AutoForwardToggle, LanguagePreference, UserAliasUpdate, UserCountryUpdate, UserCreate

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
        # Extended profile (manufacturer + client).
        "phone_dial_code": (data.phone_dial_code or "").strip() or None,
        "phone_number": (data.phone_number or "").strip() or None,
        "birthday": (data.birthday or "").strip() or None,
        "city": (data.city or "").strip() or None,
        "state": (data.state or "").strip() or None,
        "address_line1": (data.address_line1 or "").strip() or None,
        "address_line2": (data.address_line2 or "").strip() or None,
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


@router.put("/users/me/language")
async def set_my_language(
    body: LanguagePreference, user=Depends(get_current_user)
):
    """Lets ANY signed-in user pick a manual display language. Pass null/empty
    to clear the override and fall back to the country-derived language."""
    lang = (body.language or "").strip().lower()
    if lang and lang not in SUPPORTED_MANUAL_LANGS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language. Use one of: {sorted(SUPPORTED_MANUAL_LANGS.keys())}",
        )
    if lang:
        await db.users.update_one(
            {"id": user["id"]}, {"$set": {"preferred_language": lang}}
        )
    else:
        await db.users.update_one(
            {"id": user["id"]}, {"$unset": {"preferred_language": ""}}
        )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return user_to_public(updated)


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
