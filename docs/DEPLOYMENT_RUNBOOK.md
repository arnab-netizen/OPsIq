# OpsIQ Deployment Runbook

**Last Updated:** 2026-05-12  
**Version:** 1.0  
**On-Call Owner:** DevOps Team  
**Escalation:** See "On-Call Responsibilities" section

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Deployment Process](#deployment-process)
3. [Post-Deployment Verification](#post-deployment-verification)
4. [Rollback Procedure](#rollback-procedure)
5. [Incident Response](#incident-response)
6. [Scaling Procedures](#scaling-procedures)
7. [On-Call Responsibilities](#on-call-responsibilities)
8. [Escalation Matrix](#escalation-matrix)

---

## Pre-Deployment Checklist

### 1. Code Quality Gate (Pre-Push)
```bash
# On developer machine
npm run build                    # ✓ Must succeed (0 errors)
npx tsc --noEmit               # ✓ Must pass (0 TypeScript errors)
npx prisma validate            # ✓ Must pass (schema valid)
npm test                       # ✓ Must pass (all tests)
```

### 2. Branch Status (Pre-Merge)
- [ ] All commits have meaningful messages (not "WIP" or "fix")
- [ ] Branch is up-to-date with main
- [ ] No merge conflicts
- [ ] PR has at least 1 approval from code review

### 3. CI/CD Pipeline (Pre-Deployment)
```bash
# GitHub Actions CI must pass
# Steps verified:
# ✓ npm ci (clean install)
# ✓ npx tsc --noEmit (TypeScript validation)
# ✓ npx prisma validate (schema validation)
# ✓ npx prisma migrate deploy (migration success)
# ✓ npm run build (production build)
# ✓ npm test (full test suite with PostgreSQL)
```

Failure at any step → BLOCK DEPLOYMENT. Do not proceed.

### 4. Database Backup (Pre-Deployment)
```bash
# On production database server
./scripts/backup-database.sh /backups/opsiq verify

# Verify backup created successfully
ls -lh /backups/opsiq/opsiq_backup_*.sql.gz | head -1
# Output: opsiq_backup_2026-05-12_XX-XX-XX.sql.gz (check size > 1MB)

# Verify checksum
cat /backups/opsiq/opsiq_backup_*.sql.gz.sha256
# Output: [64-char hex string]
```

### 5. Service Health Check (Pre-Deployment)
```bash
# Verify all services running
systemctl status opsiq-api opsiq-backend opsiq-worker

# Check connectivity to database
psql $DATABASE_URL -c "SELECT version();"

# Check disk space
df -h /data /backups
# Ensure > 20% free space on both mounts
```

---

## Deployment Process

### Step 1: Enable Maintenance Mode (Optional, for large deployments)
```bash
# Disable all incoming requests (optional, recommended for > 1 hour downtime)
ssh deploy@opsiq-prod-1
sudo systemctl start opsiq-maintenance

# Users see: "System is under scheduled maintenance. Expected downtime: XX minutes"
# Existing connections: graceful shutdown with 30s timeout
```

### Step 2: Deploy New Code
```bash
# Pull latest from main
git fetch origin && git checkout main && git pull

# Verify code quality (sanity check)
npm run build && npm test -- --run

# Stop services gracefully
systemctl stop opsiq-backend opsiq-api opsiq-worker

# Wait for graceful shutdown (30s timeout)
sleep 5
```

### Step 3: Deploy Database Schema (If Migrations Pending)

> **Hosted production (Vercel + Neon): do not run the commands in this step.** Production
> migrations run only through the approved *Migrate Production Database* workflow, and the
> production build is gated on migration state. Follow
> [`deployment/PRODUCTION_RELEASE_PROCEDURE.md`](deployment/PRODUCTION_RELEASE_PROCEDURE.md).
> The steps below apply only to a self-hosted deployment that you migrate yourself.

**3-Factor Production Migration Gate — all three must pass before applying migrations:**

**Factor 1 — Pending count matches CI expectation:**
```bash
npx prisma migrate status
# Must show exactly the count expected from the release (count verified in CI).
# If count is HIGHER than expected → unknown migration present, BLOCK.
# If count is LOWER → already partially applied or wrong branch, BLOCK.
```

**Factor 2 — Pre-migration backup taken and checksum verified:**
```bash
# Backup must already exist from Step 0 / Section 4 above.
# Verify the timestamp is less than 30 minutes old and size > 1 MB:
ls -lh /backups/opsiq/opsiq_backup_*.sql.gz | tail -1
# Verify the checksum file is non-empty:
cat /backups/opsiq/opsiq_backup_*.sql.gz.sha256 | grep -c '[0-9a-f]\{64\}'
# Output must be: 1
# If backup is missing or stale → re-run backup script, then re-verify.
```

**Factor 3 — Apply migration and confirm table count post-migration:**
```bash
npx prisma migrate deploy
# Output: X migrations applied.

# Confirm schema is valid
npx prisma validate
# Output: ✓ Schema valid

# Confirm expected table count (must be ≥ 45)
psql $DATABASE_URL -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
# Expected: ≥ 45

# If any factor fails: stop here, restore from backup (see rollback section).
```

### Step 4: Start Services
```bash
# Start in order: API → Backend → Worker
systemctl start opsiq-api
sleep 3
systemctl start opsiq-backend
sleep 3
systemctl start opsiq-worker

# Verify services started
systemctl status opsiq-api opsiq-backend opsiq-worker
```

### Step 5: Disable Maintenance Mode
```bash
systemctl stop opsiq-maintenance

# Traffic resumes immediately
```

---

## Post-Deployment Verification

### Step 1: Health Checks
```bash
# API endpoint responding
curl -s http://localhost:3000/api/health | jq .
# Expected: { "status": "healthy", "timestamp": "...", "database": "connected" }

# Admin audit log accessible
curl -s -H "Authorization: Bearer $SYSTEM_ADMIN_TOKEN" \
  http://localhost:3000/api/admin/audit-log | jq .data | head -5
# Expected: Array of audit events (non-empty)

# Webhook infrastructure responding
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/webhooks | jq .
# Expected: Array of webhooks (may be empty initially)
```

### Step 2: Database Verification
```bash
# Check table count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';"
# Expected: 45+ tables (from migrations)

# Sample workspace data
psql $DATABASE_URL -c "SELECT COUNT(*) FROM workspaces;"
# Expected: > 0 (production data present)

# Check audit trail
psql $DATABASE_URL -c "SELECT COUNT(*) FROM audit_events WHERE created_at > now() - interval '5 minutes';"
# Expected: > 0 (recent events recorded)
```

### Step 3: Error Rate Monitoring (First 5 Minutes)
```bash
# Monitor error logs
tail -f /var/log/opsiq/api.log | grep -i "error\|exception" | head -10
# Expected: No ERROR or EXCEPTION lines (or expected volume < 1% of requests)

# Check response time
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/health
# Expected: Total time < 100ms

# Load test sanity check
apache-bench -n 100 -c 10 http://localhost:3000/api/health
# Expected: 100 requests completed, 0 failed, avg response < 100ms
```

### Step 4: Production Traffic Monitoring
```bash
# Monitor for 30 minutes post-deployment
# Checks:
# - No spike in error rate (should be < 1%)
# - Response times stable (p50 < 100ms, p99 < 500ms)
# - Database connection pool healthy (< 90 of 100 connections)
# - No memory leaks (RSS memory stable over 10 min)
# - Webhook deliveries flowing (queued jobs processed)
```

---

## Rollback Procedure

### Trigger: When to Rollback
Rollback immediately if ANY of:
- Error rate > 5% for > 2 minutes
- Response time p99 > 2 seconds sustained
- Database unavailable (cannot connect)
- Critical customer-impacting bug observed
- Memory/CPU exhaustion
- API authentication failure

### Rollback Steps
```bash
# Step 1: Enable Maintenance Mode (immediate)
ssh deploy@opsiq-prod-1
sudo systemctl start opsiq-maintenance

# Step 2: Check out previous commit
git checkout main~1  # Previous stable version

# Step 3: Verify code quality of rollback version
npm run build
npx tsc --noEmit
npx prisma validate

# Step 4: Decide on database rollback
# If schema migrations are incompatible with previous version:
  # Option A: Restore from backup (see "Restore Backup" below)
  # Option B: Run down-migration manually
  # Option C: Keep database schema (forward-compatible migrations only)

# For most cases, schema is forward-compatible → keep database
# If database rollback needed: BLOCKED via scripts/restore-database.sh for production (the script refuses production;
# no governed production recovery workflow exists yet — GOVERNED_PRODUCTION_RESTORE_WORKFLOW=DEFERRED). Use Neon
# point-in-time restore per docs/DATABASE_BACKUP_RECOVERY_RUNBOOK.md, or escalate to the owner. Never set
# DATABASE_URL manually to bypass the refusal.

# Step 5: Stop services
systemctl stop opsiq-backend opsiq-api opsiq-worker
sleep 5

# Step 6: Start services with previous code
systemctl start opsiq-api
sleep 3
systemctl start opsiq-backend
sleep 3
systemctl start opsiq-worker

# Step 7: Verify health
curl -s http://localhost:3000/api/health | jq .
# Expected: { "status": "healthy", ... }

# Step 8: Disable Maintenance Mode
systemctl stop opsiq-maintenance

# Step 9: Monitor for 30 minutes
tail -f /var/log/opsiq/api.log | grep -i "error" | head -20
```

### Database Rollback (If Needed)
```bash
# This is DESTRUCTIVE - use only if absolutely necessary

# Step 1: Stop all write operations
systemctl stop opsiq-backend opsiq-worker
# Keep API running for read-only access (during diagnosis)

# Step 2: Create backup of current state (for post-mortem)
./scripts/backup-database.sh /backups/opsiq/rollback-diagnostic.sql.gz verify

# Step 3: Restore from pre-deployment backup — BLOCKED for production via scripts/restore-database.sh (it refuses
# production; GOVERNED_PRODUCTION_RESTORE_WORKFLOW=DEFERRED). Use Neon point-in-time restore per
# docs/DATABASE_BACKUP_RECOVERY_RUNBOOK.md, or escalate to the owner.

# Step 4: Verify restore
psql $DATABASE_URL -c "SELECT COUNT(*) FROM workspaces;" # Should match pre-deployment count
psql $DATABASE_URL -c "SELECT MAX(created_at) FROM audit_events;" # Should match pre-deployment timestamp

# Step 5: Restart services
systemctl start opsiq-backend
systemctl start opsiq-worker

# Step 6: Verify traffic
curl -s http://localhost:3000/api/health | jq .
```

---

## Incident Response

### Incident Severity Levels

| Level | Definition | Response Time | Example |
|-------|-----------|---|---------|
| **P0-CRITICAL** | All users unable to access system | < 5 min | API down, DB unavailable, authentication broken |
| **P1-HIGH** | Feature completely broken, business impact | < 30 min | Audit trail not writing, webhooks not delivering |
| **P2-MEDIUM** | Feature degraded, partial workaround available | < 2 hours | Admin dashboard slow, some errors on edge cases |
| **P3-LOW** | Feature working but suboptimal, no business impact | < 24 hours | Monitoring gap, documentation outdated |

### P0-CRITICAL Response (System Down)

**Immediate Actions (0-5 minutes):**
1. **Declare Incident:** Notify #ops-incident Slack channel
   ```
   @here P0-CRITICAL: [Service] down
   - Symptom: [what users see]
   - Time discovered: [timestamp]
   - Impact: All users / [N]% of users
   - Status: INVESTIGATING
   ```

2. **Assess Cause Quickly (2 min max):**
   ```bash
   # Is API running?
   systemctl status opsiq-api
   curl -s http://localhost:3000/api/health | jq .
   
   # Is database accessible?
   psql $DATABASE_URL -c "SELECT 1;"
   
   # Disk space?
   df -h /data
   
   # Memory/CPU?
   top -b -n 1 | head -20
   
   # Recent errors?
   tail -f /var/log/opsiq/api.log | head -20
   ```

3. **Quick Fix Attempts (3 min max, choose ONE):**
   - **If API not running:** `systemctl start opsiq-api && sleep 5 && curl http://localhost:3000/api/health`
   - **If database down:** Contact database team or check PostgreSQL service: `systemctl status postgresql`
   - **If disk full:** Emergency cleanup: `rm -rf /var/log/opsiq/old-logs/*` (keep current)
   - **If memory leak:** Restart services: `systemctl restart opsiq-api opsiq-backend opsiq-worker`

4. **If Fix Successful:** End incident, communicate to #ops-incident
5. **If Fix Not Successful:** ROLLBACK immediately (see Rollback Procedure above)

**Post-Incident (After System Recovered):**
1. Document root cause
2. Create action item for permanent fix
3. Schedule post-mortem meeting

### P1-HIGH Response (Feature Broken)

**Response Time: < 30 min**

1. **Triage (5 min):**
   - Which feature broken? (audit trail, webhooks, admin dashboard, etc)
   - How many customers affected?
   - Is there a workaround?
   - Was this caused by recent deployment?

2. **Investigate (15 min):**
   ```bash
   # Check service-specific logs
   tail -f /var/log/opsiq/api.log | grep -i "[feature-name]\|error"
   
   # Check database for recent issues
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM audit_events WHERE created_at > now() - interval '1 hour';"
   
   # Check webhook queue
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM webhook_jobs WHERE status='pending' OR status='failed';"
   ```

3. **Remediate (10 min):**
   - If bug in code: ROLLBACK to previous version
   - If data issue: Manual database correction (document steps)
   - If configuration issue: Fix and restart affected service
   - If capacity issue: Scale horizontally or optimize queries

4. **Verify (5 min):**
   ```bash
   curl -s http://localhost:3000/api/[feature-endpoint] | jq .
   # Verify response is not empty, error count is zero
   ```

### P2-MEDIUM Response (Feature Degraded)

**Response Time: < 2 hours**

1. Identify root cause
2. Implement fix without rollback if possible
3. Test in staging first
4. Deploy fix during business hours
5. Monitor for 1 hour post-deployment

---

## Scaling Procedures

### Horizontal Scaling (Add More Servers)

**When to Scale:**
- API response time (p95) exceeds 200ms sustained
- CPU usage > 70% for > 10 minutes
- Memory usage > 80%

**Scale Out Procedure:**
```bash
# Step 1: Provision new server (DevOps/Infrastructure team)
# - Clone existing server image
# - Configure with same DATABASE_URL, secrets
# - Configure load balancer to include new server

# Step 2: Verify new server
ssh deploy@opsiq-prod-new
npm run build
npx tsc --noEmit
systemctl start opsiq-api opsiq-backend opsiq-worker
curl http://localhost:3000/api/health

# Step 3: Add to load balancer
# Update /etc/nginx/nginx.conf or cloud load balancer configuration
upstream opsiq_backend {
  server opsiq-prod-1:3000;
  server opsiq-prod-2:3000;  # NEW
}

# Step 4: Reload load balancer
systemctl reload nginx  # or cloud LB reload

# Step 5: Monitor traffic distribution
# Verify: each server receives ~equal % of requests
```

### Vertical Scaling (Increase Server Resources)

**When Horizontal Scaling Not Viable:**
```bash
# Step 1: Stop service gracefully
systemctl stop opsiq-api opsiq-backend opsiq-worker

# Step 2: Increase memory/CPU (cloud provider UI or hardware upgrade)

# Step 3: Restart services
systemctl start opsiq-api
sleep 3
systemctl start opsiq-backend
sleep 3
systemctl start opsiq-worker

# Step 4: Verify services healthy
curl -s http://localhost:3000/api/health | jq .
```

### Database Scaling (Backup + Restore to Larger Instance)

**When Database Approaching Capacity:**
```bash
# Step 1: Create fresh backup
./scripts/backup-database.sh /backups/opsiq/pre-scale.sql.gz verify

# Step 2: Provision larger database instance (cloud provider)

# Step 3: Restore backup to new instance — scripts/restore-database.sh restores only onto a loopback database
# (OPSIQ_DB_TARGET=local) or an approved staging endpoint (OPSIQ_DB_TARGET=staging); it refuses a new production
# instance (GOVERNED_PRODUCTION_RESTORE_WORKFLOW=DEFERRED). Rehearse locally:
OPSIQ_DB_TARGET=local DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" ./scripts/restore-database.sh /backups/opsiq/pre-scale.sql.gz verify

# Step 4: Run migrations on new instance (if needed)
npx prisma migrate deploy

# Step 5: Verify data integrity
psql $DATABASE_URL -c "SELECT COUNT(*) FROM workspaces;"

# Step 6: Update application DATABASE_URL
# Update: .env.production, systemd service file, etc
systemctl restart opsiq-api opsiq-backend opsiq-worker

# Step 7: Verify connectivity
curl -s http://localhost:3000/api/health | jq .
```

---

## On-Call Responsibilities

### Primary On-Call (Week-Long Rotation)
- **Availability:** 24/7 (or designated timezone)
- **Response Time:** Answer Slack/page within 5 minutes (P0), 15 min (P1)
- **Authority:** Can deploy fixes, rollback, restart services, make manual DB corrections
- **Escalation:** See escalation matrix below

### Secondary On-Call (Week-Long Rotation)
- **Availability:** Business hours + 1 hour after hours
- **Response Time:** 30 min for P0, 1 hour for P1
- **Authority:** Same as primary, called in for complex incidents

### Handoff (Every Friday @ 4 PM)
```bash
# Outgoing on-call:
1. Brief incoming on-call on current issues (if any)
2. Transfer ownership of active incidents
3. Provide access credentials (if needed)
4. Confirm incoming understands escalation paths

# Incoming on-call:
1. Confirm receipt of handoff
2. Verify access to all systems
3. Review on-call guide (this document)
4. Post in #ops-incident: "On-call shift started for [name]"
```

---

## Escalation Matrix

### When to Escalate

| Situation | Escalate To | Time | Authority |
|-----------|------------|------|-----------|
| Cannot diagnose P0 within 5 min | Engineering Lead | Immediately | Can make any decision to restore service |
| Database corrupted (data loss likely) | Database Admin + Engineering Lead | Immediately | Authority to restore backups, declare data loss |
| Customer data breach suspected | Security Lead + CTO | Immediately | Authority to notify customers, regulatory bodies |
| Deployment keeps failing (> 2 rollbacks) | Deployment Lead | After 2nd rollback | Authority to freeze deployments, investigate CI/CD |
| Cannot reach database | Infrastructure Team | Immediately | Authority to restart DB, failover to replica |
| Out of disk space (> 90% full) | Infrastructure Team | Immediately | Authority to expand disks, delete old logs |

### Escalation Call Tree

**Primary On-Call:** [Phone: +1-555-0100, Slack: @oncall-primary]

If no response in 5 min:

**Engineering Lead:** [Phone: +1-555-0101, Slack: @eng-lead]

If no response in 5 min:

**CTO:** [Phone: +1-555-0102, Slack: @cto]

---

## Key Contacts

| Role | Name | Phone | Email | Slack |
|------|------|-------|-------|-------|
| DevOps Lead | [Name] | +1-555-0110 | devops@company.com | @devops-lead |
| Database Admin | [Name] | +1-555-0111 | dba@company.com | @dba |
| Security Lead | [Name] | +1-555-0112 | security@company.com | @security-lead |
| Engineering Lead | [Name] | +1-555-0101 | eng@company.com | @eng-lead |
| CTO | [Name] | +1-555-0102 | cto@company.com | @cto |

---

## Useful Commands Reference

```bash
# Check service status
systemctl status opsiq-api opsiq-backend opsiq-worker

# View recent logs
journalctl -u opsiq-api -n 50 -f

# Check database connectivity
psql $DATABASE_URL -c "SELECT version();"

# Health check
curl -s http://localhost:3000/api/health | jq .

# Backup database
./scripts/backup-database.sh /backups/opsiq verify

# Restore from backup (local / disposable server only — the script refuses production)
OPSIQ_DB_TARGET=local DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" ./scripts/restore-database.sh /backups/opsiq/opsiq_backup_YYYY-MM-DD_HH-MM-SS.sql.gz verify

# Check disk space
df -h /data /backups

# Check memory/CPU
top -b -n 1

# Verify database connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Count pending webhooks
psql $DATABASE_URL -c "SELECT COUNT(*) FROM webhook_jobs WHERE status='pending';"
```

---

**Last Updated:** 2026-05-12  
**Version:** 1.0  
**Review Schedule:** Quarterly  
**Owner:** DevOps Team
