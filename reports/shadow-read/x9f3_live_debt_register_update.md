# X9F-3: Live Debt Register Update

**Date:** 2026-05-16  
**Phase:** X9F-3 - Debt Tracking  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Background

X9F-2 (createDecision refactoring) introduced a temporary backward compatibility pattern:
- Service accepts union type: `VerifiedDecisionInput | CreateDecisionInput`
- Old CreateDecisionInput format still structurally accepted
- Runtime format detection via duck-typing: `'verifiedActorId' in input`

This decision was made to maintain safety during transition:
- All production callers updated to new format
- No production code uses old format
- Old format remains accepted as safety net

---

## Live Debt Item #1: createDecision Dual-Format Support

### Item Description

**Service:** createDecision  
**File:** src/services/decisions/decision-creation-service.ts  
**Type:** Backward compatibility debt  
**Status:** ACTIVE (dual-format support still in place)

### Current State

**Union Type Acceptance:**
```typescript
export async function createDecision(
  input: VerifiedDecisionInput | CreateDecisionInput  // ACCEPTS BOTH
): Promise<CreateDecisionResult>
```

**Runtime Format Detection:**
```typescript
const isVerified = 'verifiedActorId' in input && 'verifiedWorkspaceId' in input;
if (isVerified) {
  // Use verified format
} else {
  // Fallback to old format
}
```

**CreateDecisionInput (old format):**
```typescript
export interface CreateDecisionInput {
  title: string;
  type: string;
  impact: number;
  confidence: number;
  workspaceId: string;      // NOT marked as verified
  userId: string;            // NOT marked as verified
}
```

### Why Currently Safe

**X9F-2R Audit Findings:**

1. **All Production Callers Use Verified Format:**
   - decisions/create route (line 70): Uses VerifiedDecisionInput
   - createDecisionsBulk (line 162): Receives VerifiedDecisionInput
   - No other production callers found
   - 4/4 callers verified

2. **No Test Callers Use Old Format:**
   - Tests call through route (integration style)
   - No direct service calls with old format
   - No mock/stub callers with old format

3. **No Production Code Bypass Path:**
   - Only entry point is decisions/create route
   - Route constructs verified input
   - No internal/background paths that accept old format

4. **Runtime Detection Works Correctly:**
   - Duck-typing correctly identifies format
   - Field detection handles both cases
   - Error handling preserved for union type

### Why It's Live Debt

1. **Undermines Refactoring Intent:**
   - Refactoring goal: Strengthen auth boundary with explicit verified input
   - Current state: Weak callers still technically allowed (duck-typing)
   - Signal to future developers: "either format is OK"

2. **Maintenance Burden:**
   - Runtime format detection is code smell
   - Type system doesn't enforce strictness
   - Must maintain compatibility code indefinitely

3. **Future Risk:**
   - New developer could call service directly with old format
   - Would bypass route-level auth checks (if called from different context)
   - Type system allows it; code would run

4. **Inconsistency:**
   - createDecision accepts both formats
   - acceptDecision will accept only VerifiedAcceptanceInput (X9F-3)
   - rejectDecision will accept only VerifiedRejectionInput (X9F-4)
   - closeDecision pattern TBD (X9G)

### Required Future Removal Phase

**Phase Name:** X9F-5 or X9G (to be determined)  
**Name Convention:** X9F-5-DEBT-CLEANUP or X9G-LEGACY-PATTERN-MIGRATION

**Conditions Before Removal:**

1. ✓ Confidence that no legacy callers exist
   - X9F-2R audit: 4/4 callers use verified format
   - No tests depend on old format
   - Can remove once this confidence is documented

2. ✓ All related services refactored (X9F-3, X9F-4, X9G)
   - acceptDecision refactored (X9F-3)
   - rejectDecision refactored (X9F-4)
   - closeDecision refactored (X9G)
   - Pattern consistent across all decision services

3. ✓ Sufficient time has passed in production
   - Recommended: 1 sprint or 2 weeks
   - Allows catch if any legacy code depends on it
   - Safer removal with production validation

### Removal Plan

**Phase X9F-5 (or X9G-LEGACY-PATTERN-MIGRATION):**

**Step 1: Verify No Legacy Callers**
```bash
grep -r "createDecision" src --include="*.ts"
# Expected: Only new-format calls from decisions/create route
```

**Step 2: Remove Old Format**
```typescript
// REMOVE: export interface CreateDecisionInput { ... }
// CHANGE: export async function createDecision(input: VerifiedDecisionInput | CreateDecisionInput)
// TO:     export async function createDecision(input: VerifiedDecisionInput)
// REMOVE: Runtime format detection logic
```

**Step 3: Update createDecisionsBulk**
```typescript
// CHANGE: BulkCreateInput accepts union
// TO:     BulkCreateInput accepts only VerifiedDecisionInput array
```

**Step 4: Validate**
- Build must pass
- All 402 core tests must pass
- All 324 integration tests must pass
- Scanner baseline maintained

**Impact:**
- ~15 lines removed
- ~5 lines simplified
- Type safety improved
- No production code affected

---

## Debt Summary Table

| Item | Service | File | Type | Status | Safety | Removal Phase | 
|------|---------|------|------|--------|--------|----------------|
| #1 | createDecision | decision-creation-service.ts | Dual-format backward compat | ACTIVE | ✓ SAFE | X9F-5 |

---

## Tracking Notes

**Recorded:** 2026-05-16 X9F-3 selection phase  
**Last Validated:** X9F-2R audit (all production callers verified)  
**Next Validation:** After X9F-3 implementation complete  
**Removal Authorized:** Pending X9F-5 phase authorization

---

## Recommendation for X9F-3

**Accept X9F-2 dual-format as temporary debt.**

The pattern is safe for now because:
- All callers verified to use new format
- Route-level enforcement present
- Production code path is secure
- Format detection works correctly

**Do not remove during X9F-3.**

The refactoring focus should be on acceptDecision (X9F-3) and rejectDecision (X9F-4), establishing the pattern for remaining services. Once all services are refactored consistently, legacy patterns can be removed as batch in X9F-5.

---

## Impact If Not Cleaned Up

**If X9F-5 is skipped:**
- Dual-format support remains indefinitely
- Type safety continues to be compromised
- Future developers see mixed patterns (some services strict, some lenient)
- Technical debt compounds with each new service

**Mitigation:** Document clearly in CLAUDE.md that X9F-5 is required phase.

