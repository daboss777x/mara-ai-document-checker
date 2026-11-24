# BUILD PLAN: Mara, the document-check assistant (Cedar & Stone Realty demo)

**Owner:** Enoch Omunu. **Builder:** Claude Code. **Version:** lean, 23 Nov 2026.
**Demo client (fictitious):** Cedar & Stone Realty, Austin, Texas.

`docs/CONTRACTS.md` is the source of truth for the data model, endpoints, screens and view models. If this plan disagrees with it, CONTRACTS.md wins. This file gives the story and the plan. It does not repeat the details.

Everything here is fictitious demo data. Use no real client documents or personal data.

---

## 1. Summary

Mara helps a real estate agent collect and check client documents.

1. The agent creates a deal and a client on one page. The client gets a checklist of required documents, a personal link and an SMS invite.
2. The client opens the link, enters a 6-digit SMS code, sees the checklist and uploads a file against an item.
3. Mara (AI) checks the file against that document type's standard. She lists findings, each with a page and a quote.
4. The agent reviews Mara's work. The agent either marks the item complete or sends a fix request.
5. A fix request goes to the client by SMS and shows in the portal. The client re-uploads and the loop repeats.
6. Missing and needs-fix items get automatic SMS reminders on a fixed schedule.
7. When every item is complete, the deal is complete.

A person always decides. Mara checks. She never signs off on her own.

---

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **EgoSMS is the only SMS provider.** It sits behind the `SmsProvider` interface. | Enoch's choice. One provider keeps the demo simple. |
| D2 | **A fix request is sent only when the agent clicks "Send fix request".** The click is the approval. | One human step where it matters. |
| D3 | **Reminders are automatic**, from one system template and a fixed cadence in `config/reminders.yaml`. | Low risk, and it is the point of the product. |
| D4 | **Supabase Storage holds the files.** Private buckets `uploads-staging` and `deal-files`, behind the `FileStore` interface. | No Google Workspace. Postgres stays the source of truth. |
| D5 | **Claude does the document checks.** The model comes from `MARA_CHECK_MODEL`. | Reads PDFs and images directly. |
| D6 | **One-page deal form.** No wizard. | Fewer screens, faster demo. |
| D7 | **The client portal talks to Mara, not to the database.** Every portal read and write goes through Mara's `/client/*` endpoints. | The web app never holds the service-role key. |
| D8 | **The client uploads against a known checklist item.** There is no document classification step. | The item already tells us the type. |

---

## 3. Roles

| Role | Can do |
|---|---|
| **Agent** | Creates deals. Reviews Mara's findings. Marks items complete, sends fix requests, waives or reopens items, turns reminders on or off. Sees their own deals. |
| **Broker** | Same as the agent, for every deal in the brokerage. |
| **Client** | Opens a personal link, verifies by SMS code, uploads files, reads fix notes, turns SMS reminders off. Is not a Supabase user. |

There is no licensee gating and no transaction coordinator role.

---

## 4. The flow

Details and status tables are in CONTRACTS.md §1 and §2.

```
New deal ─► checklist + client link + invite SMS
Client verifies ─► uploads against an item ─► item: checking
Mara checks the file ─► findings ─► item: review
Agent opens /review ─► Mark complete (item: complete)
                    └► Send fix request (item: needs_fix, SMS + portal) ─► client re-uploads ─► loop
Reminders (hourly sweep) ─► missing and needs_fix items
All items complete ─► deal complete
```

If Mara can't read a file, the item still goes to `review` with a "Mara couldn't read this file" finding. The agent always decides.

---

## 5. Data model

See **CONTRACTS.md §3**. Main tables: `deals`, `clients`, `client_links`, `checklist_items`, `documents`, `findings`, `messages`, `audit_log`, `ai_runs`, `mara_jobs`.

Rules that stay:
- Postgres is the source of truth. Files are always referenced by `documents.file_path`.
- Never hard-delete documents. Older versions are marked `superseded`.
- `audit_log` and `ai_runs` are append-only.
- RLS is on every table.

---

## 6. Standards and config

Policy lives in files, not in code. One Python engine in `/mara` reads them. The web app only reads computed rows.

| File | What it holds |
|---|---|
| `config/document_types.yaml` | About six fictitious Texas document types: buyer rep agreement, sales contract, seller's disclosure, lead-based paint addendum, pre-approval letter, HOA addendum. |
| `config/standards/<key>.yaml` | The checks for one type: required signatures, initials, dates, fields and other rules. Each rule has a severity and a plain-words fix text for the client. |
| `config/reminders.yaml` | Cadence, send hour, quiet hours, daily cap. |
| `config/messages.yaml` | SMS templates: invite, verify code, reminder, fix request footer. |
| `prompts/check_document.md` | The check prompt, with a version header. Bump it on any change and rerun `evals/`. |

A signature or initials rule is never reported as passing below 0.9 confidence. When unsure, Mara raises a warning.

---

## 7. Screens

Full table in **CONTRACTS.md §5**. Copy and states are in `DESIGN_BRIEF.md`. Every screen needs empty, loading, error and mobile states.

**Staff:** `/login`, `/review`, `/review/[itemId]`, `/deals`, `/deals/new`, `/deals/[id]`.
**Client:** `/c/[token]/verify`, `/c/[token]` (checklist), `/c/[token]/items/[itemId]`.

Staff nav is Review and Deals. Nothing else.

**Demo mode:** `MARA_DEMO=1` runs the whole loop with no backend. Nothing is sent. See `docs/UI_BUILD.md`.

---

## 8. Security baseline

- **Nothing reaches a client without a rule behind it.** Only `send_message()` in `mara/mara/outbound/sender.py` calls EgoSMS. It sends only system templates (`invite`, `verify_code`, `reminder`) or a `fix_request` with `approved_by` set. A database check and a test enforce this.
- **Mara never gives legal or financial advice, interprets contracts for the client, negotiates, or sends banking or wiring details.** This is in the prompts and in a code-level filter on every outbound SMS body. Blocked messages are logged.
- **Client links:** a random token, stored hashed. A 6-digit SMS code is needed on first use. Five wrong codes lock the link for 15 minutes. A verified device keeps a 30-day session. Staff can revoke a link.
- **SMS:** consent is stored with a time. Opt-out is a toggle in the portal. Check consent, opt-out and quiet hours before every send.
- **Files:** private buckets. Staff download through 60-second signed URLs made on the server. Never through a Vercel function.
- **Keys:** the service-role key lives only in Modal. Every Modal endpoint checks an HMAC signature.
- **Jobs:** every job is idempotent. The sweep takes a Postgres advisory lock.
- **Records:** every Mara action and every agent decision goes in `audit_log`. Every model call goes in `ai_runs`.
- **Data:** fictitious seed data only. No secrets in the repo.

---

## 9. Build phases

Phase 0 and the lean trim are done in code: schema, RLS, Mara service, demo-mode UI. What is left:

**Phase A: Deploy setup**
- Supabase project (staging) with migrations and seed applied.
- Vercel project for `/web`. Modal app for `/mara` with secrets set.
- Database webhook pointing at the Modal `/events` URL.
- Env vars set from `.env.example`.

**Phase B: Live wiring**
- Turn demo mode off and run the full loop on real services: upload, check, review, fix request, re-upload.
- EgoSMS: send an invite, a code and a reminder to a test number. Check whether EgoSMS supports inbound STOP (`TODO(decision)`).
- Confirm signed uploads and downloads work end to end.

**Phase C: Evals on real fictitious PDFs**
- Make fictitious PDFs for the six `evals/` cases: good, missing signature, missing initials, blank required field, missing date, unreadable.
- Run `pnpm eval -- --live` against Claude. Tune the prompt and standards until the gates in §10 pass.

**Phase D: QA**
- Run all tests. Walk both sides in the browser at desktop and 390px.
- Check every state: empty, loading, error, mobile.
- Dry-run the demo script for the video.

---

## 10. Tests and quality gates

Run all three before marking a phase done.

| Command | Covers |
|---|---|
| `pnpm test` | Unit tests: config files parse, status transitions, reminder cadence and quiet hours, outbound filter, view models. |
| `pnpm test:int` | Integration: upload to findings to review; send rule; RLS with a client role and an agent role. |
| `pnpm eval` | AI evals on the six fixture cases. Fake model by default, real model with `--live`. |

Must-pass tests:
- **Send rule:** every send path fails unless the message is a system template or an approved `fix_request`.
- **Idempotency:** the same webhook twice processes once. Two overlapping sweeps send nothing twice.
- **Reminders:** at most one SMS per client per day, and only at the send hour in the client's timezone.
- **Filter:** no wiring or banking details and no legal-advice phrasing in any outbound body.

Eval gates (starting targets):
- Missing-signature and missing-initials recall of at least 95%. It is fine to over-flag to a human.
- Zero wiring or banking details in any outbound message.

---

## 11. Out of scope (do not re-add)

Cut on 2026-11-23. The old design is in git at `9a59433` if any of it ever comes back.

- Today dashboard and approvals queue
- Timeline and deadlines engine, risk scores
- Cross-document consistency checks
- Drafting and templates
- "Ask Mara" chat and the `/ask` endpoint
- Audit export page and Settings page
- Licensee gating and the transaction coordinator role
- Twilio, Resend or any email, Google Drive, Sentry
- Messages and chat threads, client timeline, messages and help pages
- Wire-fraud banner UI (the outbound filter stays)
- New-deal wizard (it is one form now)
- Document classification
- Spanish
- The `/kit` page
- E-signature, forms library, CRM, payments, WhatsApp, native apps
