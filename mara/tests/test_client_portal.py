import json
import time
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from mara.api import create_app
from mara.security import hmac as mara_hmac
from mara.security.tokens import hash_code, sha256_hex
from mara.settings import Settings
from mara.storage import UPLOADS_STAGING, InMemoryFileStore

SECRET = "test-secret"


@pytest.fixture
def env(db, seed, conn_factory):
    store = InMemoryFileStore()
    sent: list[str] = []
    app = create_app(
        settings=Settings(mara_hmac_secret=SECRET),
        conn_factory=conn_factory,
        dispatch_send=sent.append,
        store_factory=lambda: store,
    )
    client = TestClient(app)

    def call(action, body=None, token=None, session=None, sign=True):
        payload = {"token": token or seed["token"], **(body or {})}
        if session:
            payload["session"] = session
        raw = json.dumps(payload).encode()
        headers = {mara_hmac.HEADER_NAME: mara_hmac.sign(SECRET, raw)} if sign else {}
        return client.post(f"/client/{action}", content=raw, headers=headers)

    return call, db, seed, store, sent


def verified_session(env):
    call, db, seed, _, _ = env
    code = "482913"
    db.execute(
        "update client_links set verify_code_hash=%s, verify_code_expires_at=%s",
        (sha256_hex(code), datetime.now(UTC) + timedelta(minutes=5)),
    )
    r = call("verify_code", {"code": code}).json()
    assert r["verified"] is True
    return r["session"]


def test_signature_is_required_everywhere(env):
    call, *_ = env
    assert call("portal", sign=False).status_code == 401
    assert call("nonsense").status_code == 404


def test_portal_shape_and_unknown_or_expired_links(env):
    call, db, seed, *_ = env
    r = call("portal")
    body = r.json()
    assert r.status_code == 200
    assert body["client"] == {"firstName": "Enoch", "name": "Enoch Omunu"}
    assert body["deal"] == {"address": "1208 Barton Hills Dr", "cityLine": "Austin, TX 78704"}
    assert body["agent"] == {"name": "Rachel Kim", "phone": "+15125550100"}
    assert body["needsVerification"] is True and body["mode"] == "live"
    assert body["phoneMasked"].endswith("0142") and body["state"] == "ready"
    assert call("portal", token="no-such-token-xx").status_code == 404
    db.execute("update client_links set expires_at = now() - interval '1 minute'")
    assert call("portal").status_code == 410
    db.execute("update client_links set expires_at = now() + interval '1 day', revoked_at = now()")
    assert call("portal").status_code == 410


def test_everything_else_needs_a_session(env):
    call, _, seed, *_ = env
    for action, body in [
        ("checklist", {}),
        ("item", {"itemId": str(seed["items"]["sales_contract"])}),
        ("set_opt_out", {"optOut": True}),
    ]:
        r = call(action, body)
        assert r.status_code == 401 and r.json()["error"] == "session_required"
    assert call("checklist", session="forged-session-token").status_code == 401


def test_send_code_queues_a_verify_code_message_and_throttles(env):
    call, db, seed, _, sent = env
    r = call("send_code").json()
    assert r["sent"] is True and r["phoneMasked"].endswith("0142")
    kind, body, status = db.execute("select kind, body, status from messages").fetchone()
    assert (kind, status) == ("verify_code", "queued") and "Cedar & Stone Realty" in body
    assert len(sent) == 1
    code = body.split("code is ")[1][:6]
    stored = db.execute("select verify_code_hash from client_links").fetchone()[0]
    assert stored == hash_code(code)  # only the hash is stored
    again = call("send_code").json()
    assert again["sent"] is False and again["reason"] == "too_soon"


def test_verify_code_success_issues_a_hashed_30_day_session(env):
    call, db, *_ = env
    session = verified_session(env)
    h, exp, code_hash = db.execute(
        "select session_hash, session_expires_at, verify_code_hash from client_links"
    ).fetchone()
    assert h == sha256_hex(session) and code_hash is None
    assert timedelta(days=29) < exp - datetime.now(UTC) <= timedelta(days=30)
    assert call("checklist", session=session).status_code == 200
    assert call("portal", session=session).json()["needsVerification"] is False


def test_five_wrong_codes_lock_for_fifteen_minutes(env):
    call, db, *_ = env
    db.execute(
        "update client_links set verify_code_hash=%s, verify_code_expires_at=%s",
        (sha256_hex("111111"), datetime.now(UTC) + timedelta(minutes=5)),
    )
    lefts = [call("verify_code", {"code": "000000"}).json() for _ in range(5)]
    assert [x["attemptsLeft"] for x in lefts] == [4, 3, 2, 1, 0]
    assert lefts[-1]["reason"] == "locked"
    # even the right code is refused while locked
    r = call("verify_code", {"code": "111111"}).json()
    assert r["verified"] is False and r["reason"] == "locked"
    assert 14 * 60 < r["retryAfterSeconds"] <= 15 * 60 + 1
    assert call("send_code").json()["reason"] == "locked"
    assert call("portal").json()["state"] == "locked"
    db.execute("update client_links set locked_until = now() - interval '1 second'")
    assert call("portal").json()["state"] == "ready"


def test_expired_code_and_bad_code_format(env):
    call, db, *_ = env
    db.execute(
        "update client_links set verify_code_hash=%s, verify_code_expires_at=%s",
        (sha256_hex("222222"), datetime.now(UTC) - timedelta(seconds=1)),
    )
    assert call("verify_code", {"code": "222222"}).json()["reason"] == "expired"
    assert call("verify_code", {"code": "12ab"}).status_code == 422


def test_checklist_groups_and_headline(env):
    call, db, seed, *_ = env
    session = verified_session(env)
    db.execute(
        "update checklist_items set status='review' where id=%s", (seed["items"]["hoa_addendum"],)
    )
    r = call("checklist", session=session).json()
    assert r["headline"] == "Hi Enoch, 1 thing left"
    assert [i["status"] for i in r["toDo"]] == ["to_do"]
    assert [i["status"] for i in r["checking"]] == ["checking"]
    assert r["totalCount"] == 2 and r["doneCount"] == 0
    assert r["sms"] == {"optedOut": False, "canToggle": True}
    todo = r["toDo"][0]
    assert set(todo) == {
        "id",
        "name",
        "description",
        "status",
        "chip",
        "checked",
        "fixNote",
        "dueDate",
        "uploadedAt",
    }
    assert todo["chip"] == {"label": "To do", "tone": "neutral"}
    assert todo["checked"] is False
    # Mara has checked the HOA addendum; the agent is reviewing it
    hoa = r["checking"][0]
    assert hoa["checked"] is True and hoa["chip"]["label"] == "Checked · with your agent"
    db.execute(
        "update checklist_items set status='needs_fix', fix_note='Sign p3' "
        "where document_type_key='sales_contract'"
    )
    r = call("checklist", session=session).json()
    assert r["toDo"][0]["status"] == "needs_fix" and r["toDo"][0]["fixNote"] == "Sign p3"
    db.execute(
        "update checklist_items set status='waived' where document_type_key='sales_contract'"
    )
    assert call("checklist", session=session).json()["totalCount"] == 1


def test_upload_roundtrip(env):
    call, db, seed, store, _ = env
    session = verified_session(env)
    item = str(seed["items"]["sales_contract"])
    body = {
        "itemId": item,
        "filename": "my contract.pdf",
        "sizeBytes": 1234,
        "mime": "application/pdf",
    }
    r = call("create_upload", body, session=session)
    assert r.status_code == 200
    out = r.json()
    assert out["uploadUrl"].startswith("memory://uploads-staging/deals/")
    status, version, staging = db.execute(
        "select status, version, staging_path from documents"
    ).fetchone()
    assert (status, version) == ("uploading", 1) and staging.endswith(".pdf")

    # confirming before the bytes arrive is refused
    assert call("confirm_upload", {"documentId": out["documentId"]}, session=session).json() == {
        "error": "upload_missing"
    }
    store.put(UPLOADS_STAGING, staging, b"%PDF-1.4 x", "application/pdf")
    ok = call("confirm_upload", {"documentId": out["documentId"]}, session=session).json()
    assert ok == {"documentId": out["documentId"], "status": "checking"}
    assert db.execute("select status from documents").fetchone()[0] == "received"
    assert (
        db.execute("select status from checklist_items where id=%s", (item,)).fetchone()[0]
        == "checking"
    )
    # an item being checked can't take another upload
    assert call("create_upload", body, session=session).json()["error"] == "item_not_open"
    page = call("item", {"itemId": item}, session=session).json()
    assert (
        page["item"]["status"] == "checking" and page["uploads"][0]["filename"] == "my contract.pdf"
    )
    assert page["upload"]["maxBytes"] == 25 * 1024 * 1024


def test_upload_validation_and_other_deals_items(env):
    call, db, seed, *_ = env
    session = verified_session(env)
    item = str(seed["items"]["sales_contract"])
    base = {
        "itemId": item,
        "filename": "x.exe",
        "sizeBytes": 10,
        "mime": "application/x-msdownload",
    }
    assert call("create_upload", base, session=session).json()["error"] == "unsupported_type"
    big = {**base, "mime": "application/pdf", "sizeBytes": 26 * 1024 * 1024}
    assert call("create_upload", big, session=session).json()["error"] == "too_large"
    other = {**base, "mime": "application/pdf", "itemId": str(seed["new_id"]())}
    assert call("create_upload", other, session=session).status_code == 404


def test_opt_out_toggle(env):
    call, db, *_ = env
    session = verified_session(env)
    assert call("set_opt_out", {"optOut": True}, session=session).json() == {"optedOut": True}
    assert db.execute("select sms_opt_out_at is not null from clients").fetchone()[0] is True
    assert call("checklist", session=session).json()["sms"]["optedOut"] is True
    call("set_opt_out", {"optOut": False}, session=session)
    assert db.execute("select sms_opt_out_at from clients").fetchone()[0] is None


def test_events_endpoint_is_signed_and_idempotent(env, conn_factory):
    seen = []
    app = create_app(
        settings=Settings(mara_hmac_secret=SECRET),
        conn_factory=conn_factory,
        dispatcher=lambda e, j: seen.append((e.type, str(e.id))),
    )
    c = TestClient(app)
    raw = json.dumps(
        {"type": "document.created", "id": "6b1f5c1e-0000-4000-8000-000000000001"}
    ).encode()
    h = {mara_hmac.HEADER_NAME: mara_hmac.sign(SECRET, raw, int(time.time()))}
    assert c.post("/events", content=raw).status_code == 401
    assert c.post("/events", content=raw, headers=h).json()["status"] == "queued"
    assert c.post("/events", content=raw, headers=h).json()["status"] == "duplicate"
    assert len(seen) == 1
    bad = json.dumps({"type": "approvals.approved", "id": "x"}).encode()
    hb = {mara_hmac.HEADER_NAME: mara_hmac.sign(SECRET, bad)}
    assert c.post("/events", content=bad, headers=hb).status_code == 422


def test_verify_off_opens_the_portal_without_a_code(db, seed, conn_factory):
    """Demo without SMS (MARA_CLIENT_VERIFY=0): the link alone is enough."""
    app = create_app(
        settings=Settings(mara_hmac_secret=SECRET, mara_client_verify=False),
        conn_factory=conn_factory,
        dispatch_send=lambda _id: None,
        store_factory=InMemoryFileStore,
    )
    client = TestClient(app)

    def call(action, body=None):
        raw = json.dumps({"token": seed["token"], **(body or {})}).encode()
        return client.post(
            f"/client/{action}",
            content=raw,
            headers={mara_hmac.HEADER_NAME: mara_hmac.sign(SECRET, raw)},
        )

    assert call("portal").json()["needsVerification"] is False
    assert call("checklist").status_code == 200
    assert call("item", {"itemId": str(seed["items"]["sales_contract"])}).status_code == 200
