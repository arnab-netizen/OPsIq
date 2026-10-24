# OpsIQ Operational Runbook

**Last Updated:** 2026-05-12  
**Version:** 1.0  
**Owner:** DevOps Team  
**Review Cycle:** Quarterly

---

## Table of Contents

1. [Daily Operations](#daily-operations)
2. [Health Monitoring](#health-monitoring)
3. [Capacity Planning](#capacity-planning)
4. [Performance Optimization](#performance-optimization)
5. [Security Hardening](#security-hardening)
6. [Backup & Recovery](#backup--recovery)
7. [Troubleshooting Guide](#troubleshooting-guide)

---

## Daily Operations

### Morning Briefing (8 AM, 10 min)
```bash
# Run daily health check
./scripts/ops-daily-check.sh

# Checks include:
# ✓ All services running
# ✓ Database accessible and healthy
# ✓ Disk space > 10% free
# ✓ Memory usage normal
# ✓ No errors in overnight logs
# ✓ Backup completed successfully
# ✓ Recent deployments successful
```

### Hourly Monitoring (Every hour)
```bash
# Quick health status
curl -s http://localhost:3000/api/health | jq .

# Verify core metrics
psql $DATABASE_URL -c "SELECT version();"  # DB is up
df -h | grep /data                          # Disk space
free -h                                     # Memory
```

### Shift Change (Every 8 hours or on-call handoff)
1. Review recent deployments
2. Check for any ongoing incidents
3. Review logs for warnings/errors
4. Verify backup completion status
5. Update team documentation

---

## Health Monitoring

### Key Metrics to Track

**1. Application Metrics**
- **API Response Time (p50, p95, p99):** Should be < 100ms, < 300ms, < 1s
- **Error Rate:** Should be < 1% (0.1% acceptable)
- **Requests/sec:** Should match expected traffic pattern
- **Active Connections:** Should be stable (no gradual increase)

**2. Database Metrics**
- **Connection Count:** Should be < 90 of available 100
- **Slow Queries:** Anything > 1 second should be investigated
- **Cache Hit Ratio:** Should be > 99% for indexes
- **Replication Lag (if applicable):** Should be < 10ms

**3. System Metrics**
- **CPU Usage:** Should be < 70% (alert at 80%)
- **Memory Usage:** Should be < 80% (alert at 90%)
- **Disk Space:** Should be > 10% free (alert at 5%)
- **Network I/O:** Should be stable

**4. Business Metrics**
- **Webhook Delivery Success Rate:** Should be > 95%
- **Audit Events Recorded:** Should match expected volume
- **API Availability:** Should be > 99.5%

### Setting Up Alerts

**For New Deployments:**
```bash
# Set up monitoring for:
# - Error rate spike (> 2% sustained for 5 min)
# - Response time degradation (p95 > 300ms for 10 min)
# - Database connection pool exhaustion (> 90 connections)
# - Disk space critical (< 5% free)
# - Memory exhaustion (> 90%)
# - Webhook delivery failures (> 5% failed for 10 min)
```

**See:** DEPLOYMENT_RUNBOOK.md for escalation on alert trigger

---

## Capacity Planning

### When to Scale

**Trigger 1: CPU > 70% for > 20 min**
```
Action: Horizontal scale (add server) OR optimize code
Timeline: Within 1 hour
```

**Trigger 2: Memory > 80% for > 20 min**
```
Action: Vertical scale (increase RAM) OR investigate memory leak
Timeline: Within 1 hour
```

**Trigger 3: Disk > 90% full**
```
Action: Cleanup logs OR expand partition OR archive old data
Timeline: Immediate (disk full = crash risk)
```

**Trigger 4: Database Connections > 90 of 100**
```
Action: Optimize queries OR increase connection pool size OR horizontal scale
Timeline: Within 2 hours
```

**Trigger 5: Response Time p95 > 300ms**
```
Action: Profile slow endpoints OR scale database OR optimize slow query
Timeline: Within 4 hours
```

### Scaling Procedure

**1. Horizontal Scale (Add Server)**
```bash
# See DEPLOYMENT_RUNBOOK.md - Horizontal Scaling section
```

**2. Vertical Scale (Increase Resources)**
```bash
# See DEPLOYMENT_RUNBOOK.md - Vertical Scaling section
```

**3. Database Scaling**
```bash
# See DEPLOYMENT_RUNBOOK.md - Database Scaling section
```

---

## Performance Optimization

### Query Optimization

**Identify Slow Queries:**
```bash
psql $DATABASE_URL -c "
SELECT query, mean_time, calls 
FROM pg_stat_statements 
WHERE mean_time > 100  # > 100ms
ORDER BY mean_time DESC 
LIMIT 10;"
```

**Optimize Index Strategy:**
```bash
# Find missing indexes (queries doing sequential scans)
psql $DATABASE_URL -c "
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE correlation < 0.1  -- Low correlation = bad for index
ORDER BY n_distinct DESC;"

# Create missing indexes
# psql $DATABASE_URL -c "CREATE INDEX idx_name ON table_name(column);"
```

**Connection Pool Tuning:**
```bash
# Current pool config
grep "max_connections\|pool_size" /etc/postgresql/postgresql.conf

# Recommended values:
# - max_connections = (CPU_cores * 4) + 15  = 32 (for 4-core system)
# - pool_size = (CPU_cores * 2) + 5 = 13
# - reserve_pool_size = 5
```

### Code-Level Optimization

**Identify N+1 Query Problems:**
```bash
# Look for: same query repeated many times in logs
grep "SELECT count\|SELECT \*" /var/log/opsiq/api.log | \
  awk '{print $NF}' | sort | uniq -c | sort -rn | head -10

# If same query appears 100+ times in 1 minute: likely N+1 problem
# Fix: Use JOIN or batch fetch instead of loop
```

**Optimize Serialization:**
```bash
# Large JSON responses (> 1MB) should be paginated or compressed
# Check response size in metrics dashboard
```

---

## Security Hardening

### Daily Security Checks

```bash
# 1. Verify database encryption
psql $DATABASE_URL -c "SHOW ssl;" 
# Output should be: 'on'

# 2. Check for unauthorized users
psql $DATABASE_URL -c "SELECT * FROM pg_user WHERE usecanlogin = true;"
# Should match expected list

# 3. Verify file permissions (no world-readable secrets)
ls -la /etc/opsiq/  # Should be 0600 or 0700
ls -la ~/.ssh/      # Should be 0700

# 4. Check system updates available
apt update && apt -s upgrade  # See what's available
# Schedule security updates monthly
```

### Access Control

**SSH Key Management:**
- Rotate SSH keys quarterly
- Disable password authentication (use key only)
- Use authorized_keys file with restricted commands

**Database User Permissions:**
```bash
# Application user should have minimal permissions
psql $DATABASE_URL -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO opsiq_user;"
psql $DATABASE_URL -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT INSERT, UPDATE ON TABLES TO opsiq_user;"

# Revoke unnecessary permissions
psql $DATABASE_URL -c "REVOKE ALL ON SCHEMA public FROM public;"
psql $DATABASE_URL -c "REVOKE ALL ON DATABASE opsiq FROM public;"
```

**Audit Trail Integrity:**
```bash
# Verify audit events are immutable (no DELETE operations allowed)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM audit_events;" # Should only grow
```

---

## Backup & Recovery

### Automated Backup Schedule

**Daily Backup (2:00 AM):**
```bash
# Configured via cron:
# 0 2 * * * /scripts/backup-database.sh /backups/opsiq && \
#            /scripts/cleanup-old-backups.sh /backups/opsiq 30
```

**Verify Backup Success:**
```bash
# Check today's backup exists and has reasonable size
ls -lh /backups/opsiq/opsiq_backup_2026-05-*.sql.gz | tail -1
# Expected: > 100MB (should be compressed database)

# Verify checksum
cat /backups/opsiq/opsiq_backup_*.sql.gz.sha256 | head -1
```

### Weekly Restore Test (Friday 3 PM)

**Restore to Test Database:**
```bash
# 1. Create test database
psql $DATABASE_URL -c "CREATE DATABASE opsiq_test;"

# 2. Restore latest backup (local / disposable server only; the script refuses production)
OPSIQ_DB_TARGET=local DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" \
  ./scripts/restore-database.sh \
  /backups/opsiq/opsiq_backup_LATEST.sql.gz verify

# 3. Verify data
psql -d opsiq_test -c "SELECT COUNT(*) FROM workspaces;"
psql -d opsiq_test -c "SELECT MAX(created_at) FROM audit_events;"

# 4. Cleanup test database
psql $DATABASE_URL -c "DROP DATABASE opsiq_test;"
```

**Document:** Week of [date] - Restore test passed/failed + issues

### Retention Policy

| Backup Age | Action | Reason |
|-----------|--------|--------|
| < 7 days | Keep | Recent changes recovery |
| 7-30 days | Keep | Short-term incident recovery |
| 30-90 days | Keep (optional) | Compliance/audit trail |
| > 90 days | Delete | Cost optimization |

---

## Troubleshooting Guide

### Issue: Slow Audit Trail Queries

**Symptom:** GET /api/admin/audit-log takes > 2 seconds

**Investigation:**
```bash
# Check if index exists
psql $DATABASE_URL -c "SELECT * FROM pg_indexes WHERE tablename = 'audit_events';"

# Check query plan
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM audit_events WHERE workspace_id = 'ws-123' LIMIT 100;"
# Look for: Seq Scan (bad, should be Index Scan)

# Check table size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_total_relation_size('audit_events'));"
# If > 10GB: may need archival strategy
```

**Fix:**
```bash
# Add missing index
psql $DATABASE_URL -c "CREATE INDEX idx_audit_workspace_created ON audit_events(workspace_id, created_at DESC);"

# Verify performance improves
psql $DATABASE_URL -c "EXPLAIN ANALYZE SELECT * FROM audit_events WHERE workspace_id = 'ws-123' LIMIT 100;"
```

### Issue: Webhook Deliveries Failing

**Symptom:** Webhooks not being delivered, stuck in "pending" status

**Investigation:**
```bash
# Check webhook job queue
psql $DATABASE_URL -c "
SELECT status, COUNT(*) 
FROM webhook_jobs 
GROUP BY status;"

# Check oldest pending job
psql $DATABASE_URL -c "
SELECT id, webhook_id, event_type, created_at, last_error
FROM webhook_jobs 
WHERE status = 'pending' 
ORDER BY created_at ASC 
LIMIT 1;"

# Check worker logs
tail -100 /var/log/opsiq/api.log | grep -i "webhook"
```

**Fix:**
```bash
# If worker is running:
systemctl status opsiq-worker  # Should be active

# If not running:
systemctl start opsiq-worker

# If still failing:
# 1. Check webhook endpoint is reachable
#    curl -s https://customer-endpoint.example.com/webhooks -o /dev/null -w "%{http_code}\n"
#
# 2. Check webhook signature generation
#    psql $DATABASE_URL -c "SELECT signature FROM webhook_jobs LIMIT 1;"
#    (should be 64-char hex string)
#
# 3. Check database connectivity from worker
#    psql $DATABASE_URL -c "SELECT 1;"
```

### Issue: Admin Dashboard Returning 500 Errors

**Symptom:** GET /api/admin/workspaces returns 500 Internal Server Error

**Investigation:**
```bash
# Check error in logs
tail -50 /var/log/opsiq/api.log | grep -i "error\|500"

# Check request-specific error
curl -i -H "Authorization: Bearer $SYSTEM_ADMIN_TOKEN" \
  http://localhost:3000/api/admin/workspaces 2>&1 | grep -A 20 "error"

# Check database connectivity
psql $DATABASE_URL -c "SELECT * FROM workspaces LIMIT 1;" 
# Should not error

# Check admin user has proper permissions
psql $DATABASE_URL -c "SELECT * FROM workspace_members WHERE role = 'SYSTEM_ADMIN' LIMIT 1;"
```

**Fix:**
```bash
# If database connectivity issue:
# Restart services (see DEPLOYMENT_RUNBOOK.md)

# If permission issue:
# Verify SYSTEM_ADMIN_TOKEN is valid
# Check token contains "system-admin" capability in JWT

# If code issue:
# Check recent deployment
git log --oneline -5
# If from recent deployment: ROLLBACK (see DEPLOYMENT_RUNBOOK.md)
```

### Issue: Out of Disk Space

**Symptom:** Application crashes with "no space left on device"

**Investigation:**
```bash
# Identify largest directories
du -sh /data/* /var/log/* /backups/* | sort -rh | head -10

# Identify specific files
find /var/log -name "*.log" -type f -exec ls -lh {} \; | sort -k5 -rh | head -10
```

**Fix (in order of size savings):**
1. Delete old backup files (keep 5 most recent):
   ```bash
   ls -1t /backups/opsiq/opsiq_backup_*.sql.gz | tail -n +6 | xargs rm
   ```

2. Rotate log files:
   ```bash
   cd /var/log/opsiq
   gzip api.log && mv api.log.gz api.log.$(date +%Y%m%d_%H%M%S).gz
   # Re-create new api.log file
   ```

3. Archive old audit events (if > 90 days):
   ```bash
   # See backup procedure for how to export and archive old events
   ```

4. Expand disk partition (permanent fix):
   ```bash
   # Contact infrastructure team to expand /dev/sdX partition
   # Extend filesystem: resize2fs /dev/mapper/vg0-data
   ```

---

## On-Call Handoff Checklist

Use this checklist at shift changes:

- [ ] Review recent deployments (last 24 hours)
- [ ] Check for any open incidents (#ops-incident)
- [ ] Verify backup completed successfully
- [ ] Review error logs for patterns
- [ ] Check all services running: `systemctl status opsiq-*`
- [ ] Verify database accessible: `psql $DATABASE_URL -c "SELECT 1;"`
- [ ] Check disk space: `df -h` (should be > 10% free)
- [ ] Review scheduled maintenance/deployments
- [ ] Update team calendar with on-call dates
- [ ] Confirm escalation contacts (see DEPLOYMENT_RUNBOOK.md)

---

## Monthly Maintenance

### First Monday of Month (1 hour)

1. **Review and Update Runbooks** (15 min)
   - Update dates and contact info
   - Note any new procedures learned
   - Update based on recent incidents

2. **Verify Backup Rotation** (10 min)
   ```bash
   ls -lt /backups/opsiq/opsiq_backup_*.sql.gz | head -10
   # Verify: recent daily backups + cleanup of > 30 days old
   ```

3. **Check Security Updates** (10 min)
   ```bash
   apt update && apt -s upgrade
   # If security updates available: schedule for off-hours install
   ```

4. **Capacity Planning Review** (15 min)
   - Review 30-day trend: CPU, memory, disk, database size
   - Forecast: will we need to scale in next 30 days?
   - Schedule capacity expansion if needed

5. **Performance Baselines** (10 min)
   ```bash
   # Compare this month vs last month:
   # - p95 response time
   # - Error rate
   # - Database query times
   # - Disk usage growth rate
   ```

---

**Last Updated:** 2026-05-12  
**Version:** 1.0  
**Review Schedule:** Quarterly  
**Owner:** DevOps Team
