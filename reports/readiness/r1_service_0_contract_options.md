# R1-SERVICE-0: Service Contract Design Options

**Date:** 2026-05-16  
**Purpose:** Evaluate exactly 5 contract design approaches for unblocking 40+ service-coupled routes

---

## Background

**Current Problem:** Services have inconsistent input types:
- Some expect `ServiceAuthEnvelope` (findings, deliverable)
- Some expect `CanonicalAuthContext` (action, diagnosis, engagement)
- Some expect hybrid (execute internally constructs envelope)

**Current Routes:** 40+ routes blocked because they use legacy `canonicalizeAuthContext()` with `withEnforcementFull` wrapper. Modernizing to `withCanonicalEnforcement` requires clear contract definition.

---

## Option A: Keep ServiceAuthEnvelope with CanonicalAuthContext Adapter

**Strategy:** ServiceAuthEnvelope remains the stable service boundary contract. Routes using withCanonicalEnforcement construct ServiceAuthEnvelope inline from CanonicalAuthContext at each call site.

**Pattern:**
```typescript
// Route handler with withCanonicalEnforcement
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // Create ServiceAuthEnvelope adapter inline
    const authEnvelope: ServiceAuthEnvelope = {
      verifiedActorId: ctx.verifiedActorId,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedCapabilities: ctx.verifiedCapabilities,
      hasInternalAccess: /* derive from policy */,
      verifiedActor: ctx.verifiedActor,
      policy: ctx.policy
    };
    
    // Call service with envelope
    await updateFinding(findingId, input, authEnvelope);
  }
);
```

**Authorization Safety:** ✓ SAFE
- ServiceAuthEnvelope remains read-only type
- Services cannot weaken verification
- Adapter checks policy context if needed

**Workspace Isolation Safety:** ✓ SAFE
- verifiedWorkspaceId passed directly
- Services cannot access unverified workspaces

**Type Safety:** ✓ SAFE
- ServiceAuthEnvelope is strongly typed
- No any casts needed

**Risk of Weakening Service Boundary:** ✓ NONE
- Service boundary unchanged
- ServiceAuthEnvelope contract preserved

**Implementation Complexity:** MEDIUM
- Must add inline adapter to 8 routes that call ServiceAuthEnvelope services
- 30 routes need just wrapper change (no adapter)
- Pattern is simple, repetitive (good for future routes)

**Compatibility with Existing Tests:** ✓ COMPATIBLE
- Services unchanged
- Only routes change
- Test coverage remains same

**Migration Cost:** LOW
- Phase-by-phase route modernization
- No service refactoring needed
- Rollback: remove adapters, keep wrapper changes

**Rollback Simplicity:** ✓ SIMPLE
- Adapters are inline, easy to revert
- Services unchanged, so no service rollback needed

**Scanner Impact:** -140 violations expected (all service-coupled routes unblocked)

**Long-term Maintainability:** MEDIUM
- Adapter pattern must be remembered at each call site
- Could be extracted to helper if > 3 uses per service
- ServiceAuthEnvelope contract still clear and stable

**Pros:**
- Preserves existing ServiceAuthEnvelope contract
- No service changes needed
- Simple pattern, easy to understand
- Type-safe adapter
- Low risk

**Cons:**
- Repetitive adapter code at each call site
- ServiceAuthEnvelope remains legacy even if good design
- Adapter pattern not auto-enforced
- Future routes must remember to adapt

---

## Option B: Refactor Services to Accept CanonicalAuthContext Directly

**Strategy:** All services refactored to accept `CanonicalAuthContext` instead of `ServiceAuthEnvelope`. Single unified contract.

**Pattern:**
```typescript
// Service signature change
export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  ctx: CanonicalAuthContext  // Changed from ServiceAuthEnvelope
): Promise<{ id: string }> {
  const [actorId, workspaceId] = requireServiceContext(ctx, workspaceId);
  // ... rest of logic
}

// Route calls service directly
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    await updateFinding(findingId, input, ctx);  // Pass ctx directly
  }
);
```

**Authorization Safety:** ✓ SAFE
- CanonicalAuthContext is verified at entry
- Services cannot weaken verification
- Matches pattern already used by action, diagnosis, engagement

**Workspace Isolation Safety:** ✓ SAFE
- verifiedWorkspaceId guaranteed in context

**Type Safety:** ✓ SAFE
- CanonicalAuthContext strongly typed
- requireServiceContext() enforces extraction

**Risk of Weakening Service Boundary:** ✓ NONE
- Service signature is verifiable
- No ServiceAuthEnvelope construction issues
- Single unified type

**Implementation Complexity:** HIGH
- Must refactor 3-5 service functions to accept CanonicalAuthContext
- Must update all call sites for each service (5+ locations per service)
- Must update services' internal patterns (requireServiceContext usage)
- Services accepting ServiceAuthEnvelope: findings, deliverable, execute (3 main)

**Compatibility with Existing Tests:** ⚠ PARTIAL
- Services will have different signatures
- Tests passing findingId as ServiceAuthEnvelope will break
- Tests need rewrite for CanonicalAuthContext parameter
- Service internal tests need refactoring

**Migration Cost:** MEDIUM
- Services must be refactored thoroughly
- All call sites updated
- Tests rewritten
- 1-2 day refactoring per service

**Rollback Simplicity:** ✗ COMPLEX
- Service refactoring is high-touch
- Would need to revert multiple service functions
- Call site changes across many routes

**Scanner Impact:** -140 violations expected (but slower - phased with service refactoring)

**Long-term Maintainability:** ✓ EXCELLENT
- Single unified contract (CanonicalAuthContext)
- No adapter pattern needed
- Clear separation: wrapper provides context, services use context
- Future services automatically accept right type
- No confusion about ServiceAuthEnvelope vs CanonicalAuthContext

**Pros:**
- Single unified contract long-term
- No adapter pattern to remember
- Cleaner service signatures
- Matches modern pattern (action.ts, diagnosis.ts already do this)
- Better long-term maintainability
- No repetitive code

**Cons:**
- High implementation complexity
- Service refactoring is risky
- Test rewriting required
- Slower to unblock routes (service work first)
- Higher rollback cost if something breaks
- Blocks on service integration testing

---

## Option C: Create Minimal VerifiedServiceContext Type

**Strategy:** Define a minimal new type `VerifiedServiceContext` as the stable service boundary. Routes convert CanonicalAuthContext -> VerifiedServiceContext at call site.

**Pattern:**
```typescript
// New minimal type (stable boundary)
export interface VerifiedServiceContext {
  readonly verifiedActorId: string;
  readonly verifiedWorkspaceId: string;
  readonly verifiedCapabilities: ReadonlySet<string>;
}

// Service signature (same as findings.ts pattern but cleaner)
export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  ctx: VerifiedServiceContext
): Promise<{ id: string }> {
  // ... uses ctx.verifiedActorId, ctx.verifiedWorkspaceId, ctx.verifiedCapabilities
}

// Route creates context
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const serviceCtx: VerifiedServiceContext = {
      verifiedActorId: ctx.verifiedActorId,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedCapabilities: ctx.verifiedCapabilities
    };
    await updateFinding(findingId, input, serviceCtx);
  }
);
```

**Authorization Safety:** ✓ SAFE
- VerifiedServiceContext contains only verified decisions
- Read-only type prevents mutation
- Services cannot call auth functions

**Workspace Isolation Safety:** ✓ SAFE
- verifiedWorkspaceId always present and verified

**Type Safety:** ✓ SAFE
- Minimal but complete type
- No optional fields
- No any casts

**Risk of Weakening Service Boundary:** ✓ NONE
- ServiceAuthEnvelope cleanly replaced
- New type is minimal and intentional
- Clear what services can access

**Implementation Complexity:** LOW-MEDIUM
- Define new VerifiedServiceContext type (1 PR)
- Update 3-5 service function signatures (low-touch)
- Add inline adapters to 8 routes (copy-paste pattern)
- No service implementation logic changes

**Compatibility with Existing Tests:** ✓ COMPATIBLE
- Service implementations mostly unchanged
- Only signatures change
- Tests can easily adapt (just pass different type)
- No service logic refactoring

**Migration Cost:** LOW
- Phased by service: 1 service signature change + 3-5 route adapters per phase
- Minimal service refactoring
- Tests adapt easily

**Rollback Simplicity:** ✓ SIMPLE
- Just revert type definition and signatures
- Route adapters can be removed
- No logic to revert

**Scanner Impact:** -140 violations expected (phased over multiple phases)

**Long-term Maintainability:** ✓ EXCELLENT
- VerifiedServiceContext is explicit and minimal
- Future services automatically use right type
- No adapter pattern to remember (it's just field extraction)
- Type name clarifies intent: "verified service context"
- ServiceAuthEnvelope cleanly deprecated

**Pros:**
- Lower complexity than full refactor
- Minimal new type - clear intent
- Easy to phase in (1 service at a time)
- Better than ServiceAuthEnvelope (clearer naming)
- No test rewrites needed
- Type-safe boundary

**Cons:**
- Requires adapter at call sites (like Option A)
- New type to learn (though minimal)
- ServiceAuthEnvelope still exists during migration
- Slightly more setup than Option A

---

## Option D: Dual-Format Temporary (Old + New)

**Strategy:** Services accept both ServiceAuthEnvelope and CanonicalAuthContext temporarily during migration. Once all routes modernized, remove old branch.

**Pattern:**
```typescript
export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  auth: ServiceAuthEnvelope | VerifiedServiceContext
): Promise<{ id: string }> {
  // Extract verified data from either type
  const verifiedActorId = 'verifiedActorId' in auth ? auth.verifiedActorId : auth.verifiedActorId;
  const verifiedWorkspaceId = 'verifiedWorkspaceId' in auth ? auth.verifiedWorkspaceId : auth.verifiedWorkspaceId;
  // ... rest of logic
}
```

**Authorization Safety:** ✗ UNSAFE IF MISUSED
- Dual types increase confusion
- Service must correctly handle both (error-prone)
- Type narrowing adds complexity

**Workspace Isolation Safety:** ✓ SAFE (if implemented correctly)
- Both types include workspace ID

**Type Safety:** ✗ WEAK
- Union type requires narrowing
- Pattern matching complexity
- Risk of accidental wrong-type handling

**Risk of Weakening Service Boundary:** ⚠ MEDIUM RISK
- Dual logic paths increase complexity
- More chance for bugs in type narrowing
- Easier to accidentally leak between old/new behavior

**Implementation Complexity:** HIGH
- Must update service logic to handle union type
- Pattern matching at each usage point
- Tests must cover both paths
- Increased code complexity

**Compatibility with Existing Tests:** ✗ PROBLEMATIC
- Both paths must be tested
- Test explosion (2x test combinations)
- Migration testing burden

**Migration Cost:** MEDIUM
- Can modernize routes phase-by-phase
- Services support both during migration
- But each service needs dual-branch logic

**Rollback Simplicity:** ✗ COMPLEX
- Dual branches must be torn out
- Can't simply revert code
- Must decide when to remove old branch

**Scanner Impact:** -140 violations expected (phased as routes modernize)

**Long-term Maintainability:** ✗ POOR
- Dual code paths indefinitely
- Must remember both types work
- Confusion about deprecated vs current
- Technical debt until old path removed

**Pros:**
- Allows gradual route migration
- Services don't change immediately
- Can test both in parallel

**Cons:**
- Unsafe pattern (union types increase bugs)
- Type safety degraded
- Complexity in service logic
- Test burden doubled
- Ongoing technical debt
- Error-prone pattern narrowing
- Should not be kept long-term

---

## Option E: Route-Specific Adapters

**Strategy:** Create per-route or per-service adapter functions that handle the specific conversion pattern for that route.

**Pattern:**
```typescript
// Adapter function for findings service
function adaptCtxToFindingEnvelope(ctx: CanonicalAuthContext): ServiceAuthEnvelope {
  return {
    verifiedActorId: ctx.verifiedActorId,
    verifiedWorkspaceId: ctx.verifiedWorkspaceId,
    verifiedCapabilities: ctx.verifiedCapabilities,
    hasInternalAccess: ctx.policy?.grantedCapabilities.includes("INTERNAL_ACCESS") ?? false,
    verifiedActor: ctx.verifiedActor,
    policy: ctx.policy
  };
}

// Route uses adapter
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    await updateFinding(findingId, input, adaptCtxToFindingEnvelope(ctx));
  }
);
```

**Authorization Safety:** ✓ SAFE
- Adapters follow same pattern as inline
- Encapsulated conversion

**Workspace Isolation Safety:** ✓ SAFE

**Type Safety:** ✓ SAFE

**Risk of Weakening Service Boundary:** ✓ NONE

**Implementation Complexity:** MEDIUM
- Define adapters per service (1-2 per service type)
- 8 routes use adapters
- Slightly more setup than inline

**Compatibility with Existing Tests:** ✓ COMPATIBLE

**Migration Cost:** MEDIUM
- Adapter definitions upfront
- Then routes just call adapters

**Rollback Simplicity:** ✓ SIMPLE
- Adapters are separate, easy to remove

**Scanner Impact:** -140 violations expected

**Long-term Maintainability:** ✓ GOOD
- Adapters are centralized
- Pattern is explicit
- Future routes can reuse adapters
- Less copy-paste than inline

**Pros:**
- More organized than inline adapters
- Reusable per service
- Clear conversion pattern
- DRY (Don't Repeat Yourself)

**Cons:**
- More files/functions
- Slightly more setup
- Still not a unified service contract
- Intermediate approach (neither full refactor nor minimal change)

---

## Comparative Summary

| Criterion | A (Inline Adapter) | B (Full Refactor) | C (VerifiedServiceContext) | D (Dual Format) | E (Service Adapters) |
|-----------|-------------------|-------------------|---------------------------|-----------------|----------------------|
| **Auth Safety** | ✓ Safe | ✓ Safe | ✓ Safe | ⚠ Risky | ✓ Safe |
| **Workspace Safety** | ✓ Safe | ✓ Safe | ✓ Safe | ✓ Safe | ✓ Safe |
| **Type Safety** | ✓ Good | ✓ Good | ✓ Good | ✗ Weak | ✓ Good |
| **Service Boundary Risk** | ✓ None | ✓ None | ✓ None | ⚠ Medium | ✓ None |
| **Implementation Complexity** | Medium | High | Low-Medium | High | Medium |
| **Test Compatibility** | ✓ Yes | ⚠ Partial | ✓ Yes | ✗ No | ✓ Yes |
| **Migration Cost** | Low | Medium | Low | Medium | Medium |
| **Rollback Simplicity** | ✓ Simple | ✗ Complex | ✓ Simple | ✗ Complex | ✓ Simple |
| **Scanner Impact** | -140 (phased) | -140 (phased) | -140 (phased) | -140 (phased) | -140 (phased) |
| **Long-term Maintainability** | Medium | Excellent | Excellent | Poor | Good |
| **Risk Level** | Low | Medium | Low | High | Low |
| **Recommendation** | ✓ Safe Choice | Too Complex | ✓ Best Choice | Avoid | ✓ Good Choice |

---

## Key Decision Factors

**1. Speed to Unblock Routes**
- Option A: Fastest (inline adapters, no service changes)
- Option E: Fast (adapters, no service changes)
- Option C: Medium (minimal service changes, easy tests)
- Option B: Slowest (full refactoring, test rewrites)
- Option D: Not viable

**2. Long-term Code Quality**
- Option C: Best (clean new type, clear intent)
- Option B: Good (unified contract, but complexity to get there)
- Option E: Good (organized adapters)
- Option A: Medium (inline adapters, pattern repetition)
- Option D: Poor (dual paths, ongoing debt)

**3. Risk to Existing Code**
- Option A: Lowest (routes only, services unchanged)
- Option E: Low (adapters only, services unchanged)
- Option C: Low (minimal service changes)
- Option B: Medium (service refactoring)
- Option D: Highest (dual paths, error-prone)

**4. Test Impact**
- Option A: None (routes only, services unchanged)
- Option E: None (adapters only)
- Option C: Minimal (signature change, not logic)
- Option B: High (logic refactoring, new tests)
- Option D: Maximum (dual path testing)

---

## Recommendation

**RECOMMENDED: Option C (VerifiedServiceContext)**

**Rationale:**
1. Balances complexity and long-term quality
2. Low risk (minimal service changes)
3. Clean new type signals intent clearly
4. Easy testing (no service logic changes)
5. Phase-able (1 service at a time)
6. Excellent long-term maintainability
7. Services gain clear boundary type
8. Routes gain clear adapter pattern
9. Type name VerifiedServiceContext is self-documenting

**Backup Choice: Option A (Inline Adapter)**
If speed to implementation is critical over code organization, Option A is safe and fast.

---

## Implementation Sequence (If Choosing Option C)

1. Define `VerifiedServiceContext` in canonical-route-enforcement.ts
2. Update findings.ts service signature: `ServiceAuthEnvelope` → `VerifiedServiceContext`
3. Update findings routes (2) to create adapters
4. Repeat for deliverable.ts (1 service, 1 route)
5. Continue phased for each service
6. Once all routed, remove ServiceAuthEnvelope from exports (eventual cleanup)

---

**Status: READY FOR SELECTION AND DECISION**
