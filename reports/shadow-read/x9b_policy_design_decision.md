# X9B: Policy Design Decision

**Phase:** X9B (Policy Context Canonical Design)  
**Date:** 2026-05-15  
**Status:** DECISION - OPTION A SELECTED

---

## Selected Design: Option A - Add Policy Fields Directly to CanonicalAuthContext

### Decision Rationale

**Why Option A Is Best:**

1. **Minimal Disruption**
   - Add 2-3 fields to existing interface
   - No breaking changes to routes or services
   - Existing patterns continue to work

2. **Security-Focused**
   - Wrapper computes verifiedInternalAccess once
   - Services receive boolean flags, not raw policy
   - Capability fabrication prevented
   - Fail-closed behavior when policy missing

3. **Service Boundary Clean**
   - Services don't see raw PolicyContext
   - Services get specific computed values (booleans)
   - Type system can enforce this with care

4. **Fastest Path to Implementation**
   - Design-approved immediately
   - Can implement in single phase
   - Tests are straightforward
   - No migration of service layer needed

5. **Preserves Current Safety**
   - Defensive `ctx.policy ? hasInternalAccess(ctx.policy) : false` pattern is OK
   - Routes already use safe pattern
   - Adding verifiedInternalAccess makes it explicit

### Why Alternatives Were Rejected

**Option B (Nested CanonicalPolicyContext):**
- ✗ More complexity with no security benefit
- ✗ Requires updating all route patterns
- ✗ Harder for developers to understand
- ✗ No better violation reduction

**Option C (Separate RouteCanonicalAuthContext / ServiceCanonicalAuthContext):**
- ✗ Massive refactoring scope
- ✗ All service functions need signature changes
- ✗ Too large for this design phase
- ✗ Type system benefit not worth the cost
- → Could be done in future phase if needed

**Option D (Layered withCanonicalPolicyEnforcement):**
- ✗ Wrapper complexity without solving problem
- ✗ More code paths to test and maintain
- ✗ Services still get policy context
- ✗ Doesn't prevent policy misuse in services

**Option E (Policy Outside Canonical Auth):**
- ✗ Catastrophically dangerous
- ✗ Services become responsible for auth
- ✗ No wrapper guarantee of freshness
- ✗ Easy to fabricate or forget policy checks
- → Explicitly rejected as security risk

---

## Canonical Policy Context Specification

### CanonicalAuthContext Interface (Updated)

```typescript
interface CanonicalAuthContext {
  // ALREADY CANONICAL - No changes
  verifiedActorId: string;
  verifiedActorType: "user" | "service";
  verifiedActor: AuthenticatedUser;
  verifiedWorkspaceId: string;
  verifiedCapabilities: Set<string>;
  traceId?: string;
  executionTrace?: Readonly<any>;
  verifiedSessionSnapshot: {
    snapshotId: string;
    snapshotTimestamp: Date;
    snapshotHash: string;
    actorId: string;
    workspaceId: string;
    capabilities: readonly string[];
  };
  correlationId?: string;
  requestId?: string;
  request?: NextRequest;
  session?: SessionInfo;

  // UPDATED - Adding computed internal access
  verifiedInternalAccess?: boolean; // Computed from policy at auth time

  // ALREADY PRESENT - No changes (remains optional)
  policy?: PolicyContext;
}
```

### Allowed Fields

**Routes CAN access:**
- ✓ `ctx.verifiedActorId` - Who is acting
- ✓ `ctx.verifiedWorkspaceId` - Which workspace
- ✓ `ctx.verifiedCapabilities` - What they can do
- ✓ `ctx.verifiedInternalAccess` - Internal vs. client access level
- ✓ `ctx.policy` (optional) - Raw policy for observability (internal checks, role info)
- ✓ `ctx.request` - Request object for route-specific needs
- ✓ `ctx.correlationId`, `ctx.requestId` - Tracing

**Services SHOULD NOT access:**
- ✗ `ctx.request` - Services don't need request object
- ✗ `ctx.policy` - Services should use computed flags
- ✗ `ctx.correlationId`, `ctx.requestId` - Services shouldn't need request context

**Services SHOULD access:**
- ✓ `ctx.verifiedActorId` - For audit logging, ownership checks
- ✓ `ctx.verifiedWorkspaceId` - For scope validation
- ✓ `ctx.verifiedCapabilities` - For capability-based checks
- ✓ `ctx.verifiedInternalAccess` - For visibility filtering

### Forbidden Patterns

**Services MUST NOT:**
- ✗ Access `ctx.policy` directly
- ✗ Call `hasInternalAccess(ctx.policy)` - should use `ctx.verifiedInternalAccess`
- ✗ Extract capabilities from `ctx.policy.roles` - should use `ctx.verifiedCapabilities`
- ✗ Make role-based decisions in services - use wrapper options or pass boolean flag
- ✗ Fetch fresh policy from database - wrapper provides it

**Routes MUST NOT:**
- ✗ Construct fake CanonicalAuthContext
- ✗ Add fields to context
- ✗ Modify ctx.verifiedCapabilities
- ✗ Call routes without going through withCanonicalEnforcement

---

## Wrapper Behavior Specification

### During Authentication Phase

When `withCanonicalEnforcement` processes a request:

1. **Extract Auth Data**
   ```typescript
   const session = await getSessionFact(request);
   const policy = await getPolicyContextFact(session.userId);
   ```

2. **Compute Verified Values**
   ```typescript
   const verifiedActorId = session.userId;
   const verifiedWorkspaceId = request.headers.get("x-workspace-id");
   const verifiedInternalAccess = policy 
     ? hasInternalAccess(policy) 
     : false;
   const verifiedCapabilities = new Set(
     getCapabilitiesForRole(policy?.roles)
   );
   ```

3. **Validate Workspace Membership** (if applicable)
   ```typescript
   if (options?.requireWorkspace) {
     const isMember = await validateWorkspaceMembership(
       verifiedActorId, 
       verifiedWorkspaceId
     );
     if (!isMember) {
       return new NextResponse({ error: "Not a member" }, { status: 403 });
     }
   }
   ```

4. **Check Required Capabilities** (if applicable)
   ```typescript
   if (options?.requireCapabilities?.length > 0) {
     const hasRequired = options.requireCapabilities.every(
       cap => verifiedCapabilities.has(cap)
     );
     if (!hasRequired) {
       return new NextResponse({ error: "Insufficient capabilities" }, { status: 403 });
     }
   }
   ```

5. **Build Context Object**
   ```typescript
   const ctx: CanonicalAuthContext = {
     verifiedActorId,
     verifiedActorType: "user",
     verifiedActor: session.user,
     verifiedWorkspaceId,
     verifiedCapabilities,
     verifiedInternalAccess,
     policy, // Optional, for routes that need it
     session,
     verifiedSessionSnapshot: {...},
     request,
     correlationId: request.headers.get("x-correlation-id"),
   };
   ```

6. **Call Handler** (only if all checks passed)
   ```typescript
   return await handler(ctx, params);
   ```

### Fail-Closed Guarantees

**If policy is missing:**
- `verifiedInternalAccess = false`
- `verifiedCapabilities = []` (empty set)
- Routes can still execute with no special access
- Services see no internal access, no special capabilities

**If workspace membership cannot be verified:**
- Return 403 Forbidden immediately
- Handler is never called
- Service is never called

**If capability is required but missing:**
- Return 403 Forbidden immediately
- Handler is never called
- Service is never called

**If policy is stale or invalid:**
- Wrapper refetches policy per request (no caching)
- If fetch fails: return 500, don't proceed
- Never proceed with cached/stale policy

---

## Migration Paths (Post-Design)

### Phase X9C-1: Wrapper Enhancement
- Add `verifiedInternalAccess` computation to wrapper
- Add `verifiedInternalAccess` field to CanonicalAuthContext
- No route or service changes yet

**Violation Reduction:** 0 (infrastructure change)

### Phase X9C-2: Route Cleanup
- Routes can optionally switch from `ctx.policy ? hasInternalAccess : false` to `ctx.verifiedInternalAccess`
- This is optional cleanup, not required
- ESLint rule can guide but not enforce

**Violation Reduction:** 0-2 (observability improvement)

### Phase X9C-3: Service Refactoring (Post-Design)
- Services can receive `hasInternalAccess` boolean parameter instead of full `ctx`
- Services never access `ctx.policy` directly
- This requires service signature changes but is safe

**Violation Reduction:** 6-8 (service auth violations)

---

## Test Requirements

### Unit Tests

**Wrapper Tests:**
- [ ] `verifiedInternalAccess` computed correctly when policy exists
- [ ] `verifiedInternalAccess` defaults to false when policy missing
- [ ] `verifiedInternalAccess` reflects hasInternalAccess() output
- [ ] Service context doesn't have request/correlationId
- [ ] Handler receives immutable context

**Route Tests:**
- [ ] Routes can access `ctx.verifiedInternalAccess`
- [ ] Routes can access `ctx.policy` (optional)
- [ ] Defensive pattern `ctx.policy ? hasInternalAccess : false` still works
- [ ] Routes cannot modify context

**Service Tests:**
- [ ] Services receive `verifiedInternalAccess` boolean
- [ ] Services don't receive `ctx.policy`
- [ ] Visibility filtering works with boolean flag
- [ ] Services don't attempt to extract policy fields

### Integration Tests

- [ ] Full request flow from wrapper to route to service
- [ ] Workspace membership validation works
- [ ] Capability validation works
- [ ] Visibility filtering based on internal access
- [ ] Fail-closed when policy missing
- [ ] No regressions in existing routes

### Scanner Tests

- [ ] Shadow read scanner accepts `ctx.verifiedInternalAccess` (not a violation)
- [ ] Shadow read scanner accepts `ctx.policy` (optional, defensive fallback OK)
- [ ] Scanner recognizes pattern: `ctx.policy ? hasInternalAccess : false`

---

## Rollback Plan

If design proves problematic during implementation:

**Option 1: Remove Added Fields** (Easiest)
- Remove `verifiedInternalAccess` field
- Routes continue using defensive pattern
- No code breaks, minimal impact

**Option 2: Revert to Option C** (If needed)
- Move to separate RouteCanonicalAuthContext / ServiceCanonicalAuthContext
- Larger refactoring but well-defined path
- Use if policy field leaking into services becomes problem

**Option 3: Pivot to Option D** (If needed)
- Add layered `withCanonicalPolicyEnforcement` wrapper
- More architectural but feasible

---

## Scanner Recognition

**Current Violations that Will Remain (Expected):**
- Routes: `ctx.policy ? hasInternalAccess(ctx.policy) : false` pattern (acceptable)
- Services: `requireCapabilityForService` calls (deferred to Lane 9C)
- Services: auth-guard imports (deferred to Lane 9C)

**New Violations that Should NOT Appear:**
- ✗ Routes passing `ctx.policy` to services
- ✗ Services calling `hasInternalAccess(ctx.policy)`
- ✗ Routes constructing fake context

**If They Do Appear:**
- Indicates pattern violation
- Needs code review and correction
- Not a design failure

---

## Expected Outcomes

### After Design Approval (This Phase)
- ✓ Clear specification of canonical policy
- ✓ CanonicalAuthContext interface understood
- ✓ Wrapper behavior documented
- ✓ Test requirements specified
- ✓ Migration path clear

### After Implementation (Phase X9C-1)
- ✓ Wrapper computes `verifiedInternalAccess`
- ✓ CanonicalAuthContext includes new field
- ✓ All tests passing
- ✓ No regression in routes/services

### After Route Cleanup (Phase X9C-2)
- ✓ Some routes use `ctx.verifiedInternalAccess` directly
- ✓ Defensive patterns optional but still supported
- ✓ 0-2 violation reduction (observability)

### After Service Refactoring (Phase X9C-3)
- ✓ Services don't access `ctx.policy`
- ✓ Services receive boolean flags
- ✓ 6-8 violation reduction (service auth)
- ✓ Clean service boundaries

### Total Expected Reduction
- **Design Phase (X9B):** Unblocks SERVICE_CANONICAL_CONTEXT refactoring
- **Implementation (X9C):** 12-15 violations reduced
- **Follow-up (X9D+):** Enables Lane 7 completion, Lane 9C/9D service refactoring

---

## Phases Unlocked by This Design

**Immediately Unblocked:**
- ✓ Lane 7 completion (GET handlers with policy context)
- ✓ SERVICE_CANONICAL_CONTEXT refactoring (services use verifiedInternalAccess)
- ✓ Route capability enforcement patterns (use verifiedCapabilities)

**Conditionally Unblocked:**
- ⚠ WORKSPACE_MEMBERSHIP canonicalization (next design phase)
- ⚠ ROLE_RESOLUTION design (next design phase)
- ⚠ Quarantined bridge removal (after all designs complete)

**Downstream Enabled:**
- → Lane 9C: Service auth refactoring
- → Lane 9D: Workspace enforcement
- → Lane 9E: Role-based auth
- → Lane 9F: Bridge removal and final cleanup

---

## Status

| Item | Status |
|------|--------|
| Design Selected | ✓ OPTION A |
| Rationale Complete | ✓ Yes |
| Specification Clear | ✓ Yes |
| Test Requirements | ✓ Defined |
| Migration Path | ✓ Clear |
| Rollback Plan | ✓ Ready |
| Phases Unlocked | ✓ Identified |

---

**Decision Status:** ✓ APPROVED

**Recommendation:** Proceed to X9C-1: Wrapper Enhancement

**Expected Implementation Timeline:** 1-2 days for wrapper + routes

**Next Phase:** X9B-Migration Plan (Section E)
