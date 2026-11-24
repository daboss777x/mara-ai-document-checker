from datetime import UTC, datetime

import pytest

from mara.outbound.filter import check_outbound
from mara.outbound.providers import (
    FakeSmsProvider,
    ProviderPermanentError,
    ProviderTransientError,
)
from mara.outbound.sender import send_message
from mara.settings import Settings

# 15:00 UTC = 10:00 in Chicago (CST): inside allowed hours
DAY = datetime(2026, 11, 24, 16, 0, tzinfo=UTC)
NIGHT = datetime(2026, 11, 25, 3, 0, tzinfo=UTC)  # 21:00 Chicago: quiet hours
SETTINGS = Settings(public_site_url="https://mara.test")


def queue(db, seed, kind, body="Hello", approved=False, created=None):
    approved_by = seed["agent"] if approved else None
    return db.execute(
        "insert into messages (deal_id, client_id, kind, body, approved_by, created_at) "
        "values (%s,%s,%s,%s,%s,%s) returning id",
        (seed["deal"], seed["client"], kind, body, approved_by, created or DAY),
    ).fetchone()[0]


def status(db, mid):
    return db.execute("select status, error from messages where id=%s", (mid,)).fetchone()


def test_unapproved_fix_request_is_refused_and_provider_never_called(db, seed):
    # the DB check constraint also forbids this row; drop it to prove the code-level rule
    db.execute("alter table messages drop constraint messages_fix_request_needs_approval")
    mid = queue(db, seed, "fix_request", "Please re-sign page 3.", approved=False)
    provider = FakeSmsProvider()
    out = send_message(db, mid, provider=provider, now=DAY, settings=SETTINGS)
    assert (out.status, out.reason) == ("blocked", "not_approved")
    assert provider.sent == [] and status(db, mid) == ("blocked", "not_approved")
    db.execute("delete from messages")
    db.execute(
        "alter table messages add constraint messages_fix_request_needs_approval "
        "check (kind <> 'fix_request' or approved_by is not null)"
    )


def test_db_constraint_also_rejects_unapproved_fix_request(db, seed):
    with pytest.raises(Exception, match="messages_fix_request_needs_approval"):
        queue(db, seed, "fix_request", approved=False)


def test_approved_fix_request_is_sent_with_a_portal_link_footer(db, seed):
    mid = queue(db, seed, "fix_request", "Please sign page 3.", approved=True)
    provider = FakeSmsProvider()
    out = send_message(db, mid, provider=provider, now=DAY, settings=SETTINGS)
    assert out.status == "sent"
    to, body = provider.sent[0]
    assert to == "+15125550142" and body.startswith("Please sign page 3.")
    assert "https://mara.test/c/" in body and "Cedar & Stone Realty" in body
    assert db.execute(
        "select status, provider_message_id from messages where id=%s", (mid,)
    ).fetchone() == ("sent", "fake-1")
    assert db.execute("select count(*) from client_links").fetchone()[0] == 2  # minted one
    # sent twice is impossible: it is no longer queued
    assert send_message(db, mid, provider=provider, now=DAY, settings=SETTINGS).status == "skipped"
    assert len(provider.sent) == 1


@pytest.mark.parametrize("kind", ["invite", "reminder", "verify_code"])
def test_system_kinds_send_without_approval(db, seed, kind):
    mid = queue(db, seed, kind, "Your code is 123456." if kind == "verify_code" else "Hi there")
    provider = FakeSmsProvider()
    assert send_message(db, mid, provider=provider, now=DAY, settings=SETTINGS).status == "sent"


def test_invite_is_sent_as_written_by_the_web_and_empty_bodies_are_blocked(db, seed):
    provider = FakeSmsProvider()
    mid = queue(db, seed, "invite", "Hi Enoch, upload here: https://mara.test/c/abc")
    assert send_message(db, mid, provider=provider, now=DAY, settings=SETTINGS).status == "sent"
    assert provider.sent[0][1] == "Hi Enoch, upload here: https://mara.test/c/abc"
    empty = queue(db, seed, "invite", "")
    assert send_message(db, empty, provider=provider, now=DAY, settings=SETTINGS).reason == (
        "empty_body"
    )


def test_consent_and_opt_out(db, seed):
    provider = FakeSmsProvider()
    db.execute("update clients set sms_opt_out_at = now()")
    mid = queue(db, seed, "reminder")
    assert (
        send_message(db, mid, provider=provider, now=DAY, settings=SETTINGS).reason == "opted_out"
    )
    code = queue(db, seed, "verify_code", "Code 123456")
    assert send_message(db, code, provider=provider, now=DAY, settings=SETTINGS).status == "sent"
    db.execute("update clients set sms_opt_out_at = null, sms_consent_at = null")
    mid2 = queue(db, seed, "reminder")
    assert (
        send_message(db, mid2, provider=provider, now=DAY, settings=SETTINGS).reason == "no_consent"
    )
    assert len(provider.sent) == 1


def test_quiet_hours_defer_and_keep_the_message_queued(db, seed):
    mid = queue(db, seed, "reminder", created=NIGHT)
    provider = FakeSmsProvider()
    out = send_message(db, mid, provider=provider, now=NIGHT, settings=SETTINGS)
    assert (out.status, out.reason) == ("deferred", "quiet_hours")
    assert status(db, mid)[0] == "queued" and provider.sent == []


@pytest.mark.parametrize(
    "body",
    [
        "Please wire the deposit to account number 12345678",
        "Our routing number is 021000021",
        "You should sign this and waive the inspection.",
        "That is legal advice: it is legally binding.",
        "I recommend you negotiate the price down.",
    ],
)
def test_content_filter_blocks_banking_and_advice(db, seed, body):
    mid = queue(db, seed, "fix_request", body, approved=True)
    provider = FakeSmsProvider()
    assert send_message(db, mid, provider=provider, now=DAY, settings=SETTINGS).status == "blocked"
    assert provider.sent == []


def test_filter_lets_normal_messages_through():
    for ok in [
        "Please initial the bottom of every page, then upload it again.",
        "Cedar & Stone Realty: your verification code is 482913. It expires in 10 minutes.",
        "Upload here: https://mara.test/c/Zm9v-123456789012345678-bar",
    ]:
        assert not check_outbound(ok).blocked


def test_provider_errors(db, seed):
    transient = queue(db, seed, "reminder")
    p = FakeSmsProvider(error=ProviderTransientError("503"))
    assert send_message(db, transient, provider=p, now=DAY, settings=SETTINGS).status == "deferred"
    assert status(db, transient)[0] == "queued"
    p.error = ProviderPermanentError("bad number")
    assert send_message(db, transient, provider=p, now=DAY, settings=SETTINGS).status == "failed"
    assert status(db, transient) == ("failed", "bad number")


def test_missing_provider_keys_leave_the_message_queued(db, seed):
    mid = queue(db, seed, "reminder")
    out = send_message(db, mid, now=DAY, settings=Settings())
    assert (out.status, out.reason) == ("deferred", "provider_not_configured")
    assert status(db, mid)[0] == "queued"


def test_old_messages_are_given_up_on(db, seed):
    mid = queue(db, seed, "reminder", created=datetime(2026, 11, 20, tzinfo=UTC))
    out = send_message(db, mid, provider=FakeSmsProvider(), now=DAY, settings=SETTINGS)
    assert out.status == "failed"


def test_sms_off_records_every_message_as_blocked_and_sends_nothing(db, seed):
    """Demo without SMS (MARA_SMS_MODE=off)."""
    off = Settings(public_site_url="https://mara.test", mara_sms_mode="off")
    provider = FakeSmsProvider()
    for kind, approved in [("invite", False), ("reminder", False), ("fix_request", True)]:
        mid = queue(db, seed, kind, "Hello there", approved=approved)
        out = send_message(db, mid, provider=provider, now=DAY, settings=off)
        assert (out.status, out.reason) == ("blocked", "sms_disabled")
        assert status(db, mid) == ("blocked", "sms_disabled")
    assert provider.sent == []
