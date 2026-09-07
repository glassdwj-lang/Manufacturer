"""Shared dependencies: Mongo client, auth config, and FastAPI auth dependencies.

Kept tiny on purpose — every route module imports `db` and (sometimes) the
auth helpers from here, so we never have circular imports between routers.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt as pyjwt
import pytz
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---- Mongo ----
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ---- Auth config ----
# SECURITY (SEC-002): JWT_SECRET MUST come from the environment. No
# in-repo fallback — a committed default lets anyone with source access
# mint valid admin tokens. We refuse to boot if the env value is
# missing, empty, or matches the retired default so old deployments
# don't silently keep using the compromised key.
_LEGACY_DEFAULT = (
    "somnio-atelier-luxury-jewelry-secret-key-2026-change-in-prod"
)
SECRET_KEY = os.environ.get("JWT_SECRET", "").strip()
if not SECRET_KEY or SECRET_KEY == _LEGACY_DEFAULT or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "JWT_SECRET is not set (or is too short / matches the retired "
        "default). Generate a fresh secret (e.g. "
        "`python -c 'import secrets; print(secrets.token_urlsafe(48))'`) "
        "and add it to backend/.env before starting the API."
    )
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
CHINA_TZ = pytz.timezone("Asia/Shanghai")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return pyjwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    request: Request, token: str = Depends(oauth2_scheme)
):
    try:
        payload = pyjwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "hashed_password": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    # Cache the authenticated user on request.state so the activity-log
    # middleware can attribute fallback events without re-decoding the JWT.
    try:
        request.state.current_user = user
    except Exception:
        pass
    return user


def require_roles(*allowed: str):
    async def checker(user=Depends(get_current_user)):
        if user["role"] not in allowed:
            raise HTTPException(
                status_code=403, detail=f"Forbidden for role {user['role']}"
            )
        return user

    return checker
