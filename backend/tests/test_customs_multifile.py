"""Backend tests for the new multi-file customs flow.

Covers:
* GET /api/orders/{id}/customs       (admin + manufacturer + negative)
* PUT /api/orders/{id}/customs       (admin can write notes; manufacturer cannot)
* POST /api/orders/{id}/customs/files/{kind}   (admin + mfg; 400 for bad kind)
* DELETE /api/orders/{id}/customs/files/{kind}/{file_id}
      (admin can remove anything; mfg only own files)
* 403 for associate / client on each customs endpoint.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get(
    "EXPO_BACKEND_URL"
)
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL / EXPO_BACKEND_URL must be set"
BASE_URL = BASE_URL.rstrip("/")

CREDS = {
    "admin": ("admin@somnio.co", "Admin@2026"),
    "manufacturer": ("mfg@somnio.co", "Mfg@2026"),
    "associate": ("associate@somnio.co", "Assoc@2026"),
    "client": ("client@somnio.co", "Client@2026"),
}


def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def tokens():
    out = {}
    for role, (email, pw) in CREDS.items():
        out[role] = _login(email, pw)
    return out


@pytest.fixture(scope="module")
def mfg_order(tokens):
    """Pick an order owned by mfg@somnio.co (used for happy-path tests)."""
    r = requests.get(f"{BASE_URL}/api/orders", headers=_h(tokens["manufacturer"]), timeout=20)
    assert r.status_code == 200, r.text
    orders = r.json()
    assert orders, "manufacturer has no orders — seed required"
    return orders[0]


@pytest.fixture(scope="module")
def foreign_order_for_mfg(tokens, mfg_order):
    """Return an order id NOT owned by mfg@somnio.co (admin lists everything)."""
    r = requests.get(f"{BASE_URL}/api/orders", headers=_h(tokens["admin"]), timeout=20)
    assert r.status_code == 200
    mfg_id = mfg_order["manufacturer_id"]
    other = next((o for o in r.json() if o["manufacturer_id"] != mfg_id), None)
    return other  # may be None if seed only has one mfg


# ---------------------------------------------------------------------------
# GET /customs
# ---------------------------------------------------------------------------
class TestGetCustoms:
    def test_admin_can_read(self, tokens, mfg_order):
        r = requests.get(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["admin"]),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("airway_bill_files"), list)
        assert isinstance(body.get("customs_files"), list)
        assert "airway_bill_text" in body
        assert "notes" in body

    def test_manufacturer_can_read_own(self, tokens, mfg_order):
        r = requests.get(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["manufacturer"]),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body.get("airway_bill_files"), list)
        assert isinstance(body.get("customs_files"), list)

    def test_manufacturer_blocked_on_foreign(self, tokens, foreign_order_for_mfg):
        if not foreign_order_for_mfg:
            pytest.skip("No foreign order available in seed")
        r = requests.get(
            f"{BASE_URL}/api/orders/{foreign_order_for_mfg['id']}/customs",
            headers=_h(tokens["manufacturer"]),
            timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_associate_forbidden(self, tokens, mfg_order):
        r = requests.get(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["associate"]),
            timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_client_forbidden(self, tokens, mfg_order):
        r = requests.get(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["client"]),
            timeout=20,
        )
        assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# PUT /customs
# ---------------------------------------------------------------------------
class TestPutCustoms:
    def test_admin_can_update_notes_and_text(self, tokens, mfg_order):
        marker_notes = f"TEST_admin_notes_{uuid.uuid4().hex[:6]}"
        marker_text = f"TEST_admin_text_{uuid.uuid4().hex[:6]}"
        r = requests.put(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["admin"]),
            json={"notes": marker_notes, "airway_bill_text": marker_text},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        # GET to verify persisted
        g = requests.get(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["admin"]),
            timeout=20,
        ).json()
        assert g.get("notes") == marker_notes
        assert g.get("airway_bill_text") == marker_text

    def test_manufacturer_can_update_text_but_not_notes(self, tokens, mfg_order):
        # First, admin sets a known "notes" value.
        canonical_notes = f"TEST_admin_canonical_{uuid.uuid4().hex[:6]}"
        requests.put(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["admin"]),
            json={"notes": canonical_notes},
            timeout=20,
        )
        # Then, manufacturer attempts to overwrite notes AND set airway text.
        mfg_text = f"TEST_mfg_text_{uuid.uuid4().hex[:6]}"
        r = requests.put(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["manufacturer"]),
            json={"notes": "MANUF_TRIED_TO_OVERWRITE", "airway_bill_text": mfg_text},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        g = requests.get(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["admin"]),
            timeout=20,
        ).json()
        # notes preserved, manufacturer override rejected
        assert g.get("notes") == canonical_notes
        # airway_bill_text reflects the manufacturer write
        assert g.get("airway_bill_text") == mfg_text

    def test_manufacturer_blocked_on_foreign(self, tokens, foreign_order_for_mfg):
        if not foreign_order_for_mfg:
            pytest.skip("No foreign order available")
        r = requests.put(
            f"{BASE_URL}/api/orders/{foreign_order_for_mfg['id']}/customs",
            headers=_h(tokens["manufacturer"]),
            json={"airway_bill_text": "x"},
            timeout=20,
        )
        assert r.status_code == 403

    def test_associate_forbidden(self, tokens, mfg_order):
        r = requests.put(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["associate"]),
            json={"airway_bill_text": "x"},
            timeout=20,
        )
        assert r.status_code == 403

    def test_client_forbidden(self, tokens, mfg_order):
        r = requests.put(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["client"]),
            json={"airway_bill_text": "x"},
            timeout=20,
        )
        assert r.status_code == 403


# ---------------------------------------------------------------------------
# POST + DELETE /customs/files/{kind}
# ---------------------------------------------------------------------------
def _fake_payload(name: str) -> dict:
    return {
        "name": name,
        "secure_url": f"https://res.cloudinary.com/demo/raw/upload/{uuid.uuid4().hex}/{name}",
        "public_id": f"somnio/customs/{uuid.uuid4().hex}",
        "format": name.rsplit(".", 1)[-1].lower() if "." in name else None,
        "bytes": 12345,
        "resource_type": "raw",
    }


class TestCustomsFiles:
    def test_unknown_kind_returns_400(self, tokens, mfg_order):
        r = requests.post(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs/files/bogus",
            headers=_h(tokens["admin"]),
            json=_fake_payload("TEST_x.pdf"),
            timeout=20,
        )
        assert r.status_code == 400, r.text

    def test_admin_can_upload_airway_bill(self, tokens, mfg_order):
        r = requests.post(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs/files/airway-bill",
            headers=_h(tokens["admin"]),
            json=_fake_payload("TEST_admin_awb.pdf"),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        entry = r.json()
        assert entry["id"]
        assert entry["name"] == "TEST_admin_awb.pdf"
        assert entry["uploaded_by_email"] == CREDS["admin"][0]
        # Verify via GET
        g = requests.get(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["admin"]),
            timeout=20,
        ).json()
        ids = [f["id"] for f in g["airway_bill_files"]]
        assert entry["id"] in ids
        pytest.admin_awb_file_id = entry["id"]  # type: ignore[attr-defined]

    def test_mfg_can_upload_customs_file(self, tokens, mfg_order):
        r = requests.post(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs/files/customs",
            headers=_h(tokens["manufacturer"]),
            json=_fake_payload("TEST_mfg_customs.jpg"),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        entry = r.json()
        assert entry["uploaded_by_email"] == CREDS["manufacturer"][0]
        pytest.mfg_customs_file_id = entry["id"]  # type: ignore[attr-defined]

    def test_mfg_blocked_on_foreign_upload(self, tokens, foreign_order_for_mfg):
        if not foreign_order_for_mfg:
            pytest.skip("No foreign order available")
        r = requests.post(
            f"{BASE_URL}/api/orders/{foreign_order_for_mfg['id']}/customs/files/airway-bill",
            headers=_h(tokens["manufacturer"]),
            json=_fake_payload("TEST_evil.pdf"),
            timeout=20,
        )
        assert r.status_code == 403

    def test_associate_forbidden_upload(self, tokens, mfg_order):
        r = requests.post(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs/files/airway-bill",
            headers=_h(tokens["associate"]),
            json=_fake_payload("TEST_assoc.pdf"),
            timeout=20,
        )
        assert r.status_code == 403

    def test_client_forbidden_upload(self, tokens, mfg_order):
        r = requests.post(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs/files/customs",
            headers=_h(tokens["client"]),
            json=_fake_payload("TEST_client.pdf"),
            timeout=20,
        )
        assert r.status_code == 403

    def test_mfg_cannot_delete_admin_uploaded_file(self, tokens, mfg_order):
        file_id = getattr(pytest, "admin_awb_file_id", None)
        assert file_id, "Admin upload test must run first"
        r = requests.delete(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs/files/airway-bill/{file_id}",
            headers=_h(tokens["manufacturer"]),
            timeout=20,
        )
        assert r.status_code == 403, r.text

    def test_mfg_can_delete_own_file(self, tokens, mfg_order):
        file_id = getattr(pytest, "mfg_customs_file_id", None)
        assert file_id
        r = requests.delete(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs/files/customs/{file_id}",
            headers=_h(tokens["manufacturer"]),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        g = requests.get(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["admin"]),
            timeout=20,
        ).json()
        assert file_id not in [f["id"] for f in g["customs_files"]]

    def test_admin_can_delete_any_file(self, tokens, mfg_order):
        file_id = getattr(pytest, "admin_awb_file_id", None)
        assert file_id
        r = requests.delete(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs/files/airway-bill/{file_id}",
            headers=_h(tokens["admin"]),
            timeout=20,
        )
        assert r.status_code == 200, r.text
        g = requests.get(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs",
            headers=_h(tokens["admin"]),
            timeout=20,
        ).json()
        assert file_id not in [f["id"] for f in g["airway_bill_files"]]

    def test_delete_unknown_kind_returns_400(self, tokens, mfg_order):
        r = requests.delete(
            f"{BASE_URL}/api/orders/{mfg_order['id']}/customs/files/bogus/abc",
            headers=_h(tokens["admin"]),
            timeout=20,
        )
        assert r.status_code == 400, r.text
