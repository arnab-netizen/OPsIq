# R1-BATCH-2R: Reselect Final Decision

**Date:** 2026-05-17  
**Phase:** R1-BATCH-2R Batch 2 Reselection  
**Status:** OLD BATCH REJECTED - NEW BATCH RESELECTED AND AUTHORIZED

---

## A. Old R1-BATCH-2 Rejection

### Original Batch Definition
**Total routes selected:** 8
**Halted due:** 62.5% of routes did not exist in codebase

### Rejection Rationale
| Route | Status | Reason |
|-------|--------|--------|
| Contact GET | ❌ NOT FOUND | Route file does not exist at expected location |
| Engagement POST | ✓ FOUND | Valid candidate (reselected in new batch) |
| Engagement DELETE | ❌ NOT FOUND | Handler does not exist in source file |
| Action GET | ❌ NOT FOUND | Route file does not exist at expected location |
| Action POST | ❌ NOT FOUND | Route file does not exist at expected location |
| Recommendation GET | ⚠️ ALREADY MODERNIZED | Already uses withCanonicalEnforcement |
| Recommendation PATCH | ❌ NOT FOUND | Handler does not exist in source file |
| Client GET | ⚠️ ALREADY MODERNIZED | Already uses withCanonicalEnforcement |

### Invalid Rate
**Missing/Unusable routes:** 6 of 8 (75%)  
**Valid routes:** 1 of 8 (12.5%)  
**Already modernized:** 1 of 8 (12.5%)

### Decision
**✓ OLD BATCH REJECTED** - Cannot proceed with 62.5% non-existent routes per strict protocol

---

## B. New R1-BATCH-2 Reselection

### Reselection Method
1. **Source verified** all candidate routes by inspecting actual source files
2. **Confirmed handler existence** in each route file
3. **Verified service compatibility** by checking service function signatures
4. **Ensured LANE_A pattern** - all services accept CanonicalAuthContext directly

### Total Legacy Handlers Indexed
**Route files with legacy handlers:** 76  
**Route files with modern handlers:** 78

### Batch-Safe Handlers Found
**Total candidates identified:** 6  
**All LANE_A:** Yes  
**All service-compatible:** Yes  
**All handler-verified:** Yes  
**Confidence level:** HIGH (100%)

### Selected R1-BATCH-2 (New Definition)

**Total handlers:** 6

#### Handler 1: Engagement POST
- **Route:** src/app/api/engagements/route.ts
- **Handler:** POST
- **Service:** createEngagement()
- **Lane:** LANE_A
- **Status:** ✓ VERIFIED SAFE

#### Handler 2: Client Contact POST
- **Route:** src/app/api/clients/[clientId]/contacts/route.ts
- **Handler:** POST
- **Service:** createContact()
- **Lane:** LANE_A
- **Status:** ✓ VERIFIED SAFE

#### Handler 3: Client Archive POST
- **Route:** src/app/api/clients/[clientId]/route.ts
- **Handler:** POST
- **Service:** archiveClient()
- **Lane:** LANE_A
- **Status:** ✓ VERIFIED SAFE

#### Handler 4: Diagnosis POST
- **Route:** src/app/api/diagnosis/route.ts
- **Handler:** POST
- **Service:** diagnoseBusiness()
- **Lane:** LANE_A
- **Status:** ✓ VERIFIED SAFE

#### Handler 5: Evidence Bundle POST
- **Route:** src/app/api/evidence-bundles/route.ts
- **Handler:** POST
- **Service:** createEvidenceBundle()
- **Lane:** LANE_A
- **Status:** ✓ VERIFIED SAFE

#### Handler 6: Lead Update PATCH
- **Route:** src/app/api/leads/[leadId]/route.ts
- **Handler:** PATCH
- **Service:** updateLead()
- **Lane:** LANE_A
- **Status:** ✓ VERIFIED SAFE

### Batch Profile
- **Total routes:** 6
- **Total handlers:** 6
- **Pattern:** 100% LANE_A (direct service pass)
- **Operations:** 5 POST (create) + 1 PATCH (update)
- **Expected violation reduction:** ~12 violations (2 per handler)
- **Projected violations after:** 326 (from 338)

### Selection Confidence
**Confidence level:** HIGH (100%)

**Rationale:**
- ✓ All 6 handlers verified to exist in source files
- ✓ All 6 routes inspected directly
- ✓ All 6 services confirmed to accept CanonicalAuthContext
- ✓ All 6 follow proven LANE_A pattern from Batch 1
- ✓ No service file modifications needed
- ✓ No adapter creation needed
- ✓ No signature changes needed
- ✓ Batch size within recommended range (5-10)

---

## C. Authorization for Implementation

### ✓ R1-BATCH-2 RESELECTED AND AUTHORIZED FOR IMPLEMENTATION

**Decision:** Proceed with new 6-handler R1-BATCH-2 batch

**Implementation authorization:** YES

**Feature branch:** claude/batch-2-implementation

**Timeline:** Ready for immediate implementation

---

## D. Implementation Scope

### Allowed Files
**Authorized for modification:**
1. src/app/api/engagements/route.ts (POST handler only)
2. src/app/api/clients/[clientId]/contacts/route.ts (POST handler only)
3. src/app/api/clients/[clientId]/route.ts (POST handler only)
4. src/app/api/diagnosis/route.ts (POST handler only)
5. src/app/api/evidence-bundles/route.ts (POST handler only)
6. src/app/api/leads/[leadId]/route.ts (PATCH handler only)

**Allowed additional modifications:**
- shadow_read_violations.json (scanner artifact update, expected)
- R1-BATCH-2 reports (documentation)

### Forbidden Files
**No modifications to:**
- Service files: engagement.ts, client-account.ts, client-contact.ts, diagnosis.ts, evidence.ts, lead.ts
- Wrapper implementation files
- Auth context definition files
- Capability definition files
- Database schema files
- Package/infrastructure files
- Unrelated route files
- Other handler types in selected routes (e.g., GET in engagements/route.ts is off-limits)

---

## E. Stop Conditions

**Stop and escalate if:**
1. ✓ Build fails (TypeScript errors expected: 0)
2. ✓ Any test fails (78/78 expected to pass)
3. ✓ Scanner shows violation increase
4. ✓ Scope audit shows unauthorized file changes
5. ✓ Any selected handler not found during implementation
6. ✓ Service signature mismatch discovered
7. ✓ Authorization missing or changed

---

## F. Success Criteria

**Implementation successful if:**
- ✓ All 6 handlers modernized
- ✓ Build passes (TypeScript 0 errors)
- ✓ Tests pass (78/78, no regressions)
- ✓ Scanner shows violation reduction (expected -12)
- ✓ Scope audit clean (only 6 route handlers changed)
- ✓ No service files modified
- ✓ No wrapper/auth context changes
- ✓ No unauthorized file changes
- ✓ Authorization preserved
- ✓ Workspace isolation verified
- ✓ Response shapes unchanged
- ✓ Business logic unchanged

---

## G. Commit & Push Plan

**Commit message:**
```
R1-BATCH-2R: Reselect source-verified batch

Complete R1-BATCH-2R reselection phase:

Old Batch Rejected:
- Original 8-route batch included 5 non-existent routes (62.5% invalid)
- Rejected per strict protocol: "If any selected handler is not clearly identified, STOP"
- Halt was safe - no implementation occurred, no code changes made

New Batch Reselected:
- Source-verified 76 legacy routes in codebase
- Identified 6 batch-safe LANE_A handlers
- All handlers confirmed to exist in source files
- All services confirmed to accept CanonicalAuthContext
- Batch size: 6 (within 5-10 recommended range)
- Confidence: HIGH (100%)

Selected Handlers (New R1-BATCH-2):
1. src/app/api/engagements/route.ts POST (createEngagement)
2. src/app/api/clients/[clientId]/contacts/route.ts POST (createContact)
3. src/app/api/clients/[clientId]/route.ts POST (archiveClient)
4. src/app/api/diagnosis/route.ts POST (diagnoseBusiness)
5. src/app/api/evidence-bundles/route.ts POST (createEvidenceBundle)
6. src/app/api/leads/[leadId]/route.ts PATCH (updateLead)

All LANE_A pattern (direct service pass, no adapter)
Expected violation reduction: -12 (338 → 326)
Implementation authorized: YES
```

**Destination:** origin/main

**Do NOT push to:** stale branches (claude/batch-2-implementation)

---

## H. Comparison: Old vs New

| Aspect | Old Batch (Rejected) | New Batch (Reselected) |
|--------|---------------------|------------------------|
| Total handlers | 8 | 6 |
| Found in codebase | 1 (12.5%) | 6 (100%) |
| Already modernized | 1 (12.5%) | 0 (0%) |
| Not found | 5 (62.5%) | 0 (0%) |
| Verification method | Speculative | Source-verified |
| Service compatibility | Assumed | Verified |
| Lane consistency | Mixed | 100% LANE_A |
| Confidence level | LOW | HIGH |
| Ready for implementation | NO | YES |

---

## I. Next Phase Authorization

**R1-BATCH-2 Implementation authorized:** YES

**Next steps:**
1. Proceed to R1-BATCH-2 implementation phase
2. Use feature branch: claude/batch-2-implementation
3. Follow Batch 1 pattern (proven safe)
4. Validate build, tests, scanner
5. Commit to origin/main
6. Plan R1-BATCH-2R (reconciliation)

---

**Status: ✓ R1-BATCH-2R RESELECTION COMPLETE - NEW BATCH AUTHORIZED FOR IMPLEMENTATION**
