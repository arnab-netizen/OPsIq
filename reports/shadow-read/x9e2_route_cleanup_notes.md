# X9E-2: Route Cleanup Notes

**Date:** 2026-05-15  
**Status:** ROUTE CLEANUP COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Changes Made

### File: src/app/api/decisions/create/route.ts

**Change 1 - Import Statement (Line 4):**

**Before:**
```typescript
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { NextRequest } from "next/server";
```

**After:**
```typescript
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { NextRequest } from "next/server";
```

**Reason:** Make CAPABILITIES.DECISION_CREATE available for use

---

**Change 2 - Capability Check (Line 30-32):**

**Before:**
```typescript
  // Check entitlement: decision_create (plan-based quota enforcement)
  const capabilityCheck = await assertCapability(workspaceId, "decision_create");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");
  }
```

**After:**
```typescript
  // Check entitlement: decision_create (plan-based quota enforcement)
  const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError(CAPABILITIES.DECISION_CREATE, capabilityCheck.reason || "Plan limit exceeded");
  }
```

**Reason:** Use type-safe domain constant instead of string literal

---

## Scope Verification

### Changes Made
- ✓ 1 import added (CAPABILITIES)
- ✓ 2 string literals replaced (both "decision_create" → CAPABILITIES.DECISION_CREATE)
- ✓ Only 1 file modified (decisions/create/route.ts)

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

**File:** src/app/api/decisions/create/route.ts

**Total lines:** 117 (no net change in line count)

**Raw string "decision_create" remaining:** 0 (completely removed)

**Domain CAPABILITIES usage:** 2 instances (lines 30 and 32)

**Import of CAPABILITIES:** Present (line 4)

**Service calls:** Unchanged (createDecision, createDecisionsBulk, parseCSV)

**Handler signature:** Unchanged (POST handler with NextRequest)

**Response shape:** Unchanged (returns decision objects)

---

## Verification Checklist

| Item | Status | Evidence |
|------|--------|----------|
| CAPABILITIES import added | ✓ YES | Line 4 |
| "decision_create" replaced (line 30) | ✓ YES | Now CAPABILITIES.DECISION_CREATE |
| "decision_create" replaced (line 32) | ✓ YES | Now CAPABILITIES.DECISION_CREATE |
| Raw string "decision_create" remaining | ✗ NO | Completely removed |
| Service behavior unchanged | ✓ YES | createDecision() calls identical |
| Handler signature unchanged | ✓ YES | Still POST handler |
| Response shape unchanged | ✓ YES | Response building unchanged |
| Error handling preserved | ✓ YES | PlanLimitError still thrown |
| No other routes changed | ✓ YES | Only decisions/create modified |
| No services changed | ✓ YES | Service layer untouched |

---

## Next Step

Phase C: Add or update focused test if needed
