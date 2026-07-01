"""Client-side render approval flow for the Conceptual Rendering step.

Two-gate workflow on step 02:

* **Gate 1 — render approval**: client either *Accepts* the
  admin-released renders, or marks *Revision required* with an open
  text message that we forward via Resend to the assigned associate
  (admin BCC).
* **Gate 2 — final design lock** (only triggered after Gate 1 was
  accepted): a "Are you 100% happy to proceed?" confirmation. *Yes*
  flips the order to ``in production`` and auto-completes step 02,
  forwards step 02 to the client, notifies manufacturer + admin, and
  emails the client a Design Authorisation Certificate PDF (built via
  the existing ``build_digital_dna_pdf`` machinery). *No* notifies the
  associate + admin urgently to contact the client.

Admins also expose a *release for client review* toggle on each render
so the client UI only ever sees the renders curated for them.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from ._shared import (
    APIRouter,
    BaseModel,
    Depends,
    HTTPException,
    Request,
    db,
    get_current_user,
    record_event,
    require_roles,
    now_china_iso,
)

router = APIRouter()


# ----------------------------------------------------------------------
# Schemas
# ----------------------------------------------------------------------
class ReleaseTogglePayload(BaseModel):
    released: bool


class Gate1Payload(BaseModel):
    """Client first-gate decision.

    ``status`` is "accepted" (advance to Gate 2) or "revision_requested"
    (send the message to the associate). When the client requests a
    revision, ``message`` should carry their feedback verbatim.
    """

    status: str  # "accepted" | "revision_requested"
    message: Optional[str] = None


class Gate2Payload(BaseModel):
    """Client second-gate decision.

    ``status`` is "yes" (final lock + production) or "no" (admin must
    contact the client).
    """

    status: str  # "yes" | "no"


# ----------------------------------------------------------------------
# Admin · toggle "release for client review" on a render
# ----------------------------------------------------------------------
@router.post(
    "/orders/{order_id}/renders/{render_id}/release-for-client",
    summary="Toggle whether a render is visible to the client on the "
    "step 02 approval screen.",
)
async def release_render_for_client(
    order_id: str,
    render_id: str,
    body: ReleaseTogglePayload,
    request: Request,
    user=Depends(require_roles("admin", "associate")),
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    renders = order.get("renders") or []
    target = next((r for r in renders if r.get("id") == render_id), None)
    if not target:
        raise HTTPException(
            status_code=404,
            detail="Render not found in the approved queue.",
        )

    # Update the matching subdocument in place — using arrayFilters lets
    # us patch a single element without rebuilding the whole array.
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {"renders.$[elem].client_release": body.released}},
        array_filters=[{"elem.id": render_id}],
    )

    await record_event(
        db,
        request,
        f"order.render.client_release.{'on' if body.released else 'off'}",
        user=user,
        meta={
            "order_id": order_id,
            "render_id": render_id,
            "file_name": target.get("name"),
        },
    )
    request.state.activity_logged = True

    return {
        "ok": True,
        "render_id": render_id,
        "released": body.released,
    }


# ----------------------------------------------------------------------
# Client · read released renders + current approval state
# ----------------------------------------------------------------------
@router.get(
    "/orders/{order_id}/client-renders",
    summary="Released renders + approval state visible to the client on "
    "the Conceptual Rendering step.",
)
async def get_client_renders(
    order_id: str,
    user=Depends(get_current_user),
):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Only the order's client + admin/associate may peek at this view.
    if user["role"] == "client" and order.get("client_id") != user.get("id"):
        raise HTTPException(status_code=403, detail="Not your commission")
    elif user["role"] not in ("admin", "associate", "client"):
        raise HTTPException(status_code=403, detail="Forbidden")

    released = [
        r for r in (order.get("renders") or []) if r.get("client_release")
    ]
    state = order.get("client_approval") or {}
    return {
        "released": released,
        "approval": {
            "gate1_status": state.get("gate1_status") or "pending",
            "gate1_at": state.get("gate1_at"),
            "gate1_message": state.get("gate1_message"),
            "gate2_status": state.get("gate2_status") or "pending",
            "gate2_at": state.get("gate2_at"),
        },
    }


# ----------------------------------------------------------------------
# Client · gate 1 (render approval)
# ----------------------------------------------------------------------
@router.post(
    "/orders/{order_id}/client-approval/gate1",
    summary="Client posts first-gate render approval.",
)
async def post_gate1(
    order_id: str,
    body: Gate1Payload,
    request: Request,
    user=Depends(get_current_user),
):
    if body.status not in ("accepted", "revision_requested"):
        raise HTTPException(
            status_code=400,
            detail="status must be 'accepted' or 'revision_requested'",
        )

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] != "client" or order.get("client_id") != user.get("id"):
        raise HTTPException(
            status_code=403,
            detail="Only the assigned client can post a render approval.",
        )
    if (order.get("client_approval") or {}).get("gate1_status") == "accepted":
        raise HTTPException(
            status_code=409,
            detail="Render approval already accepted — proceed to gate 2.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    patch: dict = {
        "client_approval.gate1_status": body.status,
        "client_approval.gate1_at": now_iso,
    }
    if body.status == "revision_requested":
        patch["client_approval.gate1_message"] = (body.message or "").strip()
    await db.orders.update_one({"id": order_id}, {"$set": patch})

    # Email + in-app notifications on the revision path.
    notice_sent = False
    if body.status == "revision_requested":
        try:
            await _notify_revision_requested(order, user, body.message or "")
            notice_sent = True
        except Exception as exc:  # noqa: BLE001
            import logging
            logging.getLogger(__name__).warning(
                "Gate1 revision notification failed: %s", exc
            )

    await record_event(
        db,
        request,
        f"order.client_approval.gate1.{body.status}",
        user=user,
        meta={
            "order_id": order_id,
            "message": (body.message or "")[:500],
            "notice_sent": notice_sent,
        },
    )
    request.state.activity_logged = True
    return {"ok": True, "status": body.status, "notice_sent": notice_sent}


# ----------------------------------------------------------------------
# Client · gate 2 (final design lock)
# ----------------------------------------------------------------------
@router.post(
    "/orders/{order_id}/client-approval/gate2",
    summary="Client posts the final design-lock confirmation.",
)
async def post_gate2(
    order_id: str,
    body: Gate2Payload,
    request: Request,
    user=Depends(get_current_user),
):
    if body.status not in ("yes", "no"):
        raise HTTPException(
            status_code=400, detail="status must be 'yes' or 'no'"
        )

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user["role"] != "client" or order.get("client_id") != user.get("id"):
        raise HTTPException(
            status_code=403,
            detail="Only the assigned client can post the final approval.",
        )
    approval = order.get("client_approval") or {}
    if approval.get("gate1_status") != "accepted":
        raise HTTPException(
            status_code=409,
            detail="Gate 1 must be accepted before gate 2.",
        )
    if approval.get("gate2_status") in ("yes", "no"):
        raise HTTPException(
            status_code=409,
            detail="Gate 2 already submitted.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    set_doc: dict = {
        "client_approval.gate2_status": body.status,
        "client_approval.gate2_at": now_iso,
    }

    if body.status == "yes":
        # Promote the order, auto-complete step 02, forward to client.
        set_doc["status"] = "in production"
        await db.orders.update_one(
            {"id": order_id, "steps.step_number": 2},
            {
                "$set": {
                    **set_doc,
                    "steps.$.completed": True,
                    "steps.$.completed_at_china": now_china_iso(),
                    "steps.$.completed_at_utc": now_iso,
                    "steps.$.forwarded_to_client": True,
                    "steps.$.forwarded_at": now_iso,
                }
            },
        )
    else:
        await db.orders.update_one({"id": order_id}, {"$set": set_doc})

    # Side effects fan out after the DB write so they never block the
    # primary state transition.
    cert_emailed = False
    if body.status == "yes":
        try:
            await _notify_design_locked(order, user)
        except Exception as exc:  # noqa: BLE001
            import logging
            logging.getLogger(__name__).warning(
                "Gate2 lock notification failed: %s", exc
            )
        try:
            cert_emailed = await _email_design_certificate(order, user)
        except Exception as exc:  # noqa: BLE001
            import logging
            logging.getLogger(__name__).warning(
                "Design Authorisation cert email failed: %s", exc
            )
    else:
        try:
            await _notify_urgent_contact(order, user)
        except Exception as exc:  # noqa: BLE001
            import logging
            logging.getLogger(__name__).warning(
                "Gate2 urgent-contact notification failed: %s", exc
            )

    await record_event(
        db,
        request,
        f"order.client_approval.gate2.{body.status}",
        user=user,
        meta={
            "order_id": order_id,
            "cert_emailed": cert_emailed,
        },
    )
    request.state.activity_logged = True
    return {
        "ok": True,
        "status": body.status,
        "cert_emailed": cert_emailed,
    }


# ----------------------------------------------------------------------
# Helpers — notifications + email
# ----------------------------------------------------------------------
async def _resolve_emails(order: dict) -> dict:
    """Resolve associate + admin email addresses + the assigned manufacturer."""
    associate_id = order.get("associate_id")
    manufacturer_id = order.get("manufacturer_id")
    associate = None
    manufacturer = None
    if associate_id:
        associate = await db.users.find_one(
            {"id": associate_id}, {"_id": 0, "email": 1, "name": 1}
        )
    if manufacturer_id:
        manufacturer = await db.users.find_one(
            {"id": manufacturer_id}, {"_id": 0, "email": 1, "name": 1}
        )
    # Admin BCC list — every active admin gets BCC'd on revision emails
    # so nothing escapes the atelier even if an associate is on leave.
    admin_emails = []
    async for u in db.users.find(
        {"role": "admin", "deleted": {"$ne": True}}, {"_id": 0, "email": 1}
    ):
        if u.get("email"):
            admin_emails.append(u["email"])
    return {
        "associate": associate,
        "manufacturer": manufacturer,
        "admin_emails": admin_emails,
    }


async def _notify_revision_requested(order: dict, client_user: dict, message: str):
    """Email associate + BCC admins with the client's revision request."""
    from _email import _ensure_resend, build_files_email_html
    import resend

    _ensure_resend()
    contacts = await _resolve_emails(order)
    associate = contacts["associate"]
    admin_emails = contacts["admin_emails"]
    if not associate or not associate.get("email"):
        return  # Nothing we can do silently — admin still gets in-app.

    subject = (
        f"REVISION REQUESTED · {order.get('jewelry_name') or 'Commission'} "
        f"({order.get('order_ref') or order['id'][:8]})"
    )
    body_lines = [
        f"Client {client_user.get('name') or client_user.get('email')} has "
        "requested a revision on the conceptual renders.",
        "",
        f"Commission: {order.get('jewelry_name')} ({order.get('order_ref')})",
        f"Submitted at: {now_china_iso()}",
        "",
        "— Client feedback —",
        (message or "(no message provided)").strip(),
        "",
        "Please reply to the client directly to plan the next round of "
        "renders.",
    ]
    html = "<br>".join(
        ln.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        for ln in body_lines
    )

    try:
        resend.Emails.send(
            {
                "from": "Somnio Atelier <atelier@somnio.co>",
                "to": [associate["email"]],
                "bcc": admin_emails,
                "subject": subject,
                "html": html,
                "reply_to": client_user.get("email"),
            }
        )
    except Exception:  # noqa: BLE001
        # Keep behaviour aligned with the rest of the email system —
        # raise only if the env isn't configured (already handled by
        # _ensure_resend above).
        raise

    # In-app: associate gets a notification too.
    from _notifications import create_notifications

    await create_notifications(
        db,
        audience_user_ids=[u for u in [order.get("associate_id")] if u],
        type="client_approval.gate1.revision",
        title="Client requested a revision",
        body=f"{order.get('order_ref')} · {order.get('jewelry_name')}",
        link_route=f"/(app)/order/{order['id']}",
        payload={"order_id": order["id"], "message": message[:240]},
    )


async def _notify_design_locked(order: dict, client_user: dict):
    """In-app fan-out when client locks the final design."""
    from _notifications import create_notifications

    admin_ids = []
    async for u in db.users.find(
        {"role": "admin", "deleted": {"$ne": True}}, {"_id": 0, "id": 1}
    ):
        if u.get("id"):
            admin_ids.append(u["id"])
    targets = list({*admin_ids, order.get("manufacturer_id"), order.get("associate_id")})
    targets = [t for t in targets if t]
    if not targets:
        return
    await create_notifications(
        db,
        audience_user_ids=targets,
        type="client_approval.gate2.locked",
        title="Design authorised — production may begin",
        body=(
            f"{order.get('order_ref')} · {order.get('jewelry_name')} — "
            f"client {client_user.get('email') or client_user.get('name')} "
            "locked the design."
        ),
        link_route=f"/(app)/order/{order['id']}",
        payload={"order_id": order["id"]},
    )


async def _notify_urgent_contact(order: dict, client_user: dict):
    """Notify associate + admin to contact the client urgently after a NO."""
    from _notifications import create_notifications

    admin_ids = []
    async for u in db.users.find(
        {"role": "admin", "deleted": {"$ne": True}}, {"_id": 0, "id": 1}
    ):
        if u.get("id"):
            admin_ids.append(u["id"])
    targets = list({*admin_ids, order.get("associate_id")})
    targets = [t for t in targets if t]
    if not targets:
        return
    await create_notifications(
        db,
        audience_user_ids=targets,
        type="client_approval.gate2.no",
        title="URGENT · client has cold feet on final approval",
        body=(
            f"{order.get('order_ref')} · {order.get('jewelry_name')} — "
            "client answered 'No' to the final design lock. Reach out "
            "today."
        ),
        link_route=f"/(app)/order/{order['id']}",
        payload={"order_id": order["id"]},
    )


async def _email_design_certificate(order: dict, client_user: dict) -> bool:
    """Generate a Design Authorisation Certificate PDF + email to client.

    Uses the existing ``build_digital_dna_pdf`` machinery so the cert
    stays visually consistent with the rest of the atelier's PDFs.
    """
    from _email import _ensure_resend
    from _digital_dna import build_digital_dna_pdf
    import base64
    import resend

    _ensure_resend()
    pdf_bytes = build_digital_dna_pdf(order, viewer=client_user)
    if not pdf_bytes:
        return False
    client_email = client_user.get("email")
    if not client_email:
        return False

    # BCC the admin list and the associate so the atelier keeps a copy
    # of every Authorisation Certificate sent.
    contacts = await _resolve_emails(order)
    bcc = list(contacts["admin_emails"])
    if contacts["associate"] and contacts["associate"].get("email"):
        bcc.append(contacts["associate"]["email"])

    subject = (
        f"Design Authorisation Certificate · "
        f"{order.get('jewelry_name') or 'Commission'} "
        f"({order.get('order_ref') or order['id'][:8]})"
    )
    body_html = (
        "<p>Dear "
        f"{client_user.get('name') or 'Client'},</p>"
        "<p>Thank you for confirming the final design. Please find "
        "attached your Design Authorisation Certificate.</p>"
        "<p>Your commission has now entered production. We will keep "
        "you updated through each remaining step.</p>"
        "<p>— Somnio Atelier</p>"
    )

    resend.Emails.send(
        {
            "from": "Somnio Atelier <atelier@somnio.co>",
            "to": [client_email],
            "bcc": bcc,
            "subject": subject,
            "html": body_html,
            "attachments": [
                {
                    "filename": (
                        f"design-authorisation-"
                        f"{order.get('order_ref') or order['id'][:8]}.pdf"
                    ),
                    "content": base64.b64encode(pdf_bytes).decode("ascii"),
                }
            ],
        }
    )
    return True
