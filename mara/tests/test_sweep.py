from datetime import UTC, datetime, timedelta

from mara.settings import Settings
from mara.sweep import run_sweep

SETTINGS = Settings(public_site_url="https://mara.test")
# Dec 1 2026 16:00 UTC = 10:00 CST in Chicago (the send hour)
AT_TEN = datetime(2026, 12, 1, 16, 0, tzinfo=UTC)


def age(db, seed, days):
    """Make the deal and its items `days` old."""
    t = AT_TEN - timedelta(days=days)
    db.execute("update checklist_items set created_at = %s", (t,))
    db.execute("update deals set created_at = %s", (t,))


def sweep(db, now=AT_TEN):
    docs, sends = [], []
    out = run_sweep(
        db, dispatch_document=docs.append, dispatch_send=sends.append, now=now, settings=SETTINGS
    )
    return out, docs, sends


def reminders(db):
    return db.execute("select body, status from messages where kind='reminder'").fetchall()


def test_one_combined_reminder_listing_everything_outstanding(db, seed):
    age(db, seed, 2)
    out, _, sends = sweep(db)
    assert out["reminders"] == 1 and len(sends) == 1
    ((body, status),) = reminders(db)
    assert status == "queued" and "Residential sales contract" not in body
    assert "Sales contract" in body and "HOA addendum" in body and "https://mara.test/c/" in body
    assert body.startswith("Hi Enoch") and "Cedar & Stone Realty" in body
    assert db.execute(
        "select min(reminder_count), max(reminder_count) from checklist_items"
    ).fetchone() == (1, 1)
    assert ("mara", "reminder.queued") in db.execute(
        "select actor, action from audit_log"
    ).fetchall()


def test_cadence_day_two_day_four_then_every_three_days(db, seed):
    age(db, seed, 1)
    assert sweep(db)[0]["reminders"] == 0  # too early
    age(db, seed, 2)
    assert sweep(db)[0]["reminders"] == 1  # day 2
    db.execute("update messages set status='sent', sent_at = %s", (AT_TEN - timedelta(days=1),))
    db.execute("update checklist_items set last_reminded_at = %s", (AT_TEN - timedelta(days=1),))
    assert sweep(db)[0]["reminders"] == 0  # next is 2 days after the last
    db.execute("update checklist_items set last_reminded_at = %s", (AT_TEN - timedelta(days=2),))
    db.execute("update messages set sent_at = %s", (AT_TEN - timedelta(days=2),))
    assert sweep(db)[0]["reminders"] == 1  # day 4
    db.execute("update checklist_items set last_reminded_at = %s", (AT_TEN - timedelta(days=2),))
    db.execute("update messages set sent_at = %s, status='sent'", (AT_TEN - timedelta(days=2),))
    assert sweep(db)[0]["reminders"] == 0  # after that: every 3 days
    db.execute(
        "update checklist_items set created_at = %s, last_reminded_at = %s",
        (AT_TEN - timedelta(days=10), AT_TEN - timedelta(days=3)),
    )
    db.execute("update messages set sent_at = %s, status='sent'", (AT_TEN - timedelta(days=3),))
    assert sweep(db)[0]["reminders"] == 1


def test_only_at_the_clients_local_send_hour(db, seed):
    age(db, seed, 5)
    assert sweep(db, AT_TEN + timedelta(hours=1))[0]["reminders"] == 0
    assert sweep(db, AT_TEN - timedelta(hours=1))[0]["reminders"] == 0
    db.execute("update clients set timezone = 'Africa/Kampala'")  # UTC+3: 13:00 there
    assert sweep(db)[0]["reminders"] == 0
    assert sweep(db, AT_TEN - timedelta(hours=9))[0]["reminders"] == 1  # 10:00 in Kampala


def test_max_one_per_day_and_respects_opt_out_consent_and_deal_switch(db, seed):
    age(db, seed, 5)
    assert sweep(db)[0]["reminders"] == 1
    assert sweep(db)[0]["reminders"] == 0  # one is already queued today
    db.execute("delete from messages")
    db.execute("update checklist_items set last_reminded_at = null, reminder_count = 0")
    for sql in [
        "update clients set sms_opt_out_at = now()",
        "update clients set sms_opt_out_at = null, sms_consent_at = null",
        "update clients set sms_consent_at = now(); update deals set reminders_enabled = false",
        "update deals set reminders_enabled = true, status = 'complete'",
    ]:
        db.execute(sql)
        assert sweep(db)[0]["reminders"] == 0, sql


def test_nothing_outstanding_means_no_reminder(db, seed):
    age(db, seed, 5)
    db.execute("update checklist_items set status = 'complete'")
    assert sweep(db)[0]["reminders"] == 0
    db.execute("update checklist_items set status = 'review'")
    assert sweep(db)[0]["reminders"] == 0


def test_redispatches_stuck_documents_and_old_queued_messages(db, seed):
    doc = db.execute(
        "insert into documents (deal_id, checklist_item_id, status, created_at) "
        "values (%s,%s,'received',%s) returning id",
        (seed["deal"], seed["items"]["sales_contract"], AT_TEN - timedelta(minutes=30)),
    ).fetchone()[0]
    db.execute(
        "insert into documents (deal_id, checklist_item_id, version, status, created_at) "
        "values (%s,%s,2,'received',%s)",
        (seed["deal"], seed["items"]["hoa_addendum"], AT_TEN - timedelta(minutes=2)),
    )
    old = db.execute(
        "insert into messages (deal_id, client_id, kind, body, created_at) "
        "values (%s,%s,'invite','x',%s) returning id",
        (seed["deal"], seed["client"], AT_TEN - timedelta(minutes=10)),
    ).fetchone()[0]
    out, docs, sends = sweep(db)
    assert docs == [str(doc)] and str(old) in sends and out["documents"] == 1
