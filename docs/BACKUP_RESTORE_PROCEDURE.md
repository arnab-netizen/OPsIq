# Database Backup and Restore Procedure

This document describes the backup and restore procedures for OpsIQ PostgreSQL database.

## Overview

OpsIQ uses PostgreSQL with automated daily backups to ensure data integrity and enable disaster recovery. The backup system includes:

- **Automated daily backups** via cron job (default: 2:00 AM)
- **Compression** using gzip for space efficiency
- **Checksum verification** (SHA-256) for backup integrity
- **Retention policy** with automatic cleanup of old backups (default: 30 days)
- **Point-in-time recovery** support via binary backup format

## Prerequisites

- PostgreSQL client tools (`pg_dump`, `psql`)
- Bash shell
- Database credentials via `DATABASE_URL` environment variable
- Write access to backup directory

## Database URL Format

```
postgresql://[user[:password]@][host][:port][/dbname]
```

Example:
```bash
export DATABASE_URL="postgresql://postgres:password@localhost:5432/opsiq"
```

## Manual Backup

### Quick Backup

```bash
./scripts/backup-database.sh /backups/opsiq
```

This creates a timestamped gzipped SQL dump:
- File: `opsiq_backup_YYYY-MM-DD_HH-MM-SS.sql.gz`
- Checksum: `opsiq_backup_YYYY-MM-DD_HH-MM-SS.sql.gz.sha256`
- Log: `backup_YYYY-MM-DD_HH-MM-SS.log`

### Backup with Custom Compression

```bash
# Compression levels: 1 (fast) to 9 (maximum)
./scripts/backup-database.sh /backups/opsiq 6
```

### Backup Output

```
Starting database backup...
Database: opsiq on localhost:5432
Destination: /backups/opsiq/opsiq_backup_2026-05-12_10-30-00.sql.gz
Compression: level 9
✓ Backup completed successfully
Duration: 45s
File size: 1.2G
Path: /backups/opsiq/opsiq_backup_2026-05-12_10-30-00.sql.gz
SHA256: a1b2c3d4e5f6...
```

## Manual Restore

### Quick Restore

```bash
./scripts/restore-database.sh /backups/opsiq/opsiq_backup_2026-05-12_10-30-00.sql.gz
```

### Restore with Checksum Verification

```bash
./scripts/restore-database.sh /backups/opsiq/opsiq_backup_2026-05-12_10-30-00.sql.gz verify
```

The restore script automatically verifies the checksum if a `.sha256` file exists:

```
Starting database restore...
Backup file: /backups/opsiq/opsiq_backup_2026-05-12_10-30-00.sql.gz
Target database: opsiq on localhost:5432
Verifying backup integrity...
✓ Checksum verified: a1b2c3d4e5f6...
Restoring database (this may take several minutes)...
✓ Restore completed successfully
Duration: 120s
Tables in restored database: 45
✓ Database restore verified: database contains 45 tables
```

### Important Notes on Restore

⚠️ **WARNING:** The restore process will:
1. DROP existing database (if `--create` was used in backup)
2. Recreate all schemas and tables
3. Restore all data

**Backup before restore** if you need to preserve the current database state.

## Automated Backups

### Setup Automated Schedule

```bash
./scripts/setup-backup-schedule.sh /backups/opsiq 02:00 30
```

Parameters:
- Backup directory: `/backups/opsiq`
- Time: `02:00` (2:00 AM daily)
- Retention: `30` days

### Automated Backup Process

The cron job executes daily at the scheduled time:

1. **Backup execution** (`backup-database.sh`)
   - Creates timestamped gzipped SQL dump
   - Generates SHA-256 checksum
   - Logs progress and results

2. **Cleanup execution** (`cleanup-old-backups.sh`)
   - Identifies backups older than retention period
   - Deletes old backup files and checksums
   - Logs freed space

3. **Log file** at `/var/log/opsiq-backup.log`

### View Automated Backups

```bash
# View scheduled cron jobs
crontab -l

# View most recent backups
ls -lht /backups/opsiq/opsiq_backup_*.sql.gz | head -10

# View backup logs
tail -f /var/log/opsiq-backup.log
```

### Cron Job Configuration

The automated backup cron job is configured as:

```cron
0 2 * * * /scripts/backup-database.sh /backups/opsiq && /scripts/cleanup-old-backups.sh /backups/opsiq 30
```

This runs daily at 2:00 AM, performs a full backup, and removes backups older than 30 days.

## Cleanup Management

### Manual Cleanup

```bash
./scripts/cleanup-old-backups.sh /backups/opsiq 30
```

This removes all backup files older than 30 days and their associated checksums.

### Backup Retention Tiers

Adjust retention based on business needs:

| Retention | Use Case |
|-----------|----------|
| 7 days | Development environments, frequent backups |
| 30 days | Staging/production with recent daily backups |
| 90 days | Production with infrequent restore needs |
| 180 days | Compliance/audit trail requirements |

Example:
```bash
# Keep backups for 90 days
./scripts/cleanup-old-backups.sh /backups/opsiq 90
```

## Disaster Recovery Procedure

### Scenario: Database Corruption/Failure

**Step 1: Stop application servers**
```bash
# Stop all services that access the database
systemctl stop opsiq-backend opsiq-api
```

**Step 2: Restore from backup**
```bash
# Use most recent backup (verify checksum)
./scripts/restore-database.sh /backups/opsiq/opsiq_backup_2026-05-12_10-30-00.sql.gz verify
```

**Step 3: Verify restoration**
```bash
# Check table count
psql -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"

# Verify sample data
psql -c "SELECT COUNT(*) FROM workspaces;"
```

**Step 4: Restart application servers**
```bash
systemctl start opsiq-backend opsiq-api
```

**Step 5: Monitor for issues**
```bash
# Check application logs
tail -f /var/log/opsiq/api.log
```

### Scenario: Point-in-Time Recovery

If you need data from a specific date:

1. Find the backup closest to desired timestamp
2. Restore that backup
3. (Optional) Manually replay application transactions after restore timestamp
4. Verify data integrity

## Performance Considerations

### Backup Performance

- **Full backup time**: ~1-5 minutes (depends on database size)
- **Compression ratio**: Typically 85-90% (1GB uncompressed → 100-150MB compressed)
- **Disk space**: Keep ~2-3x database size free for concurrent backups

### Restore Performance

- **Full restore time**: ~2-10 minutes (depends on database size)
- **Concurrent activity**: Pause write operations during restore to prevent conflicts

### Optimization

For large databases, adjust backup schedule:
- **Off-peak times**: Schedule backups during low-traffic windows
- **Compression level**: Use level 6 for balance between speed and compression
- **Separate backup disk**: Store backups on separate storage to avoid I/O contention

## Backup Verification

### Weekly Verification

Test restore procedure weekly to ensure backups are valid:

```bash
# 1. Create test database
psql -c "CREATE DATABASE opsiq_test;"

# 2. Restore backup to test database
PGDATABASE=opsiq_test ./scripts/restore-database.sh /backups/opsiq/opsiq_backup_2026-05-12_10-30-00.sql.gz verify

# 3. Verify data integrity
psql -d opsiq_test -c "SELECT COUNT(*) FROM workspaces;"

# 4. Drop test database
psql -c "DROP DATABASE opsiq_test;"
```

### Backup Integrity Checks

```bash
# List all backups with checksums
ls -1 /backups/opsiq/opsiq_backup_*.sql.gz | while read f; do
  echo "$f:"
  cat "$f.sha256" 2>/dev/null || echo "  (no checksum)"
done

# Verify all checksums
cd /backups/opsiq && sha256sum -c *.sha256 2>/dev/null
```

## Monitoring and Alerting

### Check Backup Status

```bash
# Most recent backup
stat /backups/opsiq/opsiq_backup_*.sql.gz | tail -5

# Backup disk space usage
du -sh /backups/opsiq/
df -h /backups/opsiq/

# Failed backups (exit code != 0)
grep -i "failed\|error" /var/log/opsiq-backup.log
```

### Set Up Alerts

Configure monitoring to alert if:
- Backup job fails (exit code != 0)
- Backup disk space exceeds threshold (e.g., 80% full)
- Backup takes longer than expected (> 2x normal duration)
- Checksum verification fails

Example monitoring command:
```bash
# Alert if backup older than 48 hours
find /backups/opsiq -name "opsiq_backup_*.sql.gz" -mtime +2 -exec \
  echo "WARNING: Latest backup is older than 48 hours" \;
```

## Environment Variables

Ensure `DATABASE_URL` is set in the environment where backup scripts run:

```bash
# In crontab
PGPASSWORD=your_password
DATABASE_URL=postgresql://postgres:password@localhost:5432/opsiq

# Or in shell
export DATABASE_URL="postgresql://postgres:password@localhost:5432/opsiq"
```

## Troubleshooting

### Issue: "DATABASE_URL not set"

```bash
# Solution: Export DATABASE_URL before running scripts
export DATABASE_URL="postgresql://postgres:password@localhost:5432/opsiq"
./scripts/backup-database.sh /backups/opsiq
```

### Issue: "Connection refused"

```bash
# Check database is running
psql -c "SELECT version();"

# If not, start PostgreSQL service
systemctl start postgresql
```

### Issue: "Permission denied"

```bash
# Make scripts executable
chmod +x ./scripts/backup-database.sh
chmod +x ./scripts/restore-database.sh
chmod +x ./scripts/cleanup-old-backups.sh

# Ensure backup directory is writable
chmod 755 /backups/opsiq
```

### Issue: "Disk space full"

```bash
# Check available space
df -h /backups/opsiq/

# Clean up old backups more aggressively
./scripts/cleanup-old-backups.sh /backups/opsiq 7  # Keep only 7 days
```

## References

- PostgreSQL Documentation: https://www.postgresql.org/docs/current/backup.html
- pg_dump Manual: https://www.postgresql.org/docs/current/app-pgdump.html
- psql Manual: https://www.postgresql.org/docs/current/app-psql.html

## Support

For backup/restore issues:
1. Check logs: `tail -f /var/log/opsiq-backup.log`
2. Verify DATABASE_URL is correct
3. Ensure PostgreSQL is running and accessible
4. Run restore procedure on test database first
5. Contact DevOps team for assistance
