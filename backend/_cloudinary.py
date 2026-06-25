"""
Cloudinary integration for Somnio.Co Atelier step photos.

Why: step photos used to live as base64 strings inside MongoDB step documents,
which bloats documents and replication. We now store an HTTPS `secure_url` on
each step (`photos: [str]`) and let Cloudinary handle storage + delivery + CDN
+ on-the-fly transforms.

This module exposes:

- :func:`configure_cloudinary` — idempotent SDK config from env vars.
- :func:`upload_base64_to_cloudinary` — server-side helper used by the
  migration endpoint to lift legacy base64 images into Cloudinary.
- :func:`generate_signed_upload_payload` — produces a one-shot signature for
  direct-from-client uploads (preferred for new photos so bytes never round-
  trip through our API).
"""
from __future__ import annotations
import logging
import os
import time
from typing import Optional

import cloudinary
from cloudinary import uploader
from cloudinary.utils import api_sign_request
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME", "")
API_KEY = os.getenv("CLOUDINARY_API_KEY", "")
API_SECRET = os.getenv("CLOUDINARY_API_SECRET", "")
DEFAULT_FOLDER = os.getenv("CLOUDINARY_UPLOAD_FOLDER", "somnio/steps")

_configured = False


def configure_cloudinary() -> None:
    """Configure the Cloudinary SDK once per process. Safe to call multiple times."""
    global _configured
    if _configured:
        return
    if not (CLOUD_NAME and API_KEY and API_SECRET):
        logger.warning(
            "Cloudinary env vars missing; uploads will fail until CLOUDINARY_CLOUD_NAME,"
            " CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are set."
        )
    cloudinary.config(
        cloud_name=CLOUD_NAME,
        api_key=API_KEY,
        api_secret=API_SECRET,
        secure=True,
    )
    _configured = True


def is_cloudinary_url(value: str) -> bool:
    """Lightweight check used by the migration job + PDF/UI layers."""
    if not isinstance(value, str):
        return False
    return value.startswith("https://res.cloudinary.com/") or value.startswith(
        "http://res.cloudinary.com/"
    )


def upload_base64_to_cloudinary(
    base64_data: str,
    *,
    folder: Optional[str] = None,
    public_id: Optional[str] = None,
    max_width: int = 1600,
) -> str:
    """Uploads a base64 (or data URI) string to Cloudinary and returns the
    secure HTTPS URL. Applies a max-width transform + auto format/quality."""
    configure_cloudinary()
    if not base64_data:
        raise ValueError("base64_data is empty")

    # Normalise to a Data URI if the prefix is missing.
    if base64_data.startswith("data:"):
        data_uri = base64_data
    else:
        data_uri = "data:image/jpeg;base64," + base64_data

    res = uploader.upload(
        data_uri,
        resource_type="image",
        folder=folder or DEFAULT_FOLDER,
        public_id=public_id,
        overwrite=False,
        unique_filename=True,
        use_filename=False,
        transformation=[
            {
                "width": max_width,
                "crop": "limit",
                "quality": "auto",
                "fetch_format": "auto",
            }
        ],
    )
    url = res.get("secure_url")
    if not url:
        raise RuntimeError("Cloudinary upload did not return a secure_url")
    return url


def generate_signed_upload_payload(
    *,
    folder: Optional[str] = None,
    public_id: Optional[str] = None,
    tags: Optional[str] = None,
) -> dict:
    """Returns the payload a mobile/web client needs to perform a direct
    signed upload to Cloudinary's REST endpoint."""
    configure_cloudinary()
    if not API_SECRET:
        raise RuntimeError("CLOUDINARY_API_SECRET is not configured")

    timestamp = int(time.time())
    folder_value = folder or DEFAULT_FOLDER
    params_to_sign: dict[str, object] = {
        "timestamp": timestamp,
        "folder": folder_value,
    }
    if public_id:
        params_to_sign["public_id"] = public_id
    if tags:
        params_to_sign["tags"] = tags

    signature = api_sign_request(params_to_sign, API_SECRET)
    return {
        "signature": signature,
        "api_key": API_KEY,
        "cloud_name": CLOUD_NAME,
        "timestamp": timestamp,
        "folder": folder_value,
        "public_id": public_id,
        "tags": tags,
        "upload_url": f"https://api.cloudinary.com/v1_1/{CLOUD_NAME}/image/upload",
    }
