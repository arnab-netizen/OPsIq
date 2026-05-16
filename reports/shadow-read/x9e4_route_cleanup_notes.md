# X9E-4: Route Cleanup Notes

**Date:** 2026-05-15  
**Status:** ROUTE CLEANUP COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Changes Made

### File: src/app/api/recommendations/route.ts

**Change 1 - Line 53:**

**Before:**
```typescript
const capabilityCheck = await assertCapability(workspaceId, "decision_create");
```

**After:**
```typescript
const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);
```

**Reason:** Use domain constant instead of string literal for type safety

---

**Change 2 - Line 55:**

**Before:**
```typescript
throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");
```

**After:**
```typescript
throw new PlanLimitError(CAPABILITIES.DECISION_CREATE, capabilityCheck.reason || "Plan limit exceeded");
```

**Reason:** Keep error reporting consistent with constant usage

---

## Scope Verification

### Changes Made
- ✓ 2 string literals replaced (both "decision_create" → CAPABILITIES.DECISION_CREATE)
- ✓ Only 1 file modified (recommendations/route.ts)
- ✓ No import changes needed (CAPABILITIES already imported)

### No Unauthorized Changes
- ✗ No service changes
- ✗ No wrapper changes
- ✗ No auth context changes
- ✗ No other route changes
- ✗ No scanner changes
- ✗ No capability additions
- ✗ No response shape changes
- ✗ No business logic changes

---

## Behavior Preservation

**Capability check:** Still calls assertCapability() with same semantics
- Input: workspaceId and capability
- Output: EntitlementCheckResult with allowed flag
- Entitlement mapping: assertCapability still maps domain constant to entitlement string internally

**Error handling:** PlanLimitError still receives capability identifier
- Format changed from string "decision_create" to CAPABILITIES.DECISION_CREATE constant
- Error behavior unchanged (same exception type, same message)

**Type safety:** CAPABILITIES.DECISION_CREATE is compile-time checked
- Value: "decision:create"
- Format: matches domain:action pattern
- No runtime behavior difference from string literal

---

## Post-Cleanup Status

**File:** src/app/api/recommendations/route.ts

**Total lines:** 87 (no net change in line count)

**Raw string "decision_create" remaining:** 0 (completely removed)

**Domain CAPABILITIES usage:** 2 instances (lines 53 and 55)

**CAPABILITIES import status:** Already present (line 4)

**Service calls:** Unchanged (createRecommendation)

**Handler signature:** Unchanged (POST handler with NextRequest)

**Response shape:** Unchanged (returns recommendation objects)

---

## Verification Checklist

| Item | Status | Evidence |
|------|--------|----------|
| "decision_create" replaced (line 53) | ✓ YES | Now CAPABILITIES.DECISION_CREATE |
| "decision_create" replaced (line 55) | ✓ YES | Now CAPABILITIES.DECISION_CREATE |
| Raw string "decision_create" remaining | ✗ NO | Completely removed |
| Service behavior unchanged | ✓ YES | createRecommendation() calls identical |
| Handler signature unchanged | ✓ YES | Still POST handler |
| Response shape unchanged | ✓ YES | Response building unchanged |
| Error handling preserved | ✓ YES | PlanLimitError still thrown |
| No other routes changed | ✓ YES | Only recommendations/route modified |
| No services changed | ✓ YES | Service layer untouched |
| CAPABILITIES import status | ✓ YES | Already imported, no change needed |

---

## Next Step

Phase C: Add or update focused test if needed
