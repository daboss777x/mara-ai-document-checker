"""Lean schema (CONTRACTS section 3): shape, constraints, guards, auto-complete trigger, RLS."""

from __future__ import annotations

import re

import pytest
from psycopg import errors

from conftest import (
    BROKER, DEAL_A, DEAL_B, DEAL_C, DOC_REVIEW, ENOCH, ITEM_COMPLETE, ITEM_MISSING, ITEM_NEEDS_FIX,
    ITEM_REVIEW, OTHER_AGENT, OTHER_BROKER, RACHEL, add_staff, reset_user, savepoint, set_user,
)

TABLES = {
    "brokerages", "users", "deals", "clients", "client_links", "document_types", "checklist_items",
    "documents", "findings", "messages", "audit_log", "ai_runs", "mara_jobs",
}
CUT_TABLES = {
    "brokerage_settings", "policies", "timeline_versions", "deadlines", "approvals", "templates", "tasks",
    "reminder_schedules", "deal_members", "contacts",
}


def visible(db, table="deals") -> set[str]:
    return {str(r[0]) for r in db.execute(f"select id from public.{table}").fetchall()}


def count(db, sql, *params) -> int:
    return db.execute(sql, params).fetchone()[0]


def service(db):
    set_user(db, None, "service_role")


# --- shape -------------------------------------------------------------------

def test_exactly_the_lean_tables_exist(db):
    names = {r[0] for r in db.execute("select tablename from pg_tables where schemaname = 'public'").fetchall()}
    assert names == TABLES
    assert not names & CUT_TABLES


def test_every_public_table_has_rls_enabled(db):
    off = db.execute("select tablename from pg_tables where schemaname = 'public' and not rowsecurity").fetchall()
    assert off == []


def test_no_cut_columns_remain(db):
    cols = {(t, c) for t, c in db.execute(
        "select table_name, column_name from information_schema.columns where table_schema = 'public'").fetchall()}
    for bad in ("drive_file_id", "drive_url", "drive_folder_id", "is_licensed", "risk_score", "side"):
        assert not {c for _, c in cols if c == bad}, bad
    assert {"session_hash", "session_expires_at", "locked_until"} <= {c for t, c in cols if t == "client_links"}
    assert "size_bytes" in {c for t, c in cols if t == "documents"}


def test_document_types_seeded_with_standard_keys(db):
    rows = db.execute("select key, standard_key from public.document_types order by key").fetchall()
    assert rows == [(k, k) for k in sorted([
        "buyer_rep_agreement", "sales_contract", "sellers_disclosure", "lead_paint_addendum",
        "preapproval_letter", "hoa_addendum"])]


def test_deal_number_defaults_to_year_and_sequence(db):
    service(db)
    n = db.execute(
        "insert into public.deals (brokerage_id, agent_id, property_address, city, zip) "
        "values (%s, %s, '1 Test St', 'Austin', '78701') returning deal_number, state, status, reminders_enabled",
        ("b0000000-0000-4000-8000-000000000001", RACHEL)).fetchone()
    assert re.fullmatch(r"\d{4}-\d{4}", n[0])
    assert int(n[0][-4:]) > 145  # the sequence is ahead of the seeded numbers
    assert n[1:] == ("TX", "open", True)


def test_deal_number_format_enforced(db):
    with pytest.raises(errors.CheckViolation):
        with savepoint(db):
            db.execute("update public.deals set deal_number = 'abc' where id = %s", (DEAL_A,))


def test_updated_at_trigger(db):
    before = db.execute("select updated_at from public.deals where id = %s", (DEAL_A,)).fetchone()[0]
    db.execute("update public.deals set reminders_enabled = false where id = %s", (DEAL_A,))
    after = db.execute("select updated_at from public.deals where id = %s", (DEAL_A,)).fetchone()[0]
    assert after > before


@pytest.mark.parametrize("status", ["uploading", "received", "processing", "checked", "failed", "superseded"])
def test_documents_status_values(db, status):
    db.execute("update public.documents set status = %s where id = %s", (status, DOC_REVIEW))


def test_documents_status_rejects_unknown(db):
    with pytest.raises(errors.CheckViolation):
        with savepoint(db):
            db.execute("update public.documents set status = 'deleted' where id = %s", (DOC_REVIEW,))


def test_file_path_must_be_a_deal_key(db):
    with pytest.raises(errors.CheckViolation):
        with savepoint(db):
            db.execute("update public.documents set file_path = 'somewhere/else.pdf' where id = %s", (DOC_REVIEW,))


def test_one_client_per_deal(db):
    with pytest.raises(errors.UniqueViolation):
        with savepoint(db):
            db.execute("insert into public.clients (deal_id, name, phone) values (%s, 'Second', '+15125550199')",
                       (DEAL_A,))


def test_client_phone_must_be_e164(db):
    with pytest.raises(errors.CheckViolation):
        with savepoint(db):
            db.execute("update public.clients set phone = '512-555-0142' where id = %s", (ENOCH,))


# --- messages constraint ------------------------------------------------------

def msg(db, kind, approved_by=None, status="queued"):
    return db.execute(
        "insert into public.messages (deal_id, client_id, kind, body, status, approved_by) "
        "values (%s, %s, %s, 'x', %s, %s) returning id", (DEAL_A, ENOCH, kind, status, approved_by)).fetchone()[0]


def test_fix_request_requires_approved_by_even_for_service_role(db):
    service(db)
    with pytest.raises(errors.CheckViolation):
        with savepoint(db):
            msg(db, "fix_request")
    msg(db, "fix_request", approved_by=RACHEL)


@pytest.mark.parametrize("kind", ["invite", "verify_code", "reminder"])
def test_system_kinds_need_no_approval(db, kind):
    service(db)
    msg(db, kind)


def test_approved_at_is_stamped_on_insert(db):
    service(db)
    mid = msg(db, "fix_request", approved_by=RACHEL)
    assert db.execute("select approved_at is not null from public.messages where id = %s", (mid,)).fetchone()[0]


# --- append-only and never-delete --------------------------------------------

def test_documents_cannot_be_deleted(db):
    with pytest.raises(errors.InsufficientPrivilege):
        with savepoint(db):
            db.execute("delete from public.documents where id = %s", (DOC_REVIEW,))
    # ...even as the service role: mark superseded instead.
    service(db)
    with pytest.raises(errors.InsufficientPrivilege):
        with savepoint(db):
            db.execute("delete from public.documents where id = %s", (DOC_REVIEW,))
    db.execute("update public.documents set status = 'superseded' where id = %s", (DOC_REVIEW,))


@pytest.mark.parametrize("table", ["audit_log", "ai_runs"])
@pytest.mark.parametrize("role", [None, "service_role"])
def test_append_only_tables_reject_update_delete_truncate(db, table, role):
    if role:
        service(db)
    for sql in (f"update public.{table} set created_at = now()", f"delete from public.{table}",
                f"truncate public.{table}"):
        with pytest.raises(errors.InsufficientPrivilege):
            with savepoint(db):
                db.execute(sql)


def test_service_role_can_append(db):
    service(db)
    db.execute("insert into public.audit_log (deal_id, actor, action) values (%s, 'mara', 'test')", (DEAL_A,))
    db.execute("insert into public.ai_runs (deal_id, purpose, model) values (%s, 'check_document', 'm')", (DEAL_A,))


def test_audit_actor_values(db):
    with pytest.raises(errors.CheckViolation):
        with savepoint(db):
            db.execute("insert into public.audit_log (actor, action) values ('stranger', 'x')")


# --- deal auto-complete trigger ----------------------------------------------

def deal_status(db, deal=DEAL_C):
    return db.execute("select status from public.deals where id = %s", (deal,)).fetchone()[0]


def test_deal_completes_when_every_non_waived_item_is_complete_and_reopens(db):
    # DEAL_C: buyer_rep + preapproval complete, sales_contract missing.
    assert deal_status(db) == "open"
    db.execute("update public.checklist_items set status = 'complete' where deal_id = %s", (DEAL_C,))
    assert deal_status(db) == "complete"
    db.execute("update public.checklist_items set status = 'needs_fix' where deal_id = %s and document_type_key = 'sales_contract'",
               (DEAL_C,))
    assert deal_status(db) == "open"


def test_waived_items_do_not_block_completion(db):
    db.execute("update public.checklist_items set status = 'waived' where deal_id = %s and document_type_key = 'sales_contract'",
               (DEAL_C,))
    assert deal_status(db) == "complete"
    db.execute("update public.checklist_items set status = 'missing' where deal_id = %s and document_type_key = 'sales_contract'",
               (DEAL_C,))
    assert deal_status(db) == "open"


def test_adding_an_item_reopens_a_complete_deal(db):
    db.execute("update public.checklist_items set status = 'complete' where deal_id = %s", (DEAL_C,))
    assert deal_status(db) == "complete"
    db.execute("insert into public.checklist_items (deal_id, document_type_key) values (%s, 'hoa_addendum')", (DEAL_C,))
    assert deal_status(db) == "open"


def test_all_waived_keeps_status(db):
    db.execute("update public.checklist_items set status = 'waived' where deal_id = %s", (DEAL_C,))
    assert deal_status(db) == "open"


def test_completion_is_stamped_with_the_session_user(db):
    set_user(db, RACHEL)
    db.execute("update public.checklist_items set status = 'complete', fix_note = null where id = %s", (ITEM_REVIEW,))
    reset_user(db)
    by, at = db.execute("select completed_by, completed_at from public.checklist_items where id = %s",
                        (ITEM_REVIEW,)).fetchone()
    assert str(by) == RACHEL and at is not None
    db.execute("update public.checklist_items set status = 'review' where id = %s", (ITEM_REVIEW,))
    assert db.execute("select completed_by, completed_at from public.checklist_items where id = %s",
                      (ITEM_REVIEW,)).fetchone() == (None, None)


# --- RLS: who sees what ---------------------------------------------------------

def test_agent_sees_only_own_deals(db):
    set_user(db, RACHEL)
    assert visible(db) == {DEAL_A, DEAL_B, DEAL_C}


def test_agent_without_deals_sees_nothing(db):
    add_staff(db)
    set_user(db, OTHER_AGENT)
    for t in ("deals", "clients", "checklist_items", "documents", "findings", "messages", "audit_log", "ai_runs"):
        assert visible(db, t) == set(), t
    assert count(db, "select count(*) from public.users") == 3  # colleagues in the same brokerage


def test_broker_sees_all_deals_in_brokerage_but_not_other_brokerages(db):
    add_staff(db)
    set_user(db, BROKER)
    assert visible(db) == {DEAL_A, DEAL_B, DEAL_C}
    assert count(db, "select count(*) from public.checklist_items") == 12
    reset_user(db)  # now a broker of a different brokerage
    set_user(db, OTHER_BROKER)
    assert visible(db) == set()
    assert count(db, "select count(*) from public.brokerages") == 1


def test_user_with_no_staff_row_sees_nothing(db):
    set_user(db, "99999999-0000-4000-8000-000000000000")
    assert visible(db) == set()
    assert visible(db, "checklist_items") == set()


@pytest.mark.parametrize("table", sorted(TABLES))
def test_anon_has_no_access(db, table):
    set_user(db, None, "anon")
    with pytest.raises(errors.InsufficientPrivilege):
        with savepoint(db):
            db.execute(f"select * from public.{table}")


def test_mara_jobs_hidden_from_staff_and_service_role_can_claim(db):
    service(db)
    db.execute("insert into public.mara_jobs (idempotency_key, kind) values ('document:1:1', 'process_document')")
    with pytest.raises(errors.UniqueViolation):
        with savepoint(db):
            db.execute("insert into public.mara_jobs (idempotency_key, kind) values ('document:1:1', 'process_document')")
    reset_user(db)
    set_user(db, BROKER)
    with pytest.raises(errors.InsufficientPrivilege):
        with savepoint(db):
            db.execute("select * from public.mara_jobs")


def test_client_link_secrets_are_not_readable_by_staff(db):
    set_user(db, RACHEL)
    assert count(db, "select count(*) from public.client_links") == 3
    for col in ("token_hash", "verify_code_hash", "session_hash"):
        with pytest.raises(errors.InsufficientPrivilege):
            with savepoint(db):
                db.execute(f"select {col} from public.client_links")


# --- RLS: what an agent may change ------------------------------------------------

def test_agent_reviews_items_and_findings(db):
    set_user(db, RACHEL)
    db.execute("update public.checklist_items set status = 'needs_fix', fix_note = 'Please sign page 9.' where id = %s",
               (ITEM_REVIEW,))
    db.execute("update public.findings set status = 'dismissed' where checklist_item_id = %s", (ITEM_REVIEW,))
    reset_user(db)
    assert db.execute("select status, fix_note from public.checklist_items where id = %s", (ITEM_REVIEW,)).fetchone() \
        == ("needs_fix", "Please sign page 9.")
    assert {r[0] for r in db.execute("select dismissed_by::text from public.findings where checklist_item_id = %s",
                                     (ITEM_REVIEW,)).fetchall()} == {RACHEL}


def test_agent_updates_deal_but_not_status_or_ownership(db):
    set_user(db, RACHEL)
    db.execute("update public.deals set reminders_enabled = false where id = %s", (DEAL_A,))
    for col, val in (("status", "'complete'"), ("agent_id", f"'{BROKER}'"), ("deal_number", "'2026-9999'")):
        with pytest.raises(errors.InsufficientPrivilege):
            with savepoint(db):
                db.execute(f"update public.deals set {col} = {val} where id = %s", (DEAL_A,))


def test_agent_cannot_touch_another_agents_deal(db):
    add_staff(db)
    set_user(db, OTHER_AGENT)
    assert db.execute("update public.deals set reminders_enabled = false where id = %s", (DEAL_A,)).rowcount == 0
    assert db.execute("update public.checklist_items set status = 'complete' where id = %s", (ITEM_REVIEW,)).rowcount == 0
    assert db.execute("update public.findings set status = 'dismissed'").rowcount == 0
    with pytest.raises(errors.InsufficientPrivilege):  # RLS with-check failure
        with savepoint(db):
            db.execute("insert into public.checklist_items (deal_id, document_type_key) values (%s, 'hoa_addendum')",
                       (DEAL_A,))


def test_agent_creates_a_deal_with_client_items_and_link(db):
    set_user(db, RACHEL)
    deal = db.execute(
        "insert into public.deals (brokerage_id, agent_id, property_address, city, zip) "
        "values ('b0000000-0000-4000-8000-000000000001', %s, '9 New Ln', 'Austin', '78702') returning id", (RACHEL,)
    ).fetchone()[0]
    client = db.execute("insert into public.clients (deal_id, name, phone, sms_consent_at) "
                        "values (%s, 'Jo Client', '+15125550177', now()) returning id", (deal,)).fetchone()[0]
    db.execute("insert into public.checklist_items (deal_id, document_type_key) values (%s, 'sales_contract')", (deal,))
    db.execute("insert into public.client_links (client_id, token_hash, expires_at) values (%s, 'h', now() + interval '30 days')",
               (client,))
    db.execute("insert into public.messages (deal_id, client_id, kind, body) values (%s, %s, 'invite', 'Hi')",
               (deal, client))


def test_agent_cannot_create_a_deal_for_someone_else(db):
    set_user(db, RACHEL)
    with pytest.raises(errors.InsufficientPrivilege):
        with savepoint(db):
            db.execute("insert into public.deals (brokerage_id, agent_id, property_address, city, zip) "
                       "values ('b0000000-0000-4000-8000-000000000001', %s, '9 New Ln', 'Austin', '78702')", (BROKER,))


def agent_msg(db, kind="fix_request", approved_by=RACHEL, status="queued", deal=DEAL_A, client=ENOCH):
    return db.execute(
        "insert into public.messages (deal_id, client_id, kind, body, status, approved_by) "
        "values (%s, %s, %s, 'x', %s, %s)", (deal, client, kind, status, approved_by))


def test_agent_inserts_approved_fix_request_and_invite(db):
    set_user(db, RACHEL)
    agent_msg(db)
    agent_msg(db, kind="invite", approved_by=None)
    reset_user(db)
    assert count(db, "select count(*) from public.messages where kind = 'fix_request' and approved_by = %s "
                     "and approved_at is not null and status = 'queued'", RACHEL) == 1


@pytest.mark.parametrize("kwargs", [
    dict(approved_by=None),             # no approver: also the check constraint
    dict(approved_by=BROKER),           # approver must be the signed-in user
    dict(kind="reminder", approved_by=None),
    dict(kind="verify_code", approved_by=None),
    dict(status="sent"),                # agents cannot mark a message sent
])
def test_agent_cannot_insert_other_messages(db, kwargs):
    set_user(db, RACHEL)
    with pytest.raises((errors.InsufficientPrivilege, errors.CheckViolation)):
        with savepoint(db):
            agent_msg(db, **kwargs)


def test_agent_cannot_message_a_client_of_another_deal(db):
    set_user(db, RACHEL)
    other_client = "c0000000-0000-4000-8000-000000000201"
    with pytest.raises(errors.InsufficientPrivilege):
        with savepoint(db):
            agent_msg(db, deal=DEAL_A, client=other_client)


def test_other_agent_cannot_message_on_my_deal(db):
    add_staff(db)
    set_user(db, OTHER_AGENT)
    with pytest.raises(errors.InsufficientPrivilege):
        with savepoint(db):
            agent_msg(db, approved_by=OTHER_AGENT)


def test_agent_audit_entries_only_as_themselves_on_their_deals(db):
    set_user(db, RACHEL)
    db.execute("insert into public.audit_log (deal_id, actor, actor_id, action) values (%s, 'agent', %s, 'item.completed')",
               (DEAL_A, RACHEL))
    for actor, actor_id, deal in (("mara", RACHEL, DEAL_A), ("agent", BROKER, DEAL_A), ("agent", RACHEL, None)):
        with pytest.raises(errors.InsufficientPrivilege):
            with savepoint(db):
                db.execute("insert into public.audit_log (deal_id, actor, actor_id, action) values (%s, %s, %s, 'x')",
                           (deal, actor, actor_id))
    assert count(db, "select count(*) from public.audit_log where deal_id = %s", DEAL_A) == 6  # 5 seeded + 1


@pytest.mark.parametrize("sql", [
    "insert into public.documents (deal_id, checklist_item_id) values ('{d}', '{i}')",
    "update public.documents set status = 'checked'",
    "delete from public.documents",
    "delete from public.checklist_items",
    "delete from public.deals",
    "delete from public.findings",
    "delete from public.messages",
    "insert into public.findings (document_id, checklist_item_id, severity, rule_key, message) "
    "values ('{doc}', '{i}', 'blocker', 'k', 'm')",
    "insert into public.ai_runs (purpose, model) values ('p', 'm')",
    "update public.document_types set name = 'x'",
    "insert into public.brokerages (name) values ('x')",
    "update public.users set role = 'broker'",
])
def test_agent_cannot_do_mara_only_or_destructive_things(db, sql):
    set_user(db, RACHEL)
    with pytest.raises(errors.InsufficientPrivilege):
        with savepoint(db):
            db.execute(sql.format(d=DEAL_A, i=ITEM_MISSING, doc=DOC_REVIEW))
