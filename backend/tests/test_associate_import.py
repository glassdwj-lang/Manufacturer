"""
Backend tests for the gem-gallery-193 associate import + source-app lockdown rules.
Covers iteration 3 review request:
  - POST /api/admin/import-associates (admin-only, fetches 8 records, upserts)
  - GET  /api/admin/import-associates/status (admin-only, includes schedule)
  - POST /api/users role=associate|admin -> 400 (locked-down)
  - POST /api/users role=manufacturer|client -> still works
  - DELETE /api/users/{id} on source='gem-gallery' user -> 400
  - DELETE /api/users/{id} on local user -> works
  - POST /api/auth/login with imported associate email -> 401
  - GET /api/users carries source='local' on seed records and source='gem-gallery' on imports
  - POST /api/seed still idempotent, admin login still works
"""
import os
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@somnio.co"
ADMIN_PASSWORD = "Admin@2026"
MFG_EMAIL = "mfg@somnio.co"
MFG_PASSWORD = "Mfg@2026"


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="session")
def admin_token(s):
    # ensure seed users exist
    s.post(f"{API}/seed", timeout=30)
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def mfg_token(s):
    s.post(f"{API}/seed", timeout=30)
    r = s.post(f"{API}/auth/login", json={"email": MFG_EMAIL, "password": MFG_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"mfg login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- 0. sanity ----------
class TestHealth:
    def test_root(self, s):
        r = s.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_seed_idempotent(self, s):
        r = s.post(f"{API}/seed", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert "seeded" in body


# ---------- 1. Import associates endpoint ----------
class TestImportAssociates:
    def test_import_requires_admin(self, s, mfg_token):
        r = s.post(f"{API}/admin/import-associates", headers=auth(mfg_token), timeout=30)
        assert r.status_code == 403, f"expected 403 for non-admin, got {r.status_code} {r.text}"

    def test_import_as_admin_succeeds(self, s, admin_token):
        r = s.post(f"{API}/admin/import-associates", headers=auth(admin_token), timeout=60)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body.get("ok") is True, f"import not ok: {body}"
        # The source should return 8 associate/admin records per the request spec
        fetched = body.get("fetched")
        assert isinstance(fetched, int)
        assert fetched >= 1, f"expected >=1 fetched, got {fetched}"
        # Sanity: expected ~8 per request, just assert close to that
        assert fetched <= 50
        # counts present
        for k in ("created", "updated", "skipped"):
            assert k in body, f"missing key {k} in {body}"

    def test_status_requires_admin(self, s, mfg_token):
        r = s.get(f"{API}/admin/import-associates/status", headers=auth(mfg_token), timeout=15)
        assert r.status_code == 403

    def test_status_returns_last_run_and_schedule(self, s, admin_token):
        r = s.get(f"{API}/admin/import-associates/status", headers=auth(admin_token), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "last_run" in body
        assert "schedule" in body
        sched = body["schedule"]
        assert sched.get("tz") == "Australia/Sydney"
        assert sched.get("hour") == 0
        assert sched.get("minute") == 1

    def test_imported_users_carry_source_tag(self, s, admin_token):
        r = s.get(f"{API}/users?role=associate", headers=auth(admin_token), timeout=20)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 1
        gem_users = [u for u in users if u.get("source") == "gem-gallery"]
        assert len(gem_users) >= 1, f"no gem-gallery associates found in: {users}"

    def test_local_seed_user_carries_local_source(self, s, admin_token):
        # manufacturer mfg@somnio.co was seeded locally; its source must be 'local'
        r = s.get(f"{API}/users?role=manufacturer", headers=auth(admin_token), timeout=20)
        assert r.status_code == 200
        users = r.json()
        local = [u for u in users if u["email"] == MFG_EMAIL]
        assert len(local) == 1
        assert local[0].get("source") == "local"


# ---------- 2. Source-app lockdown on POST /api/users ----------
class TestUserCreationLockdown:
    def test_cannot_create_associate_locally(self, s, admin_token):
        payload = {
            "email": f"TEST_lock_assoc_{uuid.uuid4().hex[:6]}@example.com",
            "password": "Test@1234",
            "name": "Locked Associate",
            "role": "associate",
        }
        r = s.post(f"{API}/users", headers=auth(admin_token), json=payload, timeout=15)
        assert r.status_code == 400
        assert "source app" in r.text.lower()

    def test_cannot_create_admin_locally(self, s, admin_token):
        payload = {
            "email": f"TEST_lock_admin_{uuid.uuid4().hex[:6]}@example.com",
            "password": "Test@1234",
            "name": "Locked Admin",
            "role": "admin",
        }
        r = s.post(f"{API}/users", headers=auth(admin_token), json=payload, timeout=15)
        assert r.status_code == 400
        assert "source app" in r.text.lower()

    def test_can_create_manufacturer_locally(self, s, admin_token):
        email = f"TEST_mfg_{uuid.uuid4().hex[:6]}@example.com"
        payload = {"email": email, "password": "Test@1234", "name": "Local Workshop", "role": "manufacturer"}
        r = s.post(f"{API}/users", headers=auth(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        # backend lowercases emails
        assert body["email"] == email.lower()
        assert body["role"] == "manufacturer"
        assert body.get("source") == "local"
        # cleanup
        s.delete(f"{API}/users/{body['id']}", headers=auth(admin_token), timeout=15)

    def test_can_create_client_locally(self, s, admin_token):
        email = f"TEST_client_{uuid.uuid4().hex[:6]}@example.com"
        payload = {"email": email, "password": "Test@1234", "name": "Local Client", "role": "client"}
        r = s.post(f"{API}/users", headers=auth(admin_token), json=payload, timeout=15)
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        body = r.json()
        assert body["role"] == "client"
        assert body.get("source") == "local"
        # cleanup
        s.delete(f"{API}/users/{body['id']}", headers=auth(admin_token), timeout=15)


# ---------- 3. DELETE lockdown for mirrored users ----------
class TestDeleteLockdown:
    def test_cannot_delete_gem_gallery_user(self, s, admin_token):
        r = s.get(f"{API}/users?role=associate", headers=auth(admin_token), timeout=20)
        assert r.status_code == 200
        gem_users = [u for u in r.json() if u.get("source") == "gem-gallery"]
        assert gem_users, "no gem-gallery users to test against"
        victim = gem_users[0]
        d = s.delete(f"{API}/users/{victim['id']}", headers=auth(admin_token), timeout=15)
        assert d.status_code == 400
        assert "mirrored" in d.text.lower() or "source" in d.text.lower()
        # verify still exists
        g = s.get(f"{API}/users?role=associate", headers=auth(admin_token), timeout=15)
        assert any(u["id"] == victim["id"] for u in g.json())

    def test_can_delete_local_user(self, s, admin_token):
        email = f"TEST_del_{uuid.uuid4().hex[:6]}@example.com"
        c = s.post(
            f"{API}/users",
            headers=auth(admin_token),
            json={"email": email, "password": "Test@1234", "name": "To Delete", "role": "client"},
            timeout=15,
        )
        assert c.status_code == 200
        uid = c.json()["id"]
        d = s.delete(f"{API}/users/{uid}", headers=auth(admin_token), timeout=15)
        assert d.status_code == 200
        assert d.json().get("ok") is True


# ---------- 4. Imported users cannot log in locally ----------
class TestImportedLogin:
    def test_imported_associate_cannot_login(self, s, admin_token):
        # find an imported gem-gallery associate
        r = s.get(f"{API}/users?role=associate", headers=auth(admin_token), timeout=20)
        gem = [u for u in r.json() if u.get("source") == "gem-gallery"]
        assert gem
        target = gem[0]
        # try common guesses incl. the request spec example
        for pw in ("any", "password", "Assoc@2026", "20SomniO26!@"):
            lr = s.post(f"{API}/auth/login", json={"email": target["email"], "password": pw}, timeout=15)
            assert lr.status_code == 401, f"imported user {target['email']} logged in with {pw!r}: {lr.status_code} {lr.text}"

    def test_associate_somnio_co_login_still_works_after_import(self, s):
        # New contract: local seed `associate@somnio.co` is *exempt* from the
        # gem-gallery import wipe so the QUICK ACCESS · DEMO row always works.
        lr = s.post(f"{API}/auth/login", json={"email": "associate@somnio.co", "password": "Assoc@2026"}, timeout=15)
        assert lr.status_code == 200, f"expected 200, got {lr.status_code} {lr.text}"
        body = lr.json()
        assert body["user"]["email"] == "associate@somnio.co"
        assert body["user"]["role"] == "associate"


# ---------- 5. Demo logins still work ----------
class TestDemoLogins:
    @pytest.mark.parametrize("email,pw", [
        ("admin@somnio.co", "Admin@2026"),
        ("mfg@somnio.co", "Mfg@2026"),
        ("client@somnio.co", "Client@2026"),
    ])
    def test_login(self, s, email, pw):
        r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
        assert r.status_code == 200, f"{email} -> {r.status_code} {r.text}"
        body = r.json()
        assert "access_token" in body
        assert body["user"]["email"] == email
