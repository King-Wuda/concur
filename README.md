# Budget

A personal monthly budgeting app for South African rand. Photograph a till slip
from your phone, Claude reads every line item off it, you confirm, and the spend
lands in the month's budget straight away.

It replaces a spreadsheet with a monthly tab per month: the same summary block
and the same six categories, but always available, always consistent between
sessions, and still exportable to Excel when you want a copy.

## What it does

- **Two ways in.** Photograph a slip and have it read for you, or type the
  expense yourself — cash, a transfer, anything with no receipt worth keeping.
  Both routes end in the same confirmation form, so a typed expense and a
  scanned one are the same kind of thing once saved, line items and all.
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

- **One door.** A single account, reached with a password and nothing else —
  no sign-up page, no email round-trip. Every table is still scoped to that
  account's id and guarded by row level security, so the database would keep
  someone else's rows separate even if a second account ever existed.

## Stack

| Piece | Choice |
|---|---|
| Framework | Next.js (App Router) on Vercel |
| Database, storage, auth | Supabase |
| Receipt reading | Claude (`claude-sonnet-5-5`) with structured outputs |
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

`0001_init.sql` creates the tables, grants the `authenticated` role access to
them, and locks every one of them down with row level security.
`0002_storage.sql` creates the private `receipts` bucket and its policies.
Nothing is readable without a session that owns the row.

The policies are the only thing keeping one person's receipts away from
another's, so they are tested rather than trusted — see
[`supabase/tests/`](supabase/tests/README.md), or run `npm run test:db`.

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in:

| Variable | Where it comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API Keys |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → Project Settings → API Keys (`sb_publishable_...`; older projects call this the anon key, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` still works) |
| `OWNER_EMAIL` | The email of the one account this app signs in as (see step 3). No `NEXT_PUBLIC_` prefix, so it never reaches the browser |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `RECEIPT_MODEL` | Optional. Overrides the model receipts are read with; see below |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` locally, your domain in production |

The Anthropic key is only ever read server-side, in `/api/extract`, and the
account behind it needs credit — a new key with a zero balance returns a 400
that the app surfaces as "out of credit". The
publishable key is meant to be sent to the browser and grants nothing on its
own — row level security decides what a request can reach. Never put the
secret/service-role key in here; it bypasses row level security entirely.

### 3. The one account

This is a personal budget with exactly one user, so there is no sign-up page:
the login screen asks for a password and nothing else. Create that one account
by hand, in Supabase → **Authentication** → **Users** → **Add user**:

- Email: the same address as `OWNER_EMAIL`
- Password: whatever you want to type each time
- **Auto Confirm User: on** — otherwise the account cannot sign in until a
  confirmation email is clicked

Then close the door behind you, in Supabase → **Authentication** →
**Sign In / Providers** → Email: turn **Allow new users to sign up** off. The
app never calls sign-up, but this stops anyone reaching the Supabase API
directly and making themselves an account.

The password is checked by Supabase against its stored hash. It is not in this
repository, not in an environment variable, and never compared in application
code — so changing it means changing it in Supabase, with no redeploy. There is
no password-reset flow by design; reset it from the same dashboard page.

### 4. Run it

```bash
npm install
npm run dev
```

### 5. Deploy

Import the repository on Vercel, add the same five environment variables, and
deploy. `vercel.json` pins the framework preset to Next.js — without it, a
project imported as "Other" builds fine and then fails with *No Output
Directory named "public" found*, because Vercel goes looking for a static site
instead of picking up the Next.js build. If you hit that, also check Project
Settings → Build & Deployment and clear any Output Directory override.

Password sign-in needs no callback URL, so there is nothing to configure under
Supabase → Authentication → URL Configuration.

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

## Where the model is used, and where it is not

Reading a receipt is the only thing in this app that calls a model. Typing an
expense, editing one, setting budgets, the dashboard, the charts and the Excel
export are all ordinary code: no model, no API key needed, no network call
waiting on one, nothing to pay.

That is not a convention to remember - `tests/ai-usage.test.ts` enforces it. It
walks `src/` and fails if anything other than the files below reaches for the
model, so wiring it into a second place has to be a deliberate edit to that
list rather than something discovered later on a bill.

| File | What it is allowed to do |
|---|---|
| `src/lib/extract.ts` | the only file that imports the SDK or reads `ANTHROPIC_API_KEY` |
| `src/app/api/extract/route.ts` | the only caller of `extractReceipt` |
| `src/components/ReceiptCapture.tsx` | the only caller of `/api/extract`, and only once a file has been picked |

Confirmed in a browser as well as in the tests: typing an expense by hand and
saving it makes exactly one request, the server action that writes the row, and
none to the model.

## Which model reads receipts

`claude-sonnet-5-5`, chosen by measurement rather than reputation. Reading a
till slip is mostly transcription, not reasoning, so the extra capability of a
larger model has little to bite on. Run `npm run compare:models` to see for
yourself — it puts the bundled fixtures through several models and checks them
against the rules from the brief:

| Model | Checks passed | Per receipt | 100 receipts |
|---|---|---|---|
| Claude Opus 5.5 | 7/7 | 7.3s | $2.48 |
| **Claude Sonnet 5.5** | **7/7** | **4.9s** | **$1.13** |
| Claude Haiku 4.5 | 6/7 | 3.4s | $0.34 |

Sonnet matches Opus on every stated rule, faster and at under half the price.
Haiku is cheaper again and would be tempting, but it stopped netting a basket
discount off the item it belonged to — which is the out-of-pocket rule this app
exists to get right, so the saving costs the wrong thing.

`RECEIPT_MODEL` overrides the default without a code change, so a newer model
can be tried against the fixtures and kept or dropped on the evidence. Not every
model accepts an effort level — Haiku 4.5 rejects the parameter outright — so it
is only sent where it is understood.

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
- **Failure messages.** A problem with the receipt returns 422 ("try a clearer
  photo"); a problem with the setup returns 503 and names it — no API key, key
  rejected, account out of credit, rate limited. The difference matters: being
  told to "try again in a moment" when the account is out of credit sends you
  looking in the wrong place entirely. Either way you can still type the
  receipt in by hand.
- **Refusals.** If the model ever declines a file, that is a 422 too. Adding
  server-side refusal fallbacks would mean moving the call to
  `client.beta.messages`, which does not currently expose the `parse()` helper
  this uses for schema validation.

## Commands

```bash
npm run dev        # development server
npm run build      # production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # unit tests for the money, month, aggregation and export logic
npm run test:db    # applies the migrations to a throwaway Postgres and checks the RLS policies
npm run try:extract    # reads the bundled sample receipts with the real model (spends a cent or two)
npm run compare:models # scores several models on the fixtures, with cost and latency
```
