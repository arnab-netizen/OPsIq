# X9G-2: Pre-Implementation Confirmation

**Date:** 2026-05-16  
**Phase:** X9G-2 Phase A - Pre-Implementation Confirmation  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Scope:** Add DECISION_CLOSE constant only (no route enforcement)

---

## Pre-Implementation Inspection

### Current State Verification

#### 1. DECISION_CLOSE Capability Status
**File:** `src/domain/constants/capabilities.ts`  
**Current State:** ✓ DECISION_CLOSE does NOT exist  
**Lines 100-105 (Decision capabilities section):**
```typescript
// Decisions
DECISION_CREATE: "decision:create",
DECISION_UPDATE: "decision:update",
DECISION_ACCEPT: "decision:accept",
DECISION_REJECT: "decision:reject",
// DECISION_CLOSE not present (correct)
```

**Finding:** ✓ Safe to add DECISION_CLOSE

---

#### 2. Close Route Current Authorization
**File:** `src/app/api/decisions/[decisionId]/close/route.ts`  
**Current Pattern:** Legacy role-based (withEnforcementFull + hasPermission)

**Lines 19-44 (Authorization section):**
```typescript
export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    const { session } = await withAuth();  // Legacy pattern
    const membership = await enforceWorkspaceScoping(request, workspaceId);  // Legacy pattern
    
    // Check permission to close decisions
    if (!hasPermission(membership.role, "close_decision")) {  // Legacy role check
      throw new Error("Insufficient permissions to close decision");
    }
    // ... rest of handler
  }
);
```

**Current Authorization Method:** `hasPermission(membership.role, "close_decision")`  
**Wrapper Pattern:** `withEnforcementFull` (legacy, NOT `withCanonicalEnforcement`)  
**Capability Enforcement:** None (legacy string-based permission)

**Finding:** ✓ No requireCapabilities pattern present. Safe to leave unchanged.

---

### X9G-2 Scope Verification

#### What X9G-2 Will Do
✓ Add `DECISION_CLOSE: "decision:close"` to CAPABILITIES constant  
✓ Optionally reference in close route (if non-enforcing)  

#### What X9G-2 Will NOT Do
✗ Add `requireCapabilities: ["DECISION_CLOSE"]` to route  
✗ Change `hasPermission(membership.role, "close_decision")` check  
✗ Add any entitlement/plan mappings  
✗ Refactor to `withCanonicalEnforcement` pattern  
✗ Modify service or response shapes  
✗ Change scanner or wrappers  

**Finding:** ✓ Scope is clear and safe

---

## Authorization Behavior Verification

### Current Close Route Authorization Flow
1. User calls POST /api/decisions/[decisionId]/close
2. Route calls `await withAuth()` → gets session
3. Route calls `await enforceWorkspaceScoping()` → gets membership + role
4. Route checks: `hasPermission(membership.role, "close_decision")`
5. If permission found → continue to service
6. If permission not found → throw error (403)
7. Service executes state transition (OUTCOME_RECORDED → CLOSED)

### After X9G-2 (With DECISION_CLOSE constant added)
1. User calls POST /api/decisions/[decisionId]/close
2. Route calls `await withAuth()` → gets session (UNCHANGED)
3. Route calls `await enforceWorkspaceScoping()` → gets membership + role (UNCHANGED)
4. Route checks: `hasPermission(membership.role, "close_decision")` (UNCHANGED)
5. If permission found → continue to service (UNCHANGED)
6. If permission not found → throw error (UNCHANGED)
7. Service executes state transition (UNCHANGED)

**Finding:** ✓ Authorization behavior will be IDENTICAL before and after

---

## Expected Runtime Impact

### No Changes Expected
- ✓ All users with "close_decision" permission: Still authorized
- ✓ All users without permission: Still denied
- ✓ Response shape: Unchanged
- ✓ Status codes: Unchanged
- ✓ Error messages: Unchanged
- ✓ Service logic: Unchanged
- ✓ Database operations: Unchanged

### Governance Model Changes Only
- ✓ DECISION_CLOSE constant now defined in domain model
- ✓ Enables future role mapping (X9G-3 or later phase)
- ✓ Enables future route modernization (after workspace role design)
- ✓ No immediate behavioral change

**Finding:** ✓ This is a governance-only change (constant addition)

---

## Scanner Baseline Impact

### Current Baseline
**Total Violations:** 448  
**Critical:** 283  
**Block-Build:** 165  

### Expected After X9G-2
**Changes to Close Route:** None (legacy auth pattern unchanged)  
**Changes to CAPABILITIES constant:** Only adding one line (constant definition)  
**Expected Scanner Result:** 448 (NO CHANGE)

**Rationale:** Adding a constant to an object doesn't create shadow reads. Legacy auth pattern remains unchanged.

**Finding:** ✓ No new violations expected

---

## Confirmation Checklist

| Item | Status | Verification |
|---|---|---|
| DECISION_CLOSE already exists? | ✗ NO | ✓ Confirmed not in capabilities.ts |
| Close route uses legacy role check? | ✓ YES | ✓ Confirmed hasPermission(membership.role, "close_decision") |
| Close route uses requireCapabilities? | ✗ NO | ✓ Confirmed no requireCapabilities present |
| Entitlement mapping deferred? | ✓ YES | ✓ Per X9G-1R decision |
| Runtime behavior will change? | ✗ NO | ✓ Authorization flow identical |
| Authorization behavior will change? | ✗ NO | ✓ Same users authorized as before |
| Service logic will change? | ✗ NO | ✓ closeDecision unchanged |
| Scanner violations expected? | ✗ NO | ✓ Legacy pattern unchanged |

**Result:** ✓ ALL CHECKS PASSED - SAFE TO PROCEED

---

## Pre-Implementation Summary

**DECISION_CLOSE Readiness:** ✓ READY TO ADD

**Close Route Readiness:** ✓ READY TO REFERENCE (non-enforcing only)

**Expected Outcome:**
- Constant added: ✓
- Route behavior unchanged: ✓
- Authorization unchanged: ✓
- Scanner stable: ✓
- No breaking changes: ✓

**Risk Assessment:** ✓ VERY LOW (adding constant only)

**Authorization to Proceed:** ✓ APPROVED

---

## Next Steps

### Phase B (Next)
Add DECISION_CLOSE constant to capabilities.ts

### Phase C (After B)
Check if close route should reference constant (non-enforcing)

### Phase D (After C)
Update governance test if needed

### Phase E (After D)
Run full validation suite

---

## Sign-Off

**Pre-Implementation Inspection:** ✓ COMPLETE

**Status:** Ready for Phase B (constant addition)
