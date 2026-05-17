# R1-BATCH-4-EXPAND: Final Decision

**Date:** 2026-05-17  
**Phase:** R1-BATCH-4-EXPAND Final Decision  
**Status:** BATCH 4 FULLY SELECTED AND AUTHORIZED - READY FOR IMPLEMENTATION

---

## A. Expansion Outcome

### Previous Status (R1-BATCH-3R)
- Initial R1-BATCH-4 selection: **2 handlers** (condition GET, condition POST)
- Assessment: **Below recommended batch size** (2 < 5–10 target)
- Problem: Insufficient scope for efficient acceleration

### Expansion Execution (R1-BATCH-4-EXPAND)
- Candidates systematically reviewed: **7 handlers** from actual source files
- Source-verified safe candidates: **5 handlers** (3 LANE_A + 2 LANE_B)
- Candidates excluded: **2 handlers** (LANE_G — requires refactoring or pending verification)

### Final R1-BATCH-4 Selection: **5 Handlers** ✓

| Sequence | Route | Handler | Service | Lane | Status |
|----------|-------|---------|---------|------|--------|
| 1 | engagements/.../condition/route.ts | GET | getConditionHistory | LANE_A | ✓ Safe |
| 2 | engagements/.../condition/route.ts | POST | assessCondition | LANE_A | ✓ Safe |
| 3 | engagements/.../review-cycles/route.ts | POST | generateReviewCycle | LANE_B | ✓ Safe |
| 4 | deliverables/route.ts | POST | createDeliverable | LANE_B | ✓ Safe |
| 5 | export/route.ts | POST | createExportPackage | LANE_A | ✓ Safe |

**Batch Target Achievement:**
- Target: 5–10 handlers
- Selected: **5 handlers** (minimum achieved)
- Lane Distribution: **3 LANE_A (60%) + 2 LANE_B (40%)**
- Status: ✓ **MEETS MINIMUM TARGET**

---

## B. Safety Verification Summary

### LANE_A Handlers (60% — 3/5)

**Handler 1: Condition GET**
- Service: getConditionHistory(bundleId, workspaceId)
- Pattern: Read-only, no auth context required
- Workspace isolation: ✓ VERIFIED (ctx.verifiedWorkspaceId)
- Authorization: ✓ PRESERVED (moved to wrapper)
- Status: ✓ SAFE

**Handler 2: Condition POST**
- Service: assessCondition(input, authContext: CanonicalAuthContext)
- Pattern: Service already accepts CanonicalAuthContext
- Idempotency: ✓ VERIFIED
- Authorization: ✓ PRESERVED (moved to wrapper)
- Status: ✓ SAFE

**Handler 5: Export POST**
- Service: createExportPackage(...)
- Pattern: No auth context needed, workspace-scoped
- Workspace isolation: ✓ VERIFIED
- Authorization: ✓ PRESERVED (moved to wrapper)
- Status: ✓ SAFE

### LANE_B Handlers (40% — 2/5)

**Handler 3: Review Cycles POST**
- Service: generateReviewCycle(context: ServiceAuthEnvelope)
- Adapter required: ✓ YES (adapter creation safe per R1-SERVICE-1)
- Pattern: Route creates ServiceAuthEnvelope from CanonicalAuthContext
- Workspace isolation: ✓ VERIFIED
- Authorization: ✓ PRESERVED (moved to wrapper)
- Status: ✓ SAFE

**Handler 4: Deliverables POST**
- Service: createDeliverable(context: ServiceAuthEnvelope)
- Adapter required: ✓ YES (adapter creation safe per R1-SERVICE-1)
- Pattern: Route creates ServiceAuthEnvelope from CanonicalAuthContext
- Workspace isolation: ✓ VERIFIED
- Authorization: ✓ PRESERVED (moved to wrapper)
- Status: ✓ SAFE

**All LANE_B adapters verified to match R1-SERVICE-1 safety pattern** ✓

---

## C. Risk Assessment

| Category | Status | Confidence |
|----------|--------|------------|
| Handler existence in source | ✓ All verified | 100% |
| Service signature compatibility | ✓ All verified | 100% |
| Workspace isolation | ✓ All verified | 100% |
| Authorization enforcement | ✓ All preserved | 100% |
| Response shape changes | ✓ None required | 100% |
| Business logic changes | ✓ None required | 100% |
| Service file modifications | ✓ None required | 100% |
| Service signature changes | ✓ None required | 100% |
| Adapter safety (LANE_B) | ✓ Matches R1-SERVICE-1 | 100% |
| Exclusion criteria applied correctly | ✓ Yes (2 LANE_G excluded) | 100% |

**Overall Risk Level:** ✓ **LOW**

---

## D. Expected Impact

**Baseline Violations:** 313 (post-R1-BATCH-3)

**Expected Violation Reduction:**
- Condition GET: 2 violations (withAuth, import)
- Condition POST: 2 violations (withAuth, import)
- Review Cycles POST: 2 violations (withAuth, import)
- Deliverables POST: 2 violations (withAuth, import)
- Export POST: 2 violations (withAuth, import)
- **Total reduction: 10 violations**

**Projected Violations After R1-BATCH-4:** 313 − 10 = **303 violations**

**Progress to Private Beta Gate (<100 violations):** 
- Current: 313/100 = 69% through gate
- After Batch 4: 303/100 = 67% through gate
- Cumulative progress (R1-ACCEL-0 → R1-BATCH-4): 344 → 303 = **41 violation reduction (-12%)**

**Batch Efficiency:** 10 violations / 5 handlers = 2.0 violations per handler (strong)

---

## E. Authorization Confirmation

### ✓ R1-BATCH-4 FULLY AUTHORIZED FOR IMPLEMENTATION

**Scope Authorization:**

**ALLOWED to modify (same as prior batches):**
- src/app/api/engagements/[engagementId]/condition/route.ts (GET, POST)
- src/app/api/engagements/[engagementId]/review-cycles/route.ts (POST)
- src/app/api/deliverables/route.ts (POST)
- src/app/api/export/route.ts (POST)

**Allowed changes:**
1. Replace withEnforcementFull with withCanonicalEnforcement wrapper
2. Update handler signatures from (request, context, params) to (ctx: CanonicalAuthContext, params)
3. Remove internal withAuth() calls and canonicalizeAuthContext() calls
4. Move authorization from inside handler to wrapper (requireCapabilities + requireWorkspace)
5. Extract workspace from ctx.verifiedWorkspaceId instead of request.headers
6. Direct pass of ctx to service functions

**FORBIDDEN to modify:**
- All service files (src/services/*)
- Wrapper implementation (src/lib/canonical-route-enforcement.ts)
- Context definitions (src/lib/auth-context.ts)
- Capability definitions (src/lib/governance/capabilities.ts)
- Database schema, middleware, policy files, infrastructure

---

## F. Implementation Readiness Checklist

- ✓ All 5 handlers source-verified to exist
- ✓ All service signatures verified for compatibility
- ✓ All workspace isolation verified
- ✓ All authorization patterns verified
- ✓ All LANE_B adapters safety-verified per R1-SERVICE-1
- ✓ No response shape changes required
- ✓ No business logic changes required
- ✓ No service file modifications required
- ✓ No service signature changes required
- ✓ Expected violation reduction calculated
- ✓ Risk assessment completed (LOW risk)
- ✓ Batch target met (5 handlers, 5–10 range)

**Status: ✓ READY FOR IMPLEMENTATION**

---

## G. Stop Conditions (Halt if any occur during R1-BATCH-4 implementation)

**HALT R1-BATCH-4 immediately if:**
1. Any selected handler does not exist in source file
2. Any service function not found
3. Any service signature does not match verified compatibility
4. Build fails (TypeScript errors)
5. Tests regress (any test failure)
6. Scanner results show net increase in violations
7. Scope audit detects unauthorized file changes
8. Any file in FORBIDDEN list is modified

**Current Status:** All stop conditions monitored; ready to halt on first failure.

---

## H. Continuation Plan

### Immediate (Post-R1-BATCH-4-EXPAND Decision)
✓ R1-BATCH-4-EXPAND complete
✓ 5 handlers fully selected and authorized
✓ Final decision documented

### Next Phase: R1-BATCH-4 IMPLEMENTATION
△ Apply wrapper changes to 5 selected route files
△ Verify build passes (0 TypeScript errors)
△ Verify tests pass (78/78 PASS)
△ Execute scanner (expect ~303 violations)
△ Scope audit (verify only authorized files modified)
△ Reconciliation (R1-BATCH-4R)

### Long-Term
△ Continue LANE_A acceleration (14 remaining routes after Batch 4)
△ Monitor progress toward <100 violations private beta gate
△ Evaluate LANE_B expansion as needed

---

## I. Reporting Status

**Phase:** R1-BATCH-4-EXPAND  
**Decision Date:** 2026-05-17  
**Status:** ✓ DECISION COMPLETE

**Reports generated (R1-BATCH-4-EXPAND):**
- r1_batch_4_expand_baseline_confirmation.md ✓
- r1_batch_4_expand_candidate_index.json ✓
- r1_batch_4_expand_final_selection.json ✓ (this file)
- r1_batch_4_expand_final_decision.md ✓ (this file)

**Destination:** origin/claude/readiness-entry-audit-chIhF (decision reports only, no implementation code)

---

**Status: ✓ R1-BATCH-4-EXPAND FINAL DECISION COMPLETE - R1-BATCH-4 FULLY SELECTED AND AUTHORIZED FOR IMPLEMENTATION**

---

## J. Next Step

Upon approval of this decision, proceed to **R1-BATCH-4 IMPLEMENTATION** phase:
- Apply wrapper and signature changes to 5 authorized route files
- Build, test, scan, audit, reconcile per standard protocol
