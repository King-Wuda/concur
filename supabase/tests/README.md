# Database checks

Row level security is the only thing keeping one person's receipts away from
another's on a hosted deployment, so the policies are worth testing rather than
trusting. `run.sh` spins up a throwaway Postgres, applies the migrations to it
twice (they must be idempotent), and runs `rls_isolation.sql` against the
result.

```bash
./supabase/tests/run.sh
```

It needs the PostgreSQL **server** binaries — `initdb` and `pg_ctl`, from the
`postgresql` package rather than `postgresql-client`. Nothing it does touches a
real Supabase project.

| File | What it is |
|---|---|
| `00_supabase_stub.sql` | Minimal stand-ins for the pieces of a Supabase instance the migrations reference: `auth.users`, `auth.uid()`, `storage.objects`, `storage.foldername()` and the `authenticated` role. `auth.uid()` reads a session variable, so a test can say who is asking. |
| `rls_isolation.sql` | Gives one user a month of data, then checks a second signed-in user can neither read, update, delete, nor plant rows under the first user's id — and that the first user's own reads and writes still work. |
