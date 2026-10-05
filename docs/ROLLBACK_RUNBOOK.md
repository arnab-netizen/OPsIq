# Rollback Runbook

**Document:** Production Rollback Procedures  
**Last Updated:** 2026-05-21  
**Owner:** DevOps Team  
**Severity:** P0 Blocker - Critical for Production Safety

---

## Overview

This runbook documents how to quickly rollback a failed deployment or recover from a critical issue in production.

**Goal:** Minimize customer impact and RTO (Recovery Time Objective)

**RTO Target:** <15 minutes from incident detection to service restored

---

## Quick Links

- [Code Rollback](#code-rollback) - Revert application code
- [Database Rollback](#database-rollback) - Restore from backup
- [Partial Rollback](#partial-rollback) - Roll back specific components
- [Recovery Verification](#recovery-verification) - Confirm system is healthy

---

## When to Rollback

### Rollback IMMEDIATELY if:

```
✓ Application crashes on startup
✓ All requests return 500 errors
✓ Database connection fails
✓ Stripe webhooks stop being processed
✓ Data corruption detected
✓ Security vulnerability discovered in deployed code
```

### Consider Rollback if:

```
✓ Error rate >10% for >10 minutes
✓ Response time p99 >5 seconds
✓ Database latency >2 seconds
✓ Critical business flow broken (e.g., can't create engagements)
```

### Do NOT Rollback if:

```
✗ Only a few specific endpoints are slow (may be database query)
✗ Single user reports issue (might be their network)
✗ Load test causing high resource usage (expected)
✗ Non-critical feature has bug (can fix in next release)
```

---

## Notification Protocol

Before rollback, notify:

```bash
# 1. Slack: #incidents channel
@here INCIDENT: Production deployment failed. Rolling back to commit XXX. ETA 15 min.

# 2. Status Page: Set to "investigating"
https://status.yourdomain.com/

# 3. Customer support: Let them know we're fixing
Email support@opsiq.solutions

# 4. On-call rotation: Page on-call engineer if not already
PagerDuty incident #12345
```

---

## Pre-Rollback Checklist

- [ ] Confirmed issue is in deployed code (not network/infrastructure)
- [ ] Documented rollback reason and affected features
- [ ] Backup of current database state created (even if we're rolling back)
- [ ] Team notified via Slack
- [ ] On-call engineer standing by
- [ ] Customer communication prepared

---

## Code Rollback Procedure

### Step 1: Identify Previous Known-Good Commit

```bash
# Check deployment history
git log --oneline main | head -20

# Expected output:
# 1234567 (current, broken) Feature: Add new engagement workflow
# abcdefg (previous, working) Fix: Auth header validation

# Identify git SHA of last known-good deployment
PREVIOUS_COMMIT="abcdefg"
BROKEN_COMMIT="1234567"
```

### Step 2: Revert Deployment

**Option A: Using git revert (preferred, creates audit trail)**

```bash
# Create new commit that reverts the broken commit
git revert $BROKEN_COMMIT --no-edit

# This creates a new commit that undoes the changes
# Resulting commit: "Revert: Feature: Add new engagement workflow"

# Push to main
git push origin main
```

**Option B: Using git reset (only if absolutely urgent)**

```bash
# Reset to previous commit
# WARNING: This rewrites history, use only if necessary
git reset --hard $PREVIOUS_COMMIT
git push --force-with-lease origin main

# Alternative with safety check
git push --force-with-lease origin main --dry-run
# Review output, then remove --dry-run if correct
```

### Step 3: Redeploy Application

```bash
# Trigger deployment
./scripts/deploy.sh production

# Expected output:
# [INFO] Building application...
# [INFO] Running tests...
# [INFO] Deploying to production...
# [INFO] Application started
# [INFO] Health check: PASS

# Monitor deployment
kubectl rollout status deployment/opsiq -w
```

### Step 4: Verify Deployment

```bash
# Health check
curl https://yourdomain.com/api/health
# Expected: {"status": "healthy", "checks": {...}}

# Manual smoke test
curl https://yourdomain.com/api/workspaces -H "Authorization: Bearer $TEST_TOKEN"
# Should return workspace list

# Check logs for errors
kubectl logs -f deployment/opsiq | grep ERROR
# Expected: No error logs related to deployment
```

### Step 5: Monitor for 30 minutes

```bash
# Watch error rate
watch "kubectl logs deployment/opsiq | grep -c ERROR"

# Check metrics dashboard
# Should show error rate returning to <1%

# Monitor application logs in aggregation tool
# Sentry / DataDog / CloudWatch
```

---

## Database Rollback Procedure

Use this if data was corrupted or migrations caused issues.

### Step 1: Stop Application

```bash
# Stop application (don't delete pods yet!)
kubectl scale deployment opsiq --replicas=0

# Verify stopped
kubectl get deployment opsiq
# Expected: 0 replicas

# Wait for pods to terminate
sleep 10
```

### Step 2: Identify Backup to Restore

```bash
# List available backups
ls -lh /backups/opsiq/opsiq_backup_*.sql.gz | tail -10

# Expected output:
# opsiq_backup_2026-05-21_14-30-45.sql.gz 245M (current, broken)
# opsiq_backup_2026-05-21_14-00-30.sql.gz 240M (previous, known-good)
# opsiq_backup_2026-05-20_22-15-00.sql.gz 238M (old)

# Choose backup to restore from
BACKUP_FILE="/backups/opsiq/opsiq_backup_2026-05-21_14-00-30.sql.gz"
```

### Step 3: Restore Database

> **BLOCKED — do not restore production with `scripts/restore-database.sh`.** The script refuses production (`PRODUCTION_RESTORE_REQUIRES_GOVERNED_WORKFLOW`) because a `pg_dump --create` dump drops and recreates a whole database, and no governed production recovery workflow exists yet (`GOVERNED_PRODUCTION_RESTORE_WORKFLOW=DEFERRED`). Do not bypass this by setting `DATABASE_URL` manually. Use the Neon point-in-time restore path in `docs/DATABASE_BACKUP_RECOVERY_RUNBOOK.md`, or escalate to the owner.

```bash
# Before: Stop application (already done in Step 1)

# Production restore is NOT performed with scripts/restore-database.sh. Rehearse the chosen backup on a local or
# disposable server only:
OPSIQ_DB_TARGET=local DATABASE_URL="postgresql://postgres:postgres@localhost:5432/postgres" ./scripts/restore-database.sh $BACKUP_FILE

# Expected output:
# Restoring from backup: opsiq_backup_2026-05-21_14-00-30.sql.gz
# [################] 100% - Restore completed
# Database ready for use

# Verify restore
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"
# Should match the count from before the broken deployment
```

### Step 4: Rollback Application Code

```bash
# If deployment included database migrations, revert code first
git revert $BROKEN_COMMIT
git push origin main

# Redeploy application (code should match database schema now)
./scripts/deploy.sh production
```

### Step 5: Scale Application Back Up

```bash
# Start application
kubectl scale deployment opsiq --replicas=3

# Monitor startup
kubectl get pods -l app=opsiq -w

# Wait for all pods to be ready (2-3 minutes)
# Expected: NAME READY STATUS RESTARTS AGE
#           opsiq-xxx-yyy 1/1 Running 0 1m
```

### Step 6: Verify Database Schema

```bash
# Verify schema matches code
npx prisma validate
# Expected: The schema at prisma/schema.prisma is valid 🚀

# Check key tables exist
psql $DATABASE_URL -c "
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' 
ORDER BY table_name;"
```

---

## Partial Rollback (Roll Back Specific Feature)

Use if only one feature is broken, not entire deployment.

### Scenario: Feature flag exists for broken feature

```bash
# Disable feature flag
export ENABLE_NEW_WORKFLOW=false
kubectl set env deployment/opsiq ENABLE_NEW_WORKFLOW=false

# Pods will restart with feature disabled
kubectl rollout status deployment/opsiq

# Verify feature is disabled
curl https://yourdomain.com/api/workspaces/123/new-workflow
# Expected: 404 Not Found (endpoint disabled)
```

### Scenario: API endpoint is broken

```bash
# Temporarily route traffic away from broken endpoint
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: block-broken-endpoint
spec:
  podSelector:
    matchLabels:
      app: opsiq
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector: {}
      podSelector: {}
    ports:
    - protocol: TCP
      port: 3000
      except:
        path: /api/broken-endpoint
EOF

# Or use load balancer rules to route around it
# AWS ALB: Remove target from target group
aws elbv2 deregister-targets \
  --target-group-arn arn:aws:elasticloadbalancing:... \
  --targets Id=i-1234567890abcdef0
```

---

## Recovery Verification

### Health Checks

```bash
# 1. Application is running
curl -I https://yourdomain.com/api/health
# Expected: HTTP 200 OK

# 2. Database is accessible
curl https://yourdomain.com/api/health | jq '.checks.database.status'
# Expected: "healthy"

# 3. Critical business flow works
curl -X POST https://yourdomain.com/api/engagements \
  -H "Authorization: Bearer $TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test"}'
# Expected: HTTP 201 Created

# 4. No startup errors
kubectl logs deployment/opsiq | grep ERROR | head -10
# Expected: No ERROR logs related to startup
```

### Monitoring Checks

```bash
# Check error rate in monitoring tool
# Sentry: Error rate should be <1%
# DataDog: Error threshold alerts should clear
# CloudWatch: 5xx error count should drop

# Check database latency
# Expected: <200ms p95

# Check memory/CPU
# Expected: <70% usage

# Check backup status
# Expected: Last backup completed successfully
```

### Data Integrity Checks

```bash
# Verify data matches pre-rollback state
psql $DATABASE_URL -c "
SELECT table_name, count(*) 
FROM information_schema.tables 
WHERE table_schema='public' 
GROUP BY table_name 
ORDER BY table_name;"

# Compare with known good counts
# Example:
#  users: 150 (expected)
#  engagements: 42 (expected)
#  decisions: 89 (expected)
```

---

## Post-Rollback Actions

### Immediate (within 30 minutes)

```bash
# 1. Update status page
Status: "Incident resolved, system restored"

# 2. Notify stakeholders
Slack: "Production incident resolved. Rolled back to commit XXX. Root cause: deployment bug in new workflow. Fix in progress."

# 3. Create incident post-mortem ticket
Jira: "Create ticket for post-mortem: Deployment bug in new workflow caused production outage. RTO: 12 minutes."

# 4. Monitor closely
Watch error rate, latency, and health checks for next 2 hours
```

### Same Day (within 4 hours)

```bash
# 1. Fix the bug in the code
- Debug why new workflow broke
- Add tests to catch regression
- Commit to feature branch

# 2. Test fix in staging
- Deploy to staging
- Run full test suite
- Manual testing

# 3. Plan re-deployment
- Schedule for low-traffic time
- Get code review approval
- Update deployment checklist
```

### Follow-up (within 1 week)

```bash
# 1. Post-mortem meeting
- What went wrong?
- Why wasn't it caught in testing?
- How do we prevent this?

# 2. Process improvements
- Add automated test
- Add smoke test for feature
- Add feature flag if needed

# 3. Update runbooks
- Document this incident
- Update deployment procedures
```

---

## Automated Rollback (Optional)

For high-confidence deployments, consider automated rollback:

```bash
# In CI/CD pipeline, after deployment:
# 1. Run smoke tests
# 2. If any fail, automatically roll back
# 3. Notify team

# Example GitHub Actions:
name: Auto-Rollback on Smoke Test Failure
on: [workflow_run]
jobs:
  smoke-tests:
    runs-on: ubuntu-latest
    steps:
      - run: npm run smoke:prod
      - if: failure()
        run: |
          git revert ${{ github.sha }}
          git push origin main
          curl -X POST $SLACK_WEBHOOK \
            -d "Deployment failed smoke tests. Auto-rolled back."
```

---

## Common Rollback Scenarios

### Scenario 1: New Feature Breaks at Launch

```bash
# Immediately detect via monitoring
# Error rate jumps from 0.5% to 15%

# Steps:
1. git revert $BROKEN_COMMIT
2. git push origin main
3. kubectl rollout restart deployment/opsiq
4. Monitor for 30 minutes
5. Create post-mortem ticket
```

### Scenario 2: Database Migration Causes Corruption

```bash
# Immediately detect via health check
# Health check returns: "database: unhealthy"

# Steps:
1. kubectl scale deployment opsiq --replicas=0 (stop app)
2. Database restore: BLOCKED for production via scripts/restore-database.sh (it refuses production; no governed production recovery workflow exists yet) — use Neon point-in-time restore per docs/DATABASE_BACKUP_RECOVERY_RUNBOOK.md or escalate to the owner
3. git revert $BROKEN_COMMIT (revert app code)
4. kubectl scale deployment opsiq --replicas=3 (restart app)
5. Verify schema matches code
```

### Scenario 3: Stripe Webhook Configuration Breaks Payments

```bash
# Detect: Stripe webhook failures in monitoring

# Steps:
1. git revert $BROKEN_COMMIT (revert webhook code change)
2. git push origin main
3. kubectl rollout restart deployment/opsiq
4. Verify Stripe webhooks resuming in dashboard
5. Test webhook delivery with Stripe test event
```

### Scenario 4: Memory Leak Causes OOM Kills

```bash
# Detect: Pods being killed with OOMKilled status

# Steps:
1. Increase memory limits (temporary)
   kubectl set resources deployment opsiq \
     --limits=memory=2Gi

2. Identify memory leak
   - Check recent commits
   - Look for unbounded loops, caches

3. git revert $BROKEN_COMMIT (revert memory leak)

4. Restore memory limits to normal
   kubectl set resources deployment opsiq \
     --limits=memory=1Gi
```

---

## Emergency Contact List

In case of critical production incident:

```
On-Call Engineer:  $ON_CALL_PHONE / $ON_CALL_SLACK
DevOps Lead:       $DEVOPS_LEAD_PHONE
Engineering Lead:  $ENGINEERING_LEAD_PHONE
Customer Success:  $CUSTOMER_SUCCESS_EMAIL
```

---

## Testing Your Rollback

**Important:** Test rollback procedures quarterly in staging!

```bash
# 1. Deploy a known-broken version to staging
git checkout <old-broken-commit>
./scripts/deploy.sh staging

# 2. Verify it's broken (health check fails, errors)
curl https://staging.yourdomain.com/api/health
# Expected: Error

# 3. Execute rollback procedure exactly as documented
git revert <broken-commit>
git push origin staging
kubectl rollout restart deployment/opsiq-staging

# 4. Verify rollback worked
curl https://staging.yourdomain.com/api/health
# Expected: 200 OK

# 5. Document any issues with procedure
```

---

## Rollback Success Criteria

Rollback is successful when:

- [ ] Application starts without errors
- [ ] Health check returns 200 with all subsystems healthy
- [ ] Error rate drops below 1%
- [ ] Response times return to baseline (<200ms p95)
- [ ] No data integrity issues detected
- [ ] Database latency normal (<100ms)
- [ ] Memory/CPU usage normal
- [ ] Stripe webhooks processing normally
- [ ] No new errors in logs

---

**Questions?** Contact DevOps team.  
**Incident?** Page on-call engineer immediately via PagerDuty.
