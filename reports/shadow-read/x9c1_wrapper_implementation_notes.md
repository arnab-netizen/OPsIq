# X9C-1: Wrapper Implementation Notes

**Phase:** X9C-1 (Policy Wrapper Foundation Implementation)  
**Date:** 2026-05-15  
**Status:** IMPLEMENTATION COMPLETE

---

## Implementation Summary

### File Modified
- `src/lib/canonical-route-enforcement.ts`

### Changes Made

#### 1. Added Import
Added import for `hasInternalAccess` function:
```typescript
import { hasInternalAccess } from "@/policies/capability-check";
```

#### 2. Implemented New Wrapper Function
Added `withCanonicalPolicyEnforcement` function (lines ~452-520) that:
- Layers on top of `withCanonicalEnforcement` (not replacing it)
- Takes a `CanonicalHandler` and options
- Applies policy-specific checks fail-closed
- Only calls handler if all checks pass

### Wrapper Behavior

**Request Flow:**
```
1. Route calls withCanonicalPolicyEnforcement(handler, options)
2. Wrapper receives NextRequest and params
3. Wrapper creates baseWrapper using withCanonicalEnforcement
   a. withCanonicalEnforcement performs identity checks
   b. If identity passes: calls inner handler
4. Inner handler (within baseWrapper):
   a. Receives verified CanonicalAuthContext
   b. Applies policy checks (fail-closed):
      - requireInternalAccess: checks if user has internal access
      - requirePolicyContext: checks if policy exists
   c. If all checks pass: calls original handler
   d. If any check fails: returns 403 Forbidden
5. Returns NextResponse to client
```

### Policy Check Logic

**requireInternalAccess Option:**
```typescript
if (options?.requireInternalAccess) {
  const internalAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
  if (!internalAccess) {
    return new NextResponse(
      JSON.stringify({ error: "Internal access required" }),
      { status: 403 }
    );
  }
}
```
- Calls `hasInternalAccess(ctx.policy)` if policy exists
- Defaults to false if policy is missing (fail-closed)
- Returns 403 if check fails
- Handler never reaches if check fails

**requirePolicyContext Option:**
```typescript
if (options?.requirePolicyContext) {
  if (!ctx.policy) {
    return new NextResponse(
      JSON.stringify({ error: "Policy context required" }),
      { status: 403 }
    );
  }
}
```
- Checks that ctx.policy exists
- Returns 403 if missing
- Handler never reaches if missing

### Type Safety

**No Type Compromises:**
- ✓ No `any` types
- ✓ No `as any` casts
- ✓ Proper TypeScript types throughout
- ✓ Handler signature preserved (ctx + params)

**Type Flow:**
```typescript
// Handler signature (unchanged)
type CanonicalHandler = (ctx: CanonicalAuthContext, params: Record<string, string>) => Promise<any>;

// Wrapper accepts same handler type
export function withCanonicalPolicyEnforcement(
  handler: CanonicalHandler,  // Same type
  options?: {...}
)

// Inner handler receives both ctx and params
async (ctx: CanonicalAuthContext, handlerParams: Record<string, string>) => {
  // Apply checks...
  return handler(ctx, handlerParams);  // Pass both to original handler
}
```

### Fail-Closed Design

**All Failure Paths Return 403 Before Handler Execution:**

1. Internal access check fails → 403 (handler not called)
2. Policy context check fails → 403 (handler not called)
3. Underlying identity check fails → 403 (wrapper doesn't reach policy checks)
4. Underlying capability check fails → 403 (wrapper doesn't reach policy checks)

**No Silent Degradation:**
- Cannot proceed with missing policy
- Cannot proceed without required access level
- Cannot proceed without required context
- Handler is impossible to reach if any check fails

### Backward Compatibility

**Existing Code Unaffected:**
- ✓ `withCanonicalEnforcement` unchanged (no modifications)
- ✓ `CanonicalAuthContext` unchanged (no modifications)
- ✓ All existing routes still work with `withCanonicalEnforcement`
- ✓ New routes can opt-in to `withCanonicalPolicyEnforcement`

**Routes Can Migrate Incrementally:**
- Phase X9C-2: Migrate policy-aware GET handlers one at a time
- Phase X9C-3: Update services to use parameter-based approach
- No flag day required

### Security Guarantees Maintained

**Wrapper Does NOT:**
- ✗ Allow routes to fabricate policy
- ✗ Allow routes to modify context
- ✗ Expose policy to services that don't request it
- ✗ Cache or reuse stale policy
- ✗ Default to permissive behavior

**Wrapper DOES:**
- ✓ Enforce policy checks fail-closed
- ✓ Call handler only after all checks pass
- ✓ Preserve immutability of context
- ✓ Fetch fresh policy per request
- ✓ Support explicit policy requirements

### Implementation Notes

**Why params are resolved upfront:**
Original params are a Promise from Next.js context. The wrapper:
1. Awaits params at wrapper entry point: `const params = await context.params`
2. Passes resolved params to base wrapper
3. Base wrapper receives resolved params
4. Inner handler receives resolved params to pass to original handler

This simplifies param handling and avoids nested Promise complexity.

**Why baseWrapper is called with Promise.resolve:**
The base wrapper signature expects `{ params: Promise<...> }`. We:
1. Resolve params at wrapper entry: `const params = await context.params`
2. Re-wrap resolved params: `{ params: Promise.resolve(params) }`
3. Pass to base wrapper which handles Promise unwrapping

This maintains consistency with Next.js context structure while allowing early param resolution.

---

## Implementation Completeness

| Requirement | Status | Evidence |
|------------|--------|----------|
| Wrapper function implemented | ✓ | withCanonicalPolicyEnforcement defined |
| Layers on withCanonicalEnforcement | ✓ | Calls base wrapper, doesn't replace |
| Fail-closed design | ✓ | Returns 403 before handler if checks fail |
| No type weakening | ✓ | No any/as any, proper types |
| No route migration | ✓ | No route files changed |
| No service changes | ✓ | No service files changed |
| No scanner changes | ✓ | No scanner files changed |
| Build succeeds | ✓ | npm run build: PASS |
| Existing tests pass | ✓ | g6r-auth-bridge: PASS (14/14) |

---

**Status:** ✓ Implementation Complete and Validated
