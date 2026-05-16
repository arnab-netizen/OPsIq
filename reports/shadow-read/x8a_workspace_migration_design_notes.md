# X8A: Custom Workspace Auth Migration Design Notes

**Phase:** X8A (Audit + Classification)  
**Date:** 2026-05-15  
**Status:** DESIGN PHASE REQUIRED - NOT READY FOR MIGRATION

---

## Key Findings

### 1. Workspace Enforcement Pattern (30-40 handlers)

**Current State:**
- POST/PATCH handlers extract `workspaceId` from request header
- Call `enforceWorkspaceScoping(request, workspaceId)` to check membership
- Use `withAuth()` for capability checks
- All still use `withEnforcementFull` wrapper

**Examples:**
- `engagements/[engagementId]/route.ts` PATCH
- `engagements/[engagementId]/condition/route.ts` POST
- `engagements/[engagementId]/shock-events/route.ts` POST

**The Problem:**
```typescript
// Current Pattern (withEnforcementFull + enforceWorkspaceScoping)
export const PATCH = withEnforcementFull(async (request: NextRequest) => {
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) throw new Error("Workspace required");
  
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) throw new UnauthorizedError("Unauthorized");
  
  const { session, policy } = await withAuth({ capability: ... });
  // Now proceed with mutation
});

// Target Pattern (withCanonicalEnforcement)?
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    // Workspace enforcement already done in wrapper!
    // Now proceed with mutation
  },
  { requireCapabilities: [...], requireWorkspace: true }
);
```

**Key Question:** Does `requireWorkspace: true` actually enforce membership, or does it just verify workspace header exists?

**Assessment:** ✗ BLOCKED - Design decision required

---

### 2. Custom Role Resolution Pattern (5-10 handlers)

**Current State:**
- Some routes use `resolveServerRole()` instead of capability checks
- Custom role-based auth for special operations (admin actions)
- Cannot use standard capability enforcement

**Examples:**
- `admin/workspaces/[id]/disable/route.ts` (needs admin role check)
- `entity/route.ts` POST (uses `resolveServerRole` + `canEdit`)

**The Problem:**
```typescript
// Current Pattern (Custom Role Check)
export const POST = withEnforcementFull(async (request) => {
  const role = await resolveServerRole();
  if (!role) throw new UnauthorizedError("Unauthorized");
  
  if (!canEdit(role)) throw new Error("Insufficient permissions");
  // Proceed
});

// Target Pattern (with Canonical)?
// Cannot use withCanonicalEnforcement because it's capability-based,
// not role-based. Custom role needs separate handling.
```

**Assessment:** ✗ OUT OF SCOPE - Custom role pattern requires separate design

---

## Design Questions

### Question 1: What Does `requireWorkspace: true` Actually Enforce?

**Current Understanding:**
- `withCanonicalEnforcement` with `requireWorkspace: true` verifies workspace header
- Extracts `verifiedWorkspaceId` from header
- But does NOT validate user membership in that workspace

**The Gap:**
- `enforceWorkspaceScoping()` validates actual membership
- `requireWorkspace: true` may not be equivalent
- Removing `enforceWorkspaceScoping()` could weaken tenant isolation

**Question for Architecture:**
- Should `requireWorkspace: true` also validate membership? 
- Or should membership be a separate concern?
- If separate, how should POST/PATCH handlers access membership validation?

---

### Question 2: Should Custom Roles Integrate with Canonical Wrapper?

**Option A: Separate Wrapper for Role-Based Routes**
- Create `withCanonicalRoleEnforcement()` for admin/special operations
- Keeps role-based and capability-based auth separate
- Simpler, less risk of confusion

**Option B: Extend withCanonicalEnforcement to Support Roles**
- Add `requireRoles` option alongside `requireCapabilities`
- Single wrapper for both capability and role checks
- More unified, but more complex

**Option C: Keep Custom Role Resolution in Route Handlers**
- Don't migrate role-based routes to new wrapper
- Keep special handling manual
- Simplest, but doesn't advance modernization

**Recommendation:** Option A - Separate wrapper for role-based routes

---

## Recommended Decision Path

### Phase X8B: WORKSPACE/ROLE WRAPPER DESIGN

**Scope:** Design phase (NO CODE MIGRATION)

**Questions to Resolve:**
1. Does `requireWorkspace: true` validate membership, or just verify workspace header?
2. If not, how should membership validation be integrated?
3. Should custom role resolution be integrated into withCanonicalEnforcement?
4. If yes, how to unify capability-based and role-based auth?
5. Should separate wrapper exist for role-based routes?

**Outcome Options:**
- **Option A:** Design approved → proceed to X8C workspace mutation pilot
- **Option B:** Design rejected → defer Lane 8, move to alternative lane
- **Option C:** Partial design → some handlers ready, others deferred

---

## Why This Lane Cannot Proceed Without Design

**The Membership Problem:**
- Current code explicitly validates workspace membership via `enforceWorkspaceScoping()`
- withCanonicalEnforcement may not provide same guarantee
- Removing membership check could weaken tenant isolation
- Architecture-level decision needed

**The Role Problem:**
- Custom role resolution (resolveServerRole) is separate from capability auth
- Cannot force into capability-based pattern without analysis
- Some operations genuinely need role-based auth
- Requires custom role wrapper design

**The Scope Problem:**
- Workspace and role are distinct concerns
- Both are architectural, not just route-level migration
- Require consistency across wrapper, service, and domain logic
- Cannot migrate without understanding full contract

---

## Recommendation: Defer Lane 8

### Do NOT Proceed with Lane 8 Migration Now

**Reasons:**
1. Design phase required - cannot force selection without it
2. Workspace membership enforcement may weaken if not carefully designed
3. Custom role resolution requires separate architecture work
4. Both are architectural-level decisions
5. Risk of weaken ing tenant isolation is significant

### Alternative Path

**Option 1: X8B Design Phase (If Lane 8 Priority)**
- Design workspace membership enforcement in wrapper
- Design custom role handling separate from capabilities
- Plan migration recipe
- Then proceed to X8C pilot migration
- Timeline: Design + 1-2 pilot migrations

**Option 2: Proceed to Lane 9 Contract Blocker Audit (RECOMMENDED)**
- Skip Lane 8 design for now
- Audit Lane 9 service/contract blockers
- Understand service-layer dependencies
- Can return to Lane 8 after service clarity
- Allows forward progress on different scope

**Option 3: Consolidate Workspace/Policy/Role Work**
- Consolidate Lanes 7, 8, and role work into single design phase
- Unified auth architecture across capabilities, policies, roles, workspaces
- Requires comprehensive planning but cleaner architecture

---

## Final Assessment

**Lane 8 Status:** ✗ **NOT READY FOR MIGRATION - DESIGN PHASE REQUIRED**

- Workspace enforcement: ✗ Needs design (membership validation)
- Custom role resolution: ✗ Needs design (separate from capabilities)
- Pilot candidates: 0 (no safe migration without design)

**Blockers:**
1. Workspace membership enforcement not designed in canonical wrapper
2. Custom role auth integration undefined
3. Wrapper/service contract not established

**Next Phase Recommendation:** X8B Design Phase or Lane 9 Contract Audit

---

**Status:** ✓ CLASSIFICATION COMPLETE - DESIGN REQUIRED FOR MIGRATION
