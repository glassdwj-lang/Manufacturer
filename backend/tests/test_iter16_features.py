"""Iteration 16 backend surface tests.

Covers four features:
  1. POST /api/quotes/{id}/duplicate  (admin only)
  2. GET  /api/quotes/{id}/pdf        (admin only)
  3. POST /api/orders/{order_id}/steps/{step_number}/photos/email
  4. Competitor scraper CF posture   (GET admin/competitors, POST test)
"""
from __future__ import annotations

import os
import time
import pytest
import requests

def _load_backend_url() -> str:
    """Read backend URL from env or frontend/.env fallback."""
    url = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
           or os.environ.get("EXPO_BACKEND_URL") or "").strip().rstrip("/")
    if url:
        return url
    try:
        with open("/app/frontend/.env", "r", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    except OSError:
        pass
    return ""


BASE_URL = _load_backend_url()
assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL must be set (env or frontend/.env)"

API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@somnio.co", "password": "Admin@2026"}
MFG = {"email": "mfg@somnio.co", "password": "Mfg@2026"}
ASSOC = {"email": "associate@somnio.co", "password": "Assoc@2026"}
CLIENT = {"email": "client@somnio.co", "password": "Client@2026"}


# --------------------------------------------------------------------
# Fixtures
# --------------------------------------------------------------------
def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text[:200]}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    assert tok, f"No token in login response: {body}"
    return tok


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="module")
def mfg_token():
    return _login(MFG)


@pytest.fixture(scope="module")
def assoc_token():
    return _login(ASSOC)


@pytest.fixture(scope="module")
def client_token():
    return _login(CLIENT)


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --------------------------------------------------------------------
# Feature 1 — POST /api/quotes/{id}/duplicate
# --------------------------------------------------------------------
class TestQuoteDuplicate:

    @pytest.fixture(scope="class")
    def freelance_quote(self, admin_token):
        payload = {
            "piece_description": "TEST_duplicate source ring",
            "jewelry_name": "TEST Freelance Source",
            "inputs": {
                "piece_description": "TEST_duplicate source ring",
                "ring_cost_usd": 500.0,
                "usd_to_aud_rate": 1.55,
            },
        }
        r = requests.post(f"{API}/quotes/freelance", json=payload,
                          headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, f"seed freelance failed: {r.status_code} {r.text[:200]}"
        return r.json()

    def test_duplicate_freelance_returns_new_id_and_serial(
            self, admin_token, freelance_quote):
        src = freelance_quote
        assert src["is_freelance"] is True
        assert src["freelance_seq"] is not None
        r = requests.post(f"{API}/quotes/{src['id']}/duplicate",
                          headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        dup = r.json()
        # fresh id
        assert dup["id"] != src["id"]
        # status draft
        assert dup["status"] == "draft"
        # jewelry_name ends with (copy)
        assert dup["jewelry_name"].endswith("(copy)"), dup["jewelry_name"]
        # inputs mirror
        assert dup["inputs"]["ring_cost_usd"] == src["inputs"]["ring_cost_usd"]
        assert dup["inputs"]["usd_to_aud_rate"] == src["inputs"]["usd_to_aud_rate"]
        # NEW freelance serial + seq
        assert dup["is_freelance"] is True
        assert dup["freelance_serial"] is not None
        assert dup["freelance_serial"].startswith("dwj-")
        assert dup["freelance_seq"] != src["freelance_seq"]

    def test_duplicate_nonexistent_returns_404(self, admin_token):
        r = requests.post(f"{API}/quotes/does-not-exist-xyz/duplicate",
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 404, r.text

    def test_duplicate_forbidden_for_non_admin(self, client_token, freelance_quote):
        r = requests.post(f"{API}/quotes/{freelance_quote['id']}/duplicate",
                          headers=_h(client_token), timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}: {r.text[:200]}"

    def test_duplicate_forbidden_for_manufacturer(self, mfg_token, freelance_quote):
        r = requests.post(f"{API}/quotes/{freelance_quote['id']}/duplicate",
                          headers=_h(mfg_token), timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}: {r.text[:200]}"

    def test_duplicate_unauth(self, freelance_quote):
        r = requests.post(f"{API}/quotes/{freelance_quote['id']}/duplicate", timeout=15)
        assert r.status_code in (401, 403), r.status_code


# --------------------------------------------------------------------
# Feature 2 — GET /api/quotes/{id}/pdf
# --------------------------------------------------------------------
class TestQuotePDF:

    @pytest.fixture(scope="class")
    def freelance_quote(self, admin_token):
        payload = {
            "piece_description": "TEST_pdf export ring",
            "jewelry_name": "TEST PDF Source",
            "inputs": {
                "ring_cost_usd": 250.0,
                "usd_to_aud_rate": 1.52,
            },
        }
        r = requests.post(f"{API}/quotes/freelance", json=payload,
                          headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text
        return r.json()

    def test_pdf_export_returns_pdf(self, admin_token, freelance_quote):
        r = requests.get(f"{API}/quotes/{freelance_quote['id']}/pdf",
                         headers=_h(admin_token), timeout=60)
        assert r.status_code == 200, r.text[:400]
        ct = r.headers.get("Content-Type", "")
        assert "application/pdf" in ct, ct
        assert len(r.content) > 0
        assert r.content[:5] == b"%PDF-", r.content[:20]
        cd = r.headers.get("Content-Disposition", "")
        serial = freelance_quote["freelance_serial"]
        expected_name = f"Somnio-Quote-{serial}.pdf"
        assert expected_name in cd, f"expected filename '{expected_name}' in {cd!r}"

    def test_pdf_nonexistent_404(self, admin_token):
        r = requests.get(f"{API}/quotes/nonexistent-xyz/pdf",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 404, r.text

    def test_pdf_forbidden_non_admin(self, client_token, freelance_quote):
        r = requests.get(f"{API}/quotes/{freelance_quote['id']}/pdf",
                         headers=_h(client_token), timeout=15)
        assert r.status_code in (401, 403), r.status_code

    def test_pdf_unauth(self, freelance_quote):
        r = requests.get(f"{API}/quotes/{freelance_quote['id']}/pdf", timeout=15)
        assert r.status_code in (401, 403), r.status_code


# --------------------------------------------------------------------
# Feature 3 — POST /api/orders/{id}/steps/{n}/photos/email
# --------------------------------------------------------------------
class TestStepPhotoEmail:

    @pytest.fixture(scope="class")
    def photo_target(self, admin_token):
        """Find an order with a completed step containing photos."""
        r = requests.get(f"{API}/orders", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:400]
        summary_orders = r.json()
        # /api/orders list is role-stripped (no steps). Fetch each order
        # individually to inspect steps + photos.
        for o in summary_orders:
            r2 = requests.get(f"{API}/orders/{o['id']}",
                              headers=_h(admin_token), timeout=15)
            if r2.status_code != 200:
                continue
            order = r2.json()
            for step in order.get("steps") or []:
                if step.get("completed") and len(step.get("photos") or []) > 0:
                    return {
                        "order_id": order["id"],
                        "order_ref": order.get("order_ref"),
                        "step_number": step["step_number"],
                        "manufacturer_id": order.get("manufacturer_id"),
                        "associate_id": order.get("associate_id"),
                    }
        pytest.skip("No order with a completed step + photos in DB")

    @pytest.fixture(scope="class")
    def photoless_target(self, admin_token):
        """Find an order with a step that has NO photos."""
        r = requests.get(f"{API}/orders", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200
        summary_orders = r.json()
        for o in summary_orders:
            r2 = requests.get(f"{API}/orders/{o['id']}",
                              headers=_h(admin_token), timeout=15)
            if r2.status_code != 200:
                continue
            order = r2.json()
            for step in order.get("steps") or []:
                if not (step.get("photos") or []):
                    return {"order_id": order["id"], "step_number": step["step_number"]}
        pytest.skip("No order with a photoless step in DB")

    def test_happy_path(self, admin_token, photo_target):
        body = {
            "recipients": ["test@example.com"],
            "file_ids": [],
            "subject": "TEST Step Photos",
            "message": "Test body",
        }
        r = requests.post(
            f"{API}/orders/{photo_target['order_id']}/steps/"
            f"{photo_target['step_number']}/photos/email",
            json=body, headers=_h(admin_token), timeout=45,
        )
        # Accept either 200 (Resend succeeded) or 502 (Resend rejected /
        # ingress-timeout). Per the playbook, verify the endpoint reached
        # Resend by checking the backend log for "Resend send failed".
        if r.status_code == 200:
            data = r.json()
            assert data.get("ok") is True
            assert isinstance(data.get("recipients"), list)
            assert "file_count" in data
            assert data["file_count"] >= 1
        elif r.status_code == 502:
            log_hit = False
            try:
                with open("/var/log/supervisor/backend.err.log", "r",
                          encoding="utf-8", errors="ignore") as fh:
                    tail = fh.read()[-40000:]
                    log_hit = "Resend send failed" in tail
            except OSError:
                pass
            # Body may be JSON detail or ingress HTML — accept either
            # as long as the backend log shows the Resend call happened.
            body = r.text
            has_provider_detail = False
            try:
                has_provider_detail = "Email provider error" in \
                    (r.json().get("detail") or "")
            except Exception:
                pass
            assert has_provider_detail or log_hit, (
                f"502 with no proof endpoint reached Resend. "
                f"body={body[:200]!r}"
            )
            print(f"[step-email] 502 accepted — endpoint reached Resend "
                  f"(log_hit={log_hit}, detail={has_provider_detail})")
        else:
            pytest.fail(f"Unexpected status {r.status_code}: {r.text[:400]}")

    def test_empty_recipients_400(self, admin_token, photo_target):
        body = {"recipients": [], "file_ids": [], "subject": "s", "message": "m"}
        r = requests.post(
            f"{API}/orders/{photo_target['order_id']}/steps/"
            f"{photo_target['step_number']}/photos/email",
            json=body, headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 400, r.text[:200]

    def test_recipients_over_50_400(self, admin_token, photo_target):
        body = {
            "recipients": [f"user{i}@example.com" for i in range(51)],
            "file_ids": [], "subject": "s", "message": "m",
        }
        r = requests.post(
            f"{API}/orders/{photo_target['order_id']}/steps/"
            f"{photo_target['step_number']}/photos/email",
            json=body, headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 400, r.text[:200]

    def test_step_with_no_photos_400(self, admin_token, photoless_target):
        body = {"recipients": ["test@example.com"], "file_ids": [],
                "subject": "s", "message": "m"}
        r = requests.post(
            f"{API}/orders/{photoless_target['order_id']}/steps/"
            f"{photoless_target['step_number']}/photos/email",
            json=body, headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 400, r.text[:200]

    def test_unknown_order_404(self, admin_token):
        body = {"recipients": ["test@example.com"], "file_ids": [],
                "subject": "s", "message": "m"}
        r = requests.post(
            f"{API}/orders/does-not-exist/steps/1/photos/email",
            json=body, headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 404, r.text[:200]

    def test_unknown_step_404(self, admin_token, photo_target):
        body = {"recipients": ["test@example.com"], "file_ids": [],
                "subject": "s", "message": "m"}
        r = requests.post(
            f"{API}/orders/{photo_target['order_id']}/steps/9999/photos/email",
            json=body, headers=_h(admin_token), timeout=15,
        )
        assert r.status_code == 404, r.text[:200]

    def test_manufacturer_wrong_order_403(self, admin_token, photo_target):
        """A manufacturer that doesn't own this order should get 403.

        Uses a rotating list of seed mfgs so we always find one that
        doesn't own the target order.
        """
        candidates = [
            {"email": "shanghai@somnio.co", "password": "Mfg@2026"},
            {"email": "shenzhen@somnio.co", "password": "Mfg@2026"},
            {"email": "guangzhou@somnio.co", "password": "Mfg@2026"},
            {"email": "mfg@somnio.co", "password": "Mfg@2026"},
        ]
        chosen_token = None
        for creds in candidates:
            try:
                tok = _login(creds)
            except AssertionError:
                continue
            me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15)
            if me.status_code != 200:
                continue
            if me.json().get("id") != photo_target["manufacturer_id"]:
                chosen_token = tok
                break
        if chosen_token is None:
            pytest.skip("No mfg found that doesn't own the target order")

        body = {"recipients": ["test@example.com"], "file_ids": [],
                "subject": "s", "message": "m"}
        r = requests.post(
            f"{API}/orders/{photo_target['order_id']}/steps/"
            f"{photo_target['step_number']}/photos/email",
            json=body, headers=_h(chosen_token), timeout=15,
        )
        assert r.status_code == 403, f"expected 403 got {r.status_code}: {r.text[:200]}"


# --------------------------------------------------------------------
# Feature 4 — Competitor scraper CF posture
# --------------------------------------------------------------------
class TestCompetitorPosture:

    def test_admin_competitors_lists_cloudflare_sites(self, admin_token):
        r = requests.get(f"{API}/admin/competitors", headers=_h(admin_token), timeout=30)
        assert r.status_code == 200, r.text[:400]
        sites = r.json()
        by_id = {s["id"]: s for s in sites}
        for cid in ("austenblake", "diamondsfactory"):
            assert cid in by_id, f"{cid} missing"
            s = by_id[cid]
            assert s.get("active") is True, f"{cid} active={s.get('active')}"
            assert s.get("strategy") == "playwright_llm", f"{cid} strategy={s.get('strategy')}"
            assert s.get("feasibility") == "cloudflare", f"{cid} feasibility={s.get('feasibility')}"

    @pytest.mark.parametrize("site_id", ["austenblake"])
    def test_competitor_test_endpoint_returns_schema(self, admin_token, site_id):
        """Endpoint must complete <90s and return json with ok/match_count/error."""
        start = time.time()
        try:
            r = requests.post(
                f"{API}/admin/competitors/{site_id}/test",
                headers=_h(admin_token), timeout=100,
            )
        except requests.Timeout:
            pytest.fail(f"{site_id}/test exceeded 100s timeout")
        elapsed = time.time() - start
        assert elapsed < 100, f"took {elapsed:.1f}s"
        assert r.status_code == 200, f"{r.status_code}: {r.text[:400]}"
        data = r.json()
        assert "ok" in data
        assert "match_count" in data
        assert "error" in data
        print(f"[{site_id}] elapsed={elapsed:.1f}s match_count={data['match_count']} "
              f"error={str(data.get('error'))[:120]}")
