"""User CRUD + alias/country/auto-forward management."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from _activity_log import record_event
from _associate_importer import SOURCE_TAG
from deps import db, get_current_user, require_roles
from helpers import _next_manufacturer_alias, hash_password, normalize_primary_contact_id, sanitize_manufacturer_contacts, user_to_public, SUPPORTED_MANUAL_LANGS
from models import AutoForwardToggle, LanguagePreference, ManufacturerContactsUpdate, UserAliasUpdate, UserCountryUpdate, UserCreate, UserPasswordUpdate, UserProfileUpdate

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
async def admin_create_user(data: UserCreate, request: Request, user=Depends(require_roles("admin"))):
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
    if data.role == "manufacturer" or data.role == "cad_renderer":
        if data.role == "manufacturer":
            user_doc["alias"] = await _next_manufacturer_alias()
        # Seed three empty contact slots so the vendor always has a stable
        # roster shape downstream (manufacturer and cad_renderer share it).
        user_doc["contacts"] = sanitize_manufacturer_contacts(None)
        user_doc["primary_contact_id"] = user_doc["contacts"][0]["id"]
    await db.users.insert_one(user_doc)
    return user_to_public(user_doc)


@router.get("/users/{user_id}")
async def admin_get_user(
    user_id: str, user=Depends(require_roles("admin", "associate"))
):
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    # Associates may only view their own clients.
    if user["role"] == "associate" and target.get("associate_id") != user["id"]:
        raise HTTPException(status_code=403)
    pub = user_to_public(target)
    # Surface the full extended profile so the edit screen can pre-fill.
    for k in (
        "phone_dial_code",
        "phone_number",
        "birthday",
        "city",
        "state",
        "address_line1",
        "address_line2",
    ):
        pub[k] = target.get(k)
    if target.get("role") == "manufacturer" or target.get("role") == "cad_renderer":
        # ``user_to_public`` already adds contacts; ensure they're present even
        # for legacy records that pre-date the contacts feature.
        if not pub.get("contacts"):
            pub["contacts"] = sanitize_manufacturer_contacts(None)
            pub["primary_contact_id"] = pub["contacts"][0]["id"]
    return pub


@router.patch("/users/{user_id}")
async def admin_update_user(
    user_id: str,
    body: UserProfileUpdate,
    request: Request,
    user=Depends(require_roles("admin")),
):
    """Admin-only profile patch. Accepts any subset of the extended fields;
    omitted/None fields are left untouched on the user document."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    updates: dict = {}
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is None:
            continue
        if k == "country":
            updates[k] = str(v).upper()
        elif isinstance(v, str):
            stripped = v.strip()
            updates[k] = stripped or None
        else:
            updates[k] = v
    if not updates:
        return user_to_public(target)
    await db.users.update_one({"id": user_id}, {"$set": updates})
    fresh = await db.users.find_one({"id": user_id})
    await record_event(
        db,
        request,
        "user.updated",
        user=user,
        meta={
            "target_user_id": user_id,
            "target_email": target.get("email"),
            "fields_changed": sorted(updates.keys()),
        },
    )
    request.state.activity_logged = True
    return user_to_public(fresh)


@router.put("/users/{user_id}/contacts")
async def admin_update_manufacturer_contacts(
    user_id: str,
    body: ManufacturerContactsUpdate,
    request: Request,
    user=Depends(require_roles("admin")),
):
    """Replace the manufacturer's contact roster wholesale and (optionally)
    designate one of the contacts as the primary. The roster is always
    persisted as exactly 3 slots — extras are dropped, missing slots are
    padded with empty placeholders."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") not in ("manufacturer", "cad_renderer"):
        raise HTTPException(
            status_code=400,
            detail="Contacts roster is only used for workshops and CAD/Render vendors.",
        )
    raw = [c.model_dump() for c in (body.contacts or [])]
    contacts = sanitize_manufacturer_contacts(raw)
    primary = normalize_primary_contact_id(contacts, body.primary_contact_id)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"contacts": contacts, "primary_contact_id": primary}},
    )
    filled = sum(1 for c in contacts if any(c.get(f) for f in ("name", "email", "mobile_number")))
    await record_event(
        db,
        request,
        "manufacturer.contacts.updated",
        user=user,
        meta={
            "target_user_id": user_id,
            "target_email": target.get("email"),
            "filled_slots": filled,
            "primary_contact_id": primary,
        },
    )
    request.state.activity_logged = True
    return {"ok": True, "contacts": contacts, "primary_contact_id": primary}


@router.put("/users/{user_id}/password")
async def admin_set_password(
    user_id: str,
    body: UserPasswordUpdate,
    request: Request,
    user=Depends(require_roles("admin")),
):
    """Admin-only password reset for a user. Source-mirrored associates/admins
    are intentionally still allowed to be reset locally (so the admin can hand a
    fresh password to anyone they manage)."""
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    pwd = (body.password or "").strip()
    if len(pwd) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    await db.users.update_one(
        {"id": user_id}, {"$set": {"hashed_password": hash_password(pwd)}}
    )
    await record_event(
        db,
        request,
        "user.password.reset",
        user=user,
        meta={"target_user_id": user_id, "target_email": target.get("email")},
    )
    request.state.activity_logged = True
    return {"ok": True}


@router.put("/users/{user_id}/alias")
async def admin_set_alias(
    user_id: str, body: UserAliasUpdate, request: Request, user=Depends(require_roles("admin"))
):
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] not in ("manufacturer", "cad_renderer"):
        raise HTTPException(
            status_code=400,
            detail="Alias is only used for workshops and CAD/Render vendors.",
        )
    alias = (body.alias or "").strip()
    if not alias:
        raise HTTPException(status_code=400, detail="Alias cannot be empty")
    prev = target.get("alias")
    await db.users.update_one({"id": user_id}, {"$set": {"alias": alias}})
    await record_event(
        db,
        request,
        "user.alias.changed",
        user=user,
        meta={
            "target_user_id": user_id,
            "target_email": target.get("email"),
            "from_alias": prev,
            "to_alias": alias,
        },
    )
    request.state.activity_logged = True
    return {"ok": True, "alias": alias}


@router.put("/users/{user_id}/country")
async def admin_update_country(
    user_id: str,
    body: UserCountryUpdate,
    request: Request,
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
    prev = target.get("country")
    await db.users.update_one({"id": user_id}, {"$set": {"country": code}})
    await record_event(
        db,
        request,
        "user.country.changed",
        user=user,
        meta={
            "target_user_id": user_id,
            "target_email": target.get("email"),
            "from_country": prev,
            "to_country": code,
        },
    )
    request.state.activity_logged = True
    return {"ok": True, "country": code}


@router.put("/users/{user_id}/auto-forward")
async def set_auto_forward(
    user_id: str,
    body: AutoForwardToggle,
    request: Request,
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
    await record_event(
        db,
        request,
        "user.auto_forward.changed",
        user=user,
        meta={
            "target_user_id": user_id,
            "target_email": target.get("email"),
            "auto_forward": body.auto_forward,
        },
    )
    request.state.activity_logged = True
    return {"ok": True, "auto_forward": body.auto_forward}


@router.put("/users/me/language")
async def set_my_language(
    body: LanguagePreference, request: Request, user=Depends(get_current_user)
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
    await record_event(
        db,
        request,
        "user.language.changed",
        user=user,
        meta={"language": lang or None},
    )
    request.state.activity_logged = True
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return user_to_public(updated)


@router.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request, user=Depends(require_roles("admin"))):
    if user_id == user["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("source") == SOURCE_TAG:
        raise HTTPException(
            status_code=400,
            detail="This user is mirrored from the source app and cannot be deleted here.",
        )
    # Refuse deletion when the user is still attached to live (non-recycled)
    # orders. The admin can soft-delete the orders first via the recycle bin.
    role = target.get("role")
    live_query: dict = {"deleted": {"$ne": True}}
    if role == "client":
        live_query["client_id"] = user_id
    elif role == "manufacturer":
        live_query["manufacturer_id"] = user_id
    else:
        live_query = None  # type: ignore[assignment]
    if live_query is not None:
        attached = await db.orders.count_documents(live_query)
        if attached:
            noun = "order" if attached == 1 else "orders"
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete: user is attached to {attached} active {noun}. "
                       "Move them to the recycle bin first.",
            )
    res = await db.users.delete_one({"id": user_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await record_event(
        db,
        request,
        "user.deleted",
        user=user,
        meta={
            "target_user_id": user_id,
            "target_email": target.get("email"),
            "role": target.get("role"),
            "alias": target.get("alias"),
        },
    )
    request.state.activity_logged = True
    return {"ok": True}
