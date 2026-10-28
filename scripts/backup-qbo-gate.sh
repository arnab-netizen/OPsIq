#!/usr/bin/env bash
# QBO BACKUP GATE (Option B): no whole-database dump may be produced while Production holds
# QuickBooks/Intuit User Data. FAIL CLOSED: anything uncertain blocks the dump.
#
#  1. PRODUCTION_QBO_ENABLED (GitHub environment variable) must be empty or exactly "false".
#     Any other value ("true", "1", "TRUE", a typo) blocks.
#  2. Independently of the flag, the database is probed: if any table named qbo_* holds a row,
#     or the probe cannot be completed, the dump is blocked. Nobody has to remember the flag.
#
# Exit 0 = dump allowed. Exit 1 = blocked. Requires DATABASE_URL and psql.
set -uo pipefail

flag="${PRODUCTION_QBO_ENABLED:-}"
if [ -n "$flag" ] && [ "$flag" != "false" ]; then
  echo "QBO_BACKUP_GATE=BLOCK reason=PRODUCTION_QBO_ENABLED is '$flag' (must be empty or 'false')"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "QBO_BACKUP_GATE=BLOCK reason=DATABASE_URL not set, cannot probe for QBO data"
  exit 1
fi

PROBE_SQL="SELECT COALESCE(SUM((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, tablename), false, true, '')))[1]::text::bigint), 0) FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'qbo\\_%';"
count="$(psql "$DATABASE_URL" -X -q -t -A -v ON_ERROR_STOP=1 -c "$PROBE_SQL" 2>/dev/null)"
rc=$?
if [ $rc -ne 0 ]; then
  echo "QBO_BACKUP_GATE=BLOCK reason=probe failed (psql exit $rc)"
  exit 1
fi
count="$(echo "$count" | tr -d '[:space:]')"
if ! [[ "$count" =~ ^[0-9]+$ ]]; then
  echo "QBO_BACKUP_GATE=BLOCK reason=probe returned a non-numeric value"
  exit 1
fi
if [ "$count" -gt 0 ]; then
  echo "QBO_BACKUP_GATE=BLOCK reason=$count rows in qbo_* tables; whole-database dumps are prohibited while QuickBooks data exists"
  exit 1
fi
echo "QBO_BACKUP_GATE=ALLOW (flag='${flag:-unset}', qbo_* rows=0)"
exit 0
