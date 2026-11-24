"""Supabase -> Mara /events trigger: payloads, HMAC signature, and never blocking a write."""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest

from conftest import DEAL_A, DOC_REVIEW, ENOCH, ITEM_MISSING, RACHEL, reset_user, set_user

SECRET = "test-hmac-secret-not-real"
FAKE_PG_NET = f"""
create schema net;
create table net.captured (url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb default '{{}}', params jsonb default '{{}}',
                              headers jsonb default '{{}}', timeout_milliseconds int default 5000)
returns bigint language plpgsql as $$
begin
  if url like '%%explode%%' then raise exception 'network down'; end if;
  insert into net.captured values (url, body, headers);
  return 1;
end $$;
create schema vault;
create view vault.decrypted_secrets as
  select * from (values ('mara_events_url', 'https://mara.example.com/events'),
                        ('mara_hmac_secret', '{SECRET}')) as v(name, decrypted_secret);
"""


@pytest.fixture
def fake_pg_net(db):
    db.execute(FAKE_PG_NET)
    return db


def captured(db):
    return db.execute("select url, body::text, body, headers from net.captured").fetchall()


def verify(raw_body: str, header: str) -> None:
    """What mara/mara/security/hmac.py does (CONTRACTS section 1)."""
    parts = dict(p.split("=", 1) for p in header.split(","))
    assert set(parts) == {"t", "v1"} and parts["t"].isdigit()
    expected = hmac.new(SECRET.encode(), f"{parts['t']}.{raw_body}".encode(), hashlib.sha256).hexdigest()
    assert hmac.compare_digest(expected, parts["v1"])


def new_doc(db, status, version=5):
    return db.execute(
        "insert into public.documents (deal_id, checklist_item_id, version, status) values (%s, %s, %s, %s) returning id",
        (DEAL_A, ITEM_MISSING, version, status)).fetchone()[0]


def new_msg(db, status="queued", kind="reminder"):
    return db.execute("insert into public.messages (deal_id, client_id, kind, body, status) "
                      "values (%s, %s, %s, 'x', %s) returning id", (DEAL_A, ENOCH, kind, status)).fetchone()[0]


def test_noop_without_pg_net(db):
    assert db.execute("select to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)')").fetchone()[0] is None
    new_doc(db, "received")
    new_msg(db)


def test_document_inserted_as_received_sends_signed_event(fake_pg_net):
    db = fake_pg_net
    doc = new_doc(db, "received")
    [(url, raw, body, headers)] = captured(db)
    assert url == "https://mara.example.com/events"
    assert headers["Content-Type"] == "application/json"
    verify(raw, headers["X-Mara-Signature"])
    assert json.loads(raw) == body == {"type": "document.created", "id": str(doc)}


def test_document_flipping_to_received_sends_event(fake_pg_net):
    db = fake_pg_net
    doc = new_doc(db, "uploading")
    assert captured(db) == []
    db.execute("update public.documents set status = 'received' where id = %s", (doc,))
    [(_, raw, body, headers)] = captured(db)
    verify(raw, headers["X-Mara-Signature"])
    assert body == {"type": "document.created", "id": str(doc)}


def test_other_document_changes_send_nothing(fake_pg_net):
    db = fake_pg_net
    new_doc(db, "uploading")
    for i, status in enumerate(("processing", "checked", "failed", "superseded")):
        new_doc(db, status, version=10 + i)
    db.execute("update public.documents set ai_summary = 'x', status = 'checked' where id = %s", (DOC_REVIEW,))
    # received -> received (no status change) must not re-fire either
    doc = new_doc(db, "received", version=99)
    before = len(captured(db))
    db.execute("update public.documents set status = 'received', page_count = 3 where id = %s", (doc,))
    assert len(captured(db)) == before


def test_queued_message_sends_event_other_statuses_dont(fake_pg_net):
    db = fake_pg_net
    for status in ("sent", "failed", "blocked"):
        new_msg(db, status)
    assert captured(db) == []
    mid = new_msg(db)
    [(_, raw, body, headers)] = captured(db)
    verify(raw, headers["X-Mara-Signature"])
    assert body == {"type": "message.queued", "id": str(mid)}
    db.execute("update public.messages set status = 'sent' where id = %s", (mid,))
    assert len(captured(db)) == 1


def test_agent_fix_request_fires_event(fake_pg_net):
    db = fake_pg_net
    set_user(db, RACHEL)
    db.execute("insert into public.messages (deal_id, client_id, kind, body, approved_by) "
               "values (%s, %s, 'fix_request', 'x', %s)", (DEAL_A, ENOCH, RACHEL))
    reset_user(db)
    [(_, _, body, _)] = captured(db)
    assert body["type"] == "message.queued"


def test_webhook_failure_never_blocks_the_write(fake_pg_net):
    db = fake_pg_net
    db.execute("create or replace view vault.decrypted_secrets as select * from (values "
               "('mara_events_url', 'https://explode.example.com'), ('mara_hmac_secret', 's')) as v(name, decrypted_secret)")
    new_doc(db, "received")
    assert captured(db) == []


def test_missing_vault_secret_is_a_noop(fake_pg_net):
    db = fake_pg_net
    db.execute("create or replace view vault.decrypted_secrets as select * from (values "
               "('mara_events_url', 'https://mara.example.com/events')) as v(name, decrypted_secret)")
    new_doc(db, "received")
    assert captured(db) == []
