# X9G-4: Pre-Implementation Confirmation

**Date:** 2026-05-16  
**Phase:** X9G-4 (Step 2 - Close Route Modernization)  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Pre-Implementation State Confirmation

### 1. Close Route Current Implementation

**File:** `src/app/api/decisions/[decisionId]/close/route.ts`

**Current Pattern:** Legacy (withEnforcementFull + hasPermission)

**Current Authorization Check:**
```typescript
if (!hasPermission(membership.role, "close_decision")) {
  throw new Error("Insufficient permissions to close decision");
}
```

**Status:** ✓ CONFIRMED - Broken legacy check (hasPermission returns FALSE for all roles)

---

### 2. DECISION_CLOSE Capability Definition

**File:** `src/domain/constants/capabilities.ts`  
**Line:** 105  
**Definition:** `DECISION_CLOSE: "decision:close"`

**Status:** ✓ CONFIRMED - Capability defined and available

---

### 3. DECISION_CLOSE Role Mapping

**File:** `src/policies/capability-check.ts`  
**Line:** 42  
**Mapping:** `CAPABILITIES.DECISION_CLOSE` added to `ADMIN_OR_PORTFOLIO_MANAGER`

**Roles with DECISION_CLOSE:**
- SYSTEM_ADMIN (via Object.values(CAPABILITIES))
- ADMIN_OR_PORTFOLIO_MANAGER (explicit mapping)

**Status:** ✓ CONFIRMED - Role mapping complete and verified in X9G-3

---

### 4. Entitlement Mapping Status

**File:** `src/services/entitlement.ts`

**DECISION_CLOSE in entitlements:** NO (correctly not entitlement-gated)

**Status:** ✓ CONFIRMED - No entitlement changes needed/authorized

---

### 5. Modern Route Pattern Reference

**File:** `src/app/api/decisions/[decisionId]/accept/route.ts`

**Modern Pattern:**
```typescript
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const POST = withCanonicalEnforcement(
  async (ctx, params) => {
    // ctx.verifiedWorkspaceId
    // ctx.verifiedActorId
    // Business logic here
  },
  { requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }
);
```

**Status:** ✓ CONFIRMED - Pattern available and established

---

### 6. closeDecision Service Signature

**File:** `src/services/decisions/decision-lifecycle.service.ts`  
**Line:** 394

**Signature:**
```typescript
export async function closeDecision(
  decisionId: string,
  workspaceId: string,
  actorId: string
): Promise<{ id: string; status: string }>
```

**Status:** ✓ CONFIRMED - Service unchanged, ready for use

---

## Pre-Implementation Validation

### Authorization Chain
- ✓ DECISION_CLOSE exists in domain constants
- ✓ DECISION_CLOSE mapped to correct roles (ADMIN_OR_PORTFOLIO_MANAGER)
- ✓ withCanonicalEnforcement supports requireCapabilities
- ✓ Modern pattern established by accept/reject routes

### Safety Preconditions
- ✓ No entitlement changes planned
- ✓ No service refactor planned
- ✓ No role mapping changes in Step 2
- ✓ No wrapper or auth context changes
- ✓ Response shape preserved

### Readiness
- ✓ All preconditions met
- ✓ Pattern established
- ✓ Capabilities mapped
- ✓ Service ready
- ✓ Safe to proceed

---

## Summary

All pre-implementation requirements confirmed. Close route modernization can safely proceed with:
- Replace withEnforcementFull with withCanonicalEnforcement
- Remove legacy hasPermission check
- Add DECISION_CLOSE capability enforcement
- Preserve all business logic and response shapes
- No service changes required

**Status: READY TO IMPLEMENT ✓**
