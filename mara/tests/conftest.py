"""Shared fixtures. Postgres 16 runs embedded via pgserver; nothing external is called.

The schema is Kwame's real migration (supabase/migrations/*_schema.sql), so these tests
break if Mara's SQL drifts from the contract.
"""

from __future__ import annotations

import re
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
import pytest

from mara.security.tokens import sha256_hex

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_SQL = next((ROOT / "supabase" / "migrations").glob("*_schema.sql"))

PRELUDE = """
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create table if not exists auth_users_stub (id uuid primary key);
"""

TOKEN = "mara-test-token-0142"
TABLES = (
    "brokerages, users, deals, clients, client_links, checklist_items, documents, findings, "
    "messages, audit_log, ai_runs, mara_jobs"
)


def schema_ddl() -> str:
    sql = SCHEMA_SQL.read_text()
    return re.sub(r"references auth\.users\(id\)( on delete cascade)?", "", sql)


@pytest.fixture(scope="session")
def pg_dsn(tmp_path_factory):
    pgserver = pytest.importorskip("pgserver")
    srv = pgserver.get_server(str(tmp_path_factory.mktemp("pgdata")), cleanup_mode="stop")
    dsn = srv.get_uri()
    with psycopg.connect(dsn, autocommit=True) as conn:
        conn.execute("drop schema public cascade; create schema public;")
        conn.execute(PRELUDE)
        conn.execute(schema_ddl())
    yield dsn
    srv.cleanup()


@pytest.fixture
def db(pg_dsn):
    with psycopg.connect(pg_dsn, autocommit=True) as conn:
        conn.execute(f"truncate {TABLES} cascade")
        yield conn


@pytest.fixture
def conn_factory(pg_dsn):
    @contextmanager
    def factory():
        with psycopg.connect(pg_dsn, autocommit=True) as conn:
            yield conn

    return factory


@pytest.fixture
def seed(db):
    """One deal: Rachel Kim's client Enoch, consent given, two missing items, one link."""

    def one(sql, *params):
        return db.execute(sql, params).fetchone()[0]

    brokerage = one("insert into brokerages (name) values ('Cedar & Stone Realty') returning id")
    agent = one(
        "insert into users (id, brokerage_id, role, name, phone) "
        "values (gen_random_uuid(), %s, 'agent', 'Rachel Kim', '+15125550100') returning id",
        brokerage,
    )
    deal = one(
        "insert into deals (brokerage_id, agent_id, property_address, city, zip) "
        "values (%s, %s, '1208 Barton Hills Dr', 'Austin', '78704') returning id",
        brokerage,
        agent,
    )
    client = one(
        "insert into clients (deal_id, name, phone, sms_consent_at) "
        "values (%s, 'Enoch Omunu', '+15125550142', now()) returning id",
        deal,
    )
    link = one(
        "insert into client_links (client_id, token_hash, expires_at) "
        "values (%s, %s, %s) returning id",
        client,
        sha256_hex(TOKEN),
        datetime.now(UTC) + timedelta(days=30),
    )
    items = {}
    for i, key in enumerate(["sales_contract", "hoa_addendum"]):
        items[key] = one(
            "insert into checklist_items (deal_id, document_type_key, sort_order) "
            "values (%s, %s, %s) returning id",
            deal,
            key,
            i,
        )
    deal_number = one("select deal_number from deals where id = %s", deal)
    return {
        "brokerage": brokerage,
        "agent": agent,
        "deal": deal,
        "deal_number": deal_number,
        "client": client,
        "link": link,
        "items": items,
        "token": TOKEN,
        "new_id": uuid.uuid4,
    }
