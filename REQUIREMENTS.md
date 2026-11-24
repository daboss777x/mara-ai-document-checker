# Requirements

Everything you need to run Mara, from demo mode on a laptop to the full hosted stack.

## Platforms and accounts

| Platform | What it's for | Plan needed | Sign up |
|---|---|---|---|
| GitHub | Code hosting and CI (`.github/workflows/ci.yml`, no secrets needed) | Free | <https://github.com/signup> |
| Supabase | Postgres (source of truth), Auth for agents, Storage for files, Vault, `pg_net` webhook | Free to try; Pro for real use (backups, no pausing) | <https://supabase.com/dashboard/sign-up> |
| Modal | Runs Mara: the HTTP endpoints, document checks and the hourly sweep | Starter (free monthly credit) | <https://modal.com/signup> |
| Anthropic | Claude API: reads and checks every document | Pay as you go | <https://console.anthropic.com> |
| Vercel | Hosts the Next.js web app | Hobby to try; Pro for commercial use | <https://vercel.com/signup> |
| EgoSMS | Invite, code, reminder and fix-request texts (optional; set `MARA_SMS_MODE=off` without it) | Prepaid SMS credit | <https://www.egosms.co> |

Demo mode (`MARA_DEMO=1`) needs none of these.

## Local tools

| Tool | Version | Why |
|---|---|---|
| Node.js | 22 or newer (CI uses 22) | Web app |
| pnpm | 12.21.0 (pinned in `package.json` `packageManager`; `corepack enable`) | Web dependencies and scripts |
| Python | 3.12 (`mara/.python-version`) | Mara service and DB tests |
| uv | 0.13 or newer | Python environments and lockfiles |
| Supabase CLI | v2 via `npx supabase@2` | `link`, `db push` |
| Modal CLI | from the `modal` package (`uv run modal`) | `setup`, `secret create`, `deploy` |
| openssl | any | `pnpm gen:hmac` |

No Docker is needed. The DB tests run on an embedded Postgres 16 from `pgserver`.

## Languages and runtimes
- TypeScript 5 (strict), React 19, Next.js 15 App Router: `web/`
- Python 3.12: `mara/`, `supabase/tests/`, `evals/`, `scripts/make_demo_docs.py`
- SQL (Postgres 15+ on Supabase, plpgsql): `supabase/migrations/`
- YAML config: `config/`

## npm packages (`web/package.json`)

| Package | Version | Purpose |
|---|---|---|
| next | 15.5.29 | App Router framework |
| react, react-dom | 19.1.0 | UI |
| @supabase/supabase-js | ^2.119.2 | Supabase client (anon key, RLS) |
| @supabase/ssr | ^0.12.7 | Cookie-based Supabase sessions in server components and middleware |
| zod | ^4.6.7 | Validation for env, forms and view models |
| radix-ui | ^1.8.1 | Accessible UI primitives |
| class-variance-authority | ^0.7.1 | Component variants |
| cn | ^0.5.2 | Class name helper |
| lucide-react | ^1.77.0 | Icons |
| next-themes | ^0.4.6 | Theme handling |
| sonner | ^2.0.8 | Toasts |
| server-only | ^0.0.1 | Stops server modules leaking into the browser bundle |
| tailwindcss, @tailwindcss/postcss | ^4 | Styling |
| tw-animate-css | ^1.4.0 | Animation utilities |
| shadcn | ^4.23.0 | Component scaffolding CLI |
| typescript | ^5 | Type checking |
| eslint, eslint-config-next, @eslint/eslintrc | ^9 / 15.5.29 / ^3 | Linting |
| vitest | ^5.1.1 | Unit tests |
| @types/node, @types/react, @types/react-dom | ^20 / ^19 / ^19 | Types |

## Python packages (`mara/pyproject.toml`, versions from `uv.lock`)

| Package | Locked | Purpose |
|---|---|---|
| modal | 1.6.4 | Deploy target: functions, ASGI app, cron |
| fastapi | 0.165.0 | `/events` and `/client/*` endpoints |
| pydantic | 2.14.4 | Models for every endpoint and tool input |
| pydantic-settings | 2.16.3 | Settings from env |
| psycopg[binary] | 3.3.9 | Postgres access (service role) |
| httpx | 0.28.1 | Supabase Storage and EgoSMS HTTP calls |
| anthropic | 2.12.0 | Claude API |
| pyyaml | 6.0.4 | Config files |
| python-docx | 1.2.0 | DOCX to text |
| pypdf | 7.1.1 | Page counts and PDF handling |
| pytest (dev) | 9.2.0 | Tests |
| ruff (dev) | 0.17.6 | Lint |
| pgserver (dev) | 0.1.4 | Embedded Postgres for tests |

`supabase/pyproject.toml` (DB tests only): pgserver, psycopg[binary], pytest.
`scripts/make_demo_docs.py` also uses `reportlab` (`uv run --with reportlab ...`).

## Environment variables

Full annotated list: `.env.example` (all of them) and `web/.env.example` (web only).

### Web app (Vercel, `web/.env.local`)
| Variable | Used by | Where to get it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | web (browser + server) | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web (browser + server); RLS applies | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SITE_URL` | web: magic-link redirects | Your Vercel URL, or `http://localhost:3000` |
| `MARA_URL` | web server → Mara `/client/*` | URL Modal prints for the `web` function |
| `MARA_HMAC_SECRET` | web server: signs requests to Mara | `pnpm gen:hmac` (same value everywhere) |
| `MARA_DEMO` | web: `1` = fixtures, no backend | Set by you |
| `MARA_DEMO_ALLOW_PROD` | web: allow demo mode in production | Set by you (hosted demo only) |
| `MARA_OPEN_LOGIN` | web: any login signs in as the demo agent | Set by you (hosted demo only) |
| `DEMO_AGENT_EMAIL`, `DEMO_AGENT_PASSWORD` | web server: the shared demo agent | The Supabase Auth user you created |

### Mara (Modal secret `mara-secrets`, `mara/.env`)
| Variable | Used by | Where to get it |
|---|---|---|
| `MARA_ENV` | Mara: `staging` or `prod` | Set by you |
| `MARA_HMAC_SECRET` | Mara: verifies every request | Same value as the web's |
| `ANTHROPIC_API_KEY` | Mara: Claude calls | Anthropic console → API keys |
| `MARA_CHECK_MODEL` | Mara: check model (default `claude-opus-5-5`) | Set by you |
| `SUPABASE_URL` | Mara: Storage API | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Mara only (bypasses RLS) | Supabase → Project Settings → API |
| `DATABASE_URL` | Mara: Postgres connection | Supabase → Project Settings → Database |
| `MARA_SMS_MODE` | Mara: `egosms` or `off` | Set by you |
| `MARA_CLIENT_VERIFY` | Mara: `0` skips the SMS code (demo) | Set by you |
| `EGOSMS_USERNAME`, `EGOSMS_PASSWORD`, `EGOSMS_SENDER_ID` | Mara sender | EgoSMS account |
| `EGOSMS_API_URL` | Mara sender (default set) | EgoSMS API docs |
| `PUBLIC_SITE_URL` | Mara: portal links in texts | Your Vercel URL |
| `MARA_CONFIG_DIR`, `MARA_PROMPTS_DIR` | Mara (optional overrides) | Defaults work |

### Supabase Vault (SQL, not env vars)
| Secret | Used by | Value |
|---|---|---|
| `mara_events_url` | `mara.notify_event()` trigger | `{MARA_URL}/events` |
| `mara_hmac_secret` | `mara.notify_event()` trigger | Same HMAC secret |

## Rough running costs

These are estimates from public pricing at the time of writing. Check each provider's current prices.

- **Claude:** the main variable cost. A short contract checked with Claude Opus cost about 3–4 US cents in
  testing. Long, image-heavy PDFs cost more. A smaller model via `MARA_CHECK_MODEL` costs less, but rerun the
  evals first.
- **Supabase:** free for trying it; the Pro plan is about $25/month per project.
- **Modal:** usage-based; the free monthly credit typically covers a demo and light use.
- **Vercel:** Hobby is free for personal use; Pro is about $20/month per member for commercial use.
- **EgoSMS:** prepaid per message; depends on destination country and volume.

A demo or small pilot can run for little more than the Claude usage. A busy brokerage should budget for paid
Supabase and Vercel plans plus per-document Claude costs.
