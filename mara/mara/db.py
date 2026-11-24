"""Postgres connection helper (psycopg 3). DATABASE_URL is the Supabase service-role DSN."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg

from mara.settings import get_settings, require


def connect(dsn: str | None = None, *, autocommit: bool = True) -> psycopg.Connection:
    dsn = dsn or require(get_settings().database_url, "DATABASE_URL")
    return psycopg.connect(dsn, autocommit=autocommit)


@contextmanager
def connection(dsn: str | None = None) -> Iterator[psycopg.Connection]:
    conn = connect(dsn)
    try:
        yield conn
    finally:
        conn.close()
