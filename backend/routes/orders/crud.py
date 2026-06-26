"""Order CRUD: create / list / get / soft-delete + recycle bin.

Every handler in this file deals with the order document as a whole
— per-step, per-file, per-customs operations live in their own modules.
"""
from __future__ import annotations

import re as _re

from ._shared import (
    APIRouter,
    BulkDeletePayload,
    Depends,
    HTTPException,
    OrderCreate,
    Query,
    build_initial_steps,
    datetime,
    db,
    ensure_translations_for_viewer,
    get_current_user,
    list_strip,
    now_china_iso,
    require_roles,
    strip_order_for_role,
    timezone,
    uuid,
)

router = APIRouter(tags=["orders"])


@router.post("/orders")
async def create_order(
    data: OrderCreate, user=Depends(require_roles("admin", "associate"))
):
    client = await db.users.find_one({"id": data.client_id, "role": "client"})
    if not client:
        raise HTTPException(status_code=400, detail="Invalid client")
    manufacturer = await db.users.find_one(
        {"id": data.manufacturer_id, "role": "manufacturer"}
    )
    if not manufacturer:
        raise HTTPException(status_code=400, detail="Invalid manufacturer")
    associate_id = (
        data.associate_id
        or client.get("associate_id")
        or (user["id"] if user["role"] == "associate" else None)
    )

    order_id = str(uuid.uuid4())
    order = {
        "id": order_id,
        "order_ref": f"SMN-{order_id[:8].upper()}",
        "client_id": data.client_id,
        "client_name": client["name"],
        "manufacturer_id": data.manufacturer_id,
        "manufacturer_name": manufacturer["name"],
        "manufacturer_alias": manufacturer.get("alias") or "Somnio.Co Atelier Workshop",
        "associate_id": associate_id,
        "jewelry_name": data.jewelry_name,
        "sku": data.sku or "",
        "description": data.description or "",
        "status": "in_progress",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_at_china": now_china_iso(),
        "steps": build_initial_steps(),
        "customs": {
            "airway_bill": None,
            "customs_document": None,
            "airway_bill_text": "",
            "airway_bill_files": [],
            "customs_files": [],
            "notes": "",
        },
    }
    await db.orders.insert_one(order)
    return strip_order_for_role(order, user)


@router.get("/orders")
async def list_orders(
    user=Depends(get_current_user),
    client_id: str | None = Query(default=None),
    manufacturer_id: str | None = Query(default=None),
    associate_id: str | None = Query(default=None),
    q: str | None = Query(default=None, description="Jewelry-type / order-name substring (case-insensitive)"),
    date_from: str | None = Query(default=None, description="ISO date (YYYY-MM-DD); inclusive lower bound on created_at"),
    date_to: str | None = Query(default=None, description="ISO date (YYYY-MM-DD); inclusive upper bound on created_at"),
):
    """Returns the calling user's visible orders. Soft-deleted commissions
    are excluded — they live exclusively in /admin/recycle-bin.

    Filters:
    * ``client_id`` / ``manufacturer_id`` / ``associate_id`` — admin can filter
      across any of these; non-admins have the matching id locked to their
      own (any conflicting filter is silently ignored).
    * ``q`` — case-insensitive substring against ``jewelry_name``.
    * ``date_from`` / ``date_to`` — inclusive date window on ``created_at``.
    """
    not_deleted = {
        "$or": [
            {"deleted_at": {"$exists": False}},
            {"deleted_at": None},
            {"deleted_at": ""},
        ]
    }
    role_filter: dict = {}
    if user["role"] == "manufacturer":
        role_filter["manufacturer_id"] = user["id"]
    elif user["role"] == "associate":
        role_filter["associate_id"] = user["id"]
    elif user["role"] == "client":
        role_filter["client_id"] = user["id"]
    elif user["role"] == "cad_renderer":
        # CAD/Render vendors only see commissions they've been explicitly
        # assigned to. Until Phase 3 introduces the assignment mechanism the
        # `cad_renderer_id` field is never set, so this guarantees a vendor
        # never sees an order they shouldn't.
        role_filter["cad_renderer_id"] = user["id"]

    extra: dict = {}
    if user["role"] == "admin":
        if client_id:
            extra["client_id"] = client_id
        if manufacturer_id:
            extra["manufacturer_id"] = manufacturer_id
        if associate_id:
            extra["associate_id"] = associate_id
    elif user["role"] == "associate":
        # An associate can narrow their own list down to a specific client /
        # workshop, but never break role-scope.
        if client_id:
            extra["client_id"] = client_id
        if manufacturer_id:
            extra["manufacturer_id"] = manufacturer_id

    if q:
        # MongoDB regex with safe escape so users can't accidentally type a
        # regex special character and break the query.
        extra["jewelry_name"] = {
            "$regex": _re.escape(q.strip()),
            "$options": "i",
        }

    if date_from or date_to:
        # ``created_at`` is an ISO-8601 string (lexicographically sortable for
        # YYYY-MM-DD…), so a plain $gte / $lte on the prefix works correctly.
        rng: dict = {}
        if date_from:
            rng["$gte"] = date_from.strip()
        if date_to:
            # Inclusive day-end: 2026-06-26 matches up to 2026-06-26T23:59:59.
            rng["$lte"] = date_to.strip() + "T23:59:59"
        extra["created_at"] = rng

    parts = [not_deleted]
    if role_filter:
        parts.append(role_filter)
    if extra:
        parts.append(extra)
    query = {"$and": parts} if len(parts) > 1 else parts[0]
    orders = (
        await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    )
    return [list_strip(o, user) for o in orders]


@router.delete("/orders/{order_id}")
async def soft_delete_order(order_id: str, user=Depends(require_roles("admin"))):
    """Admin-only soft delete. Sets `deleted_at`; the order disappears from
    the active list and lives in the Recycle Bin indefinitely. Restore or
    purge it from `/admin/recycle-bin`."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("deleted_at"):
        return {"ok": True, "already_deleted": True, "deleted_at": order["deleted_at"]}
    now_utc = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one(
        {"id": order_id},
        {
            "$set": {
                "deleted_at": now_utc,
                "deleted_at_china": now_china_iso(),
                "deleted_by": user["email"],
            }
        },
    )
    return {"ok": True, "deleted_at": now_utc}


@router.post("/orders/bulk-delete")
async def bulk_soft_delete_orders(
    body: BulkDeletePayload, user=Depends(require_roles("admin"))
):
    """Admin-only bulk soft-delete (used by the orders-list multi-select)."""
    if not body.ids:
        return {"ok": True, "deleted": 0}
    now_utc = datetime.now(timezone.utc).isoformat()
    res = await db.orders.update_many(
        {
            "id": {"$in": body.ids},
            "$or": [
                {"deleted_at": {"$exists": False}},
                {"deleted_at": None},
                {"deleted_at": ""},
            ],
        },
        {
            "$set": {
                "deleted_at": now_utc,
                "deleted_at_china": now_china_iso(),
                "deleted_by": user["email"],
            }
        },
    )
    return {"ok": True, "deleted": res.modified_count}


# ---- Recycle bin (admin only) ----
@router.get("/admin/recycle-bin")
async def admin_recycle_bin(user=Depends(require_roles("admin"))):
    """Lists soft-deleted commissions, most recent first. Restore or purge
    individually from the corresponding endpoints below."""
    cursor = db.orders.find(
        {"deleted_at": {"$nin": [None, ""]}},
        {"_id": 0},
    ).sort("deleted_at", -1)
    rows = []
    async for o in cursor:
        # Light projection — same shape as the regular orders list, with
        # additional deleted_* fields and progress.
        light = list_strip(o, user)
        light["deleted_at"] = o.get("deleted_at")
        light["deleted_at_china"] = o.get("deleted_at_china")
        light["deleted_by"] = o.get("deleted_by")
        rows.append(light)
    return rows


@router.post("/admin/recycle-bin/{order_id}/restore")
async def admin_restore_order(order_id: str, user=Depends(require_roles("admin"))):
    """Restore a soft-deleted commission back to the active list."""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.get("deleted_at"):
        return {"ok": True, "already_active": True}
    await db.orders.update_one(
        {"id": order_id},
        {
            "$unset": {
                "deleted_at": "",
                "deleted_at_china": "",
                "deleted_by": "",
            }
        },
    )
    return {"ok": True, "restored_by": user["email"]}


@router.delete("/admin/recycle-bin/{order_id}/purge")
async def admin_purge_order(order_id: str, user=Depends(require_roles("admin"))):
    """Hard-delete a soft-deleted commission from the database. Irreversible."""
    order = await db.orders.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.get("deleted_at"):
        raise HTTPException(
            status_code=400,
            detail="Order is still active — soft-delete it first before purging.",
        )
    res = await db.orders.delete_one({"id": order_id})
    return {"ok": True, "purged": res.deleted_count == 1, "purged_by": user["email"]}


@router.get("/orders/{order_id}")
async def get_order(order_id: str, user=Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] == "manufacturer" and order["manufacturer_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "associate" and order["associate_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "client" and order["client_id"] != user["id"]:
        raise HTTPException(status_code=403)
    if user["role"] == "cad_renderer" and order.get("cad_renderer_id") != user["id"]:
        raise HTTPException(status_code=403)
    # Translate every step's notes + associate review note into the viewer's
    # preferred language (cached per language on the step). Skips for English.
    await ensure_translations_for_viewer(order, user)
    return strip_order_for_role(order, user)
