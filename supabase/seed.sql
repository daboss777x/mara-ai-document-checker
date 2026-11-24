-- Mara seed: Cedar & Stone Realty (FICTITIOUS). No real people or documents. Phones are
-- +1 512 555-01xx, emails are @example.com. Idempotent (on conflict do nothing).
-- "Today" in the story is Monday, Nov 24 2026 (America/Chicago, UTC-6).
-- No storage objects are seeded: file_path values name files that do not exist (demo mode uses a
-- placeholder PDF). sha256 values are stand-ins. No seeded row fires a Mara webhook: documents are
-- never 'received' and messages are never 'queued'.
--
-- FIXED IDS (web demo-mode fixtures use these exact values)
--   brokerage b0000000-0000-4000-8000-000000000001  Cedar & Stone Realty
--   users     a0000000-0000-4000-8000-000000000001  Margaret Holloway (broker)
--             a0000000-0000-4000-8000-000000000002  Rachel Kim (agent, owns all three deals)
--   deals     d0000000-0000-4000-8000-000000000001  2026-0142  1208 Barton Hills Dr, Austin TX 78704
--             d0000000-0000-4000-8000-000000000002  2026-0138  44 Rainey St #1802, Austin TX 78701
--             d0000000-0000-4000-8000-000000000003  2026-0145  3310 Cherrywood Rd, Austin TX 78722
--   clients   c0000000-0000-4000-8000-000000000101  Enoch Omunu (0142)   +15125550142
--             c0000000-0000-4000-8000-000000000201  Priya Shah (0138)    +15125550138
--             c0000000-0000-4000-8000-000000000301  Marcus Bell (0145)   +15125550145
--   checklist items  e3000000-0000-4000-8000-0000000DDNNN-style: e3..0101-0106 (deal 0142), 0201-0203, 0301-0303
--   documents        e4..0101 ... ; findings e5..; messages e9..; audit_log ed..; ai_runs ee..
--
-- Deal 2026-0142 (Enoch), one item in every status:
--   0101 buyer_rep_agreement  complete   (doc v1 checked, no findings)
--   0102 sales_contract       review     (doc v1 checked, 2 open findings with page + quote)
--   0103 sellers_disclosure   needs_fix  (doc v1 checked, fix_note + approved, sent fix_request message)
--   0104 lead_paint_addendum  missing
--   0105 preapproval_letter   checking   (doc v1 processing)
--   0106 hoa_addendum         missing
--
-- Demo client link for Enoch: token  mara-demo-0142-barton  (stored as hex sha256, TODO(decision):
-- Mara must hash tokens the same way: lowercase hex sha256 of the UTF-8 token).

-- ---------------------------------------------------------------------------
-- auth.users (only when an auth schema exists). Real Supabase gets a fuller row so magic-link
-- login works locally; the test shim only has (id, email). No passwords are seeded.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  full_auth boolean;
begin
  if to_regclass('auth.users') is null then
    raise notice 'no auth schema; skipping auth.users seed';
    return;
  end if;

  full_auth := exists (select 1 from information_schema.columns
                       where table_schema = 'auth' and table_name = 'users' and column_name = 'aud');

  for r in
    select * from (values
      ('a0000000-0000-4000-8000-000000000001'::uuid, 'margaret.holloway@example.com'),
      ('a0000000-0000-4000-8000-000000000002'::uuid, 'rachel.kim@example.com')
    ) as v(id, email)
  loop
    if full_auth then
      execute $sql$
        insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
                                raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
        values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, now(),
                '{"provider":"email","providers":["email"]}', '{}', now(), now())
        on conflict (id) do nothing
      $sql$ using r.id, r.email;
      begin
        execute $sql$
          insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
          values ($1::text, $1, jsonb_build_object('sub', $1::text, 'email', $2, 'email_verified', true),
                  'email', now(), now())
          on conflict do nothing
        $sql$ using r.id, r.email;
      exception when others then
        raise notice 'auth.identities seed skipped: %', sqlerrm;
      end;
    else
      execute 'insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing'
        using r.id, r.email;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Brokerage and staff
-- ---------------------------------------------------------------------------
insert into public.brokerages (id, name, timezone)
values ('b0000000-0000-4000-8000-000000000001', 'Cedar & Stone Realty', 'America/Chicago')
on conflict do nothing;

insert into public.users (id, brokerage_id, role, name, email, phone) values
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'broker',
   'Margaret Holloway', 'margaret.holloway@example.com', '+15125550101'),
  ('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'agent',
   'Rachel Kim', 'rachel.kim@example.com', '+15125550102')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Deals (status is derived from the checklist by trigger; none is complete yet)
-- ---------------------------------------------------------------------------
insert into public.deals (id, brokerage_id, deal_number, agent_id, property_address, city, state, zip,
                          reminders_enabled, created_at) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', '2026-0142',
   'a0000000-0000-4000-8000-000000000002', '1208 Barton Hills Dr', 'Austin', 'TX', '78704', true,
   '2026-11-10 09:00-06'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', '2026-0138',
   'a0000000-0000-4000-8000-000000000002', '44 Rainey St #1802', 'Austin', 'TX', '78701', true,
   '2026-11-09 10:30-06'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', '2026-0145',
   'a0000000-0000-4000-8000-000000000002', '3310 Cherrywood Rd', 'Austin', 'TX', '78722', true,
   '2026-11-16 14:15-06')
on conflict do nothing;

-- Keep the deal-number sequence ahead of the seeded numbers.
select setval('public.deal_number_seq', greatest((select last_value from public.deal_number_seq), 145));

insert into public.clients (id, deal_id, name, phone, email, sms_consent_at, timezone) values
  ('c0000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000001',
   'Enoch Omunu', '+15125550142', 'enoch.omunu@example.com', '2026-11-10 09:05-06', 'America/Chicago'),
  ('c0000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000002',
   'Priya Shah', '+15125550138', 'priya.shah@example.com', '2026-11-09 10:40-06', 'America/Chicago'),
  ('c0000000-0000-4000-8000-000000000301', 'd0000000-0000-4000-8000-000000000003',
   'Marcus Bell', '+15125550145', null, '2026-11-16 14:20-06', 'America/Chicago')
on conflict do nothing;

insert into public.client_links (id, client_id, token_hash, expires_at) values
  ('f1000000-0000-4000-8000-000000000101', 'c0000000-0000-4000-8000-000000000101',
   encode(sha256(convert_to('mara-demo-0142-barton', 'UTF8')), 'hex'), '2027-02-10 00:00-06'),
  ('f1000000-0000-4000-8000-000000000201', 'c0000000-0000-4000-8000-000000000201',
   encode(sha256(convert_to('mara-demo-0138-rainey', 'UTF8')), 'hex'), '2027-02-09 00:00-06'),
  ('f1000000-0000-4000-8000-000000000301', 'c0000000-0000-4000-8000-000000000301',
   encode(sha256(convert_to('mara-demo-0145-cherrywood', 'UTF8')), 'hex'), '2027-02-16 00:00-06')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Checklist items
-- ---------------------------------------------------------------------------
insert into public.checklist_items (id, deal_id, document_type_key, status, fix_note, due_date, sort_order,
                                    last_reminded_at, reminder_count) values
  -- 2026-0142: one item in every status
  ('e3000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000001', 'buyer_rep_agreement', 'missing', null, null, 1, null, 0),
  ('e3000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000001', 'sales_contract',      'missing', null, '2026-11-25', 2, null, 0),
  ('e3000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000001', 'sellers_disclosure',  'missing', null, '2026-11-27', 3, null, 0),
  ('e3000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000001', 'lead_paint_addendum', 'missing', null, '2026-11-30', 4, '2026-11-22 10:00-06', 2),
  ('e3000000-0000-4000-8000-000000000105', 'd0000000-0000-4000-8000-000000000001', 'preapproval_letter',  'missing', null, null, 5, null, 0),
  ('e3000000-0000-4000-8000-000000000106', 'd0000000-0000-4000-8000-000000000001', 'hoa_addendum',        'missing', null, '2026-12-02', 6, '2026-11-22 10:00-06', 2),
  -- 2026-0138
  ('e3000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000002', 'sales_contract',      'missing', null, null, 1, null, 0),
  ('e3000000-0000-4000-8000-000000000202', 'd0000000-0000-4000-8000-000000000002', 'sellers_disclosure',  'missing', null, null, 2, null, 0),
  ('e3000000-0000-4000-8000-000000000203', 'd0000000-0000-4000-8000-000000000002', 'hoa_addendum',        'missing', null, '2026-11-25', 3, null, 0),
  -- 2026-0145
  ('e3000000-0000-4000-8000-000000000301', 'd0000000-0000-4000-8000-000000000003', 'buyer_rep_agreement', 'missing', null, null, 1, null, 0),
  ('e3000000-0000-4000-8000-000000000302', 'd0000000-0000-4000-8000-000000000003', 'preapproval_letter',  'missing', null, null, 2, null, 0),
  ('e3000000-0000-4000-8000-000000000303', 'd0000000-0000-4000-8000-000000000003', 'sales_contract',      'missing', null, '2026-12-01', 3, null, 0)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Documents (items are moved to their real status below, after their documents exist)
-- ---------------------------------------------------------------------------
insert into public.documents (id, deal_id, checklist_item_id, version, file_path, staging_path, original_filename,
                              mime, size_bytes, sha256, page_count, status, ai_summary, checked_at, created_at) values
  -- 0142 buyer rep agreement: checked, clean
  ('e4000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000101', 1,
   'deals/2026-0142/buyer_rep_agreement/e4000000-0000-4000-8000-000000000101.pdf', null, 'buyer-rep-agreement-signed.pdf',
   'application/pdf', 412345, 'seed-sha256-e4000000000101', 4, 'checked',
   'Signed and dated by the buyer and by Rachel Kim. All pages initialed. Nothing to fix.', '2026-11-10 11:20-06', '2026-11-10 11:18-06'),
  -- 0142 sales contract: checked, 2 open findings
  ('e4000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000102', 1,
   'deals/2026-0142/sales_contract/e4000000-0000-4000-8000-000000000102.pdf', null, 'contract-1208-barton-hills.pdf',
   'application/pdf', 1893021, 'seed-sha256-e4000000000102', 12, 'checked',
   'Complete contract for 1208 Barton Hills Dr. The buyer signature on page 9 is blank and the initials on page 3 are missing.',
   '2026-11-24 08:42-06', '2026-11-24 08:40-06'),
  -- 0142 seller's disclosure: v1 checked, fix requested
  ('e4000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000103', 1,
   'deals/2026-0142/sellers_disclosure/e4000000-0000-4000-8000-000000000103.pdf', null, 'sellers-disclosure.pdf',
   'application/pdf', 733210, 'seed-sha256-e4000000000103', 7, 'checked',
   'The disclosure is not dated and the roof section is unanswered.', '2026-11-21 16:05-06', '2026-11-21 16:03-06'),
  -- 0142 pre-approval letter: Mara is still checking it
  ('e4000000-0000-4000-8000-000000000105', 'd0000000-0000-4000-8000-000000000001', 'e3000000-0000-4000-8000-000000000105', 1,
   null, 'staging/2026-0142/preapproval_letter/e4000000-0000-4000-8000-000000000105.pdf', 'preapproval-summit.pdf',
   'application/pdf', 210456, null, null, 'processing', null, null, '2026-11-24 09:10-06'),
  -- 0138 seller's disclosure: checked, one warning
  ('e4000000-0000-4000-8000-000000000202', 'd0000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000202', 1,
   'deals/2026-0138/sellers_disclosure/e4000000-0000-4000-8000-000000000202.pdf', null, 'rainey-sellers-disclosure.pdf',
   'application/pdf', 655001, 'seed-sha256-e4000000000202', 6, 'checked',
   'Signed and dated. The HOA question on page 5 is answered in pencil, which may be hard to read.', '2026-11-23 13:12-06', '2026-11-23 13:10-06'),
  -- 0138 contract: checked, clean
  ('e4000000-0000-4000-8000-000000000201', 'd0000000-0000-4000-8000-000000000002', 'e3000000-0000-4000-8000-000000000201', 1,
   'deals/2026-0138/sales_contract/e4000000-0000-4000-8000-000000000201.pdf', null, 'rainey-contract.pdf',
   'application/pdf', 1544900, 'seed-sha256-e4000000000201', 11, 'checked',
   'Fully signed and initialed. Nothing to fix.', '2026-11-12 09:30-06', '2026-11-12 09:28-06'),
  -- 0145 buyer rep + pre-approval: checked, clean
  ('e4000000-0000-4000-8000-000000000301', 'd0000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000301', 1,
   'deals/2026-0145/buyer_rep_agreement/e4000000-0000-4000-8000-000000000301.pdf', null, 'bell-buyer-rep.pdf',
   'application/pdf', 398100, 'seed-sha256-e4000000000301', 4, 'checked',
   'Signed and dated. Nothing to fix.', '2026-11-17 10:02-06', '2026-11-17 10:00-06'),
  ('e4000000-0000-4000-8000-000000000302', 'd0000000-0000-4000-8000-000000000003', 'e3000000-0000-4000-8000-000000000302', 1,
   'deals/2026-0145/preapproval_letter/e4000000-0000-4000-8000-000000000302.pdf', null, 'bell-preapproval.pdf',
   'application/pdf', 121778, 'seed-sha256-e4000000000302', 1, 'checked',
   'Hill Country Mortgage letter naming Marcus Bell with a loan amount. Dated within 60 days.', '2026-11-18 15:44-06', '2026-11-18 15:42-06')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Findings
-- ---------------------------------------------------------------------------
insert into public.findings (id, document_id, checklist_item_id, severity, rule_key, message, client_fix_text, page, quote, status) values
  ('e5000000-0000-4000-8000-000000000101', 'e4000000-0000-4000-8000-000000000102', 'e3000000-0000-4000-8000-000000000102',
   'blocker', 'buyer_signature',
   'The buyer signature line on page 9 is blank.',
   'Please sign on page 9 next to your name, then upload the contract again.',
   9, 'Buyer: ______________________  Date: ________', 'open'),
  ('e5000000-0000-4000-8000-000000000102', 'e4000000-0000-4000-8000-000000000102', 'e3000000-0000-4000-8000-000000000102',
   'warning', 'page_initials',
   'The buyer initials box at the bottom of page 3 looks empty.',
   'Please initial the box at the bottom of page 3.',
   3, 'Buyer initials: ____  Seller initials: __JD__', 'open'),
  ('e5000000-0000-4000-8000-000000000103', 'e4000000-0000-4000-8000-000000000103', 'e3000000-0000-4000-8000-000000000103',
   'blocker', 'seller_date',
   'The seller signature is not dated.',
   'Please add the date next to your signature on page 7.',
   7, 'Signature of Seller: J. Dalton   Date: ________', 'open'),
  ('e5000000-0000-4000-8000-000000000104', 'e4000000-0000-4000-8000-000000000103', 'e3000000-0000-4000-8000-000000000103',
   'blocker', 'roof_section',
   'The roof section on page 3 is unanswered.',
   'Please answer the roof questions on page 3.',
   3, 'Roof: Age ______ Known leaks? ______', 'open'),
  ('e5000000-0000-4000-8000-000000000202', 'e4000000-0000-4000-8000-000000000202', 'e3000000-0000-4000-8000-000000000202',
   'warning', 'legibility',
   'The HOA answer on page 5 is written in pencil and faint.',
   'Please re-sign or re-write the HOA answer on page 5 in pen.',
   5, 'Is the property in an HOA?  (yes)', 'open')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Move items to their story status. complete -> the agent decided; the guards stamp completion
-- (no session here, so completed_by stays as supplied).
-- ---------------------------------------------------------------------------
update public.checklist_items set status = 'complete', completed_by = 'a0000000-0000-4000-8000-000000000002',
       completed_at = '2026-11-10 12:00-06'
  where id in ('e3000000-0000-4000-8000-000000000101', 'e3000000-0000-4000-8000-000000000201',
               'e3000000-0000-4000-8000-000000000301', 'e3000000-0000-4000-8000-000000000302');
update public.checklist_items set status = 'review'
  where id in ('e3000000-0000-4000-8000-000000000102', 'e3000000-0000-4000-8000-000000000202');
update public.checklist_items set status = 'needs_fix',
       fix_note = 'Hi Enoch, the seller''s disclosure still needs two fixes: please add the date next to the seller signature on page 7, and answer the roof questions on page 3. Then upload it again. Thanks, Rachel'
  where id = 'e3000000-0000-4000-8000-000000000103';
update public.checklist_items set status = 'checking'
  where id = 'e3000000-0000-4000-8000-000000000105';

-- ---------------------------------------------------------------------------
-- Messages: invite, a reminder, and the approved fix request (all already sent)
-- ---------------------------------------------------------------------------
insert into public.messages (id, deal_id, client_id, kind, body, status, approved_by, approved_at,
                             provider_message_id, sent_at, created_at) values
  ('e9000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000101',
   'invite', 'Hi Enoch, this is Mara from Cedar & Stone Realty. Rachel Kim needs a few documents for 1208 Barton Hills Dr. Upload them here: https://mara.example.com/c/mara-demo-0142-barton',
   'sent', null, null, 'FAKE_SMS_0001', '2026-11-10 09:06-06', '2026-11-10 09:06-06'),
  ('e9000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000101',
   'reminder', 'Hi Enoch, you still have 2 documents to upload for 1208 Barton Hills Dr: https://mara.example.com/c/mara-demo-0142-barton',
   'sent', null, null, 'FAKE_SMS_0002', '2026-11-22 10:00-06', '2026-11-22 10:00-06'),
  ('e9000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000101',
   'fix_request', 'Hi Enoch, the seller''s disclosure still needs two fixes: please add the date next to the seller signature on page 7, and answer the roof questions on page 3. Then upload it again. Thanks, Rachel',
   'sent', 'a0000000-0000-4000-8000-000000000002', '2026-11-21 16:20-06', 'FAKE_SMS_0003', '2026-11-21 16:20-06', '2026-11-21 16:20-06')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Audit log and one AI run
-- ---------------------------------------------------------------------------
insert into public.audit_log (id, deal_id, actor, actor_id, action, details_json, created_at) values
  ('ed000000-0000-4000-8000-000000000101', 'd0000000-0000-4000-8000-000000000001', 'agent', 'a0000000-0000-4000-8000-000000000002',
   'deal.created', '{"deal_number":"2026-0142"}', '2026-11-10 09:00-06'),
  ('ed000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000001', 'mara', null,
   'message.sent', '{"kind":"invite"}', '2026-11-10 09:06-06'),
  ('ed000000-0000-4000-8000-000000000103', 'd0000000-0000-4000-8000-000000000001', 'agent', 'a0000000-0000-4000-8000-000000000002',
   'item.completed', '{"document_type_key":"buyer_rep_agreement"}', '2026-11-10 12:00-06'),
  ('ed000000-0000-4000-8000-000000000104', 'd0000000-0000-4000-8000-000000000001', 'agent', 'a0000000-0000-4000-8000-000000000002',
   'fix_request.sent', '{"document_type_key":"sellers_disclosure"}', '2026-11-21 16:20-06'),
  ('ed000000-0000-4000-8000-000000000105', 'd0000000-0000-4000-8000-000000000001', 'mara', null,
   'document.checked', '{"document_type_key":"sales_contract","findings":2}', '2026-11-24 08:42-06')
on conflict do nothing;

insert into public.ai_runs (id, deal_id, document_id, purpose, model, prompt_version, input_tokens, output_tokens, cost_usd, output_json, created_at) values
  ('ee000000-0000-4000-8000-000000000102', 'd0000000-0000-4000-8000-000000000001', 'e4000000-0000-4000-8000-000000000102',
   'check_document', 'claude-opus-5-5', 'check_document@1', 21400, 640, 0.412000,
   '{"summary":"Buyer signature blank on page 9; initials missing on page 3.","findings":2}', '2026-11-24 08:42-06')
on conflict do nothing;
