# R1-SPECIAL-2E-BATCH-1: Reselection

**Date:** 2026-05-17  
**Phase:** R1-SPECIAL-2E-BATCH-1 Reselection  
**Status:** FIRST BATCH RESELECTED - HOMOGENEOUS GROUP ONLY

---

## A. Original Batch Rejection

**Original First Batch (R1-SPECIAL-2E-BATCH-1):** ✗ REJECTED

**Handlers (Mixed):**
1. auth/logout (E1)
2. auth/login (E2)
3. growth/unit-economics (E2)
4. growth/acquisition-metrics (E2)
5. growth/sales-pipeline (E2)
6. webhooks/stripe (E2)

**Rejection Reason:** VIOLATES LANE_E GROUPING RULE

**Specific Violations:**
- ✗ Mixes webhook (stripe) + non-webhook (auth, metrics)
- ✗ Mixes auth session (login/logout) + metrics
- ✗ Mixes different side-effect profiles:
  - Auth: Session creation/invalidation
  - Growth: Metrics calculation (no external effects)
  - Webhook: Payment processing (external effects)
- ✗ Not homogeneous by shared characteristics

**Grouping Rule Violated:**
"Do not mix webhook + non-webhook. Do not mix auth session + metrics. Do not mix different side-effect profiles."

---

## B. Final Batch Reselection

**Selected Group:** GROUP_4_GROWTH_METRICS (Homogeneous, E2 Moderate)

**Final First Batch (R1-SPECIAL-2E-BATCH-1-RESELECT):**

| Handler | Method | Risk | Mutations | External Effects | Idempotency |
|---------|--------|------|-----------|------------------|-------------|
| growth/unit-economics | POST | E2 | 1 | None | Key-based |
| growth/acquisition-metrics | POST | E2 | 1 | None | Key-based |
| growth/sales-pipeline | POST | E2 | 1 | None | Key-based |

---

## C. Homogeneity Verification

**Shared Characteristics (All 3 Handlers):**
- ✓ Same risk tier: E2_MODERATE_STATEFUL
- ✓ Same side-effect profile: Internal metrics only (no external effects)
- ✓ Same idempotency model: Idempotency key required
- ✓ Same transactionality: Metrics update atomic
- ✓ Same concurrency: No conflicts (independent metrics)
- ✓ Same reversibility: Metrics recalculation possible
- ✓ Same service pattern: calculateMetrics() call

**Grouping Rule Compliance:**
- ✓ No webhook mixing (all metrics, no webhooks)
- ✓ No auth session mixing (all metrics, no auth)
- ✓ Homogeneous side-effect profile (all internal)
- ✓ Pure metrics domain (growth team only)

**Verdict:** ✓ HOMOGENEOUS GROUP - APPROVED

---

## D. Implementation Profile

**Modernization Pattern:** Wrapper replacement + add idempotency key support

**Allowed Changes:**
- ✓ Replace withEnforcementFull with withCanonicalEnforcement
- ✓ Add idempotency key parameter (from request headers)
- ✓ Replace session.user.id with ctx.verifiedActorId
- ✓ Use ctx.verifiedWorkspaceId for workspace scoping
- ✓ Preserve metrics calculation logic exactly

**Forbidden Changes:**
- ✗ No service signature changes
- ✗ No capability changes
- ✗ No role changes
- ✗ No entitlement changes
- ✗ No database schema changes
- ✗ No wrapper architecture changes
- ✗ No auth context changes
- ✗ No business logic changes

**Allowed Files:**
- ✓ src/app/api/growth/unit-economics/route.ts
- ✓ src/app/api/growth/acquisition-metrics/route.ts
- ✓ src/app/api/growth/sales-pipeline/route.ts

**Forbidden Files:**
- ✗ src/services/* (all service files)
- ✗ src/lib/enforced-route.ts (wrapper unchanged)
- ✗ src/lib/canonical-route-enforcement.ts (no changes)
- ✗ src/domain/constants/capabilities.ts (no changes)
- ✗ src/domain/constants/roles.ts (no changes)
- ✗ src/infra/* (no changes)
- ✗ src/middleware/* (no changes)

---

## E. Expected Impact

**Handlers:** 3 (all homogeneous, all safe)

**Estimated Scanner Reduction:** 9 violations
- Critical: 6 violations
- Block-build: 3 violations

**Risk Level:** SAFE (E2_MODERATE_STATEFUL only, no state machines, no external effects)

**Batch Safety Profile:**
- ✓ Deterministic (metrics calculation deterministic)
- ✓ Reversible (metrics recalculation possible)
- ✓ Transactional (atomic updates)
- ✓ No concurrency issues (independent metrics)
- ✓ No external side-effects (internal only)

---

## F. Implementation Authorization

**Batch:** R1-SPECIAL-2E-BATCH-1-RESELECT  
**Handlers:** 3 (growth metrics)  
**Risk Level:** SAFE  
**Implementation Authorized:** ✓ YES

**Next Phase:** R1-SPECIAL-2E-BATCH-1 Implementation (3 handlers only)

---

**Status: ✓ R1-SPECIAL-2E-BATCH-1 RESELECTED - HOMOGENEOUS GROUP APPROVED FOR IMPLEMENTATION**
