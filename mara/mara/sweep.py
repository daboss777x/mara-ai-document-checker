"""hourly_sweep body (docs/CONTRACTS.md §4). The caller holds the advisory lock.

1. re-dispatch documents stuck in `received`;
2. re-dispatch queued messages (send_message itself decides: quiet hours, give-up age);
3. reminders: one combined SMS per client listing everything outstanding, at most
   `max_per_client_per_day`, only in the client's local `send_hour_local`.

Dispatching goes through callbacks so the Modal app can `.spawn()` and tests can call
the functions directly.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg

from mara.config import Reminders, load_document_types, load_reminders
from mara.dbutil import audit, many, one, run
from mara.outbound import compose
from mara.pipeline import stuck_documents
from mara.settings import MissingSettingError, Settings, get_settings

log = logging.getLogger("mara.sweep")

QUEUED_GRACE = timedelta(minutes=2)  # let the webhook path send first


def _tz(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "America/Chicago")
    except Exception:
        return ZoneInfo("America/Chicago")


def _gap_days(reminders: Reminders, count: int) -> int:
    days = reminders.cadence.days
    if count == 0:
        return days[0]
    if count < len(days):
        return days[count] - days[count - 1]
    return reminders.cadence.repeat_every_days


def _item_due(item: dict, fix_sent_at: datetime | None, reminders: Reminders, now, tz) -> bool:
    candidates = [item["last_reminded_at"], item["created_at"]]
    if item["status"] == "needs_fix":
        candidates.append(fix_sent_at)
    ref = max(d for d in candidates if d is not None)
    elapsed = (now.astimezone(tz).date() - ref.astimezone(tz).date()).days
    return elapsed >= _gap_days(reminders, item["reminder_count"])


def run_sweep(
    conn: psycopg.Connection,
    *,
    dispatch_document: Callable[[str], None],
    dispatch_send: Callable[[str], None],
    now: datetime | None = None,
    settings: Settings | None = None,
) -> dict:
    now = now or datetime.now(UTC)
    settings = settings or get_settings()
    reminders = load_reminders()
    summary = {"documents": 0, "messages": 0, "reminders": 0}

    for d in stuck_documents(conn, reminders.stuck_document_minutes, now):
        dispatch_document(str(d["id"]))
        summary["documents"] += 1

    for m in many(
        conn,
        "select id from public.messages where status = 'queued' and created_at < %s "
        "order by created_at limit 200",
        (now - QUEUED_GRACE,),
    ):
        dispatch_send(str(m["id"]))
        summary["messages"] += 1

    if not settings.public_site_url:
        log.warning("PUBLIC_SITE_URL not set; skipping reminders")
        return summary
    names = {t.key: t.name for t in load_document_types()}
    clients = many(
        conn,
        "select c.id, c.name, c.timezone, d.id as deal_id, d.property_address "
        "from public.clients c join public.deals d on d.id = c.deal_id "
        "where d.status = 'open' and d.reminders_enabled and c.sms_consent_at is not null "
        "and c.sms_opt_out_at is null",
    )
    for c in clients:
        tz = _tz(c["timezone"])
        local = now.astimezone(tz)
        if local.hour != reminders.send_hour_local:
            continue
        sent_today = one(
            conn,
            "select count(*) as n from public.messages where client_id = %s "
            "and kind in ('invite', 'reminder', 'fix_request') and status in ('queued', 'sent') "
            "and coalesce(sent_at, created_at) >= %s",
            (c["id"], local.replace(hour=0, minute=0, second=0, microsecond=0)),
        )["n"]
        if sent_today >= reminders.max_per_client_per_day:
            continue
        items = many(
            conn,
            "select id, document_type_key, status, last_reminded_at, reminder_count, created_at "
            "from public.checklist_items where deal_id = %s and status in ('missing', 'needs_fix') "
            "order by sort_order",
            (c["deal_id"],),
        )
        if not items:
            continue
        fix = one(
            conn,
            "select max(sent_at) as at from public.messages where deal_id = %s "
            "and kind = 'fix_request' and status = 'sent'",
            (c["deal_id"],),
        )["at"]
        if not any(_item_due(i, fix, reminders, now, tz) for i in items):
            continue
        try:
            with conn.transaction():
                body = compose.reminder_body(
                    conn,
                    c,
                    {"property_address": c["property_address"]},
                    [names.get(i["document_type_key"], i["document_type_key"]) for i in items],
                    settings,
                )
                msg = one(
                    conn,
                    "insert into public.messages (deal_id, client_id, kind, body, status) "
                    "values (%s, %s, 'reminder', %s, 'queued') returning id",
                    (c["deal_id"], c["id"], body),
                )
                run(
                    conn,
                    "update public.checklist_items set last_reminded_at = %s, "
                    "reminder_count = reminder_count + 1 where id = any(%s)",
                    (now, [i["id"] for i in items]),
                )
                audit(
                    conn,
                    c["deal_id"],
                    "mara",
                    "reminder.queued",
                    {"message_id": str(msg["id"]), "items": len(items)},
                )
        except MissingSettingError:
            log.warning("reminders need PUBLIC_SITE_URL; skipping")
            break
        dispatch_send(str(msg["id"]))
        summary["reminders"] += 1
    return summary
