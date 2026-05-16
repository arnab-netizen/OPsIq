# R1-D-1: Batch Selection

**Date:** 2026-05-16  
**Phase:** R1-D-1 (Batch Selection - Implementation Ready)  
**Decision:** ✓ SELECT 7 LOWEST-RISK ROUTES FOR R1-D IMPLEMENTATION

---

## Selected Routes for R1-D Implementation

**Total Selected:** 7 routes  
**Risk Level:** VERY LOW (complexity score 1)  
**Estimated Violations:** 40  
**Estimated Handlers:** 14 (2 per route average)  
**Expected Critical Reduction:** ~25 (estimated)  
**Confidence Level:** VERY HIGH (minimal business logic)  

### Selected Route List

1. **src/app/api/notifications/[id]/route.ts**
   - Handlers: GET (retrieve notification), DELETE (remove notification)
   - Violations: 6
   - Complexity: LOW (simple read/delete operations)
   - Risk Score: 1
   - Service Calls: getNotification, deleteNotification
   - Pattern: Standard REST resource operations

2. **src/app/api/clients/[clientId]/route.ts**
   - Handlers: GET (retrieve client), PATCH (update client)
   - Violations: 5
   - Complexity: LOW (standard CRUD)
   - Risk Score: 1
   - Service Calls: getClient, updateClient
   - Pattern: Standard REST resource operations

3. **src/app/api/governance/alerts/route.ts**
   - Handlers: GET (list alerts), POST (create alert)
   - Violations: 6
   - Complexity: LOW (simple aggregation)
   - Risk Score: 1
   - Service Calls: listAlerts, createAlert
   - Pattern: Standard collection operations

4. **src/app/api/entitlement/quota/route.ts**
   - Handlers: GET (check quota)
   - Violations: 6
   - Complexity: LOW (read-only, single service call)
   - Risk Score: 1
   - Service Calls: checkQuotaUsage
   - Pattern: Simple read-only query

5. **src/app/api/observability/summary/route.ts**
   - Handlers: GET (build summary)
   - Violations: 6
   - Complexity: LOW (aggregation, read-only)
   - Risk Score: 1
   - Service Calls: buildObservabilitySummary
   - Pattern: Summary generation

6. **src/app/api/clients/[clientId]/contacts/[contactId]/route.ts**
   - Handlers: GET (retrieve contact), PATCH (update contact)
   - Violations: 5
   - Complexity: LOW (standard CRUD)
   - Risk Score: 1
   - Service Calls: getContact, updateContact
   - Pattern: Nested resource operations

7. **src/app/api/growth/revenue-streams/route.ts**
   - Handlers: GET (list streams), POST (create stream)
   - Violations: 6
   - Complexity: LOW-MEDIUM (standard CRUD with validation)
   - Risk Score: 2
   - Service Calls: listRevenueStreams, createRevenueStream
   - Pattern: Collection management

**Total Violations Fixed:** 40  
**Post-R1-D Baseline:** 390 → 350 violations

---

## Deferred Routes (R1-D2 and R1-D3 Batches)

**Remaining:** 15 routes (50 violations)  
**Risk Level:** MEDIUM (more complex business logic)  
**Reason:** Defer to maintain single-pass success pattern

### Deferred Route List

1. src/app/api/engagements/[engagementId]/constraint-checks/route.ts (6 violations) - Risk Score 3
2. src/app/api/engagements/[engagementId]/escalation-checks/route.ts (6 violations) - Risk Score 3
3. src/app/api/engagements/[engagementId]/experiments/route.ts (6 violations) - Risk Score 3
4. src/app/api/engagements/[engagementId]/review-cycles/route.ts (6 violations) - Risk Score 3
5. src/app/api/metrics/control-effectiveness/route.ts (6 violations) - Risk Score 2
6. src/app/api/metrics/decision-latency/route.ts (6 violations) - Risk Score 3
7. src/app/api/engagements/[engagementId]/condition/route.ts (5 violations) - Risk Score 3
8. src/app/api/engagements/[engagementId]/intervention-state/route.ts (5 violations) - Risk Score 3
9. src/app/api/engagements/[engagementId]/shock-events/route.ts (5 violations) - Risk Score 3
10-15. [5 additional routes from reclassification analysis]

**Timeline:**
- R1-D-MAIN: 7 selected routes (1-2 days)
- R1-D2: Next 8 routes (1-2 days)
- R1-D3: Final 7 routes (1-2 days)

---

## Files Authorized for Modification

### Source Route Files (7)
- src/app/api/notifications/[id]/route.ts
- src/app/api/clients/[clientId]/route.ts
- src/app/api/governance/alerts/route.ts
- src/app/api/entitlement/quota/route.ts
- src/app/api/observability/summary/route.ts
- src/app/api/clients/[clientId]/contacts/[contactId]/route.ts
- src/app/api/growth/revenue-streams/route.ts

### Report Files (Output Only)
- reports/readiness/r1d_preimplementation_audit.json
- reports/readiness/r1d_validation.md
- reports/readiness/r1d_scope_audit.json
- reports/readiness/r1d_acceptance_decision.md

### Scanner Artifact (Auto-Generated)
- shadow_read_violations.json

**Total Files for R1-D Modification:** 7 source + reports + artifact

---

## Files Forbidden from Modification

**ABSOLUTELY NO CHANGES:**

- ✓ All 15 deferred Lane A routes (R1-D2/D3 only)
- ✓ src/app/api/run/route.ts (deferred to R1-RUN-0)
- ✓ src/app/api/verify/route.ts (deferred to R1-VERIFY-0)
- ✓ All service files (src/services/**)
- ✓ All policy files (src/policies/**)
- ✓ All middleware files (src/middleware/**)
- ✓ All governance/infrastructure (src/governance/**, src/lib/**)
- ✓ Wrapper implementations (enforced-route.ts, canonical-route-enforcement.ts)
- ✓ Auth context (auth-guard.ts)
- ✓ Prisma schema
- ✓ package.json
- ✓ Any non-Lane-A routes

---

## Implementation Pattern (Proven Safe)

**Apply R1-A/B/C Pattern:**

```typescript
// Before
export const GET = withEnforcementFull(
  async (request: NextRequest) => {
    const { session } = await withAuth();
    const workspaceId = request.headers.get("x-workspace-id");
    // handler logic
  }
);

// After
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const userId = ctx.verifiedActorId;
    // handler logic (unchanged)
  }
);
```

---

## Expected Outcomes

### Post-R1-D Baseline

| Metric | R1-C | R1-D Expected | Change |
|--------|------|---------------|--------|
| **Total Violations** | 390 | 350 | -40 |
| **Critical** | 247 | ~222 | -25 |
| **Block-build** | 143 | ~130 | -13 |
| **Build Status** | ✓ PASS | ✓ PASS | Stable |
| **Test Status** | 78/78 ✓ | 78/78 ✓ | Stable |
| **Regressions** | 0 | 0 | Stable |

### Beta Readiness After R1-D
- Critical violations: ~222 (down from 247)
- Progress toward beta gate: 25 critical cleared in R1-D alone
- Remaining critical to gate: ~122 (still need R1-D2+R1-E or R1-D2+R1-D3)
- Status: ON TRACK (single-pass implementation likely)

---

## Validation Commands

**Pre-implementation baseline:**
```bash
npm run build
npm test -- governance-capabilities policy-wrapper-enforcement g6r-auth-bridge
npx tsx src/governance/auth-shadow-read-scanner.ts
```

**Post-implementation validation:**
```bash
npm run build
npm test -- governance-capabilities policy-wrapper-enforcement g6r-auth-bridge
npx tsx src/governance/auth-shadow-read-scanner.ts
# Expected: 78/78 tests, 0 errors, scanner shows ~350 violations (±2 tolerance)
```

**Scope verification:**
```bash
git diff --stat
git diff --name-only
# Expected: 7 files changed (or 7 + reports)
```

---

## Success Criteria (ALL MUST BE MET)

### Gate 1: Build Must Succeed
```
Requirement: npm run build succeeds, TypeScript passes
Tolerance: 0 type errors allowed
Action if failed: Do NOT proceed, enter R1-D-FIX phase
```

### Gate 2: Tests Must Pass (No Regressions)
```
Requirement: 78/78 core governance tests passing
Tolerance: 0 new test failures allowed
Action if failed: Do NOT proceed, diagnose test failure
```

### Gate 3: Scanner Must Show Reduction
```
Requirement: 390 → ~350 violations (40 fixed)
Tolerance: ±2 violations (348-352 acceptable)
Action if failed: Verify reduction is within tolerance, proceed if within bounds
```

### Gate 4: Only 7 Files Changed
```
Requirement: Exactly 7 source route files modified
Tolerance: 0 unauthorized files allowed
Action if failed: Revert and audit scope
```

### Gate 5: No Unauthorized Modifications
```
Requirement: ZERO changes to:
  - Services (no refactors)
  - Wrappers (no implementation changes)
  - Capabilities (no additions)
  - Entitlements (no changes)
  - Roles (no mapping changes)
  - Response shapes (no changes)
  - Business logic (no changes)
Tolerance: 0 violations allowed
Action if failed: Revert and correct
```

---

## Stop Conditions (R1-D Must Stop If)

**STOP R1-D immediately if:**
1. Build fails (TypeScript errors)
2. Any test regression (new failures)
3. Scanner shows INCREASE in violations (>390)
4. Scope audit shows >7 files changed
5. Unauthorized modifications detected
6. Response shape changes detected
7. Business logic changes detected
8. Type assertions added (any, as any)

**If STOP condition triggered:**
- Revert all R1-D commits
- Enter R1-D-FIX diagnostic phase
- Identify root cause
- DO NOT proceed to R1-D2 until R1-D validates successfully

---

## Rollback Rule

**If R1-D fails any gate:**
```bash
git reset --hard <pre-R1-D-commit>
git clean -fd
npm test -- governance-capabilities
```

**Establish baseline before restart:**
- Confirm tests pass (78/78)
- Confirm build passes (TypeScript 0 errors)
- Confirm scanner shows 390 violations
- Then enter R1-D-FIX or retry

---

## Phase Timeline

**Phase Name:** R1-D (Fourth Safe Route Batch - First 7 Routes)  
**Scope:** 7 lowest-risk Lane A routes  
**Estimated Violations Fixed:** 40  
**Estimated Duration:** 1 day  
**Entry Condition:** This selection authorization  
**Exit Condition:** All 5 gates pass  

---

## Decision

**Batch Selection:** ✓ 7 LOWEST-RISK ROUTES SELECTED

Selected routes are the safest Lane A candidates with minimal business logic and straightforward patterns. All meet selection criteria. Zero regressions expected based on R1-A/B/C history.

**DECISION: ✓ R1-D IMPLEMENTATION WITH 7 ROUTES AUTHORIZED**

Ready for R1-D-MAIN implementation phase.

---

**Status: ✓ R1-D BATCH SELECTION COMPLETE - READY FOR IMPLEMENTATION AUTHORIZATION**
