# R1-SERVICE-2: Strategy Confirmation

**Date:** 2026-05-17  
**Phase:** R1-SERVICE-2 Pilot Implementation  
**Status:** STRATEGY CONFIRMED & AUTHORIZED

---

## A. Accepted Pattern (From R1-SERVICE-1R Final Decision)

### Strategy: CREATE_VERIFIED_SERVICE_CONTEXT (Long-Term)

**Current Phase (Phase 1):** ServiceAuthEnvelope adapter pattern (Option A bridge)
- Routes use `withCanonicalEnforcement` wrapper
- Routes create `ServiceAuthEnvelope` adapter from `CanonicalAuthContext`
- Services accept adapter (no signature changes required)
- Future phases will transition to `VerifiedServiceContext`

**Proven Pattern:**
- ✓ R1-SERVICE-1 (findings/[findingId] PATCH): Successful pilot
- ✓ Adapter safety: 10/10 audit score
- ✓ All 7 context fields verified by wrapper before handler
- ✓ No weak auth patterns
- ✓ No fallback values for critical fields
- ✓ Authorization + workspace isolation preserved
- ✓ Type safety maintained
- ✓ Pattern proven safe across 18+ existing routes

---

## B. Exact Safety Rules (From R1-SERVICE-1R Adapter Safety Audit)

### What MUST Be Verified by Wrapper

Before handler runs, `withCanonicalEnforcement` MUST verify:
1. ✓ `verifiedActorId` - actor authentication complete
2. ✓ `verifiedActorType` - actor type (user or service) verified
3. ✓ `verifiedWorkspaceId` - workspace membership verified
4. ✓ `verifiedCapabilities` - capability evaluation complete
5. ✓ `requireCapabilities: [CAPABILITY_NAME]` - enforced before handler
6. ✓ `requireWorkspace: true` - enforced before handler

### What Adapter Must Guarantee

Adapter creation MUST:
1. ✓ Map ALL verified fields from `CanonicalAuthContext`
2. ✓ Use NO fallback values for critical fields
3. ✓ Accept optional fields (verifiedActor, policy) but require no default
4. ✓ Compute derived fields safely (e.g., `hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false`)
5. ✓ Pass adapter directly to service (no re-canonicalization)

### What MUST NOT Happen

- ✗ No `withAuth()` calls inside service
- ✗ No `canonicalizeAuthContext()` inside service
- ✗ No inferring workspace from request headers inside service
- ✗ No fallback actor IDs or workspace IDs
- ✗ No weak auth context acceptance
- ✗ No any/as any types
- ✗ No service signature changes
- ✗ No response shape changes
- ✗ No business logic changes

---

## C. Exact Forbidden Changes (From R1-SERVICE-1R Implementation Constraints)

### Forbidden During R1-SERVICE-2

1. ✗ Modify other routes (only actions/[actionId] PATCH)
2. ✗ Modify other handlers (only PATCH, not GET/POST/DELETE)
3. ✗ Modify other services (only updateAction if absolutely required)
4. ✗ Change wrapper implementation
5. ✗ Change auth context definitions
6. ✗ Add capabilities
7. ✗ Change entitlements
8. ✗ Change role mappings
9. ✗ Change database schema
10. ✗ Change response shapes
11. ✗ Change business logic
12. ✗ Broad service boundary migration (only this route)
13. ✗ Scanner source changes
14. ✗ Bulk replace operations
15. ✗ any/as any types
16. ✗ Service-side canonicalization
17. ✗ Weak AuthContext patterns in services

---

## D. R1-SERVICE-2 Exact Target (From r1_service_1r_next_pilot_selection.md)

### Selected Pilot Route

**Route File:** src/app/api/actions/[actionId]/route.ts  
**Handler:** PATCH only (GET unchanged)  
**Service:** updateAction  
**Service File:** src/services/action.ts (NO CHANGES if service already aligned)

### Why This Pilot

1. **Simplest Next Pattern:** Wrapper-only, no adapter needed if service aligned
2. **Service Already Aligned:** CanonicalAuthContext (same as findings pilot)
3. **Pure Modernization:** Pattern proven in R1-SERVICE-1
4. **Good Progression:** Actions is simpler than complex updates
5. **LOW Risk, LOW Complexity**

### Expected Impact

- **Violations Fixed:** 4 (estimated 349 → 345)
- **Pattern:** Identical to R1-SERVICE-1 (ServiceAuthEnvelope adapter)
- **Service Adaptation:** NONE (service already accepts CanonicalAuthContext)
- **Scope:** Single route handler (PATCH only)

---

## E. R1-SERVICE-2 May Proceed: YES

**Authorization Status:** ✓ EXPLICIT (from r1_service_1r_next_pilot_selection.md)

**Conditions Met:**
- ✓ R1-SERVICE-1 fully accepted
- ✓ Pattern proven safe (10/10 adapter audit)
- ✓ Strategy clarity confirmed (no deviation)
- ✓ updateAction identified as aligned service
- ✓ Risk assessed as LOW
- ✓ Scope clearly defined (PATCH handler only)
- ✓ Baseline established (349 violations)
- ✓ Tests passing (78/78)
- ✓ Build clean (TypeScript 0 errors)

**Recommendation:** Proceed immediately with R1-SERVICE-2 implementation using identical pattern to R1-SERVICE-1 pilot.

---

## F. Implementation Pattern (Proven Safe)

**Change Summary:**
```
FROM:
  export const PATCH = withEnforcementFull(async (request, context, params) => {
    const { session, policy } = await withAuth({ capability: CAPABILITIES.ACTION_UPDATE });
    ...
  });

TO:
  export const PATCH = withCanonicalEnforcement(
    async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
      const authEnvelope: ServiceAuthEnvelope = {
        verifiedActorId: ctx.verifiedActorId,
        verifiedActorType: ctx.verifiedActorType,
        verifiedWorkspaceId: ctx.verifiedWorkspaceId,
        verifiedCapabilities: ctx.verifiedCapabilities,
        hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
        verifiedActor: ctx.verifiedActor,
        policy: ctx.policy,
      };
      await updateAction(..., authEnvelope);
      ...
    },
    {
      requireCapabilities: [CAPABILITIES.ACTION_UPDATE],
      requireWorkspace: true,
    }
  );
```

---

## G. Strategy Confirmation Summary

**Accepted Pattern:** ✓ ServiceAuthEnvelope adapter (Option A bridge)  
**Safety Rules:** ✓ Verified by wrapper, no service-side canonicalization  
**Forbidden Changes:** ✓ Understood and will be avoided  
**Exact Pilot Target:** ✓ actions/[actionId] PATCH + updateAction  
**Expected Result:** ✓ -4 violations (349 → 345)  
**Risk Level:** ✓ LOW (pattern proven, service aligned)  
**Proceed Status:** ✓ YES - R1-SERVICE-2 authorized and ready

---

**Status: ✓ R1-SERVICE-2 STRATEGY CONFIRMED - AUTHORIZED TO PROCEED WITH UPDATEACTION CONTRACT TRUTH CHECK**

