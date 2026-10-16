#!/usr/bin/env bash
# Collaudo delle migrazioni su un PostgreSQL locale: crea un database usa e getta,
# applica stub di Supabase + migrazioni ed esegue supabase/tests/rls_test.sql.
# Uso: PGHOST=localhost PGPORT=5432 PGUSER=postgres bash scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="emovere_test_$$"
psql -q -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
run() { psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$1" >/dev/null; }
run supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do run "$f"; done
psql -q -v ON_ERROR_STOP=1 -o /dev/null -d "$DB" -f supabase/tests/rls_test.sql
