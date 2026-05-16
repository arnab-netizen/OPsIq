# OpsIQ Rollback Procedure

## When to Rollback

Execute a rollback if:
- ✗ Critical functionality is broken (e.g., cannot create actions, payments failing)
- ✗ API error rate exceeds 5% for >5 minutes
- ✗ Response time exceeds 2 seconds p95 for >5 minutes
- ✗ Database connection pool exhausted
- ✗ Authentication/authorization system broken
- ✗ Data corruption detected

## Do NOT rollback if:
- ✓ Single feature has a bug (hotfix instead)
- ✓ Minor performance issue (optimize instead)
- ✓ A single user reports an issue (investigate first)

---

## Rollback Steps

### 1. Assess Severity (< 2 minutes)

**Gather Information:**
```bash
# Check error rate
curl -s https://your-sentry-dsn/api/events \
  ?project=YOUR_PROJECT_ID \
  ?statsPeriod=5m | jq '.statsPeriods[] | select(.error)'

# Check response times
curl -s https://your-monitoring-api/metrics \
  ?metric=latency \
  ?interval=5m

# Check system status
ssh production-server curl http://localhost/health
```

**Decision Matrix:**
| Metric | Threshold | Action |
|--------|-----------|--------|
| Error Rate | >5% × 5min | ROLLBACK |
| API Latency | >2s p95 × 5min | ROLLBACK |
| DB Connections | > 90% pool | ROLLBACK |
| Critical Feature | Down × any time | ROLLBACK |
| Auth System | Broken × any time | ROLLBACK |

If **any** threshold exceeded → Proceed to rollback.

### 2. Declare Incident (< 1 minute)

**Notify Team:**
```bash
# Slack
@channel 🚨 INCIDENT: Rollback initiated for v1.2.3
Reason: Error rate 8% (threshold 5%)
ETA: 5 minutes

# Email (critical alerts)
# [Auto-sent by Sentry/PagerDuty]

# Status Page
# Update status.opsiq.com to "Investigating"
```

### 3. Backup Current State (< 2 minutes)

**Capture Production State:**
```bash
# Backup current database
pg_dump $PRODUCTION_DATABASE_URL > \
  backups/pre_rollback_$(date +%s).sql

# Backup current code
git tag rollback_attempt_$(date +%Y%m%d_%H%M%S)
git push origin rollback_attempt_$(date +%Y%m%d_%H%M%S)

# Note current version
CURRENT_VERSION=$(curl https://your-domain.com/api/version)
echo "Rolling back FROM: $CURRENT_VERSION" >> docs/ROLLBACK_LOG.md
```

### 4. Stop New Deployments (< 1 minute)

**Prevent Additional Changes:**
```bash
# Lock deployment pipeline
# (Depends on your deployment tool)

# Example: Pause CI/CD
gh workflow disable .github/workflows/ci.yml

# Or: Kill active deployments
kubectl rollout pause deployment/opsiq
```

### 5. Rollback Application Code (< 5 minutes)

**Option A: Container/Kubernetes Rollback**
```bash
# Get previous version
kubectl rollout history deployment/opsiq

# Rollback to previous version
kubectl rollout undo deployment/opsiq --to-revision=<N>

# Verify
kubectl get pods -l app=opsiq
kubectl describe pod <pod-name>
```

**Option B: Git-Based Rollback**
```bash
# Find previous stable commit
git log --oneline | head -20

# Rollback to previous version
PREVIOUS_VERSION=abc123def456
git reset --hard $PREVIOUS_VERSION

# Rebuild and redeploy
npm ci
npm run build
# (Push to deployment service)
```

**Option C: Platform-Specific (Vercel/Railway)**
```bash
# Vercel
vercel rollback --token=$VERCEL_TOKEN

# Railway
railway up --from-ref=<previous-commit>

# Heroku
heroku releases --app opsiq-prod
heroku rollback --app opsiq-prod --to v123
```

### 6. Database Rollback (if needed, < 10 minutes)

**Only if data corruption or schema change caused issue:**

```bash
# Option A: Restore from backup
pg_restore -d $PRODUCTION_DATABASE \
  backups/pre_deployment_YYYYMMDD_HHMMSS.sql

# Verify data integrity
psql $PRODUCTION_DATABASE_URL -c \
  "SELECT COUNT(*) FROM audit_events WHERE created_at > now() - interval '1 hour'"

# Option B: Rollback migration
npx prisma migrate resolve --rolled-back <migration-name>
# (May require manual intervention if schema is complex)
```

**Important:** Do NOT rollback database unless absolutely necessary.
Data consistency is critical. Prefer application-only rollback.

### 7. Verify System Health (< 5 minutes)

**Run Verification Checks:**
```bash
# Health endpoint
curl https://your-domain.com/health | jq '.'

# Test critical paths
# 1. Login flow
#    - POST /api/auth/login
#    - Verify session created
#
# 2. Create action flow
#    - POST /api/actions
#    - GET /api/actions
#    - Verify action appears
#
# 3. Payment flow (if applicable)
#    - POST /api/charges
#    - Verify successful (not failed)

# Monitor error tracking
curl https://your-sentry-dsn/api/stats \
  ?statsPeriod=5m | jq '.issues[] | .eventCount'

# Check response times
curl https://your-monitoring-api/metrics \
  ?metric=latency | jq '.latency_p95'
```

**Success Criteria:**
- [ ] Health endpoint responds 200 OK
- [ ] Error rate < 1%
- [ ] Response time p95 < 500ms
- [ ] Critical paths working
- [ ] No new Sentry errors

If all checks pass → Proceed to step 8.
If checks fail → Try rollback again or escalate.

### 8. Resume Operations (< 2 minutes)

**Re-enable Deployments:**
```bash
# Re-enable CI/CD
gh workflow enable .github/workflows/ci.yml

# Resume Kubernetes deployments
kubectl rollout resume deployment/opsiq

# Reset status page
# Set status.opsiq.com to "Operational"
```

**Notify Team:**
```bash
# Slack
✅ Rollback successful
Rolled back TO: v1.2.2
Current Status: All systems operational
Resolution time: 15 minutes

# Update incident ticket
# Close with resolution: "Rolled back to previous version"
```

---

## Timings

| Step | Time | Critical? |
|------|------|-----------|
| 1. Assess | 2 min | ✓ Verify reason before rollback |
| 2. Notify | 1 min | ✓ Alert team immediately |
| 3. Backup | 2 min | ✓ Protect current state |
| 4. Stop Deployments | 1 min | ✓ Prevent conflicts |
| 5. Rollback Code | 5 min | ✓ Main action |
| 6. Rollback DB | 10 min | ✗ Only if critical |
| 7. Verify | 5 min | ✓ Confirm fix |
| 8. Resume | 2 min | ✓ Get back online |

**Total Time: 15-30 minutes** (depending on if database rollback needed)

---

## Post-Rollback Actions

### Immediate (within 1 hour)
- [ ] Write incident summary in Slack
- [ ] Document root cause
- [ ] Identify what went wrong
- [ ] List what will prevent in future

### Follow-Up (within 24 hours)
- [ ] Team post-incident review meeting
- [ ] Create action items to prevent recurrence
- [ ] Update deployment procedures if needed
- [ ] Update rollback procedure if needed
- [ ] Communicate with affected customers

### Long-Term (within 1 sprint)
- [ ] Implement root cause fix
- [ ] Add automated tests to catch issue
- [ ] Review code review process
- [ ] Consider canary/blue-green deployments

---

## Escalation

If rollback doesn't fix the issue:

1. **Escalate to Senior Engineer** (5 minutes from rollback start)
   - If system still broken after code rollback
   - If database rollback is uncertain

2. **Escalate to Lead Engineer** (10 minutes from rollback start)
   - If data corruption confirmed
   - If multiple systems affected

3. **Escalate to CTO** (15 minutes from rollback start)
   - If customer data at risk
   - If financial impact significant
   - If unable to restore service

---

## Rollback Log

**Location:** `docs/ROLLBACK_LOG.md`

Keep a log of all rollbacks:
```
## Rollback #3 — 2026-05-15

**FROM:** v1.2.4 (commit abc123)
**TO:** v1.2.3 (commit def456)
**REASON:** Payment system broken (error rate 12%)
**TIME:** 14 minutes
**STEPS:**
1. ✓ Assessed severity (5 min)
2. ✓ Notified team (1 min)
3. ✓ Backed up state (2 min)
4. ✓ Paused CI (1 min)
5. ✓ Deployed previous version (3 min)
6. ✓ Verified health (2 min)
7. ✓ Resumed operations (0 min)

**ROOT CAUSE:** Stripe API version mismatch in v1.2.4
**FIX:** Reverted Stripe SDK to 21.x, tested in v1.2.5
**PREVENTION:** Add Stripe integration tests to CI
```

---

## FAQ

**Q: Will users lose data?**
A: No. Rollback reverts code only (unless database corruption confirmed). User data preserved.

**Q: What about users creating data during rollback?**
A: Data created during rollback window may be lost. Minimize rollback time (<30 min).

**Q: How do we test rollback?**
A: Monthly rollback drills on staging environment. Document estimated times.

**Q: What if we can't decide?**
A: When in doubt, rollback. Prefer safety. Fix and redeploy rather than risk production stability.
