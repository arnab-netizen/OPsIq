# X9G-1R: DECISION_CLOSE Entitlement Safety Analysis

**Date:** 2026-05-16  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Phase:** X9G-1R (Review and Audit of X9G-1 Scope Decision)

---

## Executive Summary

**CRITICAL FINDING:** Adding DECISION_CLOSE domain capability to X9G-2 without coordinated role/entitlement updates would **BLOCK ALL USERS** from closing decisions, including existing users with close permissions.

**Root Cause:** X9G-1 added capability constant but assumed "capability constant = users have access". This is incorrect.

**Safety Assessment:** ⚠️ X9G-2 is **NOT SAFE** to implement as currently designed unless implementation plan explicitly includes role mapping updates.

---

## Two Separate Authorization Systems

This codebase has TWO completely independent capability systems:

### System 1: Domain Capabilities (Route Authorization)
**File:** `src/domain/constants/capabilities.ts`  
**Purpose:** Define abstract authorization requirements for routes  
**Example Values:**
- `DECISION_CREATE: "decision:create"`
- `DECISION_ACCEPT: "decision:accept"`
- `DECISION_REJECT: "decision:reject"`
- `DECISION_CLOSE: "decision:close"` (proposed)

**Used By:** Route `requireCapabilities` option in `withCanonicalEnforcement`

**Example:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx) => { /* handler */ },
  { requireCapabilities: ["DECISION_ACCEPT"] }
);
```

**Authority:** Defines what capabilities routes MAY request

---

### System 2: Role-to-Capability Mapping (Access Control)
**File:** `src/policies/capability-check.ts`  
**Purpose:** Map user roles to concrete capabilities  
**Object:** `ROLE_CAPABILITIES: Record<RoleName, readonly CapabilityName[]>`

**Example (from code):**
```typescript
[ROLES.SYSTEM_ADMIN]: Object.values(CAPABILITIES),
[ROLES.ADMIN_OR_PORTFOLIO_MANAGER]: [
  CAPABILITIES.USER_VIEW,
  CAPABILITIES.USER_CREATE,
  CAPABILITIES.ENGAGEMENT_CREATE,
  // ... but NO DECISION_CREATE, DECISION_ACCEPT, DECISION_REJECT, DECISION_UPDATE
],
```

**Critical Gap:** DECISION_* capabilities are NOT in any role's mapping

**Used By:** Route wrapper checks via `hasCapability(policy, capability)`

---

### System 3: Plan/Entitlement Capabilities (Quota)
**File:** `src/services/entitlement.ts`  
**Purpose:** Map subscription plans to capabilities for quota enforcement  
**Enum:** `Capability` with values like `"decision_create"` (underscore format, different from domain)

**Example:**
```typescript
export enum Capability {
  DECISION_CREATE = "decision_create",   // Note: underscore
  DECISION_UPDATE = "decision_update",
  // NO DECISION_ACCEPT, DECISION_REJECT, DECISION_CLOSE
}

export const TIER_CONFIGS = {
  [SubscriptionTier.FREE]: {
    capabilities: [Capability.DECISION_CREATE],
  },
  [SubscriptionTier.PRO]: {
    capabilities: [
      Capability.DECISION_CREATE,
      Capability.DECISION_UPDATE,
    ],
  },
};
```

**Used By:** Routes that call `assertCapability(workspaceId, key)` for quota checks

---

## Authorization Flow for Routes

### Modern Route Pattern (acceptDecision, rejectDecision)
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx) => { /* business logic */ },
  { requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }
);
```

**What Happens:**
1. ✓ Canonical wrapper extracts session/policy/workspace
2. ✓ Wrapper calls `buildCapabilityFact(policy, "decision:accept")`
3. ✓ That calls `hasCapability(policy, "decision:accept")`
4. ✓ `hasCapability` checks if user's roles include "decision:accept" in ROLE_CAPABILITIES
5. ✗ **PROBLEM:** "decision:accept" is NOT in any role's capability list
6. ✗ Result: `hasCapability` returns false
7. ✗ Auth fails with 403 Insufficient Permissions

**Does it work anyway?** YES - but only because:
- Tests likely run as SYSTEM_ADMIN role
- SYSTEM_ADMIN gets `Object.values(CAPABILITIES)` (all capabilities)
- So test users can accept/reject
- But production users with other roles CANNOT

---

### Legacy Route Pattern (createDecision)
```typescript
export const POST = withEnforcementFull(async (request) => {
  const { session } = await withAuth();
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  
  // Explicit plan-based entitlement check (quota enforcement)
  const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError(CAPABILITIES.DECISION_CREATE, ...);
  }
  
  // Business logic...
});
```

**What Happens:**
1. ✓ Session/workspace validation (role-based)
2. ✓ Explicit plan entitlement check: does workspace subscription include DECISION_CREATE?
3. ✓ If yes, continue. If no, reject with 402 Plan Limit Error

**Key Difference:** Routes using plan quotas call `assertCapability` EXPLICITLY. Routes using `withCanonicalEnforcement` do NOT.

---

## Current State: DECISION_CREATE, DECISION_ACCEPT, DECISION_REJECT

### Domain Capabilities (in capabilities.ts)
✓ DECISION_CREATE defined  
✓ DECISION_ACCEPT defined  
✓ DECISION_REJECT defined  

### Role Mappings (in capability-check.ts)
✗ DECISION_CREATE NOT in any role's capabilities  
✗ DECISION_ACCEPT NOT in any role's capabilities  
✗ DECISION_REJECT NOT in any role's capabilities  

### Entitlement Tiers (in entitlement.ts)
✓ DECISION_CREATE in Capability enum  
✓ DECISION_UPDATE in Capability enum  
✗ DECISION_ACCEPT NOT in Capability enum  
✗ DECISION_REJECT NOT in Capability enum  

### Why Tests Pass
- Routes use `withCanonicalEnforcement` which checks role-based capabilities
- Tests run with SYSTEM_ADMIN role
- SYSTEM_ADMIN has all domain capabilities (line 9: `Object.values(CAPABILITIES)`)
- So test users can accept/reject regardless of role mapping gaps

### Why Production Users Can't Accept/Reject (If Not SYSTEM_ADMIN)
- Production users have roles like ADMIN_OR_PORTFOLIO_MANAGER, CONSULTANT, etc.
- These roles do NOT have DECISION_ACCEPT, DECISION_REJECT in their capability lists
- When route checks `requireCapabilities: ["DECISION_ACCEPT"]`, it fails
- User gets 403 Insufficient Permissions

### Why createDecision Works
- Uses legacy `withEnforcementFull` pattern
- Does NOT use `requireCapabilities` in wrapper
- Instead, explicitly calls `assertCapability` for plan-based quota checks
- This allows bypassing role-based capability mapping

---

## Proposed X9G-2 Implementation & The Safety Issue

**X9G-2 Plan (from X9G-1 implementation plan):**
```typescript
// File: src/domain/constants/capabilities.ts
export const CAPABILITIES = {
  // ...existing...
  DECISION_CLOSE: "decision:close",  // ADD THIS
};

// File: src/app/api/decisions/[decisionId]/close/route.ts
export const POST = withCanonicalEnforcement(
  async (ctx) => { /* ... */ },
  { requireCapabilities: ["DECISION_CLOSE"] }  // ADD THIS
);
```

**What Would Happen:**
1. User tries to close a decision
2. Route wrapper checks: does user's role have DECISION_CLOSE?
3. DECISION_CLOSE not in any role's mapping
4. Auth fails with 403 Insufficient Permissions
5. User CANNOT close decisions
6. **ALL users, including those with existing close permissions, are now blocked**

**Why This Breaks:**
- Old close route uses: `hasPermission(membership.role, "close_decision")`
- This is a legacy custom check (NOT tied to domain capabilities)
- Current close route DOES work for authorized users
- But X9G-2 would replace it with domain capability check
- Domain capability not in any role's mapping
- Result: Everyone blocked

---

## Root Cause Analysis

**The Gap:** X9G-1 design assumes:
> "Adding DECISION_CLOSE to domain CAPABILITIES means users have access to it"

**Reality:** Adding constant to CAPABILITIES is step 1 of 2:
1. Step 1: Define capability in domain (X9G-1 does this)
2. Step 2: Map capability to roles (X9G-1 does NOT do this)

**The Design Decision:** X9G-1 explicitly deferred entitlement mapping to workspace role design:
> "Entitlement Mapping: Deferred to workspace role design phase"

**The Problem:** But X9G-2 is supposed to ADD capability checks to the route. This creates a sequencing issue:
- Can't add capability checks without entitlements
- Can't defer entitlements if route checks them
- **These are not actually independent**

---

## Safety Assessment Matrix

| Scenario | Add DECISION_CLOSE Capability | Add requireCapabilities Check | Outcome | Safe? |
|---|---|---|---|---|
| A | ✓ | ✗ | Capability exists but not used by route. Legacy route unchanged. All users can close (unchanged). | ✓ YES |
| B | ✓ | ✓ | Capability exists and required by route. But not in any role mapping. All users blocked (including existing). | ✗ NO |
| C | ✗ | ✗ | No capability constant. Legacy route unchanged. All users can close (unchanged). | ✓ YES |
| D | ✗ | ✓ | Invalid. Can't require capability that doesn't exist. | ✗ INVALID |

**Current X9G-2 Plan:** Scenario B (UNSAFE)

---

## Implementation Options for X9G-2

### Option 1: Split Capability Addition and Route Check (SAFE)
**Phase X9G-2A:** Add DECISION_CLOSE capability constant only
- File: `src/domain/constants/capabilities.ts` - add DECISION_CLOSE
- No route changes yet
- Baseline remains 448 violations
- All users can still close
- Governance constant ready for future use

**Phase X9G-2B (Later, when role design ready):** Add route capability check
- Route: Add `requireCapabilities: ["DECISION_CLOSE"]`
- Roles: Update ROLE_CAPABILITIES to include DECISION_CLOSE where appropriate
- Entitlements: Map DECISION_CLOSE to subscription tiers (if plan-based quota desired)
- Comprehensive governance in place before route checks it

**Risk:** LOW  
**Advantage:** Route governance update and entitlement mapping happen together

---

### Option 2: Add Capability + Keep Legacy Route Check (SAFE)
**Implement in X9G-2:**
- File: `src/domain/constants/capabilities.ts` - add DECISION_CLOSE
- File: `src/app/api/decisions/[decisionId]/close/route.ts` - keep legacy `hasPermission` check
- Do NOT add `requireCapabilities` to route wrapper
- Users can still close via legacy permission system

**Code Pattern:**
```typescript
// Capability defined (governance model complete)
// But route still uses legacy auth
const membership = await enforceWorkspaceScoping(...);
if (!hasPermission(membership.role, "close_decision")) {
  throw new Error("Insufficient permissions");
}
```

**Risk:** LOW  
**Advantage:** Governance constant documented and ready. Route functional. Legacy auth stays in place until proper role mapping.

---

### Option 3: Defer Entire X9G-2 (SAFE but Blocks Progress)
**Do not implement X9G-2 at all yet**
- Wait for workspace role design phase
- Then implement route + entitlements together
- No design/implementation mismatch

**Risk:** LOW  
**Advantage:** Forces proper sequencing

**Disadvantage:** Blocks architectural modernization of close route

---

### Option 4: Add Route Check + Role Mapping (SAFE but Scope Creep)
**Implement in X9G-2:**
- Add DECISION_CLOSE capability constant
- Add `requireCapabilities: ["DECISION_CLOSE"]` to route
- Add DECISION_CLOSE to role mappings in ROLE_CAPABILITIES

**Example:**
```typescript
[ROLES.ADMIN_OR_PORTFOLIO_MANAGER]: [
  // ... existing capabilities ...
  CAPABILITIES.DECISION_CLOSE,  // ADD THIS
],
```

**Risk:** MEDIUM (scope includes role mapping, which was supposed to wait)  
**Advantage:** Complete capability governance in one phase

---

## Recommendation

**For X9G-2 Implementation:** Use **Option 2** (Capability + Legacy Check)

**Rationale:**
1. ✓ Completes governance design (DECISION_CLOSE capability defined)
2. ✓ Maintains backward compatibility (existing users not blocked)
3. ✓ Reduces scope creep (role mapping deferred as X9G-1 intended)
4. ✓ Allows later migration (route check and role mapping can be done together in next phase)
5. ✓ Clear path forward (documentation shows what needs to happen next)

**Implementation Details:**
- Add `DECISION_CLOSE: "decision:close"` to `src/domain/constants/capabilities.ts`
- Update close route to reference DECISION_CLOSE constant (but keep legacy auth)
- Document that role mapping is deferred
- No changes to ROLE_CAPABILITIES or entitlement.ts needed

**Next Steps:**
- X9G-2: Capability constant + legacy auth pattern (route change is minimal)
- Future Phase: Role mapping update + route migration (when workspace design ready)

---

## Blocking Conditions for X9G-2

### DO NOT IMPLEMENT X9G-2 with Option 4 (Route Check + Role Mapping) IF:
✗ Role hierarchy is still under design  
✗ Workspace role design phase hasn't started  
✗ "Close decision" should be available to more than SYSTEM_ADMIN in tests  

### DO IMPLEMENT X9G-2 with Option 2 (Capability + Legacy Check) IF:
✓ Want to add governance constant now (YES)  
✓ Can defer role mapping to later phase (YES)  
✓ Acceptable to keep legacy auth temporarily (YES)  

---

## Scope Safety Check

### X9G-2 With Option 2 (SAFE)
**Files Modified:**
1. `src/domain/constants/capabilities.ts` - add DECISION_CLOSE constant (1 line)
2. `src/app/api/decisions/[decisionId]/close/route.ts` - reference constant (1 import, 0 behavior changes)

**Files NOT Modified:**
- ✗ capability-check.ts (no role mapping changes)
- ✗ entitlement.ts (no entitlement tier changes)
- ✗ Any other routes
- ✗ Any services
- ✗ Any auth wrappers

**Scope:** Minimal, isolated, safe

---

## Test Implications

### Current Tests (X9F/X9G Baseline)
- Run as SYSTEM_ADMIN role
- Can't verify role mapping because all roles work

### If X9G-2 Implemented with Option 2
- Tests still pass (no behavior change)
- Route still uses legacy auth
- Users with close_decision permission still work

### If X9G-2 Implemented with Option 4
- Tests still pass (SYSTEM_ADMIN has all capabilities)
- But if tests checked non-admin roles, they'd fail
- New role mapping required (scope creep)

---

## Conclusion

**X9G-1R Safety Finding:**

Adding DECISION_CLOSE domain capability (Step 1) is SAFE.  
Using route capability checks without role mapping (Step 2) is UNSAFE.

**X9G-2 Should:**
✓ Add DECISION_CLOSE capability constant  
✓ Keep legacy route auth pattern  
✓ Defer role mapping to later phase

**This satisfies X9G-1 intent** (governance design complete, implementation started) while **avoiding user-blocking scenarios** (all users still authorized via legacy system).

---

## Sign-Off

**X9G-1R Safety Analysis:** COMPLETE

**Finding:** X9G-2 implementation requires clarification on auth pattern choice (Option 2 vs Option 4).

**Recommendation:** Option 2 (Capability constant + legacy auth) is safest for X9G-2 scope.

**Next Action:** Confirm implementation approach before proceeding to X9G-2 code changes.
