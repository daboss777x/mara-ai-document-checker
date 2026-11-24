# UI build plan (screens from Claude Design)

Routes and view models are in `CONTRACTS.md` §5. This file covers how to build and check the screens.

Sources: `design/README.md` (route map, tokens, rules), `design/screens/**/*.dc.html` (the visual reference; sample data sits in the `<script type="text/x-dc">` block at the bottom of each file), `design/assets/` (CSS kit, skyline, grain) and `DESIGN_BRIEF.md` (copy and states for the 8 screens plus login).

**Quality bar: premium.** Match the designs closely: the sky gradient, glass panels, Sora display type (Geist body; this overrides the serif in the .dc.html files) and the skyline. Every screen ships with empty, loading (skeleton), error and mobile (390px) states. Never ship `.dc.html` or `cs-ui-light.css` as is; rebuild them as React + Tailwind v4 (tokens are CSS variables in `web/app/globals.css`).

## Demo mode (so screens work before Supabase is linked)
- `MARA_DEMO=1` (server env) → the data layer returns typed fixtures from `web/lib/demo/`. The middleware lets the staff area through as the demo user Rachel Kim (agent), and `/c/demo` is the demo client link for Enoch Omunu.
- Demo mode is refused when `NODE_ENV=production`, unless `MARA_DEMO_ALLOW_PROD=1` is also set (for a hosted demo).
- In demo mode, mutations (mark complete, send fix request, upload) change in-memory or client state only and show a "Demo" toast. In demo mode, nothing calls Mara or any provider.
- Screens never import fixtures directly. They call `web/lib/data/*` functions that return view models (`web/lib/view-models.ts`), and the functions pick Supabase or demo.

## Routes
Staff: `/login` (and `/`), `/review`, `/review/[itemId]`, `/deals`, `/deals/new`, `/deals/[id]`.
Client: `/c/[token]/verify`, `/c/[token]`, `/c/[token]/items/[itemId]`.

In demo mode, a client upload moves the item to `checking`. The next staff read "finishes" it into `review` with canned findings, so the whole loop runs on camera with no backend.

## Ownership
Same as `CONTRACTS.md` §6.

| Agent | Owns |
|---|---|
| Sam | `web/app/page.tsx`, `web/app/login/**`, `web/app/(staff)/**`, `web/components/staff/**`, `web/components/deals/**`, `web/components/review/**` |
| Harry | `web/lib/**`, `web/middleware.ts`, `web/app/c/**`, `web/components/client/**` |
| Priya | `web/components/cs/**`, `web/app/globals.css`, `web/components/ui/**` (shared, read-only for everyone else) |
| Nia | QA only |

## Screenshot checks (every builder)
- **Only ONE dev server may run at a time.** The machine is short on RAM. Davis starts it. Builders do not start their own. Ask Davis for the port, or reuse the one that is running.
- Start the app (Davis only): `cd web && MARA_DEMO=1 pnpm dev --port 3100`.
- Take screenshots with headless Chrome:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --window-size=1440,1000 --virtual-time-budget=6000 --screenshot=<scratch>/x.png http://localhost:<port>/<route>`
  Use `--window-size=390,844` for mobile.
- Compare each screen against its `.dc.html` (open the design file the same way; its templating won't render, so read the markup and data). Look at your screenshots with the Read tool, fix what differs, and screenshot again.
