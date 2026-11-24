# CLAUDE.md: Mara (Cedar & Stone Realty demo)

Mara is an AI document checker with a human in the loop. Clients upload documents through a personal link;
Mara (Python on Modal, using Claude) checks each one against its document type's standard (YAML); the agent
reviews the findings and either marks the item complete or sends a fix request; the client re-uploads; Mara
sends automatic SMS reminders (EgoSMS) for missing items. The demo brokerage, Cedar & Stone Realty, and all its
data are fictitious.

Read `docs/CONTRACTS.md` first. **It is the source of truth** and wins over `docs/BUILD_PLAN.md`.

## Scope
The system does one loop: upload → AI check against the standard → human review → mark complete or fix
request → re-upload, plus automatic reminders. Dashboards, an approvals queue, a timeline engine, risk scores,
drafting, chat ("Ask Mara"), settings, audit export, Twilio, email and Google Drive were deliberately cut. Don't
add them back unless asked.

## Data and message flow
1. **New deal** (`/deals/new`, web server action): creates the deal, client, checklist items, a client link and
   a queued `invite` message.
2. **Client portal** (`/c/[token]`): every read and write goes web server → Mara `POST /client/{action}`
   (HMAC-signed). Mara resolves `sha256(token)` with the service role. Verify a 6-digit code → 30-day session
   cookie (httpOnly).
3. **Upload:** `create_upload` returns a signed upload URL into the private `uploads-staging` bucket; the
   browser PUTs the bytes; `confirm_upload` sets the document to `received` and the item to `checking`.
4. **Webhook:** a Postgres trigger (`mara.notify_event`, pg_net, HMAC from Vault) posts
   `{type: 'document.created' | 'message.queued', id}` to Mara `POST /events`. Mara records an idempotent
   `mara_jobs` row and spawns the job.
5. **`process_document`:** supersedes older versions, copies the file to `deal-files` via `FileStore`, sends it to
   Claude with the standard and the prompt, writes findings, sets the item to `review`, logs `ai_runs` and
   `audit_log`. On any failure: one blocker finding "Mara couldn't read this file", item still goes to `review`.
6. **Review** (`/review/[itemId]`): **Mark complete** → `complete`; **Send fix request** → an approved
   `fix_request` message + item `needs_fix` with `fix_note`. The deal flips to `complete` when every non-waived
   item is complete (DB trigger).
7. **`send_message`** (the only SMS caller): send rule, consent, opt-out, quiet hours, outbound content filter,
   then `EgoSmsProvider.send()`.
8. **`hourly_sweep`** (Modal cron, advisory lock): re-dispatch stuck documents, retry queued messages, send
   reminders on the cadence in `config/reminders.yaml`.

## Non-negotiable rules
1. **Nothing reaches a client unless it's a system template or the agent approved it.** Only
   `mara/mara/outbound/sender.py::send_message()` calls the SMS provider. It sends `invite`, `verify_code` and
   `reminder` (templates in `config/messages.yaml`) and `fix_request` only when `approved_by` is set (DB check
   constraint). Keep the boundary test (`mara/tests/test_send_boundary.py`) green.
2. **Mara never interprets contracts, gives legal or financial advice, or sends banking or wiring details.**
   Enforce it in prompts AND in the code-level outbound filter (`mara/mara/outbound/filter.py`).
3. **Postgres is the source of truth; Supabase Storage stores files** (`uploads-staging` → private
   `deal-files`, behind `FileStore`). Reference files by `documents.file_path`. Never hard-delete documents or
   objects; mark them superseded.
4. **Document types, standards, reminder cadence and SMS templates are config** in `config/` (YAML), not code.
5. **Every Mara action and agent decision goes to `audit_log`** (append-only). Every model call to `ai_runs`.
6. **SMS goes through the `SmsProvider` interface.** Check consent, opt-out and quiet hours before any send.
7. **Fictitious seed data only.** Never commit real client documents or secrets.
8. When a business or legal decision is unclear, leave `TODO(decision): ...` and continue. Don't guess silently.

## Architecture
- `web/`: Next.js 15 App Router. Agent screens (`/review`, `/review/[itemId]`, `/deals`, `/deals/new`,
  `/deals/[id]`) and the client portal (`/c/[token]`, `verify`, `items/[itemId]`). **No AI calls, document
  parsing, SMS sending or service-role key here.** Screens call `@/lib/data` only, which switches between demo
  fixtures and live Supabase/Mara.
- `mara/`: Python on Modal. FastAPI ASGI app with `/events` and `/client/*`, functions `process_document` and
  `send_message`, cron `hourly_sweep`. Every endpoint verifies an HMAC signature
  (`X-Mara-Signature: t=<unix>,v1=hex(HMAC_SHA256(secret, "<t>.<raw body>"))`, 300 s tolerance).
- `supabase/`: migrations, seed, RLS, the webhook trigger, storage buckets.
- `config/` and `prompts/`: shipped into the Modal image at `/root/config` and `/root/prompts`.

## Key files
| File | What it does |
|---|---|
| `docs/CONTRACTS.md` | Statuses, schema, endpoints, view models, `/client/*` response shapes |
| `mara/app.py` | Modal app: image, secrets, functions, cron, ASGI entry |
| `mara/mara/api.py` | FastAPI app: `/events`, `/client/{action}`, HMAC check |
| `mara/mara/client_portal.py` | Client portal actions (token, session, code, upload, opt-out) |
| `mara/mara/pipeline.py` | `process_document` |
| `mara/mara/checker.py` | Claude check, structured output, confidence floors (signature 0.9, initials 0.85) |
| `mara/mara/outbound/sender.py` | `send_message()`: the only SMS caller |
| `mara/mara/outbound/filter.py` | Outbound content filter |
| `mara/mara/outbound/providers.py` | `SmsProvider`, `EgoSmsProvider`, the off/blocked provider |
| `mara/mara/sweep.py` | Hourly sweep and reminders |
| `mara/mara/storage/` | `FileStore` interface, Supabase and in-memory implementations |
| `supabase/migrations/` | Schema, guards/triggers, RLS, storage, webhook, explicit grants |
| `supabase/seed.sql` | Fictitious Cedar & Stone data, demo agent and demo client link |
| `config/standards/*.yaml` | The rules per document type |
| `prompts/check_document.md` | The check prompt (version header) |
| `web/lib/data/` | Data functions (demo + live) |
| `web/lib/view-models.ts` | Zod-inferred view model types |
| `web/lib/mara-client.ts` | HMAC signer for web → Mara calls |
| `web/lib/env.ts` | Env parsing, demo-mode guard, open login |
| `web/lib/demo/` | Demo fixtures and in-memory store |
| `web/components/review/review-workbench.tsx` | The HITL review screen |
| `evals/run_evals.py` | AI evals (fake model by default, `--live` for real calls) |

## Commands
```bash
pnpm install                         # web deps (pnpm workspace)
cd web && MARA_DEMO=1 pnpm dev        # demo mode, no backend: /review and /c/demo
pnpm test                            # web Vitest + mara pytest (not integration) + supabase pytest
pnpm test:int                        # integration tests (skip without Supabase env)
pnpm eval                            # evals on the fake model; `pnpm eval -- --live` for real Claude
pnpm lint                            # ESLint, tsc, ruff
pnpm gen:hmac                        # new HMAC secret
cd web && pnpm typecheck && pnpm build
cd mara && uv run modal deploy app.py
npx supabase@2 db push               # migrations to the linked project
```
Run `pnpm test`, `pnpm lint` and `pnpm eval` before calling a change done.

## Conventions
- TypeScript strict, App Router, server actions for mutations, Zod for every input. Mutations return
  `MutationResult<T>`, reads `Result<T>`.
- Python 3.12, uv, pydantic models for every endpoint and tool input, pytest with fakes (fake Claude, fake SMS
  provider, in-memory FileStore, pgserver Postgres).
- Supabase RLS on every table; test with an agent role, a broker role and anon.
- Prompts live in `prompts/*.md` with a version header; bump the version on change and rerun `evals/`.
- UI keeps the Cedar & Stone sky theme (`web/components/cs`); every screen needs empty, loading, error and
  mobile states.
- Every Mara job is idempotent (`mara_jobs.idempotency_key`); the sweep takes a Postgres advisory lock.

## Env and deploy rules
- All variables are documented in `.env.example` and `web/.env.example`. Local files are `mara/.env` and
  `web/.env.local`, both git-ignored. Never commit real values.
- The **service-role key lives only in Modal** (`mara-secrets`). The web uses the anon key.
- `MARA_HMAC_SECRET` must match in Vercel, the Modal secret and Supabase Vault (`mara_hmac_secret`).
- Vercel: root directory `web`. Modal: `cd mara && uv run modal deploy app.py`. Supabase: `db push`, then the
  two Vault secrets.
- Local tooling without Docker: `npx supabase@2` for the CLI, `pgserver` for Postgres 16 in tests.

## Known shortcuts (demo only)
- `MARA_DEMO=1`: fixtures and no login (refused in production unless `MARA_DEMO_ALLOW_PROD=1`).
- `MARA_OPEN_LOGIN=1`: any details sign in as the shared demo agent (`DEMO_AGENT_EMAIL/PASSWORD`, server-only).
- `MARA_SMS_MODE=off`: nothing is texted (messages recorded as blocked `sms_disabled`).
- `MARA_CLIENT_VERIFY=0`: client links open without the code.
- The seed contains a known demo client token. The EgoSMS request format is unverified (`TODO(decision)`).
- `createDeal` multi-step writes aren't in one transaction; a document stuck in `processing` after a hard crash
  isn't recovered.
- The skyline photo (`design/assets/`, `web/public/theme/`) has no confirmed licence.

## Glossary
- **Standard:** the YAML rules a document type must meet (signatures, initials, dates, required fields).
- **Finding:** a problem Mara detected against the standard, with page and quote evidence.
- **Review (HITL):** the agent's decision on a checked document: mark complete, or send a fix request.
- **Fix request:** the agent-approved note sent to the client by SMS and shown in the portal.

## Credits
Built with Claude Code and the Claude API (Anthropic). Screen designs from Claude Design (`design/`). Next.js,
Supabase, Modal, shadcn/ui, Tailwind CSS, EgoSMS. Fonts: Geist and Sora (SIL OFL, `web/app/fonts/`).
