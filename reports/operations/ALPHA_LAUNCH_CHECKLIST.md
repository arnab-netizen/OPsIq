# OpsIQ Alpha: Launch Checklist

**Purpose**: Step-by-step verification before internal alpha goes live  
**Timeline**: 2-3 hours before operators access system  
**Owner**: DevOps engineer + Team lead  
**Success Criteria**: All items checked ✓, GREEN status for deployment

---

## PRE-LAUNCH CHECKLIST (T-3 HOURS)

### Phase 1: Environment Validation (30 min)

#### Infrastructure
- [ ] Docker services running
  ```bash
  docker compose -f docker-compose.alpha.yml ps
  # Expected: All services UP
  ```

- [ ] Database accessible
  ```bash
  psql -h localhost -U opsiq -d opsiq-alpha -c "SELECT version();"
  # Expected: Success
  ```

- [ ] Redis accessible
  ```bash
  redis-cli -h localhost ping
  # Expected: PONG
  ```

- [ ] Disk space adequate (>10 GB free)
  ```bash
  df -h / | tail -1
  # Expected: >10GB free
  ```

- [ ] Memory available (>2 GB)
  ```bash
  free -h | grep Mem
  # Expected: >2GB available
  ```

#### Network
- [ ] Port 3001 not in use
  ```bash
  lsof -i :3001
  # Expected: No output
  ```

- [ ] Firewall allows localhost:3001
  ```bash
  curl -s http://localhost:3001 >/dev/null && echo OK || echo BLOCKED
  # Expected: OK
  ```

#### Configuration
- [ ] .env.local file exists and correct
  ```bash
  [ -f .env.local ] && echo "EXISTS" || echo "MISSING"
  grep "DATABASE_URL\|REDIS_URL\|NODE_ENV" .env.local
  ```

- [ ] All required environment variables set
  ```bash
  npm run check:env
  # Expected: All variables present
  ```

**Status**: ✓ PASS / ✗ FAIL  
If FAIL on any item → **STOP - Fix before continuing**

---

### Phase 2: Application Startup (15 min)

#### Start Services
- [ ] Start full alpha environment
  ```bash
  ./scripts/alpha-startup.sh
  # Expected: Completes in ~30 min
  ```

- [ ] Monitor startup progress
  ```bash
  tail -f /tmp/alpha-server.log
  # Watch for "Server listening on port 3001"
  ```

- [ ] Wait for readiness signal
  ```bash
  curl -s http://localhost:3001/health | jq .readiness
  # Expected: "ready"
  ```

**Status**: ✓ PASS / ✗ FAIL  
If FAIL → Run troubleshooting from `ALPHA_INCIDENT_RUNBOOK.md`

---

### Phase 3: Database Validation (15 min)

#### Schema Integrity
- [ ] All migrations applied
  ```bash
  psql -d opsiq-alpha -c "\dt" | wc -l
  # Expected: >30 tables
  ```

- [ ] Initial data seeded
  ```bash
  psql -d opsiq-alpha -c "SELECT COUNT(*) FROM operators WHERE is_internal_alpha = true"
  # Expected: 3
  ```

- [ ] Workspaces exist
  ```bash
  psql -d opsiq-alpha -c "SELECT COUNT(*) FROM workspaces WHERE is_alpha = true"
  # Expected: 3
  ```

- [ ] Engagements seeded
  ```bash
  psql -d opsiq-alpha -c "SELECT COUNT(*) FROM engagements"
  # Expected: 12-15
  ```

- [ ] Actions queued
  ```bash
  psql -d opsiq-alpha -c "SELECT COUNT(*) FROM actions"
  # Expected: 50-75
  ```

#### Data Integrity
- [ ] Audit chain valid (hash integrity)
  ```bash
  ./scripts/verify-audit-chain.sh
  # Expected: "Audit chain is valid"
  ```

- [ ] No duplicates (idempotency key uniqueness)
  ```bash
  psql -d opsiq-alpha -c "SELECT COUNT(*) FROM actions WHERE idempotency_key IN (SELECT idempotency_key FROM actions GROUP BY idempotency_key HAVING COUNT(*) > 1)"
  # Expected: 0
  ```

- [ ] No orphaned records
  ```bash
  psql -d opsiq-alpha -c "SELECT COUNT(*) FROM actions a WHERE NOT EXISTS (SELECT 1 FROM engagements e WHERE e.id = a.engagement_id)"
  # Expected: 0
  ```

**Status**: ✓ PASS / ✗ FAIL  
If FAIL on integrity checks → **STOP - Do not proceed with corrupted data**

---

### Phase 4: Operator Account Validation (10 min)

#### Accounts Exist
- [ ] Alpha Lead account
  ```bash
  psql -d opsiq-alpha -c "SELECT email FROM operators WHERE email LIKE '%alpha-lead%'"
  # Expected: alpha-lead@internal.test
  ```

- [ ] Validator accounts
  ```bash
  psql -d opsiq-alpha -c "SELECT email FROM operators WHERE email LIKE '%validator%'"
  # Expected: 2 rows
  ```

- [ ] Support account
  ```bash
  psql -d opsiq-alpha -c "SELECT email FROM operators WHERE role = 'support'"
  # Expected: alpha-support@internal.test
  ```

#### Workspace Membership
- [ ] Lead has access to all workspaces
  ```bash
  psql -d opsiq-alpha -c "SELECT COUNT(DISTINCT w.id) FROM workspaces w JOIN workspace_memberships wm ON wm.workspace_id = w.id JOIN operators o ON o.id = wm.operator_id WHERE o.email = 'alpha-lead@internal.test'"
  # Expected: 3
  ```

- [ ] Validators have access
  ```bash
  psql -d opsiq-alpha -c "SELECT COUNT(DISTINCT w.id) FROM workspaces w JOIN workspace_memberships wm ON wm.workspace_id = w.id JOIN operators o ON o.id = wm.operator_id WHERE o.email LIKE '%validator%'"
  # Expected: 3 (each validator has 3)
  ```

#### Login Test (Non-Production)
- [ ] Test login flow
  ```bash
  # Don't actually log in - just test endpoint
  curl -s -X POST http://localhost:3001/api/auth/signin \
    -H "Content-Type: application/json" \
    -d '{"email": "alpha-lead@internal.test"}' | jq .status
  # Expected: "signin_link_sent" or similar
  ```

**Status**: ✓ PASS / ✗ FAIL  
If FAIL on login → Re-run seeding: `./scripts/alpha-reseed-operator.sh alpha-lead@internal.test`

---

### Phase 5: System Readiness Validation (15 min)

#### Health Check
- [ ] Application health endpoint
  ```bash
  curl -s http://localhost:3001/health | jq .status
  # Expected: "ok"
  ```

- [ ] Database readiness
  ```bash
  curl -s http://localhost:3001/health | jq .database.ready
  # Expected: true
  ```

- [ ] Redis readiness
  ```bash
  curl -s http://localhost:3001/health | jq .redis.ready
  # Expected: true
  ```

- [ ] System readiness status
  ```bash
  psql -d opsiq-alpha -c "SELECT status FROM system_readiness ORDER BY updated_at DESC LIMIT 1"
  # Expected: "ready"
  ```

#### Observability
- [ ] Logging active
  ```bash
  tail -5 /tmp/alpha-server.log | grep -E "INFO|WARN|ERROR" | wc -l
  # Expected: >0
  ```

- [ ] Metrics available
  ```bash
  curl -s http://localhost:3001/metrics | head -5
  # Expected: Prometheus format metrics
  ```

- [ ] Request tracing working
  ```bash
  curl -s -H "X-Request-ID: test-$(date +%s)" http://localhost:3001/health | grep -q "X-Request-ID"
  # Expected: Header echoed back (request traced)
  ```

**Status**: ✓ PASS / ✗ FAIL  
If FAIL → Run `./scripts/alpha-verify.sh` for detailed diagnostics

---

### Phase 6: Support Systems Ready (10 min)

#### Support Tooling
- [ ] Diagnostics script works
  ```bash
  ./scripts/alpha-support-diag.sh alpha-lead@internal.test | grep -q "SESSION STATUS"
  # Expected: Output shows session info
  ```

- [ ] Audit verification working
  ```bash
  ./scripts/verify-audit-chain.sh
  # Expected: "Audit chain is valid"
  ```

- [ ] Rollback procedure tested
  ```bash
  # Verify backup exists (don't actually rollback)
  ls -lt /backups/*.sql.gz | head -1
  # Expected: Recent backup file
  ```

#### Support Documentation
- [ ] Runbook accessible
  ```bash
  [ -f reports/operations/ALPHA_OPERATOR_RUNBOOK.md ] && echo "✓ EXISTS"
  ```

- [ ] Support runbook accessible
  ```bash
  [ -f reports/operations/ALPHA_SUPPORT_RUNBOOK.md ] && echo "✓ EXISTS"
  ```

- [ ] Incident runbook accessible
  ```bash
  [ -f reports/operations/ALPHA_INCIDENT_RUNBOOK.md ] && echo "✓ EXISTS"
  ```

**Status**: ✓ PASS / ✗ FAIL

---

### Phase 7: Rollback Readiness (5 min)

#### Backup Created
- [ ] Fresh backup exists
  ```bash
  ls -lt /backups/ | head -1
  # Expected: Recent file (<1 hour old)
  ```

#### Rollback Tested
- [ ] Rollback script is executable
  ```bash
  [ -x scripts/alpha-rollback.sh ] && echo "✓ READY"
  ```

- [ ] Rollback documented
  ```bash
  grep -q "EMERGENCY ROLLBACK" reports/operations/ALPHA_INCIDENT_RUNBOOK.md
  # Expected: Match found
  ```

**Status**: ✓ PASS / ✗ FAIL  
If FAIL → Create backup: `docker exec opsiq-postgres pg_dump -U opsiq opsiq-alpha | gzip > /backups/opsiq-alpha-$(date +%s).sql.gz`

---

## T-1 HOUR FINAL CHECKS

### Quick Verification

- [ ] All services still running
  ```bash
  ./scripts/alpha-verify.sh
  # Expected: All green
  ```

- [ ] No unexpected errors in logs
  ```bash
  grep ERROR /tmp/alpha-server.log | tail -5
  # Expected: No recent errors
  ```

- [ ] Database still responsive
  ```bash
  psql -d opsiq-alpha -c "SELECT COUNT(*) FROM operators" | grep 3
  # Expected: 3 operators
  ```

- [ ] Support team briefed and ready
  - [ ] Support engineer briefed
  - [ ] Team lead briefed
  - [ ] Escalation paths clear
  - [ ] Slack channels monitored

---

## T-0 DEPLOYMENT

### Final Steps (5 minutes before operators access)

- [ ] All checks PASSED ✓
- [ ] Team lead gives final approval
- [ ] Send final alert to #ops-alpha-team
  ```
  ✨ ALPHA ENVIRONMENT READY FOR OPERATORS
  
  Status: All checks passed ✓
  URL: http://localhost:3001
  Operators: 3 accounts ready
  Support: Standby and monitoring
  Runbook: https://[link]
  
  Operators: You may now log in.
  ```

- [ ] Monitor first login attempts (watch logs)
  ```bash
  tail -f /tmp/alpha-server.log | grep -E "login|session|operator"
  ```

- [ ] Confirm operators can access
  - [ ] Check active sessions increase
  - [ ] Check first action appears in logs
  - [ ] Check no error messages for login attempts

### If Problems During Operator Access

- [ ] Pause (tell operators to wait)
- [ ] Diagnose using ALPHA_INCIDENT_RUNBOOK.md
- [ ] Fix or rollback
- [ ] Resume

---

## POST-LAUNCH MONITORING (First 2 Hours)

### 30-Minute Check
- [ ] No critical errors in logs
- [ ] Operators have created sessions
- [ ] At least one action attempted
- [ ] No stalled actions yet
- [ ] No data corruption detected

### 1-Hour Check
- [ ] At least 3 actions attempted
- [ ] Support dependency <50% (expect high at first)
- [ ] No safety concerns reported
- [ ] No system errors
- [ ] Operator confidence being tracked

### 2-Hour Check
- [ ] All operators have accessed system
- [ ] Actions being completed
- [ ] Feedback system receiving data
- [ ] No incidents to escalate
- [ ] System stable and responsive

---

## LAUNCH DECISION MATRIX

### GO (All items checked ✓)
```
Infrastructure: ✓ READY
Database: ✓ VALID
Operators: ✓ READY
Readiness: ✓ CONFIRMED
Support: ✓ READY
Rollback: ✓ PREPARED

Decision: ✨ LAUNCH
```

### GO WITH CAUTION (1-2 items conditional)
```
Infrastructure: ✓ READY
Database: ⚠️ [minor issue noted]
Operators: ✓ READY
Readiness: ✓ CONFIRMED
Support: ✓ READY
Rollback: ✓ PREPARED

Decision: LAUNCH (with note)
Action: Monitor [specific item] closely
Fallback: [prepared rollback if issue worsens]
```

### PAUSE (3+ items failed or critical issue)
```
Infrastructure: ✓ READY
Database: ✗ FAILED (corruption detected)
Operators: ? UNCLEAR
Readiness: ✗ NOT READY
Support: ✓ READY
Rollback: ✓ PREPARED

Decision: ⛔ PAUSE LAUNCH
Reason: Data integrity issue detected
Action: Investigate and resolve
Timeline: [new launch time when ready]
```

---

## SIGN-OFF

**DevOps Engineer**: _________________ Date: _______
- Verified: Infrastructure, database, deployment

**Team Lead**: _________________ Date: _______
- Verified: Overall readiness, support, operators

**Support Lead**: _________________ Date: _______
- Verified: Support systems, escalation paths, tooling

**Final Decision**: ☐ GO / ☐ PAUSE

---

**Launch Checklist Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR DEPLOYMENT

All verification items have been defined and can be executed in <3 hours.
