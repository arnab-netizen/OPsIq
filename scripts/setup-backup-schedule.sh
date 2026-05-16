#!/bin/bash

# Setup Automated Database Backup Schedule
# Creates cron job for daily backups at specified time
# Usage: ./setup-backup-schedule.sh [backup-dir] [time-hh-mm] [retention-days]
# Example: ./setup-backup-schedule.sh /backups/opsiq 02:00 30
#
# Default: Daily backup at 2:00 AM, keep backups for 30 days

set -euo pipefail

BACKUP_DIR="${1:-/var/backups/opsiq}"
BACKUP_TIME="${2:-02:00}"
RETENTION_DAYS="${3:-30}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/backup-database.sh"
CLEANUP_SCRIPT="${SCRIPT_DIR}/cleanup-old-backups.sh"

echo "Setting up automated database backup schedule..."
echo "Backup directory: $BACKUP_DIR"
echo "Backup time: $BACKUP_TIME"
echo "Retention: $RETENTION_DAYS days"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Make scripts executable
chmod +x "$BACKUP_SCRIPT"
chmod +x "$CLEANUP_SCRIPT"

# Parse backup time
HOUR=$(echo "$BACKUP_TIME" | cut -d: -f1)
MINUTE=$(echo "$BACKUP_TIME" | cut -d: -f2)

# Create cron job
CRON_JOB="$MINUTE $HOUR * * * export DATABASE_URL=${DATABASE_URL:-} && $BACKUP_SCRIPT $BACKUP_DIR && $CLEANUP_SCRIPT $BACKUP_DIR $RETENTION_DAYS > /var/log/opsiq-backup.log 2>&1"

# Add to crontab if not already present
if (crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"); then
  echo "✓ Backup cron job already configured"
else
  (crontab -l 2>/dev/null || true; echo "$CRON_JOB") | crontab -
  echo "✓ Backup cron job added to schedule"
fi

echo "✓ Backup automation setup complete"
echo ""
echo "Configured cron job:"
echo "  $CRON_JOB"
echo ""
echo "View crontab with: crontab -l"
echo "View backup logs with: tail -f /var/log/opsiq-backup.log"
