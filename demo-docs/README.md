# Demo documents

Realistic, **fictitious** sample PDFs for the Mara demo. Signatures, initials and check marks are drawn
as pen strokes, so Mara treats them like real ink. Regenerate with:

```
uv run --with reportlab --project mara python scripts/make_demo_docs.py
```

## Set up the deal to match
Create the deal at `/deals/new` with:
- **Address:** 4512 Ridgeview Ln, Austin, TX 78745
- **Client name:** Jordan Avery (the pre-approval letter checks that the name matches)
- **Documents:** all 6 ticked

## Good documents (Mara finds nothing)
| File | Upload to |
|---|---|
| `01-buyer-rep-agreement.pdf` | Buyer representation agreement |
| `02-sales-contract.pdf` | Residential sales contract |
| `03-sellers-disclosure.pdf` | Seller's disclosure notice |
| `04-lead-paint-addendum.pdf` | Lead-based paint addendum |
| `05-preapproval-letter.pdf` | Pre-approval letter |
| `06-hoa-addendum.pdf` | HOA addendum |

## Flawed documents (for the fix-request loop)
| File | Upload to | Mara flags |
|---|---|---|
| `FIX-sales-contract-no-buyer-signature.pdf` | Sales contract | Buyer signature and its date missing (blockers) |
| `FIX-sales-contract-blank-price.pdf` | Sales contract | Sales price blank (blocker) |
| `FIX-sales-contract-missing-initials-page-2.pdf` | Sales contract | Initials missing on page 2 (warning) |
| `FIX-sellers-disclosure-unanswered.pdf` | Seller's disclosure | Questions 4, 9 and 15 unanswered |
| `FIX-preapproval-letter-expired.pdf` | Pre-approval letter | Letter older than 90 days |

**Wrong-document moment:** upload `02-sales-contract.pdf` to the seller's disclosure item. Mara says it isn't
the document that was asked for.

All 11 are live eval cases (`evals/cases/real_*`): `pnpm eval -- --live` must find exactly these flags and
nothing on the good ones. Last run: 17/17 twice (2026-11-24).
