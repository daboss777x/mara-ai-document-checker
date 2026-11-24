"""Idempotent jobs on public.mara_jobs (docs/CONTRACTS.md §3) and the sweep lock."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from uuid import UUID

import psycopg

SWEEP_LOCK_NAME = "mara.hourly_sweep"


def idempotency_key(event_type: str, record_id: UUID | str) -> str:
    return f"{event_type}:{record_id}"


def claim(
    conn: psycopg.Connection, key: str, kind: str, ref_id: UUID | str | None = None
) -> UUID | None:
    """Insert a queued job. Returns its id, or None if the key was already claimed."""
    with conn.cursor() as cur:
        cur.execute(
            "insert into public.mara_jobs (idempotency_key, kind, ref_id) values (%s, %s, %s) "
            "on conflict (idempotency_key) do nothing returning id",
            (key, kind, ref_id),
        )
        row = cur.fetchone()
    if not conn.autocommit:
        conn.commit()
    return row[0] if row else None


def _exec(conn: psycopg.Connection, sql: str, params: tuple) -> None:
    with conn.cursor() as cur:
        cur.execute(sql, params)
    if not conn.autocommit:
        conn.commit()


def mark_running(conn: psycopg.Connection, job_id: UUID | str) -> None:
    _exec(
        conn,
        "update public.mara_jobs set status = 'running', attempts = attempts + 1, "
        "updated_at = now() where id = %s",
        (job_id,),
    )


def mark_done(conn: psycopg.Connection, job_id: UUID | str) -> None:
    _exec(
        conn,
        "update public.mara_jobs set status = 'done', last_error = null, updated_at = now() "
        "where id = %s",
        (job_id,),
    )


def mark_failed(conn: psycopg.Connection, job_id: UUID | str, error: str) -> None:
    _exec(
        conn,
        "update public.mara_jobs set status = 'failed', last_error = %s, updated_at = now() "
        "where id = %s",
        (error[:4000], job_id),
    )


@contextmanager
def sweep_lock(conn: psycopg.Connection) -> Iterator[bool]:
    """Session-level advisory lock. Yields True if this connection holds it.

    Use a dedicated connection for the whole sweep: the lock belongs to the session.
    """
    with conn.cursor() as cur:
        cur.execute("select pg_try_advisory_lock(hashtext(%s))", (SWEEP_LOCK_NAME,))
        got = bool(cur.fetchone()[0])
    try:
        yield got
    finally:
        if got:
            with conn.cursor() as cur:
                cur.execute("select pg_advisory_unlock(hashtext(%s))", (SWEEP_LOCK_NAME,))
