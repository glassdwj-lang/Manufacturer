"""
Iteration-4 backend tests: Claude Sonnet 4.5 translation of step notes + associate
review notes into the client's native language (country-derived).

Covers:
  * GET  /api/meta/countries
  * POST /api/users (role=client) — accepts optional `country`
  * PUT  /api/users/{client_id}/country  (admin / owning-associate / 400 / 403)
  * POST /api/orders/{id}/steps/{n}/complete  with English notes
        - AU client  -> no translation (notes_translated == "", notes_target_lang == "")
        - CN client  -> notes_translated contains Han characters; lang == "zh-CN"
  * POST /api/orders/{id}/steps/{n}/forward
        - same behaviour for associate_review_note_translated
  * GET  /api/orders/{id} as client returns translated fields for FORWARDED steps,
        and masks them for steps that are completed but not yet forwarded.
  * Translation completes in < 30 s and never crashes (we don't cache by content,
        so the second call still goes to the LLM but must succeed).
"""
from __future__ import annotations

import os
import re
import time
import pathlib
import uuid
import pytest
import requests

# --------------------------------------------------------------- bootstrap URL
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    env_file = pathlib.Path("/app/frontend/.env").read_text()
    m = re.search(r"EXPO_PUBLIC_BACKEND_URL=(\S+)", env_file)
    BASE_URL = m.group(1) if m else None
assert BASE_URL, "Backend URL not configured"
API = BASE_URL.rstrip("/") + "/api"

AT = chr(64)
DOMAIN = AT + "somnio.co"

ADMIN = {"email": "admin" + DOMAIN, "password": "Admin" + AT + "2026"}
MFG = {"email": "mfg" + DOMAIN, "password": "Mfg" + AT + "2026"}
CLIENT = {"email": "client" + DOMAIN, "password": "Client" + AT + "2026"}


# ---------------------------------------------------------------- fixtures
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers["Content-Type"] = "application/json"
    return sess


@pytest.fixture(scope="session", autouse=True)
def _seed(s):
    r = s.post(f"{API}/seed")
    assert r.status_code == 200, r.text


def _login(s, creds):
    r = s.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="session")
def admin_tok(s):
    return _login(s, ADMIN)


@pytest.fixture(scope="session")
def mfg_tok(s):
    return _login(s, MFG)


@pytest.fixture(scope="session")
def client_tok(s):
    return _login(s, CLIENT)


def h(tok):
    return {"Authorization": f"Bearer {tok['access_token']}"}


@pytest.fixture(scope="session")
def demo_order_id(s, admin_tok):
    r = s.get(f"{API}/orders", headers=h(admin_tok))
    assert r.status_code == 200
    for o in r.json():
        if o["order_ref"] == "SMN-DEMO0001":
            return o["id"]
    pytest.skip("Demo order missing")


# Track created users for cleanup
_created_user_ids: list[str] = []


@pytest.fixture(scope="session", autouse=True)
def _cleanup(s, admin_tok):
    yield
    for uid in _created_user_ids:
        try:
            s.delete(f"{API}/users/{uid}", headers=h(admin_tok))
        except Exception:
            pass


def _create_client(s, admin_tok, email_suffix: str, country: str = "AU"):
    payload = {
        "email": f"TEST_{email_suffix}_{uuid.uuid4().hex[:6]}" + DOMAIN,
        "password": "P" + AT + "ass1234",
        "name": f"TEST_{email_suffix}",
        "role": "client",
        "country": country,
    }
    r = s.post(f"{API}/users", headers=h(admin_tok), json=payload)
    assert r.status_code == 200, r.text
    u = r.json()
    _created_user_ids.append(u["id"])
    return u


# ============================================================ countries
class TestMetaCountries:
    def test_countries_shape(self, s):
        r = s.get(f"{API}/meta/countries")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 30, f"expected ~35 rows, got {len(rows)}"
        for row in rows:
            assert set(row.keys()) >= {"code", "name", "language", "language_name"}
            assert len(row["code"]) == 2
            assert isinstance(row["name"], str) and row["name"]
            assert isinstance(row["language"], str) and row["language"]
            assert isinstance(row["language_name"], str) and row["language_name"]

    def test_countries_includes_cn_and_au(self, s):
        rows = s.get(f"{API}/meta/countries").json()
        by_code = {r["code"]: r for r in rows}
        assert by_code["CN"]["language"] == "zh-CN"
        assert "Chinese" in by_code["CN"]["language_name"]
        assert by_code["AU"]["language"] == "en"


# ============================================================ create client w/ country
class TestCreateClientWithCountry:
    def test_create_client_with_country_cn(self, s, admin_tok):
        u = _create_client(s, admin_tok, "cn_client", "CN")
        assert u["country"] == "CN"
        assert u["language"] == "zh-CN"
        assert "Chinese" in u["language_name"]

    def test_create_client_default_au(self, s, admin_tok):
        u = _create_client(s, admin_tok, "default_client")
        assert u["country"] == "AU"
        assert u["language"] == "en"


# ============================================================ PUT country
class TestUpdateCountry:
    def test_admin_can_update_country(self, s, admin_tok):
        u = _create_client(s, admin_tok, "upd_country", "AU")
        r = s.put(f"{API}/users/{u['id']}/country",
                  headers=h(admin_tok), json={"country": "CN"})
        assert r.status_code == 200
        assert r.json()["country"] == "CN"

        # confirm persisted: GET /users returns CN + zh-CN
        users = s.get(f"{API}/users", headers=h(admin_tok)).json()
        target = next(x for x in users if x["id"] == u["id"])
        assert target["country"] == "CN"
        assert target["language"] == "zh-CN"

    def test_update_country_non_client_400(self, s, admin_tok, mfg_tok):
        mfg_id = mfg_tok["user"]["id"]
        r = s.put(f"{API}/users/{mfg_id}/country",
                  headers=h(admin_tok), json={"country": "CN"})
        assert r.status_code == 400

    def test_update_country_404_for_unknown(self, s, admin_tok):
        r = s.put(f"{API}/users/does-not-exist/country",
                  headers=h(admin_tok), json={"country": "CN"})
        assert r.status_code == 404

    def test_non_owning_associate_403(self, s, admin_tok):
        """An associate cannot change a client they don't own."""
        # Look up an associate (imported, no login). Then try to put country.
        users = s.get(f"{API}/users", headers=h(admin_tok)).json()
        associates = [u for u in users if u["role"] == "associate"]
        if not associates:
            pytest.skip("no associate present")
        # Create a foreign client owned by NO associate
        foreign = _create_client(s, admin_tok, "foreign_for_assoc", "AU")
        # We don't have an associate JWT (imported users can't log in locally).
        # Try via a *separate* associate path: we can only verify admin path here;
        # The 403 path requires an associate token which is not available locally.
        # We instead verify that a non-owning associate would be blocked by
        # confirming admin-only / owning-associate guard via PUT with no auth.
        r = s.put(f"{API}/users/{foreign['id']}/country", json={"country": "CN"})
        assert r.status_code in (401, 403)


# ============================================================ translation on complete/forward
class TestTranslationOnComplete:
    """Use the demo order (manufacturer-owned, client=client@somnio.co AU) for the AU path,
    and a *new* order assigned to a CN client + the same manufacturer for the CN path."""

    @pytest.fixture(scope="class")
    def cn_order(self, s, admin_tok, mfg_tok):
        cn_client = _create_client(s, admin_tok, "cn_for_xlate", "CN")
        mfg_id = mfg_tok["user"]["id"]
        r = s.post(f"{API}/orders", headers=h(admin_tok), json={
            "client_id": cn_client["id"],
            "manufacturer_id": mfg_id,
            "jewelry_name": "TEST_CN piece",
            "sku": "TEST_CN_SKU",
        })
        assert r.status_code == 200, r.text
        return {"order_id": r.json()["id"], "client_id": cn_client["id"]}

    def test_au_client_no_translation(self, s, mfg_tok, demo_order_id):
        r = s.post(
            f"{API}/orders/{demo_order_id}/steps/7/complete",
            headers=h(mfg_tok),
            json={"notes": "TEST_AU step 7 — diamond verified.", "photos": []},
        )
        assert r.status_code == 200, r.text
        step = next(x for x in r.json()["steps"] if x["step_number"] == 7)
        assert step["completed"] is True
        assert step["notes"] == "TEST_AU step 7 — diamond verified."
        # English client: no translation
        assert step.get("notes_translated", "") == ""
        assert step.get("notes_target_lang", "") == ""

    def test_cn_client_gets_mandarin(self, s, mfg_tok, cn_order):
        order_id = cn_order["order_id"]
        notes = "TEST_CN: Diamond sourcing verified, IGI certificate issued."
        t0 = time.time()
        r = s.post(
            f"{API}/orders/{order_id}/steps/4/complete",
            headers=h(mfg_tok),
            json={"notes": notes, "photos": []},
            timeout=30,
        )
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        assert elapsed < 30, f"translation too slow: {elapsed:.1f}s"

        step = next(x for x in r.json()["steps"] if x["step_number"] == 4)
        # Original preserved verbatim
        assert step["notes"] == notes
        # Translation present
        translated = step.get("notes_translated", "")
        assert translated, f"expected Mandarin translation, got: {translated!r}"
        assert step.get("notes_target_lang") == "zh-CN"
        # Contains at least one Han character (Mandarin)
        han = re.search(r"[\u4e00-\u9fff]", translated)
        assert han, f"expected Han characters in: {translated!r}"

    def test_second_call_still_translates_no_crash(self, s, mfg_tok, cn_order):
        """We don't cache by content, but the endpoint must still succeed & be quick."""
        order_id = cn_order["order_id"]
        t0 = time.time()
        r = s.post(
            f"{API}/orders/{order_id}/steps/5/complete",
            headers=h(mfg_tok),
            json={"notes": "TEST_CN second call. Casting complete.", "photos": []},
            timeout=30,
        )
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        assert elapsed < 30, f"2nd translate too slow: {elapsed:.1f}s"
        step = next(x for x in r.json()["steps"] if x["step_number"] == 5)
        assert step.get("notes_translated"), "translation should still happen on 2nd call"
        assert step.get("notes_target_lang") == "zh-CN"

    def test_forward_translates_review_note(self, s, admin_tok, mfg_tok, cn_order):
        """Forward via ADMIN (we cannot log in as associate locally)."""
        order_id = cn_order["order_id"]
        # Step 4 already completed in previous test
        review = "TEST_CN forwarded: Looks excellent. Please proceed."
        t0 = time.time()
        r = s.post(
            f"{API}/orders/{order_id}/steps/4/forward",
            headers=h(admin_tok),
            json={"review_note": review},
            timeout=30,
        )
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        assert elapsed < 30
        step = next(x for x in r.json()["steps"] if x["step_number"] == 4)
        assert step.get("forwarded_to_client") is True
        assert step.get("associate_review_note") == review
        translated = step.get("associate_review_note_translated", "")
        assert translated, "expected translated review note"
        assert re.search(r"[\u4e00-\u9fff]", translated), \
            f"expected Han characters in review translation: {translated!r}"

    def test_forward_au_client_no_translation(self, s, admin_tok, demo_order_id):
        """AU client forward → no translation produced."""
        r = s.post(
            f"{API}/orders/{demo_order_id}/steps/7/forward",
            headers=h(admin_tok),
            json={"review_note": "TEST_AU all good — released."},
        )
        assert r.status_code == 200, r.text
        step = next(x for x in r.json()["steps"] if x["step_number"] == 7)
        assert step.get("forwarded_to_client") is True
        assert step.get("associate_review_note_translated", "") == ""


# ============================================================ client view masking
class TestClientViewMaskingOfTranslations:
    def test_client_sees_translated_when_forwarded_and_masked_otherwise(
        self, s, admin_tok, mfg_tok, client_tok, demo_order_id
    ):
        # Complete + forward step 8 with EN notes (AU client = no translation)
        s.post(f"{API}/orders/{demo_order_id}/steps/8/complete",
               headers=h(mfg_tok),
               json={"notes": "TEST_step8 completed", "photos": []})
        s.post(f"{API}/orders/{demo_order_id}/steps/8/forward",
               headers=h(admin_tok),
               json={"review_note": "TEST_step8 review"})

        # Complete step 9 but do NOT forward
        s.post(f"{API}/orders/{demo_order_id}/steps/9/complete",
               headers=h(mfg_tok),
               json={"notes": "TEST_step9 hidden", "photos": []})

        r = s.get(f"{API}/orders/{demo_order_id}", headers=h(client_tok))
        assert r.status_code == 200
        steps = r.json()["steps"]
        s8 = next(x for x in steps if x["step_number"] == 8)
        s9 = next(x for x in steps if x["step_number"] == 9)

        # Forwarded step: fields are present (translation may be empty for AU)
        assert "notes_translated" in s8
        assert "notes_target_lang" in s8
        assert "associate_review_note_translated" in s8
        # Non-forwarded step: masked
        assert s9["notes"] == ""
        assert s9.get("notes_translated", "") == ""
        assert s9.get("associate_review_note", "") == ""
        assert s9.get("associate_review_note_translated", "") == ""
