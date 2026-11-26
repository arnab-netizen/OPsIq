#!/usr/bin/env bash
#
# Read-only validation of the database credential the Google Search Console ingestion job will use
# -- run BEFORE the first scheduled ingestion and before every credential rotation. It answers,
# without exposing any data: can this identity read/write `search_console_metrics` (and ONLY that
# table), and is it otherwise locked out of the rest of Production? (F-LEAST-PRIVILEGE-GSC-INGESTION,
# sibling to F-LEAST-PRIVILEGE-BACKUP / F-BACKUP-CREDENTIAL-CHECK -- see
# scripts/backup-credential-check.sh and scripts/gsc/opsiq-gsc-ingestion-role.sql)
#
# Reads the connection string from DATABASE_URL (never a command-line argument). Everything runs in
# a READ ONLY transaction that is rolled back: this script never writes a row, even though the role
# it is checking is itself allowed to write to one table. Output is KEY=VALUE counts and booleans
# only: no row, no table name beyond the three named checks below, no host, no password, no
# username.
#
# Exit 0 only when GSC_INGESTION_CREDENTIAL=OK. With REQUIRE_LEAST_PRIVILEGE=1 (the default) it also
# FAILS if the identity can administer anything, can read or write any table other than
# `search_console_metrics`, or cannot read/write `search_console_metrics` itself (a broken
# ingestion credential).
#
# Output classes for a failed check:
#   AUTH_FAILED | PRIVILEGE_DENIED | CONNECT_FAILED | OTHER
set -euo pipefail

REQUIRE_LEAST_PRIVILEGE="${REQUIRE_LEAST_PRIVILEGE:-1}"
TARGET_TABLE="search_console_metrics"

fail() { echo "GSC_INGESTION_CREDENTIAL=FAIL reason=$1"; exit 1; }

[ -n "${DATABASE_URL:-}" ] || { echo "ERROR: DATABASE_URL not set" >&2; exit 2; }
if echo "$DATABASE_URL" | grep -qE 'REPLACE_|PLACEHOLDER|your_neon_url|example\.com'; then
  fail placeholder_url
fi
if echo "$DATABASE_URL" | grep -q -- '-pooler'; then
  fail pooled_endpoint
fi
command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found on PATH" >&2; exit 2; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/opsiq-gsc-credcheck.XXXXXX")"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

# Named tables this credential must NEVER be able to touch (users, qbo_connections,
# client_accounts -- hardcoded into the SQL below), picked to span three categories: a user/auth
# table, a financial/QBO table, and an unrelated business table. The generic "other_*" aggregate
# facts further down cover every remaining table in the schema.

if ! psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 > "$TMP/facts.txt" 2> "$TMP/psql.err" <<SQL
BEGIN READ ONLY;
SELECT 'login_is_session_user=' || (current_user = session_user);
SELECT 'is_superuser=' || r.rolsuper FROM pg_roles r WHERE r.rolname = current_user;
SELECT 'can_create_role=' || r.rolcreaterole FROM pg_roles r WHERE r.rolname = current_user;
SELECT 'can_create_db=' || r.rolcreatedb FROM pg_roles r WHERE r.rolname = current_user;
SELECT 'can_replicate=' || r.rolreplication FROM pg_roles r WHERE r.rolname = current_user;
SELECT 'bypasses_rls=' || r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user;
SELECT 'database_create=' || has_database_privilege(current_database(), 'CREATE');
SELECT 'schemas_with_create=' || count(*) FILTER (WHERE has_schema_privilege(n.oid, 'CREATE'))
  FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast_temp%';

-- The target table: must be readable and writable (SELECT + INSERT + UPDATE), and must NOT be
-- deletable/truncatable (the role was granted exactly SELECT, INSERT, UPDATE -- see the role SQL).
SELECT 'target_select=' || has_table_privilege('public.${TARGET_TABLE}', 'SELECT');
SELECT 'target_insert=' || has_table_privilege('public.${TARGET_TABLE}', 'INSERT');
SELECT 'target_update=' || has_table_privilege('public.${TARGET_TABLE}', 'UPDATE');
SELECT 'target_delete=' || has_table_privilege('public.${TARGET_TABLE}', 'DELETE');
SELECT 'target_truncate=' || has_table_privilege('public.${TARGET_TABLE}', 'TRUNCATE');

-- Named checks (users / QBO / an unrelated business table): must all be unreadable AND unwritable.
SELECT 'named_users_select=' || has_table_privilege('public.users', 'SELECT');
SELECT 'named_users_write=' || (has_table_privilege('public.users', 'INSERT') OR has_table_privilege('public.users', 'UPDATE') OR has_table_privilege('public.users', 'DELETE'));
SELECT 'named_qbo_connections_select=' || has_table_privilege('public.qbo_connections', 'SELECT');
SELECT 'named_qbo_connections_write=' || (has_table_privilege('public.qbo_connections', 'INSERT') OR has_table_privilege('public.qbo_connections', 'UPDATE') OR has_table_privilege('public.qbo_connections', 'DELETE'));
SELECT 'named_client_accounts_select=' || has_table_privilege('public.client_accounts', 'SELECT');
SELECT 'named_client_accounts_write=' || (has_table_privilege('public.client_accounts', 'INSERT') OR has_table_privilege('public.client_accounts', 'UPDATE') OR has_table_privilege('public.client_accounts', 'DELETE'));

-- Blanket sweep: every OTHER table/view/matview in the schema must be fully inaccessible (no
-- SELECT/INSERT/UPDATE/DELETE/TRUNCATE). This is what catches a forgotten/over-broad grant that the
-- three named checks above would miss.
WITH rel AS (
  SELECT c.oid, c.relname, c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
    AND c.relkind IN ('r', 'p', 'v', 'm')
    AND c.relname <> '${TARGET_TABLE}'
)
SELECT 'other_tables_total=' || count(*) FROM rel;
WITH rel AS (
  SELECT c.oid, c.relname, c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
    AND c.relkind IN ('r', 'p', 'v', 'm')
    AND c.relname <> '${TARGET_TABLE}'
)
SELECT 'other_tables_readable=' || count(*) FILTER (WHERE has_table_privilege(oid, 'SELECT')) FROM rel;
WITH rel AS (
  SELECT c.oid, c.relname, c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
    AND c.relkind IN ('r', 'p', 'v', 'm')
    AND c.relname <> '${TARGET_TABLE}'
)
SELECT 'other_tables_writable=' || count(*) FILTER (WHERE has_table_privilege(oid, 'INSERT') OR has_table_privilege(oid, 'UPDATE') OR has_table_privilege(oid, 'DELETE') OR has_table_privilege(oid, 'TRUNCATE')) FROM rel;

-- Every sequence in the schema must be inaccessible. search_console_metrics has no sequence of its
-- own today (its id column defaults to gen_random_uuid(), not a SERIAL/IDENTITY) -- see
-- scripts/gsc/opsiq-gsc-ingestion-role.sql. If that ever changes without a matching GRANT, this
-- surfaces it as a non-zero sequences_readable/sequences_writable rather than failing silently.
WITH seq AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind = 'S'
)
SELECT 'sequences_total=' || count(*) FROM seq;
WITH seq AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind = 'S'
)
SELECT 'sequences_readable=' || count(*) FILTER (WHERE has_sequence_privilege(oid, 'SELECT')) FROM seq;
WITH seq AS (
  SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind = 'S'
)
SELECT 'sequences_writable=' || count(*) FILTER (WHERE has_sequence_privilege(oid, 'UPDATE')) FROM seq;
ROLLBACK;
SQL
then
  if grep -qiE 'password authentication failed|authentication failed|no pg_hba' "$TMP/psql.err"; then fail connection_AUTH_FAILED; fi
  if grep -qiE 'permission denied' "$TMP/psql.err"; then fail connection_PRIVILEGE_DENIED; fi
  fail connection_CONNECT_FAILED
fi

# bash 3.2 compatible (macOS): no associative arrays.
val() { sed -n "s/^$1=//p" "$TMP/facts.txt" | head -n 1; }
valdef() { local v; v="$(val "$1")"; [ -n "$v" ] && echo "$v" || echo "$2"; }
for k in login_is_session_user is_superuser can_create_role can_create_db can_replicate bypasses_rls \
  database_create schemas_with_create \
  target_select target_insert target_update target_delete target_truncate \
  named_users_select named_users_write named_qbo_connections_select named_qbo_connections_write \
  named_client_accounts_select named_client_accounts_write \
  other_tables_total other_tables_readable other_tables_writable \
  sequences_total sequences_readable sequences_writable; do
  echo "CREDENTIAL_CHECK $k=$(val "$k" | grep . || echo unknown)"
done

# The identity must be able to read AND write the target table, or ingestion is broken.
[ "$(valdef target_select false)" = "true" ] || fail target_table_unreadable
[ "$(valdef target_insert false)" = "true" ] || fail target_table_not_insertable
[ "$(valdef target_update false)" = "true" ] || fail target_table_not_updatable

if [ "$REQUIRE_LEAST_PRIVILEGE" = "1" ]; then
  [ "$(valdef is_superuser true)" = "false" ] || fail over_privileged_superuser
  for k in can_create_role can_create_db can_replicate bypasses_rls; do
    [ "$(valdef $k true)" = "false" ] || fail "over_privileged_$k"
  done
  [ "$(valdef database_create true)" = "false" ] || fail over_privileged_database_create
  [ "$(valdef schemas_with_create 1)" = "0" ] || fail over_privileged_schema_create

  # The ingestion credential must never be able to delete/truncate even its own table.
  [ "$(valdef target_delete true)" = "false" ] || fail over_privileged_target_delete
  [ "$(valdef target_truncate true)" = "false" ] || fail over_privileged_target_truncate

  # Named-table proof (user/auth, QBO/financial, unrelated business table).
  for k in named_users_select named_users_write named_qbo_connections_select named_qbo_connections_write \
    named_client_accounts_select named_client_accounts_write; do
    [ "$(valdef $k true)" = "false" ] || fail "over_privileged_$k"
  done

  # Blanket sweep: nothing else in the schema is reachable.
  [ "$(valdef other_tables_readable 1)" = "0" ] || fail over_privileged_other_tables_readable
  [ "$(valdef other_tables_writable 1)" = "0" ] || fail over_privileged_other_tables_writable
  [ "$(valdef sequences_readable 1)" = "0" ] || fail over_privileged_sequences_readable
  [ "$(valdef sequences_writable 1)" = "0" ] || fail over_privileged_sequences_writable

  echo "CREDENTIAL_CHECK least_privilege=OK"
fi

echo "GSC_INGESTION_CREDENTIAL=OK"
