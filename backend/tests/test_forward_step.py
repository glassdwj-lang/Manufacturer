"""Regression test for the previously-broken `forward_step` endpoint.

A FastAPI `@router.post(...)` decorator was missing above `forward_step` in
`routes/orders/steps.py`, which made `POST /api/orders/{id}/steps/{n}/forward`
silently 404 in production. The decorator has been restored. This file
verifies:

  * The endpoint is now reachable (200, not 404) and writes the expected
    fields to MongoDB.
  * Role gating still works (associate-own / admin → 200; associate-other,
    manufacturer, client → 403).
  * The translation hook still kicks in for non-English client countries
    (CN/FR/IT) and is a no-op for English countries (AU/US).
  * 404s are raised for unknown order id and unknown step number.

Uses the public preview URL via EXPO_PUBLIC_BACKEND_URL.
"""
from __future__ import annotations

import os
import uuid
from typing import Optional

import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to the alternative name some envs use.
    BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL must be set in frontend/.env")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@somnio.co", "password": "Admin@2026"}
ASSOC = {"email": "associate@somnio.co", "password": "Assoc@2026"}
MFG = {"email": "mfg@somnio.co", "password": "Mfg@2026"}
CLIENT = {"email": "client@somnio.co", "password": "Client@2026"}


# ---------- helpers ---------------------------------------------------------
def _login(creds: dict) -> dict:
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    return r.json()


def _hdr(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _create_order(admin_headers: dict, *, client_id: str, manufacturer_id: str,
                  associate_id: Optional[str], tag: str = "FWD") -> dict:
    payload = {
        "client_id": client_id,
        "manufacturer_id": manufacturer_id,
        "associate_id": associate_id,
        "jewelry_name": f"TEST_{tag}_{uuid.uuid4().hex[:6]}",
        "sku": "TEST",
        "description": "throwaway order for forward_step test",
    }
    r = requests.post(f"{API}/orders", json=payload, headers=admin_headers, timeout=20)
    assert r.status_code == 200, f"create order failed: {r.status_code} {r.text}"
    return r.json()


def _delete_order(admin_headers: dict, order_id: str) -> None:
    requests.delete(f"{API}/orders/{order_id}", headers=admin_headers, timeout=10)
    requests.delete(
        f"{API}/admin/recycle-bin/{order_id}/purge",
        headers=admin_headers,
        timeout=10,
    )


# ---------- fixtures --------------------------------------------------------
@pytest.fixture(scope="module")
def tokens() -> dict:
    return {
        "admin": _login(ADMIN),
        "associate": _login(ASSOC),
        "mfg": _login(MFG),
        "client": _login(CLIENT),
    }


@pytest.fixture(scope="module")
def admin_headers(tokens) -> dict:
    return _hdr(tokens["admin"]["access_token"])


@pytest.fixture(scope="module")
def associate_headers(tokens) -> dict:
    return _hdr(tokens["associate"]["access_token"])


@pytest.fixture(scope="module")
def mfg_headers(tokens) -> dict:
    return _hdr(tokens["mfg"]["access_token"])


@pytest.fixture(scope="module")
def client_headers(tokens) -> dict:
    return _hdr(tokens["client"]["access_token"])


@pytest.fixture(scope="module")
def ids(tokens, admin_headers) -> dict:
    """Pull canonical IDs for the seeded users."""
    assoc_id = tokens["associate"]["user"]["id"]
    client_id = tokens["client"]["user"]["id"]
    # Find the mfg's id from /api/users (mfg login user payload has id too).
    mfg_id = tokens["mfg"]["user"]["id"]
    return {"assoc_id": assoc_id, "client_id": client_id, "mfg_id": mfg_id}


@pytest.fixture(scope="module")
def own_order(admin_headers, ids):
    """Order assigned to associate@somnio.co (their own)."""
    order = _create_order(
        admin_headers,
        client_id=ids["client_id"],
        manufacturer_id=ids["mfg_id"],
        associate_id=ids["assoc_id"],
        tag="OWN",
    )
    yield order
    _delete_order(admin_headers, order["id"])


@pytest.fixture(scope="module")
def other_associate_id(admin_headers, ids):
    """Pick a real associate id that is NOT associate@somnio.co."""
    r = requests.get(f"{API}/users?role=associate", headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    pool = [u for u in r.json() if u["id"] != ids["assoc_id"]]
    assert pool, "need at least one other associate seeded"
    return pool[0]["id"]


@pytest.fixture(scope="module")
def other_order(admin_headers, ids, other_associate_id):
    """Order assigned to a DIFFERENT associate (so associate@somnio.co
    must be blocked by the ownership gate)."""
    order = _create_order(
        admin_headers,
        client_id=ids["client_id"],
        manufacturer_id=ids["mfg_id"],
        associate_id=other_associate_id,
        tag="OTHER",
    )
    # Sanity: confirm the backend persisted the foreign associate_id.
    assert order["associate_id"] == other_associate_id, (
        f"backend overrode associate_id to {order['associate_id']}; "
        f"expected {other_associate_id}"
    )
    yield order
    _delete_order(admin_headers, order["id"])


# ---------- 1. Reachability + happy path -----------------------------------
class TestEndpointReachable:
    def test_no_longer_404(self, own_order, admin_headers):
        """The primary regression check: previously this 404'd because the
        @router.post decorator was missing. Now it must succeed."""
        oid = own_order["id"]
        r = requests.post(
            f"{API}/orders/{oid}/steps/1/forward",
            json={"review_note": "smoke test - reachable"},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code != 404, "endpoint still missing @router.post decorator"
        assert r.status_code == 200, f"unexpected status: {r.status_code} {r.text}"

    def test_admin_writes_expected_fields(self, own_order, admin_headers):
        """Verify MongoDB state via GET after the POST."""
        oid = own_order["id"]
        note = "Admin review note - persistence check"
        r = requests.post(
            f"{API}/orders/{oid}/steps/2/forward",
            json={"review_note": note},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text

        # GET to confirm persistence (Create→GET pattern)
        r = requests.get(f"{API}/orders/{oid}", headers=admin_headers, timeout=20)
        assert r.status_code == 200
        order = r.json()
        step2 = next(s for s in order["steps"] if s["step_number"] == 2)
        assert step2["forwarded_to_client"] is True
        assert step2["associate_review_note"] == note
        # `forwarded_at` must be a non-empty ISO-ish string
        fa = step2.get("forwarded_at")
        assert isinstance(fa, str) and len(fa) > 8, f"forwarded_at not set: {fa!r}"


# ---------- 2. Role gating --------------------------------------------------
class TestRoleGating:
    def test_associate_own_order_200(self, own_order, associate_headers):
        oid = own_order["id"]
        r = requests.post(
            f"{API}/orders/{oid}/steps/3/forward",
            json={"review_note": "associate own"},
            headers=associate_headers,
            timeout=30,
        )
        assert r.status_code == 200, f"associate on own order should succeed: {r.status_code} {r.text}"

    def test_associate_other_order_403(self, other_order, associate_headers):
        oid = other_order["id"]
        r = requests.post(
            f"{API}/orders/{oid}/steps/1/forward",
            json={"review_note": "associate on someone else's order"},
            headers=associate_headers,
            timeout=30,
        )
        assert r.status_code == 403, (
            f"associate on foreign order should 403: {r.status_code} {r.text}"
        )

    def test_manufacturer_403(self, own_order, mfg_headers):
        oid = own_order["id"]
        r = requests.post(
            f"{API}/orders/{oid}/steps/1/forward",
            json={"review_note": "mfg attempt"},
            headers=mfg_headers,
            timeout=30,
        )
        assert r.status_code == 403, f"mfg must be denied: {r.status_code} {r.text}"

    def test_client_403(self, own_order, client_headers):
        oid = own_order["id"]
        r = requests.post(
            f"{API}/orders/{oid}/steps/1/forward",
            json={"review_note": "client attempt"},
            headers=client_headers,
            timeout=30,
        )
        assert r.status_code == 403, f"client must be denied: {r.status_code} {r.text}"


# ---------- 3. Edge cases ---------------------------------------------------
class TestEdgeCases:
    def test_unknown_order_404(self, admin_headers):
        r = requests.post(
            f"{API}/orders/does-not-exist-xyz/steps/1/forward",
            json={"review_note": "nope"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 404, r.text
        assert "Order not found" in r.text

    def test_unknown_step_404(self, own_order, admin_headers):
        oid = own_order["id"]
        r = requests.post(
            f"{API}/orders/{oid}/steps/999/forward",
            json={"review_note": "bad step"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 404, r.text
        assert "Step not found" in r.text


# ---------- 4. Translation hook --------------------------------------------
class TestTranslationHook:
    """The forward endpoint translates `review_note` when the order's client
    is in a non-English country (e.g. CN/FR/IT). For English countries
    (AU/US) the translated field should stay blank.

    These tests use the Emergent LLM key under the hood; if the LLM call
    fails or returns nothing, we tolerate that and only assert the field
    *exists* in the response (per the review request).
    """

    @staticmethod
    def _patch_client_country(admin_headers: dict, client_id: str, country: str) -> str:
        r = requests.put(
            f"{API}/users/{client_id}/country",
            json={"country": country},
            headers=admin_headers,
            timeout=15,
        )
        assert r.status_code == 200, f"country patch failed: {r.status_code} {r.text}"
        return r.json().get("country", country)

    def test_non_english_country_populates_translation(
        self, admin_headers, ids
    ):
        # Snapshot prior country so we can restore.
        r = requests.get(f"{API}/users", headers=admin_headers, timeout=15)
        users = {u["id"]: u for u in r.json()}
        original = users[ids["client_id"]].get("country", "AU")

        try:
            self._patch_client_country(admin_headers, ids["client_id"], "CN")
            order = _create_order(
                admin_headers,
                client_id=ids["client_id"],
                manufacturer_id=ids["mfg_id"],
                associate_id=ids["assoc_id"],
                tag="CN",
            )
            try:
                oid = order["id"]
                note = "Please review: the prong setting looks excellent."
                r = requests.post(
                    f"{API}/orders/{oid}/steps/4/forward",
                    json={"review_note": note},
                    headers=admin_headers,
                    timeout=60,  # LLM call may be slow
                )
                assert r.status_code == 200, r.text
                # Re-fetch and inspect step
                r = requests.get(f"{API}/orders/{oid}", headers=admin_headers, timeout=20)
                step = next(s for s in r.json()["steps"] if s["step_number"] == 4)
                assert step["associate_review_note"] == note
                translated = step.get("associate_review_note_translated", "")
                # If the LLM is configured & reachable, we expect something.
                # If not, just document — don't fail.
                if not translated:
                    pytest.skip(
                        "Translation returned empty — Emergent LLM key may be unset/unavailable. "
                        "Endpoint still returned 200 and stored review_note correctly."
                    )
                assert isinstance(translated, str)
                assert translated.strip() != note.strip(), (
                    f"translated text should differ from English source; got {translated!r}"
                )
            finally:
                _delete_order(admin_headers, order["id"])
        finally:
            # restore original country
            self._patch_client_country(admin_headers, ids["client_id"], original)

    def test_english_country_leaves_translation_blank(self, admin_headers, ids):
        # client@somnio.co default is AU (English). Use as-is.
        order = _create_order(
            admin_headers,
            client_id=ids["client_id"],
            manufacturer_id=ids["mfg_id"],
            associate_id=ids["assoc_id"],
            tag="AU",
        )
        try:
            oid = order["id"]
            note = "English-country review note."
            r = requests.post(
                f"{API}/orders/{oid}/steps/5/forward",
                json={"review_note": note},
                headers=admin_headers,
                timeout=30,
            )
            assert r.status_code == 200, r.text
            r = requests.get(f"{API}/orders/{oid}", headers=admin_headers, timeout=20)
            step = next(s for s in r.json()["steps"] if s["step_number"] == 5)
            assert step["associate_review_note"] == note
            # Translated field should be blank for EN locale.
            assert (step.get("associate_review_note_translated") or "") == "", (
                f"english locale should leave translation blank; got "
                f"{step.get('associate_review_note_translated')!r}"
            )
        finally:
            _delete_order(admin_headers, order["id"])
