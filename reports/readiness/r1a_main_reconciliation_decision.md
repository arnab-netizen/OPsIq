# R1-A Main Reconciliation: Final Decision

**Date:** 2026-05-16  
**Audit Phase:** R1-A-MAIN-RECONCILIATION  
**Decision:** ❌ R1A_SOURCE_INCOMPATIBLE_WITH_WRAPPER

---

## Executive Summary

R1-A source changes are present on origin/main (commit daf99c7), but they are **FUNDAMENTALLY INCOMPATIBLE** with the actual wrapper signatures in the codebase. The routes use `withEnforcementFull` but attempt to access `ctx.verifiedSessionSnapshot`, which is only provided by `withCanonicalEnforcement`. This causes immediate build failure.

**Build Status:** ❌ FAILED  
**TypeScript Error:** `Property 'ctx' does not exist on type 'EnforcedRequestContext'`

---

## What Happened

### R1-A Implementation Assumed:
- Routes wrap handlers with `withEnforcementFull`
- Handler receives `{ ctx }` as second parameter via destructuring
- `ctx` provides `verifiedSessionSnapshot` property with canonical auth data

### Actual Codebase Reality:
- `withEnforcementFull` (src/lib/enforced-route.ts) provides `EnforcedRequestContext`
- `EnforcedRequestContext` contains ONLY: `correlation_id`, `request_id`, `workspace_id`, `method`, `endpoint`, `started_at`
- `EnforcedRequestContext` does NOT have `verifiedSessionSnapshot`
- `verifiedSessionSnapshot` is ONLY available from `withCanonicalEnforcement` wrapper (src/lib/canonical-route-enforcement.ts)
- `withCanonicalEnforcement` provides `CanonicalAuthContext` with full auth data

---

## Impact Assessment

**Broken Routes:** 5 of 5
- src/app/api/billing/upgrade/route.ts ❌
- src/app/api/operator/myday/route.ts ❌
- src/app/api/operator/queue/route.ts ❌
- src/app/api/operator/my-day/route.ts ❌
- src/app/api/recommendations/[recommendationId]/route.ts ❌

**Build Result:** ❌ COMPILATION FAILURE  
**Test Result:** Cannot run (build fails first)  
**Scanner Result:** Cannot run (build fails first)  
**Deployment:** ❌ BLOCKED

---

## Root Cause

The R1-A implementation was based on an incorrect assumption about:
1. Which wrapper provides what context
2. How context is passed to handlers
3. What properties are available on the context object

The pattern used in R1-A (attempting to destructure `{ ctx }` from the second parameter) does not match either wrapper's actual signature:

**What R1-A routes attempted:**
```typescript
export const POST = withEnforcementFull(async (request, { ctx }) => {
  const { policy } = ctx.verifiedSessionSnapshot;
  // ...
});
```

**What withEnforcementFull actually provides:**
```typescript
// Handler signature: (req: NextRequest, context: EnforcedRequestContext, params: Record<string, string>) => Promise<any>
export const POST = withEnforcementFull(async (req, context, params) => {
  // context is EnforcedRequestContext, does NOT have verifiedSessionSnapshot
  // ...
});
```

**What withCanonicalEnforcement provides (if used correctly):**
```typescript
// Handler signature: (ctx: CanonicalAuthContext, params: Record<string, string>) => Promise<any>
export const POST = withCanonicalEnforcement(async (ctx, params) => {
  const { policy } = ctx.verifiedSessionSnapshot; // This DOES exist
  // ...
});
```

---

## Wrapper Comparison

| Feature | withEnforcementFull | withCanonicalEnforcement |
|---------|-------------------|------------------------|
| **Location** | src/lib/enforced-route.ts | src/lib/canonical-route-enforcement.ts |
| **Handler Parameter Order** | (req, enforcedCtx, params) | (ctx, params) |
| **Context Type** | EnforcedRequestContext | CanonicalAuthContext |
| **Has verifiedSessionSnapshot** | ❌ NO | ✓ YES |
| **Has policy object** | ❌ NO | ✓ YES (via context.policy) |
| **Has correlation_id** | ✓ YES | ⚠️ Optional (correlationId) |
| **Purpose** | Low-level request tracing | High-level auth enforcement |

---

## Decisions Required

### Option A: Rewrite R1-A to use withCanonicalEnforcement
**Action:** Update all 5 routes to use the correct wrapper  
**Risk:** Minor (wrapper exists, pattern is correct, just need parameter reordering)  
**Effort:** Minimal (mechanical fix)  
**Build Status After Fix:** Expected to PASS

### Option B: Revert R1-A entirely
**Action:** Remove daf99c7 from main, start over  
**Risk:** Higher (loses understanding of what went wrong)  
**Effort:** More work (need to replan, re-implement, re-test)

### Option C: Merge both wrappers (not recommended)
**Risk:** Highest (introduces new complexity, violates separation of concerns)  
**Effort:** Highest  
**Not Recommended**

---

## Reconciliation Verdict

**DECISION: ❌ R1A_SOURCE_INCOMPATIBLE_WITH_WRAPPER**

R1-A source changes are:
- ✓ Present on main (daf99c7 exists)
- ✓ Only changed 5 authorized files
- ✓ Followed correct modernization pattern (legacy withAuth removed, capability checks added)
- ❌ BUT incompatible with actual wrapper signatures in codebase
- ❌ Causes build failure
- ❌ NOT DEPLOYABLE in current form

**Required Action:** Rewrite R1-A routes to use `withCanonicalEnforcement` wrapper instead of `withEnforcementFull`. This is a mechanical fix (parameter reordering + wrapper swap) with no logic changes.

---

## Next Steps

1. **Create R1-A-FIX branch** from main (to preserve daf99c7 for reference)
2. **Fix all 5 route files** to use `withCanonicalEnforcement`
3. **Change handler signatures** from `(req, { ctx }, params)` to `(ctx, params)`
4. **Change wrapper import** from `withEnforcementFull` to `withCanonicalEnforcement`
5. **Verify build succeeds** with `npm run build`
6. **Verify all tests pass** (78 core tests should still pass)
7. **Verify scanner shows same reduction** (21 violations)
8. **Commit fix** with message explaining wrapper correction
9. **Authorize R1-B only after R1-A-FIX succeeds**

---

## Classification

| Aspect | Status |
|--------|--------|
| **Current Branch** | main |
| **origin/main up to date** | YES |
| **daf99c7 on origin/main** | YES |
| **daf99c7 contains source route changes** | YES |
| **R1-A route changes present on main** | YES |
| **Five target routes modernized on main** | YES (but incompatible) |
| **Build Status** | ❌ FAILED |
| **Test Status** | N/A (blocked by build failure) |
| **Reconciliation Decision** | R1A_SOURCE_INCOMPATIBLE_WITH_WRAPPER |
| **R1-B-0 Authorized** | NO (blocked until R1-A fixed) |
| **Service-boundary Modernization Authorized** | NO |
| **Code Changed in Reconciliation** | NO |
| **Final Classification** | BROKEN_WRAPPER_INCOMPATIBILITY |

---

## Conclusion

R1-A made the right changes in the wrong wrapper context. The fix is straightforward but essential: rewrite the 5 routes to use `withCanonicalEnforcement` (which provides the context they're trying to access) instead of `withEnforcementFull` (which doesn't). This is not a logic problem—it's a mechanical wrapper mismatch.

Recommend immediate R1-A-FIX phase to correct the wrapper before authorizing R1-B.
