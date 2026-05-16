# X8B-1: DECISION_CLOSE Mapping Decision

**Date:** 2026-05-16  
**Phase:** X8B-1 Phase E - Final Mapping Design Selection  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Status:** ✓ SELECTED

---

## Decision: TWO-STEP MIGRATION (Option E)

**Selected Design:** Option E - Phased approach to fix legacy and modernize

---

## Step 1: Fix Legacy (Immediate)

### What This Does
Maps DECISION_CLOSE to the roles that should have close permission NOW

### Changes Required

**File:** `src/policies/capability-check.ts`

**Action:** Add DECISION_CLOSE to ROLE_CAPABILITIES[ROLES.ADMIN_OR_PORTFOLIO_MANAGER]

```typescript
// In ROLE_CAPABILITIES:
[ROLES.SYSTEM_ADMIN]: Object.values(CAPABILITIES),  // Already gets all

[ROLES.ADMIN_OR_PORTFOLIO_MANAGER]: [
  // ... existing capabilities ...
  CAPABILITIES.DECISION_CLOSE,  // ADD THIS
],
```

### Roles Receiving DECISION_CLOSE - Step 1
- ✓ SYSTEM_ADMIN (unconditional, via Object.values())
- ✓ ADMIN_OR_PORTFOLIO_MANAGER (explicit add)
- ✗ All other roles unchanged

### Entitlement Mapping - Step 1
- NONE (close is not entitlement-gated)

### Result - Step 1
- Legacy close_decision check STILL in route (unchanged)
- But now DECISION_CLOSE capability is in roles
- Foundation laid for Step 2
- No route changes yet

### Risk - Step 1
- ✓ VERY LOW (only adds capability to role mapping, no enforcement)
- No route changes
- No behavioral changes
- No user blocking

---

## Step 2: Modernize Route (Later Phase - X9G-3 or Next)

### What This Does
Migrates close route to use modern `requireCapabilities` pattern

### Changes Required

**File:** `src/app/api/decisions/[decisionId]/close/route.ts`

**Action:** Update wrapper and remove legacy hasPermission check

```typescript
// Current (legacy):
export const POST = withEnforcementFull(
  async (request, ctx, params) => {
    const { session } = await withAuth();
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!hasPermission(membership.role, "close_decision")) {  // Legacy
      throw new Error("Insufficient permissions");
    }
    // ... rest
  }
);

// Future (modern):
export const POST = withCanonicalEnforcement(
  async (ctx) => {
    // ctx.verifiedWorkspaceId and ctx.verifiedActorId available
    // DECISION_CLOSE already verified by wrapper
    // Business logic only
  },
  { requireCapabilities: ["DECISION_CLOSE"], requireWorkspace: true }
);
```

### Roles Maintaining DECISION_CLOSE - Step 2
- Same as Step 1 (SYSTEM_ADMIN + ADMIN_OR_PORTFOLIO_MANAGER)

### Entitlement Mapping - Step 2
- NONE (no changes)

### Result - Step 2
- Modern authorization pattern
- Matches acceptDecision, rejectDecision patterns
- Cleaner code (no manual auth checks)
- Better auditability

### Risk - Step 2
- ✓ LOW (role mapping already in place from Step 1)
- But Step 2 depends on Step 1 completion

---

## Why This Design

### Addresses the Critical Issue
**Problem:** close_decision is broken in legacy hasPermission

**Solution - Step 1:** Add DECISION_CLOSE to roles (enables modern pattern)

**Solution - Step 2:** Update route to use modern pattern (replaces broken legacy)

### Least Privilege
Only 2 roles: SYSTEM_ADMIN + ADMIN_OR_PORTFOLIO_MANAGER

### Enterprise Auditability
- Clear role assignment (DECISION_CLOSE capability)
- Explicit in ROLE_CAPABILITIES
- Audit trail via capability checks

### Risk Mitigation
- Step 1 has zero risk (no enforcement, just mapping)
- Step 2 can happen independently later
- Rollback simple for both steps

### Future-Proof
- Step 1 enables route modernization (Step 2)
- Step 2 aligns with other decision operations
- Enables service refactor in future X9G-3 if desired

---

## Exact Roles Mapped to DECISION_CLOSE

| Role | Receives DECISION_CLOSE? | Rationale |
|---|---|---|
| SYSTEM_ADMIN | ✓ YES | System admin gets all capabilities |
| ADMIN_OR_PORTFOLIO_MANAGER | ✓ YES | Managers finalize decisions |
| EXPERIENCED_CONSULTANT | ✗ NO | Consultants execute, don't finalize |
| BEGINNER_CONSULTANT | ✗ NO | Too junior for finalizing |
| ANALYST | ✗ NO | Read-only role |
| CLIENT_OWNER | ✗ NO | External role, internal operation |
| CLIENT_TEAM_MEMBER | ✗ NO | External role, internal operation |
| VIEWER | ✗ NO | Read-only role |

---

## Entitlement Mapping Required

**Before Step 2 Route Enforcement:** NO

**Reason:** Closing decisions is not a quota-consumable operation. It's a lifecycle transition, not resource creation.

**Plan/Tier Impact:** NONE

---

## Route Migration Authorization

**Can Route Enforcement Safely Move to DECISION_CLOSE?**

**Before Step 1 (Now):** NO - DECISION_CLOSE not in roles yet
**After Step 1 (Step 2 ready):** YES - DECISION_CLOSE mapped to appropriate roles

**Step 2 Authorization:** APPROVED (after Step 1 complete)

---

## Service Refactor Authorization

**Can closeDecision Service Be Refactored to VerifiedClosureInput?**

**Status:** YES (optional, can happen anytime)

**Timeline:** Could be X9G-3 or later

**Dependency:** Route modernization (Step 2) is independent - service refactor is separate

---

## Tests Required

### Step 1 Tests
- Verify DECISION_CLOSE in ADMIN_OR_PORTFOLIO_MANAGER capabilities ✓
- Verify SYSTEM_ADMIN still gets all capabilities ✓
- Verify other roles unchanged ✓

### Step 2 Tests (When Implemented)
- Verify close route requires DECISION_CLOSE ✓
- Verify users with DECISION_CLOSE can close ✓
- Verify users without DECISION_CLOSE cannot close ✓
- Verify legacy behavior preserved ✓

---

## Scanner Expectation

**Before Step 1:** 448 violations

**After Step 1:** 448 violations (no code change, just capability mapping)

**After Step 2:** 448 violations (modern pattern, same violations as legacy)

**New Violations Expected:** 0

---

## Rollback Rules

### Step 1 Rollback
If Step 1 causes issues:
1. Remove DECISION_CLOSE from ADMIN_OR_PORTFOLIO_MANAGER in ROLE_CAPABILITIES
2. Revert to previous state
3. No impact on routes or services (no code changes yet)

### Step 2 Rollback
If Step 2 causes issues:
1. Revert close route to withEnforcementFull pattern
2. Re-add legacy hasPermission check
3. Keep Step 1 changes (harmless)

---

## Next Phase Name

**Phase After X8B-1:** X9G-3 (DECISION_CLOSE Role Mapping Implementation)

**Or if routing differently:** X8B-2 (Implementation Phase)

---

## Implementation Details for X9G-3/X8B-2

### Authorized Changes
✓ Add DECISION_CLOSE to ADMIN_OR_PORTFOLIO_MANAGER in ROLE_CAPABILITIES  
✓ No other files modified  
✓ No route changes (Step 1 only)  

### Forbidden Changes
✗ Route modifications (saved for Step 2)  
✗ Service refactoring (optional, later)  
✗ Entitlement changes (not needed)  
✗ Other capability changes  

### Validation After Implementation
- All existing tests pass (no behavior change)
- Build clean (no TypeScript errors)
- Scanner stable (448 violations)
- DECISION_CLOSE now in ADMIN_OR_PORTFOLIO_MANAGER capabilities

---

## Summary

**Selected Design:** TWO-STEP MIGRATION (Option E)

**Step 1:** Add DECISION_CLOSE to ADMIN_OR_PORTFOLIO_MANAGER + SYSTEM_ADMIN

**Step 2:** Update close route to use requireCapabilities (future)

**Roles Mapped:**
- ✓ SYSTEM_ADMIN
- ✓ ADMIN_OR_PORTFOLIO_MANAGER
- ✗ All others

**Entitlement Mapping Required:** NO

**Route Migration Authorized Next:** YES (after Step 1)

**Service Refactor Authorized Next:** YES (optional, independent)

**Risk Level:** LOW (phased, reversible)

**Status:** ✓ READY FOR IMPLEMENTATION (Next Phase)

---

## Sign-Off

**Design Selected:** ✓ TWO-STEP MIGRATION

**Status:** ✓ APPROVED FOR NEXT PHASE

**Next Action:** Implement Step 1 in X9G-3/X8B-2
