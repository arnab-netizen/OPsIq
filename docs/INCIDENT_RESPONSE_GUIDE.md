# OpsIQ Incident Response Guide

**Last Updated:** 2026-05-12  
**Version:** 1.0  
**Incident Lead:** DevOps Team  
**Page On-Call:** Use escalation tree in DEPLOYMENT_RUNBOOK.md

---

## Table of Contents

1. [Incident Severity Classification](#incident-severity-classification)
2. [First Response (0-5 minutes)](#first-response-0-5-minutes)
3. [Incident Investigation (5-30 minutes)](#incident-investigation-5-30-minutes)
4. [Resolution Paths](#resolution-paths)
5. [Common Incidents & Quick Fixes](#common-incidents--quick-fixes)
6. [Post-Incident Procedures](#post-incident-procedures)
7. [Escalation Paths](#escalation-paths)

---

## Incident Severity Classification

### P0-CRITICAL (All users affected, service down)
**Response SLA:** 5 min | **Resolution SLA:** 30 min

**Examples:**
- API server not responding
- Database connection lost
- Authentication system broken
- All workspaces unable to access system

**Response:**
1. Page on-call immediately
2. Declare incident in #ops-incident Slack
3. Enable maintenance mode
4. Investigate root cause in parallel
5. Attempt quick fix or ROLLBACK

### P1-HIGH (Feature completely broken, business impact)
**Response SLA:** 15 min | **Resolution SLA:** 2 hours

**Examples:**
- Audit trail not recording events
- Webhooks not delivering
- Admin dashboard returning 500 errors
- Workspace members cannot be added

**Response:**
1. Notify #ops-incident with details
2. Investigate root cause
3. Fix or rollback
4. Verify fix works
5. Monitor for 1 hour

### P2-MEDIUM (Feature degraded, partial workaround)
**Response SLA:** 1 hour | **Resolution SLA:** 8 hours

**Examples:**
- Admin dashboard slow (> 2s response time)
- Occasional webhook delivery failures
- Some users see 5% error rate
- Report generation takes 2x longer than normal

**Response:**
1. Acknowledge in ticket
2. Investigate during business hours
3. Deploy fix during low-traffic window
4. Monitor for 2 hours

### P3-LOW (Minor issue, no user impact)
**Response SLA:** 4 hours | **Resolution SLA:** 48 hours

**Examples:**
- Documentation error
- Monitoring gap (not actively impacting)
- Minor UI glitch on edge case
- Deprecated code still present

**Response:**
1. File ticket
2. Prioritize for sprint planning
3. Fix during normal development

---

## First Response (0-5 minutes)

### Step 1: Receive Alert (0-1 min)
**Sources:**
- PagerDuty alert → on-call phone page
- Slack #ops-alert message
- Customer report via support email
- Internal user notification

**Action:**
```
1. Acknowledge receipt (page, Slack reaction, email reply)
2. Note: incident time, symptom, affected users (if known)
3. Open: notepad or ticket for documentation
```

### Step 2: Declare Incident (1-2 min)
**Post to #ops-incident Slack:**
```
@here INCIDENT DECLARED

🚨 [P0/P1/P2] [Service Name] - [Symptom]

Symptom: What users/systems are experiencing
Time: When discovered
Scope: All users / [N] workspaces / [%] of traffic
Status: INVESTIGATING

On-Call: @me
Incident #: [ticket-id]
```

### Step 3: Quick Diagnosis (2-5 min)
```bash
# Check service health
curl -s http://localhost:3000/api/health | jq .

# Is API running?
systemctl status opsiq-api

# Is database accessible?
psql $DATABASE_URL -c "SELECT 1;"

# Recent error logs?
tail -100 /var/log/opsiq/api.log | grep -i "error\|exception"

# Disk space?
df -h | grep -E "data|backup"

# Memory/CPU?
free -h && top -b -n 1 | head -5
```

**Outcome Options:**
- **Option A:** Root cause identified → Go to Step 4 (Fix)
- **Option B:** Cannot diagnose within 5 min → Go to Escalation (Step 6)

### Step 4: Attempt Quick Fix (3-5 min, if root cause found)
**Choose ONE based on root cause:**

**A. Service not running:**
```bash
systemctl start opsiq-api
systemctl start opsiq-backend
systemctl start opsiq-worker
sleep 5
curl -s http://localhost:3000/api/health | jq .
```

**B. Database connection lost:**
```bash
# Check if database is running
psql $DATABASE_URL -c "SELECT 1;"

# If error: "could not connect"
# Contact database team (see DEPLOYMENT_RUNBOOK.md escalation)
```

**C. Memory/CPU maxed:**
```bash
# Restart to clear memory
systemctl restart opsiq-api opsiq-backend opsiq-worker
sleep 10
curl -s http://localhost:3000/api/health | jq .
```

**D. Disk full:**
```bash
# Emergency cleanup
rm -rf /var/log/opsiq/old-logs/*
# Then deploy permanent fix (logging truncation, log rotation)
```

**E. Recent deployment caused issue:**
```bash
# ROLLBACK (see DEPLOYMENT_RUNBOOK.md)
git checkout main~1
npm run build
systemctl stop opsiq-api opsiq-backend opsiq-worker
sleep 5
systemctl start opsiq-api
sleep 3
systemctl start opsiq-backend
systemctl start opsiq-worker
sleep 5
curl -s http://localhost:3000/api/health | jq .
```

### Step 5: Verify Fix (1 min)
**If quick fix applied:**
```bash
# Health check
curl -s http://localhost:3000/api/health | jq .

# Check error logs (should be empty or low)
tail -50 /var/log/opsiq/api.log | grep -i "error" | wc -l

# End user test (if applicable)
curl -s -H "Authorization: Bearer $TEST_TOKEN" \
  http://localhost:3000/api/admin/audit-log | jq . | head -5
```

**If fix successful:**
1. Update #ops-incident: "INCIDENT RESOLVED - [root cause] [fix applied]"
2. Set up monitoring for 30 minutes
3. Proceed to "Post-Incident Procedures"

**If fix unsuccessful:**
1. Undo changes
2. Escalate immediately (Step 6)

### Step 6: Escalate (If Not Fixed Within 5 min)
```
Current status: INVESTIGATING, no resolution yet
Escalating to: [next person in escalation tree]

Details for handoff:
- Attempted fixes: [list what was tried]
- Root cause hypothesis: [if any]
- Critical context: [relevant logs, metrics, recent changes]
```

**See DEPLOYMENT_RUNBOOK.md for escalation phone tree.**

---

## Incident Investigation (5-30 minutes)

### Check These Systems in Order

**1. Application Logs**
```bash
tail -f /var/log/opsiq/api.log

# Filter for errors
grep -i "error\|exception\|fatal" /var/log/opsiq/api.log | tail -20

# Filter for specific feature (if issue is feature-specific)
grep -i "audit\|webhook\|admin" /var/log/opsiq/api.log | tail -20
```

**2. System Metrics**
```bash
# CPU and memory
top -b -n 1 | head -20

# Disk usage
df -h
du -sh /data /backups /var/log

# Network
netstat -tulpn | grep LISTEN
```

**3. Database**
```bash
# Connection count
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Recent slow queries (if applicable)
psql $DATABASE_URL -c "SELECT query, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"

# Table sizes (if disk is full)
psql $DATABASE_URL -c "SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) FROM pg_tables ORDER BY pg_total_relation_size DESC LIMIT 10;"
```

**4. Application-Specific Checks**

**If Issue is Audit Trail:**
```bash
# Check if audit events are being written
psql $DATABASE_URL -c "SELECT COUNT(*) FROM audit_events WHERE created_at > now() - interval '5 minutes';"

# Check for database constraints
psql $DATABASE_URL -c "SELECT * FROM information_schema.constraint_column_usage WHERE table_name = 'audit_events';"
```

**If Issue is Webhooks:**
```bash
# Check pending/failed webhook jobs
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM webhook_jobs GROUP BY status;"

# Check most recent failed job
psql $DATABASE_URL -c "SELECT * FROM webhook_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 1;"
```

**If Issue is Admin Dashboard:**
```bash
# Check admin route accessibility
curl -v -H "Authorization: Bearer $SYSTEM_ADMIN_TOKEN" \
  http://localhost:3000/api/admin/workspaces 2>&1 | head -20

# Check database permissions (if applicable)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM workspaces;" # Should not error
```

### Document Findings
Create timeline:
```
[Time] Action taken / Finding observed
[T+2min] Page received at 14:32:15 UTC
[T+3min] Curl health check shows API responding
[T+5min] Check logs: ERROR "Database connection lost" at 14:30:12
[T+7min] Verify database: psql connects successfully, last 5 queries succeeded
[T+10min] Hypothesis: transient connection spike, recovered by 14:31:00
[T+12min] Verify: no errors in last 2 minutes, traffic normal
```

---

## Resolution Paths

### Path 1: Code Bug (Deploy Fix)
1. Identify offending code
2. Write fix locally
3. Test locally
4. Push to main (through PR if time allows, direct merge if P0)
5. GitHub Actions CI runs automatically
6. Wait for CI to pass
7. Deploy via standard deployment process

**Timeline:** 15-45 minutes depending on code complexity

### Path 2: Rollback (Revert Recent Deployment)
1. Identify problematic commit/deployment
2. Revert to previous stable version (see DEPLOYMENT_RUNBOOK.md)
3. Verify health
4. Root cause analysis in parallel

**Timeline:** 5-10 minutes

### Path 3: Configuration Fix
1. Identify configuration issue
2. Update environment variable, systemd config, etc
3. Restart affected service
4. Verify health

**Timeline:** 3-5 minutes

### Path 4: Database Correction (Manual)
1. Identify corrupted/missing data
2. Write corrective SQL
3. Test on replica or backup first
4. Apply to production
5. Verify data integrity

**Timeline:** 15-30 minutes, requires Database Admin

### Path 5: Infrastructure Scaling
1. Identify capacity issue
2. Provision additional resources
3. Update load balancer
4. Verify traffic distribution

**Timeline:** 10-30 minutes depending on provisioning time

---

## Common Incidents & Quick Fixes

### Incident: API Server Not Responding

**Symptoms:**
- `curl http://localhost:3000/api/health` returns connection refused
- Service shows as "inactive" in systemctl

**Quick Fix:**
```bash
systemctl start opsiq-api
sleep 5
curl -s http://localhost:3000/api/health | jq .
```

**If Still Down:**
- Check logs: `journalctl -u opsiq-api -n 50`
- Look for: "port already in use", "out of memory", "permission denied"
- If port conflict: `lsof -i :3000` (find process, kill if not opsiq)
- If memory issue: restart all services
- If permission: check file ownership, restart

**Escalate if:**
- Still not starting after restart
- Logs show unknown error
- Restarting causes immediate crash

---

### Incident: Database Connection Lost

**Symptoms:**
- Logs show "ECONNREFUSED" or "unable to connect"
- `psql $DATABASE_URL` fails with connection error

**Quick Fix:**
```bash
# Check if database is running
systemctl status postgresql

# If not running
systemctl start postgresql
sleep 10

# Verify connection
psql $DATABASE_URL -c "SELECT 1;"
```

**If Still Down:**
- Check database logs: `/var/log/postgresql/postgresql.log`
- Check disk space: `df -h /data` (if full, may have crashed)
- Restart database: `systemctl restart postgresql`

**Escalate to Database Admin if:**
- Database won't start
- Disk is full
- Corruption suspected (check `pg_dump`)

---

### Incident: Audit Events Not Recording

**Symptoms:**
- API returns 500 on audit-log query
- Audit event count not increasing: `SELECT COUNT(*) FROM audit_events WHERE created_at > now() - interval '5 min';` returns 0

**Quick Fix:**
```bash
# Check if audit_events table exists and is writable
psql $DATABASE_URL -c "INSERT INTO audit_events (workspace_id, actor_id, action, entity_type) VALUES ('test', 'test', 'TEST', 'test');"

# Should return: INSERT 0 1
# If error: permission denied, quota exceeded, or disk full
```

**If Permission Denied:**
- Verify PostgreSQL user has INSERT privilege on audit_events
- Restart application: `systemctl restart opsiq-api`

**If Disk Full:**
- Clean old logs: `rm -rf /var/log/opsiq/old-logs/*`
- Or: backup and rotate audit logs (permanent fix needed)

**Escalate to Database Admin if:**
- Table is corrupted
- Cannot write due to unknown error

---

### Incident: Memory Leak (Service Consuming 90%+ Memory)

**Symptoms:**
- `free -h` shows available memory < 1GB
- `top` shows opsiq-api using > 80% of system memory
- Response times degrading over hours

**Quick Fix:**
```bash
systemctl restart opsiq-api opsiq-backend opsiq-worker
sleep 10
curl -s http://localhost:3000/api/health | jq .
```

**If Memory Still Growing:**
- Identify which service is leaking: `top` and sort by %MEM
- Check logs for repeated allocations: `journalctl -u opsiq-api -n 200 | grep -i "memory\|alloc"`
- Restart that specific service only

**Escalate to Engineering if:**
- Problem recurs within 1 hour (likely code bug)
- Happens after recent deployment (rollback)

---

### Incident: Disk Full (> 95%)

**Symptoms:**
- `df -h` shows partition > 95% full
- Application may crash: "no space left on device"
- Logs may stop being written

**Quick Fix:**
```bash
# Emergency cleanup (in priority order)
rm -rf /var/log/opsiq/old-logs/*  # Usually 10-50GB
rm -rf /tmp/*                      # Usually 1-5GB
systemctl restart opsiq-api        # Clear memory-mapped files if applicable
```

**If Still Full:**
```bash
# Identify what's consuming space
du -sh /data/* /var/log/* /backups/*

# If /data is full: check database table sizes (see Investigation section)
# If /backups is full: delete old backups (keep minimum 5 most recent)
```

**Escalate to Infrastructure if:**
- Unable to free space
- Need to expand disk partition

---

### Incident: High Error Rate (> 5% after deployment)

**Symptoms:**
- Logs show errors: `curl -s http://localhost:3000/api/health | jq .error_rate` > 0.05
- User reports: "most of my requests are failing"

**Quick Diagnosis:**
```bash
# What errors?
tail -1000 /var/log/opsiq/api.log | grep -i "error" | cut -d' ' -f5-10 | sort | uniq -c | sort -rn | head -10

# When did it start?
grep -n "error" /var/log/opsiq/api.log | head -5  # Check timestamps
```

**Quick Fix (if from recent deployment):**
```bash
# ROLLBACK (see DEPLOYMENT_RUNBOOK.md)
git checkout main~1
npm run build
systemctl stop opsiq-api opsiq-backend opsiq-worker
sleep 5
systemctl start opsiq-api
sleep 3
systemctl start opsiq-backend
systemctl start opsiq-worker

# Verify
sleep 10
tail -100 /var/log/opsiq/api.log | grep -i "error" | wc -l  # Should be 0 or low
```

**If Not from Recent Deployment:**
- Likely data issue (corrupted database state)
- Escalate to Database Admin for investigation

---

## Post-Incident Procedures

### Step 1: Declare Incident Resolved (5 min)
**Post to #ops-incident:**
```
✅ INCIDENT RESOLVED

Issue: [original symptom]
Root Cause: [what was actually wrong]
Fix Applied: [what was done to fix it]
Detection Time: [T+X min]
Resolution Time: [T+Y min]

Monitoring: Continuing for 30 minutes
Post-Mortem: [link to ticket] - scheduled for [date/time]
```

### Step 2: Continuous Monitoring (30 min)
```bash
# Monitor every 5 minutes for first 30 min
watch -n 5 'curl -s http://localhost:3000/api/health | jq .'

# Check error rate
watch -n 5 'tail -20 /var/log/opsiq/api.log | grep -i "error" | wc -l'

# Alert if error rate rises again
```

### Step 3: Create Post-Mortem Ticket
**File ticket with:**
- **Title:** Incident: [Service] [Symptom] [Date]
- **Description:** 
  - Timeline (what happened, when)
  - Root cause (why it happened)
  - Resolution (how it was fixed)
  - Impact (how many users, how long)
  - Prevention (how to prevent next time)

### Step 4: Schedule Post-Mortem Meeting
- **Attendees:** On-call (who resolved), Engineering Lead, affected team
- **Duration:** 30-45 minutes
- **Within:** 24 hours of incident (sooner if P0)
- **Topics:**
  - Timeline review
  - Root cause deep dive
  - Action items (code fix, monitoring, documentation, training)
  - Owner assignment for action items

### Step 5: Implement Preventive Measures
**Before incident:** None  
**After incident:** At least 1 of:
- Add monitoring/alert to catch earlier
- Add test case to prevent regression
- Code fix to address root cause
- Documentation update to help next on-call

**Track in Jira:** Link from post-mortem ticket to implementation ticket

---

## Escalation Paths

### Phone Tree (Use only for P0)
1. Try to reach **Primary On-Call** (5 min timeout)
2. If no answer: try **Secondary On-Call** (5 min timeout)
3. If no answer: try **Engineering Lead** (5 min timeout)
4. If no answer: try **CTO** (page via PagerDuty)

### Slack Escalation (Use for P1-P2)
1. `@oncall-primary` - On-call responsibility
2. `@eng-lead` - Engineering guidance
3. `@database-admin` - Database-specific issues
4. `@security-lead` - Security-related issues

### When to Escalate
| Situation | Escalate | Time |
|-----------|----------|------|
| Cannot diagnose root cause within 5 min | Engineering Lead | Immediately |
| Data loss occurred or suspected | Database Admin + CTO | Immediately |
| Security breach suspected | Security Lead | Immediately |
| Multiple rollbacks needed | Engineering Lead | After 1st rollback |
| Production database down | Database Admin | Immediately |

---

**Last Updated:** 2026-05-12  
**Version:** 1.0  
**Review Schedule:** Quarterly  
**Owner:** DevOps Team
