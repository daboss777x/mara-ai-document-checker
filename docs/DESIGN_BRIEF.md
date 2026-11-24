# Design brief: Mara screens (Cedar & Stone Realty)

Eight screens plus login. The visual style, theme tokens and route map are in `design/README.md`. The route list and view models are in `docs/CONTRACTS.md` §5. If they disagree, CONTRACTS.md wins.

## 1. Product in one paragraph
Mara helps a real estate agent collect client documents. The client uploads a file against a checklist item. Mara checks it and lists findings. The agent reviews and marks it complete or sends a fix request. The design must feel **calm, clear and in control.**

## 2. Brand and tone
- **Brokerage:** Cedar & Stone Realty, Austin, Texas. Fictitious. Text wordmark "Cedar & Stone", no symbol.
- **Mara:** a small abstract orb with an "M". Not a face, not a robot. Labelled "Mara · digital assistant".
- **Tone:** plain English, short sentences, a 3rd-grade reading level for clients. No legal jargon. Warm but professional.
- **Accessibility:** WCAG AA contrast, tap targets of at least 44px, status always shown as text plus an icon, visible focus states.
- Mara gives no legal or financial advice and shows no banking or wiring details, anywhere.

## 3. Sample data (all fictitious)
Client **Enoch Omunu**, buying **1208 Barton Hills Dr, Austin, TX 78704**. Agent **Rachel Kim**. Deal 2026-0142.

Document types: buyer representation agreement, sales contract, seller's disclosure, lead-based paint addendum, pre-approval letter, HOA addendum.

Item states:

| Status | Client sees | Agent sees |
|---|---|---|
| missing | To do | Missing |
| checking | Being checked | Mara checking |
| review | Being checked | Ready for review |
| needs_fix | Needs a fix | Fix requested |
| complete | Done | Complete |
| waived | (hidden) | Waived |

Chip colours: Done green, Needs a fix amber, Blocker red, Being checked blue, To do and Missing neutral grey.

## 4. Client screens (design mobile 390px and desktop 1440px)

### Verify: `/c/[token]/verify`
- Logo, "Hi Enoch", one line: "For your security, enter the 6-digit code we just texted to •••-•••-4417."
- Code input, "Verify" button, "Resend code" link, "Not you? Contact Rachel."
- States: wrong code (with attempts left), too many attempts (locked 15 min), expired or revoked link, sending, error.

### Checklist: `/c/[token]`
- Header: property address, agent name ("Rachel Kim · your agent") with a call button.
- Headline: "Hi Enoch, 3 things left." Progress bar, for example "3 of 6 done."
- Groups: **To do** (includes Needs a fix, with the fix note shown) / **Being checked** / **Done**.
- Each row: document name, one plain line on what it is, due date if set, status chip, and an "Upload" or "Fix and re-upload" button.
- Example items:
  - Pre-approval letter: To do.
  - Seller's disclosure: Needs a fix. "Page 2 needs your initials at the bottom."
  - Lead-based paint addendum: Being checked.
  - Buyer representation agreement: Done.
- At the bottom: an SMS reminders on/off toggle.
- Desktop: two columns. The checklist is on the left. A "Your deal" card (address, agent) is on the right.
- States: all done ("You're all set. Nothing left to do."), empty, loading, error, mobile.

### Item: `/c/[token]/items/[itemId]`
- What the document is, its status, and the fix note when the status is Needs a fix.
- Upload panel: drag and drop on desktop, "Take a photo" and "Choose file" on mobile. PDF, DOCX, JPG or PNG, up to 25 MB.
- Progress row, then: "Got it. Mara is checking it now. We'll text you if anything needs a fix."
- List of previous uploads: file name, date, status.
- States: file too large, wrong file type, upload failed (retry), uploading, loading, error.
- Never show legal explanation. Include "Questions? Contact Rachel."

## 5. Staff screens (desktop-first 1440px, mobile 390px)

Nav: **Review** (count badge) and **Deals**, plus the user menu. Nothing else.

### Review queue: `/review` (home)
- Greeting and one line: "3 documents are ready for your review."
- List of items in `review`, oldest first. Each row: document name, client, address, uploaded time, version, blocker and warning counts.
- Empty: "All caught up."
- States: loading, error, mobile (one card per row).

### Review item: `/review/[itemId]`
- **Left:** the document in a viewer (signed-URL file, jump to a page with `#page=n`).
- **Right:**
  - Mara's summary.
  - Findings: severity chip (Blocker or Warning), message, page link, quote, and a Dismiss button.
  - Fix note: editable, pre-filled from the open findings' client wording.
  - Buttons: **Mark complete** and **Send fix request**. Send asks for confirmation and names the client and phone.
  - Version list.
  - "Next item" link.
- Mara-written content has the orb and a soft tint, so staff know what came from Mara.
- States: no findings ("Mara found no problems"), "Mara couldn't read this file", already handled, send failed (retry), loading, error, mobile.

### Deals: `/deals`
- List: address, client, progress ("3/6 done"), chips "2 to review" and "1 needs fix", status.
- Search. **New deal** button.
- States: empty ("No deals yet"), loading, error, mobile.

### New deal: `/deals/new`
- One page. Fields: address, city, zip, client name, phone, email (optional), SMS consent checkbox with the consent wording, document checkboxes (defaults ticked), optional due date.
- Primary button: "Create deal and text the client." Then go to the deal page.
- States: field errors, saving, error.

### Deal: `/deals/[id]`
- Header: address, client, status chip, reminders on/off toggle, "Copy client link", "Resend invite".
- Checklist table: item, status chip, last upload, open findings, actions (Review, Waive, Reopen).
- Activity list: newest first.
- States: loading, error, mobile, deal complete (green banner).

### Login: `/login` (and `/` welcome)
- Keep the built welcome and sign-in. Client path: phone or email plus the 6-digit code. Agent path: email plus password or magic link.
- Honour `prefers-reduced-motion`.

## 6. States every screen needs
Default, **empty**, **loading** (skeletons), **error** (with retry), **mobile**.

Specific states:
- Client checklist all done.
- Deal complete (green banner).
- Client has turned SMS off (agent sees "Texts off").
- Mara unavailable: "Mara is catching up. Your uploads are safe."

## 7. Interaction and motion
- Subtle only: chip colour fades, a row moves from To do to Being checked after upload, the progress bar animates.
- Confirm only where a message leaves the system ("Send this fix request to Enoch by text?"). Everything else is one tap.
