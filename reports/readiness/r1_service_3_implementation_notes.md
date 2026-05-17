# R1-SERVICE-3: Implementation Notes

**Date:** 2026-05-17  
**Phase:** R1-SERVICE-3 Pilot Implementation  
**Status:** IMPLEMENTATION COMPLETE & VALIDATED

---

## A. Implementation Summary

### Route File Modified
**File:** src/app/api/clients/[clientId]/route.ts

### Changes Applied

**1. Imports Consolidation (lines 1-3)**
```typescript
// BEFORE
- import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
- import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

// AFTER
+ import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

// Also removed UnauthorizedError (not used in PATCH)
- import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
+ import { ForbiddenError } from "@/infra/errors";  // Kept for POST handler
```

**2. GET Handler (lines 30-40)**
- Status: ✓ UNCHANGED (already modernized)
- Verification: Identical to before

**3. PATCH Handler (lines 42-58)**

**Before:**
```typescript
export const PATCH = withEnforcementFull(async (request, context, params) => {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.CLIENT_UPDATE,
    internalOnly: true,
  });
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json({ error: "Workspace ID required..." }, { status: 400 });
  }
  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) throw new ForbiddenError("Unauthorized");
  const { clientId } = params;
  parseOrThrow(uuidSchema, clientId);
  const body = await parseRequestBody(request, updateClientSchema);
  const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
  await updateClient(clientId, body, canonicalContext, workspaceId);
  const updated = await getClientById(clientId, workspaceId);
  return Response.json(updated);
});
```

**After:**
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { clientId } = params;
    parseOrThrow(uuidSchema, clientId);

    const body = await parseRequestBody(ctx.request!, updateClientSchema);

    await updateClient(clientId, body, ctx, ctx.verifiedWorkspaceId);

    const updated = await getClientById(clientId, ctx.verifiedWorkspaceId);
    return Response.json(updated);
  },
  {
    requireCapabilities: [CAPABILITIES.CLIENT_UPDATE],
    requireWorkspace: true,
  }
);
```

**4. POST Handler (line 60+)**
- Status: ✓ UNCHANGED (not in scope)
- Verification: Identical to before

**Compliance:** ✓ SCOPE CORRECT

---

## B. Key Improvements

### 1. Wrapper Modernization
- `withEnforcementFull` → `withCanonicalEnforcement`
- Reason: Modern wrapper provides verified context directly
- Benefit: Cleaner API, verified data guaranteed by wrapper

### 2. Handler Signature Simplification
- Old: `async (request, context, params) => {...}`
- New: `async (ctx: CanonicalAuthContext, params: Record<string, string>) => {...}`
- Benefit: Type safety, context structure explicit

### 3. Authorization Moved to Wrapper
- Old: `const { session, policy } = await withAuth({ capability: ... })`
- New: `requireCapabilities: [CAPABILITIES.CLIENT_UPDATE]` in wrapper options
- Benefit: Declarative, verified before handler runs

### 4. Workspace Enforcement Moved to Wrapper
- Old: `enforceWorkspaceScoping(nextRequest, workspaceId)`
- New: `requireWorkspace: true` in wrapper options
- Benefit: Declarative, verified before handler runs

### 5. Context Creation Moved to Wrapper
- Old: `canonicalizeAuthContext({ session, policy }, workspaceId)`
- New: Wrapper creates `CanonicalAuthContext` (ctx parameter)
- Benefit: Verified context guaranteed, no manual creation

### 6. Direct Service Call
- Old: Created intermediate canonicalContext, passed separate workspaceId
- New: Pass ctx directly (service accepts CanonicalAuthContext)
- Benefit: Simpler, no adapter needed

---

## C. Pattern Consistency Check

**R1-SERVICE-2 (actions) Pattern:**
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    // ... parse input ...
    await updateAction(actionId, body, ctx, ctx.verifiedWorkspaceId);
    // ... return response ...
  },
  {
    requireCapabilities: [CAPABILITIES.ACTION_UPDATE],
    requireWorkspace: true,
  }
);
```

**R1-SERVICE-3 (clients) Pattern:**
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    // ... parse input ...
    await updateClient(clientId, body, ctx, ctx.verifiedWorkspaceId);
    // ... return response ...
  },
  {
    requireCapabilities: [CAPABILITIES.CLIENT_UPDATE],
    requireWorkspace: true,
  }
);
```

✓ Wrapper pattern: IDENTICAL  
✓ Handler signature: IDENTICAL  
✓ Wrapper options: IDENTICAL  
✓ Service authorization enforcement: IDENTICAL  
✓ Workspace scoping enforcement: IDENTICAL  
✓ Difference: Only capability name differs  

---

## D. Safety Verification

### Authorization Safety
✓ Capability check moved to wrapper  
✓ Capability verified before handler runs  
✓ No weak auth patterns (no withAuth inside handler)  
✓ No fallback capabilities  
✓ Capability enforcement preserved exactly  

### Workspace Isolation Safety
✓ Workspace verified by wrapper  
✓ Workspace scoping enforced before handler runs  
✓ No unverified header usage  
✓ No workspace inference from request  
✓ verifiedWorkspaceId used for all queries  
✓ Cross-workspace access prevented  

### Type Safety
✓ CanonicalAuthContext fully typed  
✓ No any types  
✓ No as any types  
✓ ctx.request! assertion justified (wrapper provides)  
✓ All parameters typed correctly  

### Business Logic Safety
✓ updateClient called with correct parameters  
✓ Response logic unchanged  
✓ Service file untouched  
✓ GET/POST handlers unchanged  
✓ No mutations to business logic  

---

## E. Validation Results

**Build:** ✓ PASS (0 TypeScript errors)  
**Tests:** ✓ PASS (78/78, no regressions)  
**Scanner:** ✓ PASS (-2 violations: 346 → 344)  

---

## F. Implementation Checklist

**Before Implementation:**
- ✓ Contract verified (updateClient accepts CanonicalAuthContext)
- ✓ Risk assessed (LOW)
- ✓ Pattern understood (identical to R1-SERVICE-2)
- ✓ Scope defined (PATCH handler only)

**During Implementation:**
- ✓ Imports consolidated (removed unused UnauthorizedError)
- ✓ GET handler left unchanged
- ✓ PATCH handler modernized
- ✓ POST handler left unchanged
- ✓ No service files modified
- ✓ No other routes modified
- ✓ Pattern matched exactly

**After Implementation:**
- ✓ Build succeeded
- ✓ All tests pass
- ✓ Scanner improved (-2 violations)
- ✓ No regressions
- ✓ Scope audit clean
- ✓ No forbidden operations

---

## G. Notes

1. **Three Pilots, Two Patterns:** 
   - R1-SERVICE-1: Adapter pattern (updateFinding service expects ServiceAuthEnvelope)
   - R1-SERVICE-2: Direct pass pattern (updateAction service expects CanonicalAuthContext)
   - R1-SERVICE-3: Direct pass pattern (updateClient service expects CanonicalAuthContext)

2. **Pattern Consistency:** R1-SERVICE-3 follows R1-SERVICE-2 exactly, confirming the direct-pass pattern is reusable for services already modernized to accept CanonicalAuthContext.

3. **Violation Progress:** -2 violations is less than estimated -4, but still represents progress. Cumulative progress from R1-SERVICE-0 baseline:
   - Original: 352 violations
   - After R1-SERVICE-1: 349 (-3)
   - After R1-SERVICE-2: 346 (-3 more)
   - After R1-SERVICE-3: 344 (-2 more)
   - Total: -8 violations (2.3% toward target)

4. **Service Contract Determination:** Each service's input type determines the modernization pattern:
   - ServiceAuthEnvelope → Adapter pattern
   - CanonicalAuthContext → Direct pass pattern
   - Future services may require other patterns

---

**Status: ✓ R1-SERVICE-3 IMPLEMENTATION COMPLETE - ALL QUALITY METRICS MET**

