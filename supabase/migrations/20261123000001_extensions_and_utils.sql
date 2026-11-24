-- Mara (lean build) 1 of 6: extensions and shared utility functions.
-- Works on Supabase and on plain Postgres 16 (the pytest harness adds a small Supabase shim first).

-- pgcrypto (hmac for the Mara webhook signature): Supabase keeps it in schema "extensions".
-- Only created where the extension is available (the pgserver test build doesn't ship it).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pgcrypto')
     and not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    if exists (select 1 from pg_namespace where nspname = 'extensions') then
      create extension pgcrypto with schema extensions;
    else
      create extension pgcrypto;
    end if;
  end if;
end $$;

-- pg_net (HTTP from Postgres) for the Mara webhook trigger. Only where available (Supabase).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and not exists (select 1 from pg_extension where extname = 'pg_net') then
    create extension pg_net;
  end if;
end $$;

-- updated_at maintenance, attached to every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Raise on any UPDATE / DELETE / TRUNCATE. Used for append-only tables (audit_log, ai_runs).
create or replace function public.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

-- Raise on DELETE. Used where rows must never be hard-deleted (documents: mark superseded instead).
create or replace function public.forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are never hard-deleted (CLAUDE.md rule 3)', tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;
