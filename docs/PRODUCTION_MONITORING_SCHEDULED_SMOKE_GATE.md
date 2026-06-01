# Production Monitoring: Scheduled Smoke Regression Gate

**Status**: ✅ IMPLEMENTED AND READY  
**Date**: 2026-06-01  
**Coverage**: 2 critical production paths monitored automatically  
**Alerting**: GitHub Actions workflow failures (visible in Actions tab)

---

## Overview

This gate ensures production-critical value paths cannot silently break by running comprehensive smoke tests on a daily schedule. Any regression in signup, authentication, workspace isolation, or diagnosis-to-dashboard flows will be caught within 24 hours.

---

## Monitored Workflows

### 1. Production Signup → Owner Dashboard Smoke Test

**File**: `.github/workflows/smoke-production-signup-dashboard.yml`

**Schedule**: Daily at 2:15 AM UTC

**Manual Trigger**: Yes (workflow_dispatch with optional base_url override)

**What it tests**:
- User signup endpoint creates user + workspace atomically
- Session authentication working (cookie set correctly)
- Owner dashboard API accessible with valid session
- Dashboard returns real workspace context (not mock data)
- Empty state for new workspace is safe and explicit (0 engagements, 0 actions)
- No hardcoded mock UUIDs in response
- No mock array fields (mockEngagementSnapshots, mockActions, etc.)
- Response fields correctly typed and scoped

**Timeout**: 10 minutes (workflow), 2 minutes (actual smoke script)

**Smoke Script**: `scripts/smoke-production-signup-dashboard.ts`

**Success Criteria**:
- Status 200 from /api/internal/build-info (deployment verification)
- Status 201 from /api/auth/signup (signup success)
- Status 200 from /api/owner/dashboard (dashboard accessible)
- Workspace ID from signup matches dashboard response
- No mock data in response
- Empty state validated

**Failure Meaning**:
Users cannot sign up or see their dashboard. This is a critical P0 regression blocking all new user onboarding.

---

### 2. Production Diagnosis → Dashboard Smoke Test

**File**: `.github/workflows/smoke-production-diagnosis-dashboard.yml`

**Schedule**: Daily at 2:45 AM UTC (30 min after signup smoke)

**Manual Trigger**: Yes (workflow_dispatch with optional base_url override)

**What it tests**:
- User signup and workspace creation
- Diagnosis endpoint creates engagement, recommendations, and actions atomically
- All diagnosis-created records are scoped to created workspace
- Dashboard shows real recommendations from diagnosis (not fallback)
- Transaction atomicity: either all records created or none
- No partial diagnosis writes
- Dashboard displays diagnosis data correctly

**Timeout**: 10 minutes (workflow), 2 minutes (actual smoke script)

**Smoke Script**: `scripts/smoke-production-diagnosis-dashboard.ts`

**Success Criteria**:
- Status 201 from /api/auth/signup (signup)
- Status 201 from /api/diagnosis (diagnosis creation)
- Engagement created with correct workspace context
- Recommendations and Actions created in transaction
- Dashboard shows real recommendations (not generic fallback)
- Workspace isolation enforced

**Failure Meaning**:
Users cannot run business diagnoses or see recommendations. This is a critical P0 regression blocking the core consulting workflow.

---

## Schedule Design

| Workflow | Time (UTC) | Frequency | Purpose |
|----------|-----------|-----------|---------|
| Signup → Dashboard | 2:15 AM | Daily | Catch auth/workspace regression early |
| Diagnosis → Dashboard | 2:45 AM | Daily | Catch diagnosis/atomicity regression early |

**Staggering rationale**: 
- Both run daily (catch issues within 24h)
- Staggered 30 minutes apart to reduce concurrent load
- 2:15-2:45 AM UTC minimizes traffic impact on production
- Sufficient separation to diagnose failures independently

---

## Failure Detection and Alerting

### GitHub Actions Integration

**Visibility**:
1. **Workflow tab**: All runs visible at https://github.com/arnab-netizen/OPsIq/actions
2. **Failed run**: Marked with red X, searchable by workflow name
3. **Run details**: Full logs available, including detailed failure reason

**Failure Steps** (automatically executed on failure):
- Clear label: "❌ Production smoke test FAILED"
- Smoke test name (Diagnosis or Signup)
- Base URL tested
- Target commit SHA
- What the failure means (in plain English)
- Likely causes (list of common failure patterns)
- Escalation checklist (step-by-step triage)

### Log Output Example (on failure)

```
❌ Production smoke test FAILED

Smoke Test: Diagnosis → Dashboard
Base URL: https://o-ps-iq.vercel.app
Target Commit: 7a503da0

What this means:
  The diagnosis → dashboard production value path is broken.
  Users cannot create diagnoses or see recommendations on dashboard.

Check logs above for details. Likely causes:
  1. Vercel deployment failed or rolled back
  2. Database migration issue
  3. Authentication/workspace isolation regression
  4. Schema mismatch or missing field
  5. Transaction/atomicity failure in diagnosis creation

Escalation:
  1. Check Vercel deployment status at https://vercel.com
  2. Review database health
  3. Check recent commits for breaking changes
  4. Run local test suite: npm test -- auth workspace diagnosis
```

---

## What to Do When a Scheduled Smoke Fails

### Immediate Response (within 15 minutes)

1. **Check GitHub Actions**:
   - Go to https://github.com/arnab-netizen/OPsIq/actions
   - Find the failed workflow run
   - Read the workflow logs for detailed failure reason

2. **Verify production deployment**:
   - Check Vercel dashboard: https://vercel.com
   - Is the build green? (check "Production" deployment)
   - What commit is deployed?
   - Did anything roll back?

3. **Quick health check**:
   ```bash
   # Test deployment is reachable
   curl -s https://o-ps-iq.vercel.app/api/internal/build-info | jq .
   
   # Test in staging if possible
   curl -s https://[staging-url]/api/internal/build-info | jq .
   ```

### Root Cause Analysis (within 30 minutes)

**If Signup Smoke Failed:**
- Check recent auth changes
- Run: `npm test -- auth workspace`
- Check: Session cookie handling, user creation, workspace membership
- Check: Database connectivity, migration status

**If Diagnosis Smoke Failed:**
- Check recent diagnosis/transaction changes
- Run: `npm test -- diagnosis transaction`
- Check: db.$transaction() wrapping of Evidence/Finding/Recommendation/Action
- Check: Workspace isolation enforcement in diagnosis writes
- Check: Schema mismatch (dueAt field, assignedTo field)

**If Both Failed:**
- Likely infrastructure issue (database, Vercel, network)
- Check database health
- Check Vercel deployment logs
- Check for ongoing incidents

### Resolution Path

1. **Identify root cause** (auth, diagnosis, schema, or infrastructure)
2. **Fix locally**:
   - Make code changes
   - Run: `npm test` (full suite)
   - Test specific path: `npm run build && npm test -- [failing category]`
3. **Commit and push**: Code fix to main
4. **Monitor Vercel**: Wait for deployment
5. **Manual trigger**: Run workflow manually via GitHub Actions
   - Go to https://github.com/arnab-netizen/OPsIq/actions
   - Click the failed workflow
   - Click "Re-run failed jobs"
   - Verify it passes

### When to Escalate

- **Unresolved after 1 hour**: Escalate to devops/platform team
- **Multiple smokes failing simultaneously**: Likely infrastructure; check Vercel, database
- **Rollback needed**: Revert recent commits, re-trigger smoke
- **Data corruption suspected**: Database team involvement required

---

## Escalation Checklist

```
PRODUCTION SMOKE FAILURE ESCALATION
===================================

□ Read workflow logs (GitHub Actions → failed run)
□ Check Vercel deployment status
□ Check deployed commit matches expected version
□ Run local test suite: npm test -- auth workspace diagnosis
□ Identify root cause (auth/diagnosis/schema/infra)

IF AUTH FAILURE:
□ Review session handling changes
□ Check WorkspaceMembership queries
□ Run: npm test -- services/auth

IF DIAGNOSIS FAILURE:
□ Check db.$transaction() wrapping
□ Check schema field names (dueAt not dueDate, assignedTo not owner)
□ Run: npm test -- services/diagnosis-value-path

IF DATABASE ISSUE:
□ Check database connectivity
□ Check migration status
□ Review database error logs
□ Contact database team

IF INFRASTRUCTURE ISSUE:
□ Check Vercel deployment
□ Check edge network/Cloudflare status
□ Check API external health endpoint
□ Contact Vercel support if needed

IF RESOLVED:
□ Push fix to main
□ Monitor Vercel deployment
□ Manually trigger workflow
□ Confirm smoke passes
□ Document root cause

IF UNRESOLVED > 1 HOUR:
□ Contact platform team
□ Request incident response
□ Consider rollback if critical
```

---

## Manual Testing

To manually run a smoke test outside the schedule:

**Signup Smoke**:
```bash
cd /home/user/OPsIq
npx tsx scripts/smoke-production-signup-dashboard.ts
```

**Diagnosis Smoke**:
```bash
cd /home/user/OPsIq
npx tsx scripts/smoke-production-diagnosis-dashboard.ts
```

**Or via GitHub Actions**:
1. Go to https://github.com/arnab-netizen/OPsIq/actions
2. Select the workflow ("Production Signup Dashboard Smoke Test" or "Production Diagnosis → Dashboard Smoke Test")
3. Click "Run workflow"
4. Optionally override base_url (default: https://o-ps-iq.vercel.app)
5. Click green "Run workflow" button
6. Monitor run in Actions tab

---

## Monitoring Contract

This gate guarantees:

✅ **Daily coverage**: Both critical paths tested every 24 hours  
✅ **Deployment verification**: Build-info endpoint confirms correct commit deployed  
✅ **Signup path**: User creation, workspace creation, session auth all proven daily  
✅ **Diagnosis path**: Engagement creation, atomic writes, workspace isolation proven daily  
✅ **Real data validation**: Mock data detection confirms live data, not fallback  
✅ **Failure visibility**: Detailed logs and escalation checklist on every failure  
✅ **No silent breakage**: Any regression caught within 24 hours  

---

## Maintenance

### Schedule Adjustments

If you need to change schedules:
- Edit `.github/workflows/smoke-production-signup-dashboard.yml` line 11-12
- Edit `.github/workflows/smoke-production-diagnosis-dashboard.yml` line 10-11
- Cron format: `"15 2 * * *"` = `minute hour * * *` (all months, all days, all weekdays)
- Commit and push

### Disabling Temporarily

If maintenance is planned:
1. Comment out the `schedule:` section in both workflows
2. Keep `workflow_dispatch:` for manual testing
3. Commit and push
4. Uncomment after maintenance

### Adding More Paths

To monitor additional paths:
1. Create new smoke script in `scripts/smoke-production-*.ts`
2. Create new workflow in `.github/workflows/smoke-production-*.yml`
3. Add cron schedule (ensure no time conflicts)
4. Test locally first
5. Commit and document

---

## Final Decision

### 🟢 PRODUCTION_MONITORING_SCHEDULED_SMOKE_GATE_READY

**Implementation Status**:
✅ Signup → Dashboard smoke: Scheduled daily at 2:15 AM UTC  
✅ Diagnosis → Dashboard smoke: Scheduled daily at 2:45 AM UTC  
✅ Failure alerting: Detailed logs + escalation checklist  
✅ Manual trigger: Still available (workflow_dispatch)  
✅ Node 22 runtime: Both workflows confirmed on Node 22  
✅ YAML validation: Both workflows pass Python YAML parser  

**Coverage**:
- User signup and onboarding flow (daily tested)
- Authentication and workspace isolation (daily tested)
- Business diagnosis creation and atomicity (daily tested)
- Dashboard real data validation (daily tested)
- Mock data detection (daily tested)
- Vercel deployment health (daily tested)

**Alert Response Time**:
- Failure detected: Immediately (within workflow timeout)
- Available via: GitHub Actions UI, workflow logs
- Escalation checklist: Provided in logs on failure
- Manual re-test: Available on demand

**Risk Mitigation**:
- 24-hour maximum undetected regression window
- Detailed failure diagnostics for quick triage
- Staggered schedules reduce load impact
- Both manual and automatic triggers available
- No dependency on external services (GitHub Actions native)

**Production Status**: READY FOR CONTINUOUS MONITORING

---

**Implementation Date**: 2026-06-01  
**Status**: ✅ ACTIVE  
**Frequency**: Daily (2 workflows, staggered)  
**Next Review**: 2026-06-08 (after first week of scheduled runs)  
**Maintenance Contact**: DevOps / Platform Team
