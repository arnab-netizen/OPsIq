# Production Smoke Tests

**Document:** Post-Deployment Smoke Test Procedures  
**Last Updated:** 2026-05-21  
**Owner:** QA / DevOps Team  
**Severity:** P0 Blocker - Required for Deployment Sign-Off

---

## Overview

Smoke tests verify that critical user journeys work after deployment. Run these immediately after deploying to production, before marking deployment complete.

**Goal:** Catch broken functionality before customers notice  
**Time Required:** 5-10 minutes  
**Success Criteria:** All tests pass

---

## Quick Start

```bash
# Run automated smoke tests
npm run smoke:prod

# Or run manual tests using checklist below
```

---

## Automated Smoke Tests

### Run Tests

```bash
# Ensure NEXT_PUBLIC_APP_URL is set to production domain
export NEXT_PUBLIC_APP_URL="https://yourdomain.com"

# Run tests
npm run smoke:prod

# Expected output:
# ✓ Health check: PASS (database healthy, uptime > 0s)
# ✓ Create workspace: PASS (workspace_123 created)
# ✓ Create engagement: PASS (engagement_456 created)
# ✓ Create action: PASS (action_789 created)
# ✓ Export decision: PASS (decision_abc exported)
# ✓ Webhook ready: PASS (Stripe webhook accepting requests)
# ✓ Database connectivity: PASS (latency 45ms)

# All tests passed ✓
```

### Test Timeout

Each test has a 30-second timeout. If tests hang:

```bash
# Kill hanging tests
pkill -f "npm run smoke:prod"

# Check if application is responsive
curl https://yourdomain.com/api/health

# If not responding, check application status
kubectl get deployment opsiq
kubectl logs deployment/opsiq | tail -20
```

---

## Manual Smoke Test Checklist

Run these checks manually if automated tests are unavailable.

### 1. Health Check (Immediate)

```bash
# Check application is up
curl https://yourdomain.com/api/health

# Expected response:
{
  "status": "healthy",
  "timestamp": "2026-05-21T10:30:45.123Z",
  "version": "0.1.0",
  "environment": "production",
  "checks": {
    "database": {
      "status": "healthy",
      "latencyMs": 45
    },
    "memory": {
      "status": "healthy",
      "usage": "45%"
    },
    "uptime": {
      "status": "healthy",
      "uptimeSeconds": 120
    },
    "runtime": {
      "status": "healthy",
      "nodeVersion": "v18.0.0",
      "environment": "production"
    }
  }
}

# Verify:
✓ status = "healthy" (or "degraded" is acceptable if all subsystems still respond)
✓ database.status = "healthy"
✓ database.latencyMs < 500
✓ memory.usage < 90%
✓ uptime > 30 (at least 30 seconds)
```

### 2. Readiness Check

```bash
curl https://yourdomain.com/api/ops/readiness

# Expected: HTTP 200 OK
# Indicates application is ready to serve traffic
```

### 3. Liveness Check

```bash
curl https://yourdomain.com/api/liveness

# Expected: HTTP 200 OK
# Indicates application process is alive
```

### 4. Database Connectivity

```bash
# Database health is checked above, but verify manually
curl https://yourdomain.com/api/health | jq '.checks.database'

# Expected:
{
  "status": "healthy",
  "latencyMs": 45
}

# If status is "unhealthy":
# - Check DATABASE_URL is set correctly
# - Verify database is running: psql $DATABASE_URL -c "SELECT 1"
# - Check network connectivity from app to database
# - Review application logs: kubectl logs deployment/opsiq | grep -i "database"
```

### 5. Browser Testing (UI Verification)

Open browser and navigate to https://yourdomain.com

#### Test: Landing Page
- [ ] Page loads without errors
- [ ] No red error messages
- [ ] No console errors (open DevTools, check Console tab)

#### Test: Workspace Creation
- [ ] Click "Create Workspace" button
- [ ] Enter workspace name: "Test Workspace"
- [ ] Click "Create"
- [ ] Expected: Workspace created, redirected to dashboard

#### Test: Engagement Creation
- [ ] Click "Create Engagement"
- [ ] Fill in form: Name, Description, Client Name
- [ ] Click "Create"
- [ ] Expected: Engagement appears in list

#### Test: Action Creation
- [ ] Navigate to engagement
- [ ] Click "Add Action"
- [ ] Fill in: Title, Description, Owner
- [ ] Set due date
- [ ] Click "Create"
- [ ] Expected: Action appears with status "pending"

#### Test: Decision Creation
- [ ] Navigate to engagement
- [ ] Click "Create Decision"
- [ ] Fill in decision details
- [ ] Click "Create"
- [ ] Expected: Decision created, can be exported

#### Test: Export Decision
- [ ] Click "Export" on a decision
- [ ] Select format: PDF or JSON
- [ ] Click "Export"
- [ ] Expected: File downloaded successfully

### 6. API Testing (Postman or curl)

```bash
# Get auth token (use test user credentials)
curl -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# Expected: {"token": "eyJ...", "expiresAt": "..."}
TOKEN="eyJ..."

# Test: Create workspace via API
curl -X POST https://yourdomain.com/api/workspaces \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"API Test Workspace"}'

# Expected: HTTP 201 Created
# Response: {"id":"ws_123","name":"API Test Workspace",...}

# Test: List workspaces
curl https://yourdomain.com/api/workspaces \
  -H "Authorization: Bearer $TOKEN"

# Expected: HTTP 200 OK, list of workspaces

# Test: Create engagement
curl -X POST https://yourdomain.com/api/engagements \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspaceId":"ws_123",
    "clientName":"Test Client",
    "description":"Test engagement"
  }'

# Expected: HTTP 201 Created
```

### 7. Stripe Webhook Verification (if payment processing enabled)

```bash
# Log in to Stripe Dashboard: https://dashboard.stripe.com

# Navigate to: Developers > Webhooks
# Find your endpoint: https://yourdomain.com/api/webhooks/stripe
# 
# Check "Recent events":
# - Should see recent webhook events
# - Status should be "Succeeded" (green checkmark)

# Or send test event:
# Click endpoint > "Send a test event" > "customer.created" > "Send event"
# Expected: Response shows HTTP 200

# Check application logs for webhook processing:
kubectl logs deployment/opsiq | grep -i "webhook" | tail -10

# Expected output:
# [INFO] Webhook received: event_id=evt_1234567890
# [INFO] Event processed: type=customer.created
# [INFO] Status: processed
```

### 8. Error Handling

```bash
# Test error tracking is working

# Navigate to: https://yourdomain.com/api/test-error
# Expected: Error is recorded in Sentry/DataDog

# Check error tracking dashboard:
# - Sentry: https://sentry.io > opsiq project
# - DataDog: https://app.datadoghq.com > APM

# Expected: Error appears in error tracking system within 30 seconds
```

### 9. Logging Verification

```bash
# Check application logs
kubectl logs deployment/opsiq | tail -50

# Expected:
# - No ERROR or CRITICAL logs
# - Contains INFO logs about request handling
# - No database connection errors
# - No startup warnings
```

### 10. Performance Baseline

```bash
# Check response times
curl -w "\nTime: %{time_total}s\n" https://yourdomain.com/api/health

# Expected: < 200ms total time (including network)

# Load test endpoint (light, non-destructive)
for i in {1..10}; do
  curl -s https://yourdomain.com/api/health > /dev/null
done

# Monitor application during light load
# Expected: CPU < 30%, Memory < 50%
```

---

## Post-Deployment Monitoring (First 1 Hour)

After smoke tests pass, monitor:

### Every 5 minutes:
```bash
# Check error rate
# Expected: < 1%

# Check response times
# Expected: p95 < 500ms

# Check memory/CPU
# Expected: < 70%
```

### Every 15 minutes:
```bash
# Monitor logs for unexpected errors
kubectl logs deployment/opsiq --tail=100 | grep ERROR

# Check database latency
# Expected: < 200ms

# Check webhook processing
# Expected: webhooks being processed normally
```

### At 30 minutes:
```bash
# Full health check
curl https://yourdomain.com/api/health

# Verify all subsystems still healthy
# Check monitoring dashboard (Sentry, DataDog, etc.)
```

### At 1 hour:
```bash
# If all metrics normal, deployment is successful
# Post message to Slack: "Deployment successful ✓"
# Update status page if in maintenance mode
```

---

## Failure Response

If any smoke test fails:

### Step 1: Assess Severity

```
CRITICAL (Rollback immediately):
- Health check returns non-200
- Application won't start
- All requests return 500
- Database is inaccessible
- Stripe webhooks not processing

MAJOR (Roll back within 5 minutes):
- Can't create workspace/engagement/action
- Critical business feature broken
- Data is corrupted

MINOR (Fix in next release):
- Specific UI element broken
- Non-critical feature unavailable
- Cosmetic issue
```

### Step 2: Take Action

```bash
# For CRITICAL failures:
git revert $BROKEN_COMMIT
git push origin main
kubectl rollout restart deployment/opsiq
# See docs/ROLLBACK_RUNBOOK.md for full procedure

# For MAJOR failures:
# Same as CRITICAL, or
# Disable feature flag (if available) to unblock users

# For MINOR failures:
# Document issue, fix in next release
# Create ticket for fix
```

### Step 3: Investigate Root Cause

```bash
# Check deployment logs
kubectl logs deployment/opsiq | grep ERROR | head -20

# Check if migration failed
npx prisma migrate status

# Check environment variables
env | grep -E "DATABASE|STRIPE|AUTH"

# Check recent commits
git log --oneline | head -10

# Check monitoring dashboard
# - Sentry/DataDog for errors
# - CloudWatch for metrics
```

---

## Smoke Test Checklist

Print and sign off:

```
DEPLOYMENT SIGN-OFF

Date: ___________
Deployed Commit: ___________
Deployed To: Production

SMOKE TEST RESULTS:

Health Check:                  [ ] PASS [ ] FAIL
API Connectivity:              [ ] PASS [ ] FAIL
Workspace Creation (UI):       [ ] PASS [ ] FAIL
Engagement Creation (API):     [ ] PASS [ ] FAIL
Action Creation:               [ ] PASS [ ] FAIL
Decision Export:               [ ] PASS [ ] FAIL
Stripe Webhook Processing:     [ ] PASS [ ] FAIL
Database Latency (<500ms):     [ ] PASS [ ] FAIL
Memory Usage (<80%):           [ ] PASS [ ] FAIL
Error Tracking Configured:     [ ] PASS [ ] FAIL
No Startup Errors:             [ ] PASS [ ] FAIL

OVERALL RESULT: [ ] All Pass (Deployment Complete) [ ] FAILURE (See Rollback Runbook)

QA Engineer:    _________________ Date: _________
DevOps Engineer: ________________ Date: _________
On-Call Lead:    ________________ Date: _________

NOTES:
_______________________________________________________________________
_______________________________________________________________________
```

---

## Automated Smoke Test (npm script)

Add to `package.json`:

```json
{
  "scripts": {
    "smoke:prod": "tsx scripts/smoke-tests.ts",
    "smoke:staging": "tsx scripts/smoke-tests.ts --env=staging"
  }
}
```

See `scripts/smoke-tests.ts` for implementation.

---

## References

- [Health Check Implementation](../src/app/api/health/route.ts)
- [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md)
- [Rollback Runbook](./ROLLBACK_RUNBOOK.md)
- [Monitoring Setup](./MONITORING_SETUP.md)

---

**Questions?** Contact QA or DevOps team.  
**Deployment Failed?** See ROLLBACK_RUNBOOK.md immediately.
