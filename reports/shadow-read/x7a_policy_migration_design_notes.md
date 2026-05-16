# X7A: Policy/Internal-Access Migration Design Notes

**Phase:** X7A (Audit + Classification)  
**Date:** 2026-05-15  
**Status:** DESIGN PHASE REQUIRED - NOT READY FOR MIGRATION

---

## Key Findings

### 1. GET Handlers are Already Safe

**Current State:**
- 3 GET handlers already migrated to `withCanonicalEnforcement`
- They use defensive fallback: `ctx.policy ? hasInternalAccess(ctx.policy) : false`
- Pattern is proven, safe, and operational

**Examples:**
- `engagements/route.ts` GET
- `engagements/[engagementId]/route.ts` GET
- `me/route.ts` GET

**Assessment:** ✓ NO MIGRATION NEEDED - Already in safe pattern

---

### 2. POST/PATCH Handlers Need Policy Context

**Current State:**
- ~20-30 POST/PATCH handlers still use `withEnforcementFull + withAuth + policy`
- They need policy context to make decisions (e.g., `internalOnly` flag, role hierarchy checks)
- Cannot migrate without resolving how policy flows through canonical wrapper

**Examples:**
- `engagements/[engagementId]/route.ts` PATCH
- `findings/route.ts` POST
- `findings/[findingId]/route.ts` PATCH

**The Problem:**
```typescript
// Current Pattern (withAuth)
const { session, policy } = await withAuth({ capability: ..., internalOnly: true });
// Now has policy for decision-making

// Target Pattern (withCanonicalEnforcement)
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // But ctx.policy might be undefined!
    // How should policy be computed in wrapper?
    // Where does capability/internalOnly go?
  },
  { requireCapabilities: [...], requireWorkspace: true }
);
```

**Assessment:** ✗ BLOCKED - Design decision required

---

### 3. Service-Level Policy Checks are Separate Layer

**Current State:**
- Services contain policy logic for:
  - Admin overrides
  - Cross-workspace exceptions
  - Role hierarchy checks
  - Custom authorization

**Examples:**
- `updateEngagement` service checks policy for mutations
- `createFinding` service receives policy context
- `admin/workspaces` disable checks policy

**Assessment:** ✗ OUT OF SCOPE - Service refactoring needed (Lane 9+)

---

## Design Questions

### Question 1: Can withCanonicalEnforcement Support Policy Context?

**Option A: Extend Wrapper to Compute Policy**
- Wrapper computes policy from session/workspace
- Pass computed policy to handler as `ctx.policy`
- Risk: Changes wrapper contract, needs comprehensive audit

**Option B: Keep Policy Undefined**
- Wrapper doesn't compute policy
- Handlers use `ctx.policy ? ... : fallback`
- Same as GET defensive pattern
- But POST/PATCH may need policy for security decisions - fallback might weaken auth

**Option C: Separate Wrapper for Policy-Aware Routes**
- Create `withCanonicalEnforcementWithPolicy()` wrapper
- Requires policy computation logic
- Adds complexity, maintains two wrappers

**Recommendation:** Option A - Extend wrapper to compute policy if service-layer patterns can be isolated

---

### Question 2: Does Extending withCanonicalEnforcement Weaken the Contract?

**Current withCanonicalEnforcement Contract:**
```typescript
interface CanonicalAuthContext {
  verifiedSessionSnapshot: SessionInfo;      // Always present
  verifiedActorId: string;                   // Always present
  verifiedWorkspaceId: string;               // If requireWorkspace: true
  verifiedCapabilities: string[];            // If verified
  policy?: PolicyContext;                    // Optional (already!)
  request?: NextRequest;
}
```

**Finding:** Policy is already optional in CanonicalAuthContext! The wrapper doesn't guarantee it.

**Assessment:**
- Policy field exists but is optional
- GET handlers already use fallback (defensive pattern)
- Extension just means wrapper computes and populates it
- Does NOT weaken contract - just uses existing optional field

---

### Question 3: What Should the Migration Recipe Look Like?

**IF Design Confirms Option A (Extend Wrapper):**

```typescript
// Target Pattern for POST/PATCH with Policy
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const policy = ctx.policy!;  // Guaranteed because wrapper computes it
    
    // Now can use policy for security decisions
    if (policy.internalOnly && !hasInternalAccess(policy)) {
      throw new ForbiddenError("Internal only");
    }
    
    // Proceed with mutation
    return result;
  },
  { requireCapabilities: ["..."], requireWorkspace: true, requirePolicy: true }
);
```

**Stop Conditions:**
- If policy computation logic in wrapper becomes complex
- If policy semantics change between wrapper + service
- If service layer still needs separate policy check

---

## Recommended Decision Path

### Phase X7B: POLICY CONTEXT WRAPPER DESIGN

**Scope:** Design phase (NO CODE MIGRATION)

**Questions to Resolve:**
1. Should `withCanonicalEnforcement` compute policy context?
2. If yes, where should policy computation live? (Wrapper or auth utility?)
3. What is the performance impact of computing policy for every request?
4. Should `requirePolicy` be a new wrapper option?
5. How to ensure service-layer policy is consistent with wrapper-level policy?

**Outcome Options:**
- **Option A:** Design approved → proceed to X7C policy mutation pilot
- **Option B:** Design rejected → defer Lane 7, proceed to alternative lane
- **Option C:** Partial design → POST handlers deferred, focus on service layer first

---

## Why This Lane Cannot Proceed Without Design

**The Contract Problem:**
- withCanonicalEnforcement wrapper already has `policy?` field (optional)
- GET handlers use it safely with fallback
- POST/PATCH handlers need it guaranteed (not optional)
- Wrapper needs to be designed to compute it reliably

**The Service Problem:**
- Services have their own policy logic
- Route-level policy and service-level policy must be consistent
- Cannot migrate route level without understanding service-level constraints

**The Scope Problem:**
- Policy is not just auth-guard responsibility
- It's cross-cutting concern (wrapper + service + domain logic)
- Requires architecture-level decision

---

## Recommendation: Defer Lane 7

### Do NOT Proceed with Lane 7 Migration Now

**Reasons:**
1. Design phase required - cannot force selection without it
2. GET handlers already safe - no urgent migration needed
3. POST/PATCH handlers need wrapper design - not ready
4. Service-layer blockers need separate lane planning
5. Policy is architecture-level concern - not route-level migration

### Alternative Path

**Option 1: X7B Design Phase First (RECOMMENDED)**
- Design withCanonicalEnforcement policy support
- Resolve wrapper/service consistency
- Then proceed to X7C pilot migration
- Timeline: Design + 1-2 pilot migrations

**Option 2: Proceed to Lane 8 Audit Instead**
- Skip Lane 7 design for now
- Audit Lane 8 custom workspace auth patterns
- Return to Lane 7 after service-layer work
- Allows forward progress on different scope

**Option 3: Defer All Policy Work to Lane 9**
- Continue with other lanes (8, etc)
- Consolidate all policy/service/governance work in Lane 9
- Requires significant planning for dependencies

---

## Final Assessment

**Lane 7 Status:** ✗ **NOT READY FOR MIGRATION - DESIGN PHASE REQUIRED**

- GET handlers: ✓ Already safe and migrated
- POST/PATCH handlers: ✗ Need wrapper design phase
- Service patterns: ✗ Out of scope for routes, belongs to Lane 9
- Pilot candidates: 0 (no safe migration without design)

**Blockers:**
1. withCanonicalEnforcement policy computation not designed
2. Service-layer policy consistency undefined
3. Wrapper/service contract not established

**Next Phase Recommendation:** X7B Design Phase or Alternative Lane (8)

---

**Status:** ✓ CLASSIFICATION COMPLETE - DESIGN REQUIRED FOR MIGRATION
