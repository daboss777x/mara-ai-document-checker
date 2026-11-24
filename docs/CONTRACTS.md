# Mara: lean contracts (trimmed 2026-11-23)

The single source of truth for the trimmed build. If BUILD_PLAN.md disagrees, this file wins.
Pre-trim state is in git at `9a59433` if anything cut needs to come back.

## 1. What the system does (and nothing else)

```
Agent creates deal + client (one form) ─► checklist of required docs + client link + SMS invite
Client opens link ─► verifies 6-digit SMS code ─► sees checklist ─► uploads a doc against an item
Mara (AI) checks the doc against that document type's STANDARD ─► findings (page + quote)
Agent reviews (HITL) ─► "Mark complete"  ─► item Done
                     └► "Send fix request" (edited note) ─► SMS + portal show the fix ─► client re-uploads ─► loop
Missing / needs-fix items ─► automatic EgoSMS reminders on a fixed cadence (consent, opt-out, quiet hours)
All items complete ─► deal Complete
```

**Removed (do not build, delete if present):** Today dashboard, approvals queue, timeline/deadlines engine,
risk scores, consistency/cross-document checks, drafting & templates, Ask Mara chat (`/ask`), audit export
page, Settings page, licensee gating / TC role, Twilio, Resend/email, Google Drive, Sentry, messages/chat
threads, client timeline/messages/help pages, wire-fraud banner UI, new-deal wizard, document
classification (the client uploads against a known item, so the type is known), Spanish, `/kit` page.

**Kept rules:** Postgres is the source of truth; Supabase Storage holds files (`uploads-staging` →
`deal-files`, behind `FileStore`); never hard-delete documents; every Mara action and agent decision goes in
`audit_log`; every model call in `ai_runs`; HMAC on every Modal endpoint; idempotent jobs; fictitious seed
data only; Mara never gives legal/financial advice or sends banking/wiring details (code-level filter on
every outbound SMS body).

**Send rule (replaces old rule 1):** only `mara/mara/outbound/sender.py::send_message()` calls EgoSMS, and it
sends a `messages` row only when `kind in ('reminder','invite','verify_code')` (system templates in
`config/messages.yaml`) **or** `kind = 'fix_request' and approved_by is not null` (the agent's click).
A DB check constraint enforces the second half; a test enforces the first.

## 2. Status machines

`checklist_items.status`
| value | meaning | client sees | agent sees |
|---|---|---|---|
| `missing` | nothing uploaded yet | To do | Missing |
| `checking` | uploaded, Mara is processing | Being checked | Mara checking |
| `review` | Mara done, waiting for the agent | Being checked | **Ready for review** |
| `needs_fix` | agent sent a fix request | Needs a fix + `fix_note` | Fix requested |
| `complete` | agent marked it complete | Done | Complete |
| `waived` | agent waived it | (hidden) | Waived |

Transitions: missing/needs_fix → checking (client upload) → review (Mara finished, or failed with a
"couldn't read" finding) → complete | needs_fix (agent). Agent may waive or reopen any item.
`deals.status`: `open` → `complete` automatically when every non-waived item is `complete`.

`documents.status`: `uploading` → `received` → `processing` → `checked` | `failed`; older versions of the same item →
`superseded` when a new upload arrives. Never deleted.

`findings`: `severity in ('blocker','warning')`, `status in ('open','dismissed')`. The agent dismisses
findings they disagree with; open findings pre-fill the fix note.

## 3. Database (Kwame — rewrite migrations as a clean lean set; nothing is deployed yet)

```
brokerages(id, name, timezone default 'America/Chicago', created_at, updated_at)
users(id → auth.users, brokerage_id, role['agent','broker'], name, email, phone)
deals(id, brokerage_id, deal_number 'YYYY-NNNN', agent_id → users, property_address, city, state default 'TX',
      zip, status['open','complete'], reminders_enabled bool default true, created_at, updated_at)
clients(id, deal_id, name, phone E.164, email null, sms_consent_at, sms_opt_out_at,
        timezone default 'America/Chicago')                       -- one client per deal for v1
client_links(id, client_id, token_hash unique, expires_at, revoked_at, last_used_at,
             verify_code_hash, verify_code_expires_at, verify_attempts int, verified_at)
document_types(key pk, name, description, standard_key)            -- seeded from config/document_types.yaml
checklist_items(id, deal_id, document_type_key, status, fix_note, due_date null, sort_order,
                last_reminded_at, reminder_count int default 0, completed_at, completed_by)
documents(id, deal_id, checklist_item_id, version, file_path, staging_path, original_filename, mime,
          size_bytes, sha256, page_count, status, ai_summary text, checked_at, created_at)
findings(id, document_id, checklist_item_id, severity, rule_key, message, client_fix_text,
         page int null, quote text null, status, dismissed_by, created_at)
messages(id, deal_id, client_id, kind['invite','verify_code','reminder','fix_request'], body,
         status['queued','sent','failed','blocked'], approved_by null, approved_at null,
         provider_message_id, error, sent_at, created_at)
         CHECK (kind <> 'fix_request' OR approved_by IS NOT NULL)
audit_log(id, deal_id, actor['agent','client','mara','system'], actor_id, action, details_json, created_at)  -- append-only
ai_runs(id, deal_id, document_id, purpose, model, prompt_version, input_tokens, output_tokens, cost_usd,
        output_json, created_at)                                   -- append-only
mara_jobs(id, idempotency_key unique, kind, status, attempts, last_error, created_at, updated_at)
```
- RLS on every table. Agents/brokers see their brokerage's deals (agent: own deals; broker: all). Clients
  are not Supabase auth users and the web never holds the service-role key: **every client-portal read and
  write goes through Mara's `/client/*` endpoints** (§4), which resolve the token hash with the service role.
  `client_links` also stores `session_hash` + `session_expires_at` (30-day device session after verify).
- Webhook trigger (pg_net, HMAC-signed) → `POST {MARA}/events` on: `documents` INSERT and `messages`
  INSERT where status='queued'.
- Storage: private buckets `uploads-staging` (client upload via signed upload URL) and `deal-files`
  (Mara only). Object key `deals/{deal_number}/{document_type_key}/{document_id}.{ext}`.
- Seed: Cedar & Stone Realty; agent Rachel Kim; client Enoch Omunu, 1208 Barton Hills Dr, deal 2026-0142,
  with items in every status (one in `review` with 2 findings, one `needs_fix`, one `complete`, one
  `missing`); plus 2 smaller deals. All fictitious.

## 4. Mara service (Joel — `/mara`, `/config`, `/prompts`, `/evals`)

Endpoints (FastAPI on Modal, HMAC `X-Mara-Signature` on all):
- `POST /events` `{type: 'document.created'|'message.queued', id}` → idempotent `mara_jobs`, spawns
  `process_document(document_id)` or `send_message(message_id)`, returns 202.
- `POST /client/{action}` (web server → Mara, HMAC) with body `{token, session?, ...}`. Actions:
  `portal`, `checklist`, `item {itemId}`, `send_code`, `verify_code {code}` → `{verified, attemptsLeft,
  session?}`, `create_upload {itemId, filename, sizeBytes, mime}` → `{documentId, uploadUrl}` (signed upload
  URL into `uploads-staging`; the document row is inserted with status `uploading`),
  `confirm_upload {documentId}` → flips it to `received` (fires the webhook; item → `checking`),
  `set_opt_out {optOut}`. Mara checks token hash, expiry, revocation and (except `portal`/`send_code`/
  `verify_code`) a valid session; 5 wrong codes lock the link for 15 min. Responses are the client view
  models in §5 (snake_case → the web maps them). Add `uploading` to `documents.status`; the webhook fires
  on UPDATE to `received` as well as INSERT with `received`.
- (Removed: `/ask`, `/sms/inbound`. Opt-out is a toggle in the client portal; `TODO(decision)` EgoSMS
  inbound STOP if their API supports it.)

`process_document(document_id)`:
1. Load doc + item + type; mark `processing`; mark earlier versions of that item `superseded`.
2. Copy `uploads-staging/<staging_path>` → `deal-files/<key>` via `FileStore`, record `file_path`,
   sha256, page_count; delete the staging copy after the write is confirmed.
3. Read: PDF sent to Claude as a document block (DOCX → text via python-docx; JPG/PNG as image blocks).
4. Check against `config/standards/<standard_key>.yaml` with Claude (structured JSON output, model from
   `MARA_CHECK_MODEL`, default `claude-opus-5-5`; prompt `prompts/check_document.md` with version header).
   Output: `{summary, findings:[{rule_key, severity, message, client_fix_text, page, quote}]}`.
   A signature/initial rule is never reported as passing below 0.9 confidence; uncertain → warning finding.
5. Write findings, `documents.status='checked'`, `ai_summary`; item → `review`; `ai_runs` + `audit_log`.
   On any failure: `documents.status='failed'`, one blocker finding "Mara couldn't read this file", item →
   `review` (the agent always decides).

`send_message(message_id)` (the only provider caller): enforce the send rule (§1), consent
(`sms_consent_at` set, `sms_opt_out_at` null), quiet hours from `config/reminders.yaml` in the client's
timezone (outside → leave queued for the sweep), outbound content filter (no wiring/banking details, no
legal/financial advice phrasing → `blocked`), then `EgoSmsProvider.send()` behind `SmsProvider`.

Schedules: `hourly_sweep` (advisory lock): re-dispatch docs stuck in `received` > 10 min, retry queued
messages now inside allowed hours, run reminders: for each `missing`/`needs_fix` item on an `open` deal
with `reminders_enabled`, follow the cadence in `config/reminders.yaml` (default day 0 invite, day 2,
day 4, then every 3 days; max 1 SMS per client per day; only at `send_hour_local`), creating one
`reminder` message per client listing all outstanding items, then `send_message`.

Config files (YAML, validated by pydantic on load, tests prove every file parses):
- `config/document_types.yaml`: ~6 fictitious Texas residential types (buyer rep agreement, sales
  contract, seller's disclosure, lead-based paint addendum, pre-approval letter, HOA addendum), each with
  `key, name, description, standard_key`.
- `config/standards/<key>.yaml`: `required_signatures`, `required_initials`, `required_dates`,
  `required_fields`, `other_rules`, each rule `{key, description, severity, client_fix_text}`.
- `config/reminders.yaml`: cadence, `send_hour_local`, quiet hours, max per day.
- `config/messages.yaml`: SMS templates `invite`, `verify_code`, `reminder`, `fix_request_footer`.

Remove from `/mara`: Twilio, Drive, `/ask`, Resend, Sentry, timeline/risk code. Keep HMAC, jobs,
FileStore (`storage/`), settings. Tests use fakes (fake Claude client, fake SmsProvider, memory FileStore).
`evals/`: 6 fixture cases (good, missing signature, missing initials, blank required field, missing date,
unreadable) run against a fake by default and the real model with `--live`.

## 5. Web (Next.js) — screens, view models, data functions

Demo mode stays (`MARA_DEMO=1`, Rachel Kim, `/c/demo`). Screens call `@/lib/data` only; types live in
`web/lib/view-models.ts` (Zod-inferred). Mutations return `MutationResult<T>`; reads return `Result<T>`.

### Staff (agent) — sky theme + `components/cs` kit stay
| Route | Screen |
|---|---|
| `/login` (+ `/` welcome) | keep as built |
| `/review` | **Home.** Queue of items in `review` across my deals, oldest first. Empty: "All caught up." |
| `/review/[itemId]` | **HITL screen.** Left: document (iframe of the signed-URL file route, `#page=n`). Right: Mara's summary, findings (severity chip, page link, quote, Dismiss), editable fix note pre-filled from open findings' `client_fix_text`, buttons **Mark complete** and **Send fix request** (confirm names client + phone). Version list. Next item link. |
| `/deals` | Simple list: address, client, progress `3/6 done`, chips for "N to review", "N needs fix". Search. **New deal** button. |
| `/deals/new` | One-page form: address, city, zip, client name, phone, email (opt), SMS-consent checkbox with wording, document checkboxes (from document types, defaults ticked), optional due date. Creates deal + items + client link, queues the `invite` SMS. Then → `/deals/[id]`. |
| `/deals/[id]` | Header (address, client, status, reminders on/off toggle, copy client link, resend invite). Checklist table: item, status chip, last upload, findings count, actions (Review →, Waive, Reopen). Activity list (audit log, newest first). |

Staff nav: Review (badge = count), Deals. Nothing else.

### Client — `/c/[token]`
| Route | Screen |
|---|---|
| `/c/[token]/verify` | 6-digit code (keep as built). |
| `/c/[token]` | Checklist home: headline "Hi Enoch, 3 things left", groups To do (incl. Needs a fix, fix note shown) / Being checked / Done; progress; SMS reminders on/off toggle at the bottom. |
| `/c/[token]/items/[itemId]` | Item page: what it is, status, fix note when `needs_fix`, upload panel (drag-drop / camera, PDF/DOCX/JPG/PNG, 25 MB), list of my previous uploads (name, date, status). |

Remove: `timeline`, `messages`, `help`, `upload` (multi-file picker) client routes; wire-fraud components.

### View models (`web/lib/view-models.ts`, replace the whole file)
- Primitives kept: `Tone`, `Chip`, `DataMode`, `Person`, `DealRef`, `Result`, `MutationResult`.
- Enums: `checklistStatus` (§2), `documentStatus`, `findingSeverity`, `findingStatus`, `dealStatus`
  (`open|complete`), `messageKind`, `staffRole` (`agent|broker`).
- `StaffSession { mode, user{ id,name,initials,email,role }, brokerageName, reviewCount }`
- `ReviewQueueVM { items: ReviewQueueRow[] }`, `ReviewQueueRow { itemId, deal: DealRef, clientName,
  documentName, uploadedAt, version, blockerCount, warningCount, documentStatus }`
- `ReviewItemVM { item{ id,name,description,status,chip,fixNote }, deal: DealRef, client{ name, phoneMasked,
  canText }, document{ id, filename, version, uploadedAt, pageCount, status, fileHref, aiSummary } | null,
  findings: FindingVM[], versions: {id,version,uploadedAt,status}[], suggestedFixNote: string,
  nextItemId: string | null }`
- `FindingVM { id, severity, chip, ruleKey, message, clientFixText, page, quote, status }`
- `DealsListVM { rows: DealListRow[] }`, `DealListRow { ...DealRef, clientName, status, chip, doneCount,
  totalCount, reviewCount, needsFixCount, updatedAt }`
- `DealPageVM { deal{ ...DealRef, status, chip, remindersEnabled, clientLinkUrl | null },
  client{ name, phone, email, smsConsent: boolean, optedOut: boolean }, items: StaffChecklistItem[],
  activity: ActivityEntry[] }`
- `StaffChecklistItem { id, name, status, chip, dueDate, lastUploadAt, openFindings, fixNote }`
- `ActivityEntry { id, at, actorLabel, text }`
- `NewDealFormVM { documentTypes: {key,name,description,defaultOn}[], consentWording }`,
  `newDealInputSchema` (Zod: address, city, zip `^\d{5}$`, clientName, clientPhone E.164, clientEmail
  optional, smsConsent boolean, documentTypeKeys min 1, dueDate optional ISO).
- Client: `ClientPortalVM { mode, token, client{ firstName, name }, deal{ address, cityLine },
  agent{ name, phone|null }, needsVerification }`, `ClientVerifyVM` (keep), `ClientChecklistVM { headline,
  doneCount, totalCount, toDo: ClientChecklistItem[], checking: [...], done: [...], sms{ optedOut, canToggle } }`,
  `ClientChecklistItem { id, name, description, status('to_do'|'needs_fix'|'checking'|'done'), chip,
  fixNote, dueDate, uploadedAt }`, `ClientItemVM { item, uploads: {id, filename, uploadedAt, statusLabel}[],
  upload{ maxBytes, acceptedTypes, acceptLabel } }`.

### Data functions (`web/lib/data/*`, demo + live)
Staff reads: `getStaffSession()`, `listReviewQueue()`, `getReviewItem(itemId)`, `listDeals(q?)`,
`getDeal(id)`, `getNewDealForm()`, `getDocumentFileUrl(dealId, docId)` (60-second signed URL, server only).
Staff mutations: `markItemComplete(itemId)`, `sendFixRequest(itemId, fixNote)` (creates the approved
`fix_request` message + sets `needs_fix`/`fix_note`), `dismissFinding(findingId)`,
`waiveItem(itemId)`, `reopenItem(itemId)`, `setDealReminders(dealId, on)`, `resendInvite(dealId)`,
`createDeal(input)`.
Client functions call Mara `/client/*` via `web/lib/mara-client.ts` (HMAC signer) in live mode; the session
lives in an httpOnly cookie set by the verify action. Client reads: `getClientPortal(token)`, `getClientVerify(token)`, `getClientChecklist(token)`,
`getClientItem(token, itemId)`. Client mutations: `sendVerifyCode(token)`, `verifyClientCode(token, code)`,
`createClientUpload(token, itemId, {filename,sizeBytes,mime})` → `{ uploadUrl, documentId }` (the browser PUTs the bytes to that URL), `confirmClientUpload(token, documentId)` (inserts
or flips the `documents` row so the webhook fires; item → `checking`), `setClientSmsOptOut(token, optOut)`.

Demo mode: `confirmClientUpload` moves the item to `checking`, then the demo store "finishes" it into
`review` with canned findings the next time staff data is read (so the full loop works live on camera
with no backend). Nothing is ever sent in demo mode.

## 6. Folder ownership for the trim
| Agent | Owns |
|---|---|
| Kwame | `/supabase/**` |
| Joel | `/mara/**`, `/config/**`, `/prompts/**`, `/evals/**` |
| Harry | `web/lib/**`, `web/middleware.ts`, `web/app/c/**`, `web/components/client/**` |
| Sam | `web/app/(staff)/**`, `web/app/(dev)/**` (delete), `web/components/staff/**`, `web/components/deals/**`, `web/components/review/**` (new), `web/app/page.tsx`, `web/app/login/**` |
| Ruth | `/scripts/**`, `/.github/**`, `.env.example`, `web/.env.example`, root `package.json` scripts |
| Maya | `docs/BUILD_PLAN.md`, `docs/DESIGN_BRIEF.md`, `docs/UI_BUILD.md`, `design/README.md` (docs only) |
| Davis | `CLAUDE.md`, `docs/CONTRACTS.md`, integration |
Shared, read-only for everyone: `web/components/cs/**`, `web/app/globals.css`, `web/components/ui/**`.

## 7. /client response shapes (Joel)

Written 2026-11-23 against `mara/mara/client_portal.py` (tests: `mara/tests/test_client_portal.py`).

**Transport.** `POST {MARA_URL}/client/{action}`, JSON body, header `X-Mara-Signature` (§1 of this file's
HMAC rule: `t=<unix>,v1=hex(HMAC_SHA256(secret, "<t>.<raw body>"))`, 300 s tolerance). Every body carries
`token` (raw portal token, 8-256 chars) and, for the actions that need it, `session`. Mara stores only
`sha256(token)`, `sha256(code)` and `sha256(session)` (lowercase hex). **All response keys are camelCase.**
Success is HTTP 200 (`/events` is 202). Errors are `{ "error": "<code>", ...extra }` with the status below.

**Errors (all actions).**
| status | `error` | when |
|---|---|---|
| 401 | `invalid_signature` | missing/old/bad HMAC |
| 401 | `session_required` | no session, wrong session or session older than 30 days (all actions except `portal`, `send_code`, `verify_code`) |
| 404 | `unknown_action` / `link_invalid` / `item_not_found` / `document_not_found` | unknown action, token not found, item/document not on this deal |
| 410 | `link_expired` | link expired or revoked |
| 409 | `item_not_open` (item not `missing`/`needs_fix`), `upload_missing` (confirm before the bytes arrived) | |
| 422 | `invalid_body` (`details`), `unsupported_type` (`acceptedTypes`), `too_large` (`maxBytes`) | |
| 500 | `server_error` | unexpected; details only in Mara's logs |

**Request bodies** (besides `token`, `session?`): `portal {}` · `checklist {}` · `item {itemId}` ·
`send_code {}` · `verify_code {code: "6 digits"}` · `create_upload {itemId, filename, sizeBytes, mime}` ·
`confirm_upload {documentId}` · `set_opt_out {optOut: boolean}`.

**`portal`** (no session needed) = `ClientPortalVM` + the verify-screen fields, flat:
```
{ mode: "live", token, client: {firstName, name}, deal: {address, cityLine: "Austin, TX 78704"},
  agent: {name, phone | null}, needsVerification: boolean,
  phoneMasked: "•••-•••-0142", state: "ready" | "expired" | "locked", resendAfterSeconds: number }
```
`needsVerification` is false only when `session` is valid. `state`: `locked` while `locked_until` is in the
future (`resendAfterSeconds` = seconds left), `expired` when the last code is past its 10 minutes, else `ready`
(`resendAfterSeconds` = the 30 s resend throttle left).

**`checklist`** = `ClientChecklistVM`: `{headline, doneCount, totalCount, toDo[], checking[], done[],
sms: {optedOut, canToggle}}`. Item = `{id, name, description, status: "to_do"|"needs_fix"|"checking"|"done",
chip: {label, tone}, fixNote | null, dueDate (YYYY-MM-DD) | null, uploadedAt (ISO) | null}`.
Mapping: `missing`→`to_do` (chip "To do"/neutral) · `needs_fix`→`needs_fix` ("Needs a fix"/warn, `fixNote` set)
· `checking` and `review`→`checking` ("Being checked"/info) · `complete`→`done` ("Done"/ok) · `waived` is hidden
(not in any list or count). `toDo` holds `to_do` and `needs_fix`. Headline: "Hi Enoch, 3 things left" /
"Thanks Enoch, we're checking your documents" / "All done, Enoch. Thank you!". `canToggle` = SMS consent given.

**`item {itemId}`** = `ClientItemVM`: `{item: <as above>, uploads: [{id, filename, uploadedAt, statusLabel}],
upload: {maxBytes: 26214400, acceptedTypes: [pdf, docx, jpeg, png mime types], acceptLabel}}`. `uploads` are newest
first; `statusLabel` is "Being checked", "Needs a fix", "Accepted" (latest, item complete) or "Replaced".
Documents still `uploading` are not listed.

**`send_code`** → `{sent: true, phoneMasked, expiresInSeconds: 600}` or `{sent: false, reason: "too_soon" |
"locked", retryAfterSeconds}`. It inserts a `verify_code` message (queued; code in the body), which is sent by
`send_message`. Resending does NOT reset the attempt counter.

**`verify_code {code}`** → always HTTP 200: `{verified: true, attemptsLeft: 5, session: "<raw token>"}` or
`{verified: false, attemptsLeft: n, reason: "wrong_code" | "expired" | "no_code" | "locked",
retryAfterSeconds?}`. The 5th wrong code sets `client_links.locked_until = now + 15 min` (reason `locked`,
`retryAfterSeconds` 900) and clears the code; until then even the right code is refused. The web puts `session`
in an httpOnly cookie and sends it as `session` afterwards (valid 30 days).

**`create_upload`** → `{documentId, uploadUrl}`. Mara inserts the `documents` row (`status: uploading`,
next `version` for the item, `staging_path` = `deals/{deal_number}/{type}/{documentId}.{ext}` in
`uploads-staging`). Allowed mime: `application/pdf`, DOCX, `image/jpeg`, `image/png`, max 25 MB.
**Browser upload:** `uploadUrl` is Supabase Storage's signed upload URL
(`{SUPABASE_URL}/storage/v1/object/upload/sign/uploads-staging/<key>?token=<jwt>`): the token is already in the
query string, so send a plain `PUT uploadUrl` with the file bytes as the body and `Content-Type: <the mime
sent to create_upload>`; no auth header, no multipart. (Supabase's JS client sends multipart, the raw
PUT is the documented raw-body form; this was NOT exercised against a live project. If it returns 4xx,
switch to `supabase.storage.from("uploads-staging").uploadToSignedUrl(path, token, file)`, where `path`
is `uploadUrl`'s key and `token` its query token.) The URL is valid for about 2 hours.

**`confirm_upload {documentId}`** → `{documentId, status: "checking"}`. Refuses with 409 `upload_missing` unless
the object exists in `uploads-staging`. Then sets the document to `received` (the webhook fires
`document.created`), the item to `checking` and clears its `fix_note`. Safe to call twice.

**`set_opt_out {optOut}`** → `{optedOut}`; sets/clears `clients.sms_opt_out_at`.

**Messages and links (decisions).**
- `invite` and `fix_request`: the web writes the body (only the web sees the raw token). `send_message` sends
  an `invite` body as written; a `fix_request` body without a `/c/` link gets the `fix_request_footer` appended
  with a fresh portal link. An empty `invite` body is blocked (`empty_body`).
- `reminder` and `verify_code` bodies are built by Mara from `config/messages.yaml`. Because Mara cannot recover
  a raw token, each reminder and each fix-request footer **mints a new `client_links` row** (sha256 stored, 30-day
  expiry) and puts `{PUBLIC_SITE_URL}/c/{newToken}` in the text. Old links keep working until they expire.
- `messages.error` holds the reason for `blocked`/`failed` (`not_approved`, `no_consent`, `opted_out`,
  `no_phone`, `empty_body`, `banking_or_wiring_details`, `legal_or_financial_advice`, `expired_unsent`).
  Messages stay `queued` (never marked sent) during quiet hours, provider outages or missing provider keys; the
  hourly sweep retries them, and a message still queued after 24 h (15 min for a verify code) becomes `failed`.
