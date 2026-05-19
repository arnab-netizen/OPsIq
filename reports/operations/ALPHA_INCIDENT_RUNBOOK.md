# OpsIQ Alpha: Incident Response Runbook

**Purpose**: Recovery procedures for alpha deployment incidents  
**Audience**: DevOps engineer, team lead, support engineer  
**Urgency**: All incidents must be actionable within documented timeframes  
**Scope**: Startup failures, data corruption, operator lockout, rollback scenarios

---

## INCIDENT CATEGORIES

| Category | Severity | Response Time | Owner |
|----------|----------|----------------|-------|
| Startup Failure | CRITICAL | 5 min | DevOps |
| DB Connection Error | CRITICAL | 5 min | DevOps |
| Operator Lockout | HIGH | 15 min | Support |
| Session Corruption | HIGH | 15 min | Support |
| Stalled Action | MEDIUM | 30 min | Support |
| Readiness Enforcement Failure | CRITICAL | 5 min | DevOps |
| Audit Trail Break | CRITICAL | Immediate | DevOps |
| Data Corruption | CRITICAL | Immediate | DevOps |

---

## INCIDENT 1: Startup Failure

**Symptoms**:
- Application process dies on startup
- Health check never responds
- Port 3001 not listening

**Diagnosis**:

```bash
# Check if process is running
ps aux | grep "node.*alpha"

# Check logs
tail -100 /tmp/alpha-server.log

# Look for specific errors
grep -E "ERROR|FATAL" /tmp/alpha-server.log | head -20

# Check dependencies
psql -h localhost -U opsiq -d opsiq-alpha -c "SELECT 1"
redis-cli -h localhost ping
```

**Common Causes & Fixes**:

### Cause 1: Database Not Ready

**Symptom**: Logs show "ECONNREFUSED" to postgres

**Fix**:
```bash
# Start database
docker compose -f docker-compose.alpha.yml up -d postgres

# Wait for readiness
sleep 10

# Verify
psql -h localhost -U opsiq -d opsiq-alpha -c "SELECT 1"

# Retry app startup
npm run dev &
```

**Prevention**: Run `alpha-verify.sh` before deploying

---

### Cause 2: Migration Failed

**Symptom**: Logs show "migration error" or "schema mismatch"

**Fix**:
```bash
# Roll back schema to known state
npm run db:migrate:rollback

# Verify rollback succeeded
psql -h localhost -U opsiq -d opsiq-alpha -c "\dt" | wc -l

# Re-run migrations carefully
npm run db:migrate --verbose

# If that fails, full restore
./scripts/alpha-rollback.sh
```

---

### Cause 3: Missing Environment Variable

**Symptom**: Logs show "undefined environment variable X"

**Fix**:
```bash
# Check .env files
ls -la .env*

# Verify required variables
grep "DATABASE_URL\|REDIS_URL\|SECRET_KEY" .env.local

# If missing, restore
cp .env.example .env.local
# Edit with real values
nano .env.local

# Retry
npm run dev &
```

---

### Cause 4: Port Already in Use

**Symptom**: Error "EADDRINUSE" port 3001

**Fix**:
```bash
# Find what's using port 3001
lsof -i :3001

# Kill the process (note PID)
kill -9 <PID>

# Retry startup
npm run dev &
```

---

### Cause 5: Out of Memory

**Symptom**: Logs show "OOM" or process exits silently

**Fix**:
```bash
# Check available memory
free -h

# Increase Node memory allocation
NODE_MEMORY=2048 npm run dev &

# Or restart system
docker compose -f docker-compose.alpha.yml restart

# Retry
./scripts/alpha-startup.sh
```

---

**Resolution Time**: 5-15 minutes  
**Escalation**: If fails after all checks, escalate to engineering team

---

## INCIDENT 2: Database Connection Error

**Symptoms**:
- Queries hang / timeout
- "connection refused" in logs
- Readiness check shows "database unreachable"

**Diagnosis**:

```bash
# Check if postgres is running
docker ps | grep postgres

# Check connection
psql -h localhost -U opsiq -d opsiq-alpha -c "SELECT version()"

# Check connection pool
psql -h localhost -U opsiq -d opsiq-alpha -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname"

# Check disk space
df -h /var/lib/postgresql
```

**Common Causes & Fixes**:

### Cause 1: PostgreSQL Service Stopped

**Fix**:
```bash
docker compose -f docker-compose.alpha.yml up -d postgres
sleep 5
psql -h localhost -U opsiq -d opsiq-alpha -c "SELECT 1"
```

---

### Cause 2: Connection Pool Exhausted

**Symptom**: "No more connections available"

**Fix**:
```bash
# Check active connections
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT datname, count(*) FROM pg_stat_activity 
  WHERE state = 'active' 
  GROUP BY datname
"

# Kill idle connections
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT pg_terminate_backend(pid) 
  FROM pg_stat_activity 
  WHERE state = 'idle' 
  AND query_start < NOW() - INTERVAL '30 minutes'
"

# Restart application to reset pool
pkill -f "node.*alpha"
npm run dev &
```

---

### Cause 3: Disk Full

**Fix**:
```bash
# Check disk usage
du -sh /var/lib/postgresql/*

# Clean old logs
rm -f /var/log/postgresql/*.log.*

# Remove old backups (keep last 3)
ls -t /backups/ | tail -n +4 | xargs rm -f

# If still full, require cleanup
```

---

**Resolution Time**: 5-10 minutes  
**Escalation**: If not resolvable, may need database restoration

---

## INCIDENT 3: Operator Lockout

**Symptoms**:
- Operator can't log in
- "Invalid credentials" repeated
- Session won't persist

**Diagnosis**:

```bash
# Check if operator exists
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT email, id, created_at FROM operators 
  WHERE email = 'alpha-lead@internal.test'
"

# Check if operator has workspace membership
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT o.email, w.name FROM operators o
  JOIN workspace_memberships wm ON wm.operator_id = o.id
  JOIN workspaces w ON w.id = wm.workspace_id
  WHERE o.email = 'alpha-lead@internal.test'
"

# Check sessions
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT id, expires_at FROM sessions 
  WHERE operator_id = (SELECT id FROM operators WHERE email = 'alpha-lead@internal.test')
  ORDER BY created_at DESC
"
```

**Cause 1: Operator Account Deleted**

**Fix**:
```bash
# Re-create operator account
psql -h localhost -U opsiq -d opsiq-alpha << 'EOF'
INSERT INTO operators (id, email, name, is_internal_alpha) VALUES
  (gen_random_uuid(), 'alpha-lead@internal.test', 'Sarah Chen', true);
EOF

# Re-add to workspaces
psql -h localhost -U opsiq -d opsiq-alpha << 'EOF'
INSERT INTO workspace_memberships (workspace_id, operator_id, role) 
SELECT w.id, o.id, 'owner'
FROM workspaces w, operators o
WHERE w.is_alpha = true AND o.email = 'alpha-lead@internal.test'
ON CONFLICT DO NOTHING;
EOF

# Operator can now log in
```

---

**Cause 2: Session Expired**

**Fix**:
```bash
# Delete old expired sessions
psql -h localhost -U opsiq -d opsiq-alpha -c "
  DELETE FROM sessions 
  WHERE expires_at < NOW()
"

# Operator logs in fresh
```

---

**Cause 3: Password Reset Required**

**Fix**:
```bash
# Generate fresh login link
npm run ops:send-signin-link -- --email alpha-lead@internal.test

# Operator receives email, clicks link
```

---

**Resolution Time**: 5 minutes  
**Operator Impact**: 5-10 minutes (until email received and link clicked)

---

## INCIDENT 4: Session Corruption

**Symptoms**:
- Operator reports "workspace disappeared"
- "Workspace context invalid" error
- Queue shows wrong data
- Session switches between workspaces unexpectedly

**Diagnosis**:

```bash
# Check session state
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT id, operator_id, workspace_id, created_at, expires_at
  FROM sessions
  WHERE operator_id = (SELECT id FROM operators WHERE email = 'alpha-lead@internal.test')
  ORDER BY created_at DESC LIMIT 5
"

# Check if workspace membership is consistent
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT DISTINCT w.id, w.name
  FROM workspaces w
  JOIN workspace_memberships wm ON wm.workspace_id = w.id
  WHERE wm.operator_id = (SELECT id FROM operators WHERE email = 'alpha-lead@internal.test')
"
```

**Fix**:

```bash
# Option 1: Delete corrupted session (operator logs in fresh)
psql -h localhost -U opsiq -d opsiq-alpha -c "
  DELETE FROM sessions
  WHERE operator_id = (SELECT id FROM operators WHERE email = 'alpha-lead@internal.test')
  AND expires_at > NOW()
"

# Operator logs out and logs in again
# New session will be created with correct workspace context
```

---

**Resolution Time**: 2 minutes  
**Operator Impact**: 1 minute (logout/login)

---

## INCIDENT 5: Readiness Enforcement Failure

**Symptoms**:
- Readiness check returns "not_ready" unexpectedly
- New operators can't access system (blocked with 503)
- System seems stuck before all services ready

**Diagnosis**:

```bash
# Check readiness status
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT * FROM system_readiness ORDER BY updated_at DESC LIMIT 1
"

# Check if blocking services are running
npm run ops:health-check

# Check readiness log
grep -i readiness /tmp/alpha-server.log | tail -20
```

**Cause 1: Database Not Fully Initialized**

**Fix**:
```bash
# Ensure migrations completed
npm run db:migrate --verbose

# Ensure seeding completed
npm run db:seed:alpha --verbose

# Set readiness manually (if sure all systems are ready)
psql -h localhost -U opsiq -d opsiq-alpha -c "
  UPDATE system_readiness SET status = 'ready', updated_at = NOW()
"
```

---

**Cause 2: Dependency Service Failed**

**Fix**:
```bash
# Check all services
docker compose -f docker-compose.alpha.yml ps

# If any are down, restart
docker compose -f docker-compose.alpha.yml up -d

# Re-check readiness
npm run ops:health-check
```

---

**Resolution Time**: 5 minutes  
**Operator Impact**: Cannot access system until resolved

---

## INCIDENT 6: Data Corruption (CRITICAL)

**Symptoms**:
- Audit trail hash breaks
- Actions show impossible state changes
- Duplicate actions detected (shouldn't be possible)
- Operator data mismatch with audit log

**Diagnosis** (DO THIS IMMEDIATELY):

```bash
# Check audit chain integrity
npm run ops:verify-audit-chain

# If it fails, get the location
npm run ops:verify-audit-chain --verbose

# Check for impossible state
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT id, status, updated_at FROM actions
  WHERE workspace_id = (SELECT id FROM workspaces WHERE is_alpha LIMIT 1)
  ORDER BY updated_at
  LIMIT 20
"

# Check for duplicates (shouldn't exist)
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT idempotency_key, COUNT(*) FROM actions
  GROUP BY idempotency_key
  HAVING COUNT(*) > 1
"
```

**Fix (EMERGENCY ROLLBACK)**:

```bash
# STOP: Do not make any more mutations
pkill -f "node.*alpha"

# ISOLATE: Take staging offline
docker compose -f docker-compose.alpha.yml down

# RESTORE: Restore from backup
./scripts/alpha-rollback.sh

# VERIFY: Check integrity
npm run ops:verify-audit-chain

# COMMUNICATE: Notify all operators
# "System had issue, restored from backup. You may need to re-do recent actions."

# INVESTIGATE: Preserve logs for analysis
cp /tmp/alpha-server.log /backups/incident-$(date +%s).log
```

---

**Resolution Time**: 10-15 minutes  
**Operator Impact**: Loss of recent actions (since last backup)  
**Escalation**: Immediate investigation required, not just recovery

---

## INCIDENT 7: Stalled Action (>30 min stuck)

**Symptoms**:
- Operator action is "in_progress" for >30 minutes
- Operator cannot retry or move forward
- Automated alert triggered

**Diagnosis**:

```bash
# Find stalled action
psql -h localhost -U opsiq -d opsiq-alpha -c "
  SELECT id, name, operator_id, created_at, status
  FROM actions
  WHERE status = 'in_progress'
  AND created_at < NOW() - INTERVAL '30 minutes'
"

# Check logs for why it stalled
grep -i "action.*\[ID\]" /tmp/alpha-server.log | tail -20

# Check if any errors were logged
grep ERROR /tmp/alpha-server.log | grep -i action | tail -10
```

**Fix**:

```bash
# Option 1: If network timeout, retry
# Operator clicks retry button (will work now)

# Option 2: If truly stuck, support can reset
psql -h localhost -U opsiq -d opsiq-alpha -c "
  UPDATE actions SET status = 'ready'
  WHERE id = '[action_id]' AND status = 'in_progress'
"

# Operator can now retry or proceed

# Option 3: If action is actually done, mark complete
psql -h localhost -U opsiq -d opsiq-alpha -c "
  UPDATE actions SET status = 'completed', completed_at = NOW()
  WHERE id = '[action_id]'
"

# Operator sees action marked done
```

---

**Resolution Time**: 3-5 minutes  
**Operator Impact**: 2 minutes (reset + retry)

---

## INCIDENT 8: Rollback Needed (Non-Emergency)

**Symptoms**:
- New feature introduced a bug
- Want to revert to known good state
- Have time to plan (not emergency)

**Procedure**:

```bash
# 1. Coordinate with team
# "Rolling back alpha to version X at YZ time. Operators: don't log in 3-5 min"

# 2. Stop accepting new requests
# Set "alpha maintenance mode" (API returns 503 with message)

# 3. Wait for in-flight requests to complete
sleep 30

# 4. Perform rollback
./scripts/alpha-rollback.sh

# 5. Verify
./scripts/alpha-verify.sh

# 6. Re-enable
# Remove maintenance mode

# 7. Notify operators
# "System rolled back to X. All recent actions since Y are undone."
```

---

**Resolution Time**: 10-15 minutes  
**Operator Impact**: 10 minutes downtime

---

## INCIDENT RESPONSE CHECKLIST

### For All Incidents

```
[ ] Identify incident type (use categories above)
[ ] Assess severity (CRITICAL / HIGH / MEDIUM / LOW)
[ ] Check if operator actions are impacted
[ ] Begin diagnosis using steps in this runbook
[ ] Identify root cause
[ ] Execute recommended fix
[ ] Verify fix worked (run ./scripts/alpha-verify.sh)
[ ] Communicate status to team
[ ] Document what happened for post-incident review
[ ] Monitor for 10 minutes to ensure stability
```

### For CRITICAL Incidents

```
[ ] Declare incident immediately
[ ] Stop any further changes
[ ] Focus on restore-not-fix (if needed)
[ ] Notify team lead immediately
[ ] Run diagnostics in /backups/incident-[timestamp].log
[ ] Don't investigate root cause during incident (do after)
[ ] Get system operational first, understand later
```

### For HIGH Incidents

```
[ ] Diagnose issue (use troubleshooting steps)
[ ] Execute fix (documented in this runbook)
[ ] Verify fix
[ ] Alert team (Slack #ops-alpha-team)
[ ] Document steps taken
[ ] Monitor for stability
```

---

## COMMUNICATION TEMPLATES

### Template 1: Incident Occurred

```
🚨 ALPHA INCIDENT

Type: [Incident type]
Severity: [CRITICAL / HIGH / MEDIUM]
Status: Investigating
Impact: [Operator impacts, if any]
ETA: [Estimated time to resolve]

Next update: [time]
```

---

### Template 2: Incident Resolved

```
✅ ALPHA INCIDENT RESOLVED

Type: [Incident type]
Cause: [What caused it]
Resolution: [What we did]
Data Loss: [None / [amount] / TBD]
Operator Action: [Logout/login / Refresh / Try again]

Post-incident review scheduled for [time]
```

---

## Escalation Path

| Severity | Response | Escalate To |
|----------|----------|-------------|
| CRITICAL | 5 min | Team Lead + Engineering |
| HIGH | 15 min | Team Lead |
| MEDIUM | 30 min | Support Engineer |
| LOW | 1 hour | Support Engineer |

---

**Incident Runbook Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR DEPLOYMENT

All documented incidents are actionable within response time windows.
