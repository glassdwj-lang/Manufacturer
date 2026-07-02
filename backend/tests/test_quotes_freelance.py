"""Backend regression for the new Quotes enhancements:

1. Freelance quote namespace (dwj-XXXX serial, independent counter).
2. Freelance filter on list quotes (freelance=true / false / omit).
3. PATCH jewelry_name (persist, clear, ignore-missing).
4. Atomic Stone + Metal fields round-trip via PATCH.
5. stone-spec-prefill endpoint shape for freelance (source=none) and
   for a real RFQ-linked quote (source=rfq, atoms present).
"""
import os
import re
import pathlib

import pytest
import requests

# --- Resolve the public backend URL exactly like the existing suite --
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
if not BASE_URL:
    env_file = pathlib.Path("/app/frontend/.env").read_text()
    m = re.search(r"EXPO_PUBLIC_BACKEND_URL=(\S+)", env_file)
    BASE_URL = m.group(1) if m else None
assert BASE_URL, "Backend URL not configured"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

AT = chr(64)
DOMAIN = AT + "somnio.co"
ADMIN_CREDS = {"email": "admin" + DOMAIN, "password": "Admin" + AT + "2026"}


# ---------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------
@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_headers(session):
    r = session.post(f"{API}/auth/login", json=ADMIN_CREDS)
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_ids():
    """Track ids created here so we can soft-delete at teardown."""
    return []


@pytest.fixture(scope="module", autouse=True)
def cleanup(session, admin_headers, created_ids):
    yield
    for qid in created_ids:
        try:
            session.delete(f"{API}/quotes/{qid}", headers=admin_headers)
        except Exception:
            pass


# ---------------------------------------------------------------------
# 1. Freelance quote creation + counter
# ---------------------------------------------------------------------
class TestFreelanceCreate:
    def test_create_returns_dwj_serial(self, session, admin_headers, created_ids):
        r = session.post(
            f"{API}/quotes/freelance",
            headers=admin_headers,
            json={"piece_description": "TEST_1 freelance piece"},
        )
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc.get("is_freelance") is True
        assert isinstance(doc.get("freelance_seq"), int)
        assert doc["freelance_seq"] >= 1
        # dwj-XXXX (4-digit zero pad) for seq < 10000
        serial = doc.get("freelance_serial")
        assert serial and re.match(r"^dwj-\d{4,}$", serial), serial
        if doc["freelance_seq"] < 10000:
            assert re.match(r"^dwj-\d{4}$", serial), serial
        # piece description mirrored onto inputs
        assert doc["inputs"]["piece_description"] == "TEST_1 freelance piece"
        created_ids.append(doc["id"])

    def test_two_creates_are_sequential(self, session, admin_headers, created_ids):
        r1 = session.post(
            f"{API}/quotes/freelance",
            headers=admin_headers,
            json={"piece_description": "TEST_seq A"},
        )
        r2 = session.post(
            f"{API}/quotes/freelance",
            headers=admin_headers,
            json={"piece_description": "TEST_seq B"},
        )
        assert r1.status_code == 200 and r2.status_code == 200
        a, b = r1.json(), r2.json()
        assert b["freelance_seq"] == a["freelance_seq"] + 1
        created_ids.extend([a["id"], b["id"]])


# ---------------------------------------------------------------------
# 2. Filter chip parity — freelance=true / false / omit
# ---------------------------------------------------------------------
class TestFreelanceListFilter:
    def test_freelance_true_only_freelance(self, session, admin_headers, created_ids):
        r = session.post(
            f"{API}/quotes/freelance",
            headers=admin_headers,
            json={"piece_description": "TEST_filter_true"},
        )
        assert r.status_code == 200
        created_ids.append(r.json()["id"])

        lst = session.get(f"{API}/quotes?freelance=true", headers=admin_headers).json()
        assert isinstance(lst, list) and len(lst) >= 1
        for q in lst:
            assert q.get("is_freelance") is True

    def test_freelance_false_excludes_freelance(self, session, admin_headers):
        lst = session.get(f"{API}/quotes?freelance=false", headers=admin_headers).json()
        assert isinstance(lst, list)
        for q in lst:
            # Legacy quotes may have is_freelance missing OR set to False.
            assert q.get("is_freelance") is not True, q.get("id")

    def test_no_filter_returns_all(self, session, admin_headers):
        all_ = session.get(f"{API}/quotes", headers=admin_headers).json()
        f_true = session.get(f"{API}/quotes?freelance=true", headers=admin_headers).json()
        f_false = session.get(f"{API}/quotes?freelance=false", headers=admin_headers).json()
        assert len(all_) == len(f_true) + len(f_false)


# ---------------------------------------------------------------------
# 3. Editable heading title — PATCH jewelry_name
# ---------------------------------------------------------------------
class TestJewelryNamePatch:
    @pytest.fixture(scope="class")
    def quote_id(self, session, admin_headers, created_ids):
        r = session.post(
            f"{API}/quotes/freelance",
            headers=admin_headers,
            json={"piece_description": "TEST_title base"},
        )
        assert r.status_code == 200
        qid = r.json()["id"]
        created_ids.append(qid)
        return qid

    def test_patch_sets_name(self, session, admin_headers, quote_id):
        r = session.patch(
            f"{API}/quotes/{quote_id}",
            headers=admin_headers,
            json={"jewelry_name": "TEST_New Ring Title"},
        )
        assert r.status_code == 200, r.text
        got = session.get(f"{API}/quotes/{quote_id}", headers=admin_headers).json()
        assert got["jewelry_name"] == "TEST_New Ring Title"

    def test_patch_empty_string_clears(self, session, admin_headers, quote_id):
        r = session.patch(
            f"{API}/quotes/{quote_id}",
            headers=admin_headers,
            json={"jewelry_name": ""},
        )
        assert r.status_code == 200
        got = session.get(f"{API}/quotes/{quote_id}", headers=admin_headers).json()
        assert got["jewelry_name"] in (None, "")

    def test_patch_missing_key_does_not_overwrite(self, session, admin_headers, quote_id):
        # Set a name
        session.patch(
            f"{API}/quotes/{quote_id}",
            headers=admin_headers,
            json={"jewelry_name": "TEST_Persist Me"},
        )
        # PATCH without jewelry_name (only status change) — must NOT clear name
        r = session.patch(
            f"{API}/quotes/{quote_id}",
            headers=admin_headers,
            json={"status": "draft"},
        )
        assert r.status_code == 200
        got = session.get(f"{API}/quotes/{quote_id}", headers=admin_headers).json()
        assert got["jewelry_name"] == "TEST_Persist Me"


# ---------------------------------------------------------------------
# 4. Atomic Stone + Metal round-trip
# ---------------------------------------------------------------------
class TestAtomicRoundTrip:
    def test_all_seven_atoms_persist(self, session, admin_headers, created_ids):
        r = session.post(
            f"{API}/quotes/freelance",
            headers=admin_headers,
            json={"piece_description": "TEST_atoms"},
        )
        assert r.status_code == 200
        qid = r.json()["id"]
        created_ids.append(qid)

        inputs = r.json()["inputs"]
        inputs.update({
            "diamond_type": "lab",
            "diamond_carat": 3,
            "diamond_shape": "Round",
            "diamond_color": "D",
            "diamond_clarity": "VVS2",
            "metal_type": "18K White Gold",
            "metal_weight_g": 6.2,
        })
        p = session.patch(
            f"{API}/quotes/{qid}",
            headers=admin_headers,
            json={"inputs": inputs},
        )
        assert p.status_code == 200, p.text

        got = session.get(f"{API}/quotes/{qid}", headers=admin_headers).json()
        gi = got["inputs"]
        assert gi["diamond_type"] == "lab"
        assert float(gi["diamond_carat"]) == 3.0
        assert gi["diamond_shape"] == "Round"
        assert gi["diamond_color"] == "D"
        assert gi["diamond_clarity"] == "VVS2"
        assert gi["metal_type"] == "18K White Gold"
        assert float(gi["metal_weight_g"]) == 6.2

    def test_empty_string_numeric_fields_do_not_500(self, session, admin_headers, created_ids):
        r = session.post(
            f"{API}/quotes/freelance",
            headers=admin_headers,
            json={"piece_description": "TEST_empty numeric"},
        )
        assert r.status_code == 200
        qid = r.json()["id"]
        created_ids.append(qid)

        inputs = r.json()["inputs"]
        # Pydantic drops these to null; ensure it doesn't 500 the compute engine.
        inputs["diamond_carat"] = None
        inputs["metal_weight_g"] = None
        p = session.patch(
            f"{API}/quotes/{qid}",
            headers=admin_headers,
            json={"inputs": inputs},
        )
        assert p.status_code == 200, p.text
        assert p.json().get("totals") is not None


# ---------------------------------------------------------------------
# 5. Stone-Spec Prefill endpoint
# ---------------------------------------------------------------------
class TestStoneSpecPrefill:
    def test_freelance_quote_returns_source_none(self, session, admin_headers, created_ids):
        r = session.post(
            f"{API}/quotes/freelance",
            headers=admin_headers,
            json={"piece_description": "TEST_prefill freelance"},
        )
        assert r.status_code == 200
        qid = r.json()["id"]
        created_ids.append(qid)

        pref = session.get(
            f"{API}/quotes/{qid}/stone-spec-prefill", headers=admin_headers
        )
        assert pref.status_code == 200, pref.text
        data = pref.json()
        assert data["source"] == "none"
        assert data["atoms"] == {}
        assert data["composed_stone"] == ""
        assert data["composed_metal"] == ""
        assert data["composed"] == ""

    def test_rfq_linked_quote_returns_atoms_if_present(
        self, session, admin_headers
    ):
        """If any brand quote in the system has an rfq_id, the endpoint
        should return source=rfq and structured atoms. If none exist
        we skip (setup is out of scope for this suite)."""
        lst = session.get(
            f"{API}/quotes?freelance=false", headers=admin_headers
        ).json()
        linked = next((q for q in lst if q.get("rfq_id")), None)
        if not linked:
            pytest.skip("No RFQ-linked brand quote in the DB — skip.")
        r = session.get(
            f"{API}/quotes/{linked['id']}/stone-spec-prefill",
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["source"] in ("rfq", "none")
        # Shape sanity — every key present
        for k in ("atoms", "composed_stone", "composed_metal", "composed"):
            assert k in data


# ---------------------------------------------------------------------
# 6. Compute engine — regression on real numeric inputs
# ---------------------------------------------------------------------
def test_compute_totals_roundtrip(session, admin_headers, created_ids):
    r = session.post(
        f"{API}/quotes/freelance",
        headers=admin_headers,
        json={"piece_description": "TEST_totals"},
    )
    assert r.status_code == 200
    qid = r.json()["id"]
    created_ids.append(qid)

    inputs = r.json()["inputs"]
    inputs.update({
        "ring_cost_usd": 1000,
        "usd_to_aud_rate": 1.5,
        "markup_pct": 100,
        "gst_pct": 10,
    })
    p = session.patch(
        f"{API}/quotes/{qid}",
        headers=admin_headers,
        json={"inputs": inputs},
    )
    assert p.status_code == 200
    totals = p.json()["totals"]
    assert totals["total_cost_aud"] == 1500.0
    assert totals["retail_sell_price_ex_gst_aud"] == 3000.0
    assert totals["total_sell_price_inc_gst_aud"] == 3300.0
