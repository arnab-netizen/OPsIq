# X9G-1R: Implementation Scope Options for X9G-2

**Date:** 2026-05-16  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Phase:** X9G-1R Phase C (Implementation Scope Options)

---

## Overview

X9G-1 authorized X9G-2 implementation with this scope:
> "Add DECISION_CLOSE capability check to close route + add capability constant"

**The safety analysis revealed a critical choice point:** How should the route use the capability?

This document presents implementation options and their tradeoffs.

---

## Option A: Capability Constant + Legacy Route Auth

**What It Does:**
- Adds DECISION_CLOSE to domain CAPABILITIES constant
- Route imports and references the constant in documentation
- Route keeps existing legacy auth pattern: `hasPermission(membership.role, "close_decision")`
- No behavior change to authorization logic

**Code Implementation:**

```typescript
// src/domain/constants/capabilities.ts
export const CAPABILITIES = {
  // ... existing ...
  DECISION_CLOSE: "decision:close",  // NEW
};

// src/app/api/decisions/[decisionId]/close/route.ts
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    // ... existing code ...
    
    // Still using legacy auth pattern (no change)
    if (!hasPermission(membership.role, "close_decision")) {
      throw new Error("Insufficient permissions to close decision");
    }
    
    // But now governance constant is available
    // Comment: Governed by CAPABILITIES.DECISION_CLOSE in domain model
    
    // ... rest of handler ...
  }
);
```

**Files Modified:**
- `src/domain/constants/capabilities.ts` (1 line added)
- `src/app/api/decisions/[decisionId]/close/route.ts` (1 import, 1 comment, optional refactoring of permission string)

**Behavioral Change:**
- ✓ None (same auth logic, same outcome)

**Authorization Guarantee:**
- ✓ All existing users with close_decision permission still work
- ✓ New users without permission still blocked
- ✓ No users accidentally blocked

**Governance State:**
- ✓ DECISION_CLOSE capability constant defined (governance model updated)
- ✗ Role mapping not in ROLE_CAPABILITIES yet (deferred)
- ✗ Route not using modern `withCanonicalEnforcement` pattern (legacy)
- ✗ No plan-based entitlement checks (quota enforcement deferred)

**Risk Assessment:** ✓ LOW

**Advantages:**
1. ✓ Zero behavioral change risk
2. ✓ No existing users blocked
3. ✓ Governance constant ready for documentation and future use
4. ✓ Clear deferred path to modernization
5. ✓ Can be done immediately
6. ✓ Minimal scope (adds 1 constant)
7. ✓ Tests pass without modification

**Disadvantages:**
1. ✗ Route still on legacy auth pattern
2. ✗ Not fully modernized architecture
3. ✗ Two-step refactoring ahead (now: constant, later: pattern migration)
4. ✗ Legacy string "close_decision" still in code (duplication with capability constant)

**Timeline:** ~15 minutes

**Test Impact:** None (all tests pass unchanged)

---

## Option B: Capability Constant + Modern Route with Role Mapping

**What It Does:**
- Adds DECISION_CLOSE to domain CAPABILITIES constant
- Updates route to use `withCanonicalEnforcement` with `requireCapabilities: ["DECISION_CLOSE"]`
- Adds DECISION_CLOSE to role capability mappings so users can actually access it
- Governance complete in one phase

**Code Implementation:**

```typescript
// src/domain/constants/capabilities.ts
export const CAPABILITIES = {
  // ... existing ...
  DECISION_CLOSE: "decision:close",  // NEW
};

// src/policies/capability-check.ts - Update ROLE_CAPABILITIES
const ROLE_CAPABILITIES: Record<RoleName, readonly CapabilityName[]> = {
  [ROLES.SYSTEM_ADMIN]: Object.values(CAPABILITIES),
  
  [ROLES.ADMIN_OR_PORTFOLIO_MANAGER]: [
    // ... existing capabilities ...
    CAPABILITIES.DECISION_CLOSE,  // NEW - close is an admin operation
  ],
  
  [ROLES.EXPERIENCED_CONSULTANT]: [
    // ... existing capabilities ...
    // DECISION_CLOSE NOT included (consultants can't close)
  ],
  
  // Other roles unchanged
};

// src/app/api/decisions/[decisionId]/close/route.ts - Migrate to modern pattern
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const decisionId = params.decisionId;
    const workspaceId = ctx.verifiedWorkspaceId;
    const userId = ctx.verifiedActorId;
    
    // Fetch decision
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });
    
    if (!decision) {
      throw new Error("Decision not found in this workspace");
    }
    
    // Close via service (receives pre-verified auth context)
    const updated = await closeDecision(decisionId, workspaceId, userId);
    
    logger.info("Decision closed via API", {
      decisionId,
      workspaceId,
      userId,
    });
    
    return {
      decisionId,
      status: updated.status,
      message: "Decision closed successfully",
    };
  },
  { 
    requireCapabilities: ["DECISION_CLOSE"],  // NEW - now using modern pattern
    requireWorkspace: true 
  }
);
```

**Files Modified:**
- `src/domain/constants/capabilities.ts` (1 line added)
- `src/app/api/decisions/[decisionId]/close/route.ts` (major refactor: switch wrapper, change auth pattern)
- `src/policies/capability-check.ts` (add DECISION_CLOSE to one or more roles)

**Behavioral Change:**
- ✓ Authorization still works (legacy + modern both authorize same users)
- ✓ Route pattern modernized
- ✓ Code cleaner (no need for withAuth, enforceWorkspaceScoping, hasPermission checks)

**Authorization Guarantee:**
- ✓ Users with ADMIN_OR_PORTFOLIO_MANAGER role can close
- ✓ Users with other roles cannot close (unless added to their capability list)
- ✓ Matches governance design intent

**Governance State:**
- ✓ DECISION_CLOSE capability constant defined
- ✓ Role mapping in ROLE_CAPABILITIES (governance complete)
- ✓ Route using modern `withCanonicalEnforcement` pattern
- ✗ No plan-based entitlement checks (quota enforcement deferred, but not needed for close)

**Risk Assessment:** ✓ MEDIUM

**Advantages:**
1. ✓ Governance fully complete in one phase (constant + role mapping + route)
2. ✓ Modern auth pattern (canonical enforcement)
3. ✓ Clean code (no manual session/workspace/permission checks)
4. ✓ Authorization matrix clear (role → capability → who can close)
5. ✓ Audit trail clear (DECISION_CLOSE capability recorded)
6. ✓ Future-proof (workspace role design can build on this)
7. ✓ Tests show clear permission boundaries

**Disadvantages:**
1. ✗ Scope creep (includes role mapping, which X9G-1 said to defer)
2. ✗ Tighter coupling to current role design (if roles change, need to update again)
3. ✗ Makes assumption about who should have close permission (admin only?)
4. ✗ Larger refactoring surface (whole route changes wrapper)
5. ✗ Higher risk if role assumptions wrong
6. ✗ Deviates from X9G-1 "defer entitlement mapping" decision

**Timeline:** ~45 minutes

**Test Impact:** May need test role setup to verify non-admin users see 403

---

## Option C: Minimal Capability (No Route Changes)

**What It Does:**
- Adds DECISION_CLOSE to domain CAPABILITIES constant ONLY
- Route completely unchanged
- No imports, no new capability checks
- Governance constant exists but not actively used

**Code Implementation:**

```typescript
// src/domain/constants/capabilities.ts
export const CAPABILITIES = {
  // ... existing ...
  DECISION_CLOSE: "decision:close",  // NEW - defined but not yet used in routes
};

// src/app/api/decisions/[decisionId]/close/route.ts - NO CHANGES
// (file remains exactly as-is)
```

**Files Modified:**
- `src/domain/constants/capabilities.ts` (1 line added)

**Behavioral Change:**
- ✓ None

**Authorization Guarantee:**
- ✓ All existing behavior unchanged
- ✓ All existing users work exactly as before

**Governance State:**
- ✓ DECISION_CLOSE capability constant defined
- ✗ Not actively used in routes
- ✗ Role mapping not done
- ✗ Route still legacy pattern
- ✗ Future migration path unclear

**Risk Assessment:** ✓ VERY LOW

**Advantages:**
1. ✓ Minimal change (1 line)
2. ✓ Zero risk
3. ✓ Governance constant ready for documentation
4. ✓ No test impact
5. ✓ Can be done in 2 minutes
6. ✓ Defers ALL decisions to future phases

**Disadvantages:**
1. ✗ Route still unchanged (doesn't use new capability)
2. ✗ Constant defined but inactive (confusing for future developers)
3. ✗ Doesn't fulfill "implement route governance" part of X9G-2
4. ✗ Feels incomplete (says X9G-2 done but route still legacy)

**Timeline:** ~5 minutes

**Test Impact:** None

---

## Option D: Defer X9G-2 Entirely

**What It Does:**
- Don't implement X9G-2 yet
- Wait for workspace role design phase
- When role design complete, implement route + capability + role mapping together

**Code Implementation:**
- No changes

**Files Modified:**
- None

**Behavioral Change:**
- ✓ None

**Authorization Guarantee:**
- ✓ All existing behavior unchanged

**Governance State:**
- ✗ DECISION_CLOSE capability not yet defined
- ✗ Role mapping not done
- ✗ Route still legacy pattern

**Risk Assessment:** ✓ VERY LOW

**Advantages:**
1. ✓ No implementation risk
2. ✓ Wait for complete picture (role design + close governance together)
3. ✓ Avoid scope creep
4. ✓ Simpler when finally done (everything ready)

**Disadvantages:**
1. ✗ Blocks architectural progress
2. ✗ Close route stays on legacy pattern indefinitely
3. ✗ Governance design done but not acted on
4. ✗ Defers rather than solves

**Timeline:** N/A

**Test Impact:** None

---

## Comparison Matrix

| Factor | Option A | Option B | Option C | Option D |
|---|---|---|---|---|
| **Governance Constant Added** | ✓ | ✓ | ✓ | ✗ |
| **Role Mapping Done** | ✗ | ✓ | ✗ | ✗ |
| **Route Modernized** | ✗ | ✓ | ✗ | ✗ |
| **Users Still Work** | ✓ | ✓ | ✓ | ✓ |
| **Authorization Risk** | ✓ LOW | ✓ MED | ✓ V.LOW | ✓ V.LOW |
| **Implementation Risk** | ✓ LOW | ✓ MEDIUM | ✓ V.LOW | ✓ N/A |
| **Scope Alignment with X9G-1** | ✓ | ✗ | ✓ | ✓ |
| **Tests Pass** | ✓ | ✓ | ✓ | ✓ |
| **Timeline** | 15 min | 45 min | 5 min | N/A |
| **Code Quality** | Medium | High | Low | Defer |
| **Completeness** | Partial | Complete | Minimal | None |

---

## Which Option Aligns with X9G-1?

**X9G-1 Statement:**
> "X9G-2: Route governance update (add capability check). X9G-3 (Optional): Service refactor to verified input pattern. Entitlement Mapping: Deferred to workspace design phase."

**Interpretation:**
- "Route governance update" = add capability check to route
- "Entitlement mapping deferred" = don't do role mapping in X9G-2

**Which option matches this?**
- **Option A:** Partial match (adds constant, but NOT capability check in route)
- **Option B:** Doesn't match (includes role mapping, violating deferral)
- **Option C:** Doesn't match (no capability check in route)
- **Option D:** Defers everything (including route check)

**Issue:** X9G-1 said "add capability check" but safety analysis says "can't add check without role mapping."

**Resolution Needed:** Clarify X9G-1 intent

---

## Recommendation Matrix

| Context | Recommended | Reason |
|---|---|---|
| **Prioritize: Safety** | Option A | Zero risk, users not blocked |
| **Prioritize: Governance Completeness** | Option B | Full modernization in one go |
| **Prioritize: Minimal Change** | Option C | Least code touched |
| **Prioritize: Deferred Decisions** | Option D | Wait for role design |
| **X9G-1 Original Intent** | UNCLEAR | Safety analysis conflicts with original scope |

---

## Next Decision Point

**Three possible interpretations of X9G-1:**

### Interpretation 1: "Capability + Route Check" (was original intent)
- X9G-2 should add DECISION_CLOSE check to route
- But this blocks users unless role mapping done
- **Recommendation:** Use **Option B** (complete governance)

### Interpretation 2: "Governance Design Only" (safety interpretation)
- X9G-2 should just define capability constant
- Route changes can wait (don't implement check yet)
- **Recommendation:** Use **Option A** (capability + legacy auth)

### Interpretation 3: "Minimal Viable" (conservative interpretation)
- X9G-2 should define constant and that's it
- Route modernization deferred entirely
- **Recommendation:** Use **Option C** (constant only)

---

## Validation Implications

### Option A (Capability + Legacy Auth)
**Before Implementation:**
- Build: Should pass (adding constant)
- Tests: Should pass (no behavior change)

**After Implementation:**
- Build: ✓ PASS (0 TypeScript errors)
- Governance test: ✓ PASS (DECISION_CLOSE constant exists)
- Integration tests: ✓ PASS (no behavior change)
- Scanner: ✓ STABLE (448, no change)

---

### Option B (Capability + Modern Route + Role Mapping)
**Before Implementation:**
- Build: Should pass
- Tests: May fail if tests check non-admin roles

**After Implementation:**
- Build: ✓ PASS (0 TypeScript errors)
- Governance test: ✓ PASS (DECISION_CLOSE constant + roles)
- Integration tests: ✓ PASS (if test roles updated)
- Scanner: ✓ STABLE (448, modern pattern similar to accept/reject)
- New consideration: Test coverage for 403 responses (non-admin users)

---

### Option C (Constant Only)
**Validation:**
- Build: ✓ PASS
- Tests: ✓ PASS (unchanged)
- Scanner: ✓ STABLE

**But:** Constant exists but is unused (code smell, developer confusion)

---

## Blocking Conditions

### Don't Use Option A If:
✗ X9G-1 explicitly intended route capability check to be implemented in X9G-2  
✗ Legacy auth pattern is marked for immediate removal  

### Don't Use Option B If:
✗ X9G-1 explicitly said "defer entitlement mapping"  
✗ Role design not ready yet  
✗ Scope creep is unacceptable  

### Don't Use Option C If:
✗ Capability constant should be actively used by routes  
✗ "Unused constant in codebase" is a quality issue  

### Don't Use Option D If:
✗ X9G-1 intended X9G-2 to make progress (not defer)  
✗ Close route modernization is high priority  

---

## Conclusion

**X9G-1R Phase C: Implementation Options**

Four options exist. Each has different risk/scope/completeness tradeoffs.

**The core issue:** X9G-1 design (defer entitlements) conflicts with common implementation approach (add route check + enforce).

**Resolution:** Explicit decision needed on which option matches original X9G-1 intent.

---

## Sign-Off

**Phase C Complete:** Implementation scope options documented and evaluated.

**Decision Needed:** Which option should X9G-2 implement?

**Next Phase:** X9G-1R Phase D (Final Scope Decision) will select the option.
