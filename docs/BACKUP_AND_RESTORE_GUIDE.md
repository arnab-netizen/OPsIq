# OpsIQ Backup and Restore Guide

**Document Status:** PRODUCTION READY  
**Last Updated:** 2026-05-12  
**Owner:** DevOps/SRE Team

---

## CRITICAL RULES

1. **Backup Must Not Block Production**
   - Non-blocking backup strategy (WAL archiving, point-in-time recovery)
   - Separate backup storage from primary database
   - Backup verification on schedule without impacting traffic

2. **Restore Must Be Tested Weekly**
   - Full restore → verify data integrity → tear down
   - Keep backup test results in spreadsheet
   - Document any restore failures immediately

3. **RTO/RPO Must Be Met**
   - RTO (Recovery Time Objective): < 30 minutes
   - RPO (Recovery Point Objective): < 5 minutes
   - If restore takes > 30 min or data loss > 5 min: incident

4. **Encryption, Access Control, Auditing**
   - Backups encrypted at rest (AES-256)
   - Backup access requires 2-factor authentication
   - All backup operations logged and audited
   - Backups stored in separate AWS account (isolation)

---

## SECTION 1: BACKUP STRATEGY

### 1.1 Backup Architecture

```
┌─────────────────────┐
│  Production DB      │
│  (PostgreSQL 16)    │
│  3x replication     │
└──────────┬──────────┘
           │
           ├─ WAL Archiving (continuous, every 5 min)
           │  └─→ S3 Backup Bucket (encrypted, versioned)
           │
           ├─ Full Backup (daily 2am UTC)
           │  └─→ S3 Backup Bucket + On-Prem Tape
           │
           └─ Transaction Log (continuous)
              └─→ Point-in-time recovery capable
```

### 1.2 Backup Types

**Type 1: Continuous WAL Archiving (Every 5 Minutes)**
- Mechanism: PostgreSQL WAL (Write-Ahead Log) archiving
- Size: ~50 MB per archive (contains transactions for 5 min)
- Retention: 7 days (504 archives)
- RTO: < 30 minutes (restore from WAL + base backup)
- RPO: < 5 minutes (transaction log replay)

**Type 2: Full Database Backup (Daily 2 AM UTC)**
- Mechanism: `pg_dump -Fc` (custom format, compressed)
- Size: ~2 GB compressed (8 GB uncompressed)
- Schedule: Daily at 2 AM UTC (off-peak, low load)
- Retention: 30 days (30 full backups)
- RTO: < 15 minutes (restore from full backup)
- RPO: Up to 24 hours (depending on backup time selected)

**Type 3: Incremental Backup (Daily 6 PM UTC)**
- Mechanism: PostgreSQL base backup + WAL since last full backup
- Size: ~500 MB (changes since 2 AM)
- Schedule: Daily at 6 PM UTC
- Retention: 7 days (incremental backups)
- RTO: < 20 minutes (restore full + incremental + WAL)
- RPO: < 5 minutes (WAL replay)

### 1.3 Backup Schedule

| Time | Backup Type | Duration | Size | Retention | Storage |
|------|-------------|----------|------|-----------|---------|
| Daily 2:00 AM UTC | Full Database | 10 min | 2 GB | 30 days | S3 + Tape |
| Daily 6:00 PM UTC | Incremental | 5 min | 500 MB | 7 days | S3 |
| Every 5 minutes | WAL Archive | 1 min | 50 MB | 7 days | S3 |
| Weekly Saturday 3 AM | Full Verification Test | 30 min | - | Monthly report | Staging |

### 1.4 Backup Storage

**Primary Storage: AWS S3 (Multi-Region)**
```bash
# S3 bucket structure
s3://opsiq-backups/
├── full-backups/
│   ├── 2026-05-01/
│   │   └── opsiq_20260501_020000.sql.gz
│   └── 2026-05-12/
│       └── opsiq_20260512_020000.sql.gz
├── incremental-backups/
│   ├── 2026-05-12/
│   │   └── incremental_20260512_180000.sql.gz
│   └── ...
└── wal-archives/
    ├── 2026-05-12/
    │   ├── 000000010000000000000001
    │   ├── 000000010000000000000002
    │   └── ...
    └── ...
```

**Configuration:**
- Versioning: Enabled (retain all versions)
- Encryption: AES-256 at rest
- Replication: Cross-region (us-west-2 primary, eu-west-1 replica)
- Access: IAM role (no access keys)
- Lifecycle: Full backups kept 30 days, WAL 7 days, incremental 7 days

**Secondary Storage: On-Premise Tape**
- Full backups written to LTO-9 tape weekly
- Tapes stored in fireproof safe, separate building
- Cross-company courier for off-site tape storage
- Tape indexing: Backup ID + date + size + MD5 checksum

### 1.5 Backup Commands

**Full Backup (Daily 2 AM)**
```bash
#!/bin/bash
# Script: /usr/local/bin/backup-full-daily.sh

DB_NAME="opsiq_production"
DB_USER="postgres"
DB_HOST="prod-db-primary.internal"
BACKUP_DIR="/var/backups/postgresql"
S3_BUCKET="opsiq-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/opsiq_${TIMESTAMP}.sql.gz"

# Pre-backup check: disk space
AVAILABLE=$(df $BACKUP_DIR | awk 'NR==2 {print $4}')
if [ $AVAILABLE -lt 10485760 ]; then  # < 10 GB
  echo "ERROR: Insufficient disk space for backup" >&2
  exit 1
fi

# Create backup with compression + custom format (faster restore)
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME -Fc -Z 9 | \
  tee "$BACKUP_FILE" | \
  aws s3 cp - "s3://${S3_BUCKET}/full-backups/$(date +%Y-%m-%d)/opsiq_${TIMESTAMP}.dump" \
    --sse AES256 \
    --storage-class GLACIER_IR

# Verify backup integrity
pg_restore --data-only -l "$BACKUP_FILE" > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: Backup integrity check failed" >&2
  exit 1
fi

# Calculate checksum
MD5=$(md5sum "$BACKUP_FILE" | awk '{print $1}')

# Log backup
cat >> /var/log/backups/backup-full.log <<EOF
[$(date +'%Y-%m-%d %H:%M:%S')] FULL_BACKUP file=$BACKUP_FILE size=$(du -h $BACKUP_FILE | cut -f1) md5=$MD5 status=SUCCESS
EOF

# Cleanup: keep only last 5 full backups locally
find $BACKUP_DIR -name "opsiq_*.sql.gz" -type f -mtime +5 -delete

echo "Full backup completed: $BACKUP_FILE"
exit 0
```

**Incremental Backup (Daily 6 PM)**
```bash
#!/bin/bash
# Script: /usr/local/bin/backup-incremental-daily.sh

DB_NAME="opsiq_production"
DB_USER="postgres"
DB_HOST="prod-db-primary.internal"
BACKUP_DIR="/var/backups/postgresql"
S3_BUCKET="opsiq-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create base backup (starting point for incremental WAL recovery)
pg_basebackup -h $DB_HOST -U $DB_USER -D $BACKUP_DIR/base_${TIMESTAMP} -Ft -z -P

# Upload to S3
tar -czf - -C $BACKUP_DIR base_${TIMESTAMP} | \
  aws s3 cp - "s3://${S3_BUCKET}/incremental-backups/$(date +%Y-%m-%d)/base_${TIMESTAMP}.tar.gz" \
    --sse AES256

# Cleanup local
rm -rf $BACKUP_DIR/base_${TIMESTAMP}

echo "Incremental backup completed: base_${TIMESTAMP}"
exit 0
```

**WAL Archiving (Continuous)**
```bash
# PostgreSQL postgresql.conf configuration
archive_mode = on
archive_timeout = 300  # 5 minutes
archive_command = '/usr/local/bin/archive-wal.sh %p %f'
wal_level = replica
max_wal_senders = 10
```

```bash
#!/bin/bash
# Script: /usr/local/bin/archive-wal.sh
# Called by PostgreSQL when WAL segment fills

WAL_PATH="$1"
WAL_FILE="$2"
S3_BUCKET="opsiq-backups"

# Copy to S3 with retry logic
for attempt in {1..3}; do
  aws s3 cp "$WAL_PATH" "s3://${S3_BUCKET}/wal-archives/$(date +%Y-%m-%d)/$WAL_FILE" \
    --sse AES256 && exit 0
  sleep 5
done

# If all retries failed, log error but don't fail (PostgreSQL needs success)
logger -t wal-archive -p user.err "Failed to archive $WAL_FILE after 3 attempts"
exit 0
```

---

## SECTION 2: BACKUP VERIFICATION

### 2.1 Weekly Backup Verification (Saturday 3 AM)

**Goal:** Ensure backups are restorable and data integrity intact

**Procedure:**
```bash
#!/bin/bash
# Script: /usr/local/bin/verify-backups-weekly.sh
# Run: Every Saturday 3 AM UTC via cron

STAGING_DB="opsiq_staging_verify"
STAGING_HOST="staging-db.internal"
STAGING_USER="postgres"
S3_BUCKET="opsiq-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/backups/verify-${TIMESTAMP}.log"

echo "[$(date)] Starting weekly backup verification" >> $LOG_FILE

# Step 1: Download most recent full backup from S3
LATEST_BACKUP=$(aws s3 ls "s3://${S3_BUCKET}/full-backups/" --recursive | \
  sort | tail -1 | awk '{print $4}')

if [ -z "$LATEST_BACKUP" ]; then
  echo "[$(date)] ERROR: No backups found in S3" >> $LOG_FILE
  exit 1
fi

echo "[$(date)] Downloaded backup: $LATEST_BACKUP" >> $LOG_FILE
aws s3 cp "s3://${S3_BUCKET}/${LATEST_BACKUP}" /tmp/verify_backup.dump \
  --sse AES256

# Step 2: Drop and recreate staging database
psql -h $STAGING_HOST -U $STAGING_USER -c "DROP DATABASE IF EXISTS $STAGING_DB;" 2>> $LOG_FILE
psql -h $STAGING_HOST -U $STAGING_USER -c "CREATE DATABASE $STAGING_DB;" 2>> $LOG_FILE

# Step 3: Restore from backup
echo "[$(date)] Restoring backup to staging database..." >> $LOG_FILE
pg_restore -h $STAGING_HOST -U $STAGING_USER -d $STAGING_DB \
  --exit-on-error /tmp/verify_backup.dump >> $LOG_FILE 2>&1

if [ $? -ne 0 ]; then
  echo "[$(date)] ERROR: Restore failed" >> $LOG_FILE
  exit 1
fi

# Step 4: Verify data integrity
echo "[$(date)] Verifying data integrity..." >> $LOG_FILE

# Count tables
TABLE_COUNT=$(psql -h $STAGING_HOST -U $STAGING_USER -d $STAGING_DB -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
echo "[$(date)] Table count: $TABLE_COUNT" >> $LOG_FILE

# Check for corruption
psql -h $STAGING_HOST -U $STAGING_USER -d $STAGING_DB -c \
  "REINDEX DATABASE $STAGING_DB;" >> $LOG_FILE 2>&1

if [ $? -ne 0 ]; then
  echo "[$(date)] WARNING: Reindex detected issues" >> $LOG_FILE
else
  echo "[$(date)] Data integrity check: PASSED" >> $LOG_FILE
fi

# Step 5: Cleanup
rm /tmp/verify_backup.dump
psql -h $STAGING_HOST -U $STAGING_USER -c "DROP DATABASE $STAGING_DB;" 2>> $LOG_FILE

echo "[$(date)] Weekly verification completed successfully" >> $LOG_FILE

# Send report to DevOps team
mail -s "Weekly Backup Verification Report" devops@opsiq.com < $LOG_FILE

exit 0
```

**Success Criteria:**
- ✓ Backup downloaded successfully
- ✓ Restore completes without errors
- ✓ Table count matches expected (100+)
- ✓ No corruption detected by REINDEX
- ✓ Staging database cleaned up

**Failure Response:**
- Alert on-call DevOps engineer
- Investigate restore error immediately
- Compare backup file size/modification date to S3 metadata
- If corruption found: mark backup as unreliable, investigate storage layer

### 2.2 Monthly Backup Audit (First Friday)

**Procedure:**
1. Verify all backups in S3 are present (30 full + 7 incremental + 168 WAL archives)
2. Spot-check 3 random full backups:
   - Download and verify file integrity (pg_restore --list)
   - Check file size vs. expected size range
   - Verify S3 modification date is as expected
3. Verify WAL archive continuity (no gaps in sequence)
4. Document results in backup audit spreadsheet

---

## SECTION 3: RESTORE PROCEDURES

### 3.1 Restore Scenarios

**Scenario A: Point-in-Time Recovery (Preferred)**
- **Trigger:** Data corruption, accidental deletion, application bug introduced bad data
- **RTO:** 15-30 minutes
- **RPO:** 1-5 minutes (restore to any point in WAL history)
- **Procedure:** Restore from full backup + replay WAL to target time

**Scenario B: Full Database Restore (Unplanned Outage)**
- **Trigger:** Storage failure, database corruption, cluster failure
- **RTO:** 30-45 minutes
- **RPO:** Up to 24 hours (depending on which backup used)
- **Procedure:** Restore latest full backup, replay WAL if needed

**Scenario C: Test Restore (Planned, Non-Production)**
- **Trigger:** Disaster recovery drill, backup verification (weekly)
- **RTO:** Any (non-production environment)
- **RPO:** Any
- **Procedure:** Restore to staging/development database for verification

### 3.2 Point-in-Time Recovery (Preferred Method)

**When to Use:**
- Data corruption detected (e.g., wrong calculation applied)
- Accidental deletion of important records
- Application bug introduced bad data
- User accidentally modified critical data

**Procedure:**
```bash
#!/bin/bash
# Script: /usr/local/bin/restore-pitr.sh
# Restore database to specific point in time

# Parameters
TARGET_TIME="2026-05-12 14:30:00 UTC"  # Restore to this timestamp
S3_BUCKET="opsiq-backups"
RECOVERY_DB="opsiq_recovery"
RESTORE_DIR="/var/backups/recovery_${TIMESTAMP}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "[$(date)] Starting point-in-time recovery to $TARGET_TIME"

# Step 1: Identify most recent full backup BEFORE target time
echo "[$(date)] Finding backup from before target time..."
BACKUP_TO_USE=$(aws s3 ls "s3://${S3_BUCKET}/full-backups/" --recursive | \
  awk '{print $4}' | \
  while read file; do
    # Extract timestamp from filename: opsiq_20260512_020000.sql.gz
    file_time=$(echo $file | sed -E 's/.*opsiq_([0-9]{8}_[0-9]{6}).*/\1/' | tr '_' ' ')
    echo "$file_time $file"
  done | \
  sort -r | \
  head -1 | \
  awk '{print $2}')

if [ -z "$BACKUP_TO_USE" ]; then
  echo "[$(date)] ERROR: No suitable backup found" >&2
  exit 1
fi

echo "[$(date)] Using backup: $BACKUP_TO_USE"

# Step 2: Create recovery directory and download backup
mkdir -p $RESTORE_DIR
aws s3 cp "s3://${S3_BUCKET}/${BACKUP_TO_USE}" "$RESTORE_DIR/base.dump" \
  --sse AES256

# Step 3: Create recovery database
createdb $RECOVERY_DB

# Step 4: Restore base backup
echo "[$(date)] Restoring base backup..."
pg_restore --exit-on-error -d $RECOVERY_DB "$RESTORE_DIR/base.dump"

if [ $? -ne 0 ]; then
  echo "[$(date)] ERROR: Base restore failed" >&2
  dropdb $RECOVERY_DB
  exit 1
fi

# Step 5: Download and apply WAL archives after backup time
# (This is automated via PostgreSQL recovery.conf, see below)

echo "[$(date)] Point-in-time recovery completed"
echo "[$(date)] Recovered database: $RECOVERY_DB"
echo "[$(date)] Verify data, then:"
echo "  1. Run test suite against recovery database"
echo "  2. If data looks good: promote to production (see 'Promote Recovered DB')"
echo "  3. If data looks bad: keep for investigation, restore earlier backup"

exit 0
```

**PostgreSQL recovery.conf (for WAL replay to specific point):**
```ini
# /var/lib/postgresql/16/main/recovery.conf
# This file controls point-in-time recovery

restore_command = 'aws s3 cp s3://opsiq-backups/wal-archives/%f - | gunzip > %p 2>/dev/null || true'
recovery_target_timeline = 'latest'
recovery_target_name = 'before_corruption'  # Named recovery point (if set)
# OR
recovery_target_time = '2026-05-12 14:30:00 UTC'
recovery_target_inclusive = false

# After recovery reaches target, stop replaying WAL
pause_at_recovery_target = true
```

### 3.3 Full Database Restore (Unplanned Outage)

**When to Use:**
- Storage hardware failure
- Entire database cluster down
- Catastrophic data corruption
- DR failover required

**Procedure:**
```bash
#!/bin/bash
# Script: /usr/local/bin/restore-full.sh
# Complete database restore from backup

# Configuration
TARGET_HOST="prod-db-primary-new.internal"
TARGET_USER="postgres"
TARGET_DB="opsiq_production"
S3_BUCKET="opsiq-backups"
RESTORE_DIR="/mnt/restore_${TIMESTAMP}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="/var/log/backups/restore-full-${TIMESTAMP}.log"

echo "[$(date)] Starting full database restore" | tee $LOG_FILE

# Step 1: Verify target is empty
echo "[$(date)] Verifying target database is empty..." | tee -a $LOG_FILE
EXISTING_TABLES=$(psql -h $TARGET_HOST -U $TARGET_USER -d $TARGET_DB -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null)

if [ "$EXISTING_TABLES" != "0" ]; then
  echo "[$(date)] WARNING: Target database has existing tables. Backing up..." | tee -a $LOG_FILE
  pg_dump -h $TARGET_HOST -U $TARGET_USER -d $TARGET_DB -Fc -Z 9 | \
    aws s3 cp - "s3://${S3_BUCKET}/emergency-backup/opsiq_${TIMESTAMP}.dump" --sse AES256
fi

# Step 2: Download latest full backup
echo "[$(date)] Downloading latest backup..." | tee -a $LOG_FILE
LATEST_BACKUP=$(aws s3 ls "s3://${S3_BUCKET}/full-backups/" --recursive | \
  sort | tail -1 | awk '{print $4}')

mkdir -p $RESTORE_DIR
aws s3 cp "s3://${S3_BUCKET}/${LATEST_BACKUP}" "$RESTORE_DIR/backup.dump" \
  --sse AES256 2>> $LOG_FILE

# Step 3: Restore database
echo "[$(date)] Restoring backup to $TARGET_DB..." | tee -a $LOG_FILE
pg_restore -h $TARGET_HOST -U $TARGET_USER -d $TARGET_DB \
  --exit-on-error --verbose "$RESTORE_DIR/backup.dump" >> $LOG_FILE 2>&1

if [ $? -ne 0 ]; then
  echo "[$(date)] ERROR: Restore failed - see log for details" >&2
  exit 1
fi

# Step 4: Verify restored database
echo "[$(date)] Verifying database integrity..." | tee -a $LOG_FILE
psql -h $TARGET_HOST -U $TARGET_USER -d $TARGET_DB -c \
  "ANALYZE; REINDEX DATABASE $TARGET_DB;" >> $LOG_FILE 2>&1

# Step 5: Run sanity checks
echo "[$(date)] Running sanity checks..." | tee -a $LOG_FILE

# Check table count
TABLE_COUNT=$(psql -h $TARGET_HOST -U $TARGET_USER -d $TARGET_DB -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
echo "[$(date)] Restored table count: $TABLE_COUNT" | tee -a $LOG_FILE

# Check record counts for critical tables
psql -h $TARGET_HOST -U $TARGET_USER -d $TARGET_DB -c \
  "SELECT tablename, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;" \
  | tee -a $LOG_FILE

echo "[$(date)] Full restore completed successfully" | tee -a $LOG_FILE
echo "[$(date)] Next steps:" | tee -a $LOG_FILE
echo "[$(date)]   1. Run integration tests against restored database" | tee -a $LOG_FILE
echo "[$(date)]   2. If tests pass, promote to production" | tee -a $LOG_FILE
echo "[$(date)]   3. If tests fail, investigate and restore earlier backup" | tee -a $LOG_FILE

# Alert team
mail -s "Full Database Restore Completed" devops@opsiq.com < $LOG_FILE

exit 0
```

### 3.4 Promote Recovered Database to Production

**After recovery is verified and tested:**

```bash
#!/bin/bash
# Script: /usr/local/bin/promote-recovered-db.sh
# Make recovered database the new primary (after failover/restore)

RECOVERED_HOST="prod-db-recovered.internal"
RECOVERED_USER="postgres"
RECOVERED_DB="opsiq_recovery"
TARGET_HOST="prod-db-primary.internal"
TARGET_USER="postgres"

echo "WARNING: This procedure replaces the production database."
echo "Ensure recovery database has been tested and data integrity verified."
echo "Press ENTER to continue, or Ctrl+C to cancel."
read

# Step 1: Backup current production (as safeguard)
pg_dump -h $TARGET_HOST -U $TARGET_USER -d opsiq_production -Fc -Z 9 | \
  aws s3 cp - "s3://opsiq-backups/pre-failover-backup/opsiq_$(date +%Y%m%d_%H%M%S).dump"

# Step 2: Stop application connections
# (Done via load balancer: drain connections, prevent new ones)
echo "Ensuring application connections are drained..."

# Step 3: Promote recovered database
# (If recovered is on different host: use pg_rewind or repartition)
echo "Promoting recovered database..."

# (Implementation depends on cluster architecture - could be:
#   - Use pg_rewind if standby
#   - Manual DNS switch if separate host
#   - Patroni automatic failover)

echo "Promotion complete. Running final verification..."

# Step 4: Run critical queries
psql -h $TARGET_HOST -U $TARGET_USER -d opsiq_production -c \
  "SELECT COUNT(*) FROM workspaces; SELECT COUNT(*) FROM audit_events;"

echo "Database promotion complete. Resume application traffic."

exit 0
```

---

## SECTION 4: DISASTER RECOVERY (DR) PROCEDURES

### 4.1 DR Failover (Regional Outage)

**Trigger:**
- AWS region becomes unavailable (rare but possible)
- Network connectivity to production region lost
- Regional natural disaster (earthquake, flood, etc.)

**RTO:** < 30 minutes  
**RPO:** < 5 minutes

**Procedure:**
1. Declare regional disaster (VP decision)
2. Activate DR site (eu-west-1 region, pre-configured standby)
3. Promote standby database to primary:
   ```bash
   pg_ctl -D /var/lib/postgresql/16/main promote
   ```
4. Update DNS: prod-db.internal → eu-west-1 IP
5. Verify application connectivity
6. Monitor for 30 minutes (errors, lag)
7. Determine if permanent region switch or temporary

### 4.2 Backup Validation in DR Site

**Process:**
```bash
# Weekly: Restore latest backup to DR staging database
# Verify all records present and correct
# If corruption detected: investigate + isolate backup

# Monthly: Full DR drill
# - Promote DR standby to primary
# - Run application test suite
# - Simulate traffic for 1 hour
# - Switch back to production region
```

---

## SECTION 5: MONITORING AND ALERTING

### 5.1 Backup Monitoring

**Metrics to Track:**
```
✓ Backup completion time (target: < 15 min for full)
✓ Backup file size (alert if > 20% deviation)
✓ Restore test success rate (target: 100%)
✓ WAL archive lag (target: < 5 min)
✓ Storage used (alert at 80% capacity)
✓ S3 bucket replication lag (target: < 1 min)
```

**Alerting Rules:**
```yaml
- alert: BackupMissing
  condition: no backup in S3 in last 24 hours
  severity: critical
  action: page on-call DevOps immediately

- alert: BackupRestoreFailed
  condition: weekly verification test fails
  severity: high
  action: email devops team + investigate

- alert: WALArchiveLag
  condition: WAL archive age > 10 minutes
  severity: high
  action: alert on-call, investigate archiver

- alert: BackupStorageNearFull
  condition: S3 backup bucket > 80% capacity
  severity: medium
  action: email storage team, begin cleanup

- alert: BackupCorruptionDetected
  condition: restore fails or REINDEX detects corruption
  severity: critical
  action: page on-call immediately, quarantine backup
```

### 5.2 Backup Logs

**Location:** `/var/log/backups/`

**Files:**
- `backup-full.log`: Full backup attempts (success/failure, file size, checksum)
- `backup-incremental.log`: Incremental backup attempts
- `archive-wal.log`: WAL archiving operations
- `verify-backup.log`: Weekly verification results
- `restore-*.log`: Restore operation logs

**Log Format:**
```
[2026-05-12 02:15:30 UTC] FULL_BACKUP file=/var/backups/postgresql/opsiq_20260512_021530.sql.gz size=2.1G md5=abc123def456 status=SUCCESS
[2026-05-12 18:05:45 UTC] INCREMENTAL_BACKUP size=512MB status=SUCCESS uploaded_to_s3=true
[2026-05-12 03:15:00 UTC] WEEKLY_VERIFY status=SUCCESS tables_restored=150 integrity_check=PASSED
```

---

## SECTION 6: RUNBOOK - BACKUP TROUBLESHOOTING

### Issue: Backup Takes Too Long (> 20 minutes)

**Diagnosis:**
```bash
# Check database size and activity
psql -c "SELECT * FROM pg_stat_statements ORDER BY calls DESC LIMIT 10;"

# Check disk I/O
iostat -x 1 5  # Look for high %iowait

# Check active locks
psql -c "SELECT * FROM pg_locks WHERE NOT granted;"
```

**Solutions:**
1. **Heavy write load:** Retry backup during lower-traffic window
2. **Slow I/O:** Increase read buffer size: `shared_buffers=16GB`
3. **Exclusive locks:** Kill long-running transactions: `SELECT pg_terminate_backend(pid)`

### Issue: Restore Fails With "Permission Denied"

**Diagnosis:**
```bash
# Verify user and database ownership
psql -c "SELECT datname, datacl FROM pg_database WHERE datname='opsiq_production';"

# Check file permissions
ls -la /var/backups/postgresql/
```

**Solutions:**
1. **Insufficient permissions:** Grant backup user privileges: `GRANT CREATE ON DATABASE opsiq_production TO postgres;`
2. **File ownership:** `chown postgres:postgres /var/backups/postgresql/*`
3. **Disk quota:** Check: `quota postgres`

### Issue: WAL Archive Fails Silently

**Diagnosis:**
```bash
# Check WAL archiver status
psql -c "SELECT * FROM pg_stat_archiver;"

# Verify S3 credentials
aws s3 ls s3://opsiq-backups/  # Should list buckets

# Check archive script logs
grep archive-wal /var/log/syslog | tail -20
```

**Solutions:**
1. **S3 credentials missing:** Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
2. **Bucket permissions:** Verify IAM role has s3:PutObject
3. **Network issues:** Check connectivity to S3: `aws s3api head-bucket --bucket opsiq-backups`

### Issue: Backup Corruption Detected During Verify

**Diagnosis:**
```bash
# List backup and check file integrity
pg_restore --list /var/backups/backup.dump | head -20  # If succeeds, not corrupted

# Check backup file size and modification date
ls -lh /var/backups/backup.dump
stat /var/backups/backup.dump

# Download from S3 and compare
aws s3 cp s3://opsiq-backups/full-backups/.../opsiq_20260512_020000.sql.gz /tmp/
md5sum /var/backups/backup.dump /tmp/opsiq_20260512_020000.sql.gz
```

**Solutions:**
1. **Download corruption:** Re-download from S3
2. **Storage corruption:** Mark backup as unreliable, restore from previous backup
3. **Application version mismatch:** Ensure pg_dump and pg_restore are same PostgreSQL version

---

## SECTION 7: TEAM RESPONSIBILITIES

### DevOps/SRE Team
- Schedule and monitor all backups
- Respond to backup alerts within 15 minutes
- Perform monthly backup audits
- Maintain backup documentation and runbooks
- Test DR procedures quarterly

### Database Administrator (DBA)
- Monitor backup completion and WAL archiving
- Investigate corruption detected by verification
- Optimize backup performance (compression, timing)
- Plan backup storage capacity and growth

### Application Team
- Coordinate backup windows with deployment schedule
- Avoid long-running transactions during backup time
- Test disaster recovery procedures
- Validate data integrity after any restore

### Security Team
- Audit backup encryption and access control
- Verify S3 bucket policies and IAM roles
- Review backup audit logs quarterly
- Ensure backup tapes are securely stored

---

## SECTION 8: CHANGE CONTROL

**Authorization Required:** VP Engineering (for any changes to backup schedule, storage, retention)

**Change Checklist:**
- [ ] Review impact on RTO/RPO
- [ ] Test new procedure in staging environment
- [ ] Document changes in this guide
- [ ] Notify all teams of changes
- [ ] Schedule verification test within 1 week

---

**Document Version:** 1.0  
**Last Reviewed:** 2026-05-12  
**Next Review:** 2026-06-12
