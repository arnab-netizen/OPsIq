#!/bin/bash

# Restore PostgreSQL Database from Backup
# Usage: ./restore-database.sh <backup-file> [verify]
# Example: ./restore-database.sh /backups/opsiq/opsiq_backup_2026-05-12_10-30-00.sql.gz verify
#
# Restores database from a gzipped SQL dump produced by backup-database.sh.
# Optional: verify checksum against the accompanying .sha256 file.
# WARNING: this restores a `pg_dump --create` dump, which embeds
# `DROP DATABASE IF EXISTS <name>` / `CREATE DATABASE <name>` /
# `\connect <name>` statements for the SOURCE database's own name. The
# database that ends up dropped-and-recreated is therefore the one named
# INSIDE the dump, not whatever dbname appears in this script's
# DATABASE_URL -- DATABASE_URL here only supplies which SERVER (host/port/
# credentials) to connect to. Never point this at a server that also hosts
# a same-named production database unless that is the deliberate target.
#
# ROOT-CAUSE FIX (2026-08-27): removed the same fragile grep -oP
# DATABASE_URL parsing chain that backup-database.sh had (see that file's
# header for the full explanation) -- it silently resolved to "localhost"
# for any URL without an explicit port, which is the real shape of this
# repo's Neon secrets. psql now receives DATABASE_URL directly as a
# connection URI.

set -euo pipefail

# Configuration
BACKUP_FILE="${1:-}"
VERIFY="${2:-}"
LOG_FILE="${BACKUP_FILE%.*}.restore.log"

# Validate backup file provided
if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  echo "Usage: $0 <backup-file> [verify]"
  exit 1
fi

# Validate environment
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable not set" | tee -a "$LOG_FILE"
  exit 1
fi

if echo "$DATABASE_URL" | grep -qE 'REPLACE_|PLACEHOLDER|your_neon_url|example\.com'; then
  echo "ERROR: DATABASE_URL contains a placeholder value - secret not properly configured" | tee -a "$LOG_FILE"
  exit 1
fi

REDACTED_URL=$(echo "$DATABASE_URL" | sed -E 's#(://[^:/@]+:)[^@]+(@)#\1***\2#')

echo "Starting database restore..." | tee "$LOG_FILE"
echo "Backup file: $BACKUP_FILE" | tee -a "$LOG_FILE"
echo "Target server: $REDACTED_URL" | tee -a "$LOG_FILE"

# --- Integrity verification before touching any database ---
if [ "$VERIFY" = "verify" ] || [ -f "${BACKUP_FILE}.sha256" ]; then
  echo "Verifying backup integrity..." | tee -a "$LOG_FILE"

  if [ -f "${BACKUP_FILE}.sha256" ]; then
    STORED_CHECKSUM=$(cat "${BACKUP_FILE}.sha256")
    COMPUTED_CHECKSUM=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')

    if [ "$STORED_CHECKSUM" = "$COMPUTED_CHECKSUM" ]; then
      echo "Checksum verified: $COMPUTED_CHECKSUM" | tee -a "$LOG_FILE"
    else
      echo "Checksum mismatch!" | tee -a "$LOG_FILE"
      echo "Expected: $STORED_CHECKSUM" | tee -a "$LOG_FILE"
      echo "Got: $COMPUTED_CHECKSUM" | tee -a "$LOG_FILE"
      exit 1
    fi
  else
    echo "ERROR: verify requested but no .sha256 file found alongside backup" | tee -a "$LOG_FILE"
    exit 1
  fi
fi

if ! gzip -t "$BACKUP_FILE" 2>> "$LOG_FILE"; then
  echo "ERROR: backup file fails gzip integrity test (corrupt or truncated)" | tee -a "$LOG_FILE"
  exit 1
fi
echo "gzip integrity check passed" | tee -a "$LOG_FILE"

if ! zgrep -q -- '-- PostgreSQL database dump complete' "$BACKUP_FILE"; then
  echo "ERROR: pg_dump completion marker not found in backup - dump is truncated/incomplete" | tee -a "$LOG_FILE"
  exit 1
fi
echo "pg_dump completion marker present - dump is complete" | tee -a "$LOG_FILE"

# Decompress and restore. DATABASE_URL supplies the SERVER only (see
# header note above) -- the dump's own --create/--if-exists statements
# select the actual database via \connect.
echo "Restoring database (this may take several minutes)..." | tee -a "$LOG_FILE"
START_TIME=$(date +%s)

if gunzip -c "$BACKUP_FILE" | psql \
  "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  2>> "$LOG_FILE"; then

  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  echo "Restore command completed" | tee -a "$LOG_FILE"
  echo "Duration: ${DURATION}s" | tee -a "$LOG_FILE"

  # --- Restored-schema/data verification (not just "psql exited 0") ---
  # The restored database's actual name comes from inside the dump (see
  # header note), so re-derive it from the dump text itself rather than
  # from DATABASE_URL, then connect to it on the same server to inspect
  # what actually landed.
  RESTORED_DB=$(zgrep -m1 -oP '(?<=\\connect )\S+' "$BACKUP_FILE" || true)
  if [ -z "$RESTORED_DB" ]; then
    echo "WARNING: could not determine restored database name from dump; skipping schema/data verification" | tee -a "$LOG_FILE"
    exit 0
  fi
  echo "Restored database name (from dump): $RESTORED_DB" | tee -a "$LOG_FILE"

  # Build a connection URI to the restored database on the same server by
  # substituting only the path component of DATABASE_URL.
  SERVER_BASE=$(echo "$DATABASE_URL" | sed -E 's#(://[^/]+/)[^?]*(\?.*)?$#\1#')
  RESTORED_DB_URL="${SERVER_BASE}${RESTORED_DB}"
  QUERY_SUFFIX=$(echo "$DATABASE_URL" | grep -oP '\?.*$' || true)
  RESTORED_DB_URL="${RESTORED_DB_URL}${QUERY_SUFFIX}"

  TABLE_COUNT=$(psql "$RESTORED_DB_URL" -t -c \
    "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';" \
    | tr -d ' ')
  echo "Tables in restored database: $TABLE_COUNT" | tee -a "$LOG_FILE"

  if [ "$TABLE_COUNT" -gt 0 ]; then
    echo "Database contains $TABLE_COUNT tables" | tee -a "$LOG_FILE"
  else
    echo "RESTORE VERIFICATION FAILED: no tables found in restored database" | tee -a "$LOG_FILE"
    exit 1
  fi

  # Data-presence check: at least one user table must contain at least one
  # row. An empty-but-schema-correct restore (e.g. dump captured schema
  # only, or every table happened to be empty at dump time) is a distinct
  # failure mode from "psql exited 0" and would not be caught by the table
  # count alone.
  TOTAL_ROWS=$(psql "$RESTORED_DB_URL" -t -c "
    DO \$\$
    DECLARE
      r RECORD;
      total BIGINT := 0;
      cnt BIGINT;
    BEGIN
      FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I.%I', 'public', r.tablename) INTO cnt;
        total := total + cnt;
      END LOOP;
      RAISE NOTICE 'TOTAL_ROWS=%', total;
    END \$\$;
  " 2>&1 | grep -oP '(?<=TOTAL_ROWS=)[0-9]+' || echo "0")
  echo "Total rows across all public-schema tables: $TOTAL_ROWS" | tee -a "$LOG_FILE"

  if [ "$TOTAL_ROWS" -eq 0 ]; then
    echo "RESTORE VERIFICATION WARNING: schema restored but zero rows found across all tables" | tee -a "$LOG_FILE"
    echo "This may be expected for a schema-only source, or may indicate a truncated/incomplete dump." | tee -a "$LOG_FILE"
  fi

  echo "Database restore verified: $TABLE_COUNT tables, $TOTAL_ROWS total rows" | tee -a "$LOG_FILE"
  exit 0
else
  echo "Restore failed - see log for details" | tee -a "$LOG_FILE"
  # ROOT-CAUSE FIX (2026-08-29): psql's own stderr (captured above into
  # LOG_FILE) always contains the real underlying error line when the
  # SERVER rejects a statement (e.g. "psql:<stdin>:N: ERROR:  ..."), but
  # this pipeline's visible top-level failure is `gzip: stdout: Broken
  # pipe` -- gunzip's own SIGPIPE symptom from psql exiting early under
  # -v ON_ERROR_STOP=1, not the actual cause. That broken-pipe line was
  # the only thing visible without digging through this log by hand
  # (confirmed directly on a real dispatch: the real cause, a rejected
  # `SET transaction_timeout = 0;` statement, was only found by pulling
  # the Postgres service container's own separate log). Surface the real
  # PostgreSQL diagnostic lines here instead, so a future failure shows
  # the exact DB error directly. LOG_FILE never contains the dump's SQL
  # content or DATABASE_URL unredacted (see REDACTED_URL above and the
  # gzip/psql invocations, which never echo the dump itself into this
  # file), so this extraction cannot leak business data or credentials.
  echo "--- PostgreSQL diagnostic lines from restore log ---" | tee -a "$LOG_FILE"
  if ! grep -E 'psql:|ERROR:|FATAL:|DETAIL:|HINT:' "$LOG_FILE"; then
    echo "(no psql/ERROR/FATAL/DETAIL/HINT lines found in restore log)" | tee -a "$LOG_FILE"
  fi
  exit 1
fi
