-- Mara (lean build) 3 of 6: append-only logs, never-delete documents, automatic state.

-- ---------------------------------------------------------------------------
-- audit_log and ai_runs are append-only (CLAUDE.md rule 5). Triggers stop everyone, including the
-- service role and the table owner.
-- ---------------------------------------------------------------------------
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.forbid_mutation();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function public.forbid_mutation();

create trigger ai_runs_append_only before update or delete on public.ai_runs
  for each row execute function public.forbid_mutation();
create trigger ai_runs_no_truncate before truncate on public.ai_runs
  for each statement execute function public.forbid_mutation();

do $$
declare r text;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke update, delete, truncate on public.audit_log from %I', r);
      execute format('revoke update, delete, truncate on public.ai_runs from %I', r);
    end if;
  end loop;
end $$;

-- Documents are never hard-deleted (CLAUDE.md rule 3).
create trigger documents_no_delete before delete on public.documents
  for each row execute function public.forbid_delete();

-- ---------------------------------------------------------------------------
-- Deal status follows the checklist: complete when every non-waived item is complete,
-- back to open as soon as one is not (reopened, new item, ...). A deal whose items are all
-- waived (or that has none yet) keeps its current status.
-- ---------------------------------------------------------------------------
create or replace function public.sync_deal_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deal  uuid := coalesce(new.deal_id, old.deal_id);
  v_total int;
  v_open  int;
begin
  select count(*) filter (where status <> 'waived'),
         count(*) filter (where status not in ('waived','complete'))
    into v_total, v_open
    from public.checklist_items where deal_id = v_deal;

  if v_total > 0 and v_open = 0 then
    update public.deals set status = 'complete' where id = v_deal and status <> 'complete';
  elsif v_open > 0 then
    update public.deals set status = 'open' where id = v_deal and status <> 'open';
  end if;
  return null;
end;
$$;
revoke execute on function public.sync_deal_status() from public;

create trigger checklist_items_sync_deal
  after insert or delete or update of status, deal_id on public.checklist_items
  for each row execute function public.sync_deal_status();

-- ---------------------------------------------------------------------------
-- Stamp who decided, from the session, so a client of the Data API cannot spoof it.
-- Without a session (service role / Mara) the supplied values are kept.
-- ---------------------------------------------------------------------------
create or replace function public.stamp_item_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'complete' and (tg_op = 'INSERT' or old.status is distinct from 'complete') then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(auth.uid(), new.completed_by);
  elsif new.status <> 'complete' then
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;
create trigger checklist_items_stamp_completion before insert or update on public.checklist_items
  for each row execute function public.stamp_item_completion();

create or replace function public.stamp_finding_dismissal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'dismissed' and old.status is distinct from 'dismissed' then
    new.dismissed_by := coalesce(auth.uid(), new.dismissed_by);
  elsif new.status = 'open' then
    new.dismissed_by := null;
  end if;
  return new;
end;
$$;
create trigger findings_stamp_dismissal before update on public.findings
  for each row execute function public.stamp_finding_dismissal();

create or replace function public.stamp_message_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.approved_by is not null then
    new.approved_at := coalesce(new.approved_at, now());
  end if;
  return new;
end;
$$;
create trigger messages_stamp_approval before insert on public.messages
  for each row execute function public.stamp_message_approval();
