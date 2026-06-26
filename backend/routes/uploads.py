"""Cloudinary-backed upload endpoints.

- ``POST /api/uploads/sign``      — returns a signed-upload payload so the
  client can POST the file straight to Cloudinary (preferred path).
- ``POST /api/uploads/base64``    — proxy upload of a single base64 string
  (used by the photo migration + by clients that cannot reach Cloudinary
  directly).
- ``POST /api/admin/photos/migrate`` — admin-only one-shot that walks all
  orders, lifts legacy base64 photos onto Cloudinary, and persists URLs back
  on each step. Idempotent: skips photos that are already URLs.
"""
from __future__ import annotations
import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from _cloudinary import (
    generate_signed_upload_payload,
    is_cloudinary_url,
    upload_base64_to_cloudinary,
)
from deps import db, get_current_user, require_roles

logger = logging.getLogger(__name__)
router = APIRouter()


# --------------------------------------------------------------------- sign
class SignUploadRequest(BaseModel):
    folder: Optional[str] = None
    public_id: Optional[str] = None
    tags: Optional[str] = None
    resource_type: Optional[str] = "image"  # "image" | "video" | "raw"


_VALID_RESOURCE_TYPES = {"image", "video", "raw"}


@router.post("/uploads/sign")
async def sign_upload(
    body: SignUploadRequest | None = None,
    user=Depends(get_current_user),
):
    """Return a single-use Cloudinary upload signature for the caller."""
    body = body or SignUploadRequest()
    rt = (body.resource_type or "image").lower()
    if rt not in _VALID_RESOURCE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"resource_type must be one of {sorted(_VALID_RESOURCE_TYPES)}",
        )
    try:
        payload = generate_signed_upload_payload(
            folder=body.folder,
            public_id=body.public_id,
            tags=body.tags,
            resource_type=rt,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    # Stamp who requested the signature for audit purposes (not returned).
    logger.info(
        "Cloudinary sign issued to %s (role=%s, resource=%s)",
        user["email"],
        user["role"],
        rt,
    )
    return payload


# --------------------------------------------------------- base64 fallback
class Base64UploadRequest(BaseModel):
    base64_data: str
    folder: Optional[str] = None
    public_id: Optional[str] = None
    resource_type: Optional[str] = "image"


@router.post("/uploads/base64")
async def upload_base64(
    body: Base64UploadRequest,
    user=Depends(get_current_user),
):
    """Server-side upload fallback. Returns ``{"secure_url": "..."}``."""
    try:
        url = upload_base64_to_cloudinary(
            body.base64_data,
            folder=body.folder,
            public_id=body.public_id,
            resource_type=(body.resource_type or "image"),
        )
    except Exception as e:
        logger.exception("Cloudinary base64 upload failed for %s", user["email"])
        raise HTTPException(status_code=500, detail=str(e))
    return {"secure_url": url}


# ----------------------------------------------------------- migration
@router.post("/admin/photos/migrate")
async def migrate_photos(
    user=Depends(require_roles("admin")),
    limit: int = 0,
):
    """One-shot admin migration: walk all orders (including soft-deleted) and
    lift any base64 step photos into Cloudinary. Skips strings that are
    already HTTPS URLs so this endpoint is safe to re-run.

    Query params:
      - ``limit``  — when >0, processes at most this many orders (handy for
                     dry-runs / chunked migrations).
    """
    cursor = db.orders.find({}, {"_id": 0, "id": 1, "steps": 1})
    total_orders = 0
    touched_orders = 0
    uploaded = 0
    skipped_urls = 0
    failures = 0

    async for order in cursor:
        total_orders += 1
        if limit and touched_orders >= limit:
            break
        steps = order.get("steps") or []
        order_dirty = False
        for step in steps:
            photos = step.get("photos") or []
            if not photos:
                continue

            new_photos: list[str] = []
            step_dirty = False
            for p in photos:
                if not p:
                    continue
                if is_cloudinary_url(p) or p.startswith("http://") or p.startswith("https://"):
                    new_photos.append(p)
                    skipped_urls += 1
                    continue
                # base64 / data URI — upload it
                try:
                    public_id = (
                        f"order-{order['id']}_step-{step.get('step_number')}"
                        f"_{len(new_photos) + 1}"
                    )
                    url = await asyncio.to_thread(
                        upload_base64_to_cloudinary,
                        p,
                        public_id=public_id,
                    )
                    new_photos.append(url)
                    uploaded += 1
                    step_dirty = True
                except Exception:
                    logger.exception(
                        "Migration upload failed: order=%s step=%s",
                        order["id"],
                        step.get("step_number"),
                    )
                    failures += 1
                    # Keep the original base64 so we can retry later.
                    new_photos.append(p)

            if step_dirty:
                await db.orders.update_one(
                    {"id": order["id"], "steps.step_number": step["step_number"]},
                    {"$set": {"steps.$.photos": new_photos}},
                )
                order_dirty = True

        if order_dirty:
            touched_orders += 1

    return {
        "ok": True,
        "scanned_orders": total_orders,
        "touched_orders": touched_orders,
        "uploaded": uploaded,
        "skipped_already_url": skipped_urls,
        "failures": failures,
    }
