-- Mara (lean build) 6 of 6: Supabase -> Mara POST /events (CONTRACTS sections 3 and 4).
--
-- Events (body is exactly {"type": ..., "id": ...}):
--   document.created  documents INSERT with status 'received', or UPDATE to 'received'
--   message.queued    messages INSERT with status 'queued'
--
-- mara.notify_event() signs the body with
--   v1 = hex(HMAC_SHA256(mara_hmac_secret, "<t>.<body>"))
-- and sends it with pg_net:
--   X-Mara-Signature: t=<unix_seconds>,v1=<hex>
-- <body> is exactly body::text of the jsonb passed to net.http_post (pg_net sends body::text as
-- UTF-8), so the receiver must verify against the raw request bytes, never a re-serialisation.
--
-- URL and secret come from Supabase Vault ('mara_events_url', 'mara_hmac_secret').
-- If pg_net, Vault, pgcrypto's hmac() or the secrets are missing, or anything at all fails, the
-- function returns quietly: a user's write is never blocked by the webhook. The hourly sweep is
-- the safety net for missed events.

create schema if not exists mara;
revoke all on schema mara from public;

create or replace function mara.notify_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type   text;
  v_url    text;
  v_secret text;
  v_crypto text;
  v_body   jsonb;
  v_t      text;
  v_sig    text;
begin
  if tg_table_name = 'documents' then
    v_type := 'document.created';
  elsif tg_table_name = 'messages' then
    v_type := 'message.queued';
  else
    return new;
  end if;

  -- Quiet no-op when the Supabase pieces aren't installed (local tests, plain Postgres).
  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null
     or to_regclass('vault.decrypted_secrets') is null then
    return new;
  end if;

  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into v_url using 'mara_events_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into v_secret using 'mara_hmac_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return new;
  end if;

  -- pgcrypto's hmac(bytea, bytea, text): Supabase installs it in "extensions", plain Postgres in "public".
  if to_regprocedure('extensions.hmac(bytea,bytea,text)') is not null then
    v_crypto := 'extensions';
  elsif to_regprocedure('public.hmac(bytea,bytea,text)') is not null then
    v_crypto := 'public';
  else
    return new;
  end if;

  v_body := jsonb_build_object('type', v_type, 'id', new.id::text);
  v_t := extract(epoch from clock_timestamp())::bigint::text;

  execute format(
    'select encode(%I.hmac(convert_to($1, ''UTF8''), convert_to($2, ''UTF8''), ''sha256''), ''hex'')',
    v_crypto)
    into v_sig using v_t || '.' || v_body::text, v_secret;

  execute 'select net.http_post(url := $1, body := $2, params := $3, headers := $4, timeout_milliseconds := $5)'
    using v_url,
          v_body,
          '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json',
                             'X-Mara-Signature', 't=' || v_t || ',v1=' || v_sig),
          5000;

  return new;
exception when others then
  raise warning 'mara.notify_event skipped (% on %): %', v_type, tg_table_name, sqlerrm;
  return new;
end;
$$;
revoke execute on function mara.notify_event() from public;

create trigger documents_notify_insert
  after insert on public.documents
  for each row when (new.status = 'received')
  execute function mara.notify_event();

create trigger documents_notify_received
  after update of status on public.documents
  for each row when (new.status = 'received' and old.status is distinct from 'received')
  execute function mara.notify_event();

create trigger messages_notify_queued
  after insert on public.messages
  for each row when (new.status = 'queued')
  execute function mara.notify_event();
