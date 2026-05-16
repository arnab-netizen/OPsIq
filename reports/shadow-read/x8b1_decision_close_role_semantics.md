# X8B-1: DECISION_CLOSE Role Semantics

**Date:** 2026-05-16  
**Phase:** X8B-1 Phase C - DECISION_CLOSE Role Semantics  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Critical Finding: Legacy close_decision is Broken

**Current State:**
- Close route checks: `hasPermission(membership.role, "close_decision")`
- hasPermission implementation does NOT include "close_decision" in any role's permission list
- Result: **Close functionality is currently BROKEN** - all users get 403

**Evidence:**
```typescript
// From src/middleware/workspace-enforcement.ts hasPermission function:
const permissions: Record<string, string[]> = {
  admin: ["create", "read", "update", "delete", "approve", "reject", "override", "evaluate"],  // NO close_decision
  operator: ["create", "read", "evaluate"],  // NO close_decision
  reviewer: ["read", "approve", "reject", "evaluate"],  // NO close_decision
};

// In close route:
if (!hasPermission(membership.role, "close_decision")) {  // ALWAYS FALSE
  throw new Error("Insufficient permissions");
}
```

**Impact:** No user can close decisions currently (unless this code is dead/untested)

---

## DECISION_CLOSE Semantics Questions

### Q1: Which roles can currently close decisions?
**Answer:** NONE - the legacy system is broken. "close_decision" is not in any role's hasPermission mapping.

**Design Decision:** We must decide which roles SHOULD be able to close decisions.

---

### Q2: Should the same roles receive DECISION_CLOSE?
**Answer:** YES - if we're fixing the broken close_decision, we should map DECISION_CLOSE to the roles that SHOULD have close permission.

**Design Decision:** Identify the "correct" roles that should close decisions, and give them DECISION_CLOSE.

---

### Q3: Is DECISION_CLOSE equivalent to legacy close_decision?
**Answer:** Not exactly. The legacy close_decision was defined but broken. DECISION_CLOSE should be designed properly.

**Design Decision:** DECISION_CLOSE represents the CORRECT semantics for closing decisions, regardless of what close_decision was intended to be.

---

### Q4: Is closing a decision owner/admin-only?
**Analysis:**
- Closing a decision marks it OUTCOME_RECORDED → CLOSED (terminal state)
- This is an administrative action (finalizing a decision record)
- Typically owner/admin operations
- Not a consultant-level action (consultants don't usually finalize decisions)

**Recommendation:** Closing should be restricted to:
- SYSTEM_ADMIN (always)
- ADMIN_OR_PORTFOLIO_MANAGER (always)
- Possibly EXPERIENCED_CONSULTANT (if they manage decisions)
- NOT BEGINNER_CONSULTANT (too junior)
- NOT ANALYST (read-only role)
- NOT CLIENT roles (internal operation)

---

### Q5: Should manager/member roles have close permission?
**Answer:** Depends on role semantics.

**Analysis:**
- ADMIN_OR_PORTFOLIO_MANAGER: YES (managers should finalize decisions)
- EXPERIENCED_CONSULTANT: MAYBE (depends on if they manage decisions)
- BEGINNER_CONSULTANT: NO (too junior for finalizing)
- CLIENT roles: NO (internal-only operation)

---

### Q6: Does close require workspace membership?
**Answer:** YES

**Implementation:**
- Close route already checks workspace membership via `enforceWorkspaceScoping()`
- This is prerequisite for any role check
- Membership is enforced before permission check

---

### Q7: Does close require internal access?
**Analysis:**
- Closing a decision is an internal operation (not client-visible)
- Client roles should NOT be able to close
- Only internal consultant roles should close

**Recommendation:** YES - close should be internal-only

**Enforcement:** Restrict DECISION_CLOSE to internal roles only
- ✓ SYSTEM_ADMIN
- ✓ ADMIN_OR_PORTFOLIO_MANAGER
- ✓ EXPERIENCED_CONSULTANT (maybe)
- ✗ BEGINNER_CONSULTANT (not manager-level)
- ✗ ANALYST (read-only)
- ✗ CLIENT_OWNER (external)
- ✗ CLIENT_TEAM_MEMBER (external)
- ✗ VIEWER (read-only)

---

### Q8: Does close require entitlement/plan access?
**Analysis:**
- Close is a decision lifecycle operation (like accept/reject)
- Plan-based quotas (e.g., "decisions per month") would apply to creation, not closing
- Closing doesn't create new resources, just transitions existing ones
- Recommendation: NO - closing should NOT require plan entitlement

**Rationale:**
- Users who can create/accept decisions should be able to finalize them
- Blocking close due to plan tier doesn't make sense
- Entitlements are for creation/usage, not for lifecycle transitions

---

## Least-Privilege Mapping

**Principle:** Grant close permission only to roles that manage decisions

**Recommendation:**
```
DECISION_CLOSE should be granted to:
├─ SYSTEM_ADMIN (unconditional, gets all)
└─ ADMIN_OR_PORTFOLIO_MANAGER (managers should finalize decisions)

DECISION_CLOSE should NOT be granted to:
├─ EXPERIENCED_CONSULTANT (consultants execute, don't finalize)
├─ BEGINNER_CONSULTANT (too junior)
├─ ANALYST (read-only)
├─ CLIENT_OWNER (external, not decision finalization)
├─ CLIENT_TEAM_MEMBER (external)
└─ VIEWER (read-only)
```

---

## Behavior Preservation Mapping

**Current Broken Behavior:**
- No one can close (close_decision not in hasPermission)
- Route always returns 403

**Desired Fixed Behavior:**
- Admin and portfolio managers can close
- Others cannot
- This assumes "admin" and "portfolio manager" are the intended closers

**Mapping:**
- SYSTEM_ADMIN → gets DECISION_CLOSE
- ADMIN_OR_PORTFOLIO_MANAGER → gets DECISION_CLOSE
- Everyone else → does NOT get DECISION_CLOSE

---

## Authorization Pattern: Legacy vs Modern

### Legacy Pattern (Currently Used)
```typescript
hasPermission(membership.role, "close_decision")
// Maps: role string → permission string[] → boolean
// Broken: "close_decision" not in any permission list
```

### Modern Pattern (Proposed)
```typescript
hasCapability(policy, CAPABILITIES.DECISION_CLOSE)
// Maps: policy context → role assignment → role capabilities → "decision:close" → boolean
// Uses ROLE_CAPABILITIES mapping from capability-check.ts
```

**Design:** Use modern DECISION_CLOSE capability once role mapping is defined

---

## Summary of Semantics

**DECISION_CLOSE should be:**
✓ Admin/manager-only operation  
✓ Internal-only (not for client roles)  
✓ Not entitlement-gated (plan-independent)  
✓ Workspace-membership-required  
✓ Mapped to ADMIN_OR_PORTFOLIO_MANAGER + SYSTEM_ADMIN  
✓ A terminal operation (finalizes decisions)  

**DECISION_CLOSE should NOT be:**
✗ Assigned to consultant roles (they don't finalize)  
✗ Assigned to client roles (internal only)  
✗ Assigned to read-only roles (viewer, analyst)  
✗ Entitlement-gated (doesn't consume resources)  
✗ Granted without workspace membership  

---

## Gaps and Risks

### Risk 1: Legacy close_decision is Broken
**Current:** close_decision not defined → route always fails  
**Design Goal:** Fix by mapping DECISION_CLOSE to proper roles  
**Mitigation:** Replace legacy check with modern DECISION_CLOSE  

### Risk 2: Multiple Authorization Systems
**Current:** Mixing legacy hasPermission with modern ROLE_CAPABILITIES  
**Design Goal:** Migrate to consistent DECISION_CLOSE capability  
**Mitigation:** Update route to use ROLE_CAPABILITIES + DECISION_CLOSE  

### Risk 3: Client Access Prevention
**Current:** Route auth doesn't explicitly prevent client roles  
**Design Goal:** Ensure DECISION_CLOSE never granted to client roles  
**Mitigation:** Only add DECISION_CLOSE to internal roles  

---

## Next Steps

Design options that map DECISION_CLOSE to:
1. Admin + Portfolio Manager (least privilege, fixes broken legacy)
2. Admin only (most restrictive)
3. Keep legacy indefinitely (workaround, not fix)
4. Or other options...

See Phase D for options evaluation.
