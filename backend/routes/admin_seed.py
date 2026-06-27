"""Admin seed endpoints: idempotent demo + extended 8-commission seed.
Extracted from the monolithic routes/admin.py."""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from _associate_importer import get_last_run, run_import_and_record
from _translation import COUNTRY_LIST, language_for_country, translate as translate_text
from deps import CHINA_TZ, db, require_roles
from helpers import _next_manufacturer_alias, hash_password, now_china_iso, sanitize_manufacturer_contacts
from phases import build_initial_steps
from pydantic import BaseModel

router = APIRouter(tags=["admin-seed"])

# ---- Seed (idempotent demo users + 1 sample order) ----
@router.post("/seed")
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
            # The associate seed can have its hashed_password wiped by the
            # gem-gallery importer in earlier runs. Restore it (and clear the
            # source tag) so the QUICK ACCESS · DEMO row keeps working.
            if u["role"] == "associate":
                await db.users.update_one(
                    {"email": u["email"]},
                    {
                        "$set": {
                            "hashed_password": hash_password(u["password"]),
                            "name": u["name"],
                            "role": "associate",
                            "source": "local-seed",
                            "disabled": False,
                            "status": "active",
                        }
                    },
                )
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

    if associate_id:
        await db.users.update_one(
            {"email": "client" + DOMAIN},
            {"$set": {"associate_id": associate_id}},
        )

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


# ---- Extended seed (8 commissions at varying stages) ----
@router.post("/seed-extended")
async def seed_extended():
    """Creates 8 sample commissions at different stages, with photos for completed steps."""
    try:
        from _seed_images import IMAGES
    except Exception:
        IMAGES = {}

    await seed_demo()
    AT = chr(64)
    DOMAIN = AT + "somnio.co"
    associate = await db.users.find_one({"email": "associate" + DOMAIN})
    client = await db.users.find_one({"email": "client" + DOMAIN})
    base_mfg = await db.users.find_one({"email": "mfg" + DOMAIN})
    if not (associate and client and base_mfg):
        raise HTTPException(status_code=500, detail="Base demo users missing")

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
        await db.users.insert_one(
            {
                "id": user_id,
                "email": email,
                "hashed_password": hash_password("Mfg" + AT + "2026"),
                "name": name,
                "role": "manufacturer",
                "associate_id": None,
                "auto_forward": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        workshop_ids.append(user_id)

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
        await db.users.insert_one(
            {
                "id": user_id,
                "email": email,
                "hashed_password": hash_password("Client" + AT + "2026"),
                "name": name,
                "role": "client",
                "associate_id": associate["id"],
                "auto_forward": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        client_ids.append(user_id)

    sample_pool = [
        k
        for k in ["sketch", "cad", "casting", "setting", "polish", "ring", "necklace", "earring"]
        if k in IMAGES
    ]

    def photos_for_step(step_num: int) -> list:
        if not sample_pool:
            return []
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
        base_time = datetime.now(timezone.utc) - timedelta(days=completed_steps, hours=2)
        for i in range(completed_steps):
            ts_utc = base_time + timedelta(hours=i * 6)
            ts_china = ts_utc.astimezone(CHINA_TZ).isoformat()
            steps[i]["completed"] = True
            steps[i]["completed_at_utc"] = ts_utc.isoformat()
            steps[i]["completed_at_china"] = ts_china
            steps[i]["notes"] = f"Completed {steps[i]['title']} \u2014 quality verified."
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
            "client_name": cli_doc["name"] if cli_doc else "\u2014",
            "manufacturer_id": mfg_id,
            "manufacturer_name": mfg_doc["name"] if mfg_doc else "\u2014",
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
        if completed_steps >= 26 and IMAGES.get("ring"):
            order["customs"] = {
                "airway_bill": IMAGES.get("ring"),
                "customs_document": IMAGES.get("necklace"),
                "notes": "AWB SMN-AWB-026 \u00b7 FedEx Priority \u00b7 Declared value USD 28,500 \u00b7 Shanghai \u2192 Geneva.",
                "updated_at_china": now_china_iso(),
            }
        await db.orders.insert_one(order)
        seeded.append({"order_ref": ref, "stage": f"{completed_steps}/26", "status": "created"})

    return {
        "seeded": seeded,
        "workshops": len(workshop_ids),
        "clients": len(client_ids),
    }


