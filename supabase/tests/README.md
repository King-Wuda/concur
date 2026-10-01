# Database checks

Row level security is the only thing keeping one person's receipts away from
another's on a hosted deployment, so the policies are worth testing rather than
trusting. `run.sh` spins up a throwaway Postgres and does three things to it: applies the
migrations, seeds a month of realistic data, then applies every migration again
over the top. That second pass is the one that matters - a migration running
over a database that already has data in it, which is what running one against
your real project actually is. It then checks nothing moved, and that the row
level security policies still hold.

```bash
./supabase/tests/run.sh
```

It needs the PostgreSQL **server** binaries — `initdb` and `pg_ctl`, from the
`postgresql` package rather than `postgresql-client`. Nothing it does touches a
real Supabase project.

| File | What it is |
|---|---|
| `10_seed_existing_data.sql` | A month of data - summary block, budget, receipt, line items with a per-item category, fixed expense - inserted between the two migration passes. Belongs to a user of its own so the isolation checks are unaffected. |
| `20_data_survives.sql` | Compares every one of those rows against what was written, to the cent. A migration that dropped a table, truncated one, reset a column or rewrote a row fails here rather than in production. Confirmed to bite: deleting a single line item makes it report the loss. |
| `00_supabase_stub.sql` | Minimal stand-ins for the pieces of a Supabase instance the migrations reference: `auth.users`, `auth.uid()`, `storage.objects`, `storage.foldername()` and the `authenticated` role. `auth.uid()` reads a session variable, so a test can say who is asking. |
| `rls_isolation.sql` | Gives one user a month of data, then checks a second signed-in user can neither read, update, delete, nor plant rows under the first user's id — and that the first user's own reads and writes still work. |
