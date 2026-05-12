# OPSIQ EXECUTION CONTRACT v4.0
# FORENSIC AUDIT INTEGRATED — BLOCKER-DRIVEN ROADMAP — NO FALSE GREEN

**Date Updated:** 2026-05-12 (Post-Forensic Audit)  
**Audit Source:** AUDIT_MASTER_REPORT.md + NEXT_EXECUTION_QUEUE.md  
**Enforcement:** Absolute proof-only completion, no mocks, no test-only success  

---

# CRITICAL PREAMBLE

This execution contract is built from a forensic audit that found:
- **CRITICAL BUG:** Growth engines leak data between workspaces (tenant isolation broken)
- **CRITICAL:** 96 tests failing in growth engines (pricing, retention, acquisition, unit economics)
- **CRITICAL:** 21 test files contain fake placeholder tests `expect(true).toBe(true)`
- **CRITICAL:** Database schema not deployed (DATABASE_URL missing)
- **CRITICAL:** Rate limiting/entitlement middleware not integrated into protected routes

**Repo is currently 46% deployment-ready.** This contract defines the exact path to 100%.

**No phase is green unless all 10 proof criteria below are satisfied.**

---

# ABSOLUTE RULES: NO FALSE GREEN

## Rule 1: Compilation Is Not Completion
`npm run build` passing does not mean phase is complete.
`npx tsc --noEmit` passing does not mean phase is complete.
Tests passing does not mean phase is complete.

A phase is COMPLETE_VERIFIED only when ALL criteria below are true:

1. **Implementation Exists**
   - Code files created/modified
   - Service/handler/route implemented
   - Domain contracts defined

2. **Runtime Wiring Exists**
   - Routes are called by real requests (not mocks)
   - Services are called from routes (not test-only)
   - Middleware is applied to routes (not optional)
   - API responses follow DTO contracts (not raw models)

3. **Persistence Exists (Where Required)**
   - Data lives in database, not memory
   - Migrations deployed and verified
   - Schema validated with `npx prisma validate`
   - Replayability tested (fresh migration → same state)

4. **Authorization Is Enforced**
   - All protected routes use `withAuth()` middleware
   - Capability checks on privileged operations
   - Workspace context is validated before data access
   - Fail-closed on missing auth/capability/workspace

5. **Tenant Isolation Is Enforced**
   - Cross-workspace tests exist and pass
   - Data leak tests exist and pass
   - No fetch-then-filter patterns
   - Query parameter validation prevents cross-workspace access

6. **Idempotency Is Enforced (Where Required)**
   - POST/PATCH endpoints use Idempotency-Key
   - Duplicate requests return cached response
   - Idempotency store persists across restarts
   - Tests prove idempotency works under replay

7. **Audit/Event Behavior Exists (Where Required)**
   - Material operations emit audit events
   - Events include workspace context
   - Audit trail queryable (except BLOCKED on DB)
   - Event ordering enforced

8. **Failure Paths Are Tested**
   - Missing auth → 401
   - Missing capability → 403
   - Missing workspace → 400
   - Missing data → 404
   - Invalid input → 400 with validation errors
   - Quota exceeded → 429
   - Rate limit exceeded → 429

9. **Cross-Workspace Leakage Test Exists And Passes**
   - Test creates workspace A, workspace B
   - Workspace A operation uses B's data
   - System blocks or returns empty/error
   - Test verifies no data exposure

10. **Integration Test Exists And Passes**
    - Full path from route → service → persistence → DTO
    - Real HTTP requests (not mocked)
    - Real database (not in-memory)
    - Verification command proves it

## Rule 2: Fake Tests Are Blockers
Any test file containing `expect(true).toBe(true)` is FAKE.
Fake tests must be replaced with real tests before claiming completion.
Counting fake tests in "tests passing" is forbidden.

## Rule 3: Stateless Services Are Unsafe
Services that accept `workspaceId` but don't verify workspace owns the data are UNSAFE.
Example: `RetentionEngine.getRetentionCurve(ws2, ws1_metrics)` returns data (WRONG).
Service must fail-closed: return empty, null, or error if workspace doesn't own data.

## Rule 4: In-Memory Is Not Production
In-memory stores are not production-deployable unless explicitly documented as intentional local-only.
Production persistence requires database with migrations deployed.
Mock-backed features must be documented as MOCK_BACKED, not COMPLETE.

## Rule 5: No Mocks For Enterprise Safety
Stripe webhook handling cannot be mocked.
Subscription enforcement cannot be mocked.
Rate limiting cannot be in-memory only.
Audit trail cannot be in-memory only.
Entitlement cannot be in-memory only.

These must work with real database, real async, real persistence.

---

# BLOCKER INVENTORY (From Forensic Audit)

All items below are BLOCKERS. None may be skipped. Order is mandatory.

## PHASE A: SAFETY BACKBONE (Must fix before feature work)

### A1: Fix Growth Engine Workspace Isolation Bug
**Status:** BLOCKER  
**Root Cause:** RetentionEngine, AcquisitionEngine, PricingEngine, SalesPipelineEngine, UnitEconomicsEngine accept workspaceId parameter but don't verify workspace owns queried data. Stateless services process input without validation.  
**Symptom:** Any workspace can query any other's metrics (data leakage).  
**Test Failure:** 96 tests failing in growth/*/test.ts (workspace isolation checks)  
**Files Affected:**
- `src/services/growth/retention-engine.ts`
- `src/services/growth/acquisition-engine.ts`
- `src/services/growth/pricing-engine.ts`
- `src/services/growth/sales-pipeline-engine.ts`
- `src/services/growth/unit-economics-engine.ts`

**Implementation Steps:**
1. Add workspace-scoped data store to each engine (Map<workspaceId, Data[]>)
2. Validate workspace ownership before returning data
3. Return empty/null/error if workspace doesn't own data
4. Add tenant isolation tests for each engine
5. Run `npm test -- growth` until 96 tests PASS

**Verification Commands:**
```bash
npm test -- growth
# Output: Tests 96 passed (96)

npm test -- workspace-isolation
# Output: All cross-workspace checks pass
```

**Required Tests:**
- RetentionEngine cross-workspace test: PASS
- AcquisitionEngine cross-workspace test: PASS
- PricingEngine cross-workspace test: PASS
- SalesPipelineEngine cross-workspace test: PASS
- UnitEconomicsEngine cross-workspace test: PASS

**Tenant Isolation:** ENFORCED per engine
**Authorization:** N/A (data-level isolation)
**Persistence:** In-memory stores (pre-Database upgrade)
**Audit:** N/A
**Rollback Risk:** LOW (bug fix only)
**Deployment Risk:** LOW (fixes broken behavior)
**Monetization Impact:** CRITICAL (revenue calculations currently broken)
**Enterprise Impact:** CRITICAL (data security)
**Definition of Done:** All 96 growth-engine tests pass for the correct reason (workspace isolation enforced)

---

### A2: Replace Fake Placeholder Tests
**Status:** BLOCKER  
**Root Cause:** 21 test files contain `expect(true).toBe(true)` placeholder assertions instead of real tests.  
**Symptom:** Test coverage inflated by ~20%. Hidden bugs masked by shallow tests.  
**Files Affected:** 21 test files (src/__tests__/services/action.test.ts, api/decisions.test.ts, api/notifications.test.ts, ... 18 more)  
**Implementation Steps:**
1. For each file: identify all `expect(true).toBe(true)` assertions
2. Replace with real assertions:
   - Service logic tests: verify inputs/outputs
   - Route tests: verify status codes, response structure
   - Permission tests: verify auth enforcement
3. No removal of tests (every placeholder must become real)

**Verification Commands:**
```bash
npm test
# Output: Tests 3942 passed (3942) with 0 fake assertions remaining
```

**Required Tests:**
- All 99 test files pass
- Zero `expect(true).toBe(true)` remaining
- Real assertions verify behavior, not just compile success

**Definition of Done:** All 21 files have real tests, no placeholders remain

---

### A3: Run Full Test Suite Until All 3942 Tests Pass
**Status:** BLOCKER (Dependent on A1-A2)  
**Verification Commands:**
```bash
npm test
# Output: Test Files 0 failed | 99 passed (99)
#         Tests 0 failed | 3942 passed (3942)

npm run build
# Output: ✓ Compiled successfully (91 routes)

npx tsc --noEmit
# Output: (no output = success)
```

**Definition of Done:** All 3942 tests pass, zero failures, zero skipped

---

## PHASE B: DETERMINISTIC EXECUTION CORE

### B1: Fix Growth Engine Logic Bugs
**Status:** BLOCKER  
**Root Cause:** Growth engine thresholds miscalibrated. Strategy selection broken. Health classification off-by-one.  
**Symptom:** 
- PricingEngine returns SKIMMING instead of VALUE_BASED
- UnitEconomicsEngine classifies STRONG as MODERATE
- RetentionEngine risk assessment wrong
**Files Affected:**
- `src/services/growth/retention-engine.ts`
- `src/services/growth/pricing-engine.ts`
- `src/services/growth/unit-economics-engine.ts`

**Implementation Steps:**
1. Audit each engine's threshold logic
2. Verify thresholds match expected business rules
3. Add evidence/confidence states to outputs
4. Add contradiction detection
5. Test with known business scenarios

**Verification Commands:**
```bash
npm test -- growth
# Output: All growth logic tests pass
```

**Definition of Done:** All thresholds correct, all calculations match expected business rules

---

### B2: Add Database-Backed Stores for Growth Engines
**Status:** BLOCKER (Dependent on DATABASE_URL)  
**Root Cause:** In-memory stores don't persist, don't scale, can't support multi-instance.  
**Implementation Steps:**
1. Define Prisma models: RetentionMetrics, AcquisitionMetrics, PricingAnalysis, SalesPipelineData, UnitEconomicsAnalysis
2. Create migrations
3. Update growth engines to query database
4. Update tests to use database

**Verification Commands:**
```bash
npx prisma validate
# Output: Schema valid

npm test -- growth
# Output: All growth tests pass with database-backed stores
```

**Definition of Done:** Growth engines persist data, support multi-instance, survive restarts

---

## PHASE C: MONETIZATION ENFORCEMENT

### C1: Configure DATABASE_URL
**Status:** BLOCKER  
**Root Cause:** Environment variable not set.  
**Implementation Steps:**
1. Get PostgreSQL connection string
2. Set DATABASE_URL environment variable
3. Verify connectivity: `psql $DATABASE_URL -c "SELECT 1"`

**Verification Commands:**
```bash
echo $DATABASE_URL
# Output: postgresql://...

psql $DATABASE_URL -c "SELECT 1"
# Output: 1 (postgres returns success)

npx prisma validate
# Output: Schema valid 🚀
```

**Definition of Done:** DATABASE_URL set, Prisma validates, database connects

---

### C2: Deploy Database Migrations
**Status:** BLOCKER (Dependent on C1)  
**Implementation Steps:**
1. Run: `npx prisma migrate deploy`
2. Run: `npx prisma generate`
3. Verify schema with: `psql $DATABASE_URL -c "\dt"`

**Verification Commands:**
```bash
npx prisma migrate deploy
# Output: (success, all migrations applied)

npx prisma validate
# Output: Schema valid

npm run test:db
# Output: All DB tests pass
```

**Definition of Done:** All 30+ migrations deployed, schema matches Prisma model

---

### C3: Wire Entitlement Middleware Into Protected Routes
**Status:** BLOCKER  
**Root Cause:** EntitlementService exists but not enforced. Routes not wrapped with middleware.  
**Files Affected:** All POST/PATCH/DELETE routes in /api/actions, /api/decisions, /api/recommendations, /api/experiments  
**Implementation Steps:**
1. Apply entitlement middleware to all protected routes
2. Verify subscription tier before operation
3. Return 403 if tier doesn't support operation
4. Test permission matrix for all tiers

**Verification Commands:**
```bash
npm test -- entitlement
# Output: All entitlement tests pass

npm test -- permission-matrix
# Output: All tier/capability combinations correct
```

**Required Tests:**
- FREE tier: blocked from premium operations
- PRO tier: allowed premium operations
- ENTERPRISE tier: allowed all operations
- Downgrade: premium access revoked
- Cancellation: all access revoked

**Definition of Done:** Entitlement enforced on all protected routes, permission matrix verified

---

### C4: Wire Rate Limiting Middleware Into Protected Routes
**Status:** BLOCKER  
**Root Cause:** RateLimitMiddleware exists but routes not wrapped. ~50 routes need integration.  
**Files Affected:** All POST/PATCH/DELETE routes  
**Implementation Steps:**
1. Apply rate limiting middleware to all protected routes
2. Configure per-workspace limits
3. Return 429 when limit exceeded
4. Test rate limiting enforcement

**Verification Commands:**
```bash
npm test -- rate-limit
# Output: All rate limiting tests pass

npm run build
# Output: Build succeeds (91 routes, 0 errors)
```

**Required Tests:**
- Workspace rate limit enforced
- Per-IP rate limit enforced
- 429 response on limit exceeded
- Limit resets per window

**Definition of Done:** Rate limiting enforced on all protected routes

---

## PHASE D: ENTERPRISE OPERABILITY

### D1: Implement Admin Dashboard
**Status:** BLOCKER  
**Root Cause:** No workspace governance, no audit log querying, no team management.  
**Implementation Steps:**
1. POST /api/admin/workspaces (list all)
2. GET /api/admin/workspaces/[id]/members (list users)
3. GET /api/admin/audit-log (queryable with filters)
4. POST /api/admin/workspaces/[id]/disable (soft delete)

**Verification Commands:**
```bash
npm test -- admin
# Output: 50+ admin tests pass

npm run build
# Output: Build succeeds
```

**Definition of Done:** Admin can query workspaces, members, audit trail

---

### D2: Make Audit Trail Queryable
**Status:** BLOCKER (Dependent on C2 migrations)  
**Root Cause:** Audit events emitted but not queryable.  
**Implementation Steps:**
1. Create audit-log query service
2. Implement GET /api/admin/audit-log with filters (entityType, dateRange, status)
3. Add pagination
4. Add statistics aggregation

**Verification Commands:**
```bash
npm test -- audit-trail
# Output: 25+ audit query tests pass
```

**Definition of Done:** Audit trail queryable, filterable, paginable

---

### D3: Implement Webhook Infrastructure
**Status:** BLOCKER  
**Root Cause:** No event delivery to external systems.  
**Implementation Steps:**
1. POST /api/webhooks/subscribe
2. POST /api/webhooks/test
3. Webhook delivery with retry logic
4. HMAC-SHA256 signature verification

**Verification Commands:**
```bash
npm test -- webhooks
# Output: 40+ webhook tests pass
```

**Definition of Done:** Webhooks deliverable, verifiable, retryable

---

### D4: Add Backup/Restore Procedure
**Status:** BLOCKER  
**Implementation Steps:**
1. Document backup procedure (pg_dump)
2. Document restore procedure (psql)
3. Test backup → restore → verify data integrity
4. Automate backup schedule

**Definition of Done:** Backup/restore tested, automated, documented

---

### D5: Add Monitoring/Alerting
**Status:** BLOCKER  
**Implementation Steps:**
1. Configure error tracking (Sentry)
2. Configure metrics (CloudWatch/DataDog)
3. Configure alerts for: error rate > 1%, response time > 5s, database down
4. Configure liveness/readiness probes

**Definition of Done:** Monitoring configured, alerts functional, probes responding

---

### D6: Create Runbooks
**Status:** BLOCKER  
**Implementation Steps:**
1. Write runbook for: deployment, rollback, incident response, scaling
2. Document escalation procedures
3. Document on-call responsibilities

**Definition of Done:** Runbooks written, team trained

---

### D7: Establish Performance Baselines
**Status:** BLOCKER  
**Implementation Steps:**
1. Load test with 1000 concurrent users
2. Document response times: p50, p95, p99
3. Document throughput: requests/sec
4. Document resource usage: CPU, memory, database connections
5. Set alerting thresholds

**Definition of Done:** Baselines measured, thresholds set, alerts functional

---

## PHASE E: FINAL VERIFICATION

### E1: Run Complete Verification Suite
**Status:** GATE (All previous phases must be COMPLETE_VERIFIED)  
**Verification Commands:**
```bash
# Code Quality
npm run build
npx tsc --noEmit
npm test
npm test -- growth
npm test -- workspace-isolation
npm test -- permission-matrix
npm test -- dto-leakage

# Database
npx prisma validate
npx prisma migrate deploy
npm run test:db

# Enterprise
npm test -- admin
npm test -- audit-trail
npm test -- webhooks
npm test -- enterprise-safety

# Security
npm test -- idempotency
npm test -- entitlement
npm test -- rate-limit

# Final
npm run validate:deployment
```

**Definition of Done:** All commands succeed, zero failures

---

# /CONTINUE-BUILD ENFORCEMENT RULES

## Rule 1: Read execution.md First
`/continue-build` must:
1. Read execution.md in full
2. Read .claude/execution_state.json
3. Identify first non-COMPLETE_VERIFIED task in PHASE order
4. Select that task (do not skip ahead)

## Rule 2: No False Green
`/continue-build` must NOT mark a task COMPLETE_VERIFIED unless:
1. All 10 proof criteria are satisfied (see "Absolute Rules: No False Green")
2. Verification command succeeds with proof
3. Tests pass for the correct reason (not just pass)
4. No fake tests remain in that task's scope

## Rule 3: Stop On Blocker
If a task is BLOCKED on external resource:
1. Document the blocker
2. Move to next non-BLOCKED task
3. Report what's blocked and why
4. Do NOT invent workarounds

## Rule 4: Verify Every Claim
Every implementation claim must be proved:
- `npm run build` must succeed
- `npx tsc --noEmit` must pass
- `npm test` must pass (relevant subset)
- Verification command must succeed
- Integration test must exist and pass

## Rule 5: Never Weaken Tests
`/continue-build` must NEVER:
- Disable failing tests
- Rename failing tests to `*.skip`
- Delete failing test assertions
- Weaken test expectations to make them pass
- Mark placeholder tests as real

If test fails, fix the code, not the test.

## Rule 6: Update Status With Proof
Every status update to execution_state.json must include:
- Verification command output
- Test results (file count, pass/fail)
- Files modified
- Git commit hash

## Rule 7: Commit After Each Task
After completing each task:
1. Run verification commands
2. Verify tests pass
3. Commit to branch with message including task ID
4. Push to remote

## Rule 8: One Task Per Run
`/continue-build` completes exactly ONE task per invocation.
Do not proceed to next task.
Stop and report completion status.

---

# FINAL 100% GREEN CRITERIA (Definition of Done for Entire Project)

Repo is 100% green and deployable when ALL are true:

1. **All tests pass**
   - `npm test` → 3942 tests pass, 0 fail, 0 skip
   - `npm test -- growth` → 96 tests pass
   - `npm test -- workspace-isolation` → all pass
   - `npm test -- permission-matrix` → all pass
   - `npm test -- dto-leakage` → all pass
   - `npm test -- enterprise-safety` → all pass

2. **No fake tests remain**
   - Zero `expect(true).toBe(true)` assertions
   - All 99 test files contain real assertions

3. **All P0/P1 blockers COMPLETE_VERIFIED**
   - A1: Growth engine isolation bug fixed
   - A2: Fake tests replaced
   - A3: Full test suite passing
   - B1: Growth engine logic fixed
   - B2: Database-backed stores deployed
   - C1: DATABASE_URL configured
   - C2: Migrations deployed
   - C3: Entitlement middleware integrated
   - C4: Rate limiting middleware integrated
   - D1: Admin dashboard implemented
   - D2: Audit trail queryable
   - D3: Webhooks implemented
   - D4: Backup/restore tested
   - D5: Monitoring/alerting configured
   - D6: Runbooks written
   - D7: Performance baselines established

4. **No cross-workspace data leakage**
   - Cross-workspace tests pass for every engine
   - Integration tests prove isolation

5. **All protected routes enforce security**
   - Auth enforcement on all protected routes
   - Capability checks on privileged operations
   - Workspace scoping on data access
   - Entitlement checks on subscription features
   - Rate limiting on all write operations

6. **Database is production-ready**
   - All 30+ migrations deployed
   - Schema validates: `npx prisma validate`
   - Replayability tested: fresh migration → same state
   - Backup/restore tested

7. **Audit trail is complete**
   - All material operations emit events
   - Audit trail queryable
   - Event ordering enforced
   - Hash chain validated

8. **Monetization path is enforceable**
   - Subscription tiers enforced
   - Quota tracking persistent
   - Rate limits enforced
   - Stripe webhooks idempotent
   - Webhook retry logic tested

9. **Enterprise governance exists**
   - Admin dashboard implemented
   - Workspace member management
   - Audit log queryable
   - Export redaction verified
   - SSO/saml configured (if required)

10. **Operational readiness verified**
    - Monitoring alerts configured
    - Backup/restore tested
    - Runbooks written
    - Performance baselines established
    - CI passes from clean checkout
    - `npm run validate:deployment` succeeds

---

# EXECUTION STATE TEMPLATE

Every task must update .claude/execution_state.json with:

```json
{
  "task_id": "A1",
  "phase": "SAFETY_BACKBONE",
  "status": "COMPLETE_VERIFIED | PARTIAL | BLOCKER | TODO",
  "root_cause": "description",
  "files_modified": ["file1.ts", "file2.ts"],
  "implementation_steps_completed": [
    "Step 1: ...",
    "Step 2: ..."
  ],
  "verification_commands_run": [
    "npm test -- growth",
    "npm test -- workspace-isolation"
  ],
  "verification_results": {
    "npm_test_growth": "96 tests passed",
    "npm_test_workspace_isolation": "passed",
    "npm_run_build": "succeeded",
    "npx_tsc": "passed"
  },
  "tests_added": "50+ tenant isolation tests",
  "tenant_isolation_enforced": true,
  "authorization_enforced": false,
  "persistence_required": false,
  "audit_events_required": false,
  "rollback_risk": "LOW",
  "deployment_risk": "LOW",
  "monetization_impact": "CRITICAL",
  "enterprise_impact": "CRITICAL",
  "git_commit": "abc123def456",
  "pushed_to_remote": true,
  "definition_of_done_met": true,
  "notes": "Growth engine workspace isolation bug fixed. All 96 tests pass for the correct reason."
}
```

---

# PHASE ORDERING (Mandatory)

Execute tasks in this exact order. Do not skip. Do not reorder.

1. PHASE A: SAFETY BACKBONE
   - A1: Fix growth engine workspace isolation
   - A2: Replace fake placeholder tests
   - A3: Run full test suite

2. PHASE B: DETERMINISTIC EXECUTION
   - B1: Fix growth engine logic bugs
   - B2: Add database-backed stores

3. PHASE C: MONETIZATION
   - C1: Configure DATABASE_URL
   - C2: Deploy migrations
   - C3: Wire entitlement middleware
   - C4: Wire rate limiting middleware

4. PHASE D: ENTERPRISE
   - D1: Admin dashboard
   - D2: Audit trail queryability
   - D3: Webhook infrastructure
   - D4: Backup/restore
   - D5: Monitoring/alerting
   - D6: Runbooks
   - D7: Performance baselines

5. PHASE E: VERIFICATION
   - E1: Run complete verification suite

---

# DEPLOYMENT READINESS GATE

Before deploying to production, VERIFY:

```bash
# Code Quality
npm run build  # ✓ must succeed
npx tsc --noEmit  # ✓ must pass
npm test  # ✓ all 3942 tests pass

# Database
npx prisma validate  # ✓ must pass
npx prisma migrate deploy  # ✓ must succeed
npm run test:db  # ✓ all DB tests pass

# Security
npm test -- workspace-isolation  # ✓ must pass
npm test -- permission-matrix  # ✓ must pass
npm test -- dto-leakage  # ✓ must pass

# Enterprise
npm test -- admin  # ✓ must pass
npm test -- audit-trail  # ✓ must pass
npm test -- enterprise-safety  # ✓ must pass

# Readiness
npm run validate:deployment  # ✓ must succeed
```

If any command fails, DO NOT DEPLOY. Investigate and fix.

---

# TRACKING & STATUS

Current Status: 46% deployment-ready  
Next Action: Implement task A1 (fix growth engine workspace isolation)  
First /continue-build Target: A1  

---

**Version:** v4.0-FORENSIC-AUDIT-INTEGRATED  
**Last Updated:** 2026-05-12  
**Audit Source:** AUDIT_MASTER_REPORT.md + NEXT_EXECUTION_QUEUE.md  
**Enforcement:** Absolute proof-only, zero false green, zero mocks for enterprise safety
