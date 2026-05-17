# R1-SPECIAL-1D: Design Options Evaluation

**Date:** 2026-05-17  
**Status:** DESIGN OPTIONS EVALUATED - D4 RECOMMENDED

---

## A. Five Modernization Approaches

### Option 1: Canonical-Only (Simplest)

**Pattern:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // No custom auth logic
    return await service(ctx);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITY] }
);
```

**Advantages:**
- Simplest code pattern
- Full wrapper enforcement
- No custom logic in handler
- Verified context throughout

**Requirements:**
- No custom policy checks needed
- No role resolution needed
- No hierarchy logic needed

**Applicable Handlers:** NONE (all 8 handlers have custom policy/role logic)

**Verdict:** ✗ REJECTED - Incompatible with existing policy logic that must be preserved

---

### Option 2: Canonical + Policy Wrapper Helper

**Pattern:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Call route-local policy check
    if (!checkInternalOnly(ctx.policy)) {
      throw new ForbiddenError("Internal only");
    }
    return await service(ctx);
  },
  { requireCapabilities: [CAPABILITY] }
);
```

**Advantages:**
- Uses canonical wrapper
- Custom policy logic in handler
- Verified context passed to service

**Requirements:**
- Define helper functions for policy checks
- Keep existing policy logic

**Verdict:** ✓ POSSIBLE (similar to D4, but adds helper functions)

---

### Option 3: Dedicated New Policy/Role Guard

**Pattern:**
```typescript
// New policy system
export const INTERNAL_ONLY_POLICY: AuthPolicy = { internalOnly: true };
export const HIERARCHY_POLICY: AuthPolicy = { hierarchy: "peer-or-lower" };

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    if (!applyPolicy(ctx, INTERNAL_ONLY_POLICY)) throw Error;
    return await service(ctx);
  },
  { requireCapabilities: [CAPABILITY] }
);
```

**Advantages:**
- Structured policy definitions
- Reusable across routes
- Explicit policy semantics

**Requirements:**
- NEW capability/entitlement changes
- NEW policy infrastructure
- NEW database tables?

**Verdict:** ✗ REJECTED - Requires capability/entitlement changes, violates protocol

---

### Option 4: Outer Canonical + Route-Local Role/Policy Check (D4)

**Pattern:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // Preserve existing route-local policy/role logic
    const role = await resolveServerRole();  // Keep existing
    if (!role) throw new UnauthorizedError("Unauthorized");
    
    if (!canView(role)) {  // Keep existing
      throw new ForbiddenError("Insufficient permissions");
    }
    
    // Now use verified context
    return await service(ctx);
  },
  { 
    requireWorkspace: true, 
    requireCapabilities: [CAPABILITY] 
  }
);
```

**Advantages:**
- Preserves all existing logic exactly
- Adds outer canonical enforcement
- Uses verified context in service calls
- No new capabilities/policies
- No business logic changes
- No service signature changes
- Matches partially-modernized handlers (entity GET, users/roles GET, users/memberships GET)

**Requirements:**
- Keep existing role/policy checks in handler
- Pass verified context to services
- Handle workspace enforcement from wrapper

**Applicable Handlers:** ALL 8 (every handler has route-local policy that must be preserved)

**Verdict:** ✓ RECOMMENDED - Meets all safety constraints, preserves existing logic

---

### Option 5: Defer

**Pattern:**
- Do not modernize LANE_D handlers
- Keep withEnforcementFull for now
- Plan modernization for future phase

**Advantages:**
- No risk (no changes)
- Can wait for design clarity

**Requirements:**
- Delays private beta gate (LANE_D blocks beta)
- Delays public launch (LANE_D blocks launch)

**Verdict:** ✗ REJECTED - LANE_D is critical blocker for both beta and launch

---

## B. Evaluation Matrix

| Criterion | Option 1 | Option 2 | Option 3 | Option 4 (D4) | Option 5 |
|-----------|----------|----------|----------|---------------|----------|
| Preserves existing logic | ✗ | ✓ | ✓ | ✓ | ✓ |
| Uses verified context | ✓ | ✓ | ✓ | ✓ | ✗ |
| No new capabilities | ✓ | ✓ | ✗ | ✓ | ✓ |
| No service changes | ✓ | ✓ | ✓ | ✓ | ✓ |
| No business logic changes | ✓ | ✓ | ✓ | ✓ | ✓ |
| Matches existing patterns | ✗ | ✓ | ✗ | ✓ | N/A |
| Unblocks private beta | ✗ | ✓ | ✓ | ✓ | ✗ |
| Applicable to all handlers | ✗ | ✓ | ✓ | ✓ | ✓ |
| **Recommended** | **✗** | **~** | **✗** | **✓** | **✗** |

---

## C. Why D4 is Selected

**D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK** is the optimal approach because it:

1. **Preserves all existing logic exactly**
   - resolveServerRole() calls stay in handlers
   - canView/canEdit/hierarchy checks stay in handlers
   - internalOnly policy checks stay in handlers
   - Multiple audit logging points stay in handlers

2. **Adds outer canonical enforcement**
   - Wrapper provides verified context (ctx.verifiedActorId, ctx.verifiedWorkspaceId, ctx.verifiedCapabilities)
   - Handlers can use verified context in service calls
   - Workspace isolation enforced at entry point

3. **Requires NO new capabilities/policies/roles**
   - Existing policy logic is preserved as-is
   - No new entitlements need to be created
   - No role mappings change

4. **Requires NO service signature changes**
   - Services already accept parameters
   - Can pass verified context instead of unverified
   - No method signatures need updates

5. **Requires NO business logic changes**
   - Override workflow preserved
   - Audit trails preserved
   - State machine preserved
   - Hierarchy constraints preserved

6. **Matches existing patterns**
   - entity GET already uses this pattern ✓
   - users/roles GET already uses this pattern ✓
   - users/memberships GET already uses this pattern ✓
   - diagnosis/route already uses this pattern ✓
   - Mixed-state handlers can be completed to match their GET methods

7. **Safe from risk perspective**
   - No privilege escalation possible (wrapper enforces requirements first)
   - No permission broadening (only verified context used)
   - Existing checks remain in place as defense-in-depth
   - Audit trail preserved and enhanced

---

## D. D4 Implementation Approach

### Step 1: Wrap handler in withCanonicalEnforcement

```typescript
// Before
export const POST = withEnforcementFull(async (request: NextRequest) => {
  // existing logic
});

// After
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // existing logic
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITY] }
);
```

### Step 2: Keep existing policy/role checks

```typescript
// Keep exactly as-is in handler
const role = await resolveServerRole();
if (!role) throw new UnauthorizedError("Unauthorized");
if (!canView(role)) throw new ForbiddenError("Insufficient");
```

### Step 3: Replace unverified context with verified

```typescript
// Before
const workspace = request.headers.get("x-workspace-id"); // unverified
const actorId = session?.user.id; // from session

// After
const workspaceId = ctx.verifiedWorkspaceId; // verified by wrapper
const actorId = ctx.verifiedActorId; // verified by wrapper
```

### Step 4: Pass verified context to services

```typescript
// Before
await service(body, session.user.id, workspaceId);

// After
await service(body, ctx.verifiedActorId, ctx.verifiedWorkspaceId);
```

---

## E. Handler Implementation Order

**Phase 1 (Template):**
- diagnosis/route (POST) - Already done, use as reference
- entity (GET) - Already done, use as reference
- users/roles (GET) - Already done, use as reference
- users/memberships (GET) - Already done, use as reference

**Phase 2 (Can modernize immediately):**
- scenario (POST) - Simple role + canView
- value (GET) - Simple role + canView
- entity (POST) - Complete mixed handler to match GET
- evidence/validate (POST) - Role + internalOnly policy

**Phase 3 (Complex but safe):**
- override (POST) - Complex policy with 3 audit points
- diagnosis/archetype (POST) - Role + internalOnly
- users/roles (POST/DELETE) - Hierarchy + internalOnly
- users/memberships (POST/DELETE) - Hierarchy + internalOnly

---

## F. Verification Checklist for D4

Before implementation, verify D4 approach is safe:

- [ ] Existing role resolution logic can be called in handler (not wrapper)
- [ ] Existing policy checks can remain in handler
- [ ] Service signatures already accept needed parameters
- [ ] No new capabilities needed
- [ ] No role mapping changes needed
- [ ] No entitlement changes needed
- [ ] No business logic changes needed
- [ ] Audit trails can be preserved
- [ ] Workspace context available in wrapper
- [ ] Actor context available in wrapper

**Verification Result:** ✓ ALL CHECKS PASS - D4 is SAFE for all 8 handlers

---

**Status: ✓ DESIGN OPTIONS EVALUATED - D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK SELECTED**
