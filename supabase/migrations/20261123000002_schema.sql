-- Mara (lean build) 2 of 6: tables. Source of truth: docs/CONTRACTS.md section 3.
-- Enums are text + check constraints (easy to extend in a later migration).

-- ---------------------------------------------------------------------------
-- Brokerage and staff
-- ---------------------------------------------------------------------------
create table public.brokerages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  timezone   text not null default 'America/Chicago',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.users (
  id           uuid primary key references auth.users(id) on delete cascade,
  brokerage_id uuid not null references public.brokerages(id),
  role         text not null check (role in ('agent','broker')),
  name         text not null,
  email        text,
  phone        text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  created_at   timestamptz not null default now()
);
create index users_brokerage_idx on public.users (brokerage_id);

-- ---------------------------------------------------------------------------
-- Deals and the one client per deal
-- ---------------------------------------------------------------------------
create sequence public.deal_number_seq;

create table public.deals (
  id                uuid primary key default gen_random_uuid(),
  brokerage_id      uuid not null references public.brokerages(id),
  -- 'YYYY-NNNN', e.g. 2026-0142. Also the folder name in deal-files.
  deal_number       text not null default (to_char(now(), 'YYYY') || '-' || lpad(nextval('public.deal_number_seq')::text, 4, '0')),
  agent_id          uuid not null references public.users(id),
  property_address  text not null,
  city              text not null,
  state             text not null default 'TX' check (state ~ '^[A-Z]{2}$'),
  zip               text not null check (zip ~ '^[0-9]{5}(-[0-9]{4})?$'),
  status            text not null default 'open' check (status in ('open','complete')),
  reminders_enabled boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint deals_deal_number_format check (deal_number ~ '^[0-9]{4}-[0-9]{4}$'),
  constraint deals_deal_number_key unique (brokerage_id, deal_number)
);
create index deals_agent_idx on public.deals (agent_id);
create index deals_brokerage_status_idx on public.deals (brokerage_id, status);

-- One client per deal for v1 (unique deal_id). Clients are not Supabase auth users.
create table public.clients (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid not null unique references public.deals(id) on delete cascade,
  name           text not null,
  phone          text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email          text,
  sms_consent_at timestamptz,
  sms_opt_out_at timestamptz,
  timezone       text not null default 'America/Chicago',
  created_at     timestamptz not null default now()
);

-- The magic link. Only hashes are stored. Only Mara (service role) reads the secret columns.
create table public.client_links (
  id                     uuid primary key default gen_random_uuid(),
  client_id              uuid not null references public.clients(id) on delete cascade,
  token_hash             text not null unique,
  expires_at             timestamptz not null,
  revoked_at             timestamptz,
  last_used_at           timestamptz,
  verify_code_hash       text,
  verify_code_expires_at timestamptz,
  verify_attempts        int not null default 0,
  verified_at            timestamptz,
  -- ADDED (CONTRACTS section 4): 30-day device session after a successful verify.
  session_hash           text,
  session_expires_at     timestamptz,
  -- ADDED: "5 wrong codes lock the link for 15 min" needs somewhere to keep the lock.
  locked_until           timestamptz,
  created_at             timestamptz not null default now()
);
create index client_links_client_idx on public.client_links (client_id);

-- ---------------------------------------------------------------------------
-- Document types (reference data; keys match config/document_types.yaml)
-- ---------------------------------------------------------------------------
create table public.document_types (
  key          text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  name         text not null,
  description  text not null,
  standard_key text not null
);

insert into public.document_types (key, name, description, standard_key) values
  ('buyer_rep_agreement', 'Buyer representation agreement', 'Signed agreement between the buyer and Cedar & Stone Realty (fictitious Texas residential form).', 'buyer_rep_agreement'),
  ('sales_contract',      'Residential sales contract',     'The fully signed and initialed one-to-four family residential contract.', 'sales_contract'),
  ('sellers_disclosure',  'Seller''s disclosure notice',    'The seller''s disclosure of the property''s condition, signed and dated by the seller.', 'sellers_disclosure'),
  ('lead_paint_addendum', 'Lead-based paint addendum',      'Required for homes built before 1978: disclosure and acknowledgment, signed by all parties.', 'lead_paint_addendum'),
  ('preapproval_letter',  'Pre-approval letter',            'A current lender pre-approval letter naming the buyer and a loan amount.', 'preapproval_letter'),
  ('hoa_addendum',        'HOA addendum',                   'The addendum for property in a homeowners association, signed and initialed.', 'hoa_addendum')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Checklist, documents, findings
-- ---------------------------------------------------------------------------
create table public.checklist_items (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references public.deals(id) on delete cascade,
  document_type_key text not null references public.document_types(key),
  status            text not null default 'missing'
                    check (status in ('missing','checking','review','needs_fix','complete','waived')),
  fix_note          text,
  due_date          date,
  sort_order        int not null default 0,
  last_reminded_at  timestamptz,
  reminder_count    int not null default 0,
  completed_at      timestamptz,
  completed_by      uuid references public.users(id),
  created_at        timestamptz not null default now(),
  constraint checklist_items_one_per_type unique (deal_id, document_type_key)
);
create index checklist_items_deal_idx on public.checklist_items (deal_id, sort_order);
create index checklist_items_status_idx on public.checklist_items (status);

-- Never hard-deleted (CLAUDE.md rule 3): older versions become 'superseded'.
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references public.deals(id),
  checklist_item_id uuid not null references public.checklist_items(id),
  version           int not null default 1 check (version >= 1),
  -- Object key in deal-files: deals/{deal_number}/{document_type_key}/{document_id}.{ext}.
  -- Null until Mara copies the file out of uploads-staging.
  file_path         text,
  staging_path      text,
  original_filename text,
  mime              text,
  size_bytes        bigint check (size_bytes is null or size_bytes >= 0),
  sha256            text,
  page_count        int,
  status            text not null default 'uploading'
                    check (status in ('uploading','received','processing','checked','failed','superseded')),
  ai_summary        text,
  checked_at        timestamptz,
  created_at        timestamptz not null default now(),
  constraint documents_item_version_key unique (checklist_item_id, version),
  constraint documents_file_path_format
    check (file_path is null or file_path ~ '^deals/[0-9]{4}-[0-9]{4}/[^/]+/[^/]+$')
);
create index documents_deal_idx on public.documents (deal_id);
create index documents_status_idx on public.documents (status) where status in ('received','processing');

create table public.findings (
  id                uuid primary key default gen_random_uuid(),
  document_id       uuid not null references public.documents(id),
  checklist_item_id uuid not null references public.checklist_items(id),
  severity          text not null check (severity in ('blocker','warning')),
  rule_key          text not null,
  message           text not null,
  client_fix_text   text,
  page              int check (page is null or page >= 1),
  quote             text,
  status            text not null default 'open' check (status in ('open','dismissed')),
  dismissed_by      uuid references public.users(id),
  created_at        timestamptz not null default now()
);
create index findings_item_idx on public.findings (checklist_item_id);
create index findings_document_idx on public.findings (document_id);

-- ---------------------------------------------------------------------------
-- Messages (SMS). Send rule: CONTRACTS section 1.
-- ---------------------------------------------------------------------------
create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  deal_id             uuid not null references public.deals(id),
  client_id           uuid not null references public.clients(id),
  kind                text not null check (kind in ('invite','verify_code','reminder','fix_request')),
  body                text not null,
  status              text not null default 'queued' check (status in ('queued','sent','failed','blocked')),
  approved_by         uuid references public.users(id),
  approved_at         timestamptz,
  provider_message_id text,
  error               text,
  sent_at             timestamptz,
  created_at          timestamptz not null default now(),
  -- A fix request only exists because an agent clicked send.
  constraint messages_fix_request_needs_approval check (kind <> 'fix_request' or approved_by is not null)
);
create index messages_deal_idx on public.messages (deal_id, created_at desc);
create index messages_queued_idx on public.messages (created_at) where status = 'queued';

-- ---------------------------------------------------------------------------
-- Logs (append-only, guarded in migration 3) and jobs
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid references public.deals(id),
  actor        text not null check (actor in ('agent','client','mara','system')),
  actor_id     uuid,
  action       text not null,
  details_json jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_log_deal_idx on public.audit_log (deal_id, created_at desc);

create table public.ai_runs (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid references public.deals(id),
  document_id    uuid references public.documents(id),
  purpose        text not null,
  model          text not null,
  prompt_version text,
  input_tokens   int,
  output_tokens  int,
  cost_usd       numeric(10,6),
  output_json    jsonb,
  created_at     timestamptz not null default now()
);
create index ai_runs_document_idx on public.ai_runs (document_id);

create table public.mara_jobs (
  id              uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  kind            text not null,
  ref_id          uuid,                       -- ADDED: the document or message the job is for
  status          text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts        int not null default 0,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create trigger brokerages_updated_at before update on public.brokerages
  for each row execute function public.set_updated_at();
create trigger deals_updated_at before update on public.deals
  for each row execute function public.set_updated_at();
create trigger mara_jobs_updated_at before update on public.mara_jobs
  for each row execute function public.set_updated_at();
