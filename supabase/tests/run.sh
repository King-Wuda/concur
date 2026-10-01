#!/usr/bin/env bash
#
# Applies the migrations to a throwaway Postgres and runs the row level
# security checks against them. Nothing here touches a real project.
#
#   ./supabase/tests/run.sh
#
# Needs Postgres server binaries on PATH (initdb, pg_ctl); on Debian/Ubuntu
# they live in /usr/lib/postgresql/<version>/bin.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
# Only ever used for the unix socket file name; the server binds no TCP port.
port="${PGTEST_PORT:-5433}"

if ! command -v initdb > /dev/null; then
  candidate="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
  if [ -n "$candidate" ]; then
    PATH="$candidate:$PATH"
    export PATH
  else
    echo "initdb not found. Install the PostgreSQL server package." >&2
    exit 1
  fi
fi

workdir="$(mktemp -d)"

# Postgres refuses to run as root, which containers often are. When that is the
# case, do the server work as an unprivileged user; the psql client below is
# happy either way.
as_server_user() {
  if [ "$(id -u)" -eq 0 ]; then
    su "$server_user" -s /bin/bash -c "PATH=\"$PATH\" $1"
  else
    bash -c "$1"
  fi
}

server_user="$(id -un)"
if [ "$(id -u)" -eq 0 ]; then
  server_user="${PGTEST_USER:-pgtest}"
  id -u "$server_user" > /dev/null 2>&1 || useradd -m "$server_user"
  chown "$server_user" "$workdir"
fi
chmod 711 "$workdir"

cleanup() {
  as_server_user "pg_ctl -D '$workdir/data' -s stop" > /dev/null 2>&1 || true
  [ -n "${PGTEST_KEEP:-}" ] || rm -rf "$workdir"
}
trap cleanup EXIT

as_server_user "initdb -D '$workdir/data' -U postgres --auth=trust" > "$workdir/initdb.log" 2>&1
as_server_user "pg_ctl -D '$workdir/data' -l '$workdir/pg.log' -o '-p $port -k $workdir -c listen_addresses=' -w start" > /dev/null

run() { psql -h "$workdir" -p "$port" -U postgres -v ON_ERROR_STOP=1 -q -f "$1"; }

echo "Applying the Supabase stand-ins..."
run "$here/00_supabase_stub.sql"

echo "Applying migrations..."
for migration in "$repo"/supabase/migrations/*.sql; do
  run "$migration" 2> >(grep -v NOTICE >&2 || true)
  echo "  $(basename "$migration")"
done

# Put a month of real data in before re-applying, so the second pass is a
# migration running over an existing database rather than an empty one - which
# is the only version of the question that matters.
echo "Seeding a month of existing data..."
run "$here/10_seed_existing_data.sql"

echo "Re-applying migrations over it..."
for migration in "$repo"/supabase/migrations/*.sql; do
  run "$migration" 2> >(grep -v NOTICE >&2 || true)
done

echo "Checking nothing was lost..."
psql -h "$workdir" -p "$port" -U postgres -v ON_ERROR_STOP=1 \
  -f "$here/20_data_survives.sql" 2>&1 | grep -E "PASS|ERROR" || {
    echo "data preservation checks did not report PASS" >&2
    exit 1
  }

echo "Running row level security checks..."
psql -h "$workdir" -p "$port" -U postgres -v ON_ERROR_STOP=1 \
  -f "$here/rls_isolation.sql" 2>&1 | grep -E "PASS|ERROR" || {
    echo "checks did not report PASS" >&2
    exit 1
  }

echo "All database checks passed."
