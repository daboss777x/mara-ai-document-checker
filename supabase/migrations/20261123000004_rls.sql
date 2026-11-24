-- Mara (lean build) 4 of 6: row-level security.
--
--   agent  -> deals where deals.agent_id = auth.uid(), and everything under them
--   broker -> every deal in their brokerage
--   anon   -> nothing (no policies, privileges revoked)
--   client -> NOT a Supabase auth user. Every client-portal read and write goes through Mara's
--             /client/* endpoints with the service role (CONTRACTS section 4). The service role
--             bypasses RLS; Mara enforces permissions in code.
--   mara_jobs -> service role only (RLS on, no policies).
--
-- Agents write only what the review screen needs: checklist items, findings, a few deal and client
-- columns, approved fix_request and invite messages, their own audit entries, and the rows that
-- create a deal (deal, client, items, client link). Documents and ai_runs are written by Mara only.
-- Column grants (below) keep the rest of each row out of reach.

-- ---------------------------------------------------------------------------
-- Helpers (security definer so policies can read users/deals without recursing through RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_staff_of(p_brokerage_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.users u
                 where u.id = auth.uid() and u.brokerage_id = p_brokerage_id)
$$;

create or replace function public.can_see_deal(p_deal_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.deals d
    join public.users u on u.id = auth.uid() and u.brokerage_id = d.brokerage_id
    where d.id = p_deal_id
      and (u.role = 'broker' or d.agent_id = u.id)
  )
$$;

create or replace function public.deal_of_checklist_item(p_item_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$ select ci.deal_id from public.checklist_items ci where ci.id = p_item_id $$;

create or replace function public.deal_of_client(p_client_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$ select c.deal_id from public.clients c where c.id = p_client_id $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.is_staff_of(uuid)', 'public.can_see_deal(uuid)',
    'public.deal_of_checklist_item(uuid)', 'public.deal_of_client(uuid)'
  ] loop
    execute format('revoke execute on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function %s from anon', f);
    end if;
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- RLS on every table; anon gets no privileges at all
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Column-level limits for signed-in staff (service_role keeps everything)
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on
  public.brokerages, public.users, public.document_types, public.documents, public.findings,
  public.ai_runs, public.mara_jobs, public.checklist_items, public.clients, public.deals,
  public.client_links, public.messages, public.audit_log
from authenticated;
revoke all on public.mara_jobs from authenticated;

-- deals: status is derived from the checklist, brokerage/agent/number never change.
grant insert on public.deals to authenticated;
grant update (property_address, city, state, zip, reminders_enabled) on public.deals to authenticated;
-- clients: consent and opt-out are set when the client agrees / opts out, not edited afterwards.
grant insert on public.clients to authenticated;
grant update (name, phone, email, timezone) on public.clients to authenticated;
-- checklist items: the review screen's decisions.
grant insert on public.checklist_items to authenticated;
grant update (status, fix_note, due_date, sort_order) on public.checklist_items to authenticated;
-- findings: dismiss / reopen.
grant update (status) on public.findings to authenticated;
-- client links: staff can create and revoke but never read the secret hashes.
revoke select on public.client_links from authenticated;
grant select (id, client_id, expires_at, revoked_at, last_used_at, verified_at, created_at)
  on public.client_links to authenticated;
grant insert on public.client_links to authenticated;
grant update (revoked_at, expires_at) on public.client_links to authenticated;
-- messages and audit entries: insert only, and the policies below say which kinds.
grant insert on public.messages to authenticated;
grant insert on public.audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------
create policy brokerages_select on public.brokerages for select to authenticated
  using (public.is_staff_of(id));

create policy users_select on public.users for select to authenticated
  using (public.is_staff_of(brokerage_id));

-- Reference data: every signed-in staff member can read the list.
create policy document_types_select on public.document_types for select to authenticated
  using (true);

-- deals
-- "agent_id = auth.uid()" is checked on the row itself (not via can_see_deal) so that
-- INSERT ... RETURNING works: a security-definer lookup cannot see the row being inserted.
create policy deals_select on public.deals for select to authenticated
  using (agent_id = auth.uid() or public.can_see_deal(id));
create policy deals_insert on public.deals for insert to authenticated
  with check (agent_id = auth.uid() and public.is_staff_of(brokerage_id));
create policy deals_update on public.deals for update to authenticated
  using (public.can_see_deal(id)) with check (public.can_see_deal(id));

-- clients
create policy clients_select on public.clients for select to authenticated
  using (public.can_see_deal(deal_id));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.can_see_deal(deal_id));
create policy clients_update on public.clients for update to authenticated
  using (public.can_see_deal(deal_id)) with check (public.can_see_deal(deal_id));

-- client_links (secret columns are not granted at all)
create policy client_links_select on public.client_links for select to authenticated
  using (public.can_see_deal(public.deal_of_client(client_id)));
create policy client_links_insert on public.client_links for insert to authenticated
  with check (public.can_see_deal(public.deal_of_client(client_id)));
create policy client_links_update on public.client_links for update to authenticated
  using (public.can_see_deal(public.deal_of_client(client_id)))
  with check (public.can_see_deal(public.deal_of_client(client_id)));

-- checklist items
create policy checklist_items_select on public.checklist_items for select to authenticated
  using (public.can_see_deal(deal_id));
create policy checklist_items_insert on public.checklist_items for insert to authenticated
  with check (public.can_see_deal(deal_id));
create policy checklist_items_update on public.checklist_items for update to authenticated
  using (public.can_see_deal(deal_id)) with check (public.can_see_deal(deal_id));

-- documents: staff read only; Mara writes with the service role.
create policy documents_select on public.documents for select to authenticated
  using (public.can_see_deal(deal_id));

-- findings: staff read and dismiss; Mara writes.
create policy findings_select on public.findings for select to authenticated
  using (public.can_see_deal(public.deal_of_checklist_item(checklist_item_id)));
create policy findings_update on public.findings for update to authenticated
  using (public.can_see_deal(public.deal_of_checklist_item(checklist_item_id)))
  with check (public.can_see_deal(public.deal_of_checklist_item(checklist_item_id)));

-- messages: staff read; staff may only create an invite, or a fix_request they approve themselves.
-- reminder and verify_code are system messages written by Mara (service role).
create policy messages_select on public.messages for select to authenticated
  using (public.can_see_deal(deal_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    public.can_see_deal(deal_id)
    and public.deal_of_client(client_id) = deal_id
    and status = 'queued'
    and (
      kind = 'invite'
      or (kind = 'fix_request' and approved_by = auth.uid())
    )
  );

-- audit_log: staff read their deals' entries and append their own decisions.
create policy audit_log_select on public.audit_log for select to authenticated
  using (deal_id is not null and public.can_see_deal(deal_id));
create policy audit_log_insert on public.audit_log for insert to authenticated
  with check (actor = 'agent' and actor_id = auth.uid()
              and deal_id is not null and public.can_see_deal(deal_id));

-- ai_runs: same visibility as the document they were run on (read only).
create policy ai_runs_select on public.ai_runs for select to authenticated
  using (deal_id is not null and public.can_see_deal(deal_id));

-- mara_jobs: RLS on, no policies: service role only.
