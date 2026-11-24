-- Mara (lean build) 5 of 6: Storage buckets and storage RLS.
--
--  * uploads-staging: private. Clients upload with a signed upload URL that Mara creates with the
--    service role (CONTRACTS section 4). No user policies at all.
--  * deal-files: private. Only the service role writes (Mara, via FileStore). Staff read objects of
--    deals they can see; they fetch them through 60-second signed URLs created server-side.
--  * Object key: deals/{deal_number}/{document_type_key}/{document_id}.{ext}
--
-- The helper functions are plain SQL and always installed; the bucket and policy parts are skipped on
-- plain Postgres with no storage schema.

-- 'deals/2026-0142/sales_contract/<id>.pdf' -> '2026-0142'; anything else -> null.
create or replace function public.deal_number_from_path(path text)
returns text
language sql immutable
set search_path = ''
as $$
  select case when split_part(path, '/', 1) = 'deals' and split_part(path, '/', 2) <> ''
              then split_part(path, '/', 2) end
$$;

-- Same visibility rule as can_see_deal, keyed by deal_number (unique per brokerage; can_see_deal pins
-- the caller's brokerage).
create or replace function public.can_see_deal_number(p_deal_number text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.deals d
    where d.deal_number = p_deal_number and public.can_see_deal(d.id)
  )
$$;
revoke all on function public.can_see_deal_number(text) from public;
grant execute on function public.can_see_deal_number(text) to authenticated, service_role;

-- TODO(decision): 25 MiB limit (CONTRACTS section 5) and the MIME list (PDF, DOCX, JPG, PNG) are defaults.
do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice 'storage schema not present; skipping buckets and policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  select b, b, false, 26214400,
         array['application/pdf',
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
               'image/jpeg', 'image/png']
  from unnest(array['uploads-staging', 'deal-files']) as b
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  -- Staff read objects of deals they can see. Anything outside deals/ is not readable by users.
  execute 'drop policy if exists deal_files_staff_select on storage.objects';
  execute $p$
    create policy deal_files_staff_select on storage.objects
      for select to authenticated
      using (bucket_id = 'deal-files'
             and public.can_see_deal_number(public.deal_number_from_path(name)))
  $p$;

  -- No user writes to either Mara bucket, ever. Restrictive, so they hold even if a permissive
  -- policy is added later. Other buckets are unaffected.
  execute 'drop policy if exists mara_buckets_no_user_insert on storage.objects';
  execute $p$
    create policy mara_buckets_no_user_insert on storage.objects
      as restrictive for insert to anon, authenticated
      with check (bucket_id not in ('deal-files', 'uploads-staging'))
  $p$;
  execute 'drop policy if exists mara_buckets_no_user_update on storage.objects';
  execute $p$
    create policy mara_buckets_no_user_update on storage.objects
      as restrictive for update to anon, authenticated
      using (bucket_id not in ('deal-files', 'uploads-staging'))
      with check (bucket_id not in ('deal-files', 'uploads-staging'))
  $p$;
  execute 'drop policy if exists mara_buckets_no_user_delete on storage.objects';
  execute $p$
    create policy mara_buckets_no_user_delete on storage.objects
      as restrictive for delete to anon, authenticated
      using (bucket_id not in ('deal-files', 'uploads-staging'))
  $p$;
  -- Staging objects are not readable by users either (the select policy above covers deal-files only).
end $$;
