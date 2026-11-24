"""Test harness: embedded Postgres 16 (pgserver) + a minimal Supabase shim (roles, auth.uid(), an
HMAC stand-in and a two-table storage schema), then every migration
and seed.sql in order. Each test runs inside a transaction that is rolled back."""

from __future__ import annotations

import contextlib
import shutil
import tempfile
from pathlib import Path

import pgserver
import psycopg
import pytest

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "migrations").glob("*.sql"))
SEED = ROOT / "seed.sql"

# Fixed seed IDs (see seed.sql header).
BROKERAGE = "b0000000-0000-4000-8000-000000000001"
BROKER = "a0000000-0000-4000-8000-000000000001"  # Margaret Holloway, broker
RACHEL = "a0000000-0000-4000-8000-000000000002"  # agent, owns all three seeded deals
DEAL_A = "d0000000-0000-4000-8000-000000000001"  # 2026-0142 1208 Barton Hills Dr (Enoch Omunu)
DEAL_B = "d0000000-0000-4000-8000-000000000002"  # 2026-0138 44 Rainey St #1802 (Priya Shah)
DEAL_C = "d0000000-0000-4000-8000-000000000003"  # 2026-0145 3310 Cherrywood Rd (Marcus Bell)
ENOCH = "c0000000-0000-4000-8000-000000000101"   # client on DEAL_A
ITEM_COMPLETE = "e3000000-0000-4000-8000-000000000101"   # buyer_rep_agreement
ITEM_REVIEW = "e3000000-0000-4000-8000-000000000102"     # sales_contract
ITEM_NEEDS_FIX = "e3000000-0000-4000-8000-000000000103"  # sellers_disclosure
ITEM_MISSING = "e3000000-0000-4000-8000-000000000104"    # lead_paint_addendum
ITEM_CHECKING = "e3000000-0000-4000-8000-000000000105"   # preapproval_letter
DOC_REVIEW = "e4000000-0000-4000-8000-000000000102"
# A second brokerage's people, created inside tests that need them.
OTHER_AGENT = "a0000000-0000-4000-8000-0000000000f2"  # agent in the same brokerage, no deals
OTHER_BROKER = "a0000000-0000-4000-8000-0000000000f9"  # broker of a different brokerage

# The bits of Supabase the migrations rely on. Real Supabase already has all of this.
SUPABASE_SHIM = """
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists extensions;
-- pgserver ships without pgcrypto, so stand in for pgcrypto's hmac(bytea, bytea, 'sha256') with a
-- pure-SQL HMAC-SHA256 (RFC 2104) on core sha256(). Tests verify its output independently in Python.
create or replace function extensions.hmac(data bytea, key bytea, type text) returns bytea
language plpgsql immutable as $$
declare
  k bytea := key; ipad bytea; opad bytea; i int;
begin
  if lower(type) <> 'sha256' then raise exception 'shim hmac supports sha256 only'; end if;
  if length(k) > 64 then k := sha256(k); end if;
  k := k || decode(repeat('00', 64 - length(k)), 'hex');
  ipad := k; opad := k;
  for i in 0..63 loop
    ipad := set_byte(ipad, i, get_byte(k, i) # 54);
    opad := set_byte(opad, i, get_byte(k, i) # 92);
  end loop;
  return sha256(opad || sha256(ipad || data));
end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Minimal stand-in for Supabase Storage: just the columns the migrations and policies use. Like real
-- Supabase, RLS is on for storage.objects and the API roles have table grants, so policies decide.
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null unique, owner uuid, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz not null default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text not null, owner uuid, metadata jsonb, created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
"""


@pytest.fixture(scope="session")
def db_uri():
    pgdata = Path(tempfile.mkdtemp(prefix="mara-pg-"))
    server = pgserver.get_server(pgdata, cleanup_mode="stop")
    uri = server.get_uri()
    with psycopg.connect(uri, autocommit=True) as conn:
        conn.execute(SUPABASE_SHIM)
        for path in MIGRATIONS:
            try:
                conn.execute(path.read_text())
            except psycopg.Error as e:  # pragma: no cover - surfaces the failing file
                raise RuntimeError(f"migration {path.name} failed: {e}") from e
        conn.execute(SEED.read_text())
    yield uri
    server.cleanup()
    shutil.rmtree(pgdata, ignore_errors=True)


@pytest.fixture(scope="session")
def _conn(db_uri):
    with psycopg.connect(db_uri) as conn:
        yield conn


@pytest.fixture
def db(_conn):
    """A connection inside a transaction that is always rolled back."""
    with _conn.transaction(force_rollback=True):
        yield _conn


def add_staff(conn: psycopg.Connection) -> None:
    """Add an agent without deals (same brokerage) and a broker of another brokerage."""
    conn.execute("insert into auth.users (id, email) values (%s, 'other.agent@example.com'), "
                 "(%s, 'other.broker@example.com')", (OTHER_AGENT, OTHER_BROKER))
    other = conn.execute("insert into public.brokerages (name) values ('Other Realty') returning id").fetchone()[0]
    conn.execute("insert into public.users (id, brokerage_id, role, name) values (%s, %s, 'agent', 'Sam Other')",
                 (OTHER_AGENT, BROKERAGE))
    conn.execute("insert into public.users (id, brokerage_id, role, name) values (%s, %s, 'broker', 'Bo Other')",
                 (OTHER_BROKER, other))


def set_user(conn: psycopg.Connection, user_id: str | None, role: str = "authenticated") -> None:
    """Act as a Supabase role (transaction-local), optionally with a JWT sub."""
    conn.execute(f"set local role {role}")
    conn.execute("select set_config('request.jwt.claim.sub', %s, true)", (user_id or "",))


def reset_user(conn: psycopg.Connection) -> None:
    conn.execute("reset role")
    conn.execute("select set_config('request.jwt.claim.sub', '', true)")


@contextlib.contextmanager
def savepoint(conn: psycopg.Connection):
    """Let a statement fail without aborting the surrounding test transaction."""
    with conn.transaction():
        yield
