"""Iteration-6 backend tests: P0 language-refresh bug fix + P1 regressions.

Tests:
  * Login works for the 4 seed roles.
  * PUT /api/users/me/language accepts en/zh/fr/it, rejects invalid, accepts null.
  * GET /api/orders returns step titles localized to the viewer's preferred_language
    (the bug fix — key-mismatch zh -> zh-CN).
  * POST /api/orders/{id}/steps/{n}/translate returns notes_translated when a note exists.
  * Recycle bin listing + restore + purge still works.
  * Customs PUT/GET still works for admin.
  * Digital DNA GET still returns a PDF stream.
"""
from __future__ import annotations

import os
import re
import pathlib
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    env_file = pathlib.Path("/app/frontend/.env").read_text()
    m = re.search(r"EXPO_PUBLIC_BACKEND_URL=(\S+)", env_file)
    BASE_URL = m.group(1) if m else None
assert BASE_URL, "Backend URL not configured"
API = BASE_URL.rstrip("/") + "/api"

AT = chr(64)
DOMAIN = AT + "somnio.co"
CREDS = {
    "admin":        {"email": "admin" + DOMAIN,     "password": "Admin" + AT + "2026"},
    "manufacturer": {"email": "mfg" + DOMAIN,       "password": "Mfg" + AT + "2026"},
    "associate":    {"email": "associate" + DOMAIN, "password": "Assoc" + AT + "2026"},
    "client":       {"email": "client" + DOMAIN,    "password": "Client" + AT + "2026"},
}


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers["Content-Type"] = "application/json"
    return sess


@pytest.fixture(scope="session", autouse=True)
def _seed(s):
    r = s.post(f"{API}/seed")
    assert r.status_code == 200, r.text


@pytest.fixture(scope="session")
def tokens(s):
    out = {}
    for role, c in CREDS.items():
        r = s.post(f"{API}/auth/login", json=c)
        assert r.status_code == 200, f"{role}: {r.text}"
        out[role] = r.json()
    return out


def h(tok):
    return {"Authorization": f"Bearer {tok['access_token']}"}


# ------------------------------------------------------------ #1 login
def test_login_all_four_roles(tokens):
    for role in CREDS:
        assert tokens[role]["access_token"]
        assert tokens[role]["user"]["role"] == role


# ------------------------------------------------------------ #2 set language
class TestSetLanguage:
    def _set(self, s, tokens, role, lang):
        return s.put(
            f"{API}/users/me/language",
            headers=h(tokens[role]),
            json={"language": lang},
        )

    @pytest.mark.parametrize("lang", ["en", "zh", "fr", "it"])
    def test_set_supported(self, s, tokens, lang):
        r = self._set(s, tokens, "admin", lang)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["preferred_language"] == lang

    def test_set_invalid_returns_400(self, s, tokens):
        r = self._set(s, tokens, "admin", "jp")
        assert r.status_code == 400

    def test_clear_with_null(self, s, tokens):
        # First set, then clear
        self._set(s, tokens, "admin", "fr")
        r = s.put(
            f"{API}/users/me/language",
            headers=h(tokens["admin"]),
            json={"language": None},
        )
        assert r.status_code == 200
        assert r.json()["preferred_language"] in (None, "")

    def test_clear_with_empty_string(self, s, tokens):
        r = s.put(
            f"{API}/users/me/language",
            headers=h(tokens["admin"]),
            json={"language": ""},
        )
        assert r.status_code == 200


# ------------------------------------------------------------ #3 P0 BUG FIX
# Orders list must localize step titles when preferred_language is set.
class TestOrdersLocalizedByPreferredLanguage:
    def _set_lang(self, s, tokens, role, lang):
        r = s.put(f"{API}/users/me/language",
                  headers=h(tokens[role]),
                  json={"language": lang})
        assert r.status_code == 200, r.text

    def _list_orders(self, s, tokens, role):
        r = s.get(f"{API}/orders", headers=h(tokens[role]))
        assert r.status_code == 200
        orders = r.json()
        assert len(orders) >= 1
        return orders

    def _get_step1_title(self, orders):
        # Pick any order with steps; admin sees all
        for o in orders:
            for st in o.get("steps", []):
                if st["step_number"] == 1:
                    return st["title"]
        pytest.fail("no step 1 found")

    def test_zh_localization(self, s, tokens):
        """THE BUG: with the broken code, picking zh stayed in English."""
        self._set_lang(s, tokens, "admin", "zh")
        orders = self._list_orders(s, tokens, "admin")
        title = self._get_step1_title(orders)
        # Step 1 in zh-CN pack must be 设计师识别 (Designer Identification)
        han = re.search(r"[\u4e00-\u9fff]", title)
        assert han, f"Expected Han characters in step 1 title, got: {title!r}"
        assert "设计师" in title, f"Expected '设计师' in step 1 title, got: {title!r}"

    def test_fr_localization(self, s, tokens):
        self._set_lang(s, tokens, "admin", "fr")
        orders = self._list_orders(s, tokens, "admin")
        title = self._get_step1_title(orders)
        # French step 1 should at least NOT be English
        assert title != "Designer Identification", f"FR still in English: {title!r}"
        # Must contain accented-French or French keywords
        assert any(kw in title.lower() for kw in [
            "identif", "designer", "créateur", "concepteur"
        ]), f"Unexpected FR title: {title!r}"

    def test_it_localization(self, s, tokens):
        self._set_lang(s, tokens, "admin", "it")
        orders = self._list_orders(s, tokens, "admin")
        title = self._get_step1_title(orders)
        assert title != "Designer Identification", f"IT still in English: {title!r}"
        assert any(kw in title.lower() for kw in [
            "identif", "designer", "stilista"
        ]), f"Unexpected IT title: {title!r}"

    def test_en_returns_to_english(self, s, tokens):
        self._set_lang(s, tokens, "admin", "en")
        orders = self._list_orders(s, tokens, "admin")
        title = self._get_step1_title(orders)
        assert title == "Designer Identification", f"EN should be English, got: {title!r}"

    def test_manufacturer_also_localizes(self, s, tokens):
        """Bug also applied to manufacturer — verify localization works."""
        self._set_lang(s, tokens, "manufacturer", "zh")
        orders = self._list_orders(s, tokens, "manufacturer")
        title = self._get_step1_title(orders)
        han = re.search(r"[\u4e00-\u9fff]", title)
        assert han, f"manufacturer ZH localization failed: {title!r}"
        # Reset
        self._set_lang(s, tokens, "manufacturer", "en")

    def test_cleanup_admin_lang(self, s, tokens):
        # Leave admin in English so other suites are unaffected
        r = s.put(f"{API}/users/me/language",
                  headers=h(tokens["admin"]),
                  json={"language": None})
        assert r.status_code == 200


# ------------------------------------------------------------ #4 manual translate endpoint
class TestManualTranslateEndpoint:
    @pytest.fixture(scope="class")
    def demo_order_id(self, s, tokens):
        r = s.get(f"{API}/orders", headers=h(tokens["admin"]))
        for o in r.json():
            if o["order_ref"] == "SMN-DEMO0001":
                return o["id"]
        pytest.skip("demo order missing")

    @pytest.fixture(scope="class", autouse=True)
    def _ensure_step_has_note(self, s, tokens, demo_order_id):
        # Make sure step 1 has a notes value (mfg completes it)
        r = s.post(
            f"{API}/orders/{demo_order_id}/steps/1/complete",
            headers=h(tokens["manufacturer"]),
            json={"notes": "TEST_step1 designer identified: Marie Curie.", "photos": []},
            timeout=30,
        )
        # may already be completed in earlier runs — both 200 acceptable
        assert r.status_code == 200, r.text

    def test_translate_to_zh_returns_translated(self, s, tokens, demo_order_id):
        r = s.post(
            f"{API}/orders/{demo_order_id}/steps/1/translate",
            headers=h(tokens["admin"]),
            json={"target_lang": "zh-CN", "target_lang_name": "Chinese"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "notes_translated" in data
        assert data["notes_translated"], "expected non-empty notes_translated"
        assert data["target_lang"] == "zh-CN"

    def test_translate_missing_target_400(self, s, tokens, demo_order_id):
        r = s.post(
            f"{API}/orders/{demo_order_id}/steps/1/translate",
            headers=h(tokens["admin"]),
            json={},
        )
        assert r.status_code == 400

    def test_translate_step_not_found_404(self, s, tokens, demo_order_id):
        r = s.post(
            f"{API}/orders/{demo_order_id}/steps/9999/translate",
            headers=h(tokens["admin"]),
            json={"target_lang": "zh-CN", "target_lang_name": "Chinese"},
        )
        assert r.status_code == 404


# ------------------------------------------------------------ #5 recycle bin regression
class TestRecycleBinRegression:
    def test_full_lifecycle(self, s, tokens):
        # Create a throwaway order
        client_id = tokens["client"]["user"]["id"]
        mfg_id = tokens["manufacturer"]["user"]["id"]
        r = s.post(
            f"{API}/orders",
            headers=h(tokens["admin"]),
            json={"client_id": client_id, "manufacturer_id": mfg_id,
                  "jewelry_name": "TEST_recycle_lifecycle"},
        )
        assert r.status_code == 200
        oid = r.json()["id"]

        # Soft delete via DELETE /api/orders/{id}
        r = s.delete(f"{API}/orders/{oid}", headers=h(tokens["admin"]))
        assert r.status_code == 200, r.text

        # Should appear in recycle bin
        r = s.get(f"{API}/admin/recycle-bin", headers=h(tokens["admin"]))
        assert r.status_code == 200
        bin_items = r.json()
        assert any(o["id"] == oid for o in bin_items), \
            "deleted order not in recycle bin"

        # Restore
        r = s.post(
            f"{API}/admin/recycle-bin/{oid}/restore",
            headers=h(tokens["admin"]),
        )
        assert r.status_code == 200, r.text

        # Delete again, then purge
        s.delete(f"{API}/orders/{oid}", headers=h(tokens["admin"]))
        r = s.delete(
            f"{API}/admin/recycle-bin/{oid}/purge",
            headers=h(tokens["admin"]),
        )
        assert r.status_code == 200, r.text

        # Confirm gone
        r = s.get(f"{API}/admin/recycle-bin", headers=h(tokens["admin"]))
        assert not any(o["id"] == oid for o in r.json())


# ------------------------------------------------------------ #6 customs regression
class TestCustomsRegression:
    def test_admin_put_get_customs(self, s, tokens):
        # Get demo order id
        r = s.get(f"{API}/orders", headers=h(tokens["admin"]))
        oid = next(o["id"] for o in r.json() if o["order_ref"] == "SMN-DEMO0001")

        payload = {
            "airway_bill": "data:image/png;base64,RegressionABC",
            "customs_document": "data:image/png;base64,RegressionDEF",
            "notes": "TEST_customs_regression",
        }
        r = s.put(f"{API}/orders/{oid}/customs",
                  headers=h(tokens["admin"]), json=payload)
        assert r.status_code == 200

        r = s.get(f"{API}/orders/{oid}/customs", headers=h(tokens["admin"]))
        assert r.status_code == 200
        data = r.json()
        assert data["notes"] == "TEST_customs_regression"
        assert data["airway_bill"] == payload["airway_bill"]


# ------------------------------------------------------------ #7 digital DNA regression
class TestDigitalDNARegression:
    def test_admin_get_digital_dna_pdf(self, s, tokens):
        r = s.get(f"{API}/orders", headers=h(tokens["admin"]))
        oid = next(o["id"] for o in r.json() if o["order_ref"] == "SMN-DEMO0001")

        r = s.get(
            f"{API}/orders/{oid}/digital-dna",
            headers=h(tokens["admin"]),
            timeout=60,
        )
        assert r.status_code == 200, r.text
        ctype = r.headers.get("content-type", "")
        assert "pdf" in ctype.lower(), f"expected pdf content-type, got {ctype!r}"
        # First 4 bytes of a PDF
        assert r.content[:4] == b"%PDF", \
            f"response not a PDF: starts with {r.content[:20]!r}"
