# R1-D2-B0: Batch Selection

**Date:** 2026-05-16  
**Phase:** R1-D2-B0 Planning (Sixth Safe Route Batch Selection)  
**Status:** BATCH SELECTION COMPLETE

---

## A. Selection Criteria

**Route-Only Safe Candidates Must Have:**

✓ `service_refactor_required = false`  
✓ `new_capability_required = false`  
✓ `entitlement_change_required = false`  
✓ `role_change_required = false`  
✓ `policy_wrapper_required = false`  
✓ `workspace_semantics_unclear = false`  
✓ `response_shape_risk = LOW`  
✓ `business_logic_risk = LOW or MEDIUM`  
✓ `handler_complexity = LOW or MEDIUM`  

---

## B. R1-D2-B Selected Routes

**Total Selected: 12 routes**  
**Expected Violations Fixed: ~48**

### Tier 1: GET-Only Metrics Routes (7 routes)

These are safe, read-only routes that calculate and return metrics data.

1. **src/app/api/governance/metrics/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk: LOW
   - Reasoning: Metrics calculation only, no service coupling, workspace scoping via ctx

2. **src/app/api/growth/acquisition-metrics/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk: LOW
   - Reasoning: Growth data query, read-only, no service changes

3. **src/app/api/growth/offers/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk: LOW
   - Reasoning: Configuration data, read-only access, no service refactoring

4. **src/app/api/growth/pricing-tiers/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk: LOW
   - Reasoning: Pricing config, read-only, no service coupling

5. **src/app/api/growth/retention-metrics/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk: LOW
   - Reasoning: Metrics route, read-only, no service type changes

6. **src/app/api/growth/sales-pipeline/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk: LOW
   - Reasoning: Sales data, read-only query, no service changes

7. **src/app/api/growth/unit-economics/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk: LOW
   - Reasoning: Financial metrics, read-only, no service refactoring needed

### Tier 2: Operational Metrics Routes (2 routes)

These routes calculate operational metrics without service coupling.

8. **src/app/api/metrics/control-effectiveness/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk: LOW
   - Reasoning: Control metrics, no service coupling, read-only

9. **src/app/api/metrics/decision-latency/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk: LOW
   - Reasoning: Decision metrics, read-only query, no service changes

### Tier 3: Webhook Routes (3 routes)

These routes handle webhooks without service signature changes.

10. **src/app/api/webhooks/[id]/test/route.ts**
    - Handler: POST
    - Pattern: `withAuth()` → `ctx.verifiedActorId`
    - Violations: 4
    - Risk: MEDIUM (POST handler, but idempotent test operation)
    - Reasoning: Webhook test trigger, no service refactoring, idempotent

11. **src/app/api/webhooks/stripe/route.ts**
    - Handler: POST
    - Pattern: `withAuth()` → `ctx.verifiedActorId`
    - Violations: 4
    - Risk: MEDIUM (webhook processing, but established pattern)
    - Reasoning: Stripe webhook processing, no service type changes

12. **src/app/api/webhooks/subscribe/route.ts**
    - Handler: POST
    - Pattern: `withAuth()` → `ctx.verifiedActorId`
    - Violations: 4
    - Risk: MEDIUM (subscription registration, but straightforward)
    - Reasoning: Webhook subscription, no service refactoring needed

---

## C. Excluded Candidates & Reasons

### Forbidden Routes (Not Considered)

- **src/app/api/run/route.ts** - Explicitly forbidden (complex execution engine)
- **src/app/api/verify/route.ts** - Explicitly forbidden (verification logic requires audit)
- **src/app/api/actions/[actionId]/route.ts** - Already deferred (service coupling: updateAction)
- **src/app/api/findings/[findingId]/route.ts** - Already deferred (service coupling: updateFinding)

### Service-Coupled Handlers (Deferred to R1-SERVICE-0)

**Count: 35 routes**

Routes that require service refactoring because their services expect `ServiceAuthEnvelope`:

- **auth/login, auth/logout** - Service expects `ServiceAuthEnvelope` from `withAuth()`
- **actions/[actionId]** - `updateAction` service coupling
- **decisions/** - `updateDecision`, `executeDecision` service coupling
- **findings/** - `updateFinding` service coupling
- **clients/** - `updateClient`, `archiveClient` service coupling
- **users/** - `updateUser`, `deactivateUser` service coupling
- **leads/** - `updateLead`, `linkLeadToEngagement` service coupling
- **diagnosis/** - `diagnoseBusiness` service coupling
- **evidence-bundles/** - Service operations
- **deliverables/** - Service coupling expected
- **engagements/[engagementId]/** - Complex engagement mutation service
- And 23 more...

**Decision:** All service-coupled routes deferred to R1-SERVICE-0 (service boundary refactoring phase)

### Policy Wrapper or Role-Required Routes (Deferred to R1-POLICY-0 and R1-WORKSPACE-0)

**Count: 12 routes**

Routes requiring policy wrapper or workspace role mapping:

- **admin/** routes - Admin role enforcement
- **users/[userId]/roles/** - Role management
- **users/[userId]/memberships/** - Workspace membership
- Policy-gated operation routes

**Decision:** These routes deferred to respective phases (R1-POLICY-0, R1-WORKSPACE-0)

### Workspace Semantics Unclear (Deferred to R1-WORKSPACE-0)

**Count: 8 routes**

Routes where workspace creation/invitation semantics need verification:

- **onboarding/workspace/** - Workspace creation logic
- **onboarding/invite/** - Invitation logic
- Similar workspace-level operations

**Decision:** Deferred to R1-WORKSPACE-0 (workspace design audit phase)

---

## D. Expected Outcome

### Violations Reduction

**Before R1-D2-B:** 352 violations  
**Expected After R1-D2-B:** 304 violations  
**Reduction:** -48 violations  
**Percentage:** -13.6%

**Calculation:**
- 12 routes × 4 violations per route = 48 violations fixed

### Test Suite Impact

**Before R1-D2-B:** 402/402 tests passing  
**Expected After R1-D2-B:** 402/402 tests passing  
**Regressions Expected:** 0

**Reasoning:** All selected routes are route-only with no service changes; existing tests should continue to pass

### Build Status

**Before R1-D2-B:** TypeScript clean  
**Expected After R1-D2-B:** TypeScript clean  
**Type Errors Expected:** 0

---

## E. Files Allowed for R1-D2-B

**Allowed to Modify:**

✓ Selected 12 route files (see above)  
✓ shadow_read_violations.json (scanner artifact)  
✓ Test files (if regressions detected during implementation)  

**Not Allowed:**

✗ Service files  
✗ Scanner source  
✗ Wrapper implementation  
✗ Auth context types  
✗ Policy wrapper  
✗ Capability/entitlement/role system  
✗ Database schema  
✗ Response type definitions  

---

## F. Validation Commands for R1-D2-B

**Build Validation:**
```bash
npm run build
```

**Test Validation:**
```bash
npm test -- governance-capabilities policy-wrapper-enforcement g6r-auth-bridge phase-d phase-e phase-f
```

**Scanner Validation:**
```bash
npx tsx src/governance/auth-shadow-read-scanner.ts
```

**Expected Scanner Total After R1-D2-B:** 304 violations  
**Expected Critical After R1-D2-B:** 178 violations  
**Expected Block-Build After R1-D2-B:** 96 violations  

---

## G. Rollback Rule

**If Any Single Validation Gate Fails During R1-D2-B Implementation:**

1. Stop implementation immediately
2. Identify the failing gate (build, tests, scanner, scope)
3. Revert to commit 754763a (R1-D2-A-CLOSEOUT)
4. Investigate root cause
5. Report findings in R1-D2-B-FAILURE report
6. Plan remediation

**Rollback is reversible:** Git reset --soft to recover work

---

## H. Pattern to Apply

**Legacy Pattern (In Route Handler):**
```typescript
export const GET = withEnforcementFull(async (request: NextRequest) => {
  const { session } = await withAuth();
  const workspaceId = request.headers.get("x-workspace-id");
  // business logic using session.user.id
  return Response.json(result);
});
```

**Modern Pattern (To Apply):**
```typescript
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    // business logic using ctx.verifiedActorId
    return Response.json(result);
  },
  { requireWorkspace: true, requireCapabilities: [...] }
);
```

**Key Changes:**
1. Wrapper: `withEnforcementFull` → `withCanonicalEnforcement`
2. Handler signature: `(request: NextRequest)` → `(ctx: CanonicalAuthContext, params)`
3. Auth: Remove `await withAuth()` call (handled by wrapper)
4. Workspace: `request.headers.get("x-workspace-id")` → `ctx.verifiedWorkspaceId`
5. Actor: `session.user.id` → `ctx.verifiedActorId`
6. Capability: Add to wrapper options if needed
7. Imports: Remove NextRequest, withAuth, canonicalizeAuthContext; add CanonicalAuthContext

---

## I. Implementation Order (Recommended)

**Phase 1: Metrics Routes (Safe Baseline)**
1. governance/metrics/route.ts
2. growth/acquisition-metrics/route.ts
3. growth/offers/route.ts
4. growth/pricing-tiers/route.ts
5. growth/retention-metrics/route.ts
6. growth/sales-pipeline/route.ts
7. growth/unit-economics/route.ts
8. metrics/control-effectiveness/route.ts
9. metrics/decision-latency/route.ts

**Phase 2: Webhook Routes (Slightly Higher Risk)**
10. webhooks/[id]/test/route.ts
11. webhooks/stripe/route.ts
12. webhooks/subscribe/route.ts

---

## J. Success Criteria for R1-D2-B

✓ Build passes (0 TypeScript errors)  
✓ All tests pass (402/402, 0 regressions)  
✓ Scanner shows 304 violations (-48 from baseline)  
✓ Only selected 12 routes modified  
✓ No service files changed  
✓ No scope violations  
✓ Commit includes R1-D2-B implementation + validation report  

---

**Status: ✓ BATCH SELECTION COMPLETE - 12 SAFE ROUTE-ONLY CANDIDATES IDENTIFIED**

**Next Step: R1-D2-B Implementation Authorization**
