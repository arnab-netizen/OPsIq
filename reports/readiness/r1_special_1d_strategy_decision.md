# R1-SPECIAL-1D: Strategy Decision

**Date:** 2026-05-17  
**Phase:** R1-SPECIAL-1D Modernization Strategy  
**Status:** STRATEGY SELECTED - D4 FOR ALL HANDLERS

---

## A. Strategy Selection: D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK

**Selected for all 8 handlers:** ✓ YES

**Why D4 for all handlers:**
- All handlers have existing policy/role logic that must be preserved exactly
- All handlers can wrap existing logic with canonical outer enforcement
- All handlers can be modernized without service signature changes
- All handlers will receive verified context from wrapper
- D4 matches the pattern already used in partially-modernized handlers

---

## B. Per-Handler Strategy

### Handler 1: scenario (POST)

**Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK  
**Existing Logic Preserved:** resolveServerRole() + implicit role check  
**Service Changes:** None  
**Business Logic Changes:** None  
**Capability Changes:** None  
**Risk Level:** MEDIUM → LOW (with D4)

**Implementation:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // Preserve existing logic
    const role = await resolveServerRole();
    if (!role) {
      throw new UnauthorizedError("Unauthorized");
    }
    
    // Use verified context
    const actorId = ctx.verifiedActorId;
    
    // Rest of handler unchanged
    const body = await ctx.request!.json();
    const result = runScenario({...body});
    
    await logAuditEvent({...});
    return result;
  },
  { requireWorkspace: true, requireCapabilities: [SCENARIO_EXECUTE] }
);
```

---

### Handler 2: value (GET)

**Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK  
**Existing Logic Preserved:** resolveServerRole() + canView()  
**Service Changes:** None  
**Business Logic Changes:** None  
**Capability Changes:** None  
**Risk Level:** MEDIUM → LOW (with D4)

**Implementation:**
```typescript
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Preserve existing logic
    const role = await resolveServerRole();
    if (!role) {
      throw new UnauthorizedError("Unauthorized");
    }
    if (!canView(role)) {
      throw new ForbiddenError("Insufficient permissions");
    }
    
    // Use verified context
    const actorId = ctx.verifiedActorId;
    
    // Rest unchanged
    const items = await getItems();
    const metrics = calculateValue(items);
    
    await logAuditEvent({...actorId, role, ...});
    return metrics;
  },
  { requireWorkspace: true, requireCapabilities: [VALUE_VIEW] }
);
```

---

### Handler 3: override (POST)

**Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK  
**Existing Logic Preserved:** resolveServerRole() + canEdit() + complex policy wrapper with 3 audit points  
**Service Changes:** None  
**Business Logic Changes:** None  
**Capability Changes:** None  
**Risk Level:** HIGH → MEDIUM (with D4, audit trail preserved)

**Key Preservation:** All 3 audit events (AUTH_FAILED, PERMISSION_DENIED, OVERRIDE_APPROVED) stay exactly in place with same semantics

**Implementation:** Wrap existing logic with canonical context, replace session.user.id with ctx.verifiedActorId

---

### Handler 4: evidence/[evidenceId]/validate (POST)

**Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK  
**Existing Logic Preserved:** internalOnly policy flag + workspace enforcement  
**Service Changes:** None (replace header-based workspace with ctx.verifiedWorkspaceId)  
**Business Logic Changes:** None  
**Capability Changes:** None  
**Risk Level:** MEDIUM-HIGH → MEDIUM (with D4)

**Implementation:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // Preserve internalOnly check as route-local policy
    // (wrapper provides EVIDENCE_VALIDATE capability, internalOnly as policy flag in policy object)
    if (ctx.policy && !ctx.policy.internalOnly) {
      throw new ForbiddenError("Internal only");
    }
    
    // Use verified workspace instead of header
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;
    
    // Rest unchanged
    // idempotency, validation, service call all preserved
    await validateEvidence(body, actorId, workspaceId);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.EVIDENCE_VALIDATE] }
);
```

---

### Handler 5: entity (POST)

**Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK  
**Existing Logic Preserved:** resolveServerRole() + canEdit()  
**Service Changes:** None  
**Business Logic Changes:** None  
**Capability Changes:** None  
**Risk Level:** MEDIUM → LOW (with D4, follow GET pattern)

**Follow Pattern:** entity GET is already modernized - POST should match that pattern

---

### Handler 6: diagnosis/route (POST)

**Strategy:** ALREADY MODERNIZED - NO CHANGES NEEDED  
**Status:** Uses D4 correctly (withCanonicalEnforcement + verified context)  
**Reference:** Use as template for other diagnosis routes

---

### Handler 7: diagnosis/archetype (POST)

**Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK  
**Existing Logic Preserved:** internalOnly policy flag  
**Service Changes:** None (replace body.workspaceId with ctx.verifiedWorkspaceId)  
**Business Logic Changes:** None  
**Capability Changes:** None  
**Risk Level:** MEDIUM → MEDIUM (with D4)

**Implementation:** Follow diagnosis/route pattern, preserve internalOnly as route-local policy

---

### Handler 8: users/[userId]/roles (POST/DELETE)

**Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK  
**Existing Logic Preserved:** getActorHierarchyLevel() + internalOnly policy flag  
**Service Changes:** None  
**Business Logic Changes:** None (hierarchy logic preserved exactly)  
**Capability Changes:** None  
**Risk Level:** HIGH → MEDIUM (with D4, hierarchy preserved as route-local)

**Critical Preservation:** getActorHierarchyLevel(policy) must remain to prevent privilege escalation (cannot assign roles above own level)

**Implementation:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // Preserve internalOnly check
    if (ctx.policy && !ctx.policy.internalOnly) {
      throw new ForbiddenError("Internal only");
    }
    
    // Preserve hierarchy check - critical for security
    const actorLevel = getActorHierarchyLevel(ctx.policy);
    
    // Use verified context
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;
    
    // Rest unchanged - service receives verified params + hierarchy level
    await assignRole(data, actorId, actorLevel, workspaceId);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.USER_ASSIGN_ROLE] }
);
```

---

### Handler 9: users/[userId]/memberships (POST/DELETE)

**Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK  
**Existing Logic Preserved:** internalOnly policy flag + bridge pattern  
**Service Changes:** None  
**Business Logic Changes:** None  
**Capability Changes:** None  
**Risk Level:** MEDIUM → MEDIUM (with D4, bridge pattern completed)

**Note:** Handler already has canonicalizeAuthContext() bridge - complete it by removing bridge and using ctx directly

**Implementation:** Follow users/roles POST pattern, use ctx directly instead of canonicalizeAuthContext() bridge

---

## C. Shared Strategy Across Batch

**Batch Composition Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK

All 8 handlers use the same pattern:
1. Wrap with withCanonicalEnforcement outer enforcement
2. Preserve existing route-local policy/role checks in handler body
3. Replace unverified context (headers, session) with verified context (ctx)
4. Keep all business logic, audit trails, and constraints exactly as-is

**Batch Similarity Benefits:**
- Same pattern for all handlers
- Easier code review (consistent pattern)
- Easier testing (same wrapper behavior)
- Easier debugging (stack traces similar)

---

## D. Why No New Capabilities/Roles/Entitlements

**Question:** Don't we need new capabilities for each handler?

**Answer:** No. Here's why:

1. **Existing policy/role checks are route-local**
   - resolveServerRole(), canView, canEdit, getActorHierarchyLevel are all called within handlers
   - They don't need to be new capabilities in a shared capability registry
   - They can stay as route-local functions

2. **internalOnly is a policy flag, not a capability**
   - Some routes are internal-only - this is a route property, not a user capability
   - Can be stored in policy object or route metadata
   - Does not need new entitlement definitions

3. **Existing permissions model is sufficient**
   - If canView(role) checks if a role can view something, that's route-local policy
   - The role exists and is determined by resolveServerRole()
   - No NEW role or capability definitions needed

4. **Service calls work with existing parameters**
   - Services already accept the parameters being passed
   - We're just using verified versions instead of unverified
   - No new signature = no new capability needed

**Consequence:** All D4 implementations work without touching capability/role/entitlement infrastructure

---

## E. Why No Service Changes

**Question:** Do services need changes for verified context?

**Answer:** No. Here's why:

1. **Services already use parameters**
   - `runScenario(baseRevenue, baseCost, deltaRevenue, deltaCost)` - accepts numbers
   - `calculateValue(items)` - accepts items array
   - `validateEvidence(bodyData, actorId, workspaceId)` - accepts these parameters
   - `assignRole(data, actorId, actorLevel, workspaceId)` - already accepts these

2. **Verified vs unverified is same type**
   - `session.user.id` is a string (actorId)
   - `ctx.verifiedActorId` is a string (verified actorId)
   - Service doesn't care about verification - handler enforced it

3. **No semantic change to services**
   - Services don't know about handlers or wrappers
   - They just process the data passed to them
   - Using verified data instead of unverified is transparent to service

4. **Role resolution services stay in routes**
   - `resolveServerRole()` is route-local, not service-level
   - Services don't need to change to work with roles

**Consequence:** All D4 implementations work with existing services unchanged

---

## F. Strategy Batching Feasibility

**Can D4 handlers be batched together?** YES

**Reason:** All 8 handlers use the same pattern and strategy

**Batch Options:**
1. **Single batch of all 8** - All same pattern, can batch
2. **Two batches (4+4)** - By complexity (simple + complex)
3. **Three batches** - By complexity level
4. **Incremental (1-2 per batch)** - Conservative approach

**Recommended:** Single batch of 3-8 handlers (meet batch size target)

---

## G. Summary

**Strategy Verdict:** ✓ D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK for all 8 handlers

**Advantages:**
- Preserves all existing logic exactly
- No new capabilities/roles/entitlements
- No service signature changes
- No business logic changes
- All handlers use same pattern
- Can be batched together
- Matches existing partial-modernization patterns
- Safe and low-risk

**Next Step:** Select first implementation batch from these 8 D4 handlers

---

**Status: ✓ STRATEGY SELECTED - D4 FOR ALL 8 LANE_D HANDLERS**
