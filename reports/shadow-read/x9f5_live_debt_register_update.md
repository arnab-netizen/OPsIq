# X9F-5: Live Debt Register Update

**Date:** 2026-05-16  
**Phase:** X9F-5 - Debt Tracking  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Current Debt Status

### Live Debt Item #1: createDecision Dual-Format Support (X9F-2)

**Service:** createDecision  
**File:** src/services/decisions/decision-creation-service.ts  
**Status:** ACTIVE (dual-format support still in place)  
**Introduced in:** X9F-2 (createDecision refactoring)

**Current State:**
- Service accepts union type: `VerifiedDecisionInput | CreateDecisionInput`
- Runtime format detection via duck-typing
- CreateDecisionInput (old format) still structurally accepted
- All production callers use VerifiedDecisionInput
- No test callers use old format

**Why currently safe:** X9F-2R audit confirmed all 4 production callers use verified format exclusively

**Why it's live debt:** Undermines refactoring intent, creates maintenance burden, inconsistent with other services

**Required future removal phase:** X9F-5-DEBT-CLEANUP (after X9F-5 rejectDecision complete)

**Removal plan:** Remove CreateDecisionInput from union type, remove runtime detection, simplify to single format only

---

### Live Debt Item #2: createDecision Backward Compatibility (X9F-2)

**Type:** Backward compatibility layer  
**Pattern:** Union type + runtime format detection  
**Introduced in:** X9F-2 (for transition safety)  
**Status:** ACCEPTED BUT TEMPORARY

**Current State:**
```typescript
export async function createDecision(
  input: VerifiedDecisionInput | CreateDecisionInput  // Both formats accepted
): Promise<CreateDecisionResult>
```

**Removal timing:** X9F-5-DEBT-CLEANUP phase

**Dependency:** Must wait until X9F-5 (rejectDecision) complete to ensure consistent pattern

---

## New Debt Status After X9F-5

### acceptDecision Refactoring (X9F-4)

**Pattern:** VerifiedAcceptanceInput (single format)  
**Backward compatibility:** NONE  
**Dual-format support:** NOT ADDED  
**Debt status:** CLEAN (no future removal needed)

**Reasoning:** Single format enforced at compile time, no runtime compatibility layer

---

### rejectDecision Refactoring (X9F-5 - Pending)

**Pattern:** VerifiedRejectionInput (single format)  
**Backward compatibility:** NOT PLANNED  
**Dual-format support:** NOT ALLOWED  
**Debt status:** CLEAN (no future removal needed)

**Reasoning:** Same as acceptDecision - single format pattern avoids compatibility burden

---

## Debt Comparison Table

| Service | Pattern | Format Support | Debt | Removal Phase |
|---------|---------|-----------------|------|----------------|
| createDecision | VerifiedDecisionInput + CreateDecisionInput | DUAL | ✓ ACTIVE | X9F-5-DEBT-CLEANUP |
| acceptDecision | VerifiedAcceptanceInput | SINGLE | ✗ NONE | N/A |
| rejectDecision | VerifiedRejectionInput (X9F-5) | SINGLE | ✗ NONE | N/A |
| closeDecision | TBD (X9G) | TBD | TBD | TBD |

---

## Root Cause Analysis: Why X9F-2 Added Dual-Format

**Context:** X9F-2 was the first service refactoring pilot

**Reasoning at the time:**
- createDecision only service refactored
- No proven pattern yet
- Conservative approach: keep backward compatibility as safety net
- Goal: ensure no legacy code breaks during transition
- Risk mitigation: runtime format detection allows fallback

**Result:** Temporary compatibility layer for transition safety

**Lesson applied to X9F-4:**
- After X9F-2 proven safe (X9F-2R audit confirmed all callers use new format)
- acceptDecision (X9F-4) refactored with SINGLE format only
- No backward compatibility needed (route updated to new format, no external callers)
- Cleaner type safety

**Lesson to apply to X9F-5:**
- rejectDecision refactoring should follow acceptDecision pattern (X9F-4)
- Single format only (VerifiedRejectionInput)
- No backward compatibility debt
- Type-safe enforcement

---

## Future Removal Phase: X9F-5-DEBT-CLEANUP

**Phase Name:** X9F-5-DEBT-CLEANUP  
**Proposed timing:** Immediately after X9F-5 completion  
**Target:** Consolidate pattern across decision services

**Scope:**
1. Remove CreateDecisionInput interface from decision-creation-service.ts
2. Remove runtime format detection logic
3. Update BulkCreateInput to accept only VerifiedDecisionInput
4. Simplify createDecision signature to accept only VerifiedDecisionInput

**Impact:**
- ~15 lines removed
- Type safety improved
- All decision services follow consistent single-format pattern
- No production code affected (all callers already use verified format)

**Blockers:** None - X9F-2R audit confirmed safe removal

**Conditions before removal:**
- ✓ X9F-5 (rejectDecision) successfully completed
- ✓ All decision services refactored (X9F-2, X9F-4, X9F-5)
- ✓ Pattern consistency verified
- ✓ Confidence in production usage patterns high

---

## Debt Impact on X9F-5 Selection

**Question:** Should X9F-5 include cleanup of X9F-2 debt?

**Answer:** NO - separate concerns

**Reasoning:**
1. X9F-5 focuses on rejectDecision refactoring (new work)
2. X9F-2 cleanup is independent (debt removal)
3. Separating them reduces risk and scope per phase
4. Clearer validation: X9F-5 validates new refactoring works, X9F-5-DEBT-CLEANUP validates cleanup is safe

**Recommendation:** Defer X9F-2 cleanup to dedicated X9F-5-DEBT-CLEANUP phase

---

## Debt Summary For Governance

| Item | Service | Pattern | Status | Removal | Priority |
|------|---------|---------|--------|---------|----------|
| #1 | createDecision | Dual-format | ACTIVE | X9F-5-DEBT-CLEANUP | HIGH |
| #1a | createDecision backward compat | Union + detection | ACCEPTED TEMP | X9F-5-DEBT-CLEANUP | HIGH |

**Total active debt items:** 1 (with 1 sub-item)  
**Total removed debt items:** 0  
**Debt trend:** Stable (new refactorings add zero debt due to single-format pattern)

---

## Future Vision: Debt-Free Service Architecture

**Current State (X9F-5):**
- createDecision: 1 debt item (dual-format)
- acceptDecision: Clean (single format)
- rejectDecision: Will be clean (single format)
- closeDecision: TBD pending governance

**After X9F-5-DEBT-CLEANUP (target state):**
- createDecision: Clean (single format)
- acceptDecision: Clean (single format)
- rejectDecision: Clean (single format)
- closeDecision: Depends on X9G decisions

**Recommendation:** Commit to X9F-5-DEBT-CLEANUP to achieve pattern consistency

---

## Approval Status

**Live Debt Register Updated:** YES

**Debt items tracked:**
1. createDecision dual-format support (X9F-2)
2. createDecision backward compatibility layer

**Removal authorized:** Conditional on X9F-5 completion

**Next review:** After X9F-5 implementation complete

