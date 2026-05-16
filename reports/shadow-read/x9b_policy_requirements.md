# X9B: Canonical Policy Requirements

**Phase:** X9B (Policy Context Canonical Design)  
**Date:** 2026-05-15  
**Status:** REQUIREMENTS DEFINITION

---

## Policy Data Classification

### MUST Be Canonical (Enforcement-Critical)

These fields/decisions MUST be part of CanonicalAuthContext or verifiable within wrapper:

1. **Verified Actor ID**
   - Current state: `ctx.verifiedActorId` ✓ (already canonical)
   - Requirement: Actor identity is immutable after auth
   - Why critical: All authorization depends on knowing who is acting

2. **Verified Workspace ID**
   - Current state: `ctx.verifiedWorkspaceId` ✓ (already canonical)
   - Requirement: Workspace identity is immutable after auth
   - Why critical: Tenant isolation boundary - prevents cross-workspace access

3. **Verified Capabilities**
   - Current state: `ctx.verifiedCapabilities` ✓ (already canonical)
   - Requirement: Computed once at auth time, immutable thereafter
   - Why critical: All capability-based access control depends on this set
   - Note: Computed from policy.roles during auth, but not stored as full policy

4. **Verified Session Snapshot**
   - Current state: `ctx.verifiedSessionSnapshot` ✓ (already canonical)
   - Requirement: Immutable point-in-time record of session
   - Why critical: Audit trail and idempotency verification

### SHOULD Be Canonical (Enforcement-Important)

These are necessary for safe authorization decisions:

1. **Internal Access Status**
   - Current state: Computed as `ctx.policy ? hasInternalAccess(ctx.policy) : false`
   - Requirement: Needs to be deterministic and immutable per request
   - Why important: Controls visibility filtering (internal vs. client-visible records)
   - Risk if NOT canonical: Routes could fabricate or services could misapply internal access
   - Recommendation: Compute during auth (like verifiedCapabilities), store as boolean flag

2. **Workspace Membership Verification**
   - Current state: Checked in services, not in wrapper
   - Requirement: Workspace membership must be validated in wrapper, not delegated to services
   - Why important: Tenant isolation - must prevent service from being called with invalid workspace
   - Risk if NOT canonical: Services could be tricked into cross-workspace operations
   - Recommendation: Wrapper must validate membership before handler execution

3. **Role/Tier Information (for observability)**
   - Current state: Available via `ctx.policy ? highestRole(ctx.policy) : null`
   - Requirement: Should be safe to compute on-demand or store as immutable
   - Why important: Response fields, audit logging, observability
   - Risk if NOT canonical: None (observability-only, not enforcement)
   - Recommendation: Can remain optional, computed from policy, or stored as string

### MUST NOT Be Canonical (Too Volatile/Service-Specific)

These should NOT be in CanonicalAuthContext because they can change during request:

1. **Full PolicyContext Object**
   - Why not: Policy can change based on workspace/engagement context
   - Why problematic: Services might make different decisions based on where they're called
   - Solution: Compute specific fields (internal access, role) and pass those

2. **Capability Grants (raw from policy)**
   - Why not: Should be computed once at wrapper, not referenced directly
   - Why problematic: Could bypass capability check by looking at policy instead of verifiedCapabilities
   - Solution: Use ctx.verifiedCapabilities only, never raw policy.roles

3. **Dynamic Policy Overrides**
   - Why not: Admin escalation, special grants, temp access
   - Why problematic: Could be used to bypass checks if accessible to services
   - Solution: Compute during auth, add to verifiedCapabilities, don't expose raw override info

4. **Engagement Membership Details**
   - Why not: Can vary per engagement
   - Why problematic: Services might make different authorization decisions
   - Solution: Pass specific context (engagement ID, role in engagement) when needed

### ROUTE-LEVEL ONLY (Never Service-Level)

These should be visible to routes but not passed to services:

1. **Request-Specific Context**
   - `request?: NextRequest`
   - `correlationId?: string`
   - `requestId?: string`
   - Why: Services don't need request details, only business context

2. **Optional Policy Fallback**
   - `policy?: PolicyContext` (optional)
   - Why: Routes use for observability/visibility decisions
   - Services: Should NOT receive, only computed results (hasInternalAccess boolean)

3. **Execution Trace Information**
   - `traceId?: string`
   - `executionTrace?: Readonly<any>`
   - Why: Logging/debugging, not authorization

---

## Enforcement-Critical Guarantees

### Internal Access Status

**Requirement 1: Deterministic**
- Must be same for entire request lifecycle
- Cannot change based on database queries or service decisions
- Must be computed once at auth time

**Requirement 2: Cannot Be Fabricated**
- Routes cannot set `ctx.internalAccess = true`
- Services cannot override based on engagement context
- Only wrapper can determine this

**Requirement 3: Fail-Closed**
- If policy is missing: default to `false` (no internal access)
- If policy is stale: default to `false` (no internal access)
- Never assume internal access if not verified

**Example Safe Pattern:**
```typescript
// In wrapper (during auth):
const internalAccess = policy ? hasInternalAccess(policy) : false;
ctx.internalAccess = internalAccess; // Immutable

// In route:
const result = await getEngagementById(
  engagementId, 
  ctx.verifiedWorkspaceId,
  ctx.internalAccess  // Pass boolean, not policy
);

// In service:
function getEngagementById(id, workspaceId, hasInternalAccess) {
  const filter = hasInternalAccess 
    ? { visibility: { in: ["internal", "client_visible"] } }
    : { visibility: "client_visible" };
  // ... query with filter
}
```

### Workspace Membership

**Requirement 1: Validated in Wrapper**
- Wrapper must confirm: actor is member of verifiedWorkspaceId
- Must happen before handler execution
- If not a member: 403 Forbidden before handler runs

**Requirement 2: Cannot Be Bypassed**
- Services cannot assume membership without validation
- Cross-workspace operations must be explicit (error, not silent scope-narrowing)
- Workspace ID from header must match workspace being accessed

**Requirement 3: Fail-Closed**
- If membership cannot be verified: return 403 (not 500, not proceed)
- If workspace context is missing: return 403 (not assume it)

### Capability-Based Access

**Requirement 1: Computed Once**
- `verifiedCapabilities` computed from policy during auth
- Never recomputed or modified per request
- Never computed by services

**Requirement 2: Never Fabricated**
- Routes cannot add capabilities: `ctx.verifiedCapabilities.add(...)`
- Services cannot check raw policy.roles (use wrapper-provided capabilities)
- Only wrapper can grant capabilities

**Requirement 3: Scoped Capabilities**
- Capabilities can be scoped (e.g., engagement-specific role)
- When calling service with engagement context, pass engagement ID
- Service checks `hasCapability(capability, {type: "engagement", id: engagementId})`
- Don't pass full policy to service

---

## What Must Never Happen

### ✗ NEVER: Service Gets Full PolicyContext
```typescript
// WRONG - Services should never see raw policy
async function updateEngagement(input, authContext) {
  const policy = authContext.policy; // ❌ DO NOT DO THIS
  if (policy.roles.some(r => !isClientRole(r))) { ... } // ❌ Service inferring internal access
}
```

**Why:** Services could make different decisions based on engagement context, bypassing wrapper checks.

### ✗ NEVER: Route Fabricates Policy
```typescript
// WRONG - Routes should never construct policy
const ctx = {
  verifiedActorId: userId,
  policy: { // ❌ DO NOT CONSTRUCT
    userId,
    roles: [{ role: "internal_admin" }]
  }
};
```

**Why:** Defeats entire wrapper authorization logic.

### ✗ NEVER: Services Check Workspace Membership Independently
```typescript
// WRONG - Services should assume wrapper validated workspace
async function getEngagement(id, workspaceId, policy) {
  // ❌ DO NOT CHECK if user is member of workspaceId
  const isMember = await db.workspace.findUnique({
    where: { id: workspaceId, members: { some: { userId: policy.userId } } }
  });
  if (!isMember) throw new Error("Not a member");
}
```

**Why:** Wrapper is responsible for workspace validation, not services. If service is called with workspaceId, it's already validated.

### ✗ NEVER: Capability Checks Bypass VerifiedCapabilities
```typescript
// WRONG - Services should use verifiedCapabilities only
async function createFinding(input, authContext) {
  const caps = extractCapabilities(authContext.policy); // ❌ WRONG
  if (!caps.includes("finding:create")) throw Error("Forbidden");
}
```

**Why:** Capabilities should be pre-computed by wrapper, services use verifiedCapabilities.

### ✗ NEVER: Defensive Policy Checks in Services
```typescript
// WRONG - Services should not have fallback logic
async function listEngagements(workspaceId, policy) {
  const showInternal = policy ? hasInternalAccess(policy) : false; // ❌ WRONG
}
```

**Why:** Policy presence should be guaranteed by wrapper. Defensive logic means policy isn't truly canonical.

---

## Required Wrapper Behavior

When route calls `withCanonicalEnforcement`:

1. **Fetch auth data:**
   - Get session/user info
   - Get policy context (roles, memberships)

2. **Verify workspace membership:**
   - Check: user is member of `x-workspace-id` header
   - If not: return 403 Forbidden (before handler executes)

3. **Compute immutable values:**
   - Compute `verifiedCapabilities` from policy.roles
   - Compute `internalAccess` from policy (or false if no policy)
   - Create session snapshot

4. **Pass to handler:**
   - Handler receives `ctx: CanonicalAuthContext` with all verified values
   - Handler CANNOT access raw policy
   - Handler CAN access computed values (internalAccess, verifiedCapabilities)

5. **Services receive only what they need:**
   - `authContext.verifiedActorId` (who is acting)
   - `authContext.verifiedCapabilities` (what they can do)
   - Optional boolean flags (hasInternalAccess)
   - Never receive: full PolicyContext

---

## Internal Access Canonicalization Options

### Option 1: Add Boolean Field to CanonicalAuthContext
```typescript
interface CanonicalAuthContext {
  // ... existing fields
  verifiedInternalAccess?: boolean; // Computed at auth time
}
```
- Pros: Simple, immutable, wrapper-guaranteed
- Cons: Adds field to context
- Risk: Routes might still check policy directly instead of using flag

### Option 2: Keep as Optional Policy, Routes Handle Fallback
```typescript
// Current pattern - acceptable if fallback is standard
const internalAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
```
- Pros: Minimal context changes
- Cons: Fallback logic scattered across routes
- Risk: Routes might not implement fallback correctly

### Option 3: Policy is Required in CanonicalAuthContext
```typescript
interface CanonicalAuthContext {
  policy: PolicyContext; // Not optional
  // ...
}
```
- Pros: Services can rely on policy existence
- Cons: Must populate policy for all contexts (webhooks, background jobs)
- Risk: Might overexpose policy to services

---

## Recommended Canonical Policy Model

**CanonicalAuthContext Should Include:**

1. ✓ `verifiedActorId` - Already present
2. ✓ `verifiedWorkspaceId` - Already present
3. ✓ `verifiedCapabilities` - Already present, computed from policy
4. ✓ `policy?: PolicyContext` - Already present, optional fallback OK for routes
5. **+ ADD:** `verifiedInternalAccess?: boolean` - Computed at auth time

**CanonicalAuthContext Should NOT Include:**
- Dynamic capabilities (escalations, temp grants) - should be in verifiedCapabilities
- Engagement-specific memberships - should be passed as parameters when needed
- Workspace membership list - already verified in wrapper
- Request-specific policy overrides - should be in verifiedCapabilities or audit log

**Services Should Receive:**
- `verifiedActorId` (always)
- `verifiedWorkspaceId` (always)
- `verifiedCapabilities` (always)
- `verifiedInternalAccess` (if needed for filtering)
- NEVER: `policy` (full context)

**Routes Can Access:**
- All canonical fields
- `ctx.policy` (optional, for observability/detailed role info)
- Should use `ctx.verifiedInternalAccess` for enforcement
- Should use `ctx.verifiedCapabilities` for capability checks

---

## Fail-Closed Behavior

### When Policy is Missing
- Wrapper must provide policy from auth system
- If auth system returns no policy: treat as unprivileged (no special grants)
- verifiedCapabilities computed from roles (usually empty for no-policy case)
- verifiedInternalAccess = false

### When Policy is Stale
- Wrapper fetches fresh policy per request (not cached across requests)
- If fetch fails: return 500, don't proceed with stale policy
- Never proceed with cached policy from earlier request

### When Workspace Membership Cannot Be Verified
- Wrapper must confirm membership before handler runs
- If membership check fails: return 403 immediately
- Services MUST assume membership is already validated

### When Capability Check Fails
- Wrapper enforces if route specifies `requireCapabilities: [...]`
- Handler never reaches if capability is missing
- Services should NOT do secondary capability checks (trust wrapper)

---

## Summary of Requirements

| Requirement | Status | Implementation |
|-------------|--------|-----------------|
| Actor ID is canonical | ✓ DONE | verifiedActorId |
| Workspace ID is canonical | ✓ DONE | verifiedWorkspaceId |
| Capabilities are canonical | ✓ DONE | verifiedCapabilities |
| Internal access is canonical | ⚠ PARTIAL | Optional policy + fallback → should add verifiedInternalAccess |
| Workspace membership validated | ⚠ PARTIAL | Should be in wrapper, not deferred |
| Policy is immutable per request | ✓ OK | Wrapper computes once |
| Services never get raw policy | ⚠ PARTIAL | Services receive policy but shouldn't use it directly |
| Routes can use policy for observability | ✓ OK | Optional ctx.policy allowed |
| Capability fabrication prevented | ✓ DONE | verifiedCapabilities is wrapper-computed |
| Fail-closed behavior enforced | ✓ OK | Default to false/403 for missing data |

---

**Status:** ✓ Policy Requirements Definition Complete

Next: Design Options (Section C)
