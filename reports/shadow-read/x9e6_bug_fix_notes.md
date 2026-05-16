# X9E-6: Bug Fix Implementation Notes

**Date:** 2026-05-16  
**Status:** BUG FIX IMPLEMENTED  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Implementation Summary

### File Changed
- `src/app/api/decisions/[decisionId]/reject/route.ts`

### Change Made

**Location:** Line 39

**Before:**
```typescript
  { requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }
);
```

**After:**
```typescript
  { requireCapabilities: ["DECISION_REJECT"], requireWorkspace: true }
);
```

**Type:** Authorization capability parameter correction

**Scope:** Single line change in capability requirement

---

## Change Details

### What Changed
- Reject route now requires `DECISION_REJECT` capability instead of `DECISION_ACCEPT`

### What Did NOT Change
- ✓ Route handler signature unchanged
- ✓ Service calls unchanged (rejectDecision still called)
- ✓ Response shape unchanged
- ✓ Business logic unchanged
- ✓ Error handling unchanged
- ✓ Audit event unchanged (DECISION_REJECTED still emitted)
- ✓ Wrapper pattern unchanged (withCanonicalEnforcement)
- ✓ Accept route unchanged (still uses DECISION_ACCEPT)
- ✓ Close route unchanged
- ✓ Services unchanged
- ✓ CAPABILITIES constants unchanged

---

## Authorization Behavior Change

### Before Fix
**Issue:** Reject route required DECISION_ACCEPT permission
- Anyone with accept permission could also reject
- Violates least privilege principle
- Different from test expectations

### After Fix
**Correct Behavior:** Reject route requires DECISION_REJECT permission
- Accept and reject are now separate permissions
- Least privilege principle restored
- Matches test expectations (complementary capabilities)
- Aligns with business semantics

---

## Verification Points

| Check | Status | Reason |
|-------|--------|--------|
| Route handler untouched | ✓ | No logic changes |
| Service calls unchanged | ✓ | rejectDecision still called identically |
| Response shape unchanged | ✓ | Response building code unchanged |
| Accept route untouched | ✓ | No changes to accept route |
| Close route untouched | ✓ | No changes to close route |
| Services untouched | ✓ | No service modifications |
| Wrapper pattern unchanged | ✓ | Still using withCanonicalEnforcement |
| Import unchanged | ✓ | CAPABILITIES already imported |
| Audit event unchanged | ✓ | Still emits DECISION_REJECTED |

---

## Business Impact

**Authorization Change:**
- ✓ Reject now requires explicit DECISION_REJECT permission
- ✓ Separates accept and reject permissions

**Functional Impact:**
- ✗ ZERO - Business logic unchanged
- ✗ Response shape unchanged
- ✗ Error handling unchanged
- ✗ Service behavior unchanged

**Behavioral Impact:**
- ✗ ZERO for authorized users with DECISION_REJECT
- ✓ More restrictive for users with only DECISION_ACCEPT (will now get 403 on reject instead of succeeding)
- This is the intended security fix

---

## Risk Assessment

**Risk Level:** LOW

**Reason:**
- Single parameter change
- Correct capability already defined
- Tests expect this behavior
- No breaking changes to handler
- Service behavior unchanged
- Response format unchanged

**Potential Issues:** NONE expected

---

## Type Safety

- ✓ DECISION_REJECT is properly exported from CAPABILITIES
- ✓ Type matches requireCapabilities string array expectation
- ✓ No TypeScript errors introduced

---

## Audit Trail

**Change:** Authorization capability correction  
**Severity:** Bug fix (HIGH business impact, LOW technical risk)  
**Category:** Security/Authorization  
**Impact:** Enforces correct permission separation  

---

## Post-Implementation Status

**Files Modified:** 1 (reject/route.ts)  
**Files Created:** 0  
**Files Deleted:** 0  
**Services Modified:** 0  
**Tests Modified:** TBD (Phase C)  
**Scanner Changes:** 0  

**Ready for:** Phase C - Test verification
