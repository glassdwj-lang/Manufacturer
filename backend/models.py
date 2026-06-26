"""Pydantic models used across routes."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr

Role = Literal["admin", "manufacturer", "associate", "client", "cad_renderer"]


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Role
    associate_id: Optional[str] = None  # for clients: which associate manages them
    country: Optional[str] = "AU"  # ISO 3166-1 alpha-2 (clients only)
    # Extended profile fields (manufacturer + client). All optional so the
    # existing minimal-create flow still works.
    phone_dial_code: Optional[str] = None  # e.g. "+61"
    phone_number: Optional[str] = None
    birthday: Optional[str] = None  # YYYY-MM-DD
    city: Optional[str] = None
    state: Optional[str] = None  # state / territory / region
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None


class UserCountryUpdate(BaseModel):
    country: str


class UserProfileUpdate(BaseModel):
    """Optional patch for any subset of the extended profile fields.
    All ``None`` values are treated as "no change" (not "clear the field")."""
    name: Optional[str] = None
    associate_id: Optional[str] = None
    country: Optional[str] = None
    phone_dial_code: Optional[str] = None
    phone_number: Optional[str] = None
    birthday: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None


class UserAliasUpdate(BaseModel):
    alias: str


class UserPasswordUpdate(BaseModel):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    alias: str = ""  # for manufacturers: 'Somnio.Co Atelier N' shown to clients/associates
    role: str
    associate_id: Optional[str] = None
    auto_forward: bool = False
    source: str = "local"
    country: str = "AU"
    language: str = "en"
    language_name: str = "English"
    preferred_language: Optional[str] = None  # manual override; one of en/zh/fr/it


class LanguagePreference(BaseModel):
    language: Optional[str] = None  # one of en/zh/fr/it. Pass null/empty to clear.


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class OrderCreate(BaseModel):
    client_id: str
    manufacturer_id: str
    associate_id: Optional[str] = None
    jewelry_name: str
    sku: Optional[str] = ""
    description: Optional[str] = ""


class StepUpdate(BaseModel):
    notes: Optional[str] = ""
    photos: Optional[List[str]] = []  # Live (approved) photos / Cloudinary URLs
    pending_photos: Optional[List[str]] = None  # Awaiting approval queue


class PhotoApprovalAction(BaseModel):
    order_id: str
    step_number: int
    photo_url: str


class SettingsPatch(BaseModel):
    associate_approval_enabled: Optional[bool] = None


class ForwardUpdate(BaseModel):
    review_note: Optional[str] = ""


class AutoForwardToggle(BaseModel):
    auto_forward: bool


class CustomsDocs(BaseModel):
    # Legacy single-base64 fields (kept for backward compatibility — the new
    # multi-file flow lives in ``airway_bill_files`` / ``customs_files``).
    airway_bill: Optional[str] = None  # base64 (admin only) — legacy
    customs_document: Optional[str] = None  # base64 — legacy
    # New: optional free-text airway-bill (tracking number, shipper notes,
    # etc.) that can sit alongside the uploaded files.
    airway_bill_text: Optional[str] = None
    notes: Optional[str] = ""


class CustomsFilePayload(BaseModel):
    """Payload used after a direct-to-Cloudinary upload completes. The
    same shape is reused for both Airway Bill and Customs Document file
    arrays — the ``kind`` is supplied via the URL path."""

    name: str
    secure_url: str
    public_id: Optional[str] = None
    format: Optional[str] = None
    bytes: Optional[int] = None
    resource_type: Optional[str] = None


class BulkDeletePayload(BaseModel):
    ids: List[str]


# ---- Manufacturer contact roster --------------------------------------------
# Every manufacturer keeps a roster of up to 3 contact people; any one of
# them can be designated the primary contact.
class ManufacturerContact(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    company_title: Optional[str] = None
    country: Optional[str] = None  # optional per-contact override (defaults to manufacturer's country)
    mobile_number: Optional[str] = None
    whatsapp_number: Optional[str] = None
    wechat_id: Optional[str] = None
    other_label: Optional[str] = None
    other_value: Optional[str] = None
    email: Optional[str] = None


class ManufacturerContactsUpdate(BaseModel):
    contacts: List[ManufacturerContact] = []
    primary_contact_id: Optional[str] = None
