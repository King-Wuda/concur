# Budget

A personal monthly budgeting app for South African rand. Photograph a till slip
from your phone, Claude reads every line item off it, you confirm, and the spend
lands in the month's budget straight away.

It replaces a spreadsheet with a monthly tab per month: the same summary block
and the same six categories, but always available, always consistent between
sessions, and still exportable to Excel when you want a copy.

## What it does

- **Scan a receipt.** Photograph a slip or pick a PDF. A vision model extracts
  the store, date, total and every individual line item, proposes a category,
  and hands you a draft to check. Nothing is saved until you confirm it.
- **Per-item categories.** Each line item carries its own category, so one
  ride-hailing screenshot can put the trips under Transport and the KFC order
  under Chill.
- **Out-of-pocket amounts.** Discounts, vouchers and gift cards are applied, so
  what gets logged is what you actually paid, not the retail price.
- **Budget vs actual.** Set a budget per category per month and watch a meter
  fill. Anything past the budget is drawn in the critical colour and labelled
  "Over" — colour never carries that meaning on its own.
- **Savings view.** Salary after tax minus everything out the door, and how far
  ahead of or behind the plan the month is running.
- **The summary block.** Salary, salary after tax, tithe (with a one-tap 10%),
  rent, Investec, and the subscription lines — gym, MMA, Claude, VPS, iCloud,
  Spotify — all carried over automatically when a new month starts.
- **Visual breakdown.** A donut of the month's spend by category, with a legend
  that lists every amount, plus per-category budget meters.
- **Excel export.** One month, or every month as a tab each, mirroring the old
  workbook, plus flat sheets of receipts and line items for filtering.

## Stack

| Piece | Choice |
|---|---|
| Framework | Next.js (App Router) on Vercel |
| Database, storage, auth | Supabase |
| Receipt reading | Claude (`claude-opus-5-5`) with structured outputs |
| Charts | Recharts |
| Export | ExcelJS |

## Setting it up

### 1. Supabase

Create a project at [supabase.com](https://supabase.com), then run the two
migrations in `supabase/migrations/` against it, in order. Either paste them
into the SQL editor in the dashboard, or use the CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

`0001_init.sql` creates the tables and locks every one of them down with row
level security. `0002_storage.sql` creates the private `receipts` bucket and its
policies. Nothing is readable without a session that owns the row.

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, your domain in production |

The Anthropic key is only ever read server-side, in `/api/extract`.

### 3. Run it

```bash
npm install
npm run dev
```

Sign in with a magic link or with an email and password — both go through
Supabase auth. If you want to be the only person who can sign up, turn off
signups in Supabase → Authentication → Providers once you have your account.

### 4. Deploy

Import the repository on Vercel, add the same four environment variables, and
deploy. Then add your Vercel URL to Supabase → Authentication → URL
Configuration, both as the Site URL and as a redirect URL
(`https://your-app.vercel.app/auth/callback`), or magic links will bounce.

## How the month adds up

One module, `src/lib/aggregate.ts`, owns every figure, so the dashboard, the
meters and the export can never disagree.

- A **category's actual** is its line items, plus any fixed expenses filed under
  it, plus the residual of any receipt whose line items do not add up to the
  printed total. That residual matters: till slips carry VAT lines, rounding and
  the occasional unreadable row, and without it category totals would silently
  drift away from receipt totals. With it, they reconcile to the cent.
- **Total spend** is tithe + rent + Investec + every category actual + any fixed
  expense you excluded from budgets.
- **Left / saved** is salary after tax minus total spend.
- **Ahead of plan** is the category budgets minus the category actuals — the
  same number as `left` minus `left if the plan had held`.

A category is over budget when its actual exceeds its budget, including when the
budget is zero. Spending in a category you budgeted nothing for is over by the
full amount, which is the honest reading and surfaces forgotten budgets.

## Notes

- **Currency.** Everything is rand, so there is no currency column anywhere.
  Amounts are formatted by hand rather than through `Intl.NumberFormat`: Node
  and browsers ship different ICU data for `en-ZA`, and since the same component
  renders on the server and hydrates in the browser, that disagreement shows up
  as a hydration mismatch. The same applies to month names.
- **Photos** are downscaled to 2000px in the browser before they are uploaded,
  and they go straight from the browser to private storage. Only the storage
  path is sent to the server, which keeps large phone photos well clear of the
  serverless request size limit.
- **HEIC** is not supported — Claude cannot read it. Taking a photo in the app
  gives you a JPEG; picking an existing HEIC from an iPhone library works in
  Safari, which decodes it during the downscale, but not elsewhere.
- **Refusals.** If the model ever declines a file, `/api/extract` returns a 422
  and you can still type the receipt in by hand. Adding server-side refusal
  fallbacks would mean moving the call to `client.beta.messages`, which does not
  currently expose the `parse()` helper this uses for schema validation.

## Commands

```bash
npm run dev        # development server
npm run build      # production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # unit tests for the money, month, aggregation and export logic
```
