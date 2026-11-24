-- Mara (lean build) 7: explicit table privileges.
-- Older Supabase projects granted every public table to anon/authenticated/service_role by
-- default; newer projects don't. The RLS migration (0004) only revoked and narrowed, so on a
-- new project signed-in agents got "permission denied". Grant what 0004 assumed, explicitly.
-- RLS policies still decide which rows; 0004's column grants still limit writes.

grant usage on schema public to authenticated, service_role;

-- Signed-in staff read every table except the job queue; client_links keeps its
-- column-level select from 0004 (the secret hashes are never readable).
grant select on
  public.brokerages, public.users, public.document_types, public.deals, public.clients,
  public.checklist_items, public.documents, public.findings, public.messages,
  public.audit_log, public.ai_runs
to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- Mara (service role) keeps full access; the append-only guards in 0003 still apply by trigger.
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke update, delete, truncate on public.audit_log, public.ai_runs from service_role;
