#!/bin/bash

# Restore PostgreSQL Database from Backup
# Usage: ./restore-database.sh <backup-file> [verification]
# Example: ./restore-database.sh /backups/opsiq/opsiq_backup_2026-05-12_10-30-00.sql.gz verify
#
# Restores database from gzipped SQL dump
# Optional: verify checksum against .sha256 file if present
# WARNING: This will DROP and recreate the database

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

# Parse DATABASE_URL
PGPASSWORD=$(echo "$DATABASE_URL" | grep -oP '(?<=:).*(?=@)' | cut -d':' -f2 || true)
PGUSER=$(echo "$DATABASE_URL" | grep -oP '(?<=//).*(?=:)' || echo "postgres")
PGHOST=$(echo "$DATABASE_URL" | grep -oP '(?<=@).*(?=:)' || echo "localhost")
PGPORT=$(echo "$DATABASE_URL" | grep -oP '(?<=:)[0-9]+(?=/)' || echo "5432")
PGDATABASE=$(echo "$DATABASE_URL" | grep -oP '(?<=/)[^/?]+' || echo "opsiq")

# Export for psql
export PGPASSWORD
export PGUSER
export PGHOST
export PGPORT

echo "Starting database restore..." | tee "$LOG_FILE"
echo "Backup file: $BACKUP_FILE" | tee -a "$LOG_FILE"
echo "Target database: $PGDATABASE on $PGHOST:$PGPORT" | tee -a "$LOG_FILE"

# Verify backup integrity if requested or .sha256 file exists
if [ "$VERIFY" = "verify" ] || [ -f "${BACKUP_FILE}.sha256" ]; then
  echo "Verifying backup integrity..." | tee -a "$LOG_FILE"

  if [ -f "${BACKUP_FILE}.sha256" ]; then
    STORED_CHECKSUM=$(cat "${BACKUP_FILE}.sha256")
    COMPUTED_CHECKSUM=$(sha256sum "$BACKUP_FILE" | awk '{print $1}')

    if [ "$STORED_CHECKSUM" = "$COMPUTED_CHECKSUM" ]; then
      echo "✓ Checksum verified: $COMPUTED_CHECKSUM" | tee -a "$LOG_FILE"
    else
      echo "✗ Checksum mismatch!" | tee -a "$LOG_FILE"
      echo "Expected: $STORED_CHECKSUM" | tee -a "$LOG_FILE"
      echo "Got: $COMPUTED_CHECKSUM" | tee -a "$LOG_FILE"
      exit 1
    fi
  else
    echo "Warning: No .sha256 file found, skipping checksum verification" | tee -a "$LOG_FILE"
  fi
fi

# Decompress and restore
echo "Restoring database (this may take several minutes)..." | tee -a "$LOG_FILE"
START_TIME=$(date +%s)

if gunzip -c "$BACKUP_FILE" | psql \
  -h "$PGHOST" \
  -p "$PGPORT" \
  -U "$PGUSER" \
  -v ON_ERROR_STOP=1 \
  --exit-on-error \
  2>> "$LOG_FILE"; then

  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))

  echo "✓ Restore completed successfully" | tee -a "$LOG_FILE"
  echo "Duration: ${DURATION}s" | tee -a "$LOG_FILE"

  # Verify restore by checking database exists and has tables
  QUERY="SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';"
  TABLE_COUNT=$(psql \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "$PGUSER" \
    -d "$PGDATABASE" \
    -t -c "$QUERY" | tr -d ' ')

  echo "Tables in restored database: $TABLE_COUNT" | tee -a "$LOG_FILE"

  if [ "$TABLE_COUNT" -gt 0 ]; then
    echo "✓ Database restore verified: database contains $TABLE_COUNT tables" | tee -a "$LOG_FILE"
    exit 0
  else
    echo "✗ Restore verification failed: no tables found in database" | tee -a "$LOG_FILE"
    exit 1
  fi
else
  echo "✗ Restore failed - see log for details" | tee -a "$LOG_FILE"
  exit 1
fi
