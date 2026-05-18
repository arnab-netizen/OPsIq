# R1-SPECIAL-2E-BATCH-1: Authorization Confirmation

**Date:** 2026-05-18  
**Phase:** R1-SPECIAL-2E-BATCH-1 Authorization Verification  
**Status:** ✓ BATCH 1 AUTHORIZED - 3 GROWTH METRICS HANDLERS

---

## A. Authorization Sources

**Prior Decision:** R1-SPECIAL-2E-BATCH-1-RESELECT
- Status: ✓ Approved
- Reselection reason: Original batch violated grouping rules (mixed webhook + auth + metrics)
- Selected group: GROUP_4_GROWTH_METRICS only

**Grouping Report:** r1_special_2e_safe_grouping.json
- GROUP_4_GROWTH_METRICS classified as E2_MODERATE_STATEFUL
- All 3 handlers homogeneous
- Status: Ready for implementation

**Strategy Document:** r1_special_2e_implementation_strategy.md
- Modernization pattern: Wrapper replacement + add idempotency key support
- Safeguards defined
- Implementation approach confirmed

---

## B. Authorized Handlers (3 Total)

### 1. src/app/api/growth/unit-economics/route.ts (POST)
**Authorization:** ✓ APPROVED  
**Risk Tier:** E2_MODERATE_STATEFUL  
**Pattern:** Internal metrics calculation  
**External Effects:** None  
**Service Changes:** None required  
**Idempotency:** Key-based  

### 2. src/app/api/growth/acquisition-metrics/route.ts (POST)
**Authorization:** ✓ APPROVED  
**Risk Tier:** E2_MODERATE_STATEFUL  
**Pattern:** Internal metrics calculation  
**External Effects:** None  
**Service Changes:** None required  
**Idempotency:** Key-based  

### 3. src/app/api/growth/sales-pipeline/route.ts (POST)
**Authorization:** ✓ APPROVED  
**Risk Tier:** E2_MODERATE_STATEFUL  
**Pattern:** Internal metrics calculation  
**External Effects:** None  
**Service Changes:** None required  
**Idempotency:** Key-based  

---

## C. Authorization Boundaries

**Allowed Changes:**
- ✓ withEnforcementFull → withCanonicalEnforcement wrapper
- ✓ Handler signature: (request: NextRequest) → (ctx: CanonicalAuthContext)
- ✓ Add idempotency key extraction: ctx.request?.headers.get("idempotency-key")
- ✓ Replace session.user.id with ctx.verifiedActorId
- ✓ Use ctx.verifiedWorkspaceId for workspace scoping
- ✓ Preserve metrics calculation logic exactly
- ✓ Preserve audit/event logging

**Forbidden Changes:**
- ✗ No service file changes
- ✗ No service signature changes
- ✗ No webhook/auth route changes
- ✗ No wrapper architecture changes
- ✗ No auth context changes
- ✗ No capability/role/entitlement changes
- ✗ No database/schema changes
- ✗ No response shape changes
- ✗ No business logic changes

**Files Allowed:**
- ✓ src/app/api/growth/unit-economics/route.ts
- ✓ src/app/api/growth/acquisition-metrics/route.ts
- ✓ src/app/api/growth/sales-pipeline/route.ts

**Files Forbidden:**
- ✗ Any auth/* routes
- ✗ Any webhooks/* routes
- ✗ Any engagements/* routes
- ✗ Any service files
- ✗ Any wrapper files
- ✗ Any capability/role files

---

## D. Grouping Rule Compliance

**Homogeneity:** ✓ VERIFIED
- All 3 handlers: Internal metrics only
- All 3 handlers: E2_MODERATE_STATEFUL
- All 3 handlers: No external effects
- All 3 handlers: No webhook behavior
- All 3 handlers: Idempotency key-based
- All 3 handlers: Independent (no conflicts)

**No Rule Violations:** ✓ CONFIRMED
- ✓ No webhook mixing
- ✓ No auth session mixing
- ✓ No side-effect profile mixing
- ✓ Homogeneous pattern throughout

---

## E. Authorization Verdict

**Batch 1 Status:** ✓ AUTHORIZED FOR IMPLEMENTATION

**Handlers Authorized:** 3 (growth metrics only)

**Risk Level:** SAFE (E2_MODERATE_STATEFUL, no external effects, no state machines)

**Implementation Pattern:** Wrapper replacement + idempotency key support

**Expected Impact:** 9 violations reduction (6 critical, 3 block-build)

---

**Status: ✓ R1-SPECIAL-2E-BATCH-1 AUTHORIZED - READY FOR SOURCE TRUTH CHECK**
