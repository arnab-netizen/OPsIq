# R1-SERVICE-2R: Pattern Reconciliation

**Date:** 2026-05-17  
**Phase:** R1-SERVICE-2R Pilot Reconciliation  
**Status:** PATTERN VERIFIED - TWO SAFE PATHS IDENTIFIED

---

## A. R1-SERVICE-2 Exact Pattern Analysis

### Pattern Question 1: Did R1-SERVICE-2 use the ServiceAuthEnvelope adapter pattern?
**A: NO ✗**

Evidence:
- R1-SERVICE-2 route file shows NO ServiceAuthEnvelope adapter creation
- Route passes ctx directly to updateAction: `await updateAction(actionId, body, ctx, ctx.verifiedWorkspaceId);`
- No intermediate adapter object created
- No ServiceAuthEnvelope type imported in route file
- Pattern differs from R1-SERVICE-1 findings route

### Pattern Question 2: Did R1-SERVICE-2 use existing CanonicalAuthContext service alignment?
**A: YES ✓**

Evidence:
- updateAction service signature: `updateAction(actionId, input, authContext: CanonicalAuthContext, workspaceId)`
- Service already typed to accept CanonicalAuthContext directly
- withCanonicalEnforcement wrapper provides CanonicalAuthContext context
- Direct type match - no conversion needed
- Service was already modernized to accept this type

### Pattern Question 3: Was service boundary weakened?
**A: NO ✗**

Evidence:
- updateAction still receives verified context from wrapper
- All verification happens at wrapper (requireCapabilities, requireWorkspace)
- Service never calls withAuth() or canonicalizeAuthContext()
- Service signature unchanged (still expects CanonicalAuthContext)
- Authorization and workspace scoping preserved
- Type safety maintained

### Pattern Question 4: Was service signature changed?
**A: NO ✗**

Evidence:
- Before R1-SERVICE-2: `updateAction(actionId, input, authContext: CanonicalAuthContext, workspaceId)`
- After R1-SERVICE-2: Identical signature
- Service function body unchanged
- No overloads added
- No type modifications

### Pattern Question 5: Was authorization preserved?
**A: YES ✓**

Evidence:
- Authorization moved from `withAuth({ capability: CAPABILITIES.ACTION_UPDATE })` to wrapper
- Wrapper enforces: `requireCapabilities: [CAPABILITIES.ACTION_UPDATE]`
- Verification timing: Before handler runs (same security guarantee)
- No capability broadening
- Authorization semantic preserved exactly

### Pattern Question 6: Was workspace isolation preserved?
**A: YES ✓**

Evidence:
- Workspace enforcement moved from `enforceWorkspaceScoping(nextRequest, workspaceId)` to wrapper
- Wrapper enforces: `requireWorkspace: true`
- Verification timing: Before handler runs (same security guarantee)
- ctx.verifiedWorkspaceId passed to both updateAction and getActionById
- No unverified headers used for workspace inference
- Isolation semantic preserved exactly

### Pattern Question 7: Is this a separate safe path from R1-SERVICE-1?
**A: YES ✓**

Evidence:
- **R1-SERVICE-1 path:** Service expected ServiceAuthEnvelope → Route creates adapter
- **R1-SERVICE-2 path:** Service expected CanonicalAuthContext → Route passes ctx directly
- Both are safe, but different strategies
- Different because services have different input type expectations
- Both preserve authorization and workspace isolation
- Both use identical wrapper pattern

Conclusion: R1-SERVICE-2 reveals a second safe modernization path:
1. **Adapter Path (R1-SERVICE-1 pattern):** For services expecting ServiceAuthEnvelope
2. **Direct Pass Path (R1-SERVICE-2 pattern):** For services expecting CanonicalAuthContext
3. Both paths route through the same wrapper, differ only in service contract

### Pattern Question 8: Should future pilots classify service contract type before implementation?
**A: YES ✓**

Recommendation:
- Pre-audit: Determine what type service expects (ServiceAuthEnvelope vs CanonicalAuthContext vs unknown)
- Route decision: 
  - If service expects ServiceAuthEnvelope → Create adapter (like R1-SERVICE-1)
  - If service expects CanonicalAuthContext → Direct pass (like R1-SERVICE-2)
  - If service expects other type → STOP for design (like some future pilots may require)
- This classification prevents implementation surprises

---

## B. Exact Pattern Classification

**R1-SERVICE-2 Pattern Classification:** EXISTING_CANONICAL_SERVICE_INPUT

**Definition:** Service was already modernized to accept CanonicalAuthContext; route provides it directly via withCanonicalEnforcement wrapper.

**Characteristics:**
- ✓ Wrapper: withCanonicalEnforcement
- ✓ Context: CanonicalAuthContext from wrapper to service
- ✓ Adapter: None (service aligned)
- ✓ Service signature: Unchanged (already accepts CanonicalAuthContext)
- ✓ Authorization: Enforced at wrapper
- ✓ Workspace isolation: Enforced at wrapper
- ✓ Type safety: Strong (no conversion, no any types)

**Safety Profile:** HIGH - Service already expects verified context

**Complexity Profile:** LOW - No adapter layer needed

---

## C. Pattern Comparison Matrix

| Aspect | R1-SERVICE-1 (findings) | R1-SERVICE-2 (actions) |
|--------|--------|---------|
| Service name | updateFinding | updateAction |
| Service input type | ServiceAuthEnvelope | CanonicalAuthContext |
| Pattern required | SERVICE_AUTH_ENVELOPE_ADAPTER | EXISTING_CANONICAL_SERVICE_INPUT |
| Adapter needed | YES | NO |
| Service signature change | NO | NO |
| Service file change | NO | NO |
| Authorization preserved | ✓ YES | ✓ YES |
| Workspace isolated | ✓ YES | ✓ YES |
| Type safety | ✓ HIGH | ✓ HIGH |
| Implementation complexity | MEDIUM | LOW |
| Both safe | ✓ YES | ✓ YES |

---

## D. Two Safe Modernization Paths Identified

### Path A: SERVICE_AUTH_ENVELOPE_ADAPTER (R1-SERVICE-1 Pattern)

**When to use:** Service expects ServiceAuthEnvelope

**Implementation:**
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // Create adapter from context
    const authEnvelope: ServiceAuthEnvelope = {
      verifiedActorId: ctx.verifiedActorId,
      verifiedActorType: ctx.verifiedActorType,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedCapabilities: ctx.verifiedCapabilities,
      hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
      verifiedActor: ctx.verifiedActor,
      policy: ctx.policy,
    };
    
    // Pass adapter to service
    await updateFinding(findingId, body, authEnvelope);
    // ...
  },
  {
    requireCapabilities: [...],
    requireWorkspace: true,
  }
);
```

**Example:** R1-SERVICE-1 findings route

### Path B: EXISTING_CANONICAL_SERVICE_INPUT (R1-SERVICE-2 Pattern)

**When to use:** Service already accepts CanonicalAuthContext

**Implementation:**
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // Pass context directly (no adapter needed)
    await updateAction(actionId, body, ctx, ctx.verifiedWorkspaceId);
    // ...
  },
  {
    requireCapabilities: [...],
    requireWorkspace: true,
  }
);
```

**Example:** R1-SERVICE-2 actions route

---

## E. Service Boundary Strategy

### Current Understanding

**Phase 1 Services (Proven Safe):**
- updateFinding: Expects ServiceAuthEnvelope (requires adapter) ✓
- updateAction: Expects CanonicalAuthContext (direct pass) ✓

**Future Service Discovery Required:**
- clients service: TBD (audit needed for R1-SERVICE-3)
- Other services: Similar audit needed before implementation

### Strategic Implication

The two safe paths mean:
1. **Not all services need the same pattern**
2. **Service contracts vary**
3. **Each service type determines the route pattern needed**
4. **Pre-implementation audit is essential**

---

## F. Lessons from R1-SERVICE-2

### What R1-SERVICE-2 Teaches Us

1. **Service Types Vary:** Not all services accept the same context type
2. **Both Patterns Safe:** Adapter pattern and direct pass both preserve security
3. **Pre-Audit Critical:** Must check service contract BEFORE implementation
4. **No One-Size Fits All:** Future pilots cannot assume same pattern as previous pilots
5. **Flexibility Required:** Route modernization must adapt to existing service contracts

### Implication for R1-SERVICE-3

- Cannot assume R1-SERVICE-3 (clients) uses either path
- Must pre-audit updateClient service signature and input type
- Pattern will depend on whether updateClient expects:
  - ServiceAuthEnvelope → Create adapter (like R1-SERVICE-1)
  - CanonicalAuthContext → Direct pass (like R1-SERVICE-2)
  - Something else → STOP for design

---

## G. Final Reconciliation Verdict

**R1-SERVICE-2 Pattern:** EXISTING_CANONICAL_SERVICE_INPUT ✓

**Safety Assessment:**
- ✓ Authorization preserved
- ✓ Workspace isolation preserved
- ✓ Type safety maintained
- ✓ Service contract respected
- ✓ No weak auth patterns
- ✓ No fallback values
- ✓ Scope audit clean

**R1-SERVICE-2 Acceptance:** FULL ACCEPTANCE ✓

**Strategic Value:** Demonstrates that modernization adapts to existing service contracts; not a fixed single pattern but a family of safe patterns.

**Recommendation:** Future pilots must classify service contract type before implementation, then apply appropriate pattern (adapter vs direct pass vs design change).

---

**Status: ✓ R1-SERVICE-2 PATTERN RECONCILIATION COMPLETE - TWO SAFE PATHS IDENTIFIED FOR FUTURE USE**

