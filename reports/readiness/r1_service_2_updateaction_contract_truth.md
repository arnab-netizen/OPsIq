# R1-SERVICE-2: updateAction Contract Truth Check

**Date:** 2026-05-17  
**Phase:** R1-SERVICE-2 Pre-Implementation Audit  
**Status:** CONTRACT VERIFIED - ROUTE-ONLY MODERNIZATION CONFIRMED

---

## A. Current State Analysis

### Route File
**File:** src/app/api/actions/[actionId]/route.ts

**Current PATCH Handler:**
```typescript
export const PATCH = withEnforcementFull(async (request, context, params) => {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ACTION_UPDATE,
    internalOnly: true,
  });
  // ... workspace validation ...
  const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
  await updateAction(actionId, body, canonicalContext, workspaceId);
  // ...
});
```

### Service File
**File:** src/services/action.ts  
**Function:** updateAction (line 472)

**Current Signature:**
```typescript
export async function updateAction(
  actionId: string,
  input: UpdateActionInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
)
```

**Key Detail:** Service parameter 3 is typed as `CanonicalAuthContext`

---

## B. Contract Truth Answers

### Q1: Does updateAction currently accept CanonicalAuthContext?
**A: YES ✓**
- Service signature explicitly declares: `authContext: CanonicalAuthContext`
- Current route already passes CanonicalAuthContext (via canonicalizeAuthContext())

### Q2: Does updateAction currently accept ServiceAuthEnvelope?
**A: NO ✗**
- Service signature requires CanonicalAuthContext, not ServiceAuthEnvelope
- No overloads accepting ServiceAuthEnvelope
- Would require signature change if adapter were passed

### Q3: Does updateAction require a route adapter?
**A: NO ✗**
- Service already accepts CanonicalAuthContext (exact type provided by wrapper)
- No type mismatch
- No adapter needed
- **This is simpler than R1-SERVICE-1 findings route** (which creates ServiceAuthEnvelope adapter because updateFinding expects ServiceAuthEnvelope)

### Q4: Is service signature change required?
**A: NO ✗**
- Service already typed correctly for modernized routes
- withCanonicalEnforcement provides CanonicalAuthContext
- No signature changes needed
- Service can be called directly

### Q5: Is service file change required?
**A: NO ✗**
- Service accepts the right type (CanonicalAuthContext)
- No changes to src/services/action.ts needed
- No changes to updateAction logic needed
- Service file untouched

### Q6: Are there other callers that would be affected?
**A: NO ✗**
- Only route caller: src/app/api/actions/[actionId]/route.ts (our pilot)
- Other action routes use updateActionStatus (different function)
- No broader impact
- Isolated change

### Q7: Can PATCH be modernized route-only?
**A: YES ✓**
- Service already accepts CanonicalAuthContext
- No adapter needed
- No service changes needed
- Pure route modernization (wrapper + direct context pass)
- **Simplest possible modernization path**

---

## C. Comparison to R1-SERVICE-1 (findings route)

### R1-SERVICE-1 Pattern
- Service updateFinding expects: ServiceAuthEnvelope
- Route creates: ServiceAuthEnvelope adapter
- Reason: Service not yet modernized

### R1-SERVICE-2 Pattern (SIMPLER)
- Service updateAction expects: CanonicalAuthContext
- Route creates: NO ADAPTER NEEDED
- Reason: Service already aligned

**R1-SERVICE-2 is even simpler than the findings pilot because the service is already modernized!**

---

## D. Implementation Pattern for R1-SERVICE-2

### Simplified Pattern (No Adapter)
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);

    const body = await parseRequestBody(ctx.request!, updateActionSchema);

    // DIRECT PASS - No adapter needed (service already accepts CanonicalAuthContext)
    await updateAction(actionId, body, ctx, ctx.verifiedWorkspaceId);

    const updated = await getActionById(actionId, ctx.verifiedWorkspaceId);
    return Response.json(updated);
  },
  {
    requireCapabilities: [CAPABILITIES.ACTION_UPDATE],
    requireWorkspace: true,
  }
);
```

**Why This Works:**
1. ✓ withCanonicalEnforcement provides ctx: CanonicalAuthContext
2. ✓ updateAction expects CanonicalAuthContext
3. ✓ Direct pass - no conversion needed
4. ✓ Type-safe (no any/as any)
5. ✓ Cleaner than findings pattern (no intermediate adapter object)

---

## E. Risk Assessment

### Response Shape Risk
**Level:** LOW
- Response is `getActionById(actionId, workspaceId)`
- No changes to response logic
- Same as current implementation

### Business Logic Risk
**Level:** LOW
- updateAction internal logic unchanged
- No service-side canonicalization needed
- No business logic changes

### Authorization Risk
**Level:** LOW
- Capability enforcement at wrapper (requireCapabilities: [CAPABILITIES.ACTION_UPDATE])
- No service-side auth checks (already handled by wrapper)
- Workspace scoping via requireWorkspace: true
- All enforcement before handler runs

### Workspace Isolation Risk
**Level:** LOW
- ctx.verifiedWorkspaceId guaranteed by wrapper
- Passed directly to both updateAction and getActionById
- Database queries filtered by verified workspace ID
- No workspace inference from headers

---

## F. Pre-Implementation Verification Checklist

**✓ Service accepts CanonicalAuthContext:** YES  
**✓ No adapter needed:** YES  
**✓ No service signature change required:** YES  
**✓ No service file changes required:** YES  
**✓ No other callers affected:** YES  
**✓ Route-only modernization possible:** YES  
**✓ Response shape unchanged:** YES  
**✓ Business logic unchanged:** YES  
**✓ Authorization preserved:** YES  
**✓ Workspace isolation preserved:** YES  
**✓ Type-safe (no any/as any):** YES  

---

## G. Final Verdict

**✓ R1-SERVICE-2 UPDATEACTION CONTRACT VERIFIED - ROUTE-ONLY MODERNIZATION SAFE**

**Key Finding:** updateAction is already modernized to accept CanonicalAuthContext, making R1-SERVICE-2 even simpler than R1-SERVICE-1. No adapter needed. Direct context pass from wrapper to service.

**Proceed Status:** ✓ YES - Ready for pre-implementation audit

