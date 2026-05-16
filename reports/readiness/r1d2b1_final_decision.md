# R1-D2-B1: Final Decision

**Date:** 2026-05-16  
**Phase:** R1-D2-B1 (Narrowed Sixth Safe Route Batch - Planning Complete)  
**Status:** FINAL DECISION READY

---

## A. Decision Summary

### ✓ R1-D2-B IMPLEMENTATION IS AUTHORIZED (NARROWED BATCH)

**Prerequisites Met:**
- ✓ R1-D2-A fully accepted and validated
- ✓ Baseline confirmed (352 violations, 402 tests, 0 regressions)
- ✓ R1-D2-B0 12-route batch rejected as too broad
- ✓ Webhook routes excluded (deferred to R1-WEBHOOK-0)
- ✓ 8 safe metrics/growth routes identified
- ✓ All candidates meet safety criteria
- ✓ No service refactoring required
- ✓ No new capabilities needed
- ✓ No entitlement/role/policy changes
- ✓ Low implementation risk

**Authorization:** ✓ YES - PROCEED TO R1-D2-B IMPLEMENTATION (NARROWED)

---

## B. R1-D2-B Implementation Scope (Narrowed)

### Selected Routes for Implementation (8 Total)

All metrics and growth intelligence routes (read-only GET):

1. src/app/api/governance/metrics/route.ts (GET)
2. src/app/api/growth/acquisition-metrics/route.ts (GET)
3. src/app/api/growth/offers/route.ts (GET)
4. src/app/api/growth/pricing-tiers/route.ts (GET)
5. src/app/api/growth/retention-metrics/route.ts (GET)
6. src/app/api/growth/sales-pipeline/route.ts (GET)
7. src/app/api/growth/unit-economics/route.ts (GET)
8. src/app/api/metrics/control-effectiveness/route.ts (GET)

### Handlers to Modernize

**Total Handlers:** 8 GET handlers  
**Expected Pattern:** All from `withEnforcementFull` → `withCanonicalEnforcement`  
**Expected Violations Fixed:** ~32 (4 violations per route)  

---

## C. Files Allowed to Modify

### Route Files (ALLOWED)

✓ All 8 selected routes listed above  
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

### Webhook Routes (EXPLICITLY FORBIDDEN in R1-D2-B)

✗ src/app/api/webhooks/[id]/test/route.ts  
✗ src/app/api/webhooks/stripe/route.ts  
✗ src/app/api/webhooks/subscribe/route.ts  

---

## D. Files Explicitly FORBIDDEN

**Do NOT modify:**

1. **Service Boundary Files**
   - src/services/* (no service refactoring)
   - src/lib/auth-guard.ts (no auth changes)

2. **Wrapper/Framework Files**
   - src/lib/canonical-route-enforcement.ts
   - src/lib/enforced-route.ts
   - src/middleware/workspace-enforcement.ts

3. **Scanner Files**
   - src/governance/auth-shadow-read-scanner.ts

4. **System Files**
   - src/domain/constants/capabilities.ts
   - prisma/schema.prisma

5. **Webhook Routes (Deferred)**
   - src/app/api/webhooks/[id]/test/route.ts
   - src/app/api/webhooks/stripe/route.ts
   - src/app/api/webhooks/subscribe/route.ts

---

## E. Implementation Boundaries

### What IS Allowed in R1-D2-B

✓ Replace `withEnforcementFull` with `withCanonicalEnforcement`  
✓ Change handler signature from `(request, context, params)` to `(ctx: CanonicalAuthContext, params)`  
✓ Replace `await withAuth()` with `ctx.verifiedSessionSnapshot`  
✓ Replace `session.user.id` with `ctx.verifiedActorId`  
✓ Replace `request.headers.get("x-workspace-id")` with `ctx.verifiedWorkspaceId`  
✓ Update imports (remove NextRequest, withAuth, etc.)  
✓ Service calls remain identical  
✓ Business logic stays unchanged  
✓ Response shapes stay identical  

### What IS FORBIDDEN in R1-D2-B

✗ Webhook routes (all webhook modernization deferred to R1-WEBHOOK-0)  
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
**Expected:** 320 violations (down from 352)  
**Acceptable Range:** 316-324 violations (±2% variance)  
**Failure Action:** Stop, revert, investigate  

### Gate 4: Scope Audit
**Verification:** Only 8 selected routes modified, no webhook routes changed  
**Failure Action:** Stop, revert, investigate  

---

## G. Stop Conditions

**Implementation MUST STOP immediately if:**

1. Build fails with TypeScript errors
2. Any test fails (regression detected)
3. Scanner doesn't show reduction in expected range
4. Any file outside selected 8 routes is modified
5. Any webhook route is modified
6. Service file is changed
7. Wrapper/auth/scanner source is changed
8. Any `any` type or `as any` cast appears

**Recovery:** Revert to commit 95b5ffe (R1-D2-B0 planning complete)

---

## H. Success Definition

**R1-D2-B is successful when:**

1. ✓ All 8 routes modernized from `withEnforcementFull` to `withCanonicalEnforcement`
2. ✓ Build passes (0 TypeScript errors)
3. ✓ Tests pass (402/402, 0 regressions)
4. ✓ Scanner shows ~320 violations (±2% tolerance)
5. ✓ Only selected 8 routes modified
6. ✓ No webhook routes changed
7. ✓ No service files changed
8. ✓ No scope violations
9. ✓ Classification remains RUNTIME_ENFORCED_HYBRID
10. ✓ All changes committed with detailed reports

---

## I. Next Phase Authorization

### R1-D2-B Implementation (Narrowed)
**Status:** ✓ AUTHORIZED  
**Expected Duration:** Single implementation phase  
**Expected Outcome:** 8 routes modernized, 32 violations fixed, 320 total violations  

### R1-D2-C Planning (If R1-D2-B Successful)
**Prerequisite:** R1-D2-B fully accepted  
**Purpose:** Continue Lane A route-only candidates (if any remain)  
**Candidates:** src/app/api/metrics/decision-latency/route.ts, others  

### R1-WEBHOOK-0 Planning (Independent Track)
**Status:** ✓ AVAILABLE WHEN R1-D2-B STARTS  
**Purpose:** Webhook-specific route modernization audit  
**Routes:** 3 webhook routes deferred from R1-D2-B0  
**Violations:** 12 violations (3 routes × 4 violations)  
**Prerequisites:** None (independent work)  

### R1-SERVICE-0 (Independent Track)
**Status:** ✓ AVAILABLE WHEN R1-D2-B STARTS  
**Purpose:** Service boundary refactoring design audit  
**Violations:** 140 violations (35 service-coupled routes)  
**Prerequisites:** None (independent work)  

---

## J. Deferred Routes & Rationale

### Webhook Routes (3 routes) → R1-WEBHOOK-0
Routes with webhook-specific semantics:
- Webhook signature verification patterns
- Payment provider integration (Stripe)
- Event idempotency and duplicate handling
- Webhook test harness semantics
- Estimated Violations: 12

### Optional Metrics Route → R1-D2-C
- src/app/api/metrics/decision-latency/route.ts
- Safe but lowest priority
- Deferred to reduce R1-D2-B batch size to 8
- Can be added later or included in R1-D2-C

### Service-Coupled Handlers (35 routes) → R1-SERVICE-0
Routes with services expecting `ServiceAuthEnvelope`:
- Pattern: All require service input contract refactoring
- Estimated Violations: 140

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
| R1-D2-B0 Revision | ✓ PASS | 12-route batch rejected, narrowed to 8 |
| Webhook Routes Excluded | ✓ PASS | Deferred to R1-WEBHOOK-0 |
| 8 Candidates Selected | ✓ PASS | All metrics/growth, all meet safety criteria |
| No Service Coupling | ✓ PASS | Route-only changes only |
| No Capability Changes | ✓ PASS | Using existing capabilities |
| No Role/Entitlement Changes | ✓ PASS | No system changes |
| Scope Clear | ✓ PASS | 8 routes authorized, no others |
| Risk Assessed | ✓ PASS | LOW, no blocking issues |
| Pattern Proven | ✓ PASS | Applied successfully in R1-A through R1-D2-A |
| Validation Plan Ready | ✓ PASS | Build, tests, scanner, scope audit |

---

## M. Decision Record

**Decision Date:** 2026-05-16  
**Decision Authority:** R1-D2-B1 Planning Phase  
**Decision:** ✓ APPROVED - PROCEED TO R1-D2-B IMPLEMENTATION (NARROWED TO 8 ROUTES)

**Rationale:**
1. R1-D2-A fully validated and accepted
2. Baseline stable (352 violations, 0 regressions)
3. R1-D2-B0 12-route batch revised (too broad, included webhooks)
4. 8 safe metrics/growth routes identified (all meet safety criteria)
5. Webhook routes excluded (require separate R1-WEBHOOK-0 audit)
6. No service refactoring required
7. Low implementation risk
8. Pattern proven across prior phases
9. Expected 32-violation reduction (320 total after)
10. Zero architectural impact
11. Clear scope boundaries

**Authorization:** Full implementation authority granted for R1-D2-B (narrowed to 8 routes)

---

**Status: ✓ R1-D2-B1 FINAL DECISION - IMPLEMENTATION AUTHORIZED (NARROWED)**

**Next Instruction:** "STRICT EXECUTION MODE — PHASE R1-D2-B" (implementation phase, 8 routes)
