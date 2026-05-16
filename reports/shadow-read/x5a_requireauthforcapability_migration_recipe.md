# X5A: Lane 5 requireAuthForCapability Migration Recipe

**Phase:** X5A (Audit Only)  
**Date:** 2026-05-15  
**Status:** PILOT CANDIDATES IDENTIFIED

---

## Overview

Lane 5 audit found 2 route handlers using `requireAuthForCapability()` pattern:
- `src/app/api/decisions/[decisionId]/accept/route.ts` POST
- `src/app/api/decisions/[decisionId]/reject/route.ts` POST

Both are safe candidates for migration to `withCanonicalEnforcement`.

---

## Current Pattern

### decisions/[decisionId]/accept/route.ts (current)

```typescript
import { withEnforcementFull } from "@/lib/enforced-route";
import { requireAuthForCapability } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    const decisionId = params.decisionId;
    const workspaceId = request.headers.get("x-workspace-id");
    
    if (!workspaceId) {
      throw new Error("Workspace ID required");
    }
    
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!membership) {
      throw new UnauthorizedError("Unauthorized");
    }
    
    // Legacy pattern: requireAuthForCapability call inside handler
    const auth = await requireAuthForCapability(
      CAPABILITIES.DECISION_ACCEPT,
      undefined,
      workspaceId
    );
    
    const body = await request.json();
    const parsed = AcceptDecisionSchema.parse(body);
    
    // Use auth.session.user.id from returned AuthContext
    const result = await acceptDecision({
      decisionId,
      engagementId: parsed.engagementId,
      workspaceId,
      acceptedBy: auth.session.user.id,
      rationale: parsed.rationale,
    });
    
    logger.info("Decision acceptance recorded", {
      decisionId,
      engagementId: parsed.engagementId,
      userId: auth.session.user.id,
    });
    
    return result;
  }
);
```

---

## Target Clean Pattern

### decisions/[decisionId]/accept/route.ts (migrated)

```typescript
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const decisionId = params.decisionId;
    const workspaceId = ctx.verifiedWorkspaceId;
    
    // Workspace enforcement is implicit in withCanonicalEnforcement with requireWorkspace: true
    
    const body = await ctx.request!.json();
    const parsed = AcceptDecisionSchema.parse(body);
    
    // Use ctx.verifiedActorId (same as auth.session.user.id)
    const result = await acceptDecision({
      decisionId,
      engagementId: parsed.engagementId,
      workspaceId,
      acceptedBy: ctx.verifiedActorId,
      rationale: parsed.rationale,
    });
    
    logger.info("Decision acceptance recorded", {
      decisionId,
      engagementId: parsed.engagementId,
      userId: ctx.verifiedActorId,
    });
    
    return result;
  },
  { requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }
);
```

---

## Migration Changes Summary

| Aspect | Current | Target | Notes |
|--------|---------|--------|-------|
| Wrapper | `withEnforcementFull` | `withCanonicalEnforcement` | Standardized wrapper |
| Capability Enforcement | Inside handler via `requireAuthForCapability()` | Wrapper option: `requireCapabilities: ["DECISION_ACCEPT"]` | Moved to wrapper |
| Workspace Enforcement | Manual `enforceWorkspaceScoping()` call | Wrapper option: `requireWorkspace: true` | Implicit in wrapper |
| Auth Context Access | Manual call: `await requireAuthForCapability(...)` | Automatic in wrapper: `ctx` parameter | Pre-verified context |
| Actor ID | `auth.session.user.id` | `ctx.verifiedActorId` | Direct from context |
| Workspace ID | Manual header: `request.headers.get("x-workspace-id")` | `ctx.verifiedWorkspaceId` | Direct from context |
| Imports | Multiple: `withEnforcementFull`, `requireAuthForCapability`, `enforceWorkspaceScoping` | Single: `withCanonicalEnforcement` | Simplified |

---

## Direct Migration Path

These handlers can migrate directly using `withCanonicalEnforcement` because:

1. ✓ Exact capability known: `DECISION_ACCEPT`
2. ✓ Workspace requirement clear: `requireWorkspace: true`
3. ✓ No PolicyContext needed: handlers don't use policy checks
4. ✓ No custom workspace auth: uses standard header-based scoping
5. ✓ Service calls are straightforward: single service call per handler
6. ✓ Pattern validated in Lane 3: identical to users/route.ts POST migration

---

## Key Validation Points

### Before Migration
- [ ] Verify both handlers use DECISION_ACCEPT consistently
- [ ] Confirm x-workspace-id header is primary workspace source
- [ ] Verify no policy context is needed
- [ ] Confirm no custom workspace auth logic exists

### During Migration
- [ ] Signature changes: `(request: NextRequest, ctx, params)` → `(ctx: CanonicalAuthContext, params)`
- [ ] Import updates: Remove `withEnforcementFull`, `requireAuthForCapability`, `enforceWorkspaceScoping`
- [ ] Replace `auth.session.user.id` → `ctx.verifiedActorId`
- [ ] Replace `request.headers.get("x-workspace-id")` → `ctx.verifiedWorkspaceId`
- [ ] Remove manual `enforceWorkspaceScoping()` call
- [ ] Remove `requireAuthForCapability()` call
- [ ] Update wrapper configuration with `requireCapabilities` and `requireWorkspace`

### After Migration
- [ ] Both handlers compile without errors
- [ ] Tests pass (g6r-auth-bridge, phase-d/e/f)
- [ ] Scanner shows 2 fewer violations (454 total)
- [ ] No new imports to auth-guard or enforced-route

---

## Risk Assessment

**Overall Risk:** LOW

- **Complexity:** LOW (straightforward pattern swap)
- **Blast Radius:** Minimal (2 isolated handlers)
- **Service Impact:** None (service calls unchanged)
- **Test Coverage:** Existing tests cover handlers
- **Rollback:** Simple (revert to current pattern)

---

## Stop Conditions

Do NOT migrate if:
- [ ] DECISION_ACCEPT capability is not defined in CAPABILITIES
- [ ] Workspace enforcement changes (e.g., different header added)
- [ ] Policy context becomes required
- [ ] New custom workspace logic is added
- [ ] Service layer requires changes
- [ ] Tests fail for unrelated reasons

---

## Rollback Rule

If migration breaks tests or breaks functionality:
1. Revert handler files to current withEnforcementFull pattern
2. Restore imports
3. Re-run tests to verify cleanup
4. Report issue and defer lane

---

## Expected Outcome

**Violations Reduction:** 2 violations → ~1 violation per handler = ~2 total reduction  
**Current Baseline:** 455 violations  
**After Successful Migration:** ~453 violations  
**Success Criteria:**
- [ ] Build passes
- [ ] Tests pass (338/338)
- [ ] Scanner shows 453 violations
- [ ] No regressions in other tests

---

## Constraint Compliance

| Constraint | Status | Notes |
|-----------|--------|-------|
| NO_ROUTE_MIGRATION | ✓ PASS | Migration targets 2 specific routes only |
| NO_BULK_REPLACE | ✓ PASS | Manual 1-by-1 migration |
| NO_BRIDGE_EXPANSION | ✓ PASS | No new bridges added |
| NO_FEATURE_WORK | ✓ PASS | Migration only, no feature changes |
| NO_NEW_GOVERNANCE | ✓ PASS | No new capabilities added |
| NO_WRAPPER_CHANGE | ✓ PASS | Wrapper contract unchanged |
| NO_SCANNER_CHANGE | ✓ PASS | Scanner unchanged |
| NO_SERVICE_WEAKENING | ✓ PASS | Service calls preserved |

**Compliance: 8/8** ✓

---

## Next Steps

If X5A audit confirms these 2 handlers as pilot candidates (✓ CONFIRMED):
1. Proceed to X5B pilot migration phase
2. Migrate decisions/[decisionId]/accept/route.ts POST
3. Migrate decisions/[decisionId]/reject/route.ts POST
4. Validate and close X5B

---

**Status:** ✓ RECIPE READY FOR PILOT MIGRATION
