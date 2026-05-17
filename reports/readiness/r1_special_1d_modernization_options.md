# R1-SPECIAL-1-D: Modernization Approach Evaluation

**Date:** 2026-05-17  
**Phase:** R1-SPECIAL-1-D Design Analysis (Audit Only - No Code Changes)  
**Status:** EVALUATING MODERNIZATION PATTERNS

---

## A. Modernization Paths Identified

Based on the LANE_D handler audit, four distinct modernization approaches are needed:

### Path 1: Canonical-Only (Simplest - 2 handlers)

**Applicable to:** diagnosis/route (GET, ready to verify), entity (GET - existing model)

**Pattern:**
```typescript
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    // Direct context use, no custom auth logic
    return await service(workspaceId);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITY] }
);
```

**Advantages:**
- Simplest pattern (no custom logic needed)
- Full workspace isolation via wrapper
- Verified actor identity throughout
- Audit trail automatic

**Requirements:**
- Define required capabilities in requireCapabilities array
- No custom access control functions
- Direct service calls using verifiedWorkspaceId

**Handlers:** entity POST (once modernized following GET pattern)

---

### Path 2: Custom Role Resolution Mapping (4 handlers)

**Applicable to:** scenario, value, override, entity POST (before modernization)

**Pattern:**
```typescript
// Option A: Replace resolveServerRole() with capability checks
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // No custom resolveServerRole() call needed
    // Capability already verified by wrapper
    return await runScenario({ ctx });
  },
  { requireWorkspace: true, requireCapabilities: [SCENARIO_RUN] }
);

// Option B: Keep resolveServerRole() but express result in context
// (only if role resolution cannot be expressed as capabilities)
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const role = await resolveServerRole(ctx.verifiedActorId); // requires service changes
    // Continue using role...
  },
  { requireWorkspace: true }
);
```

**Design Questions:**
1. **What does resolveServerRole() actually do?**
   - Does it map actor identity to a role?
   - Does it read from a role assignment service?
   - Can this be expressed as a set of capabilities?

2. **How do canView/canEdit map to capabilities?**
   - scenario: canView() → SCENARIO_VIEW capability?
   - value: canView() → VALUE_VIEW capability?
   - override: canEdit() → OPERATOR_OVERRIDE capability?

3. **Is role resolution actor-specific or workspace-specific?**
   - Actor's global role (e.g., "admin")?
   - Actor's workspace-specific role (e.g., "manager in workspace X")?
   - This affects whether it should be in verifiedCapabilities

**Decision Point:** If role resolution maps cleanly to capabilities (Option A), no service changes needed. If role needs to be preserved (Option B), requires role-assignment service signature changes (LANE_G blocker).

**Risk if deferred:** All 4 custom role resolution handlers cannot be modernized without understanding this mapping.

---

### Path 3: Custom Policy Wrapper (4 handlers)

**Applicable to:** evidence/validate, users/roles (POST/DELETE), users/memberships (POST/DELETE), diagnosis/archetype

**Pattern:**
```typescript
// Option A: Convert to capabilities and remove custom wrapper
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // wrapper verifies EVIDENCE_VALIDATE capability
    // no internalOnly check needed
    return await validateEvidence(ctx);
  },
  { 
    requireWorkspace: true, 
    requireCapabilities: [CAPABILITIES.EVIDENCE_VALIDATE]
  }
);

// Option B: Keep custom logic in handler, move to canonical wrapper
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // wrapper verifies basic auth
    // handler does custom "internalOnly" check
    if (!ctx.policy?.isInternal) {
      throw new ForbiddenError("Internal endpoint only");
    }
    return await validateEvidence(ctx);
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.EVIDENCE_VALIDATE] }
);
```

**Design Questions:**
1. **What does "internalOnly: true" mean semantically?**
   - Can be called only by internal actors (e.g., system, admin)?
   - Can be called only within workspace (not external APIs)?
   - Can be called only by certain roles?

2. **Is this a capability or a policy?**
   - If capability: Define INTERNAL_ACCESS capability and verify in wrapper
   - If policy: Define policy rule and keep in handler

3. **Does wrapper need to enforce this or handler?**
   - Wrapper enforcement: Fail early, cleaner
   - Handler enforcement: More flexible, better for edge cases

**Decision Point:** If "internalOnly" is just a capability check (can be expressed as INTERNAL_ENDPOINT or similar), use Option A. If it requires runtime checks, use Option B.

**Risk if deferred:** Cannot modernize 4 handlers without defining internalOnly semantics.

---

### Path 4: Hierarchy-Based Authorization (1 handler)

**Applicable to:** users/roles (POST/DELETE only)

**Pattern:**
```typescript
// Option A: Express hierarchy in capabilities
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Wrapper verifies ROLE_ASSIGN_PEER, ROLE_ASSIGN_SUPERIOR, or ROLE_ASSIGN_SUBORDINATE
    // Service receives capability context
    const actorLevel = getActorHierarchyLevel(ctx.verifiedCapabilities);
    return await assignRole(data, actorLevel, ctx);
  },
  { 
    requireWorkspace: true, 
    requireCapabilities: [CAPABILITIES.ROLE_ASSIGN] // or more specific
  }
);

// Option B: Keep getActorHierarchyLevel() but wrap in canonical context
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const role = await resolveServerRole(ctx.verifiedActorId);
    const actorLevel = getActorHierarchyLevel(role); // requires role resolution still
    return await assignRole(data, actorLevel, ctx);
  },
  { requireWorkspace: true }
);
```

**Design Questions:**
1. **How many hierarchy levels exist?**
   - If 2-3 levels: Can be expressed as separate capabilities (ASSIGN_PEER, ASSIGN_SUBORDINATE)
   - If many levels: May need structured capability data (ACTOR_HIERARCHY_LEVEL = 2)

2. **Is getActorHierarchyLevel() derived from role or from stored policy?**
   - If from role: Can be derived from verifiedCapabilities
   - If from policy: Need to pass policy or derived level in context

3. **Can we define separate capabilities per level?**
   - ROLE_ASSIGN_TO_PEER
   - ROLE_ASSIGN_TO_SUBORDINATE
   - etc.

**Decision Point:** If hierarchy levels can be expressed as separate capabilities, use Option A (clean). If complex hierarchy logic is needed, may require service changes or staying with custom logic (Option B).

**Risk if deferred:** Cannot modernize users/roles handlers without understanding hierarchy semantics.

---

### Path 5: Partial Modernization Completion (3 handlers)

**Applicable to:** entity (POST), users/roles (POST/DELETE), users/memberships (POST/DELETE)

**Pattern:**
```typescript
// Current state: GET is modernized, POST/DELETE are legacy
// Solution: Complete modernization by converting POST/DELETE

// GET (already modern):
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => { ... },
  { requireWorkspace: true }
);

// POST (legacy → modern):
export const POST = withEnforcementFull(async (request) => { // ← CHANGE TO
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => { ... }, // ← CHANGE FROM custom pattern
  { requireWorkspace: true, requireCapabilities: [CAPABILITY] }
);
```

**Advantage:** Consistent handler patterns - GET and POST use same wrapper

**Risk:** May reveal inconsistencies in authorization logic between GET and POST

---

## B. Blocking Dependencies

These items must be resolved BEFORE implementation can proceed:

### Blocker 1: Role Resolution Semantics
**Status:** UNDEFINED  
**Impact:** Blocks scenario, value, override, entity (4 handlers)  
**Question:** What is `resolveServerRole()` and how does it map to capabilities?

**Options:**
1. Audit resolveServerRole() service to understand semantics
2. Check if canView/canEdit functions already do the mapping
3. Determine if role is actor-global or workspace-scoped

---

### Blocker 2: "InternalOnly" Flag Semantics
**Status:** UNDEFINED  
**Impact:** Blocks evidence/validate, diagnosis/archetype, users/roles, users/memberships (4 handlers)  
**Question:** What does "internalOnly: true/false" mean in context?

**Options:**
1. Search codebase for all uses of internalOnly
2. Check if there are role/capability definitions that map to it
3. Determine if it's a policy rule or a capability

---

### Blocker 3: Hierarchy-Based Authorization Model
**Status:** UNDEFINED  
**Impact:** Blocks users/roles (1 handler, but critical for role management)  
**Question:** How are hierarchy levels defined and stored?

**Options:**
1. Audit getActorHierarchyLevel() implementation
2. Check role-assignment service for hierarchy schema
3. Determine if hierarchy is stored in actor properties or policy

---

### Blocker 4: Workspace Scoping for Non-Scoped Handlers
**Status:** UNDEFINED  
**Impact:** scenario, value, override may be system-level  
**Question:** Should these handlers enforce workspace isolation?

**Options:**
1. Determine if scenario/value/override are workspace-specific or system-level
2. If workspace-specific: Need to add workspace context to service signatures
3. If system-level: Workspace enforcement may not apply

---

## C. Service Change Assessment

**Question:** Do any handlers require service signature changes?

### Services to audit:
- `resolveServerRole()` - Does it need to accept CanonicalAuthContext?
- `runScenario()` - Does it need workspace context?
- `calculateValue()` - Does it need workspace context?
- `addOverride()`, `applyOverride()` - Do they need workspace context?
- `validateEvidence()` - Already receives workspaceId?
- `assignRole()`, `revokeRole()` - Do they need hierarchy context?
- `addMember()`, `removeMember()` - Do they need engagement context?

**Current Assumption:** No service signature changes needed (handlers pass context, services use it)

**Risk:** If handlers require passing new context to services, need LANE_G service audit

---

## D. Next Steps for Audit

**Phase D (Capability & Role Definition):**
- Define what capabilities are needed for each custom access control function
- Define what "internalOnly" means and how to express it in capabilities
- Define hierarchy levels and how to express them

**Phase E (Service Analysis):**
- Audit resolveServerRole(), getActorHierarchyLevel(), canView(), canEdit() functions
- Verify service signatures can accept new context without changes

**Phase F (Modernization Planning):**
- Create concrete modernization plan for each handler
- Identify which path (1-5) applies to each handler
- Determine implementation order and dependencies

**Phase G (Final Decision):**
- Recommend which handlers can be safely modernized now
- Recommend which handlers need design audit before implementation
- Recommend any deferred-to-later-phase handlers

---

**Status: MODERNIZATION APPROACH EVALUATION COMPLETE - BLOCKING ITEMS IDENTIFIED**
