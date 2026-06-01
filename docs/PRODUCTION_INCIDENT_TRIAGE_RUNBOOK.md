# Production Incident Triage Runbook

**Version**: 1.0  
**Date**: 2026-06-01  
**Updated**: 2026-06-01  
**Owner**: DevOps / Platform Team  

---

## Purpose

This runbook provides a systematic approach to diagnosing and resolving production incidents in OpsIQ. It covers:
- What to do when a scheduled smoke test fails
- How to classify incident severity (P0-P3)
- Step-by-step triage procedures for 16 failure classes
- When to rollback vs. fix
- When to escalate
- Incident closure requirements

**Goal**: Resolve production issues within 15-60 minutes depending on severity, without ad hoc debugging.

---

## Current Verified Production Paths

### 1. Signup → Owner Dashboard
**Coverage**: User signup, workspace creation, session authentication, dashboard access  
**Scheduled Test**: Daily 2:15 AM UTC  
**Success Criteria**: Status 201 signup, 200 dashboard, session cookie present, real data returned  
**P0 Impact**: Users cannot create accounts or onboard

### 2. Diagnosis → Dashboard
**Coverage**: Diagnosis creation, engagement/recommendations/actions, dashboard display  
**Scheduled Test**: Daily 2:45 AM UTC  
**Success Criteria**: Status 201 diagnosis, engagement created, recommendations visible (not mock)  
**P0 Impact**: Users cannot run diagnoses or see consulting results

---

## Scheduled Smoke Workflows

| Workflow | File | Time (UTC) | Frequency | Triggers On |
|----------|------|-----------|-----------|------------|
| Signup → Dashboard | `.github/workflows/smoke-production-signup-dashboard.yml` | 2:15 AM | Daily | schedule + workflow_dispatch |
| Diagnosis → Dashboard | `.github/workflows/smoke-production-diagnosis-dashboard.yml` | 2:45 AM | Daily | schedule + workflow_dispatch |

**Where to Monitor**:
- GitHub Actions: https://github.com/arnab-netizen/OPsIq/actions
- Workflow failure messages include detailed diagnostics
- Each failure includes severity, likely causes, and escalation checklist

---

## Severity Classification Model

### P0: Production Critical (Response: IMMEDIATE - 15 min)
**Definition**: Core verified value path is broken; users cannot use critical workflow.

**Examples**:
- Signup endpoint returns 5xx (users cannot create accounts)
- Diagnosis endpoint returns 5xx (users cannot run diagnoses)
- Dashboard endpoint returns 5xx (users cannot see results)
- Session/auth validation fails (users cannot authenticate)
- Workspace isolation broken (users reading other workspaces)
- Transaction failure in diagnosis (partial records created)
- Concurrency bug (execution stack mismatch)
- Mock/fallback data in production

**Required Action**:
1. Notify team immediately (page on-call if available)
2. Identify root cause (see triage matrix below)
3. Fix locally OR rollback last commit
4. Deploy fix or validated rollback
5. Re-run smoke workflow to confirm fix

**Escalation**: Page on-call engineer, consider rollback without full testing

---

### P1: Security / Isolation Risk (Response: URGENT - 30 min)
**Definition**: Auth/session/workspace isolation regression or security concern.

**Examples**:
- Invalid session not rejected (returns 200 instead of 401)
- Missing session not rejected
- Dashboard returns data from wrong workspace
- Idempotency key not validated
- Workspace context not verified
- CORS/security header missing

**Required Action**:
1. Verify isolation is still intact (run tests: npm test -- workspace auth)
2. Assess scope of potential data exposure
3. Notify security team
4. Fix the isolation regression
5. Re-run full test suite before deploying

**Escalation**: Notify security team, assess data exposure scope

---

### P2: Monitoring / Observability Degraded (Response: STANDARD - 1-2 hours)
**Definition**: Monitoring/deployment/observability degraded but core paths still working.

**Examples**:
- Smoke test timeout (but real users can still use the app)
- Build-info endpoint unavailable (but app deployed correctly)
- Error logging reduced or unavailable
- Scheduled workflow not triggering
- Workflow logs incomplete
- Non-critical environment variable missing
- HTTP status code incorrect but data correct

**Required Action**:
1. Verify core path still works (manual test or check production metrics)
2. Investigate root cause
3. Fix monitoring/observability issue
4. Update documentation if needed

**Escalation**: Notify devops/platform team, standard PR review

---

### P3: Non-Critical / Documentation (Response: PLANNING - business hours)
**Definition**: Non-blocking issue, documentation, or minor observability gap.

**Examples**:
- Typo in error message
- Documentation outdated
- Workflow comment unclear
- Non-critical test flaky
- Unused code or dead imports
- Minor performance warning

**Required Action**:
1. Document in issue or PR
2. Fix in next sprint/release
3. No urgent action needed

**Escalation**: None (standard PR review)

---

## First 15-Minute Response Checklist

### When a Smoke Fails:

**Minute 0-2**: Identify the failure
- [ ] Check GitHub Actions tab: https://github.com/arnab-netizen/OPsIq/actions
- [ ] Find the failed workflow run (Signup or Diagnosis smoke)
- [ ] Read the workflow log output
- [ ] Note the failure class (e.g., "SIGNUP_FAILED", "BUILD_INFO_ENDPOINT_FAILED")

**Minute 2-5**: Check deployment status
- [ ] Go to Vercel: https://vercel.com/arnab-netizen/opsiq
- [ ] Verify production deployment status (green or red?)
- [ ] Check deployed commit SHA
- [ ] Are there recent commits or rollbacks?

**Minute 5-8**: Verify it's actually broken
- [ ] Check production health manually (if safe to do so)
- [ ] Query build-info: `curl https://o-ps-iq.vercel.app/api/internal/build-info | jq .`
- [ ] Try signup in staging (if available)
- [ ] Check error response in workflow logs (classification, failingOperation, safeMessage)

**Minute 8-12**: Classify severity
- [ ] Is a core verified path broken? → P0
- [ ] Is there a security/isolation concern? → P1
- [ ] Is monitoring/observability broken but app working? → P2
- [ ] Is it documentation or minor? → P3

**Minute 12-15**: Begin triage
- [ ] Refer to Smoke Failure Triage Matrix (below)
- [ ] Find your failure class
- [ ] Check "first_logs_to_check" and "first_files_to_inspect"
- [ ] Run the suggested local test if P0/P1

### Escalation Decision (Minute 15)
- **P0**: Page on-call, consider rollback
- **P1**: Notify security team
- **P2**: Notify devops team
- **P3**: File issue for later

---

## Smoke Failure Triage Matrix

### Failure Class: build-info unavailable (403 or 5xx)
**Severity**: P2  
**Likely Root Cause**: Vercel security rule, Cloudflare WAF, edge network issue  
**First Check**: Response headers (`x-deny-reason`, `cf-ray`, `x-vercel-id`)  
**First Files**: `src/app/api/internal/build-info/route.ts`, `vercel.json`  
**Action**:
- If 403 with `x-deny-reason`: Check Vercel security settings (not app issue)
- If 5xx: Check Vercel build logs
- Workaround: Trigger workflow manually with explicit commit SHA

---

### Failure Class: deployed commit mismatch
**Severity**: P0  
**Likely Root Cause**: Deployment in progress, rollback occurred, webhook delayed  
**First Check**: Vercel deployment dashboard for build status  
**Action**:
- Increase timeout in workflow if Vercel build is slow
- Check if Vercel build failed (go to Vercel logs)
- Wait for deployment to complete and retry

---

### Failure Class: signup fails (status != 201)
**Severity**: P0  
**Likely Root Cause**: Database error, user/workspace/membership creation failed, Prisma schema issue  
**First Check**: Smoke script output (error response body), error classification  
**First Files**: `src/app/api/auth/signup/route.ts`, `prisma/schema.prisma`  
**Action**:
- Check for Prisma error codes (field name mismatch?)
- Verify database connectivity
- Check recent commits for breaking changes
- If schema issue: Search for wrong field names (e.g., "dueDate" should be "dueAt")
- Rollback if unable to fix quickly

---

### Failure Class: session cookie missing
**Severity**: P0  
**Likely Root Cause**: Session creation failed, cookie setting middleware issue  
**First Check**: POST response headers (Set-Cookie), error response  
**First Files**: `src/app/api/auth/signup/route.ts` (lines 101-129)  
**Action**:
- Verify `db.session.create()` succeeded in logs
- Verify `cookieStore.set()` is called
- Check NODE_ENV and secure/httpOnly flags

---

### Failure Class: diagnosis fails (status != 201)
**Severity**: P0  
**Likely Root Cause**: Transaction not working, schema mismatch, workspace context missing  
**First Check**: POST response (error classification, failingOperation, Prisma error code)  
**First Files**: `src/services/diagnosis.ts`, `prisma/schema.prisma`, `src/app/api/diagnosis/route.ts`  
**Action**:
- If Prisma error: Fix field names (dueAt, assignedTo)
- Verify `db.$transaction()` wrapping of record creation
- Verify workspace context is passed to service
- Run local test: `npm test -- diagnosis transaction`

---

### Failure Class: PrismaClientValidationError
**Severity**: P0 (if writes), P3 (if reads)  
**Likely Root Cause**: Field name mismatch, invalid enum, unknown field  
**First Check**: Error message (look for "Unknown argument" or "Unknown field")  
**Action**:
- Search codebase for wrong field name
- Fix all occurrences
- Verify migration is applied
- Run: `npm test -- diagnosis action`

---

### Failure Class: execution stack mismatch
**Severity**: P1  
**Likely Root Cause**: Module-level shared state, AsyncLocalStorage not isolated  
**First Check**: Error message pattern "EXECUTION STACK MISMATCH"  
**First Files**: `src/lib/execution-reentry-detector.ts`  
**Action**:
- Verify AsyncLocalStorage is used for request-scoped context
- Never use module-level mutable arrays
- Rollback to commit 6772aef1 (known good) if needed
- File incident for concurrency investigation

---

### Failure Class: diagnosis returns wrong HTTP status (200 instead of 201)
**Severity**: P2  
**Likely Root Cause**: Return statement missing explicit status  
**First Check**: POST response status  
**First Files**: `src/app/api/diagnosis/route.ts` (line 72)  
**Action**:
- Verify return includes `{ status: 201 }`
- Run local smoke: `npx tsx scripts/smoke-production-diagnosis-dashboard.ts`

---

### Failure Class: engagements query fails
**Severity**: P1  
**Likely Root Cause**: Workspace context missing, isolation regression  
**First Check**: Error response (classification, verifiedWorkspaceId)  
**First Files**: `src/app/api/engagements/route.ts`  
**Action**:
- Verify query filters by `workspaceId: verifiedWorkspaceId`
- Check canonical enforcement is applied
- Run: `npm test -- workspace engagements`

---

### Failure Class: owner dashboard API fails
**Severity**: P0  
**Likely Root Cause**: Service error, workspace context missing, database query failed  
**First Check**: Error response (failingOperation indicates which service failed)  
**First Files**: `src/app/api/owner/dashboard/route.ts`, `src/services/owner-mode/dashboard.service.ts`  
**Action**:
- Check which service call failed (logs show failingOperation)
- Verify database connectivity
- Check recent changes to dashboard service
- Run: `npm test -- owner-dashboard`

---

### Failure Class: mock UUID detected (550e8400-e29b-41d4-a716-446655440000)
**Severity**: P0  
**Likely Root Cause**: Hardcoded mock UUID in production, fallback data shipped  
**First Check**: Smoke output (mock detection results), dashboard API response  
**Action**:
- Search codebase: `grep -r "550e8400" src/`
- Remove any hardcoded test data
- Verify no fallback logic shipping demo data
- Add detection to CI

---

### Failure Class: mock arrays detected (mockEngagementSnapshots, etc.)
**Severity**: P0  
**Likely Root Cause**: Demo field names in production, fallback logic  
**First Check**: Dashboard API response (search for `mock*`)  
**Action**:
- Search: `grep -r "mockEngagementSnapshots\|mockActions\|mockKPIs" src/`
- Remove all mock field definitions
- Verify response contains only real data fields
- Add detection to CI

---

### Failure Class: empty state invalid
**Severity**: P2  
**Likely Root Cause**: Missing fields in empty state, wrong field types  
**First Check**: Dashboard response for new workspace  
**Action**:
- Ensure all required fields present (even if 0 or [])
- Verify `engagementCount: 0`, `actionQueueSize: 0`
- Verify `topRisks: []`, `recommendedActions: []`

---

### Failure Class: workflow runtime failure
**Severity**: P2  
**Likely Root Cause**: Node 22 issue, npm ci failed, env var missing  
**First Check**: Setup Node.js step output, npm ci logs  
**Action**:
- Verify `.github/workflows/` has `node-version: "22"`
- Check `package-lock.json` for conflicts
- Retry with "Re-run failed jobs"

---

### Failure Class: scheduled workflow not running
**Severity**: P2  
**Likely Root Cause**: Cron syntax invalid, workflow file not in main, schedule too new  
**First Check**: GitHub Actions tab (no runs appearing)  
**Action**:
- Verify cron syntax with crontab.guru
- Ensure workflow file is in main branch
- Check GitHub Actions settings
- Manual trigger available: Actions tab → workflow → "Run workflow"

---

## Rollback Decision Rules

**Rollback Immediately If**:
- P0 severity and cannot identify root cause within 10 minutes
- P1 security concern and data exposure confirmed
- Transaction/atomicity bug causing partial writes
- Concurrency bug (execution stack mismatch)
- Mock/fallback data shipped to production

**Rollback With Testing If**:
- P0 severity but root cause is clear (e.g., field name fix)
- Fix is trivial and can be deployed as hotfix instead

**Don't Rollback, Fix Instead If**:
- Root cause found and fix is trivial (< 5 minutes)
- P2 severity (monitoring/observability)
- P3 severity (documentation)

**How to Rollback**:
```bash
git log --oneline | head -10  # Find last known good commit
git revert <commit-sha>        # Create revert commit (safe, maintains history)
git push -u origin main        # Push revert
# Wait for Vercel deployment, then re-run smoke test
```

---

## When to Stop Feature Work

**Immediately stop and address if**:
- P0 incident (core path broken)
- P1 incident (security/isolation)
- Scheduled smoke test fails

**Can wait until next meeting if**:
- P2 incident (monitoring degraded)
- P3 incident (documentation)

---

## When to Update Proof/Closure Docs

**Update Documentation If**:
- Root cause was a schema issue that wasn't caught
- Monitoring gap was identified
- New failure class discovered
- Incident response time was too long

**Files to Update**:
- `docs/PRODUCTION_INCIDENT_TRIAGE_RUNBOOK.md` (this file)
- `docs/PRODUCTION_MONITORING_SCHEDULED_SMOKE_GATE.md` (if monitoring gaps)
- `docs/AUTH_SESSION_WORKSPACE_ISOLATION_GATE.md` (if isolation gaps found)

---

## Incident Closure Requirements

An incident is **CLOSED** only when:

1. ✅ **Root cause identified**
   - Document what went wrong
   - Link to code/commit/issue

2. ✅ **Fix verified locally**
   - Run affected test suite: `npm test -- [category]`
   - Run smoke locally: `npx tsx scripts/smoke-production-*.ts`
   - Verify build: `npm run build`

3. ✅ **Fix deployed to production**
   - Commit pushed to main
   - Vercel deployment confirmed green
   - Deployed commit matches expected version

4. ✅ **Smoke tests passing**
   - Run scheduled smoke manually (or wait for next scheduled run)
   - Verify both signup and diagnosis smokes pass
   - Check all assertions in smoke logs (deployment, signup, dashboard, mock detection)

5. ✅ **Post-incident review completed**
   - What happened?
   - Why did monitoring/tests not catch it earlier?
   - What needs to change?
   - Update runbook if needed

---

## Example Incident: Diagnosis Returns 200 Instead of 201

**Timeline**:
- 02:45 AM UTC: Diagnosis smoke fails
- 02:47 AM: Alarm fires (GitHub Actions notification)
- 02:52 AM: Engineer opens workflow logs
- 02:54 AM: Identifies status is 200 (response has data but wrong status)
- 02:56 AM: Checks recent commits, finds diagnosis/route.ts change
- 02:58 AM: Verifies fix: add `{ status: 201 }` to return statement
- 03:00 AM: Commits fix, pushes to main
- 03:05 AM: Vercel deployment confirmed
- 03:07 AM: Manually re-runs smoke workflow
- 03:09 AM: Smoke passes, incident closed

**Severity**: P2 (logic issue, but smoke caught it, no data loss)  
**Response Time**: 6 minutes (within P2 SLA of 1-2 hours)  
**Status**: ✅ CLOSED

---

## Summary

| Severity | Response Time | Escalation | Action |
|----------|---|---|---|
| P0 | 15 min | Page on-call | Fix or rollback immediately |
| P1 | 30 min | Notify security | Verify isolation, fix, test |
| P2 | 1-2 hours | Notify devops | Investigate, restore monitoring |
| P3 | Business hours | None | File issue for review |

**First 15 Minutes Always**:
1. Identify the failure
2. Check deployment status
3. Verify it's actually broken
4. Classify severity
5. Begin triage using matrix

**Key Files**:
- Workflows: `.github/workflows/smoke-production-*.yml`
- Critical routes: `src/app/api/*/route.ts`
- Services: `src/services/`
- Triage guide: This file + Smoke Failure Triage Matrix

**Contact**: DevOps / Platform Team

---

**Last Updated**: 2026-06-01  
**Version**: 1.0  
**Next Review**: 2026-06-08 (after first week of scheduled runs)
