# R1-D-0: Next Phase Decision

**Date:** 2026-05-16  
**Phase:** R1-D-0 (Phase Selection)  
**Decision:** ✓ PRIMARY: R1-D | PARALLEL: R2-0

---

## Decision Summary

### Primary Next Governance Phase: ✓ R1-D

**Fourth Safe Route Batch Modernization**

- **Violations to Fix:** 90 (Lane A safe routes)
- **Routes to Modernize:** ~22 simple routes
- **Handlers to Update:** ~22 (GET/POST patterns)
- **Expected Critical Fixed:** ~57
- **Expected Reduction:** 390 → 300 total violations
- **Risk Level:** LOW (proven pattern)
- **Duration:** 1-2 days
- **Beta Impact:** ADVANCES READINESS

### Parallel Deployment Phase: ✓ R2-0

**Deployment Readiness Audit**

- **Focus:** Environment setup, database, deployment pipeline
- **Duration:** 3-5 days (parallel to R1-D)
- **Critical Path:** YES (currently blocking actual beta launch)
- **Risk Level:** INDEPENDENT (doesn't affect governance)
- **Beta Impact:** ENABLES LAUNCH

---

## Authorized Next Phase: R1-D

### Authorized Routes

**Total: 22 routes identified from Lane A (Safe Routes)**

All routes following simple withAuth pattern with no service refactors:

1. src/app/api/engagements/[engagementId]/constraint-checks/route.ts (6 violations)
2. src/app/api/engagements/[engagementId]/escalation-checks/route.ts (6 violations)
3. src/app/api/engagements/[engagementId]/experiments/route.ts (6 violations)
4. src/app/api/engagements/[engagementId]/review-cycles/route.ts (6 violations)
5. src/app/api/entitlement/quota/route.ts (6 violations)
6. src/app/api/governance/alerts/route.ts (6 violations)
7. src/app/api/growth/revenue-streams/route.ts (6 violations)
8. src/app/api/metrics/control-effectiveness/route.ts (6 violations)
9. src/app/api/metrics/decision-latency/route.ts (6 violations)
10. src/app/api/notifications/[id]/route.ts (6 violations)
11. src/app/api/observability/summary/route.ts (6 violations)
12. src/app/api/clients/[clientId]/route.ts (5 violations)
13. src/app/api/clients/[clientId]/contacts/[contactId]/route.ts (5 violations)
14. src/app/api/engagements/[engagementId]/condition/route.ts (5 violations)
15. src/app/api/engagements/[engagementId]/intervention-state/route.ts (5 violations)
16. src/app/api/engagements/[engagementId]/shock-events/route.ts (5 violations)
17. [17+ additional Lane A safe routes identified in reclassification]

**Selection Rule:** All routes selected are in Lane A (REMAINING_SAFE_ROUTE_BATCH) with:
- ✓ Simple GET/POST handlers
- ✓ No service refactors
- ✓ No policy wrapper requirements
- ✓ No workspace role design needed
- ✓ No service boundary refactor
- ✓ Matching R1-A/B/C proven pattern

### Authorized Files for Modification

**Source Route Files Only:**
- All 22 selected route files in src/app/api/** (routes only)
- NO other source files

**Report Files (Output Only):**
- reports/readiness/r1d_preimplementation_audit.json
- reports/readiness/r1d_validation.md
- reports/readiness/r1d_scope_audit.json
- reports/readiness/r1d_acceptance_decision.md

**Scanner Artifact (Auto-Generated):**
- shadow_read_violations.json

**Total Files for Modification:** 22 source + reports + artifact

---

## Forbidden Files (STRICT - NO CHANGES)

**ABSOLUTELY NO CHANGES:**

- ✓ src/app/api/run/route.ts (Deferred to R1-RUN-0 audit)
- ✓ src/app/api/verify/route.ts (Deferred to R1-VERIFY-0 audit)
- ✓ Any service files (src/services/**)
- ✓ Any policy files (src/policies/**)
- ✓ Any middleware files (src/middleware/**)
- ✓ Any governance/infrastructure (src/governance/**, src/lib/**)
- ✓ Wrapper implementations (enforced-route.ts, canonical-route-enforcement.ts, etc.)
- ✓ Auth context (auth-guard.ts)
- ✓ Prisma schema (prisma/schema.prisma)
- ✓ package.json (dependencies)
- ✓ Any non-Lane-A routes

---

## Implementation Pattern (Proven Safe)

**Apply Same Pattern as R1-A/R1-B/R1-C:**

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

**Changes Required:**
1. `withEnforcementFull` → `withCanonicalEnforcement`
2. `async (request: NextRequest)` → `async (ctx: CanonicalAuthContext)`
3. `authContext.session.user.id` → `ctx.verifiedActorId`
4. `request.headers.get("x-workspace-id")` → `ctx.verifiedWorkspaceId`
5. Remove unused imports (withAuth, getSession, etc.)
6. Preserve all business logic, service calls, error handling

---

## Expected Outcomes

### Post-R1-D Baseline

| Metric | R1-C | R1-D Expected | Change |
|--------|------|---------------|--------|
| **Total Violations** | 390 | 300 | -90 |
| **Critical** | 247 | ~190 | -57 |
| **Block-build** | 143 | ~130 | -13 |
| **Build Status** | ✓ PASS | ✓ PASS | Stable |
| **Test Status** | 78/78 ✓ | 78/78 ✓ | Stable |
| **Regressions** | 0 | 0 | Stable |
| **Classification** | RUNTIME_ENFORCED_HYBRID | RUNTIME_ENFORCED_HYBRID | Stable |

### Beta Readiness After R1-D
- Critical violations: ~190 (down from 247 in R1-C)
- Progress toward beta gate: 57 critical cleared
- Remaining critical to beta gate: ~90 (from readiness report target of <100)
- Status: VERY CLOSE TO BETA GATE (1 more phase may finish)

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
# Expected: 78/78 tests, 0 errors, scanner shows ~300 violations (±2 tolerance)
```

**Scope verification:**
```bash
git diff --stat
git diff --name-only
# Expected: 22 files changed (or 22 + reports)
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
Requirement: 390 → ~300 violations (90 fixed)
Tolerance: ±2 violations (298-302 acceptable)
Action if failed: Verify reduction is within tolerance, proceed if within bounds
```

### Gate 4: Only 22 Files Changed
```
Requirement: Exactly 22 source route files modified
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
4. Scope audit shows >22 files changed
5. Unauthorized modifications detected
6. Response shape changes detected
7. Business logic changes detected
8. Type assertions added (any, as any)

**If STOP condition triggered:**
- Revert all R1-D commits
- Enter R1-D-FIX diagnostic phase
- Identify root cause
- DO NOT proceed to R1-E until R1-D validates successfully

---

## Parallel Deployment Phase Authorization

### R2-0: Deployment Readiness Audit (Start Immediately)

**Status:** ✓ AUTHORIZED TO START IN PARALLEL WITH R1-D

**Focus:**
1. Environment setup (DATABASE_URL, deployment variables)
2. Database migration strategy
3. Deployment pipeline (staging, production)
4. Infrastructure requirements assessment
5. Deployment readiness gates

**Constraint:** Governance must reach <100 critical before actual beta launch, but deployment work can start now without waiting for governance completion

---

## Optional Parallel Audit Phases (Resource Permitting)

### R1-RUN-0: Run/Route Isolated Modernization Audit (Optional)
- **When:** Can start after R1-D begins (doesn't block R1-D)
- **Duration:** 1-2 days
- **Outcome:** Clear path for run/route.ts modernization in R1-F

### R1-POLICY-0: Policy Wrapper Route Design Audit (Optional)
- **When:** Can start after R1-D begins
- **Duration:** 1-2 days
- **Outcome:** Enables R1-E policy-wrapper implementation

---

## Phase Timeline

**Phase Name:** R1-D (Fourth Safe Route Batch)  
**Scope:** 22 routes from Lane A  
**Estimated Violations Fixed:** 90  
**Estimated Duration:** 1-2 days  
**Entry Condition:** This authorization document  
**Exit Condition:** All 5 gates pass  

**Parallel Timeline:**
- R2-0 (Deployment): 3-5 days (starts immediately)
- R1-RUN-0 (Optional Audit): 1-2 days (can start day 1-2)
- R1-POLICY-0 (Optional Audit): 1-2 days (can start day 1-2)

---

## Decision

**Primary Phase:** R1-D (Fourth Safe Route Batch Modernization)  
**Authorized Routes:** 22 routes from Lane A  
**Expected Reduction:** 90 violations  
**Pattern:** R1-A proven, R1-B validated, R1-C demonstrated, ready for R1-D  

**DECISION: ✓ PROCEED TO R1-D IMPLEMENTATION WHEN READY**

**Parallel Authorization:** R2-0 deployment readiness may start immediately

Proceed to R1-D implementation with these exact 22 routes when ready.

---

## After R1-D Completion

Once R1-D passes all 5 acceptance gates:

**Next Decision Point:**
- Evaluate whether to proceed to R1-E (policy-wrapper routes)
- Or plan R1-F (run/route isolated implementation)
- Or evaluate deployment readiness impact on timeline

**Beta Readiness Status After R1-D:**
- Expected critical violations: ~190 (from 247)
- Beta gate requirement: <100 critical
- Status: READY FOR R1-E (final phase to hit gate)

**Timeline to Beta:**
- R1-D: 1-2 days ✓
- R1-E: 1-2 days (policy routes, if needed)
- R1-F: 1-2 days (run/route, if prioritized)
- Parallel R2-0: 3-5 days
- **Total: 3-7 days to beta-ready state**

---

**Status: ✓ R1-D AUTHORIZED - READY FOR IMPLEMENTATION PHASE**
