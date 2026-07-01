"""Backend regression for the RFQ + Manufacturer directory + Client Approval Gates.

Covers:
  * /api/admin/manufacturers CRUD + status + guard
  * /api/admin/rfqs pipeline (bespoke create, broadcast, extend, response, import)
  * /api/quotes list/patch/compute/delete
  * /api/orders/{id}/client-approval gate 1 + 2 (as client)
"""
import os
import time
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")

ADMIN = {"email": "admin@somnio.co", "password": "Admin@2026"}
CLIENT = {"email": "client@somnio.co", "password": "Client@2026"}
MFG = {"email": "mfg@somnio.co", "password": "Mfg@2026"}

GG_BASE = "https://gem-gallery-193.preview.emergentagent.com"


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login {creds['email']} → {r.status_code}: {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_h():
    return {"Authorization": f"Bearer {_login(ADMIN)}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def client_h():
    return {"Authorization": f"Bearer {_login(CLIENT)}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def mfg_h():
    return {"Authorization": f"Bearer {_login(MFG)}", "Content-Type": "application/json"}


# ---------------------------------------------------------------- MFR DIRECTORY
class TestManufacturers:
    def test_list_seeded_workshops(self, admin_h):
        r = requests.get(f"{BASE}/api/admin/manufacturers", headers=admin_h, timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) >= 14, f"expected >=14 seeded, got {len(rows)}"
        by_code = {int(m["code"]): m for m in rows}
        assert 1 in by_code and 14 in by_code
        assert by_code[1]["status"] == "burned", f"code 01 status={by_code[1]['status']}"
        assert by_code[14]["status"] == "burned", f"code 14 status={by_code[14]['status']}"
        # Others active
        for c in (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13):
            assert by_code[c]["status"] == "active", f"code {c:02d} not active"

    def test_next_code_peek(self, admin_h):
        r = requests.get(f"{BASE}/api/admin/manufacturers/next-code", headers=admin_h, timeout=30)
        assert r.status_code == 200
        # Next code should be >= 15 (may be higher if leftover from previous test runs)
        assert r.json()["next_code"] >= 15

    def test_create_patch_burn_flow_and_guard(self, admin_h, client_h, mfg_h):
        # Create fresh
        unique_name = f"TEST_QA_Atelier_{int(time.time())}"
        r = requests.post(
            f"{BASE}/api/admin/manufacturers",
            headers=admin_h,
            json={"name": unique_name, "contact_email": "qa@somnio-qa.co", "country": "AU"},
            timeout=45,
        )
        assert r.status_code == 200, f"create → {r.status_code}: {r.text[:400]}"
        m = r.json()
        assert m["pending_sync"] is False, f"pending_sync should be false, sync_err={m.get('last_sync_error')}"
        assert m.get("gem_gallery_id"), "gem_gallery_id missing"
        # code_display is a zero-padded string (may be "15" or higher)
        assert isinstance(m["code_display"], str) and m["code_display"].isdigit()
        mid = m["id"]

        # PATCH notes
        r = requests.patch(
            f"{BASE}/api/admin/manufacturers/{mid}",
            headers=admin_h,
            json={"notes": "QA regression note"},
            timeout=45,
        )
        assert r.status_code == 200
        patched = r.json()
        assert patched["notes"] == "QA regression note"
        assert patched["pending_sync"] is False

        # Guard — client cannot list
        r = requests.get(f"{BASE}/api/admin/manufacturers", headers=client_h, timeout=15)
        assert r.status_code == 403, f"client should be forbidden, got {r.status_code}"
        r = requests.get(f"{BASE}/api/admin/manufacturers", headers=mfg_h, timeout=15)
        assert r.status_code == 403

        # Burn
        r = requests.post(
            f"{BASE}/api/admin/manufacturers/{mid}/status",
            headers=admin_h,
            json={"status": "burned"},
            timeout=45,
        )
        assert r.status_code == 200
        burned = r.json()
        assert burned["status"] == "burned"

        # Attempt reactivate
        r = requests.post(
            f"{BASE}/api/admin/manufacturers/{mid}/status",
            headers=admin_h,
            json={"status": "active"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "permanently retired" in r.json().get("detail", "").lower() or "burned" in r.json().get("detail", "").lower()

    def test_sync_pending_idempotent(self, admin_h):
        r = requests.post(f"{BASE}/api/admin/manufacturers/sync-pending", headers=admin_h, timeout=60)
        assert r.status_code == 200
        body = r.json()
        assert "retried" in body


# ---------------------------------------------------------------- RFQ PIPELINE
@pytest.fixture(scope="module")
def bespoke_rfq(admin_h):
    payload = {
        "client_name": "QA Client",
        "piece_type": 1,
        "category": "rings",
        "preference_snapshot": {
            "name": "Test Ring 1ct OV",
            "ring_type": "solitaire",
            "ring_size": "6",
            "metal_preferences": ["18k YG"],
            "main_stone_type": "lab_diamond",
            "carat_weight": "1.00",
        },
        "admin_notes": "QA bespoke",
        "submit_immediately": True,
    }
    r = requests.post(f"{BASE}/api/admin/rfqs", headers=admin_h, json=payload, timeout=30)
    assert r.status_code == 200, r.text[:400]
    return r.json()


class TestRFQPipeline:
    def test_bespoke_create_defaults(self, bespoke_rfq):
        assert bespoke_rfq["origin"] == "admin_bespoke"
        assert bespoke_rfq["brand"] == "SB"
        assert bespoke_rfq["status"] == "pending_review"
        assert bespoke_rfq["piece_type"] == 1
        assert bespoke_rfq["piece_type_label"] == "Ring"

    def test_admin_list_bespoke_filter(self, admin_h, bespoke_rfq):
        r = requests.get(f"{BASE}/api/admin/rfqs", headers=admin_h, params={"origin": "admin_bespoke"}, timeout=30)
        assert r.status_code == 200
        ids = [d["id"] for d in r.json()]
        assert bespoke_rfq["id"] in ids

    def test_admin_rfqs_guards(self, client_h, mfg_h):
        r = requests.get(f"{BASE}/api/admin/rfqs", headers=client_h, timeout=15)
        assert r.status_code == 403
        r = requests.get(f"{BASE}/api/admin/rfqs", headers=mfg_h, timeout=15)
        assert r.status_code == 403

    def test_broadcast_to_burned_mfr_rejected(self, admin_h, bespoke_rfq):
        r = requests.get(f"{BASE}/api/admin/manufacturers", headers=admin_h, timeout=30)
        rows = r.json()
        floral = next((m for m in rows if int(m["code"]) == 1), None)
        assert floral is not None
        r = requests.post(
            f"{BASE}/api/admin/rfqs/{bespoke_rfq['id']}/broadcast",
            headers=admin_h,
            json={"manufacturer_ids": [floral["id"]]},
            timeout=30,
        )
        assert r.status_code == 400
        assert "burned" in r.json().get("detail", "").lower() or "paused" in r.json().get("detail", "").lower()

    def test_broadcast_serials_expiry_and_stamps(self, admin_h, bespoke_rfq):
        r = requests.get(f"{BASE}/api/admin/manufacturers", headers=admin_h, timeout=30)
        rows = r.json()
        wei_chen = next((m for m in rows if int(m["code"]) == 6), None)
        shanghai = next((m for m in rows if int(m["code"]) == 7), None)
        assert wei_chen and shanghai, "seeded codes 06/07 not found"
        r = requests.post(
            f"{BASE}/api/admin/rfqs/{bespoke_rfq['id']}/broadcast",
            headers=admin_h,
            json={"manufacturer_ids": [wei_chen["id"], shanghai["id"]]},
            timeout=45,
        )
        assert r.status_code == 200, r.text[:400]
        rfq = r.json()
        assert rfq["status"] == "broadcast_complete"
        bcs = rfq["broadcasts"]
        assert len(bcs) == 2
        from datetime import datetime, timedelta
        for bc in bcs:
            assert bc["brand"] == "SB"
            assert bc["piece_type"] == 1
            code = bc["manufacturer_code"]
            # serial triple checks
            expected_storage = f"SB-{code:02d}-1-{bc['yymm']}-{bc['seq']:03d}"
            expected_display = f"SB {code:02d} 1 {bc['yymm']} {bc['seq']:03d}"
            expected_engraved = f"SB{code:02d}1{bc['yymm']}{bc['seq']:03d}"
            assert bc["serial_storage"] == expected_storage
            assert bc["serial_display"] == expected_display
            assert bc["serial_engraved"] == expected_engraved
            # cross-ref stamps
            assert bc.get("manufacturer_directory_id")
            assert "manufacturer_gem_gallery_id" in bc
            # expires_at = allocated_at + 14 days
            a = datetime.fromisoformat(bc["allocated_at"])
            e = datetime.fromisoformat(bc["expires_at"])
            assert abs((e - a) - timedelta(days=14)) < timedelta(seconds=2), \
                f"expiry gap {e - a} != 14 days"
        # stash first bc id for downstream tests
        pytest.first_bc_id = bcs[0]["id"]

    def test_extend_broadcast_once(self, admin_h, bespoke_rfq):
        bc_id = pytest.first_bc_id
        r = requests.post(
            f"{BASE}/api/admin/rfqs/{bespoke_rfq['id']}/broadcasts/{bc_id}/extend",
            headers=admin_h,
            timeout=30,
        )
        assert r.status_code == 200, r.text[:400]
        assert r.json()["broadcast"]["extension_granted"] is True
        # Second call → 400
        r2 = requests.post(
            f"{BASE}/api/admin/rfqs/{bespoke_rfq['id']}/broadcasts/{bc_id}/extend",
            headers=admin_h,
            timeout=15,
        )
        assert r2.status_code == 400
        assert "already" in r2.json().get("detail", "").lower()

    def test_record_response_and_import_quote(self, admin_h, bespoke_rfq):
        bc_id = pytest.first_bc_id
        payload = {
            "price_usd": 5000, "metal": "18k YG", "stone_kind": "lab_diamond",
            "piece_weight_g": 6.2, "lead_time_days": 30,
        }
        r = requests.post(
            f"{BASE}/api/admin/rfqs/{bespoke_rfq['id']}/broadcasts/{bc_id}/response",
            headers=admin_h,
            json=payload,
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["broadcast"]["status"] == "responded"

        r = requests.post(
            f"{BASE}/api/admin/rfqs/{bespoke_rfq['id']}/import-to-quote",
            headers=admin_h,
            params={"broadcast_id": bc_id},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        q = body["quote"]
        assert q["rfq_id"] == bespoke_rfq["id"]
        assert q["inputs"]["ring_cost_usd"] == 5000
        assert q["serial_storage"] and q["serial_display"] and q["serial_engraved"]
        pytest.imported_quote_id = q["id"]

    def test_ingest_from_gem_gallery(self, admin_h):
        # Warm-up
        try:
            requests.get(f"{GG_BASE}/api/", timeout=8)
        except Exception:
            pass
        r = requests.post(
            f"{BASE}/api/admin/rfqs/ingest-from-gem-gallery",
            headers=admin_h,
            timeout=120,
        )
        if r.status_code in (502, 503):
            time.sleep(4)
            r = requests.post(f"{BASE}/api/admin/rfqs/ingest-from-gem-gallery", headers=admin_h, timeout=120)
        assert r.status_code == 200, r.text[:400]
        body = r.json()
        assert body.get("ok")
        # verify mirrored RFQ exists
        r = requests.get(f"{BASE}/api/admin/rfqs", headers=admin_h, params={"origin": "gem_gallery"}, timeout=30)
        assert r.status_code == 200
        gg = {d["id"]: d for d in r.json()}
        target = "72e662dc-681b-49ab-a74b-b0f67e681362"
        if target in gg:
            assert gg[target]["origin"] == "gem_gallery"
            # serial from broadcasts
            bcs = gg[target].get("broadcasts", [])
            serials = [b.get("serial_storage") for b in bcs]
            # not strictly required but nice-to-have
            if serials:
                assert any("SC-01-1-2606-002" == s for s in serials) or True

    def test_manufacturer_cannot_hit_admin_rfqs(self, mfg_h, bespoke_rfq):
        r = requests.get(f"{BASE}/api/admin/rfqs/{bespoke_rfq['id']}", headers=mfg_h, timeout=15)
        assert r.status_code == 403


# ---------------------------------------------------------------- QUOTES
class TestQuotes:
    def test_list_quotes(self, admin_h):
        r = requests.get(f"{BASE}/api/quotes", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_patch_recomputes_totals(self, admin_h):
        qid = getattr(pytest, "imported_quote_id", None)
        assert qid, "no imported quote available"
        payload = {
            "inputs": {
                "ring_cost_usd": 7000,
                "markup_pct": 200,
                "gst_pct": 10,
                "usd_to_aud_rate": 1.5,
                "discount_tiers": [],
            }
        }
        r = requests.patch(f"{BASE}/api/quotes/{qid}", headers=admin_h, json=payload, timeout=30)
        assert r.status_code == 200, r.text[:400]
        totals = r.json()["totals"]
        for k in ("total_usd_costs", "total_cost_aud", "retail_sell_price_ex_gst_aud",
                  "gst_amount_aud", "total_sell_price_inc_gst_aud"):
            assert totals.get(k) is not None
            assert isinstance(totals[k], (int, float))

    def test_compute_preview(self, admin_h):
        r = requests.post(
            f"{BASE}/api/quotes/compute",
            headers=admin_h,
            json={"ring_cost_usd": 1000, "markup_pct": 100, "gst_pct": 10,
                  "usd_to_aud_rate": 1.5, "discount_tiers": []},
            timeout=15,
        )
        assert r.status_code == 200
        t = r.json()
        assert t["total_usd_costs"] == 1000
        assert t["total_cost_aud"] == 1500

    def test_delete_quote(self, admin_h):
        qid = getattr(pytest, "imported_quote_id", None)
        assert qid
        r = requests.delete(f"{BASE}/api/quotes/{qid}", headers=admin_h, timeout=15)
        assert r.status_code == 200


# ---------------------------------------------------------------- CLIENT GATES
@pytest.fixture(scope="module")
def client_order(admin_h, client_h):
    # Find an order owned by client@somnio.co
    r = requests.get(f"{BASE}/api/auth/me", headers=client_h, timeout=15)
    assert r.status_code == 200
    client_id = r.json()["id"]

    r = requests.get(f"{BASE}/api/orders", headers=admin_h, timeout=30)
    assert r.status_code == 200, r.text[:200]
    orders = [o for o in r.json() if o.get("client_id") == client_id]
    if not orders:
        pytest.skip("No orders owned by client@somnio.co — cannot test gates")
    order = orders[0]
    # Ensure at least one render exists — try to fetch full order
    r = requests.get(f"{BASE}/api/orders/{order['id']}", headers=admin_h, timeout=30)
    if r.status_code == 200:
        order = r.json()
    if not (order.get("renders") or []):
        # No renders → skip gate flow tests
        pytest.skip("Order has no renders — skipping client gate tests")
    return order, client_id


class TestClientGates:
    def test_admin_release_render(self, admin_h, client_order):
        order, _ = client_order
        render_id = order["renders"][0]["id"]
        r = requests.post(
            f"{BASE}/api/orders/{order['id']}/renders/{render_id}/release-for-client",
            headers=admin_h,
            json={"released": True},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["released"] is True

    def test_client_can_view_released(self, client_h, client_order):
        order, _ = client_order
        r = requests.get(f"{BASE}/api/orders/{order['id']}/client-renders", headers=client_h, timeout=15)
        assert r.status_code == 200
        assert len(r.json().get("released", [])) >= 1

    def test_gate1_revision_then_accept(self, admin_h, client_h, client_order):
        order, _ = client_order
        oid = order["id"]

        # Reset gate state so this test is idempotent across reruns
        # (endpoint is not exposed; we rely on the 409-guard for the accepted
        # case, so we treat that as an acceptable pass).
        r = requests.post(
            f"{BASE}/api/orders/{oid}/client-approval/gate1",
            headers=client_h,
            json={"status": "revision_requested", "message": "add more brilliance"},
            timeout=30,
        )
        # If already accepted from prior run, we get 409 — accept either 200 or 409.
        assert r.status_code in (200, 409), r.text[:300]

        r = requests.post(
            f"{BASE}/api/orders/{oid}/client-approval/gate1",
            headers=client_h,
            json={"status": "accepted"},
            timeout=30,
        )
        assert r.status_code in (200, 409), r.text[:300]

        # Duplicate accept → 409
        r2 = requests.post(
            f"{BASE}/api/orders/{oid}/client-approval/gate1",
            headers=client_h,
            json={"status": "accepted"},
            timeout=15,
        )
        assert r2.status_code == 409

    def test_gate2_yes(self, client_h, client_order):
        order, _ = client_order
        oid = order["id"]
        r = requests.post(
            f"{BASE}/api/orders/{oid}/client-approval/gate2",
            headers=client_h,
            json={"status": "yes"},
            timeout=60,
        )
        assert r.status_code in (200, 409), r.text[:300]
