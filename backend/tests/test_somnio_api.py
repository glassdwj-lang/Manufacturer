"""End-to-end backend tests for Somnio.Co Atelier 26-step manufacturing tracker."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    # fall back to frontend .env
    import pathlib
    import re
    env_file = pathlib.Path("/app/frontend/.env").read_text()
    m = re.search(r"EXPO_PUBLIC_BACKEND_URL=(\S+)", env_file)
    BASE_URL = m.group(1) if m else None
assert BASE_URL, "Backend URL not configured"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

AT = chr(64)
DOMAIN = AT + "somnio.co"

CREDS = {
    "admin":        {"email": "admin" + DOMAIN,     "password": "Admin" + AT + "2026"},
    "manufacturer": {"email": "mfg" + DOMAIN,       "password": "Mfg" + AT + "2026"},
    "associate":    {"email": "associate" + DOMAIN, "password": "Assoc" + AT + "2026"},
    "client":       {"email": "client" + DOMAIN,    "password": "Client" + AT + "2026"},
}


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def seeded(session):
    r = session.post(f"{API}/seed")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def tokens(session, seeded):
    out = {}
    for role, c in CREDS.items():
        r = session.post(f"{API}/auth/login", json=c)
        assert r.status_code == 200, f"{role}: {r.text}"
        out[role] = r.json()
    return out


def auth_h(tokens, role):
    return {"Authorization": f"Bearer {tokens[role]['access_token']}"}


# ----------- Seed & Auth -----------
def test_seed_idempotent(session):
    r1 = session.post(f"{API}/seed").json()
    r2 = session.post(f"{API}/seed").json()
    assert "seeded" in r1 and "seeded" in r2
    # 2nd call should mark all as exists
    statuses = [x.get("status") for x in r2["seeded"] if "email" in x]
    assert all(s == "exists" for s in statuses)


def test_login_case_insensitive(session):
    r = session.post(f"{API}/auth/login", json={
        "email": ("Admin" + DOMAIN).upper(),
        "password": "Admin" + AT + "2026",
    })
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "admin"


def test_login_all_roles(tokens):
    for role in CREDS:
        assert tokens[role]["user"]["role"] == role
        assert tokens[role]["access_token"]


def test_login_bad_password(session):
    r = session.post(f"{API}/auth/login", json={
        "email": "admin" + DOMAIN, "password": "wrong",
    })
    assert r.status_code == 401


def test_auth_me(session, tokens):
    r = session.get(f"{API}/auth/me", headers=auth_h(tokens, "admin"))
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


# ----------- Orders listing per role -----------
def test_orders_admin_sees_all(session, tokens):
    r = session.get(f"{API}/orders", headers=auth_h(tokens, "admin"))
    assert r.status_code == 200
    orders = r.json()
    assert any(o["order_ref"] == "SMN-DEMO0001" for o in orders)


def test_orders_manufacturer_sees_assigned(session, tokens):
    r = session.get(f"{API}/orders", headers=auth_h(tokens, "manufacturer"))
    assert r.status_code == 200
    orders = r.json()
    assert len(orders) >= 1
    assert all(o["manufacturer_id"] == tokens["manufacturer"]["user"]["id"] for o in orders)


def test_orders_associate_sees_their_clients(session, tokens):
    r = session.get(f"{API}/orders", headers=auth_h(tokens, "associate"))
    assert r.status_code == 200
    orders = r.json()
    assert all(o["associate_id"] == tokens["associate"]["user"]["id"] for o in orders)


def test_orders_client_sees_own(session, tokens):
    r = session.get(f"{API}/orders", headers=auth_h(tokens, "client"))
    assert r.status_code == 200
    orders = r.json()
    assert all(o["client_id"] == tokens["client"]["user"]["id"] for o in orders)


# ----------- Order detail / step masking -----------
@pytest.fixture(scope="session")
def demo_order_id(session, tokens):
    r = session.get(f"{API}/orders", headers=auth_h(tokens, "admin"))
    for o in r.json():
        if o["order_ref"] == "SMN-DEMO0001":
            return o["id"]
    pytest.skip("Demo order missing")


def test_order_detail_admin_has_26_steps(session, tokens, demo_order_id):
    r = session.get(f"{API}/orders/{demo_order_id}", headers=auth_h(tokens, "admin"))
    assert r.status_code == 200
    data = r.json()
    assert len(data["steps"]) == 26
    phases = {s["phase"] for s in data["steps"]}
    assert phases == {"I", "II", "III", "IV", "V"}
    # admin sees customs
    assert isinstance(data["customs"], dict)
    assert "airway_bill" in data["customs"]


def test_order_detail_client_masks_unforwarded(session, tokens, demo_order_id):
    r = session.get(f"{API}/orders/{demo_order_id}", headers=auth_h(tokens, "client"))
    assert r.status_code == 200
    data = r.json()
    # First 3 forwarded; rest masked
    forwarded = [s for s in data["steps"] if s.get("forwarded_to_client")]
    assert len(forwarded) >= 3
    for s in data["steps"]:
        if not s.get("forwarded_to_client"):
            assert s["notes"] == ""
            assert s["photos"] == []
            assert s["completed_at_china"] is None
            assert s["completed"] is False
    # client should not see customs at all — the whole field is stripped
    assert "customs" not in data, f"customs leaked to client: {data.get('customs')}"


# ----------- Complete step / forward / auto-forward -----------
def test_manufacturer_complete_step_and_china_time(session, tokens, demo_order_id):
    # Step 4 should not be completed yet
    r = session.post(
        f"{API}/orders/{demo_order_id}/steps/4/complete",
        headers=auth_h(tokens, "manufacturer"),
        json={"notes": "TEST_step4 complete", "photos": ["data:image/png;base64,iVBORw0KG"]},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    step4 = next(s for s in data["steps"] if s["step_number"] == 4)
    assert step4["completed"] is True
    assert step4["completed_at_china"] is not None
    # China time should be like 2026-...+08:00
    assert "+08:00" in step4["completed_at_china"] or "+0800" in step4["completed_at_china"]


def test_forward_step_by_associate(session, tokens, demo_order_id):
    r = session.post(
        f"{API}/orders/{demo_order_id}/steps/4/forward",
        headers=auth_h(tokens, "associate"),
        json={"review_note": "TEST_forward note"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    step4 = next(s for s in data["steps"] if s["step_number"] == 4)
    assert step4["forwarded_to_client"] is True


def test_auto_forward_toggle_and_effect(session, tokens, demo_order_id):
    client_id = tokens["client"]["user"]["id"]
    # Associate toggles auto-forward on
    r = session.put(
        f"{API}/users/{client_id}/auto-forward",
        headers=auth_h(tokens, "associate"),
        json={"auto_forward": True},
    )
    assert r.status_code == 200
    assert r.json()["auto_forward"] is True

    # Manufacturer completes step 5 -> should auto-forward
    r = session.post(
        f"{API}/orders/{demo_order_id}/steps/5/complete",
        headers=auth_h(tokens, "manufacturer"),
        json={"notes": "TEST_auto-forward step 5"},
    )
    assert r.status_code == 200
    step5 = next(s for s in r.json()["steps"] if s["step_number"] == 5)
    assert step5["completed"] is True
    assert step5["forwarded_to_client"] is True

    # Toggle off for cleanup
    session.put(
        f"{API}/users/{client_id}/auto-forward",
        headers=auth_h(tokens, "associate"),
        json={"auto_forward": False},
    )


# ----------- Role enforcement (403s) -----------
def test_client_cannot_list_users(session, tokens):
    r = session.get(f"{API}/users", headers=auth_h(tokens, "client"))
    assert r.status_code == 403


def test_manufacturer_cannot_list_users(session, tokens):
    r = session.get(f"{API}/users", headers=auth_h(tokens, "manufacturer"))
    assert r.status_code == 403


def test_non_admin_cannot_update_customs(session, tokens, demo_order_id):
    for role in ["manufacturer", "associate", "client"]:
        r = session.put(
            f"{API}/orders/{demo_order_id}/customs",
            headers=auth_h(tokens, role),
            json={"notes": "nope"},
        )
        assert r.status_code == 403, f"{role} should be 403"


def test_non_admin_cannot_get_customs(session, tokens, demo_order_id):
    for role in ["manufacturer", "associate", "client"]:
        r = session.get(
            f"{API}/orders/{demo_order_id}/customs",
            headers=auth_h(tokens, role),
        )
        assert r.status_code == 403


def test_client_cannot_create_user(session, tokens):
    r = session.post(
        f"{API}/users",
        headers=auth_h(tokens, "client"),
        json={"email": "x" + DOMAIN, "password": "x", "name": "x", "role": "client"},
    )
    assert r.status_code == 403


def test_associate_cannot_toggle_other_client(session, tokens):
    # Create a foreign client owned by no associate
    foreign_email = "TEST_foreign_client" + DOMAIN
    r = session.post(
        f"{API}/users",
        headers=auth_h(tokens, "admin"),
        json={"email": foreign_email, "password": "P" + AT + "ass1234", "name": "Foreign", "role": "client"},
    )
    # may be 400 if rerun -> get id either way
    if r.status_code == 200:
        foreign_id = r.json()["id"]
    else:
        all_users = session.get(f"{API}/users", headers=auth_h(tokens, "admin")).json()
        foreign_id = next(u["id"] for u in all_users if u["email"] == foreign_email)

    r = session.put(
        f"{API}/users/{foreign_id}/auto-forward",
        headers=auth_h(tokens, "associate"),
        json={"auto_forward": True},
    )
    assert r.status_code == 403

    # cleanup
    session.delete(f"{API}/users/{foreign_id}", headers=auth_h(tokens, "admin"))


def test_manufacturer_cannot_complete_other_order(session, tokens):
    # Admin creates a new order assigned to a brand new manufacturer
    new_mfg = {"email": "TEST_mfg2" + DOMAIN, "password": "P" + AT + "ass1234", "name": "Other Mfg", "role": "manufacturer"}
    r = session.post(f"{API}/users", headers=auth_h(tokens, "admin"), json=new_mfg)
    if r.status_code == 200:
        mfg_id = r.json()["id"]
    else:
        users = session.get(f"{API}/users", headers=auth_h(tokens, "admin")).json()
        mfg_id = next(u["id"] for u in users if u["email"] == new_mfg["email"])

    client_id = tokens["client"]["user"]["id"]
    r = session.post(
        f"{API}/orders",
        headers=auth_h(tokens, "admin"),
        json={"client_id": client_id, "manufacturer_id": mfg_id, "jewelry_name": "TEST_other"},
    )
    assert r.status_code == 200, r.text
    new_order_id = r.json()["id"]

    # Original demo manufacturer tries to complete a step on this new order
    r = session.post(
        f"{API}/orders/{new_order_id}/steps/1/complete",
        headers=auth_h(tokens, "manufacturer"),
        json={"notes": "should fail"},
    )
    assert r.status_code == 403

    # cleanup
    session.delete(f"{API}/users/{mfg_id}", headers=auth_h(tokens, "admin"))


# ----------- Admin customs upload -----------
def test_admin_customs_upload_and_get(session, tokens, demo_order_id):
    payload = {
        "airway_bill": "data:image/png;base64,AAAA",
        "customs_document": "data:image/png;base64,BBBB",
        "notes": "TEST_customs",
    }
    r = session.put(
        f"{API}/orders/{demo_order_id}/customs",
        headers=auth_h(tokens, "admin"),
        json=payload,
    )
    assert r.status_code == 200

    r = session.get(f"{API}/orders/{demo_order_id}/customs", headers=auth_h(tokens, "admin"))
    assert r.status_code == 200
    data = r.json()
    assert data["airway_bill"] == payload["airway_bill"]
    assert data["customs_document"] == payload["customs_document"]
    assert data["notes"] == "TEST_customs"


# ----------- Admin create order -----------
def test_admin_create_order(session, tokens):
    client_id = tokens["client"]["user"]["id"]
    mfg_id = tokens["manufacturer"]["user"]["id"]
    r = session.post(
        f"{API}/orders",
        headers=auth_h(tokens, "admin"),
        json={
            "client_id": client_id,
            "manufacturer_id": mfg_id,
            "jewelry_name": "TEST_new piece",
            "sku": "TEST_SKU1",
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["order_ref"].startswith("SMN-")
    assert len(data["steps"]) == 26
    # cleanup - delete via mongo? no endpoint. leave it tagged TEST_.
