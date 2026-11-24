# Mara: AI document checker with a human in the loop

Mara collects documents from clients and checks each one with Claude against a written standard: are the
signatures there, the initials, the dates, the required fields? A human reviews what Mara found and either
marks the document complete or sends the client a fix request. Mara then texts the client reminders until
every document is in.

The demo is set up for **Cedar & Stone Realty**, a fictitious real estate brokerage in Austin, Texas. All
names, addresses, phone numbers and documents in this repo are made up.

```
Client uploads a document ─► Mara checks it against the standard ─► Agent reviews the findings
                                                                    ├─► Mark complete  ─► item done
                                                                    └─► Send fix request ─► client re-uploads ─► loop
Missing items ─► automatic SMS reminders (consent, opt-out, quiet hours)
```

---

## Who it's for

Any business that collects signed or filled-in documents from customers and checks them by hand. The demo ships
with six real estate document types. Other businesses swap in their own types and standards (YAML files).

| Business type | What it takes off their plate |
|---|---|
| Real estate brokerages and transaction coordinators | Chasing buyers and sellers for contracts, disclosures and addenda, and spotting the missing initial on page 2 before closing |
| Mortgage brokers and loan officers | Collecting pre-approval paperwork, pay stubs and bank letters, and checking each one is signed, dated and current |
| Property managers | Lease applications and signed leases: every page initialed, every tenant signed, move-in date filled in |
| Insurance agencies | Signed applications, disclosure forms and claim paperwork with required fields filled in |
| Accounting and tax practices | Engagement letters and client-signed forms collected before the deadline rush |
| HR and staffing agencies | New-hire paperwork: signed offer letters, policy acknowledgements, dated forms |

## How it creates value

- **Time saved.** The first pass over every upload (is it the right document, is it signed, is anything
  blank?) is done by Mara in under a minute. The human only looks at what Mara flagged.
- **Fewer errors.** Every document is checked against the same written rules, every time. A missing initial
  or a blank sales price is caught at upload, not at closing.
- **Revenue protected.** Incomplete paperwork delays or kills deals. Catching problems early, and chasing
  missing items automatically, keeps deals moving.
- **Better client experience.** Clients get one link, a clear checklist, plain-English fix notes ("please
  initial the bottom of every page") and reminders only at sensible hours. No more email threads with
  attachments.
- **Human control stays.** Mara never sends anything to a client on its own judgement. Fix requests go out only
  after the agent clicks **Send fix request**, and the database refuses an unapproved one.

The demo's first live check cost about 3.5 US cents and took about 25 seconds per document with Claude Opus.
Your costs depend on page counts and the model you pick.

---

## Features

- **Agent screens:** review queue (`/review`), the review workbench with the document on the left and Mara's
  findings (severity, page, quote) on the right (`/review/[itemId]`), deals list, one-page new-deal form, and
  a deal page with the checklist, reminders toggle and an activity log.
- **Client portal:** a personal link (`/c/[token]`), 6-digit SMS code verification, a checklist grouped into
  To do / Being checked / Done, an item page with drag-and-drop or camera upload (PDF, DOCX, JPG, PNG, up to
  25 MB), and an SMS opt-out toggle.
- **AI check:** Claude reads PDFs and images natively and checks them against a YAML standard per document
  type. Structured JSON findings with page number and quote. Signatures need 90% confidence to pass (initials
  85%); anything less becomes a warning for the human.
- **Automatic reminders:** an hourly sweep sends one combined SMS per client on a fixed cadence (day 2, day 4,
  then every 3 days), only at the client's local send hour, never in quiet hours, at most once a day.
- **Safety rails in code:** one function is the only SMS sender; a DB check constraint blocks unapproved fix
  requests; an outbound filter blocks banking/wiring details and legal or financial advice phrasing;
  HMAC-signed endpoints; idempotent jobs; append-only `audit_log` and `ai_runs`.
- **Demo mode:** `MARA_DEMO=1` runs the whole loop in the web app on fictitious fixtures with no backend.

### Architecture

```
            Browser (agent)                          Browser (client, phone)
                  │                                          │
                  ▼                                          ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │  web/  Next.js 15 on Vercel                                      │
   │  Agent screens use Supabase (anon key + RLS).                    │
   │  Client portal calls Mara /client/* (HMAC-signed, server-side).  │
   │  No AI calls, no SMS, no service-role key here.                  │
   └───────────────┬──────────────────────────────────┬──────────────┘
                   │ SQL (RLS)                         │ POST /client/* (HMAC)
                   ▼                                   ▼
   ┌───────────────────────────────┐      ┌──────────────────────────────────┐
   │ Supabase                      │      │ mara/  Python on Modal           │
   │ Postgres (13 tables, RLS)     │─────►│ POST /events  (pg_net webhook,   │
   │ Storage: uploads-staging ─►   │ HMAC │   HMAC-signed)                   │
   │          deal-files (private) │      │ process_document ─► Claude API   │
   │ Auth (agents)                 │◄─────│ send_message ─► EgoSMS (only     │
   │ Vault (webhook URL + secret)  │ SQL  │   sender)                        │
   └───────────────────────────────┘      │ hourly_sweep (cron, advisory lock)│
                                          └──────────────────────────────────┘
                       config/ (document types, standards, reminders, SMS templates)
                       prompts/check_document.md (versioned prompt)
```

1. The client uploads straight into the private `uploads-staging` bucket through a signed URL from Mara.
2. Confirming the upload flips the `documents` row to `received`; a Postgres trigger signs and posts an event
   to Mara's `/events`.
3. Mara copies the file into `deal-files`, sends it to Claude with the standard, and writes findings. The item
   moves to **Ready for review**.
4. The agent marks it complete or sends a fix request (the click is the approval). Messages are queued rows; a
   trigger wakes Mara's `send_message`, which checks consent, quiet hours and the content filter first.

---

## Project structure

```
.
├── web/                 Next.js app: agent screens, client portal, data layer (demo + live)
│   ├── app/(staff)/     /review, /review/[itemId], /deals, /deals/new, /deals/[id]
│   ├── app/c/[token]/   client portal: verify, checklist, item page
│   ├── components/cs/   Cedar & Stone "sky" UI kit
│   └── lib/             env, data functions, view models (Zod), Mara HMAC client, demo store
├── mara/                Python service on Modal
│   ├── app.py           Modal app: ASGI endpoints, process_document, send_message, hourly_sweep
│   ├── mara/            checker (Claude), pipeline, client_portal API, sweep, outbound/ (sender,
│   │                    filter, EgoSMS provider), storage/ (FileStore), security/ (HMAC, tokens)
│   └── tests/           pytest (fake Claude, fake SMS, in-memory file store, embedded Postgres)
├── supabase/            migrations (schema, guards, RLS, storage, webhook, grants), seed.sql, tests
├── config/              document_types.yaml, standards/*.yaml, reminders.yaml, messages.yaml
├── prompts/             check_document.md (versioned prompt)
├── evals/               fixture PDFs + expected findings; run_evals.py (fake model or --live)
├── demo-docs/           realistic fictitious PDFs for a live demo (6 good, 5 flawed)
├── scripts/             test / integration / eval / lint runners, HMAC secret generator, PDF generator
├── design/              Claude Design screen exports and the theme (visual reference only)
├── docs/                CONTRACTS.md (source of truth), BUILD_PLAN.md, DESIGN_BRIEF.md, UI_BUILD.md
└── .github/workflows/   CI: web, mara, supabase, evals (no secrets needed)
```

---

## Setup guide

### Option A: try it in 2 minutes (demo mode, no accounts)

1. Install **Node 22+** and **pnpm** (`corepack enable`, the version is pinned in `package.json`).
2. ```bash
   git clone https://github.com/daboss777x/mara-ai-document-checker.git
   cd mara-ai-document-checker
   pnpm install
   cd web && MARA_DEMO=1 pnpm dev
   ```
3. Open <http://localhost:3000/review> as the demo agent, and <http://localhost:3000/c/demo> as the demo client.
   Upload any file on the client side, then review it on the agent side. Nothing is sent anywhere.

### Option B: the full live stack

You need accounts at Supabase, Modal and Anthropic, plus Vercel to host the web app. EgoSMS is optional
(leave SMS off for a demo).

**1. Install the local tools**
- Node 22+ and pnpm (`corepack enable`)
- Python 3.12 and [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- The Supabase CLI runs through npx (`npx supabase@2 ...`), and the Modal CLI through uv (`uv run modal ...`).
  No Docker is needed.

**2. Clone and run the tests**
```bash
git clone https://github.com/daboss777x/mara-ai-document-checker.git
cd mara-ai-document-checker
pnpm install
(cd mara && uv sync) && (cd supabase && uv sync)
pnpm test     # web (Vitest) + mara (pytest) + supabase (pytest on an embedded Postgres)
pnpm eval     # 6 AI eval cases against a fake model
```

**3. Generate the shared HMAC secret**
```bash
pnpm gen:hmac      # prints a 64-character hex secret
```
Keep it somewhere safe. The **same value** goes into Vercel, Modal and Supabase Vault.

**4. Create the Supabase project**
1. Sign up at <https://supabase.com> and create a project (the free plan is enough to try it).
2. Link and push the schema and seed:
   ```bash
   npx supabase@2 login
   npx supabase@2 link --project-ref YOUR_PROJECT_REF
   npx supabase@2 db push --include-seed
   ```
   This creates the 13 tables, row-level security, the private storage buckets, the webhook trigger and the
   fictitious Cedar & Stone seed data.
3. In **Authentication → Users**, set a password for the seeded demo agent (`rachel.kim@example.com`). For your
   own agents, create the Auth user and add a matching row in `public.users` (same id, the brokerage id, role
   `agent` or `broker`).
   If setting the password or signing in fails with "Database error querying schema", the seeded Auth rows have
   NULL token columns. Fix them once in the SQL editor:
   ```sql
   update auth.users set confirmation_token = coalesce(confirmation_token, ''),
     recovery_token = coalesce(recovery_token, ''), email_change = coalesce(email_change, ''),
     email_change_token_new = coalesce(email_change_token_new, '')
   where email like '%@example.com';
   ```
4. From **Project Settings → API**, copy the project URL, the `anon` key and the `service_role` key. From
   **Project Settings → Database**, copy the connection string (`DATABASE_URL`).

**5. Get an Anthropic API key**
Create one at <https://console.anthropic.com>. The check model defaults to `claude-opus-5-5`
(`MARA_CHECK_MODEL`).

**6. Deploy Mara to Modal**
1. Sign up at <https://modal.com>, then:
   ```bash
   cd mara
   uv run modal setup
   uv run modal secret create mara-secrets \
     MARA_ENV=staging \
     MARA_HMAC_SECRET=... \
     ANTHROPIC_API_KEY=... \
     SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
     SUPABASE_SERVICE_ROLE_KEY=... \
     DATABASE_URL=... \
     PUBLIC_SITE_URL=https://YOUR-APP.vercel.app \
     MARA_SMS_MODE=off \
     MARA_CLIENT_VERIFY=0
   uv run modal deploy app.py
   ```
   `MARA_SMS_MODE=off` and `MARA_CLIENT_VERIFY=0` are the no-SMS demo setting. For real use, set
   `MARA_SMS_MODE=egosms`, `MARA_CLIENT_VERIFY=1` and the `EGOSMS_*` variables (see `.env.example`).
2. Note the URL Modal prints for the `web` function. That is your `MARA_URL`.

**7. Point the Supabase webhook at Mara**
In the Supabase SQL editor:
```sql
select vault.create_secret('https://YOUR-MODAL-URL/events', 'mara_events_url');
select vault.create_secret('THE_SAME_HMAC_SECRET', 'mara_hmac_secret');
```
Until these exist the trigger quietly does nothing, and the hourly sweep picks up missed documents.

**8. Deploy the web app to Vercel**
1. Import the repo at <https://vercel.com/new> and set **Root Directory** to `web`.
2. Add the environment variables from `web/.env.example`: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `MARA_URL`, `MARA_HMAC_SECRET`. For a shared demo,
   also `MARA_OPEN_LOGIN=1`, `DEMO_AGENT_EMAIL` and `DEMO_AGENT_PASSWORD` (see Security notes).
3. Deploy. Then set `PUBLIC_SITE_URL` in the Modal secret to the Vercel URL and redeploy Mara if it changed.

**9. Test the live loop**
1. Sign in, open **Deals → New deal**, and create the deal described in `demo-docs/README.md`
   (client "Jordan Avery", all 6 documents).
2. Open the client link from the deal page, upload `demo-docs/02-sales-contract.pdf` to the sales contract
   item, and watch it move to **Being checked**, then to **Ready for review** on `/review`.
3. Upload a `demo-docs/FIX-*.pdf` file to see findings, send a fix request, re-upload a good copy and mark it
   complete.
4. Optional: `pnpm eval -- --live` runs all 17 eval cases against the real model (uses your Anthropic key from
   the environment and costs a little).

### Local env files
Copy `.env.example` to `mara/.env` and `web/.env.example` to `web/.env.local` for local work. Both are
git-ignored. Never commit real values.

---

## Customise it for your business

| What | Where |
|---|---|
| Document types a checklist can ask for | `config/document_types.yaml` (and seed the same keys into `public.document_types`) |
| The rules each document must meet | `config/standards/<key>.yaml`: `required_signatures`, `required_initials`, `required_dates`, `required_fields`, `other_rules`, each with a severity and the client-facing fix text |
| Reminder cadence, send hour, quiet hours, daily cap | `config/reminders.yaml` |
| SMS wording (invite, code, reminder, fix-request footer) | `config/messages.yaml` |
| The check prompt | `prompts/check_document.md` (bump the version header, then rerun `pnpm eval`) |
| Which Claude model checks documents | `MARA_CHECK_MODEL` in the Modal secret |
| Signature and initials confidence floors | `mara/mara/checker.py` |
| What the outbound filter blocks | `mara/mara/outbound/filter.py` |
| SMS provider | Implement `SmsProvider` in `mara/mara/outbound/providers.py` |
| Brand, colours, logo, background | `web/app/globals.css`, `web/components/cs/`, `web/public/brand/`, `web/public/theme/` |
| Brokerage name and demo data | `supabase/seed.sql`, `web/lib/demo/fixtures.ts` |
| Upload size and file types | `supabase/config.toml`, `mara/mara/client_portal.py`, `supabase/migrations/*_storage.sql` |

---

## Security notes before real use

This is a demo build. Before any real client data goes through it:

- **Turn off the demo shortcuts.** `MARA_DEMO=1` serves fixtures and lets anyone into the staff area (the app
  refuses it in production unless `MARA_DEMO_ALLOW_PROD=1`). `MARA_OPEN_LOGIN=1` signs **any** email and
  password in as one shared demo agent. `MARA_CLIENT_VERIFY=0` opens client links without the SMS code. All
  three must be off for real use.
- **Change the seeded demo link.** `supabase/seed.sql` contains a known demo client token for the fictitious
  deal. Don't run the seed against a production project, or revoke that link.
- **The EgoSMS request format is unverified.** It was written from memory (`TODO(decision)` in
  `mara/mara/outbound/providers.py`). Test it against EgoSMS's current API docs before relying on it.
- **Mara does not give legal or financial advice.** The prompt and a code-level filter enforce it, but the
  filter is a blunt regex list. A licensed human still reviews every document.
- **Rotate the HMAC secret** if it ever leaks; it must match in Vercel, Modal and Supabase Vault.
- **Check the background photo licence.** `design/assets/austin-skyline.jpg` and `web/public/theme/austin-skyline.jpg`
  have no confirmed licence. Replace them before any commercial use.
- Known gaps: multi-step writes in `createDeal` don't run in one transaction, and a document stuck in
  `processing` after a hard crash isn't recovered automatically.
- The service-role key lives only in Modal. Keep it out of the web app and the browser.

---

## Credits

- Built with [Claude Code](https://claude.com/claude-code) and the [Claude API](https://docs.anthropic.com) by Anthropic.
- Screen designs made in Claude Design (exports in `design/`).
- [Next.js](https://nextjs.org), [Supabase](https://supabase.com), [Modal](https://modal.com),
  [shadcn/ui](https://ui.shadcn.com), [Tailwind CSS](https://tailwindcss.com), [EgoSMS](https://www.egosms.co).
- Fonts: [Geist](https://vercel.com/font) and [Sora](https://fonts.google.com/specimen/Sora), both under the SIL
  Open Font License (licences in `web/app/fonts/`).

No licence file is included. You can read the code, but it isn't licensed for reuse yet.
