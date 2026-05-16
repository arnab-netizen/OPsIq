#!/bin/bash

# Backup PostgreSQL Database
# Usage: ./backup-database.sh [destination-dir] [compression-level]
# Example: ./backup-database.sh /backups/opsiq 9
#
# Creates timestamped backup file: opsiq_backup_YYYY-MM-DD_HH-MM-SS.sql.gz
# Includes all schemas, data, and metadata for complete recovery

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

# Parse DATABASE_URL: postgresql://user:password@host:port/dbname
# Format: postgresql://[user[:password]@][netloc][:port][/dbname][?param=value]
PGPASSWORD=$(echo "$DATABASE_URL" | grep -oP '(?<=:).*(?=@)' | cut -d':' -f2 || true)
PGUSER=$(echo "$DATABASE_URL" | grep -oP '(?<=//).*(?=:)' || echo "postgres")
PGHOST=$(echo "$DATABASE_URL" | grep -oP '(?<=@).*(?=:)' || echo "localhost")
PGPORT=$(echo "$DATABASE_URL" | grep -oP '(?<=:)[0-9]+(?=/)' || echo "5432")
PGDATABASE=$(echo "$DATABASE_URL" | grep -oP '(?<=/)[^/?]+' || echo "opsiq")

# Export for pg_dump
export PGPASSWORD
export PGUSER
export PGHOST
export PGPORT

echo "Starting database backup..." | tee "$LOG_FILE"
echo "Database: $PGDATABASE on $PGHOST:$PGPORT" | tee -a "$LOG_FILE"
echo "Destination: $BACKUP_PATH" | tee -a "$LOG_FILE"
echo "Compression: level $COMPRESSION_LEVEL" | tee -a "$LOG_FILE"

# Perform backup
START_TIME=$(date +%s)

if pg_dump \
  -h "$PGHOST" \
  -p "$PGPORT" \
  -U "$PGUSER" \
  -d "$PGDATABASE" \
  --verbose \
  --format=plain \
  --create \
  --if-exists \
  --blobs \
  --exit-on-error \
  2>> "$LOG_FILE" | gzip -"$COMPRESSION_LEVEL" > "$BACKUP_PATH"; then

  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))
  FILE_SIZE=$(du -h "$BACKUP_PATH" | cut -f1)

  echo "✓ Backup completed successfully" | tee -a "$LOG_FILE"
  echo "Duration: ${DURATION}s" | tee -a "$LOG_FILE"
  echo "File size: $FILE_SIZE" | tee -a "$LOG_FILE"
  echo "Path: $BACKUP_PATH" | tee -a "$LOG_FILE"

  # Generate checksum for verification
  CHECKSUM=$(sha256sum "$BACKUP_PATH" | awk '{print $1}')
  echo "SHA256: $CHECKSUM" | tee -a "$LOG_FILE"
  echo "$CHECKSUM" > "${BACKUP_PATH}.sha256"

  exit 0
else
  echo "✗ Backup failed - see log for details" | tee -a "$LOG_FILE"
  exit 1
fi
