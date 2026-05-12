#!/bin/bash

# Cleanup Old Backup Files
# Removes backup files older than specified retention period
# Usage: ./cleanup-old-backups.sh <backup-dir> [retention-days]
# Example: ./cleanup-old-backups.sh /backups/opsiq 30
#
# Default retention: 30 days
# Preserves: .sha256 checksums, log files

set -euo pipefail

BACKUP_DIR="${1:-.}"
RETENTION_DAYS="${2:-30}"
LOG_FILE="${BACKUP_DIR}/cleanup.log"

if [ ! -d "$BACKUP_DIR" ]; then
  echo "ERROR: Backup directory not found: $BACKUP_DIR"
  exit 1
fi

echo "Cleaning up backups older than $RETENTION_DAYS days..." | tee -a "$LOG_FILE"

# Find and delete old backup files
DELETED_COUNT=0
FREED_SPACE=0

while IFS= read -r -d '' BACKUP_FILE; do
  FILE_SIZE=$(du -b "$BACKUP_FILE" | awk '{print $1}')
  FREED_SPACE=$((FREED_SPACE + FILE_SIZE))
  rm -f "$BACKUP_FILE"
  DELETED_COUNT=$((DELETED_COUNT + 1))
  echo "Deleted: $BACKUP_FILE ($(du -h <<< "$FILE_SIZE" | awk '{print $1}'))" | tee -a "$LOG_FILE"

  # Also remove associated .sha256 checksum file
  if [ -f "${BACKUP_FILE}.sha256" ]; then
    rm -f "${BACKUP_FILE}.sha256"
  fi

done < <(find "$BACKUP_DIR" -maxdepth 1 -name "opsiq_backup_*.sql.gz" -mtime +"$RETENTION_DAYS" -print0)

# Convert freed space to human-readable format
if [ "$FREED_SPACE" -gt 1073741824 ]; then
  FREED_DISPLAY=$(echo "scale=2; $FREED_SPACE / 1073741824" | bc)GB
elif [ "$FREED_SPACE" -gt 1048576 ]; then
  FREED_DISPLAY=$(echo "scale=2; $FREED_SPACE / 1048576" | bc)MB
else
  FREED_DISPLAY=$(echo "scale=2; $FREED_SPACE / 1024" | bc)KB
fi

echo "✓ Cleanup complete: deleted $DELETED_COUNT files, freed ${FREED_DISPLAY}" | tee -a "$LOG_FILE"
