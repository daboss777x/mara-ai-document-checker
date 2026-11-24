"""Tiny psycopg helpers: dict rows and JSON params."""

from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb


def one(conn: psycopg.Connection, sql: str, params: tuple | dict = ()) -> dict[str, Any] | None:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return cur.fetchone()


def many(conn: psycopg.Connection, sql: str, params: tuple | dict = ()) -> list[dict[str, Any]]:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def run(conn: psycopg.Connection, sql: str, params: tuple | dict = ()) -> int:
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.rowcount


def audit(
    conn: psycopg.Connection,
    deal_id,
    actor: str,
    action: str,
    details: dict | None = None,
    actor_id=None,
) -> None:
    """Append to audit_log. Never put secrets or file contents in `details`."""
    run(
        conn,
        "insert into public.audit_log (deal_id, actor, actor_id, action, details_json) "
        "values (%s, %s, %s, %s, %s)",
        (deal_id, actor, actor_id, action, Jsonb(details or {})),
    )


def record_ai_run(
    conn: psycopg.Connection,
    *,
    deal_id,
    document_id,
    purpose: str,
    model: str,
    prompt_version: str,
    input_tokens: int | None,
    output_tokens: int | None,
    cost_usd: float | None,
    output_json: dict,
) -> None:
    run(
        conn,
        "insert into public.ai_runs (deal_id, document_id, purpose, model, prompt_version, "
        "input_tokens, output_tokens, cost_usd, output_json) "
        "values (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
        (
            deal_id,
            document_id,
            purpose,
            model,
            prompt_version,
            input_tokens,
            output_tokens,
            cost_usd,
            Jsonb(output_json),
        ),
    )
