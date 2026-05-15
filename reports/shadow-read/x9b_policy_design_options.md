# X9B: Policy Design Options Analysis

**Phase:** X9B (Policy Context Canonical Design)  
**Date:** 2026-05-15  
**Status:** DESIGN OPTIONS EVALUATION

---

## Overview

Five design options evaluated for integrating PolicyContext into canonical auth:

1. **Option A:** Add policy fields directly to CanonicalAuthContext
2. **Option B:** Create CanonicalPolicyContext nested inside CanonicalAuthContext
3. **Option C:** Create separate RouteCanonicalAuthContext and ServiceCanonicalAuthContext
4. **Option D:** Create withCanonicalPolicyEnforcement wrapper layered on withCanonicalEnforcement
5. **Option E:** Keep policy outside canonical auth, migrate policy checks to services

---

## Option A: Add Policy Fields Directly to CanonicalAuthContext

**Design:**
```typescript
interface CanonicalAuthContext {
  // Existing
  verifiedActorId: string;
  verifiedWorkspaceId: string;
  verifiedCapabilities: Set<string>;
  verifiedSessionSnapshot: {...};
  
  // Added for policy
  verifiedInternalAccess?: boolean;
  policy?: PolicyContext;
  userId?: string; // Convenience copy of policy.userId
}
```

**How Routes Use It:**
```typescript
export const GET = withCanonicalEnforcement(async (ctx) => {
  // Direct access to verified values
  const internalAccess = ctx.verifiedInternalAccess ?? false;
  const result = await getEngagementById(id, ctx.verifiedWorkspaceId, internalAccess);
  return result;
});
```

**How Services Use It:**
```typescript
async function getEngagementById(id, workspaceId, hasInternalAccess) {
  // Services receive computed boolean, not full policy
  const filter = hasInternalAccess ? {...} : {...};
}
```

### Evaluation

**Security Impact:** ✓ SAFE
- Policy fields are optional, defensive fallback OK
- Wrapper computes verifiedInternalAccess before handler
- Services don't receive raw policy
- Capability fabrication prevented (verifiedCapabilities computed once)

**Tenant Isolation Impact:** ✓ GOOD
- verifiedWorkspaceId is canonical and required
- verifiedInternalAccess isolated to canonical context
- Services only receive what they need

**Service Boundary Impact:** ✓ CLEAN
- Services receive booleans, not full policy context
- Clear contract: service doesn't know about policy details
- Services can't infer or override authorization

**Scanner Impact:** ✓ MINIMAL
- Shadow read scanner sees `ctx.policy` (optional) - acceptable
- Shadow read scanner sees `ctx.verifiedInternalAccess` (computed) - not a violation
- Should reduce violations from routes using `ctx.policy ? ... : false` pattern

**Migration Complexity:** ⭐⭐ SIMPLE
- Add 2-3 fields to CanonicalAuthContext interface
- Update wrapper to compute `verifiedInternalAccess`
- Routes don't change (still use `ctx.policy ? hasInternalAccess : false`)
- Services don't change (still receive booleans)
- Minimal code impact

**Test Burden:** ⭐ LIGHT
- Test that verifiedInternalAccess is computed correctly
- Test fallback behavior when policy is missing
- Existing route/service tests still pass

**Risk of Fake Policy:** ✓ LOW
- Routes receive immutable context from wrapper
- Cannot add fields to context
- Wrapper is only source of truth

**Risk of Permission Fabrication:** ✓ NONE
- verifiedCapabilities and verifiedInternalAccess computed by wrapper
- Services only receive boolean flags or verified capabilities
- No way to fabricate or escalate

**Compatibility with Existing Handlers:** ✓ EXCELLENT
- No breaking changes
- Existing pattern `ctx.policy ? hasInternalAccess(ctx.policy) : false` still works
- New code can use `ctx.verifiedInternalAccess` directly

**Compatibility with System Contexts:** ✓ GOOD
- Webhooks/background jobs can omit policy (verifiedInternalAccess defaults to false)
- Don't need to populate fake policy context
- Fallback behavior is safe

**Expected Violation Reduction:** 12-15 violations
- Routes currently using defensive policy checks (3-4 handlers)
- Shadow read scanner sees `ctx.policy` as acceptable optional field
- Enables service context refactoring (Lane 9C)

### Risks & Mitigations

**Risk:** Routes still access `ctx.policy` directly  
**Mitigation:** Add ESLint rule to prefer `ctx.verifiedInternalAccess` over `ctx.policy ? hasInternalAccess : false`

**Risk:** Services might expect policy to always be present  
**Mitigation:** Services always receive computed booleans, never receive policy context

**Risk:** New code might pass policy to service  
**Mitigation:** Type the service interface to only accept booleans/strings, not PolicyContext

---

## Option B: Nested CanonicalPolicyContext

**Design:**
```typescript
interface CanonicalPolicyContext {
  verifiedInternalAccess: boolean;
  verifiedHighestRole: RoleName | null;
  verifiedCapabilityOverrides?: string[];
}

interface CanonicalAuthContext {
  // Existing
  verifiedActorId: string;
  verifiedWorkspaceId: string;
  verifiedCapabilities: Set<string>;
  verifiedSessionSnapshot: {...};
  
  // New
  policy?: {
    context: CanonicalPolicyContext;
    raw?: PolicyContext; // Optional raw for observability
  };
}
```

**How Routes Use It:**
```typescript
const internalAccess = ctx.policy?.context?.verifiedInternalAccess ?? false;
const role = ctx.policy?.context?.verifiedHighestRole;
const result = await getEngagementById(id, ctx.verifiedWorkspaceId, internalAccess);
```

### Evaluation

**Security Impact:** ✓ SAFE
- Canonical policy context is clearly separated from raw
- verifiedInternalAccess is nested, still immutable

**Tenant Isolation Impact:** ✓ GOOD
- Clear structure separates canonical from optional

**Service Boundary Impact:** ⚠ UNCLEAR
- Services would access `ctx.policy?.context?.verifiedInternalAccess`
- More nesting = more opportunity for misuse

**Scanner Impact:** ⚠ INCREASED
- Shadow read sees `ctx.policy.context` (more violation categories)
- More complex import/access patterns
- Higher scanner violation count

**Migration Complexity:** ⭐⭐⭐ COMPLEX
- Requires interface restructuring
- All existing `ctx.policy ? hasInternalAccess : false` patterns need updating
- Nested access patterns are harder to reason about
- More error-prone for future developers

**Test Burden:** ⭐⭐ MODERATE
- More test cases for nested structure
- Need tests for both `.context` and `.raw` access

**Risk of Fake Policy:** ✓ SAFE
- Nested structure makes it clear what's canonical

**Risk of Permission Fabrication:** ✓ SAFE
- Same as Option A

**Compatibility with Existing Handlers:** ✗ BREAKING
- Requires updating all `ctx.policy` access patterns
- More error-prone than Option A

**Compatibility with System Contexts:** ⚠ AWKWARD
- Need to populate nested structure even if empty
- More boilerplate for optional contexts

**Expected Violation Reduction:** 12-15 violations (same as A)
- No better reduction than Option A
- Higher migration cost

### Risks & Mitigations

**Risk:** Nested structure is harder to understand  
**Mitigation:** Very clear documentation and linting

**Risk:** More error-prone access patterns  
**Mitigation:** Type guards and strict linting

---

## Option C: Separate Route and Service AuthContext Types

**Design:**
```typescript
interface RouteCanonicalAuthContext {
  verifiedActorId: string;
  verifiedWorkspaceId: string;
  verifiedCapabilities: Set<string>;
  policy?: PolicyContext; // Routes can see raw policy
  request?: NextRequest;
  correlationId?: string;
}

interface ServiceCanonicalAuthContext {
  verifiedActorId: string;
  verifiedWorkspaceId: string;
  verifiedCapabilities: Set<string>;
  verifiedInternalAccess: boolean;
  // NO policy field - services don't get it
}

export type CanonicalAuthContext = RouteCanonicalAuthContext | ServiceCanonicalAuthContext;
```

**How Routes Use It:**
```typescript
export const GET = withCanonicalEnforcement(async (ctx: RouteCanonicalAuthContext) => {
  const internalAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
  return await getEngagementById(id, ctx.verifiedWorkspaceId, internalAccess);
});
```

**How Services Use It:**
```typescript
async function getEngagementById(
  id: string,
  workspaceId: string,
  authContext: ServiceCanonicalAuthContext
) {
  const filter = authContext.verifiedInternalAccess ? {...} : {...};
}
```

### Evaluation

**Security Impact:** ✓✓ EXCELLENT
- Services explicitly cannot access policy
- Type system enforces boundary
- Prevents policy from being passed to services

**Tenant Isolation Impact:** ✓✓ EXCELLENT
- Clear separation of concerns
- Service type cannot be misused in route context

**Service Boundary Impact:** ✓✓ EXCELLENT
- Type system enforces clean boundaries
- Services cannot access request/correlation context

**Scanner Impact:** ⚠ INCREASED
- Shadow read sees different context types per layer
- More complex import patterns
- May increase violation count due to type changes

**Migration Complexity:** ⭐⭐⭐ COMPLEX
- Must update service function signatures
- Routes use `RouteCanonicalAuthContext`, services use `ServiceCanonicalAuthContext`
- All service calls need auth context parameter updates
- Large refactoring scope

**Test Burden:** ⭐⭐⭐ HEAVY
- Test type enforcement at boundaries
- Test that services cannot receive RouteContext
- Test all service function signatures
- Large number of tests to update

**Risk of Fake Policy:** ✓ EXTREMELY LOW
- Type system makes it impossible to pass fake context to service
- Compiler prevents misuse

**Risk of Permission Fabrication:** ✓ NONE
- Service type excludes dangerous fields
- Type system enforces at compile time

**Compatibility with Existing Handlers:** ✗ BREAKING
- All service functions need signature changes
- All route handlers need type annotation updates
- Very high refactoring effort

**Compatibility with System Contexts:** ⚠ AWKWARD
- Which context type for background jobs?
- Webhooks would use ServiceContext (no request)
- Might need third context type for system actors

**Expected Violation Reduction:** 18-20 violations
- Type system change might be seen as violation progress
- But migration effort is very high

### Risks & Mitigations

**Risk:** Large refactoring scope increases implementation risk  
**Mitigation:** Roll out in phases, update service layer first

**Risk:** Type system makes code harder to understand  
**Mitigation:** Clear naming (RouteCanonical vs ServiceCanonical) + documentation

**Risk:** Breaking change for all services  
**Mitigation:** Automated refactoring tools, careful testing

---

## Option D: Layered withCanonicalPolicyEnforcement Wrapper

**Design:**
```typescript
export type CanonicalPolicyHandler = (ctx: CanonicalAuthContext) => Promise<any>;

export function withCanonicalPolicyEnforcement(
  handler: CanonicalPolicyHandler,
  options?: {
    requireInternalAccess?: boolean;
    requirePolicyContext?: boolean;
  }
): RouteHandler {
  return async (request) => {
    // Call withCanonicalEnforcement first
    return withCanonicalEnforcement(async (ctx) => {
      // Then apply policy-specific checks
      if (options?.requireInternalAccess) {
        const internalAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
        if (!internalAccess) {
          return new NextResponse(
            JSON.stringify({ error: "Internal access required" }),
            { status: 403 }
          );
        }
      }
      
      // Then call handler
      return handler(ctx);
    })(request);
  };
}
```

**How Routes Use It:**
```typescript
export const GET = withCanonicalPolicyEnforcement(
  async (ctx) => {
    // Handler only runs if policy checks passed
    const internalAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
    return await getEngagementById(id, ctx.verifiedWorkspaceId, internalAccess);
  },
  { requireInternalAccess: true } // Optional: enforce internal-only
);
```

### Evaluation

**Security Impact:** ✓ SAFE
- Policy checks happen in wrapper before handler
- Handler is fail-closed

**Tenant Isolation Impact:** ✓ GOOD
- Policy wrapper is extra guard for policy-sensitive routes

**Service Boundary Impact:** ⚠ MIXED
- Wrapper handles policy checks, but services still exist
- Services need to be careful about policy usage

**Scanner Impact:** ⚠ INCREASED
- New wrapper type in imports
- More complex route patterns
- Violation count might increase

**Migration Complexity:** ⭐⭐⭐ COMPLEX
- Need to create new wrapper
- Routes need to change from `withCanonicalEnforcement` to `withCanonicalPolicyEnforcement`
- Option objects needed for each route
- More code paths to test

**Test Burden:** ⭐⭐⭐ HEAVY
- Test wrapper layering
- Test option combinations
- Test fail-closed behavior

**Risk of Fake Policy:** ✓ SAFE
- Wrapper is only source of policy checks

**Risk of Permission Fabrication:** ⚠ MEDIUM
- Layering adds complexity
- More opportunity for misconfiguration
- Service still gets policy context

**Compatibility with Existing Handlers:** ⚠ PARTIAL BREAKING
- Need to migrate from withCanonicalEnforcement to withCanonicalPolicyEnforcement
- New patterns required

**Compatibility with System Contexts:** ⚠ AWKWARD
- System actors don't use policy wrappers
- Need multiple wrapper variants

**Expected Violation Reduction:** 10-12 violations
- Wrapper change is architectural, not violation-reducing
- Doesn't actually remove policy usage, just organizes it

### Risks & Mitigations

**Risk:** Wrapper complexity increases code surface area  
**Mitigation:** Very clear documentation, example routes

**Risk:** Option objects could be misconfigured  
**Mitigation:** Type-safe options, linting rules

---

## Option E: Keep Policy Outside Canonical Auth, Migrate to Services

**Design:**
```typescript
interface CanonicalAuthContext {
  verifiedActorId: string;
  verifiedWorkspaceId: string;
  verifiedCapabilities: Set<string>;
  verifiedSessionSnapshot: {...};
  // NO policy field
}

// Policy fetching is service responsibility
async function getEngagementById(
  id: string,
  workspaceId: string,
  ctx: CanonicalAuthContext
) {
  // Service fetches policy if needed
  const policy = await getPolicyContext(ctx.verifiedActorId, workspaceId);
  const internalAccess = policy ? hasInternalAccess(policy) : false;
  
  const filter = internalAccess ? {...} : {...};
  // ... fetch with filter
}
```

### Evaluation

**Security Impact:** ✗ DANGEROUS
- Policy is not canonical - each service decides when to fetch
- Policy could be different at different points in request
- No guarantee of policy freshness

**Tenant Isolation Impact:** ✗ WEAK
- Policy not enforced at wrapper level
- Services responsible for policy checks
- Service might forget to check

**Service Boundary Impact:** ✗ BLURRED
- Services become responsible for auth decisions
- Services need auth logic
- Violates separation of concerns

**Scanner Impact:** ✓ POSSIBLY LOWER
- Removes policy from routes
- But increases policy checks in services
- Likely same or higher violation count

**Migration Complexity:** ⭐⭐⭐⭐ VERY COMPLEX
- Services need to fetch policy themselves
- Service functions need more parameters or context
- All service functions need refactoring
- Large change in service architecture

**Test Burden:** ⭐⭐⭐⭐ VERY HEAVY
- Each service needs policy fetch tests
- Mocking policy context in service tests
- All existing tests need updates

**Risk of Fake Policy:** ✗ VERY HIGH
- Services could fabricate policy
- Services could cache stale policy
- No wrapper guarantee of freshness

**Risk of Permission Fabrication:** ✗ VERY HIGH
- Services could grant permissions they shouldn't
- Services could escalate privileges
- Services could hide authorization failures

**Compatibility with Existing Handlers:** ✗ BREAKING
- All routes change from accessing ctx.policy to not having it
- All services need refactoring

**Compatibility with System Contexts:** ⚠ AWKWARD
- System actors need special policy fetching
- Webhooks need special handling

**Expected Violation Reduction:** ❌ NOT APPLICABLE
- Violations don't decrease
- Violations move to services
- Likely higher total violation count
- Fundamentally wrong approach

### Risks & Mitigations

**Risk:** Catastrophic security risk - should not be selected  
**Mitigation:** DO NOT SELECT THIS OPTION

---

## Comparison Matrix

| Factor | Option A | Option B | Option C | Option D | Option E |
|--------|----------|----------|----------|----------|----------|
| **Security** | ✓ Safe | ✓ Safe | ✓✓ Excellent | ✓ Safe | ✗ Dangerous |
| **Tenant Isolation** | ✓ Good | ✓ Good | ✓✓ Excellent | ✓ Good | ✗ Weak |
| **Service Boundary** | ✓ Clean | ⚠ Unclear | ✓✓ Excellent | ⚠ Mixed | ✗ Blurred |
| **Scanner Impact** | ✓ Minimal | ⚠ Increased | ⚠ Increased | ⚠ Increased | ⚠ Higher |
| **Migration Complexity** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Test Burden** | ⭐ Light | ⭐⭐ Moderate | ⭐⭐⭐⭐ Heavy | ⭐⭐⭐ Heavy | ⭐⭐⭐⭐ Very Heavy |
| **Fake Policy Risk** | ✓ Low | ✓ Low | ✓ Extremely Low | ✓ Safe | ✗ Very High |
| **Permission Fabrication** | ✓ None | ✓ None | ✓ None | ⚠ Medium | ✗ Very High |
| **Existing Compatibility** | ✓ Excellent | ✗ Breaking | ✗ Breaking | ⚠ Partial | ✗ Breaking |
| **System Context Compatibility** | ✓ Good | ⚠ Awkward | ⚠ Awkward | ⚠ Awkward | ⚠ Awkward |
| **Violation Reduction** | 12-15 | 12-15 | 18-20 | 10-12 | ❌ Wrong |
| **Implementation Risk** | 🟢 LOW | 🟡 MEDIUM | 🔴 HIGH | 🔴 HIGH | 🔴 CRITICAL |

---

## Summary

**RECOMMENDED:** Option A - Add Policy Fields Directly to CanonicalAuthContext

**Rationale:**
1. Best balance of security, simplicity, and compatibility
2. Minimal migration complexity (add 2-3 fields)
3. No breaking changes to routes or services
4. Clear fail-closed behavior
5. Type-safe computed values (verifiedInternalAccess)
6. Wrapper enforces policy once per request
7. Services receive only what they need (booleans, not full policy)

**Why Not Others:**
- Option B: More complexity with no security benefit
- Option C: Good security but massive refactoring (too much scope for design phase)
- Option D: Wrapper layering adds complexity without solving problem
- Option E: Violates security principles, extremely dangerous

---

**Status:** ✓ Design Options Analysis Complete

Recommended: **Option A**

Next: Design Decision & Implementation (Section D)
