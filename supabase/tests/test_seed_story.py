"""The seed matches the story in the brief and stays safe under RLS."""

from __future__ import annotations

import re
from datetime import date

import pytest
from psycopg import errors

from conftest import (
    DEAL_A, DEAL_B, DEAL_C, ENOCH, ITEM_CHECKING, ITEM_COMPLETE, ITEM_MISSING, ITEM_NEEDS_FIX, ITEM_REVIEW,
    RACHEL, SEED, reset_user, set_user,
)


def test_people_and_deals(db):
    assert db.execute("select name from public.brokerages").fetchall() == [("Cedar & Stone Realty",)]
    assert dict(db.execute("select name, role from public.users").fetchall()) == {
        "Margaret Holloway": "broker", "Rachel Kim": "agent"}
    rows = db.execute("select id::text, deal_number, property_address, zip, agent_id::text "
                      "from public.deals order by deal_number").fetchall()
    assert rows == [
        (DEAL_B, "2026-0138", "44 Rainey St #1802", "78701", RACHEL),
        (DEAL_A, "2026-0142", "1208 Barton Hills Dr", "78704", RACHEL),
        (DEAL_C, "2026-0145", "3310 Cherrywood Rd", "78722", RACHEL),
    ]
    assert db.execute("select name, phone, sms_consent_at is not null, sms_opt_out_at is null from public.clients "
                      "where id = %s", (ENOCH,)).fetchone() == ("Enoch Omunu", "+15125550142", True, True)
    assert {s for (s,) in db.execute("select status from public.deals").fetchall()} == {"open"}


def test_only_fictitious_contact_details(db):
    for (email,) in db.execute("select email from public.users union all select email from public.clients "
                               "where email is not null").fetchall():
        assert email.endswith("@example.com"), email
    for (phone,) in db.execute("select phone from public.users union all select phone from public.clients").fetchall():
        assert re.fullmatch(r"\+151255501\d\d", phone), phone


def test_deal_0142_has_an_item_in_every_status(db):
    rows = dict(db.execute("select id::text, status from public.checklist_items where deal_id = %s", (DEAL_A,)).fetchall())
    assert rows[ITEM_COMPLETE] == "complete"
    assert rows[ITEM_REVIEW] == "review"
    assert rows[ITEM_NEEDS_FIX] == "needs_fix"
    assert rows[ITEM_MISSING] == "missing"
    assert rows[ITEM_CHECKING] == "checking"
    assert len(rows) == 6


def test_review_item_has_checked_document_and_two_open_findings_with_page_and_quote(db):
    status, summary = db.execute(
        "select d.status, d.ai_summary from public.documents d where d.checklist_item_id = %s", (ITEM_REVIEW,)).fetchone()
    assert status == "checked" and summary
    findings = db.execute("select severity, page, quote, status, client_fix_text from public.findings "
                          "where checklist_item_id = %s order by page desc", (ITEM_REVIEW,)).fetchall()
    assert len(findings) == 2
    for sev, page, quote, st, fix in findings:
        assert sev in ("blocker", "warning") and page >= 1 and quote and st == "open" and fix


def test_needs_fix_item_has_note_and_approved_fix_request(db):
    note = db.execute("select fix_note from public.checklist_items where id = %s", (ITEM_NEEDS_FIX,)).fetchone()[0]
    assert note
    kind, approved_by, status, body = db.execute(
        "select kind, approved_by::text, status, body from public.messages where kind = 'fix_request'").fetchone()
    assert (kind, approved_by, status) == ("fix_request", RACHEL, "sent")
    assert body == note


def test_checking_item_has_a_processing_document_and_missing_items_have_none(db):
    assert db.execute("select status from public.documents where checklist_item_id = %s", (ITEM_CHECKING,)).fetchone() \
        == ("processing",)
    assert db.execute("select count(*) from public.documents where checklist_item_id = %s", (ITEM_MISSING,)).fetchone()[0] == 0


def test_completed_item_is_stamped(db):
    by, at = db.execute("select completed_by::text, completed_at from public.checklist_items where id = %s",
                        (ITEM_COMPLETE,)).fetchone()
    assert by == RACHEL and at is not None


def test_seed_never_queues_anything_for_mara(db):
    assert db.execute("select count(*) from public.messages where status = 'queued'").fetchone()[0] == 0
    assert db.execute("select count(*) from public.documents where status in ('received','uploading')").fetchone()[0] == 0


def test_demo_client_link_hash(db):
    import hashlib
    h = hashlib.sha256(b"mara-demo-0142-barton").hexdigest()
    assert db.execute("select client_id::text from public.client_links where token_hash = %s", (h,)).fetchone() == (ENOCH,)


def test_every_audit_and_ai_row_has_a_deal(db):
    assert db.execute("select count(*) from public.audit_log where deal_id is null").fetchone()[0] == 0
    assert db.execute("select count(*) from public.ai_runs").fetchone()[0] >= 1


def test_seed_is_rerunnable(db):
    n = db.execute("select (select count(*) from public.deals) + (select count(*) from public.findings) "
                   "+ (select count(*) from public.documents) + (select count(*) from public.messages)").fetchone()[0]
    db.execute(SEED.read_text())
    assert db.execute("select (select count(*) from public.deals) + (select count(*) from public.findings) "
                      "+ (select count(*) from public.documents) + (select count(*) from public.messages)").fetchone()[0] == n


def test_rachel_sees_the_seed_as_the_review_queue(db):
    set_user(db, RACHEL)
    queue = db.execute("select d.deal_number, t.name from public.checklist_items i join public.deals d on d.id = i.deal_id "
                       "join public.document_types t on t.key = i.document_type_key where i.status = 'review' "
                       "order by d.deal_number").fetchall()
    assert [q[0] for q in queue] == ["2026-0138", "2026-0142"]
