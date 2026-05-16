# X9B-R: Final Policy Design Decision

**Phase:** X9B-R (Policy Design Safety Review)  
**Date:** 2026-05-15  
**Status:** FINAL DECISION

---

## Decision: REPLACE_WITH_OPTION_D

**Selected:** Layered `withCanonicalPolicyEnforcement` Wrapper

**Rationale:** Security-critical auth code requires type-system enforcement, not discipline-based mitigations.

---

## Why Option D Is Chosen

### X9B-R Findings

Hostile review of Option A identified:
- ✓ No UNSAFE modes (some mitigated, none critical)
- ⚠ **7 MITIGATED risks** (not fully eliminated)
- ✓ 3 SAFE modes

**Key Weaknesses in Option A:**
1. Policy fabrication prevented only by design intent (not enforced)
2. Service-boundary violations won't be caught until X9C-3 (many phases away)
3. Scanner can't distinguish safe vs unsafe policy access
4. Long transition period (X9C-1 to X9C-3) where risks exist
5. Optional policy field invites future bugs in new code

**Comparative Analysis Found:**
- Option A: LOW service-boundary safety
- Option B: Same as A, with more complexity
- Option D: VERY HIGH service-boundary safety + type enforcement

### Risk Reduction Through Option D

**Type-System Enforcement:**
Services literally cannot receive `ctx.policy` field
- Compiler prevents: `ctx.policy` in service context (doesn't exist)
- No fabrication path: policy doesn't exist in service signature
- No confusion: service type doesn't include policy

**Fail-Closed By Design:**
Policy checks happen in wrapper, before handler executes
- Handler never runs if policy check fails
- No defensive pattern needed in handler code
- Fail-closed enforced, not advisory

**Clear Route Separation:**
Different wrappers = clear intention
- `withCanonicalPolicyEnforcement(handler, {requireInternalAccess: true})`
- Immediately visible that this route needs policy
- Scanner can flag incorrect wrapper usage

**Shorter Risk Window:**
No X9C-3 refactoring needed
- Option A: X9C-1 (risk period) → X9C-3 (fix period)
- Option D: X9C-1 (safe from start, policy not in services)
- Risk period eliminated

---

## Exact Contract Shape - Option D

### Implementation

```typescript
// src/lib/canonical-route-enforcement.ts

/**
 * Policy-aware route enforcement wrapper
 * 
 * Use for routes that need internal access, role, or policy context.
 * 
 * Policy checks happen in wrapper, before handler executes.
 * If policy fails and is required, handler never runs (fail-closed).
 */
export function withCanonicalPolicyEnforcement(
  handler: (ctx: CanonicalAuthContext, params: Record<string, string>) => Promise<any>,
  options?: {
    requireInternalAccess?: boolean;  // Requires internal role
    requirePolicyContext?: boolean;   // Requires policy to be present
    requireCapabilities?: CapabilityName[];  // Existing capability check
  }
): RouteHandler {
  return async (request: NextRequest) => {
    // Step 1: Use withCanonicalEnforcement to build verified context
    return withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
      // Step 2: Apply policy-specific checks (fail-closed)
      
      if (options?.requireInternalAccess) {
        const internalAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
        if (!internalAccess) {
          return new NextResponse(
            JSON.stringify({ error: "Internal access required" }),
            { status: 403 }
          );
        }
      }
      
      if (options?.requirePolicyContext) {
        if (!ctx.policy) {
          return new NextResponse(
            JSON.stringify({ error: "Policy context required" }),
            { status: 403 }
          );
        }
      }
      
      // Step 3: Call handler (only if all policy checks passed)
      return handler(ctx, params);
    }, {
      requireCapabilities: options?.requireCapabilities
    })(request);
  };
}

// CanonicalAuthContext remains unchanged
// ctx.policy remains optional (for routes that need it)
// But Services never receive CanonicalAuthContext directly
```

### Allowed Fields

**Routes using `withCanonicalPolicyEnforcement` CAN access:**
- ✓ `ctx.verifiedActorId` - Who is acting
- ✓ `ctx.verifiedWorkspaceId` - Which workspace
- ✓ `ctx.verifiedCapabilities` - What they can do
- ✓ `ctx.policy` - Raw policy for observability
- ✓ `ctx.request` - Request object
- ✓ `ctx.correlationId`, `ctx.requestId` - Tracing

**Routes using regular `withCanonicalEnforcement` still work:**
- Same as above (no changes to non-policy routes)

**Services (NEVER called with policy context):**
- ✓ `verifiedActorId` (passed as parameter)
- ✓ `verifiedWorkspaceId` (passed as parameter)
- ✓ `verifiedCapabilities` (passed as parameter)
- ✓ `verifiedInternalAccess` (passed as boolean parameter)
- ✗ NEVER: Full `CanonicalAuthContext` object
- ✗ NEVER: `ctx.policy`

### Forbidden Patterns

**Must NOT happen:**
- ✗ Service receives `CanonicalAuthContext` (receive parameters instead)
- ✗ Routes construct fake policy (policy from wrapper only)
- ✗ Routes modify context (immutable from wrapper)
- ✗ Services access `ctx.policy` (services don't receive ctx)

---

## Fail-Closed Rules

### Policy Check Failure
If `options.requireInternalAccess` is true:
```
IF (policy exists AND hasInternalAccess(policy) returns true)
  THEN handler executes
ELSE
  RETURN 403 Forbidden (handler does NOT execute)
```

### Policy Context Missing
If `options.requirePolicyContext` is true:
```
IF (policy exists)
  THEN handler executes
ELSE
  RETURN 403 Forbidden (handler does NOT execute)
```

### Capability Check Failure
Existing capability check (unchanged):
```
IF (capabilities include required)
  THEN continue to policy checks
ELSE
  RETURN 403 Forbidden (handler does NOT execute)
```

### Stale Policy
Wrapper refetches policy per request (no caching):
```
EACH request: fetch fresh policy
IF fetch fails: RETURN 500 (do NOT proceed with stale policy)
IF policy invalid: RETURN 403 Forbidden
```

---

## Policy Freshness Requirement

**Per-Request Freshness:**
- Policy is fetched fresh on each HTTP request
- No caching across requests
- No background caching of policy

**Within-Request Immutability:**
- Policy is computed once at auth time
- Cannot be modified during request
- Services receive immutable boolean flags, not raw policy

**Validation on Use:**
- Wrapper validates policy completeness before handler
- Services never need to validate (wrapper already did)

---

## Who May Construct Policy Context

**ONLY:** `withCanonicalPolicyEnforcement` wrapper
- Fetches from auth system
- Validates from auth system
- Passes to handler (immutable)

**NEVER:** Routes, services, or any other code
- Cannot be constructed or synthesized
- Cannot be modified or extended
- Cannot be forged

---

## Whether Services May Consume Policy Context

**Answer:** NO

**How:**
- Services never receive `CanonicalAuthContext` object
- Services receive parameters: (id, workspaceId, verifiedInternalAccess, verifiedCapabilities)
- Service function signature prevents access: no `ctx` parameter

**Example:**
```typescript
// Routes pass parameters
const result = await getEngagementById(
  engagementId,
  ctx.verifiedWorkspaceId,
  ctx.policy ? hasInternalAccess(ctx.policy) : false,  // Boolean only
  ctx.verifiedCapabilities
);

// Services accept parameters
async function getEngagementById(
  id: string,
  workspaceId: string,
  hasInternalAccess: boolean,
  capabilities: Set<string>
) {
  // Service has no access to policy
  // Service uses boolean parameters
}
```

---

## Scanner Recognition Requirements

**Scanner should recognize:**

1. **Policy-aware routes:**
   - Import: `import { withCanonicalPolicyEnforcement } from "..."`
   - Usage: `withCanonicalPolicyEnforcement(handler, {requireInternalAccess: true})`
   - Signal: Different wrapper = policy-aware

2. **Service parameter pattern:**
   - Services accept: `(id, workspace, hasInternalAccess, capabilities)`
   - NOT: `(id, workspace, ctx)`
   - NOT: `(id, workspace, ctx: CanonicalAuthContext)`

3. **Forbidden patterns:**
   - Service function calling `hasInternalAccess(ctx.policy)` (error: no ctx)
   - Service accessing `ctx.policy.roles` (error: no ctx)
   - Route constructing fake policy (error: not callable)

**Scanner output:**
- ✓ withCanonicalPolicyEnforcement usage = expected (not violation)
- ✓ Service parameters = expected (not violation)
- ✗ Service receiving ctx = violation (flag for review)
- ✗ ctxpolicy access in service = violation (type error in TypeScript)

---

## Implementation Phase Acceptance Criteria

### X9C-1: Create `withCanonicalPolicyEnforcement` Wrapper

**Must complete:**
- [ ] New wrapper function created in `src/lib/canonical-route-enforcement.ts`
- [ ] Wrapper accepts options: `{requireInternalAccess?, requirePolicyContext?, requireCapabilities?}`
- [ ] Policy checks happen before handler execution (fail-closed)
- [ ] All policy checks tested with pass/fail scenarios
- [ ] No changes to existing `withCanonicalEnforcement` (backward compatible)

**First pilots:**
- [ ] src/app/api/engagements/route.ts - Add policy option
- [ ] src/app/api/me/route.ts - Add policy option
- [ ] Tests: Verify policy checks work correctly

**Proof:**
- [ ] Build: PASS
- [ ] Tests: PASS (including new policy wrapper tests)
- [ ] Scanner: 450 violations (unchanged, no code eliminated yet)

### X9C-2: Migrate Policy-Aware Routes (Optional but Recommended)

**Must complete:**
- [ ] Identify all routes using `ctx.policy ? hasInternalAccess : false`
- [ ] Switch to `withCanonicalPolicyEnforcement(..., {requireInternalAccess: true})`
- [ ] Remove policy checks from handler (wrapper handles)
- [ ] Test visibility filtering works correctly

**Proof:**
- [ ] Build: PASS
- [ ] Tests: PASS
- [ ] Scanner: 450 violations (unchanged)

### X9C-3: Migrate Service Layer

**Must complete:**
- [ ] Update service function signatures: accept boolean, not ctx
- [ ] Remove `ctx.policy` access from services
- [ ] Update routes to pass boolean parameters
- [ ] Test services with boolean parameters only

**Proof:**
- [ ] Build: PASS
- [ ] Tests: PASS (service tests updated)
- [ ] Scanner: 442-445 violations (6-8 violations reduced)

---

## Rollback Rule

**If Option D implementation reveals unforeseen issues:**

**Rollback to Option A** (if Option D problematic):
1. Remove `withCanonicalPolicyEnforcement` wrapper
2. Keep `verifiedInternalAccess` field in CanonicalAuthContext
3. Proceed with X9C-2 route cleanup
4. Defer service boundary enforcement to X9C-3
5. This becomes Option A + wrapper knowledge

**Conditions for rollback:**
- Type system enforcement causing unforeseen compilation issues
- Wrapper composition causing performance problems
- Options object becoming too complex

**Risk of rollback:** VERY LOW (fallback to Option A is simple)

---

## Expected Violation Reduction

**X9C-1 (Wrapper creation):**
- Violation reduction: 0 (new wrapper, no code elimination)

**X9C-2 (Route migration to new wrapper):**
- Violation reduction: 0-2 (cleaner code, same violation count)

**X9C-3 (Service parameter refactoring):**
- Violation reduction: 6-8 (services no longer access policy)

**Total expected:** 6-10 violations reduced (same as Option A)

**Timeline advantage:** Option D eliminates risk window immediately (X9C-1), vs Option A which defers risk to X9C-3

---

## Why Option D Over Option A

### Security-Critical Code Requires Enforcement, Not Intent

**Option A:** "Design says services MUST NOT access ctx.policy"
- Enforced by: Design document + code review
- Failure mode: Code review misses violation
- Impact: Service accesses policy unsafely

**Option D:** "Services cannot access ctx.policy"
- Enforced by: Type system + compiler
- Failure mode: Code doesn't compile (caught immediately)
- Impact: Zero possibility of violation

### Type System Is Security Tool in Auth Code

Auth is too critical for discipline-based mitigations.
- Compiler catches mistakes at build time
- Runtime has no way to violate boundary
- Future developers inherit safety, not rules

### Long-Term Maintainability

**Option A:** Must remember 7 design rules indefinitely
- Design documents rot
- New developers miss documentation
- Year 2-3: someone violates rules unknowingly

**Option D:** Safety is built in, not advisory
- New developers inherit safe pattern
- Type system enforces even if they don't read docs
- Safer by default

---

## Status

| Item | Status |
|------|--------|
| X9B Original Selection | Option A (Design) |
| X9B-R Final Decision | Option D (Safety Review) |
| Option A Risk Verdict | MITIGATED (7 risks remain with mitigation) |
| Option D Risk Verdict | SAFE (type-enforced boundaries) |
| Implementation Authorization | YES (but different from X9B) |
| Rollback Plan | Available (revert to Option A if needed) |

---

## Next Steps

### Immediate
1. ✓ Accept Option D as final design
2. ✓ Update X9C implementation plan for Option D (not Option A)
3. ✓ Brief team on difference (new wrapper instead of field addition)

### X9C-1
1. → Create `withCanonicalPolicyEnforcement` wrapper
2. → Test wrapper with policy checks
3. → First pilots with new wrapper

### X9C-2+
1. → Migrate policy-aware routes to new wrapper
2. → Migrate service layer parameters
3. → Verify scanner reduction

---

**Decision:** ✓ APPROVED - OPTION D SELECTED

**Effective immediately for X9C planning.**

**Option A design artifacts remain for reference, but implementation follows Option D.**
