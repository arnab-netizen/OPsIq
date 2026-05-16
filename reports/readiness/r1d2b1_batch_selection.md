# R1-D2-B1: Narrowed Batch Selection

**Date:** 2026-05-16  
**Phase:** R1-D2-B1 Planning (Narrowed Sixth Safe Route Batch Selection)  
**Status:** BATCH SELECTION COMPLETE

---

## A. Selection Criteria (Revised)

**Constraints Applied:**
- Maximum batch size: 8 routes (vs. 12 in R1-D2-B0)
- Minimum batch size: 5 routes
- Exclude webhook/payment routes
- Prioritize read-only GET routes
- Only metrics/growth/intelligence data routes

**Safety Criteria:**
✓ `webhook_or_payment_route = false`  
✓ `service_refactor_required = false`  
✓ `new_capability_required = false`  
✓ `entitlement_change_required = false`  
✓ `role_change_required = false`  
✓ `policy_wrapper_required = false`  
✓ `workspace_semantics_unclear = false`  
✓ `response_shape_risk = LOW`  
✓ `business_logic_risk = LOW`  
✓ `handler_complexity = LOW or MEDIUM`  

---

## B. R1-D2-B Narrowed Selection

**Total Selected: 8 routes**  
**Expected Violations Fixed: ~32-40**

### All Metrics & Growth Routes (8 routes)

These are safe, read-only routes that calculate and return metrics/growth data.

1. **src/app/api/governance/metrics/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk Score: 1 (Lowest)
   - Reasoning: Metrics calculation, no service coupling, highest safety

2. **src/app/api/growth/acquisition-metrics/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk Score: 1
   - Reasoning: Growth metrics, read-only, no service changes

3. **src/app/api/growth/offers/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk Score: 1
   - Reasoning: Configuration data, read-only, no service coupling

4. **src/app/api/growth/pricing-tiers/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk Score: 1
   - Reasoning: Pricing config, read-only, no service refactoring

5. **src/app/api/growth/retention-metrics/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk Score: 1
   - Reasoning: Metrics, read-only, no service changes

6. **src/app/api/growth/sales-pipeline/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk Score: 1
   - Reasoning: Sales data, read-only, no service refactoring

7. **src/app/api/growth/unit-economics/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk Score: 1
   - Reasoning: Financial metrics, read-only, no service changes

8. **src/app/api/metrics/control-effectiveness/route.ts**
   - Handler: GET
   - Pattern: `withAuth()` → `ctx.verifiedActorId`
   - Violations: 4
   - Risk Score: 1
   - Reasoning: Control metrics, no service coupling, read-only

---

## C. Deferred Candidates

### Optional Candidate (If Batch Not Full)

**src/app/api/metrics/decision-latency/route.ts**
- Handler: GET
- Violations: 4
- Risk Score: 1 (Safe, but lowest priority)
- Status: Can be added to batch or deferred to R1-D2-C
- Decision: DEFER (focus on core 8 metrics routes)

### Webhook Routes (Deferred to R1-WEBHOOK-0)

**Routes:**
1. src/app/api/webhooks/[id]/test/route.ts (POST)
2. src/app/api/webhooks/stripe/route.ts (POST)
3. src/app/api/webhooks/subscribe/route.ts (POST)

**Reason:** Webhook routes have distinct semantics that require separate audit:
- Webhook signature verification patterns
- Payment integration (Stripe)
- Event idempotency and duplicate handling
- Webhook test harness patterns

**Deferred To:** R1-WEBHOOK-0 (Payment & Webhook Semantics Audit)

**Violations in R1-WEBHOOK-0:** 12 violations (3 routes × 4 violations each)

---

## D. Expected Outcome

### Violations Reduction

**Before R1-D2-B:** 352 violations  
**Expected After R1-D2-B:** 320 violations  
**Reduction:** -32 violations  
**Percentage:** -9.1%

**Calculation:**
- 8 routes × 4 violations per route = 32 violations fixed

### Test Suite Impact

**Before R1-D2-B:** 402/402 tests passing  
**Expected After R1-D2-B:** 402/402 tests passing  
**Regressions Expected:** 0

### Build Status

**Before R1-D2-B:** TypeScript clean  
**Expected After R1-D2-B:** TypeScript clean  
**Type Errors Expected:** 0

---

## E. Files Allowed for R1-D2-B

**Allowed to Modify:**

✓ Selected 8 route files (see above)  
✓ shadow_read_violations.json (scanner artifact)  
✓ Test files (if regressions detected)  

**Not Allowed:**

✗ Service files  
✗ Scanner source  
✗ Wrapper implementation  
✗ Auth context types  
✗ Policy wrapper  
✗ Capability/entitlement/role system  
✗ Database schema  
✗ Response type definitions  
✗ Webhook routes (deferred)  

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

**Expected Scanner Total After R1-D2-B:** 320 violations  
**Expected Critical After R1-D2-B:** 210 violations  
**Expected Block-Build After R1-D2-B:** 112 violations  

---

## G. Rollback Rule

**If Any Single Validation Gate Fails During R1-D2-B Implementation:**

1. Stop implementation immediately
2. Identify the failing gate
3. Revert to commit 95b5ffe (R1-D2-B0 planning complete)
4. Investigate root cause
5. Report findings in R1-D2-B-FAILURE report

---

## H. Implementation Order (Recommended)

**All 8 routes are equivalent safety:** Process in file path order for consistency

1. src/app/api/governance/metrics/route.ts
2. src/app/api/growth/acquisition-metrics/route.ts
3. src/app/api/growth/offers/route.ts
4. src/app/api/growth/pricing-tiers/route.ts
5. src/app/api/growth/retention-metrics/route.ts
6. src/app/api/growth/sales-pipeline/route.ts
7. src/app/api/growth/unit-economics/route.ts
8. src/app/api/metrics/control-effectiveness/route.ts

---

## I. Success Criteria for R1-D2-B

✓ Build passes (0 TypeScript errors)  
✓ All tests pass (402/402, 0 regressions)  
✓ Scanner shows 320 violations (-32 from baseline)  
✓ Only selected 8 routes modified  
✓ No service files changed  
✓ No scope violations  
✓ Commit includes R1-D2-B implementation + validation report  

---

**Status: ✓ NARROWED BATCH SELECTION COMPLETE - 8 METRICS/GROWTH ROUTES IDENTIFIED**

**Next Step: R1-D2-B Implementation Authorization**
