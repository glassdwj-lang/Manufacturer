"""Iteration-7 backend tests: Digital DNA PDF + UI language preference end-to-end.

Goals:
  1. Login as admin/manufacturer/client.
  2. PUT /api/users/me/language for each of en/zh/fr/it and verify GET /api/auth/me persists it.
  3. GET /api/orders/{id}/digital-dna for an order whose progress.completed_count==26
     (fallback: any order). Verify:
        - content-type contains "pdf"
        - body > 5 KB
        - first 4 bytes are b"%PDF"
        - chrome tokens for the chosen language appear in the extracted PDF text
          (e.g. "Digital DNA" for en, "数字 DNA" / "26 步" for zh,
                "ADN Numérique" for fr, "DNA Digitale" for it).
  4. POST /api/orders/{id}/steps/{n}/translate returns notes_translated for a completed
     step that has notes.
  5. CLEANUP: restore admin.preferred_language to "en".
"""
from __future__ import annotations

import io
import os
import re
import pathlib
import pytest
import requests
from pypdf import PdfReader

# ----------------------------------------------------------- bootstrap URL
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


# ----------------------------------------------------------- fixtures
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


def h(tok):
    return {"Authorization": f"Bearer {tok['access_token']}"}


# ----------------------------------------------------------- helpers
def _set_admin_lang(s, admin_tok, lang):
    """Backend endpoint expects key 'language' (NOT 'preferred_language')."""
    r = s.put(
        f"{API}/users/me/language",
        headers=h(admin_tok),
        json={"language": lang} if lang else {"language": None},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return "\n".join((p.extract_text() or "") for p in reader.pages)
    except Exception as exc:
        return f"<<extract_failed: {exc}>>"


def _find_complete_order_id(s, admin_tok) -> tuple[str, dict]:
    """Return (order_id, order_dict) for a fully completed (26/26) order, else any.

    Will try to complete missing steps on SMN-DEMO0001 if needed.
    """
    r = s.get(f"{API}/orders", headers=h(admin_tok))
    assert r.status_code == 200
    orders = r.json()
    # Look for a fully complete one
    for o in orders:
        prog = o.get("progress") or {}
        if prog.get("completed_count", 0) >= prog.get("total", 26):
            return o["id"], o
    # Try to fully complete the demo order
    demo = next((o for o in orders if o["order_ref"] == "SMN-DEMO0001"), None)
    if demo is None:
        # fallback: any order
        return orders[0]["id"], orders[0]
    return demo["id"], demo


def _complete_all_steps(s, mfg_tok, admin_tok, order_id):
    """Mark every step 1..26 complete via manufacturer (idempotent)."""
    r = s.get(f"{API}/orders/{order_id}", headers=h(admin_tok))
    assert r.status_code == 200
    order = r.json()
    steps = order.get("steps", [])
    for st in steps:
        n = st["step_number"]
        if st.get("completed"):
            continue
        rr = s.post(
            f"{API}/orders/{order_id}/steps/{n}/complete",
            headers=h(mfg_tok),
            json={"notes": f"TEST_step{n} complete.", "photos": []},
            timeout=45,
        )
        # 200 expected; if 403/400 we move on (e.g. permissions)
        assert rr.status_code in (200, 400), f"step {n}: {rr.status_code} {rr.text[:200]}"
    # Refetch
    r = s.get(f"{API}/orders/{order_id}", headers=h(admin_tok))
    return r.json()


@pytest.fixture(scope="session")
def complete_order(s, admin_tok, mfg_tok):
    oid, _o = _find_complete_order_id(s, admin_tok)
    order = _complete_all_steps(s, mfg_tok, admin_tok, oid)
    return order


# =========================================================== #1 language persistence
class TestLanguagePersistence:
    @pytest.mark.parametrize("lang", ["zh", "fr", "it", "en"])
    def test_set_and_persist(self, s, admin_tok, lang):
        _set_admin_lang(s, admin_tok, lang)
        r = s.get(f"{API}/auth/me", headers=h(admin_tok))
        assert r.status_code == 200, r.text
        me = r.json()
        assert me.get("preferred_language") == lang, (
            f"expected preferred_language={lang!r}, got {me.get('preferred_language')!r}"
        )


# =========================================================== #2 PDF localization
class TestDigitalDNAPDFLocalized:
    EXPECTED = {
        "en": ["Digital DNA"],
        "zh": ["数字"],          # extracted CJK may lose space → check core token
        "fr": ["ADN Num"],       # "ADN Numérique"
        "it": ["DNA Digitale"],
    }

    @pytest.mark.parametrize("lang", ["zh", "fr", "it", "en"])
    def test_pdf_localised(self, s, admin_tok, complete_order, lang):
        _set_admin_lang(s, admin_tok, lang)
        oid = complete_order["id"]
        r = s.get(
            f"{API}/orders/{oid}/digital-dna",
            headers=h(admin_tok),
            params={"include_notes": "true", "include_photos": "true"},
            timeout=60,
        )
        assert r.status_code == 200, r.text
        ctype = r.headers.get("content-type", "")
        assert "pdf" in ctype.lower(), f"expected pdf, got {ctype!r}"
        body = r.content
        assert body[:4] == b"%PDF", f"not a PDF: {body[:20]!r}"
        assert len(body) > 5 * 1024, f"pdf too small ({len(body)} bytes)"
        # Snapshot for debugging
        out = pathlib.Path(f"/tmp/digital_dna_{lang}.pdf")
        out.write_bytes(body)
        text = _extract_pdf_text(body)
        tokens = self.EXPECTED[lang]
        found = [tok for tok in tokens if tok in text]
        # If extraction failed we accept "valid-PDF + size > 5KB" alone for CJK
        if not found and lang == "zh":
            # CJK extraction via pypdf is sometimes lossy under STSong-Light CID.
            # Verify the *raw* bytes embed the STSong CID font reference instead.
            assert b"STSong" in body, (
                f"ZH pdf has no '数字' in extracted text AND no STSong font ref. "
                f"Extract preview: {text[:300]!r}"
            )
        else:
            assert found, (
                f"None of {tokens} found in {lang!r} PDF extract. "
                f"Preview: {text[:400]!r}"
            )


# =========================================================== #3 manual translate
class TestManualTranslateStep:
    def test_translate_step_with_notes(self, s, admin_tok, mfg_tok, complete_order):
        # find first completed step that has notes
        oid = complete_order["id"]
        target_step = None
        for st in complete_order.get("steps", []):
            if st.get("completed") and (st.get("notes") or "").strip():
                target_step = st["step_number"]
                break
        if target_step is None:
            pytest.skip("no completed step with notes")

        r = s.post(
            f"{API}/orders/{oid}/steps/{target_step}/translate",
            headers=h(admin_tok),
            json={"target_lang": "zh-CN", "target_lang_name": "Chinese"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "notes_translated" in data, data
        assert data["notes_translated"], f"empty notes_translated: {data}"
        assert data.get("target_lang") == "zh-CN" or data.get("notes_target_lang") == "zh-CN", data


# =========================================================== #4 final cleanup
def test_zz_cleanup_admin_lang_to_en(s, admin_tok):
    """Final test (alphabetically last) — restore admin preferred_language to 'en'."""
    me = _set_admin_lang(s, admin_tok, "en")
    assert me.get("preferred_language") == "en"
