#!/bin/bash

# Backup PostgreSQL Database
# Usage: ./backup-database.sh [destination-dir] [compression-level]
# Example: ./backup-database.sh /backups/opsiq 9
#
# Creates timestamped backup file: opsiq_backup_YYYY-MM-DD_HH-MM-SS.sql.gz
# Includes all schemas, data, and metadata for complete recovery.
#
# ROOT-CAUSE FIX (2026-08-27): this script previously hand-parsed
# DATABASE_URL into PGUSER/PGHOST/PGPORT/PGDATABASE with a chain of
# `grep -oP` regexes. Those regexes silently produced the WRONG host
# (falling back to "localhost") whenever the URL had no explicit port --
# which is exactly the shape this repo's own real Neon connection strings
# use (see README.md: ".../host-pooler.c-5.us-east-1.aws.neon.tech/opsiq
# ?sslmode=require&channel_binding=require", no ":<port>" segment). They
# also corrupted PGDATABASE (multi-line value) whenever the credentials
# portion contained more than one ':' or '/'-safe run of characters. Net
# effect: this script had never successfully run against the actual
# PRODUCTION_DATABASE_URL / STAGING_DATABASE_URL secret shape used in this
# repo. Fix: stop hand-parsing the URL at all. pg_dump (via libpq) accepts
# a full connection URI natively as its target and already correctly
# parses host/port/user/password/dbname AND query parameters such as
# sslmode/channel_binding, which the old regex chain silently dropped.
#
# SECOND BUG FIXED SAME COMMIT: the pg_dump invocation passed
# --exit-on-error, which is not a valid pg_dump option on any supported
# Postgres version (it is a psql-only flag; pg_dump has no such option).
# Combined with `set -euo pipefail`, this means the ORIGINAL script could
# never have completed a single successful pg_dump run: it aborted
# immediately with "unrecognized option" every time, independent of the
# DATABASE_URL bug above. Removed; pg_dump's own default error handling
# (any error aborts with a non-zero exit) plus this script's pipefail
# already give the intended behavior.
#
# THIRD BUG FIXED SAME COMMIT: `--if-exists` is documented by pg_dump as
# only valid together with `-c/--clean` ("pg_dump: error: option
# --if-exists requires option -c/--clean"). The original script passed
# `--if-exists` without `--clean`, so pg_dump refused to start at all.
# Added `--clean` -- this also matches what a `--create` dump is meant to
# do (DROP DATABASE IF EXISTS + CREATE DATABASE), which restore-database.sh
# already assumed.
#
# ROOT-CAUSE FIX (2026-08-29): a real restore of a genuine production
# backup (run 33238853041) failed with `ERROR: role "neondb_owner" does
# not exist`, then (after that role was manually created) `ERROR: role
# "neon_superuser" does not exist` -- both from pg_dump's own default
# behavior of emitting `ALTER ... OWNER TO <source-role>` and
# `GRANT ... TO <source-role>` / `ALTER DEFAULT PRIVILEGES ... TO
# <source-role>` statements for every one of the dump's 242 tables and
# their indexes, functions, and types. `neondb_owner`, `neon_superuser`,
# and `cloud_admin` (referenced once, in an ALTER DEFAULT PRIVILEGES
# statement) are Neon's own platform-internal roles -- confirmed via a
# full-dump role/extension/schema inventory that they are never created
# by the dump itself (a single-database pg_dump only ever references
# roles, never creates them; role creation is `pg_dumpall
# --globals-only`'s job, which this backup does not run) and via a
# repository-wide search that OpsIQ's own runtime code has zero
# dependency on any of them (no SET ROLE, SESSION AUTHORIZATION,
# current_user check, or hardcoded role name anywhere in src/** or
# prisma/**). Neon's own official migration documentation independently
# confirms this exact failure mode and its fix: "plan for -O / --no-owner
# on pg_restore so restores do not depend on matching role OIDs."
#
# Confirmed locally (real Postgres, not simulated) that these ownership/
# ACL statements are purely cosmetic metadata, never structural: a
# diagnostic restore that continued past every error still created all
# 242 tables, 725+ indexes, 8 enum types, 3 functions, 3 triggers, and
# the pgcrypto extension without any of them depending on the missing
# roles. Fix: `--no-owner --no-acl` removes these source-role-referencing
# statements from the dump entirely, so every object's owner becomes
# whichever role performs the restore -- eliminating this defect class
# permanently rather than requiring the restore side to keep bootstrapping
# stub roles for whatever provider-internal roles Neon references today
# (and risking a repeat of this exact incident if Neon references a new
# one in the future). Verified end-to-end locally: a --no-owner --no-acl
# dump of the same 242-table/2354-row database restores with zero errors
# into a completely fresh database with zero roles created beyond the
# connecting user, and all restored objects end up owned by that single
# connecting role as expected.

set -euo pipefail

# Configuration
DESTINATION_DIR="${1:-.}"
COMPRESSION_LEVEL="${2:-9}"
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_FILENAME="opsiq_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${DESTINATION_DIR}/${BACKUP_FILENAME}"
LOG_FILE="${DESTINATION_DIR}/backup_${TIMESTAMP}.log"

# Ensure destination directory exists
mkdir -p "$DESTINATION_DIR"

# Validate environment
if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL environment variable not set" | tee -a "$LOG_FILE"
  exit 1
fi

# Reject placeholder/unconfigured secrets outright (same convention used by
# scripts/reset-staging-db and migrate-staging.yml for STAGING_DATABASE_URL).
if echo "$DATABASE_URL" | grep -qE 'REPLACE_|PLACEHOLDER|your_neon_url|example\.com'; then
  echo "ERROR: DATABASE_URL contains a placeholder value - secret not properly configured" | tee -a "$LOG_FILE"
  exit 1
fi

# pg_dump against a pgbouncer/pooled connection is unreliable for large
# dumps (Neon's own guidance: use the direct, non-pooler endpoint for
# pg_dump). This mirrors the existing hard gate in
# .github/workflows/db-verification.yml for MIGRATION_DATABASE_URL.
if echo "$DATABASE_URL" | grep -q -- '-pooler'; then
  echo "ERROR: DATABASE_URL appears to be a pooled connection (hostname contains '-pooler')." | tee -a "$LOG_FILE"
  echo "Use the direct (non-pooler) endpoint for pg_dump. See README.md connection-string guidance." | tee -a "$LOG_FILE"
  exit 1
fi

# Redacted URL for logging only. This is display-only string manipulation,
# never used to derive connection parameters -- the character classes are
# structurally incapable of crossing the boundary they're anchored to
# ([^:]+ cannot contain ':', so it cannot run past the user/password
# separator; [^@]+ cannot contain '@', so it cannot run past the
# credentials/host separator), unlike the old parsing bug's greedy `.*`.
REDACTED_URL=$(echo "$DATABASE_URL" | sed -E 's#(://[^:/@]+:)[^@]+(@)#\1***\2#')

echo "Starting database backup..." | tee "$LOG_FILE"
echo "Connection: $REDACTED_URL" | tee -a "$LOG_FILE"
echo "Destination: $BACKUP_PATH" | tee -a "$LOG_FILE"
echo "Compression: level $COMPRESSION_LEVEL" | tee -a "$LOG_FILE"

# Perform backup. DATABASE_URL is passed directly to pg_dump as a
# connection URI (libpq parses it natively, including sslmode /
# channel_binding query parameters) -- no manual parsing.
START_TIME=$(date +%s)

if pg_dump \
  "$DATABASE_URL" \
  --verbose \
  --format=plain \
  --create \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --blobs \
  2>> "$LOG_FILE" | gzip -"$COMPRESSION_LEVEL" > "$BACKUP_PATH"; then

  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))
  FILE_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)

  echo "Backup command completed" | tee -a "$LOG_FILE"
  echo "Duration: ${DURATION}s" | tee -a "$LOG_FILE"
  echo "File size: $FILE_SIZE" | tee -a "$LOG_FILE"
  echo "Path: $BACKUP_PATH" | tee -a "$LOG_FILE"

  # --- Integrity verification: prove the file is valid, not corrupt/truncated ---
  # 1. gzip container integrity (catches truncation / corrupted compression).
  if ! gzip -t "$BACKUP_PATH" 2>> "$LOG_FILE"; then
    echo "BACKUP INVALID: gzip integrity test failed (corrupt or truncated file)" | tee -a "$LOG_FILE"
    exit 1
  fi
  echo "gzip integrity check passed" | tee -a "$LOG_FILE"

  # 2. pg_dump completion marker. A plain-format pg_dump always terminates
  #    with this exact trailer line; its absence means the dump was cut
  #    short (e.g. connection dropped mid-stream) even though the gzip
  #    container itself may still be well-formed.
  if ! zgrep -q -- '-- PostgreSQL database dump complete' "$BACKUP_PATH"; then
    echo "BACKUP INVALID: pg_dump completion marker not found - dump is truncated/incomplete" | tee -a "$LOG_FILE"
    exit 1
  fi
  echo "pg_dump completion marker present - dump is complete" | tee -a "$LOG_FILE"

  # Generate checksum for verification
  CHECKSUM=$(sha256sum "$BACKUP_PATH" | awk '{print $1}')
  echo "SHA256: $CHECKSUM" | tee -a "$LOG_FILE"
  echo "$CHECKSUM" > "${BACKUP_PATH}.sha256"

  echo "Backup completed and verified successfully" | tee -a "$LOG_FILE"
  exit 0
else
  echo "Backup failed - see log for details" | tee -a "$LOG_FILE"
  exit 1
fi
