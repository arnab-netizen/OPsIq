# R1-SERVICE-3: updateClient Contract Truth Check

**Date:** 2026-05-17  
**Phase:** R1-SERVICE-3 Pre-Implementation Audit  
**Status:** CONTRACT VERIFIED - DIRECT PASS PATTERN CONFIRMED

---

## A. Current State Analysis

### Route File
**File:** src/app/api/clients/[clientId]/route.ts

**Current PATCH Handler:**
```typescript
export const PATCH = withEnforcementFull(async (request, context, params) => {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.CLIENT_UPDATE,
    internalOnly: true,
  });
  // ... workspace validation ...
  const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
  await updateClient(clientId, body, canonicalContext, workspaceId);
  // ...
});
```

### Service File
**File:** src/services/client-account.ts  
**Function:** updateClient (line 88)

**Current Signature:**
```typescript
export async function updateClient(
  clientId: string,
  input: UpdateClientInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void>
```

**Key Detail:** Service parameter 3 is typed as `CanonicalAuthContext`

---

## B. Contract Truth Answers

### Q1: Does updateClient currently accept CanonicalAuthContext?
**A: YES ✓**
- Service signature explicitly declares: `authContext: CanonicalAuthContext`
- Current route already passes CanonicalAuthContext (via canonicalizeAuthContext())

### Q2: Does updateClient currently accept ServiceAuthEnvelope?
**A: NO ✗**
- Service signature requires CanonicalAuthContext, not ServiceAuthEnvelope
- No overloads accepting ServiceAuthEnvelope
- Would require signature change if adapter were passed

### Q3: Does updateClient require a route adapter?
**A: NO ✗**
- Service already accepts CanonicalAuthContext (exact type provided by wrapper)
- No type mismatch
- No adapter needed
- **Identical pattern to R1-SERVICE-2 (updateAction)**

### Q4: Is service signature change required?
**A: NO ✗**
- Service already typed correctly for modernized routes
- withCanonicalEnforcement provides CanonicalAuthContext
- No signature changes needed
- Service can be called directly

### Q5: Is service file change required?
**A: NO ✗**
- Service accepts correct type (CanonicalAuthContext)
- No changes to src/services/client-account.ts needed
- No changes to updateClient logic needed
- Service file untouched

### Q6: Are there other callers that would be affected?
**A: NO ✗**
- Only route caller: src/app/api/clients/[clientId]/route.ts (our pilot)
- Other client route handlers use different functions (archiveClient, etc.)
- No broader impact
- Isolated change

### Q7: Can PATCH be modernized route-only?
**A: YES ✓**
- Service already accepts CanonicalAuthContext
- No adapter needed
- No service changes needed
- Pure route modernization (wrapper + direct context pass)
- **Simplest possible modernization path**

### Q8: Which pattern applies?
**A: EXISTING_CANONICAL_SERVICE_INPUT**
- Service was already modernized to accept CanonicalAuthContext
- Route will provide CanonicalAuthContext directly via wrapper
- No adapter creation needed
- Direct type match between route and service

---

## C. Comparison to R1-SERVICE-1 and R1-SERVICE-2

### Pattern Comparison

| Service | Expected Type | Route Pattern | Adapter Needed |
|---------|--------|---|---|
| R1-SERVICE-1 (findings) | ServiceAuthEnvelope | SERVICE_AUTH_ENVELOPE_ADAPTER | YES (creates adapter) |
| R1-SERVICE-2 (actions) | CanonicalAuthContext | EXISTING_CANONICAL_SERVICE_INPUT | NO (direct pass) |
| R1-SERVICE-3 (clients) | CanonicalAuthContext | EXISTING_CANONICAL_SERVICE_INPUT | NO (direct pass) |

### R1-SERVICE-2 and R1-SERVICE-3 Are Identical

**R1-SERVICE-2 Pattern:**
```typescript
// Both services expect CanonicalAuthContext
await updateAction(actionId, body, ctx, ctx.verifiedWorkspaceId);
```

**R1-SERVICE-3 Pattern (Expected):**
```typescript
// Same pattern - service also expects CanonicalAuthContext
await updateClient(clientId, body, ctx, ctx.verifiedWorkspaceId);
```

**Implementation Simplicity:** IDENTICAL to R1-SERVICE-2 (no adapter needed)

---

## D. Service Integration Verification

### updateClient Internal Review

The service uses CanonicalAuthContext as follows:
```typescript
export async function updateClient(
  clientId: string,
  input: UpdateClientInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<void> {
  // Extract verified values from context
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);
  
  // Use verified workspace ID for database query
  const client = await db.clientAccount.findUnique({
    where: { id: clientId, workspaceId: validatedWorkspaceId },
  });
  
  // Update and emit audit event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.CLIENT_ACCOUNT_UPDATED,
    actorId,  // From verified context
    // ...
  });
}
```

**Verification:**
- ✓ Service accepts CanonicalAuthContext
- ✓ Uses verified fields (actorId, validatedWorkspaceId)
- ✓ No weak auth patterns
- ✓ No fallback values
- ✓ No re-canonicalization

---

## E. Risk Assessment

### Response Shape Risk
**Level:** LOW
- Response is `getClientById(clientId, workspaceId)`
- No changes to response logic
- Same as current implementation

### Business Logic Risk
**Level:** LOW
- updateClient internal logic unchanged
- No service-side canonicalization needed
- No business logic changes

### Authorization Risk
**Level:** LOW
- Capability enforcement at wrapper (requireCapabilities: [CAPABILITIES.CLIENT_UPDATE])
- No service-side auth checks (already handled by wrapper)
- Workspace scoping via requireWorkspace: true
- All enforcement before handler runs

### Workspace Isolation Risk
**Level:** LOW
- ctx.verifiedWorkspaceId guaranteed by wrapper
- Passed directly to both updateClient and getClientById
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
**✓ Pattern matches R1-SERVICE-2:** YES  

---

## G. Final Verdict

**✓ R1-SERVICE-3 UPDATECLIENT CONTRACT VERIFIED - DIRECT PASS PATTERN CONFIRMED**

**Key Finding:** updateClient is already modernized to accept CanonicalAuthContext, making R1-SERVICE-3 identical in pattern to R1-SERVICE-2. No adapter needed. Direct context pass from wrapper to service.

**Proceed Status:** ✓ YES - Ready for pre-implementation audit

**Expected Implementation Pattern:**
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { clientId } = params;
    parseOrThrow(uuidSchema, clientId);

    const body = await parseRequestBody(ctx.request!, updateClientSchema);

    // Direct pass - no adapter (service accepts CanonicalAuthContext)
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

