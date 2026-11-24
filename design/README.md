# Design handoff: Mara portal (Cedar & Stone Realty)

These are the approved screen designs from Claude Design. **They are the visual reference, not production code.** Rebuild them as Next.js (App Router) + Tailwind components, following `../docs/CONTRACTS.md` and `../CLAUDE.md`.

> **Visual direction overrides any older night-sky look.** The approved look is the **daylight sky theme** below. Screens, copy and states are in `../docs/DESIGN_BRIEF.md`.

## How to read the `.dc.html` files
- Each file is one screen. Open it in a browser to view the markup. The `<script src="./support.js">` runtime isn't included, so templating (`{{…}}`, `<sc-for>`, `<sc-if>`) won't render. Read them as annotated HTML.
- `{{hole}}` values and the sample data sit in the `<script type="text/x-dc">` block at the bottom of each file. That block also shows the intended interactions. Re-implement them as React state.
- Shared styling lives in `assets/cs-ui-light.css`. Port it to Tailwind theme tokens and component classes. Don't ship it as is.
- All data is fictitious sample data (Enoch Omunu, buyer, 1208 Barton Hills Dr, agent Rachel Kim).

## Screen to route map (what gets built)

| File | Route | Notes |
|---|---|---|
| `welcome/Welcome-SignIn.dc.html` | `/` and `/login` | Intro camera pan, Client/Agent choice, sign-in card. Honour `prefers-reduced-motion`. |
| `app/C2-Checklist-Desktop.dc.html` | `/c/[token]` (900px and up) | Two columns. Use the checklist rows and groups. Skip the multi-file drop zone and the bottom nav. |
| `app/C2-Checklist-Mobile.dc.html` | `/c/[token]` (under 900px) | Use the layout only. The app has no bottom nav. |
| `app/C4-NeedsFix-Mobile.dc.html` | `/c/[token]/items/[itemId]` | The fix note and status. Also the look for the upload panel. |
| `app/S2-Deals-Desktop.dc.html` | `/deals` | List look only. Contracts §5 sets the columns and chips. |

**Not designed. Build from `../docs/DESIGN_BRIEF.md` in the same style:** `/review`, `/review/[itemId]`, `/deals/new`, `/deals/[id]`, `/c/[token]/verify`.

## Historical reference, not built
These files are kept for style only. The features were cut (see `../docs/CONTRACTS.md` §1). Do not build them.

- `app/C3-Upload-Desktop.dc.html`: multi-file upload with match confirmation. The upload panel on the item page is single-file.
- `app/C5-Timeline-Mobile.dc.html`: client timeline.
- `app/C6-Messages-Mobile.dc.html`: client messages.
- `app/S1-Today-Desktop.dc.html`: Today dashboard.
- `app/S3-Deal-Findings.dc.html`: deal findings tab, mismatch card, Ask Mara panel. Finding cards on `/review/[itemId]` may borrow the look.
- `app/S3-Deal-Timeline.dc.html`: deal timeline and diff.
- `app/S4-Approvals-Desktop.dc.html` and `app/S4-Approvals-Mobile.dc.html`: approvals queue. The `/review` list may borrow the card look.
- `app/S5-Viewer.dc.html`: document viewer with extracted fields. The document pane on `/review/[itemId]` may borrow its look.
- `app/S6-Draft.dc.html`: drafting from templates.
- `app/S8-Settings.dc.html`: settings.

## Theme tokens (daylight sky)

| Token | Value | Use |
|---|---|---|
| sky-900 | `#0e4db3` | Top of page gradient |
| sky-700 | `#1a5cc6` | Page base / body background |
| sky-500 | `#2a6dd2` | Mid gradient |
| sky-300 | `#5d8fdc` | Lower gradient |
| horizon | `#9facdd` | Gradient end; matches the top of the skyline photo |
| ink | `#0b1f4d` | Primary text on glass; dark buttons |
| ink-2 | `#3b4f78` | Secondary text |
| ink-3 | `#52648c` | Tertiary text |
| brand | `#1951fc` | Primary actions, active states, eyebrows |
| brand-deep | `#0b2cb1` | Button gradient end |
| link | `#1745a8` | Links |
| ok | bg `#dcf6e8` / text `#0d6236` / border `#a3dfbf` | Done |
| warn | bg `#fff0d4` / text `#7c4a00` / border `#f1c77c` | Needs a fix, Watch |
| bad | bg `#ffe2e2` / text `#991b1b` / border `#f3a9a9` | Blocker, At risk |
| info | bg `#e0edff` / text `#1745a8` / border `#b3cdfa` | Being checked |
| neutral | bg `#edf1f8` / text `#3b4f78` / border `#cfd8e8` | To do |

- **Page background:** `linear-gradient(180deg, #0e4db3 0%, #1a5cc6 38%, #2a6dd2 62%, #5d8fdc 80%, #9facdd 92%)`. It also has soft radial glows: white at the top-left and peach `rgba(255,205,180,.26)` at the right, plus a grain overlay at 8% opacity using `assets/grain.svg`.
- **Skyline:** `assets/austin-skyline.jpg` (1672×610) is pinned to the bottom of every page, full width (`aspect-ratio: 1672/610`, `background-size: cover`). Its top fades out with `mask-image: linear-gradient(to bottom, transparent 0%, #000 34%)`. It never scrolls over content (z-index below). **Confirm the photo licence before production.**
- **Glass:** use `.glass` for nav and chips: white 62%→38% gradient, `backdrop-filter: blur(24px) saturate(160%)`, 1px white border at 78%, and an inner top highlight. Use `.panel` for content: white 88%→70% gradient, radius 22px. Text on glass is always `ink`.
- **Text on the sky** (headings, eyebrows) is white with `text-shadow: 0 2px 22px rgba(8,40,120,.35)`. Keep body copy on glass panels, not on the sky, for contrast.
- **Type:** display headings use *Sora* (600, tracking −0.035em, sizes 40–60px desktop, 38–42px mobile). UI text uses *Geist* (400/500/600/700, 15px base). Changed 2026-11-23 from Instrument Serif + Inter at Enoch's request (wanted a more premium geometric sans).
- **Radii:** pills 999px · panels 22px · cards 18px · inputs 14px.
- **Primary button:** pill, 44px tall (54px on auth), gradient `#2f6bff → #1951fc → #0b2cb1`, white text, soft blue glow.
- **Mara:** an orb avatar (`.mav`, a radial gradient from white to ice to blue), an "M" in Sora, and a light-blue tinted card (`.mara`). Always label Mara-written content (for example "Prepared by Mara").

## Accessibility rules to keep
- Touch targets ≥44px; status always shown as text + colour, never colour alone.
- Visible focus ring: 3px `#0b1f4d`, offset 3px.
- Real `<button>`, `<a href>`, `<label>` + `<input>` everywhere.
- The welcome animation and glows must stop under `prefers-reduced-motion`.
