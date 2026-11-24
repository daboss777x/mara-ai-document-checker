"""The ONLY place in Mara that calls an SMS provider (CLAUDE.md rules 1 and 6).

send_message() sends one `messages` row, and only when ALL of these hold:
  1. send rule: kind is invite / verify_code / reminder (system templates), or
     kind is fix_request AND approved_by is set (the agent's click);
  2. the client gave consent and has not opted out;
  3. it is outside quiet hours in the client's timezone (otherwise it stays queued
     for the sweep);
  4. the outbound content filter passes (no banking/wiring details, no legal or
     financial advice).
Every decision is written to `messages` and `audit_log`.

tests/test_send_boundary.py fails if any other module calls a provider or imports
mara.outbound.providers.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import psycopg
from psycopg import sql

from mara.config import load_reminders
from mara.dbutil import audit, one, run
from mara.outbound import compose
from mara.outbound.filter import check_outbound
from mara.outbound.providers import (
    EgoSmsProvider,
    ProviderPermanentError,
    ProviderTransientError,
    SmsProvider,
)
from mara.settings import MissingSettingError, Settings, get_settings

log = logging.getLogger("mara.outbound")

SYSTEM_KINDS = frozenset({"invite", "verify_code", "reminder"})
GIVE_UP_AFTER = timedelta(hours=24)
VERIFY_CODE_TTL = timedelta(minutes=15)


@dataclass(frozen=True)
class Outcome:
    status: str  # sent | blocked | deferred | failed | skipped
    reason: str | None = None


def _may_send(kind: str, approved_by) -> bool:
    return kind in SYSTEM_KINDS or (kind == "fix_request" and approved_by is not None)


def _set(conn, m: dict, status: str, **cols) -> None:
    assignments = sql.SQL(", ").join(
        sql.SQL("{} = %s").format(sql.Identifier(k)) for k in ("status", *cols)
    )
    query = sql.SQL("update public.messages set {} where id = %s").format(assignments)
    with conn.cursor() as cur:
        cur.execute(query, (status, *cols.values(), m["id"]))


def _finish(conn, m: dict, status: str, reason: str | None, **cols) -> Outcome:
    if status != "sent":
        cols["error"] = reason
    _set(conn, m, status, **cols)
    audit(
        conn,
        m["deal_id"],
        "mara",
        f"message.{status}",
        {"message_id": str(m["id"]), "kind": m["kind"], "reason": reason},
    )
    return Outcome(status, reason)


def send_message(
    conn: psycopg.Connection,
    message_id,
    *,
    provider: SmsProvider | None = None,
    now: datetime | None = None,
    settings: Settings | None = None,
) -> Outcome:
    now = now or datetime.now(UTC)
    settings = settings or get_settings()
    with conn.transaction():
        m = one(
            conn,
            "select m.id, m.deal_id, m.client_id, m.kind, m.body, m.status, m.approved_by, "
            "m.created_at, c.name as client_name, c.phone, c.sms_consent_at, c.sms_opt_out_at, "
            "c.timezone from public.messages m join public.clients c on c.id = m.client_id "
            "where m.id = %s for update of m skip locked",
            (message_id,),
        )
        if m is None or m["status"] != "queued":
            return Outcome("skipped", "not_found_or_not_queued")
        return _decide(conn, m, provider, now, settings)


def _decide(conn, m: dict, provider: SmsProvider | None, now: datetime, settings: Settings):
    kind = m["kind"]
    # 1. send rule
    if not _may_send(kind, m["approved_by"]):
        return _finish(conn, m, "blocked", "not_approved")
    # demo without SMS: record it, send nothing
    if settings.mara_sms_mode == "off":
        return _finish(conn, m, "blocked", "sms_disabled")
    # 2. consent and opt-out (a code the client asked for ignores opt-out, never consent)
    if not m["phone"]:
        return _finish(conn, m, "blocked", "no_phone")
    if m["sms_consent_at"] is None:
        return _finish(conn, m, "blocked", "no_consent")
    if m["sms_opt_out_at"] is not None and kind != "verify_code":
        return _finish(conn, m, "blocked", "opted_out")
    # stale messages are not worth sending any more
    ttl = VERIFY_CODE_TTL if kind == "verify_code" else GIVE_UP_AFTER
    if now - m["created_at"] > ttl:
        return _finish(conn, m, "failed", "expired_unsent")
    # 3. quiet hours in the client's timezone (not for a code the client just asked for)
    if kind != "verify_code":
        try:
            tz = ZoneInfo(m["timezone"] or "America/Chicago")
        except Exception:
            tz = ZoneInfo("America/Chicago")
        if load_reminders().quiet_hours.contains(now.astimezone(tz).time()):
            return Outcome("deferred", "quiet_hours")
    # Bodies come from the writer (web: invite and fix_request; Mara: reminder and code).
    body = (m["body"] or "").strip()
    try:
        if not body:
            return _finish(conn, m, "blocked", "empty_body")
        # 4. content filter (on the text before the portal-link footer is added)
        verdict = check_outbound(body)
        if verdict.blocked:
            return _finish(conn, m, "blocked", verdict.reason)
        if kind == "fix_request" and "/c/" not in body:
            body = compose.with_fix_footer(conn, m["client_id"], body, settings)
    except MissingSettingError as exc:
        log.warning("send_message %s waiting on config: %s", m["id"], exc)
        return Outcome("deferred", "missing_setting")

    if provider is None:
        try:
            provider = EgoSmsProvider.from_settings(settings)
        except MissingSettingError as exc:
            log.warning(
                "send_message %s: SMS provider not configured (%s); leaving queued", m["id"], exc
            )
            return Outcome("deferred", "provider_not_configured")

    try:
        result = provider.send(m["phone"], body)
    except ProviderTransientError as exc:
        log.warning("send_message %s: transient provider error: %s", m["id"], exc)
        run(conn, "update public.messages set error = %s where id = %s", (str(exc)[:500], m["id"]))
        return Outcome("deferred", "provider_unavailable")
    except ProviderPermanentError as exc:
        return _finish(conn, m, "failed", str(exc)[:500])
    return _finish(
        conn,
        m,
        "sent",
        None,
        body=body,
        provider_message_id=result.provider_message_id,
        sent_at=now,
        error=None,
    )
