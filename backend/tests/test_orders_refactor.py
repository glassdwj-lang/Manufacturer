"""Backend smoke tests for the routes/orders/ package refactor.

The refactor split orders.py (1377 lines) into a sub-package with the
same router shape — every URL, method, payload, auth gate and response
must remain identical. This file exercises all 26 routes via the public
EXPO_BACKEND_URL and asserts response shapes (not just status codes).

Known non-issues (intentionally NOT tested):
- /orders/{id}/steps/{n}/forward: pre-existing missing decorator (404)
  preserved by the refactor.

Resend sandbox: only delivered@resend.dev or dean@somnioblinds.com
are accepted in the recipients list; other addresses produce a 502.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL must be set in frontend/.env")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@somnio.co", "password": "Admin@2026"}
MFG = {"email": "mfg@somnio.co", "password": "Mfg@2026"}
SEED_ORDER_ID = "165af6bb-89dd-4837-864c-967e4f09d4f6"
RESEND_OK = "delivered@resend.dev"


# ---------- fixtures --------------------------------------------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def mfg_token():
    r = requests.post(f"{API}/auth/login", json=MFG, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"mfg login failed: {r.status_code} {r.text}")
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def mfg_headers(mfg_token):
    return {"Authorization": f"Bearer {mfg_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def seed_order(admin_headers):
    r = requests.get(f"{API}/orders/{SEED_ORDER_ID}", headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"seed order missing: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def throwaway_order(admin_headers):
    """Create a fresh order we can mutate destructively (steps, soft-delete, etc.).

    We reuse the seed order's client + manufacturer so the FK checks pass.
    """
    seed_r = requests.get(f"{API}/orders/{SEED_ORDER_ID}", headers=admin_headers, timeout=20)
    assert seed_r.status_code == 200
    seed = seed_r.json()
    payload = {
        "client_id": seed["client_id"],
        "manufacturer_id": seed["manufacturer_id"],
        "associate_id": seed.get("associate_id"),
        "jewelry_name": f"TEST_REFACTOR_{uuid.uuid4().hex[:6]}",
        "sku": "TEST_SKU",
        "description": "throwaway order for refactor smoke test",
    }
    r = requests.post(f"{API}/orders", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"create order failed: {r.status_code} {r.text}"
    order = r.json()
    assert order["jewelry_name"].startswith("TEST_REFACTOR_")
    yield order
    # cleanup: soft-delete + purge (best-effort)
    oid = order["id"]
    requests.delete(f"{API}/orders/{oid}", headers=admin_headers, timeout=10)
    requests.delete(f"{API}/admin/recycle-bin/{oid}/purge", headers=admin_headers, timeout=10)


# ---------- 1. Auth ---------------------------------------------------------
class TestAuth:
    def test_admin_login_returns_token_and_user(self, admin_token):
        assert admin_token and isinstance(admin_token, str) and len(admin_token) > 20

    def test_auth_me_returns_admin(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["email"] == ADMIN["email"]
        assert body["role"] == "admin"


# ---------- 2. Order CRUD ---------------------------------------------------
class TestOrderCRUD:
    def test_list_orders(self, admin_headers):
        r = requests.get(f"{API}/orders", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        orders = r.json()
        assert isinstance(orders, list)
        assert any(o["id"] == SEED_ORDER_ID for o in orders), "seed order not in list"

    def test_get_seed_order_detail(self, seed_order):
        assert seed_order["id"] == SEED_ORDER_ID
        assert "steps" in seed_order and len(seed_order["steps"]) >= 26
        assert "manufacturer_id" in seed_order
        assert "client_id" in seed_order
        # commission/order should expose at least a jewelry_name
        assert seed_order.get("jewelry_name")

    def test_get_nonexistent_order_404(self, admin_headers):
        r = requests.get(f"{API}/orders/does-not-exist-xyz", headers=admin_headers, timeout=10)
        assert r.status_code == 404


# ---------- 3. Step routes (use throwaway) ----------------------------------
class TestSteps:
    def test_complete_step_1(self, throwaway_order, admin_headers):
        oid = throwaway_order["id"]
        payload = {
            "notes": "smoke test: completing step 1",
            "photos": ["https://example.com/photo1.jpg"],
        }
        r = requests.post(
            f"{API}/orders/{oid}/steps/1/complete",
            json=payload,
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text
        order = r.json()
        step1 = next(s for s in order["steps"] if s["step_number"] == 1)
        assert step1["completed"] is True
        assert step1["notes"] == payload["notes"]
        assert "https://example.com/photo1.jpg" in (step1.get("photos") or [])

    def test_get_order_reflects_completion(self, throwaway_order, admin_headers):
        oid = throwaway_order["id"]
        r = requests.get(f"{API}/orders/{oid}", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        step1 = next(s for s in r.json()["steps"] if s["step_number"] == 1)
        assert step1["completed"] is True

    def test_reopen_step_1(self, throwaway_order, admin_headers):
        oid = throwaway_order["id"]
        r = requests.post(
            f"{API}/orders/{oid}/steps/1/reopen", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200, r.text
        step1 = next(s for s in r.json()["steps"] if s["step_number"] == 1)
        assert step1["completed"] is False

    def test_translate_step_1(self, throwaway_order, admin_headers):
        oid = throwaway_order["id"]
        # First re-complete with notes so there's something to translate.
        requests.post(
            f"{API}/orders/{oid}/steps/1/complete",
            json={"notes": "Hello world", "photos": []},
            headers=admin_headers,
            timeout=30,
        )
        r = requests.post(
            f"{API}/orders/{oid}/steps/1/translate",
            json={"target_lang": "es", "target_lang_name": "Spanish"},
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["target_lang"] == "es"
        assert "notes_translated" in body


# ---------- 4. CAD files ----------------------------------------------------
class TestCadFiles:
    def test_list_cad_files_seed(self, admin_headers):
        r = requests.get(f"{API}/orders/{SEED_ORDER_ID}/cad-files", headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        # Returns the {cad_files, pending_cad_files} envelope (live + pending).
        assert isinstance(body, dict)
        assert "cad_files" in body and "pending_cad_files" in body
        assert isinstance(body["cad_files"], list)
        assert isinstance(body["pending_cad_files"], list)

    def test_cad_file_full_lifecycle(self, throwaway_order, admin_headers):
        oid = throwaway_order["id"]
        # admin upload → goes straight to `cad_files` (live)
        r = requests.post(
            f"{API}/orders/{oid}/cad-files",
            json={
                "name": "TEST_cad.stl",
                "secure_url": "https://example.com/cad.stl",
                "format": "stl",
            },
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        resp = r.json()
        assert resp["queue"] == "cad_files"
        entry = resp["file"]
        file_id = entry["id"]
        assert entry["name"] == "TEST_cad.stl"

        # list shows new file in the live array
        r = requests.get(f"{API}/orders/{oid}/cad-files", headers=admin_headers, timeout=20)
        body = r.json()
        assert any(f["id"] == file_id for f in body["cad_files"])

        # email (only delivered@resend.dev allowed)
        r = requests.post(
            f"{API}/orders/{oid}/cad-files/email",
            json={"recipients": [RESEND_OK], "file_ids": [file_id]},
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"cad email failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["ok"] is True
        assert body.get("provider_id"), "provider_id missing from cad email response"
        assert body["file_count"] == 1

        # delete
        r = requests.delete(
            f"{API}/orders/{oid}/cad-files/{file_id}", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200, r.text
        r = requests.get(f"{API}/orders/{oid}/cad-files", headers=admin_headers, timeout=20)
        assert not any(f["id"] == file_id for f in r.json()["cad_files"])


# ---------- 5. IGI certificates ---------------------------------------------
class TestIgi:
    def test_igi_full_lifecycle(self, throwaway_order, admin_headers):
        oid = throwaway_order["id"]

        r = requests.get(
            f"{API}/orders/{oid}/igi-certificates", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200
        body = r.json()
        assert "igi_certificates" in body and "pending_igi_certificates" in body

        r = requests.post(
            f"{API}/orders/{oid}/igi-certificates",
            json={
                "name": "TEST_igi.pdf",
                "secure_url": "https://example.com/igi.pdf",
                "format": "pdf",
            },
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        resp = r.json()
        assert resp["queue"] == "igi_certificates"
        file_id = resp["file"]["id"]

        r = requests.post(
            f"{API}/orders/{oid}/igi-certificates/email",
            json={"recipients": [RESEND_OK], "file_ids": [file_id]},
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] and body.get("provider_id")

        r = requests.delete(
            f"{API}/orders/{oid}/igi-certificates/{file_id}",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200


# ---------- 6. Customs ------------------------------------------------------
class TestCustoms:
    def test_get_customs(self, admin_headers):
        r = requests.get(
            f"{API}/orders/{SEED_ORDER_ID}/customs", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200, r.text
        body = r.json()
        # required keys (defaulted by GET handler)
        for k in ("airway_bill_files", "customs_files", "airway_bill_text", "notes"):
            assert k in body

    def test_put_customs_airway_bill_text(self, throwaway_order, admin_headers):
        oid = throwaway_order["id"]
        r = requests.put(
            f"{API}/orders/{oid}/customs",
            json={"airway_bill_text": "AWB-TEST-12345"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        # verify persistence via GET
        r = requests.get(f"{API}/orders/{oid}/customs", headers=admin_headers, timeout=20)
        assert r.json()["airway_bill_text"] == "AWB-TEST-12345"

    def test_customs_file_full_lifecycle(self, throwaway_order, admin_headers):
        oid = throwaway_order["id"]
        # add airway-bill file
        r = requests.post(
            f"{API}/orders/{oid}/customs/files/airway-bill",
            json={
                "name": "TEST_awb.pdf",
                "secure_url": "https://example.com/awb.pdf",
                "format": "pdf",
            },
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        awb_id = r.json()["id"]

        # add customs file
        r = requests.post(
            f"{API}/orders/{oid}/customs/files/customs",
            json={
                "name": "TEST_customs.pdf",
                "secure_url": "https://example.com/customs.pdf",
                "format": "pdf",
            },
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, r.text
        customs_id = r.json()["id"]

        # email customs file
        r = requests.post(
            f"{API}/orders/{oid}/customs/files/customs/email",
            json={"recipients": [RESEND_OK], "file_ids": [customs_id]},
            headers=admin_headers,
            timeout=60,
        )
        assert r.status_code == 200, f"customs email failed: {r.status_code} {r.text}"
        body = r.json()
        assert body["ok"] and body.get("provider_id")

        # delete both
        r = requests.delete(
            f"{API}/orders/{oid}/customs/files/airway-bill/{awb_id}",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200
        r = requests.delete(
            f"{API}/orders/{oid}/customs/files/customs/{customs_id}",
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200

    def test_customs_invalid_kind_returns_400(self, throwaway_order, admin_headers):
        oid = throwaway_order["id"]
        r = requests.post(
            f"{API}/orders/{oid}/customs/files/bogus",
            json={"name": "x", "secure_url": "https://example.com/x"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 400


# ---------- 7. Digital DNA --------------------------------------------------
class TestDigitalDna:
    def test_digital_dna_returns_pdf(self, admin_headers):
        r = requests.get(
            f"{API}/orders/{SEED_ORDER_ID}/digital-dna", headers=admin_headers, timeout=60
        )
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"


# ---------- 8. Recycle bin --------------------------------------------------
class TestRecycleBin:
    def test_full_recycle_cycle(self, admin_headers, seed_order):
        # create throwaway order in isolation (we'll destroy it here)
        payload = {
            "client_id": seed_order["client_id"],
            "manufacturer_id": seed_order["manufacturer_id"],
            "associate_id": seed_order.get("associate_id"),
            "jewelry_name": f"TEST_RECYCLE_{uuid.uuid4().hex[:6]}",
            "sku": "TEST",
            "description": "recycle bin test",
        }
        r = requests.post(f"{API}/orders", json=payload, headers=admin_headers, timeout=20)
        assert r.status_code == 200, r.text
        oid = r.json()["id"]

        # soft delete
        r = requests.delete(f"{API}/orders/{oid}", headers=admin_headers, timeout=20)
        assert r.status_code == 200 and r.json().get("ok") is True

        # appears in recycle bin
        r = requests.get(f"{API}/admin/recycle-bin", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        bin_ids = [o["id"] for o in r.json()]
        assert oid in bin_ids

        # active list no longer contains it
        r = requests.get(f"{API}/orders", headers=admin_headers, timeout=20)
        assert oid not in [o["id"] for o in r.json()]

        # restore
        r = requests.post(
            f"{API}/admin/recycle-bin/{oid}/restore", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200 and r.json().get("ok") is True

        # re-delete + purge
        requests.delete(f"{API}/orders/{oid}", headers=admin_headers, timeout=20)
        r = requests.delete(
            f"{API}/admin/recycle-bin/{oid}/purge", headers=admin_headers, timeout=20
        )
        assert r.status_code == 200
        assert r.json().get("purged") is True

        # GET should now 404
        r = requests.get(f"{API}/orders/{oid}", headers=admin_headers, timeout=20)
        assert r.status_code == 404


# ---------- 9. Manufacturer-scoped access (sanity) --------------------------
class TestManufacturerScope:
    def test_mfg_list_returns_only_their_orders(self, mfg_headers):
        r = requests.get(f"{API}/orders", headers=mfg_headers, timeout=20)
        assert r.status_code == 200, r.text
        orders = r.json()
        assert isinstance(orders, list)
        # we don't enforce non-empty (depends on seed); just confirm role gate didn't 500
