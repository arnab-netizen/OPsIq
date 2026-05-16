# R1-D2-B0: Final Decision

**Date:** 2026-05-16  
**Phase:** R1-D2-B0 (Sixth Safe Route Batch - Planning Complete)  
**Status:** FINAL DECISION READY

---

## A. Decision Summary

### ✓ R1-D2-B IMPLEMENTATION IS AUTHORIZED

**Prerequisites Met:**
- ✓ R1-D2-A fully accepted and validated
- ✓ Baseline confirmed (352 violations, 402 tests, 0 regressions)
- ✓ 12 safe route-only candidates identified
- ✓ All candidates meet safety criteria
- ✓ No service refactoring required
- ✓ No new capabilities needed
- ✓ No entitlement/role/policy changes
- ✓ Low implementation risk

**Authorization:** ✓ YES - PROCEED TO R1-D2-B IMPLEMENTATION

---

## B. R1-D2-B Implementation Scope

### Selected Routes for Implementation (12 Total)

**Tier 1: Metrics Routes (9 routes)**
1. src/app/api/governance/metrics/route.ts (GET)
2. src/app/api/growth/acquisition-metrics/route.ts (GET)
3. src/app/api/growth/offers/route.ts (GET)
4. src/app/api/growth/pricing-tiers/route.ts (GET)
5. src/app/api/growth/retention-metrics/route.ts (GET)
6. src/app/api/growth/sales-pipeline/route.ts (GET)
7. src/app/api/growth/unit-economics/route.ts (GET)
8. src/app/api/metrics/control-effectiveness/route.ts (GET)
9. src/app/api/metrics/decision-latency/route.ts (GET)

**Tier 2: Webhook Routes (3 routes)**
10. src/app/api/webhooks/[id]/test/route.ts (POST)
11. src/app/api/webhooks/stripe/route.ts (POST)
12. src/app/api/webhooks/subscribe/route.ts (POST)

### Handlers to Modernize

**Total Handlers:** 12 GET handlers + 3 POST handlers = 15 handlers  
**Expected Pattern:** All from `withEnforcementFull` → `withCanonicalEnforcement`  
**Expected Violations Fixed:** ~48 (4 violations per route)  

---

## C. Files Allowed to Modify

### Route Files (ALLOWED)

✓ All 12 selected routes listed above  
✓ Any test files if regressions detected  

### Artifact Files (ALLOWED)

✓ shadow_read_violations.json (scanner output only)  

### Infrastructure Files (FORBIDDEN)

✗ src/lib/canonical-route-enforcement.ts  
✗ src/lib/auth-guard.ts  
✗ src/governance/auth-shadow-read-scanner.ts  
✗ Any service files  
✗ Database schema files  
✗ Policy/wrapper files  
✗ Capability/entitlement/role files  

### Application Files (FORBIDDEN)

✗ Non-selected route files  
✗ Service implementations  
✗ Client handlers  
✗ Authentication implementation  
✗ Response type definitions  

---

## D. Files Explicitly FORBIDDEN

**Do NOT modify:**

1. **Service Boundary Files**
   - src/services/* (no service refactoring)
   - src/lib/auth-guard.ts (no auth changes)
   - src/lib/runtime-shadow-read-enforcer.ts (no enforcement changes)

2. **Wrapper/Framework Files**
   - src/lib/canonical-route-enforcement.ts
   - src/lib/enforced-route.ts
   - src/middleware/workspace-enforcement.ts

3. **Scanner Files**
   - src/governance/auth-shadow-read-scanner.ts
   - src/governance/shadow-read-classifier.ts

4. **System Files**
   - src/domain/constants/capabilities.ts
   - src/domain/constants/entitlements.ts
   - src/governance/role-mappings.ts
   - prisma/schema.prisma

5. **Policy/Enforcement Files**
   - src/policies/capability-check.ts
   - src/policies/policy-wrapper.ts
   - src/lib/auth-ownership-allowlist.ts

---

## E. Implementation Boundaries

### What IS Allowed in R1-D2-B

✓ Replace `withEnforcementFull` with `withCanonicalEnforcement`  
✓ Change handler signature from `(request, context, params)` to `(ctx: CanonicalAuthContext, params)`  
✓ Replace `await withAuth()` with `ctx.verifiedSessionSnapshot`  
✓ Replace `session.user.id` with `ctx.verifiedActorId`  
✓ Replace `request.headers.get("x-workspace-id")` with `ctx.verifiedWorkspaceId`  
✓ Update imports (remove NextRequest, withAuth, etc.)  
✓ Existing capability checks remain the same (no new capabilities)  
✓ Service calls remain identical (no service changes)  
✓ Business logic stays unchanged  
✓ Response shapes stay identical  

### What IS FORBIDDEN in R1-D2-B

✗ Service refactoring  
✗ New capability definitions  
✗ Entitlement system changes  
✗ Role mapping changes  
✗ Policy wrapper introduction  
✗ Workspace semantics changes  
✗ Response shape changes  
✗ Business logic changes  
✗ Feature work  
✗ Bulk pattern replacement  
✗ Use of `any` type  
✗ Use of `as any` cast  
✗ Capability/entitlement addition  
✗ Database schema changes  

---

## F. Validation Gates (Must All Pass)

### Gate 1: Build Validation
**Command:** `npm run build`  
**Expected:** 0 TypeScript errors  
**Failure Action:** Stop, revert, investigate  

### Gate 2: Test Validation  
**Command:** `npm test -- governance-capabilities policy-wrapper-enforcement g6r-auth-bridge phase-d phase-e phase-f`  
**Expected:** 402/402 tests passing, 0 regressions  
**Failure Action:** Stop, revert, investigate  

### Gate 3: Scanner Validation
**Command:** `npx tsx src/governance/auth-shadow-read-scanner.ts`  
**Expected:** 304 violations (down from 352)  
**Acceptable Range:** 300-308 violations (±2% variance)  
**Failure Action:** Stop, revert, investigate  

### Gate 4: Scope Audit
**Verification:** Only 12 selected routes modified  
**Failure Action:** Stop, revert, investigate  

---

## G. Stop Conditions

**Implementation MUST STOP immediately if:**

1. Build fails with TypeScript errors
2. Any test fails (regression detected)
3. Scanner doesn't show reduction in expected range
4. Any file outside selected routes is modified
5. Service file is changed
6. Wrapper/auth/scanner source is changed
7. Any `any` type or `as any` cast appears

**Recovery:** Revert to commit 754763a (R1-D2-A-CLOSEOUT)

---

## H. Success Definition

**R1-D2-B is successful when:**

1. ✓ All 12 routes modernized from `withEnforcementFull` to `withCanonicalEnforcement`
2. ✓ Build passes (0 TypeScript errors)
3. ✓ Tests pass (402/402, 0 regressions)
4. ✓ Scanner shows ~304 violations (±2% tolerance)
5. ✓ Only selected routes modified
6. ✓ No service files changed
7. ✓ No scope violations
8. ✓ Classification remains RUNTIME_ENFORCED_HYBRID
9. ✓ All changes committed with detailed reports
10. ✓ Closeout audit passed

---

## I. Next Phase Authorization

### R1-D2-B Implementation
**Status:** ✓ AUTHORIZED  
**Expected Duration:** Single implementation phase  
**Expected Outcome:** 12 routes modernized, 48 violations fixed, 304 total violations  

### R1-D2-C Planning (If R1-D2-B Successful)
**Prerequisite:** R1-D2-B fully accepted  
**Purpose:** Select remaining safe route-only candidates (if any)  
**Expected Candidates:** Limited (most remaining routes have service coupling)  

### R1-SERVICE-0 (Independent Track)
**Status:** ✓ AVAILABLE WHEN R1-D2-B STARTS  
**Purpose:** Service boundary refactoring design audit  
**Impact:** Unblocks 35 service-coupled routes  
**Prerequisites:** None (independent work)  

### R1-POLICY-0 (Independent Track)
**Status:** ✓ AVAILABLE WHEN R1-D2-B STARTS  
**Purpose:** Policy wrapper design audit  
**Impact:** Unblocks 45 policy-wrapper routes  
**Prerequisites:** None (independent work)  

---

## J. Deferred Routes & Rationale

### Service-Coupled Handlers (35 routes) → R1-SERVICE-0
Routes with services expecting `ServiceAuthEnvelope`:
- updateAction, updateDecision, updateFinding, updateClient, archiveClient, updateUser, deactivateUser, etc.
- Pattern: All require service input contract refactoring
- Timeline: Unblock in R1-SERVICE-0 service boundary phase
- Estimated Violations: 140

### Policy-Wrapper Routes (12 routes) → R1-POLICY-0
Routes needing policy-specific enforcement:
- Policy-scoped operations beyond basic capability checks
- Pattern: Require withCanonicalPolicyEnforcement wrapper
- Timeline: Unblock in R1-POLICY-0 policy wrapper phase
- Estimated Violations: 48

### Workspace Role Routes (8 routes) → R1-WORKSPACE-0
Routes requiring workspace role/membership design:
- Admin role enforcement, workspace invitation, etc.
- Pattern: Require workspace role mapping verification
- Timeline: Unblock in R1-WORKSPACE-0 workspace semantics phase
- Estimated Violations: 32

### Forbidden Routes (2 routes) → Separate Audits
- run/route.ts → R1-RUN-0 (execution engine audit)
- verify/route.ts → R1-VERIFY-0 (verification semantics audit)
- Estimated Violations: 8

### False Positives (6 routes) → Accept As-Is
Routes where scanner flags comments/test code:
- Pattern: Scanner detects false positives
- Decision: Document and accept (not real violations)
- Estimated Violations: 12

---

## K. Final Classification

**Governance Classification:** RUNTIME_ENFORCED_HYBRID  
**Maintained Through R1-D2-B:** ✓ YES  
**Why:** Routes enforce context at runtime via wrapper, not at compile-time  
**Impact:** Zero architectural changes, pure pattern modernization  

---

## L. Approval Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| Baseline Confirmed | ✓ PASS | 352 violations, 402 tests, 0 regressions |
| 12 Candidates Selected | ✓ PASS | All meet safety criteria |
| No Service Coupling | ✓ PASS | Route-only changes only |
| No Capability Changes | ✓ PASS | Using existing capabilities |
| No Role/Entitlement Changes | ✓ PASS | No system changes |
| Scope Clear | ✓ PASS | 12 routes authorized, no others |
| Risk Assessed | ✓ PASS | LOW-MEDIUM, no blocking issues |
| Pattern Proven | ✓ PASS | Applied successfully in R1-A through R1-D2-A |
| Validation Plan Ready | ✓ PASS | Build, tests, scanner, scope audit |

---

## M. Decision Record

**Decision Date:** 2026-05-16  
**Decision Authority:** R1-D2-B0 Planning Phase  
**Decision:** ✓ APPROVED - PROCEED TO R1-D2-B IMPLEMENTATION  

**Rationale:**
1. R1-D2-A fully validated and accepted
2. Baseline stable (352 violations, 0 regressions)
3. 12 safe route-only candidates identified
4. All candidates meet safety criteria
5. No service refactoring required
6. Low implementation risk
7. Pattern proven across prior phases
8. Expected 48-violation reduction (304 total after)
9. Zero architectural impact
10. Clear scope boundaries

**Authorization:** Full implementation authority granted for R1-D2-B

---

**Status: ✓ R1-D2-B0 FINAL DECISION - IMPLEMENTATION AUTHORIZED**

**Next Instruction:** "STRICT EXECUTION MODE — PHASE R1-D2-B" (implementation phase)
