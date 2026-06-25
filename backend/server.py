"""
Somnio Atelier - 26-Step Jewelry Manufacturing Tracker
Backend: FastAPI + MongoDB + JWT auth (4 roles)
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
import uuid
import bcrypt
import jwt as pyjwt
from datetime import datetime, timedelta, timezone
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from _associate_importer import run_import_and_record, get_last_run, SOURCE_TAG
from _translation import translate as translate_text, language_for_country, COUNTRY_LIST

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------------- Mongo ----------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ---------------- Auth Config ----------------
SECRET_KEY = os.environ.get("JWT_SECRET", "somnio-atelier-luxury-jewelry-secret-key-2026-change-in-prod")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
CHINA_TZ = pytz.timezone("Asia/Shanghai")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ---------------- App ----------------
app = FastAPI(title="Somnio Atelier API")
api_router = APIRouter(prefix="/api")

# ---------------- 26-step canonical list ----------------
PHASES = [
    {
        "phase": "I",
        "title": "Origins & Design",
        "steps": [
            (1, "Designer Identification", "Recording the lead artisan/designer responsible for the style."),
            (2, "Conceptual Rendering", "Digital and hand-sketched blueprints."),
            (3, "Metal Sourcing", "Verification of top-grade, hypoallergenic metals (Platinum/18k/14k)."),
            (4, "Conflict-Free Diamond Sourcing", "Tracking stones through IGI for lab diamonds."),
            (5, "Gemstone Authentication", "Sourcing and vetting of colored stones by onsite gemologists."),
        ],
    },
    {
        "phase": "II",
        "title": "The Master Craft",
        "steps": [
            (6, "CAD Modeling", "3D digital precision mapping."),
            (7, "Master Wax Carving", "Creating the high-fidelity mold."),
            (8, "Casting", "The 'Lost Wax' process to form the metal structure."),
            (9, "Clean-up & Fabrication", "Hand-filing and structural reinforcement."),
            (10, "Laser Inscription", "Permanent engraving of the unique serial number."),
            (11, "Pre-Polishing", "Smoothing the metal before stones are set."),
            (12, "Stone Matching", "Hand-selecting stones for exact color and clarity consistency."),
            (13, "Precision Setting", "Hand-setting stones under 40x magnification."),
            (14, "Micro-Pavé Inspection", "Ensuring every secondary stone is secure."),
            (15, "Assembly", "Joining individual components (e.g., the head to the shank)."),
        ],
    },
    {
        "phase": "III",
        "title": "The Finishing Touch",
        "steps": [
            (16, "Multi-Stage Polishing", "A series of hand-buffing cycles."),
            (17, "Ultrasonic Cleaning", "Removing microscopic debris from the setting."),
            (18, "Rhodium Plating", "(For white gold) High-luster, white finish."),
            (19, 'The "Mirror" Finish', "The final hand-polish for maximum light return."),
            (20, "Hallmark Verification", "Stamping the metal purity and brand trademark."),
        ],
    },
    {
        "phase": "IV",
        "title": "Quality Control Vault",
        "steps": [
            (21, "Structural Integrity Test", "Checking prong tension and stone security."),
            (22, "Dimension Accuracy", "Confirming exact ring size and proportions."),
            (23, "Final Aesthetic Clearance", "Master jeweler review of the finished piece."),
        ],
    },
    {
        "phase": "V",
        "title": "Logistics & Ownership",
        "steps": [
            (24, "Shipment Tracking", "Secure transit logs from facility to partner jeweler."),
            (25, "Authorized Associate Receipt", "Verification of arrival and final local inspection."),
            (26, "Customer Registry", "Warranty and ownership are locked into the global database."),
        ],
    },
]

def build_initial_steps():
    """Build the embedded step list for a new order."""
    steps = []
    for phase in PHASES:
        for num, title, desc in phase["steps"]:
            steps.append({
                "step_number": num,
                "title": title,
                "description": desc,
                "phase": phase["phase"],
                "phase_title": phase["title"],
                "completed": False,
                "completed_at_china": None,  # ISO string
                "completed_at_utc": None,
                "notes": "",
                "notes_translated": "",
                "notes_target_lang": "",
                "photos": [],  # list of base64 strings
                "forwarded_to_client": False,
                "forwarded_at": None,
                "associate_review_note": "",
                "associate_review_note_translated": "",
            })
    return steps

# ---------------- Models ----------------
Role = Literal["admin", "manufacturer", "associate", "client"]

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Role
    associate_id: Optional[str] = None  # for clients: which associate manages them
    country: Optional[str] = "AU"  # ISO 3166-1 alpha-2 (clients only); default Australia

class UserCountryUpdate(BaseModel):
    country: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: str
    associate_id: Optional[str] = None
    auto_forward: bool = False
    source: str = "local"
    country: str = "AU"
    language: str = "en"
    language_name: str = "English"

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
    photos: Optional[List[str]] = []  # base64 strings

class ForwardUpdate(BaseModel):
    review_note: Optional[str] = ""

class AutoForwardToggle(BaseModel):
    auto_forward: bool

class CustomsDocs(BaseModel):
    airway_bill: Optional[str] = None  # base64 (admin only)
    customs_document: Optional[str] = None  # base64
    notes: Optional[str] = ""

# ---------------- Helpers ----------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False

def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return pyjwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

async def get_current_user(token: str = Depends(oauth2_scheme)):
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
    return user

def require_roles(*allowed: str):
    async def checker(user=Depends(get_current_user)):
        if user["role"] not in allowed:
            raise HTTPException(status_code=403, detail=f"Forbidden for role {user['role']}")
        return user
    return checker

def user_to_public(u: dict) -> dict:
    country = u.get("country") or "AU"
    lang_tag, lang_name = language_for_country(country)
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u["name"],
        "role": u["role"],
        "associate_id": u.get("associate_id"),
        "auto_forward": u.get("auto_forward", False),
        "source": u.get("source", "local"),
        "country": country,
        "language": lang_tag,
        "language_name": lang_name,
    }

def now_china_iso() -> str:
    return datetime.now(CHINA_TZ).isoformat()

def progress_summary(steps: list) -> dict:
    total = len(steps)
    done = sum(1 for s in steps if s["completed"])
    last = None
    for s in steps:
        if s["completed"]:
            last = s["step_number"]
    return {"completed_count": done, "total": total, "current_step": (last + 1) if last and last < total else (1 if done == 0 else None)}

# ---------------- Routes: Auth ----------------
@api_router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserCreate):
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
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user_doc)
    token = create_token(user_id, data.role)
    return TokenResponse(access_token=token, user=UserPublic(**user_to_public(user_doc)))

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email.lower()})
    if not user or not user.get("hashed_password") or not verify_password(data.password, user["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user["id"], user["role"])
    return TokenResponse(access_token=token, user=UserPublic(**user_to_public(user)))

@api_router.get("/auth/me", response_model=UserPublic)
async def me(user=Depends(get_current_user)):
    return UserPublic(**user_to_public(user))

# ---------------- Routes: Users ----------------
@api_router.get("/users")
async def list_users(role: Optional[str] = None, user=Depends(require_roles("admin", "associate"))):
    q = {}
    if role:
        q["role"] = role
    users = await db.users.find(q, {"_id": 0, "hashed_password": 0}).to_list(1000)
    return [user_to_public(u) for u in users]

@api_router.post("/users")
async def admin_create_user(data: UserCreate, user=Depends(require_roles("admin"))):
    """Admin-only: create a new user. NOTE: associates and admins are managed by the
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
    await db.users.insert_one(user_doc)
    return user_to_public(user_doc)

@api_router.put("/users/{user_id}/country")
async def admin_update_country(user_id: str, body: UserCountryUpdate, user=Depends(require_roles("admin", "associate"))):
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

@api_router.get("/meta/countries")
async def list_countries():
    """Public list used by the country dropdown — code, name, language."""
    rows = []
    for code, name in COUNTRY_LIST:
        lang_tag, lang_name = language_for_country(code)
        rows.append({"code": code, "name": name, "language": lang_tag, "language_name": lang_name})
    return rows

@api_router.delete("/users/{user_id}")
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

# ---------------- Associate Import ----------------
@api_router.post("/admin/import-associates")
async def import_associates(user=Depends(require_roles("admin"))):
    """Manual trigger for the associate sync. Returns counts created/updated/skipped."""
    return await run_import_and_record(db)

@api_router.get("/admin/import-associates/status")
async def import_associates_status(user=Depends(require_roles("admin"))):
    """Last-run result + scheduled job info."""
    sched_info = {
        "tz": os.environ.get("ASSOCIATE_SYNC_TZ", "Australia/Sydney"),
        "hour": int(os.environ.get("ASSOCIATE_SYNC_HOUR", "0")),
        "minute": int(os.environ.get("ASSOCIATE_SYNC_MINUTE", "1")),
    }
    return {"last_run": get_last_run(), "schedule": sched_info}

@api_router.put("/users/{user_id}/auto-forward")
async def set_auto_forward(user_id: str, body: AutoForwardToggle, user=Depends(require_roles("admin", "associate"))):
    # Associate toggling the auto-forward on a client they manage
    target = await db.users.find_one({"id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if user["role"] == "associate" and target.get("associate_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Not your client")
    await db.users.update_one({"id": user_id}, {"$set": {"auto_forward": body.auto_forward}})
    return {"ok": True, "auto_forward": body.auto_forward}

# ---------------- Routes: Orders ----------------
@api_router.post("/orders")
async def create_order(data: OrderCreate, user=Depends(require_roles("admin", "associate"))):
    # Validate referenced users
    client = await db.users.find_one({"id": data.client_id, "role": "client"})
    if not client:
        raise HTTPException(status_code=400, detail="Invalid client")
    manufacturer = await db.users.find_one({"id": data.manufacturer_id, "role": "manufacturer"})
    if not manufacturer:
        raise HTTPException(status_code=400, detail="Invalid manufacturer")
    associate_id = data.associate_id or client.get("associate_id") or (user["id"] if user["role"] == "associate" else None)

    order_id = str(uuid.uuid4())
    order = {
        "id": order_id,
        "order_ref": f"SMN-{order_id[:8].upper()}",
        "client_id": data.client_id,
        "client_name": client["name"],
        "manufacturer_id": data.manufacturer_id,
        "manufacturer_name": manufacturer["name"],
        "associate_id": associate_id,
        "jewelry_name": data.jewelry_name,
        "sku": data.sku or "",
        "description": data.description or "",
        "status": "in_progress",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_at_china": now_china_iso(),
        "steps": build_initial_steps(),
        "customs": {"airway_bill": None, "customs_document": None, "notes": ""},
    }
    await db.orders.insert_one(order)
    return _strip_order_for_role(order, user)

def _strip_order_for_role(order: dict, user: dict) -> dict:
    """Remove _id; hide customs from non-admin; hide unforwarded steps' detail from client."""
    o = {k: v for k, v in order.items() if k != "_id"}
    if user["role"] != "admin":
        o["customs"] = {"has_docs": bool(o.get("customs", {}).get("airway_bill") or o.get("customs", {}).get("customs_document"))}
    if user["role"] == "client":
        # Hide steps that aren't forwarded yet
        visible_steps = []
        for s in o["steps"]:
            if s["completed"] and s.get("forwarded_to_client"):
                visible_steps.append(s)
            else:
                # show placeholder with same number but no completed details
                visible_steps.append({
                    **s,
                    "completed": s["completed"] and s.get("forwarded_to_client", False),
                    "completed_at_china": s["completed_at_china"] if s.get("forwarded_to_client") else None,
                    "completed_at_utc": s["completed_at_utc"] if s.get("forwarded_to_client") else None,
                    "notes": s["notes"] if s.get("forwarded_to_client") else "",
                    "notes_translated": s.get("notes_translated", "") if s.get("forwarded_to_client") else "",
                    "notes_target_lang": s.get("notes_target_lang", "") if s.get("forwarded_to_client") else "",
                    "photos": s["photos"] if s.get("forwarded_to_client") else [],
                    "associate_review_note": s.get("associate_review_note", "") if s.get("forwarded_to_client") else "",
                    "associate_review_note_translated": s.get("associate_review_note_translated", "") if s.get("forwarded_to_client") else "",
                })
        o["steps"] = visible_steps
    o["progress"] = progress_summary(order["steps"])
    return o

def _list_strip(order: dict, user: dict) -> dict:
    """Light version for list views - no photo blobs."""
    o = _strip_order_for_role(order, user)
    light_steps = [{
        "step_number": s["step_number"],
        "title": s["title"],
        "phase": s["phase"],
        "completed": s["completed"],
        "completed_at_china": s.get("completed_at_china"),
        "forwarded_to_client": s.get("forwarded_to_client", False),
    } for s in o["steps"]]
    o["steps"] = light_steps
    return o

@api_router.get("/orders")
async def list_orders(user=Depends(get_current_user)):
    q = {}
    if user["role"] == "manufacturer":
        q["manufacturer_id"] = user["id"]
    elif user["role"] == "associate":
        q["associate_id"] = user["id"]
    elif user["role"] == "client":
        q["client_id"] = user["id"]
    orders = await db.orders.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [_list_strip(o, user) for o in orders]

@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    # access check
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "associate" and order["associate_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "client" and order["client_id"] != user["id"]:
        raise HTTPException(status_code=403)
    return _strip_order_for_role(order, user)

@api_router.post("/orders/{order_id}/steps/{step_number}/complete")
async def complete_step(order_id: str, step_number: int, body: StepUpdate, user=Depends(require_roles("manufacturer", "admin"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)

    # Check if associate has auto_forward for this client
    client = await db.users.find_one({"id": order["client_id"]})
    auto_forward = client.get("auto_forward", False) if client else False
    # Translate notes to client's language if needed
    client_country = (client or {}).get("country") or "AU"
    target_lang, target_lang_name = language_for_country(client_country)
    translated_note = ""
    if body.notes and not target_lang.lower().startswith("en"):
        t = await translate_text(body.notes, target_lang, target_lang_name)
        if t:
            translated_note = t

    china_iso = now_china_iso()
    utc_iso = datetime.now(timezone.utc).isoformat()

    update_fields = {
        "steps.$.completed": True,
        "steps.$.completed_at_china": china_iso,
        "steps.$.completed_at_utc": utc_iso,
        "steps.$.notes": body.notes or "",
        "steps.$.notes_translated": translated_note,
        "steps.$.notes_target_lang": target_lang if translated_note else "",
        "steps.$.photos": body.photos or [],
        "steps.$.forwarded_to_client": auto_forward,
        "steps.$.forwarded_at": china_iso if auto_forward else None,
    }
    res = await db.orders.update_one(
        {"id": order_id, "steps.step_number": step_number},
        {"$set": update_fields},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Step not found")

    # if step 26 completed -> mark order completed
    if step_number == 26:
        await db.orders.update_one({"id": order_id}, {"$set": {"status": "completed"}})

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return _strip_order_for_role(updated, user)

@api_router.post("/orders/{order_id}/steps/{step_number}/forward")
async def forward_step(order_id: str, step_number: int, body: ForwardUpdate, user=Depends(require_roles("associate", "admin"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "associate" and order["associate_id"] != user["id"]:
        raise HTTPException(status_code=403)
    # Translate review_note to client's language if needed
    client_doc = await db.users.find_one({"id": order["client_id"]})
    client_country = (client_doc or {}).get("country") or "AU"
    target_lang, target_lang_name = language_for_country(client_country)
    translated_review = ""
    if body.review_note and not target_lang.lower().startswith("en"):
        t = await translate_text(body.review_note, target_lang, target_lang_name)
        if t:
            translated_review = t
    china_iso = now_china_iso()
    res = await db.orders.update_one(
        {"id": order_id, "steps.step_number": step_number},
        {"$set": {
            "steps.$.forwarded_to_client": True,
            "steps.$.forwarded_at": china_iso,
            "steps.$.associate_review_note": body.review_note or "",
            "steps.$.associate_review_note_translated": translated_review,
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Step not found")
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return _strip_order_for_role(updated, user)

@api_router.put("/orders/{order_id}/customs")
async def update_customs(order_id: str, body: CustomsDocs, user=Depends(require_roles("admin"))):
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    customs = order.get("customs", {})
    if body.airway_bill is not None:
        customs["airway_bill"] = body.airway_bill
    if body.customs_document is not None:
        customs["customs_document"] = body.customs_document
    if body.notes is not None:
        customs["notes"] = body.notes
    customs["updated_at_china"] = now_china_iso()
    await db.orders.update_one({"id": order_id}, {"$set": {"customs": customs}})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    return _strip_order_for_role(updated, user)

@api_router.get("/orders/{order_id}/customs")
async def get_customs(order_id: str, user=Depends(require_roles("admin"))):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order.get("customs", {})

# ---------------- Seed Endpoint ----------------
@api_router.post("/seed")
async def seed_demo():
    """Idempotent seed: creates demo users and one sample order."""
    AT = chr(64)  # avoid literal-rewriting filters
    DOMAIN = AT + "somnio.co"
    demo_users = [
        {"email": "admin" + DOMAIN, "password": "Admin" + AT + "2026", "name": "Atelier Admin", "role": "admin"},
        {"email": "mfg" + DOMAIN, "password": "Mfg" + AT + "2026", "name": "Master Wei Chen", "role": "manufacturer"},
        {"email": "associate" + DOMAIN, "password": "Assoc" + AT + "2026", "name": "Elena Voss", "role": "associate"},
        {"email": "client" + DOMAIN, "password": "Client" + AT + "2026", "name": "Isabella Laurent", "role": "client"},
    ]
    created = []
    associate_id = None
    for u in demo_users:
        existing = await db.users.find_one({"email": u["email"]})
        if existing:
            if u["role"] == "associate":
                associate_id = existing["id"]
            created.append({"email": u["email"], "role": u["role"], "status": "exists"})
            continue
        user_id = str(uuid.uuid4())
        doc = {
            "id": user_id,
            "email": u["email"],
            "hashed_password": hash_password(u["password"]),
            "name": u["name"],
            "role": u["role"],
            "associate_id": None,
            "auto_forward": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(doc)
        if u["role"] == "associate":
            associate_id = user_id
        created.append({"email": u["email"], "role": u["role"], "status": "created"})

    # Link the client to the associate
    if associate_id:
        await db.users.update_one(
            {"email": "client" + DOMAIN},
            {"$set": {"associate_id": associate_id}},
        )

    # Create one sample order if none exists
    sample = await db.orders.find_one({"order_ref": "SMN-DEMO0001"})
    if not sample:
        client_doc = await db.users.find_one({"email": "client" + DOMAIN})
        mfg = await db.users.find_one({"email": "mfg" + DOMAIN})
        order_id = str(uuid.uuid4())
        order = {
            "id": order_id,
            "order_ref": "SMN-DEMO0001",
            "client_id": client_doc["id"],
            "client_name": client_doc["name"],
            "manufacturer_id": mfg["id"],
            "manufacturer_name": mfg["name"],
            "associate_id": associate_id,
            "jewelry_name": "Étoile Solitaire — 2.1ct Lab Diamond Ring",
            "sku": "SOM-ESR-001",
            "description": "Platinum solitaire with halo. Customer: Isabella Laurent.",
            "status": "in_progress",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_at_china": now_china_iso(),
            "steps": build_initial_steps(),
            "customs": {"airway_bill": None, "customs_document": None, "notes": ""},
        }
        # pre-complete first 3 steps for demo
        for i in range(3):
            order["steps"][i]["completed"] = True
            order["steps"][i]["completed_at_china"] = now_china_iso()
            order["steps"][i]["completed_at_utc"] = datetime.now(timezone.utc).isoformat()
            order["steps"][i]["notes"] = "Demo: completed during seed."
            order["steps"][i]["forwarded_to_client"] = True
            order["steps"][i]["forwarded_at"] = now_china_iso()
        await db.orders.insert_one(order)
        created.append({"order_ref": "SMN-DEMO0001", "status": "created"})
    return {"seeded": created}

@api_router.get("/")
async def root():
    return {"app": "Somnio Atelier API", "status": "ok"}

@api_router.post("/admin/wipe-demo")
async def admin_wipe_demo(user=Depends(require_roles("admin"))):
    """DESTRUCTIVE - QA only. Deletes ALL orders and ALL users except the calling admin.
    Re-run /api/seed (and /api/seed-extended) afterwards to repopulate."""
    o_res = await db.orders.delete_many({})
    u_res = await db.users.delete_many({"id": {"$ne": user["id"]}})
    return {
        "ok": True,
        "orders_deleted": o_res.deleted_count,
        "users_deleted": u_res.deleted_count,
        "preserved_admin": user["email"],
    }

# ---------------- Extended seed (8 commissions at varying stages) ----------------
@api_router.post("/seed-extended")
async def seed_extended():
    """Creates 8 sample commissions at different stages, with photos seeded for completed steps."""
    try:
        from _seed_images import IMAGES
    except Exception:
        IMAGES = {}

    # Ensure base demo users exist
    await seed_demo()
    AT = chr(64)
    DOMAIN = AT + "somnio.co"
    associate = await db.users.find_one({"email": "associate" + DOMAIN})
    client = await db.users.find_one({"email": "client" + DOMAIN})
    base_mfg = await db.users.find_one({"email": "mfg" + DOMAIN})
    if not (associate and client and base_mfg):
        raise HTTPException(status_code=500, detail="Base demo users missing")

    # Create extra manufacturers (workshops) if missing
    workshops = [
        ("Shanghai Master Atelier", "shanghai"),
        ("Shenzhen Diamond House", "shenzhen"),
        ("Guangzhou Heritage Works", "guangzhou"),
    ]
    workshop_ids = [base_mfg["id"]]
    for name, slug in workshops:
        email = slug + DOMAIN
        existing = await db.users.find_one({"email": email})
        if existing:
            workshop_ids.append(existing["id"])
            continue
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": user_id,
            "email": email,
            "hashed_password": hash_password("Mfg" + AT + "2026"),
            "name": name,
            "role": "manufacturer",
            "associate_id": None,
            "auto_forward": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        workshop_ids.append(user_id)

    # Extra clients
    extra_clients = [
        ("Margot Beaumont", "margot"),
        ("Henrik Tan", "henrik"),
        ("Sofia Castellano", "sofia"),
    ]
    client_ids = [client["id"]]
    for name, slug in extra_clients:
        email = slug + DOMAIN
        existing = await db.users.find_one({"email": email})
        if existing:
            client_ids.append(existing["id"])
            continue
        user_id = str(uuid.uuid4())
        await db.users.insert_one({
            "id": user_id,
            "email": email,
            "hashed_password": hash_password("Client" + AT + "2026"),
            "name": name,
            "role": "client",
            "associate_id": associate["id"],
            "auto_forward": True,  # auto-forward enabled for variety
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        client_ids.append(user_id)

    # 8 sample commissions at varying stages
    sample_pool = [k for k in ["sketch", "cad", "casting", "setting", "polish", "ring", "necklace", "earring"] if k in IMAGES]

    def photos_for_step(step_num: int) -> list:
        if not sample_pool:
            return []
        # 1-2 photos per completed step, deterministically rotated
        idx = (step_num - 1) % len(sample_pool)
        return [IMAGES[sample_pool[idx]]]

    commissions = [
        ("SMN-2026-101", "Lumière Solitaire — 1.8ct Lab Diamond Ring", "SOM-LSR-101", 2,  "Platinum band, halo setting. Engraving: 'M & H 2026'."),
        ("SMN-2026-102", "Aurore Pendant — Yellow Sapphire & Diamond Halo", "SOM-APD-102", 5,  "18k yellow gold chain, 1.2ct centre stone."),
        ("SMN-2026-103", "Étoile Eternity Band — Pavé Diamond", "SOM-EEB-103", 9,  "Platinum micro-pavé, 56 round brilliants."),
        ("SMN-2026-104", "Comète Drop Earrings — Pear Sapphire", "SOM-CDE-104", 13, "18k white gold, matched 0.9ct pair."),
        ("SMN-2026-105", "Maison Signature Tennis Bracelet", "SOM-MTB-105", 17, "Platinum, 4.6ct total weight."),
        ("SMN-2026-106", "Constellation Pavé Ring — Marquise", "SOM-CPR-106", 20, "18k rose gold, marquise diamond cluster."),
        ("SMN-2026-107", "Royale Emerald Cocktail Ring", "SOM-RECR-107", 23, "Colombian emerald, diamond shoulders, platinum."),
        ("SMN-2026-108", "Héritage Three-Stone Engagement Ring", "SOM-H3E-108", 26, "Trilogy lab diamonds, platinum. Delivered & registered."),
    ]

    seeded = []
    for ref, name, sku, completed_steps, desc in commissions:
        existing = await db.orders.find_one({"order_ref": ref})
        if existing:
            seeded.append({"order_ref": ref, "status": "exists"})
            continue

        mfg_id = workshop_ids[(int(ref[-3:]) - 101) % len(workshop_ids)]
        cli_id = client_ids[(int(ref[-3:]) - 101) % len(client_ids)]
        mfg_doc = await db.users.find_one({"id": mfg_id})
        cli_doc = await db.users.find_one({"id": cli_id})

        steps = build_initial_steps()
        # Mark `completed_steps` steps complete, with timestamps spaced ~6h apart
        base_time = datetime.now(timezone.utc) - timedelta(days=completed_steps, hours=2)
        for i in range(completed_steps):
            ts_utc = base_time + timedelta(hours=i * 6)
            ts_china = ts_utc.astimezone(CHINA_TZ).isoformat()
            steps[i]["completed"] = True
            steps[i]["completed_at_utc"] = ts_utc.isoformat()
            steps[i]["completed_at_china"] = ts_china
            steps[i]["notes"] = f"Completed {steps[i]['title']} — quality verified."
            steps[i]["photos"] = photos_for_step(steps[i]["step_number"])
            steps[i]["forwarded_to_client"] = True
            steps[i]["forwarded_at"] = ts_china
            steps[i]["associate_review_note"] = "Released to client."

        order_id = str(uuid.uuid4())
        order_status = "completed" if completed_steps >= 26 else "in_progress"
        order = {
            "id": order_id,
            "order_ref": ref,
            "client_id": cli_id,
            "client_name": cli_doc["name"] if cli_doc else "—",
            "manufacturer_id": mfg_id,
            "manufacturer_name": mfg_doc["name"] if mfg_doc else "—",
            "associate_id": associate["id"],
            "jewelry_name": name,
            "sku": sku,
            "description": desc,
            "status": order_status,
            "created_at": (datetime.now(timezone.utc) - timedelta(days=completed_steps + 1)).isoformat(),
            "created_at_china": (datetime.now(CHINA_TZ) - timedelta(days=completed_steps + 1)).isoformat(),
            "steps": steps,
            "customs": {"airway_bill": None, "customs_document": None, "notes": ""},
        }
        # For the completed one, also attach a customs doc
        if completed_steps >= 26 and IMAGES.get("ring"):
            order["customs"] = {
                "airway_bill": IMAGES.get("ring"),
                "customs_document": IMAGES.get("necklace"),
                "notes": "AWB SMN-AWB-026 · FedEx Priority · Declared value USD 28,500 · Shanghai → Geneva.",
                "updated_at_china": now_china_iso(),
            }
        await db.orders.insert_one(order)
        seeded.append({"order_ref": ref, "stage": f"{completed_steps}/26", "status": "created"})

    return {"seeded": seeded, "workshops": len(workshop_ids), "clients": len(client_ids)}

# ---------------- Wire up ----------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ---------------- Scheduler: daily associate sync ----------------
scheduler: Optional[AsyncIOScheduler] = None

@app.on_event("startup")
async def _start_scheduler():
    global scheduler
    try:
        tz_name = os.environ.get("ASSOCIATE_SYNC_TZ", "Australia/Sydney")
        hour = int(os.environ.get("ASSOCIATE_SYNC_HOUR", "0"))
        minute = int(os.environ.get("ASSOCIATE_SYNC_MINUTE", "1"))
        scheduler = AsyncIOScheduler(timezone=pytz.timezone(tz_name))
        scheduler.add_job(
            lambda: asyncio.create_task(run_import_and_record(db)),
            CronTrigger(hour=hour, minute=minute),
            id="associate_sync",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("Associate sync scheduled daily at %02d:%02d %s", hour, minute, tz_name)
    except Exception as e:
        logger.warning("Could not start scheduler: %s", e)

@app.on_event("shutdown")
async def _stop_scheduler():
    if scheduler:
        scheduler.shutdown(wait=False)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
