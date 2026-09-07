"""Authentication routes: register, login (with source-proxy fallback), me."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from _activity_log import record_event
from _associate_importer import SOURCE_TAG, source_proxy_auth
from deps import create_token, db, get_current_user
from helpers import hash_password, user_to_public, verify_password
from models import TokenResponse, UserCreate, UserLogin, UserPublic

router = APIRouter(tags=["auth"])


@router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserCreate, request: Request):
    """Public sign-up — HARD-LOCKED to the ``client`` role.

    Prior versions accepted any role in the payload, meaning an
    unauthenticated visitor could ``POST /auth/register`` with
    ``role: "admin"`` and receive a full admin token (SEC-001). Any
    non-client role is silently downgraded here — privileged accounts
    (admin / associate / manufacturer) can only be created via the
    admin-authenticated user-management endpoints.
    """
    existing = await db.users.find_one({"email": data.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    # SECURITY: never trust client-supplied role on the public endpoint.
    effective_role = "client"
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": data.email.lower(),
        "hashed_password": hash_password(data.password),
        "name": data.name,
        "role": effective_role,
        # ``associate_id`` only makes sense for client accounts anyway.
        "associate_id": data.associate_id,
        "auto_forward": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id, effective_role)
    await record_event(
        db,
        request,
        "auth.registered",
        user=user_doc,
        meta={
            "role": effective_role,
            "user_id": user_id,
            # Log if we downgraded so audits can flag suspicious attempts.
            "role_requested": data.role,
            "role_downgraded": data.role != effective_role,
        },
    )
    request.state.activity_logged = True
    return TokenResponse(access_token=token, user=UserPublic(**user_to_public(user_doc)))


@router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user:
        await record_event(
            db,
            request,
            "auth.login.failed",
            actor_email=data.email.lower(),
            meta={"reason": "unknown_email"},
        )
        request.state.activity_logged = True
        raise HTTPException(status_code=401, detail="Invalid credentials")

    local_ok = bool(user.get("hashed_password")) and verify_password(
        data.password, user["hashed_password"]
    )

    if not local_ok and user.get("source") == SOURCE_TAG:
        # Fallback for source-owned users: verify against gem-gallery-193.
        # Imported associates/admins can keep using the credentials they have
        # on the source app even when no local password has been issued.
        try:
            proxy_ok = await source_proxy_auth(data.email.lower(), data.password)
        except Exception:
            proxy_ok = False
        if proxy_ok:
            # Cache the bcrypt hash so subsequent logins work even when the
            # source app is unreachable.
            await db.users.update_one(
                {"id": user["id"]},
                {"$set": {"hashed_password": hash_password(data.password)}},
            )
            local_ok = True

    if not local_ok:
        await record_event(
            db,
            request,
            "auth.login.failed",
            user=user,
            meta={"reason": "bad_password", "user_id": user["id"]},
        )
        request.state.activity_logged = True
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_token(user["id"], user["role"])
    await record_event(
        db,
        request,
        "auth.login",
        user=user,
        meta={"role": user["role"], "user_id": user["id"]},
    )
    request.state.activity_logged = True
    return TokenResponse(access_token=token, user=UserPublic(**user_to_public(user)))


@router.get("/auth/me", response_model=UserPublic)
async def me(user=Depends(get_current_user)):
    return UserPublic(**user_to_public(user))
