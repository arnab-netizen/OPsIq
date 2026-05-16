# X9G-2: Close Route Notes

**Date:** 2026-05-16  
**Phase:** X9G-2 Phase C - Close Route Non-Enforcing Reference Check  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Close Route Current State

**File:** `src/app/api/decisions/[decisionId]/close/route.ts`

### Current Authorization Pattern
```typescript
export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    const { session } = await withAuth();
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    
    // Legacy role-based check (line 42)
    if (!hasPermission(membership.role, "close_decision")) {
      throw new Error("Insufficient permissions to close decision");
    }
    
    // ... service call and response
  }
);
```

### Characteristics
- Wrapper: `withEnforcementFull` (legacy, not canonical)
- Auth: `withAuth()` + `enforceWorkspaceScoping()` (manual steps)
- Permission: `hasPermission(role, "close_decision")` (legacy string-based)
- Response: Standard format (no shape change)

---

## Non-Enforcing Reference Analysis

### Option 1: Add Import Statement
```typescript
import { CAPABILITIES } from "@/domain/constants/capabilities";
```

**Assessment:** ✗ NOT ALLOWED  
**Reason:** Adding import changes the import list, which alters the file structure. Could introduce accidental reference or future confusion.  
**Risk:** Minimal, but unnecessary.  
**Impact:** Zero runtime change, but adds unnecessary dependency.

---

### Option 2: Add Governance Comment
```typescript
// Governed by CAPABILITIES.DECISION_CLOSE (legacy auth pattern)
if (!hasPermission(membership.role, "close_decision")) {
  throw new Error("Insufficient permissions to close decision");
}
```

**Assessment:** ⚠️ OPTIONAL, MINIMAL VALUE  
**Reason:** Comment doesn't change behavior or enforcement. Purely documentation.  
**Benefit:** Shows connection between legacy string and governance constant.  
**Cost:** Adds one comment line.  
**Risk:** Zero runtime risk.

---

### Option 3: No Modification
Leave close route completely unchanged.

**Assessment:** ✓ SAFEST  
**Reason:** Route continues working unchanged. Constant is defined in domain. Future phases can reference as needed.  
**Benefit:** Zero risk, minimal scope.  
**Impact:** No behavioral change.

---

## Decision for X9G-2

**Selected Approach:** Option 3 - No Modification

**Rationale:**
1. ✓ DECISION_CLOSE is now defined in domain (governance satisfied)
2. ✓ Close route remains unchanged (legacy auth preserved)
3. ✓ No new dependencies introduced
4. ✓ No confusion or accidental coupling
5. ✓ Comment would be nice-to-have but not necessary
6. ✓ Constant is available when role design is ready
7. ✓ Clean separation: governance (constant) vs. implementation (route)

**Result:** Close route will NOT be modified in X9G-2

---

## Why Not Add Comment?

While a governance comment would be informative, X9G-2 scope is explicitly:
- Add constant (done)
- Do not enforce it (confirmed)
- Keep route unchanged (following this principle)

Adding a comment would technically change the file, even though it's non-enforcing. Better to keep scope minimal: constant only.

---

## Verification

### Will Route Still Work?
✓ YES - Route is completely unchanged

### Will Users Be Affected?
✗ NO - Authorization unchanged

### Will Future Phases Have Access to Constant?
✓ YES - DECISION_CLOSE is now in domain CAPABILITIES

### Can Future Phases Reference It?
✓ YES - Constant available for role mapping and route modernization

---

## Summary

**Close Route Modification:** ✗ NONE

**Reason:** Non-enforcing reference not necessary. Constant is defined and available. Route best left unchanged for minimal scope.

**Result:** ✓ DECISION_CLOSE constant successfully introduced. Close route continues working unchanged. Future phases can reference constant when ready.

---

## Next Phase
Phase D: Test updates (if required)
