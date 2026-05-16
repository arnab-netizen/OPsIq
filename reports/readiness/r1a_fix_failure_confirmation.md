# R1-A-FIX: Failure Confirmation

**Date:** 2026-05-16  
**Phase:** R1-A-FIX (Wrapper Compatibility Repair)  
**Status:** ⚠️ CONFIRMED FAILURE - BUILD BLOCKS

---

## Build Failure

**Status:** ❌ FAILED  
**Stage:** TypeScript Type Checking  

```
Failed to type check.

./src/app/api/billing/upgrade/route.ts:20:72
Type error: Property 'ctx' does not exist on type 'EnforcedRequestContext'.
```

**Error Details:**
```
Line 20: export const POST = withEnforcementFull(async (request: NextRequest, { ctx }) => {
Position: ........................................................................^
Error: Property 'ctx' does not exist on type 'EnforcedRequestContext'
```

---

## Root Cause Analysis

### Current (Broken) Pattern in R1-A

**Wrapper Used:** `withEnforcementFull` (from `@/lib/enforced-route.ts`)

**Handler Signature Attempted:**
```typescript
async (request: NextRequest, { ctx }) => {
  const { policy } = ctx.verifiedSessionSnapshot;
  // ...
}
```

**What withEnforcementFull Actually Provides:**
- Handler receives: `(req: NextRequest, context: EnforcedRequestContext, params: Record<string, string>)`
- `EnforcedRequestContext` has properties: `correlation_id`, `request_id`, `workspace_id`, `method`, `endpoint`, `started_at`
- `EnforcedRequestContext` does NOT have `verifiedSessionSnapshot`

### Correct Pattern Needed

**Wrapper Required:** `withCanonicalEnforcement` (from `@/lib/canonical-route-enforcement.ts`)

**Correct Handler Signature:**
```typescript
async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
  const { policy } = ctx.verifiedSessionSnapshot;  // This DOES exist
  // ...
}
```

**What withCanonicalEnforcement Provides:**
- Handler receives: `(ctx: CanonicalAuthContext, params: Record<string, string>)`
- `CanonicalAuthContext` has all properties including `verifiedSessionSnapshot`
- `CanonicalAuthContext` also has `policy`, `verifiedActorId`, `verifiedWorkspaceId`, etc.

---

## Affected Files

| File | Error | Line | Status |
|------|-------|------|--------|
| src/app/api/billing/upgrade/route.ts | Property 'ctx' does not exist | 20 | BROKEN |
| src/app/api/operator/myday/route.ts | Property 'ctx' does not exist | 7 | BROKEN |
| src/app/api/operator/queue/route.ts | Property 'ctx' does not exist | 23 | BROKEN |
| src/app/api/operator/my-day/route.ts | Property 'ctx' does not exist | 22 | BROKEN |
| src/app/api/recommendations/[id]/route.ts | Property 'ctx' does not exist | 31,60 | BROKEN |

**Total Broken Routes:** 5 of 5

---

## Repair Required

**Scope:** Replace incorrect wrapper with correct wrapper (withEnforcementFull → withCanonicalEnforcement)

**Pattern Change:**

**Before (broken):**
```typescript
import { withEnforcementFull } from "@/lib/enforced-route";

export const POST = withEnforcementFull(async (request: NextRequest, { ctx }) => {
  const { policy } = ctx.verifiedSessionSnapshot;
  // ...
});
```

**After (fixed):**
```typescript
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";

export const POST = withCanonicalEnforcement(
  async (ctx, params) => {
    const { policy } = ctx.verifiedSessionSnapshot;
    // ...
  },
  { requireWorkspace: true }  // Optional: if workspace is required
);
```

---

## Confirmation Summary

- ✓ Current branch: main
- ✓ Branch is up to date with origin/main
- ✓ Build fails as expected: TypeScript type mismatch
- ✓ All 5 R1-A routes affected by same issue
- ✓ Root cause identified: wrong wrapper selected
- ✓ Correct wrapper identified: withCanonicalEnforcement
- ✓ Repair strategy clear: swap wrapper, adjust handler signature

**Status:** ✓ READY TO REPAIR
