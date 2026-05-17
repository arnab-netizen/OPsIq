# R1-SERVICE-3: Strategy Confirmation

**Date:** 2026-05-17  
**Phase:** R1-SERVICE-3 Pilot Implementation  
**Status:** STRATEGY CONFIRMED & AUTHORIZED

---

## A. Accepted Service Contract Classification Rule

From R1-SERVICE-2R Pattern Reconciliation:

**Rule:** Service contract type determines modernization pattern, not the other way around.

**Pre-Implementation Classification:**

1. **If service expects ServiceAuthEnvelope:**
   - Pattern: SERVICE_AUTH_ENVELOPE_ADAPTER
   - Implementation: Create adapter at route call site, pass to service
   - Example: R1-SERVICE-1 (findings route)

2. **If service expects CanonicalAuthContext:**
   - Pattern: EXISTING_CANONICAL_SERVICE_INPUT
   - Implementation: Pass context directly from wrapper to service
   - Example: R1-SERVICE-2 (actions route)

3. **If service expects VerifiedServiceContext:**
   - Pattern: VERIFIED_SERVICE_CONTEXT
   - Status: TBD (future phase)

4. **If service expects unknown type:**
   - Pattern: UNKNOWN_STOP
   - Action: STOP for design consultation

---

## B. Direct Pass Pattern Safety Rules (From R1-SERVICE-2 Proven Safe)

### What MUST Be Verified by Wrapper

Before handler runs, `withCanonicalEnforcement` MUST verify:
1. ✓ `verifiedActorId` - actor authentication complete
2. ✓ `verifiedActorType` - actor type verified
3. ✓ `verifiedWorkspaceId` - workspace membership verified
4. ✓ `verifiedCapabilities` - capability evaluation complete
5. ✓ `requireCapabilities: [CAPABILITY_NAME]` - enforced before handler
6. ✓ `requireWorkspace: true` - enforced before handler

### What Handler MUST Do

Handler implementation MUST:
1. ✓ Accept context parameter: `ctx: CanonicalAuthContext`
2. ✓ Parse/validate input parameters
3. ✓ Call service with context: `await service(..., ctx, ...)`
4. ✓ Return response via getById or similar
5. ✓ Never re-canonicalize context
6. ✓ Never call withAuth inside handler
7. ✓ Never infer workspace from headers

### What Service MUST Do

Service contract MUST:
1. ✓ Accept CanonicalAuthContext (or ServiceAuthEnvelope, depending on pattern)
2. ✓ Use verified context directly
3. ✓ Never call withAuth() or canonicalizeAuthContext()
4. ✓ Never accept weak auth patterns
5. ✓ Trust wrapper verification

### What MUST NOT Happen

- ✗ No weak auth context acceptance
- ✗ No fallback values for critical fields
- ✗ No service-side canonicalization
- ✗ No response shape changes
- ✗ No business logic changes
- ✗ No any/as any types

---

## C. Adapter Pattern Safety Rules (From R1-SERVICE-1 Proven Safe)

### When to Use

Service expects ServiceAuthEnvelope (not CanonicalAuthContext).

### What MUST Be Verified by Wrapper

Same as direct pass pattern (all 6 verification points).

### What Handler MUST Do

Handler implementation MUST:
1. ✓ Accept context parameter: `ctx: CanonicalAuthContext`
2. ✓ Create ServiceAuthEnvelope from context:
   ```typescript
   const authEnvelope: ServiceAuthEnvelope = {
     verifiedActorId: ctx.verifiedActorId,
     verifiedActorType: ctx.verifiedActorType,
     verifiedWorkspaceId: ctx.verifiedWorkspaceId,
     verifiedCapabilities: ctx.verifiedCapabilities,
     hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
     verifiedActor: ctx.verifiedActor,
     policy: ctx.policy,
   };
   ```
3. ✓ Map ALL verified fields (no fallbacks)
4. ✓ Pass adapter to service: `await service(..., authEnvelope, ...)`
5. ✓ Return response

### Safety Guarantee

Adapter pattern has 10/10 safety audit score (R1-SERVICE-1 findings pilot). All fields verified by wrapper, mapped without fallbacks, passed to service that trusts verification.

---

## D. Exact Forbidden Changes (All Patterns)

### Route-Level Forbidden
1. ✗ Modify other routes (only clients/[clientId] PATCH)
2. ✗ Modify other handlers (only PATCH, not GET/POST/DELETE)
3. ✗ Modify contact routes (nested route, not in scope)

### Service-Level Forbidden
1. ✗ Modify other services
2. ✗ Change service signatures (accept what they expect, no more)
3. ✗ Service-side canonicalization
4. ✗ Weak auth patterns in services
5. ✗ Response shape changes
6. ✗ Business logic changes

### Infrastructure-Level Forbidden
1. ✗ Wrapper implementation changes
2. ✗ Auth context definition changes
3. ✗ Capability additions
4. ✗ Entitlement changes
5. ✗ Role mapping changes
6. ✗ Database schema changes

### Code Quality Forbidden
1. ✗ Scanner source changes
2. ✗ Bulk replace operations
3. ✗ any/as any types
4. ✗ Fallback values for critical fields

---

## E. R1-SERVICE-3 Exact Target (From r1_service_2r_next_pilot_validation.json)

### Selected Pilot Route

**Route File:** src/app/api/clients/[clientId]/route.ts  
**Handler:** PATCH only (GET unchanged)  
**Service:** updateClient  
**Service File:** src/services/client-account.ts

### Why This Pilot

1. **Pattern Already Verified:** Expected pattern is EXISTING_CANONICAL_SERVICE_INPUT (same as R1-SERVICE-2)
2. **Service Already Aligned:** updateClient accepts CanonicalAuthContext
3. **Pure Modernization:** Direct pass pattern, no adapter needed
4. **Good Progression:** Similar complexity to R1-SERVICE-2
5. **LOW Risk, LOW Complexity**

### Expected Impact

- **Violations Fixed:** 4 (estimated 346 → 342)
- **Pattern:** Direct pass (identical to R1-SERVICE-2)
- **Service Adaptation:** NONE (service already accepts CanonicalAuthContext)
- **Scope:** Single route handler (PATCH only)

---

## F. R1-SERVICE-3 May Proceed: YES

**Authorization Status:** ✓ EXPLICIT (from r1_service_2r_next_pilot_validation.json)

**Conditions Met:**
- ✓ R1-SERVICE-1 fully accepted (adapter pattern proven)
- ✓ R1-SERVICE-2 fully accepted (direct pass pattern proven)
- ✓ Service contract pre-audit completed (updateClient verified)
- ✓ Pattern classification confirmed (EXISTING_CANONICAL_SERVICE_INPUT)
- ✓ Risk assessed as LOW
- ✓ Scope clearly defined (PATCH handler only)
- ✓ Baseline established (346 violations)
- ✓ Tests passing (78/78)
- ✓ Build clean (TypeScript 0 errors)

**Recommendation:** Proceed immediately with R1-SERVICE-3 implementation using direct pass pattern (identical to R1-SERVICE-2).

---

## G. Implementation Pattern (Proven Safe - R1-SERVICE-2 Pattern)

**Change Summary (PATCH Handler Only):**

FROM:
```typescript
export const PATCH = withEnforcementFull(async (request, context, params) => {
  const { session, policy } = await withAuth({ 
    capability: CAPABILITIES.CLIENT_UPDATE 
  });
  // ... workspace validation ...
  const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
  await updateClient(clientId, body, canonicalContext, workspaceId);
  // ...
});
```

TO:
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

**Key Points:**
- Remove: withEnforcementFull, withAuth, canonicalizeAuthContext, enforceWorkspaceScoping imports
- Add: CanonicalAuthContext type import
- Keep: withCanonicalEnforcement (already present)
- Handler: Direct pass of ctx to updateClient (no adapter)
- Authorization: Enforced at wrapper, not in route
- Workspace: Enforced at wrapper, not in route

---

## H. Strategy Confirmation Summary

**Accepted Pattern Rule:** ✓ Service contract determines pattern
**Direct Pass Safety Rules:** ✓ Verified in R1-SERVICE-2, proven safe
**Adapter Safety Rules:** ✓ Verified in R1-SERVICE-1, proven safe
**Forbidden Changes:** ✓ Understood and will be avoided
**Exact Pilot Target:** ✓ clients/[clientId] PATCH + updateClient
**Expected Result:** ✓ -4 violations (346 → 342 estimated)
**Service Pattern:** ✓ EXISTING_CANONICAL_SERVICE_INPUT (direct pass)
**Risk Level:** ✓ LOW (pattern proven in R1-SERVICE-2)
**Proceed Status:** ✓ YES - R1-SERVICE-3 authorized and ready

---

**Status: ✓ R1-SERVICE-3 STRATEGY CONFIRMED - AUTHORIZED TO PROCEED WITH UPDATECLIENT CONTRACT TRUTH CHECK**

