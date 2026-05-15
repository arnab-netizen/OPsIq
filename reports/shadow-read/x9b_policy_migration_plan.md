# X9B: Policy Migration Plan (Post-Design)

**Phase:** X9B-E (Migration Planning)  
**Date:** 2026-05-15  
**Status:** PLANNING - EXECUTION DEFERRED TO X9C+

---

## Overview

This plan is for AFTER design is approved. Currently in design-only phase (X9B).

**No code changes in X9B.** This is the implementation roadmap.

---

## Phase X9C: Implementation

### X9C-1: Wrapper Enhancement (1-2 days)

**What to implement:**
1. Add `verifiedInternalAccess?: boolean` to CanonicalAuthContext
2. Update wrapper to compute `hasInternalAccess(policy)` during auth
3. Update type definitions

**Scope:**
- `src/lib/canonical-route-enforcement.ts` - Add field, compute value
- `src/lib/canonical-auth-facts.ts` - Add field to auth state
- No route changes needed
- No service changes needed

**Proof requirements:**
- [ ] TypeScript builds
- [ ] Tests pass (no new tests needed, existing pass as-is)
- [ ] Scanner shows 450 violations (unchanged)

**Violation reduction:** 0 (infrastructure, no code elimination)

**Deployment:** Safe - backward compatible, new field is optional

---

### X9C-2: Route Cleanup (Optional, 1 day)

**What to change (optional):**
- Routes can switch from `ctx.policy ? hasInternalAccess(ctx.policy) : false` to `ctx.verifiedInternalAccess ?? false`
- This is observability improvement, not required for functionality

**Scope:**
- 3-4 routes using hasInternalAccess
- src/app/api/engagements/route.ts - GET
- src/app/api/engagements/[engagementId]/route.ts - GET
- src/app/api/me/route.ts - GET

**Example change:**
```typescript
// Before
const internalAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;

// After
const internalAccess = ctx.verifiedInternalAccess ?? false;
```

**Proof requirements:**
- [ ] Routes still pass visibility filtering tests
- [ ] GET handlers still return correct visibility
- [ ] No security regression

**Violation reduction:** 0-2 (observability improvement, might reduce violations if scanner recognizes pattern)

**Deployment:** Safe - equivalent behavior, just clearer intent

---

### X9C-3: Service Refactoring (2-3 days)

**What to change:**
1. Services stop accepting full `ctx: CanonicalAuthContext`
2. Services accept `verifiedInternalAccess` as boolean parameter
3. Services never access `ctx.policy`

**Scope (affected services):**
- All services that do visibility filtering:
  - src/services/engagement.ts - getEngagementById
  - src/services/client.ts - getClientById
  - src/services/stage.ts - visibility handling
  - src/services/deliverable.ts - visibility handling

**Example change:**
```typescript
// Before
async function getEngagementById(id, workspaceId, ctx) {
  const hasInternal = ctx.policy ? hasInternalAccess(ctx.policy) : false;
}

// After
async function getEngagementById(id, workspaceId, hasInternalAccess) {
  // Just use boolean parameter
}
```

**Routes call services like:**
```typescript
const result = await getEngagementById(
  engagementId,
  ctx.verifiedWorkspaceId,
  ctx.verifiedInternalAccess ?? false
);
```

**Proof requirements:**
- [ ] Service signatures updated
- [ ] All service calls pass boolean parameter
- [ ] Visibility filtering tests still pass
- [ ] Scanner violations reduced (6-8 violations eliminated)

**Violation reduction:** 6-8 (service auth-guard imports, policy access patterns)

**Deployment:** Safe - equivalent behavior, cleaner boundaries

**Risk:** Service signature changes require careful refactoring, good test coverage

---

### X9C-4: Workspace Membership Integration (Design phase only in X9B)

**Deferred to X9C-Workshop decision:**

Should workspace membership validation be added to wrapper during this phase?

**Option 1: Yes, add to X9C-1**
- Wrapper validates workspace membership before handler
- Completes Lane 8 blocker (workspace enforcement)
- More work but unblocks more violations

**Option 2: No, defer to X9D**
- X9C focuses on internal access canonicalization
- X9D focuses on workspace membership
- Smaller scope per phase, lower risk

**Recommendation:** Option 2 (defer workspace)
- Reason: Policy design complete, can move to Lane 7/9C service work
- Workspace membership is separate concern
- Can be designed and implemented later

---

## First Pilot Candidates (X9C-1 and beyond)

### Pilot 1: engagement/route.ts GET
- **Risk:** LOW
- **Change:** Switch to `ctx.verifiedInternalAccess`
- **Validation:** Engagement list filters correctly
- **Expected outcome:** Same behavior, cleaner code

### Pilot 2: engagements/[engagementId]/route.ts GET
- **Risk:** LOW
- **Change:** Switch to `ctx.verifiedInternalAccess`
- **Validation:** Single engagement filters correctly
- **Expected outcome:** Same behavior, cleaner code

### Pilot 3: me/route.ts GET
- **Risk:** LOW
- **Change:** Use `ctx.verifiedInternalAccess` for response field
- **Validation:** Response includes correct isInternal flag
- **Expected outcome:** Same behavior, clearer intent

### Pilot 4: Service visibility refactoring (engagement.ts)
- **Risk:** MEDIUM
- **Change:** Accept boolean parameter instead of ctx
- **Validation:** All engagement visibility tests pass
- **Expected outcome:** Cleaner service boundary, 3-4 violations reduced

---

## Excluded / High-Risk Candidates (Defer to Next Phase)

### Workspace enforcement handlers (Lane 8)
- **Reason:** Requires separate WORKSPACE_MEMBERSHIP_CANONICAL_DESIGN
- **Defer to:** X9D or later
- **Blockers:** Must design workspace validation first

### Custom role handlers (Lane 8)
- **Reason:** Requires separate ROLE_RESOLUTION_CANONICAL_DESIGN
- **Defer to:** X9D or later
- **Blockers:** Must design role-based auth pattern first

### Service policy context (auth.ts, workspace/context.ts)
- **Reason:** Requires full SERVICE_CANONICAL_CONTEXT_DESIGN
- **Defer to:** X9C-3 after internal access refactoring
- **Blockers:** Service redesign in progress

---

## Service Boundary Rules

**After X9C Complete:**

Routes MUST:
- [ ] Pass `verifiedInternalAccess` boolean to services
- [ ] Pass `verifiedActorId` for audit
- [ ] Pass `verifiedWorkspaceId` for scope
- [ ] Pass `verifiedCapabilities` if checking scoped capabilities

Routes MUST NOT:
- [ ] Pass `ctx.policy` to services
- [ ] Pass `ctx.request` to services
- [ ] Pass `ctx.correlationId` to services

Services MUST:
- [ ] Accept boolean parameters (not context)
- [ ] Use `verifiedInternalAccess` for filtering
- [ ] Use `verifiedCapabilities` for authorization

Services MUST NOT:
- [ ] Accept full `CanonicalAuthContext`
- [ ] Access `ctx.policy`
- [ ] Try to recompute policy
- [ ] Fetch policy from database (if possible)

---

## Scanner Expectations

### After X9C-1 (Wrapper Enhancement)
- Scanner total: 450 violations (unchanged)
- New pattern: `ctx.verifiedInternalAccess` (not a violation)
- Old pattern: `ctx.policy ? hasInternalAccess : false` (still OK for fallback)

### After X9C-2 (Route Cleanup)
- Scanner total: 450-448 violations (potential -2)
- Cleaner internal access patterns
- Routes no longer checking `ctx.policy` directly

### After X9C-3 (Service Refactoring)
- Scanner total: 442-444 violations (potential -6 to -8)
- Service auth violations reduced
- Services no longer access `ctx.policy`

---

## How Quarantined Bridges Are Affected

**canonicalizeAuthContext bridges:**
- Routes using bridges still get CanonicalAuthContext with policy
- Bridges can continue working unchanged through X9C
- After all design phases (X9D+), bridges can be removed
- Not blocking X9C implementation

**Bridge removal timeline:**
- X9C: Bridges continue working
- X9D+: After all designs, remove bridges incrementally
- X9F: Final bridge removal phase

---

## How Lanes Resume After This Design

### Lane 7 Completion (X9C+ timing)
- **Current status:** Deferred, waiting for policy design
- **After X9B:** Policy design complete, can resume
- **Next step:** X9C-2 route cleanup (switches to verifiedInternalAccess)
- **Expected:** Lane 7 closed, GET handlers fully canonical

### Lane 9C (Service refactoring)
- **Current status:** Blocked on policy design
- **After X9B:** Policy design complete
- **Next step:** X9C-3 service refactoring
- **Expected:** 6-8 violations reduced, service boundaries clean

### Lane 8 (Workspace/role design)
- **Current status:** Deferred, waiting for policy + other designs
- **After X9B:** Unblocked only on policy side
- **Next step:** X9D workspace membership design (separate)
- **Next step:** X9D role resolution design (separate)
- **Not ready for migration** until X9D designs complete

---

## Next Implementation Phase Name

**X9C: Policy Canonicalization Implementation**

Sub-phases:
- **X9C-1:** Wrapper Enhancement (verifiedInternalAccess)
- **X9C-2:** Route Cleanup (optional)
- **X9C-3:** Service Refactoring (remove policy from service layer)

**After X9C:**
- **X9D:** Workspace Membership Canonical Design (if proceeding)
- **X9D+:** Implementation phases for workspace/role designs

---

## Expected Timeline

| Phase | Duration | Type |
|-------|----------|------|
| X9B (Current) | 2-3 days | Design |
| X9C-1 | 1-2 days | Implementation |
| X9C-2 | 1 day | Implementation (optional) |
| X9C-3 | 2-3 days | Implementation |
| **X9C Total** | **5-7 days** | **Implementation** |

---

## Summary

**What This Design Enables:**

After X9B design approval:
1. ✓ Lane 7 can resume (GET handlers with internal access)
2. ✓ Service layer can be refactored (policy removed from services)
3. ✓ 12-15 violations can be eliminated
4. ✓ Service boundaries can be cleaned
5. ✓ Foundation for workspace/role designs in X9D+

**What Still Needs Design:**

- Workspace membership canonicalization (X9D)
- Role-based auth patterns (X9D)
- Service context refactoring (X9D+)

**No Code Changes Until X9C:**

X9B is design-only. Implementation starts in X9C.

---

**Status:** ✓ Migration Plan Documented

**Next Step:** Validation Phase (Section F)
