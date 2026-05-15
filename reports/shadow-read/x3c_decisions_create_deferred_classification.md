# X3C: Decisions/Create Deferred Handler Classification

**Handler:** `src/app/api/decisions/create/route.ts` POST  
**Status:** DEFERRED - Governance/Capability Decision Required  
**Date:** 2026-05-15

---

## Current Auth Pattern

```typescript
export const POST = withEnforcementFull(async (request: NextRequest) => {
  const { session } = await withAuth();  // No capability specified
  
  // ... handler logic ...
  
  const capabilityCheck = await assertCapability(workspaceId, "decision_create");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");
  }
  
  // ... mutation logic ...
});
```

---

## Why Migration Blocked: Governance Constraint Analysis

### The Problem

1. **Auth Pattern Mismatch:**
   - Handler uses `withAuth()` with NO capability parameter
   - Capability check happens via `assertCapability(workspaceId, "decision_create")` INSIDE handler
   - This is entitlement-based auth, not capability-based auth

2. **Missing Capability Constant:**
   - `DECISION_CREATE` does not exist in `src/domain/constants/capabilities.ts`
   - Compare to successful Lane 3 migrations:
     - USER_CREATE ✓ exists in CAPABILITIES
     - ACTION_CREATE ✓ exists in CAPABILITIES
     - CLIENT_CREATE ✓ exists in CAPABILITIES
     - LEAD_CREATE ✓ exists in CAPABILITIES
   - Only `decision_create` (lowercase entitlement) exists, not `DECISION_CREATE` (uppercase capability)

3. **Migration Blocker:**
   - To migrate to `withCanonicalEnforcement`, pattern requires:
     ```typescript
     withCanonicalEnforcement({ requireCapabilities: ["DECISION_CREATE"] }, ...)
     ```
   - But DECISION_CREATE doesn't exist
   - Adding it would violate constraint: "NO NEW GOVERNANCE"

---

## Governance/Capability Design Decision Required

### Option 1: Design NEW Capability + Governance Tier
- Add DECISION_CREATE to CAPABILITIES constant
- Update entitlement service to map decision_create → DECISION_CREATE
- Aligns with decision-making governance (separate from action/client/lead CRUD)
- **Cost:** New governance tier, capability infrastructure expansion
- **Benefit:** Consistent pattern, proper separation of concerns
- **Timeline:** Separate governance phase (e.g., Lane 9-10 governance refactor)

### Option 2: Reclassify to Service-Level Auth (Lane 5+)
- Recognize that decision_create is fundamentally a SERVICE governance pattern (entitlements/quotas), not a capability pattern
- Defer to Lane 5+ which handles service-level auth patterns
- Do NOT add DECISION_CREATE to domain capabilities
- Keep using entitlement system for this operation
- **Cost:** Requires service-level auth migration pattern
- **Benefit:** No capability expansion, cleaner separation
- **Timeline:** Depends on Lane 5 design

### Option 3: Mark as G11 Manual Cleanup
- Decisions/create is a special case: complex state machine + entitlement pattern
- Mark as requiring manual governance decision outside automated lanes
- Defer indefinitely until a governance/capability architect reviews and decides
- **Cost:** Technical debt remains
- **Benefit:** No wrong decisions made
- **Timeline:** When governance team is ready

---

## Recommendation: DO NOT MIGRATE IN X3C

**Decision:** Do not add DECISION_CREATE to CAPABILITIES in X3C.

**Rationale:**
1. Violates "NO NEW GOVERNANCE" constraint
2. Requires separate governance design decision
3. Decisions/create may belong to service-tier auth (Lane 5+), not capability-tier auth (Lane 3)
4. Better to defer and make right decision than to add capability hastily

**Future Governance Decision:**
- Requires capability architect to decide:
  - Should DECISION_CREATE be a domain capability?
  - Or should decision_create remain entitlement-based?
  - Or should decisions/create migrate to service-level auth?

**For Now:**
- Leave decisions/create.ts UNTOUCHED
- Handler remains on withEnforcementFull + withAuth() pattern
- Mark in inventory as "GOVERNANCE_DECISION_REQUIRED"
- Do not attempt migration until governance is resolved

---

## Why This is Correct

The "NO NEW GOVERNANCE" constraint exists for good reason:
- Prevents capability inflation
- Prevents ad-hoc auth pattern expansion
- Forces thoughtful governance design
- Keeps auth patterns consistent and auditable

Decisions/create is a legitimate case where the constraint PROTECTS the codebase from a hasty migration that would create technical debt.

---

## Current State Preserved

```
✓ decisions/create.ts is UNCHANGED
✓ witEnforcementFull pattern PRESERVED
✓ decision_create entitlement check PRESERVED
✓ No governance added
✓ No capability inflation
✓ Future decision-makers can design proper solution
```

---

## Future Phase: G12 Governance Refactor

When governance architecture is updated to support entitlement-based mutations alongside capability-based mutations, decisions/create becomes a candidate for:
1. Lane 9: Entitlement-Pattern Mutations, OR
2. Lane 10: Service-Level Auth Consolidation, OR
3. Manual migration with explicit governance expansion

Until then: **DEFERRED_GOVERNANCE_BLOCKER**

---

**Status:** ✓ CORRECTLY DEFERRED  
**Classification:** RUNTIME_ENFORCED_HYBRID (maintained)
