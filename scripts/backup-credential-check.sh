#!/usr/bin/env bash
#
# Read-only validation of the database credential a backup will use -- run BEFORE the first backup and
# before every credential rotation. It answers, without exposing any data: can this identity dump the
# WHOLE database, and is it limited to reading? (F-LEAST-PRIVILEGE-BACKUP / F-BACKUP-CREDENTIAL-CHECK)
#
# Reads the connection string from DATABASE_URL (never a command-line argument). Everything runs in a
# READ ONLY transaction that is rolled back; the final pg_dump is --schema-only to /dev/null. Output is
# KEY=VALUE counts and booleans only: no row, no table name, no host, no password, no username.
#
# Exit 0 only when BACKUP_CREDENTIAL=OK. With REQUIRE_LEAST_PRIVILEGE=1 (the default) it also FAILS if
# the identity can write, create, or administer anything, or cannot read everything (a partial backup).
#
# Output classes for a failed dump (the Oct-28 backup failure's cause was never recorded because pg_dump
# stderr was only in an expired artifact; this classifies it without printing the raw text):
#   AUTH_FAILED | PRIVILEGE_DENIED | CONNECT_FAILED | OTHER
set -euo pipefail

REQUIRE_LEAST_PRIVILEGE="${REQUIRE_LEAST_PRIVILEGE:-1}"

fail() { echo "BACKUP_CREDENTIAL=FAIL reason=$1"; exit 1; }

[ -n "${DATABASE_URL:-}" ] || { echo "ERROR: DATABASE_URL not set" >&2; exit 2; }
if echo "$DATABASE_URL" | grep -qE 'REPLACE_|PLACEHOLDER|your_neon_url|example\.com'; then
  fail placeholder_url
fi
if echo "$DATABASE_URL" | grep -q -- '-pooler'; then
  fail pooled_endpoint
fi
command -v psql >/dev/null 2>&1 || { echo "ERROR: psql not found on PATH" >&2; exit 2; }
command -v pg_dump >/dev/null 2>&1 || { echo "ERROR: pg_dump not found on PATH" >&2; exit 2; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/opsiq-credcheck.XXXXXX")"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

if ! psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 > "$TMP/facts.txt" 2> "$TMP/psql.err" <<'SQL'
BEGIN READ ONLY;
SELECT 'login_is_session_user=' || (current_user = session_user);
SELECT 'is_superuser=' || r.rolsuper FROM pg_roles r WHERE r.rolname = current_user;
SELECT 'can_create_role=' || r.rolcreaterole FROM pg_roles r WHERE r.rolname = current_user;
SELECT 'can_create_db=' || r.rolcreatedb FROM pg_roles r WHERE r.rolname = current_user;
SELECT 'can_replicate=' || r.rolreplication FROM pg_roles r WHERE r.rolname = current_user;
SELECT 'bypasses_rls=' || r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user;
WITH rel AS (
  SELECT c.oid, c.relkind, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
)
SELECT 'tables_total=' || count(*) FROM rel WHERE relkind IN ('r', 'p');
WITH rel AS (
  SELECT c.oid, c.relkind, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
)
SELECT 'tables_unreadable=' || count(*) FILTER (WHERE NOT has_table_privilege(oid, 'SELECT')) FROM rel WHERE relkind IN ('r', 'p', 'v', 'm');
WITH rel AS (
  SELECT c.oid, c.relkind, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
)
SELECT 'sequences_unreadable=' || count(*) FILTER (WHERE NOT has_sequence_privilege(oid, 'SELECT')) FROM rel WHERE relkind = 'S';
WITH rel AS (
  SELECT c.oid, c.relkind, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
)
SELECT 'tables_with_write_privilege=' || count(*) FILTER (WHERE has_table_privilege(oid, 'INSERT') OR has_table_privilege(oid, 'UPDATE') OR has_table_privilege(oid, 'DELETE') OR has_table_privilege(oid, 'TRUNCATE')) FROM rel WHERE relkind IN ('r', 'p');
WITH rel AS (
  SELECT c.oid, c.relkind, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%'
)
SELECT 'rls_enabled_tables=' || count(*) FILTER (WHERE relrowsecurity) FROM rel WHERE relkind IN ('r', 'p');
SELECT 'schemas_with_create=' || count(*) FILTER (WHERE has_schema_privilege(n.oid, 'CREATE'))
  FROM pg_namespace n WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast') AND n.nspname NOT LIKE 'pg_temp%' AND n.nspname NOT LIKE 'pg_toast_temp%';
SELECT 'database_create=' || has_database_privilege(current_database(), 'CREATE');
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
for k in login_is_session_user is_superuser tables_total tables_unreadable sequences_unreadable tables_with_write_privilege rls_enabled_tables schemas_with_create can_create_role can_create_db can_replicate bypasses_rls database_create; do
  echo "CREDENTIAL_CHECK $k=$(val "$k" | grep . || echo unknown)"
done

# The identity must be able to read EVERYTHING, or the backup is silently incomplete.
[ "$(valdef tables_total 0)" -gt 0 ] 2>/dev/null || fail no_tables_visible
[ "$(valdef tables_unreadable 1)" = "0" ] || fail tables_unreadable
[ "$(valdef sequences_unreadable 1)" = "0" ] || fail sequences_unreadable
if [ "$(valdef rls_enabled_tables 0)" != "0" ] && [ "$(valdef bypasses_rls false)" != "true" ] && [ "$(valdef is_superuser false)" != "true" ]; then
  fail rls_would_hide_rows
fi

# Dump-ability without reading a single row: schema only, to /dev/null.
if ! pg_dump "$DATABASE_URL" --schema-only --no-owner --no-acl -f /dev/null 2> "$TMP/dump.err"; then
  if grep -qiE 'password authentication failed|authentication failed' "$TMP/dump.err"; then fail dump_AUTH_FAILED; fi
  if grep -qiE 'permission denied' "$TMP/dump.err"; then fail dump_PRIVILEGE_DENIED; fi
  if grep -qiE 'could not connect|timeout|SSL|server closed' "$TMP/dump.err"; then fail dump_CONNECT_FAILED; fi
  fail dump_OTHER
fi
echo "CREDENTIAL_CHECK schema_dump=OK"

if [ "$REQUIRE_LEAST_PRIVILEGE" = "1" ]; then
  [ "$(valdef is_superuser true)" = "false" ] || fail over_privileged_superuser
  for k in can_create_role can_create_db can_replicate; do
    [ "$(valdef $k true)" = "false" ] || fail "over_privileged_$k"
  done
  [ "$(valdef tables_with_write_privilege 1)" = "0" ] || fail over_privileged_write_access
  [ "$(valdef schemas_with_create 1)" = "0" ] || fail over_privileged_schema_create
  [ "$(valdef database_create true)" = "false" ] || fail over_privileged_database_create
  echo "CREDENTIAL_CHECK least_privilege=OK"
fi

echo "BACKUP_CREDENTIAL=OK"
