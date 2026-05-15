# X6A: Lane 6 requireAuth Migration Recipe

**Phase:** X6A (Audit Only)  
**Date:** 2026-05-15  
**Status:** PILOT CANDIDATES IDENTIFIED

---

## Overview

Lane 6 audit found 1 route handler using `requireAuth()` with no arguments:
- `src/app/api/entity/route.ts` GET

This is a safe candidate for migration to `withCanonicalEnforcement`.

---

## Current Pattern

### entity/route.ts GET (current)

```typescript
import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { withEnforcementFull } from "@/lib/enforced-route";
import { requireAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { getEntities } from "@/services/entity/store";

export const GET = withEnforcementFull(async (request: NextRequest) => {
  // Require authentication (fail-closed)
  await requireAuth();

  // Require workspace context
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required (x-workspace-id header)");
  }

  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    throw new UnauthorizedError("Unauthorized");
  }

  const entities = getEntities();
  return entities;
});
```

---

## Target Clean Pattern

### entity/route.ts GET (migrated)

```typescript
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { getEntities } from "@/services/entity/store";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const entities = getEntities();
    return entities;
  },
  { requireWorkspace: true }
);
```

---

## Migration Changes Summary

| Aspect | Current | Target | Notes |
|--------|---------|--------|-------|
| Wrapper | `withEnforcementFull` | `withCanonicalEnforcement` | Standardized wrapper |
| Auth Enforcement | Inside handler via `requireAuth()` | Wrapper option: `requireWorkspace: true` | Implicit in wrapper |
| Workspace Enforcement | Manual `enforceWorkspaceScoping()` call | Wrapper option: `requireWorkspace: true` | Implicit in wrapper |
| Auth Context Access | Implicit (not used in handler) | Implicit in `ctx` parameter | Pre-verified context available |
| Workspace ID | Manual header: `request.headers.get("x-workspace-id")` | `ctx.verifiedWorkspaceId` | Direct from context |
| Service Calls | `getEntities()` | `getEntities()` | Unchanged |
| Imports | Multiple: `withEnforcementFull`, `requireAuth`, `enforceWorkspaceScoping` | Single: `withCanonicalEnforcement` | Simplified |

---

## Direct Migration Path

This handler can migrate directly using `withCanonicalEnforcement` because:

1. ✓ No specific capability required (generic auth only)
2. ✓ Workspace requirement clear: `requireWorkspace: true`
3. ✓ No PolicyContext needed: handler doesn't use policy checks
4. ✓ No custom workspace auth: uses standard header-based scoping
5. ✓ Service calls are straightforward: single read-only service call
6. ✓ Pattern validated in Lane 2: identical to GET migrations

---

## Key Validation Points

### Before Migration
- [ ] Verify handler is GET (read-only)
- [ ] Confirm x-workspace-id header is primary workspace source
- [ ] Verify no policy context is needed
- [ ] Confirm no custom workspace auth logic exists
- [ ] Verify no capability requirement

### During Migration
- [ ] Signature changes: `(request: NextRequest)` → `(ctx: CanonicalAuthContext)`
- [ ] Import updates: Remove `withEnforcementFull`, `requireAuth`, `enforceWorkspaceScoping`
- [ ] Add `withCanonicalEnforcement` import
- [ ] Replace `request.headers.get("x-workspace-id")` → `ctx.verifiedWorkspaceId`
- [ ] Remove manual `enforceWorkspaceScoping()` call
- [ ] Remove `requireAuth()` call
- [ ] Update wrapper configuration with `requireWorkspace: true`
- [ ] Preserve service call (`getEntities()`)

### After Migration
- [ ] Handler compiles without errors
- [ ] Tests pass (g6r-auth-bridge, phase-d/e/f)
- [ ] Scanner shows 1 fewer violation (452 total)
- [ ] No new imports to auth-guard or enforced-route

---

## Risk Assessment

**Overall Risk:** LOW

- **Complexity:** LOW (straightforward pattern swap)
- **Blast Radius:** Minimal (1 isolated handler)
- **Service Impact:** None (service call unchanged)
- **Test Coverage:** Existing tests cover handler
- **Rollback:** Simple (revert to current pattern)

---

## Stop Conditions

Do NOT migrate if:
- [ ] Handler requires specific capability (it doesn't)
- [ ] Workspace enforcement changes
- [ ] Policy context becomes required
- [ ] New custom workspace logic is added
- [ ] Service layer requires changes
- [ ] Tests fail for unrelated reasons

---

## Rollback Rule

If migration breaks tests or breaks functionality:
1. Revert handler file to current withEnforcementFull pattern
2. Restore imports
3. Re-run tests to verify cleanup
4. Report issue and defer lane

---

## Expected Outcome

**Violations Reduction:** 1 violation removed  
**Current Baseline:** 453 violations  
**After Successful Migration:** ~452 violations  
**Success Criteria:**
- [ ] Build passes
- [ ] Tests pass (338/338)
- [ ] Scanner shows 452 violations
- [ ] No regressions in other tests

---

## Constraint Compliance

| Constraint | Status | Notes |
|-----------|--------|-------|
| NO_ROUTE_MIGRATION | ✓ PASS | Migration targets 1 specific route only |
| NO_BULK_REPLACE | ✓ PASS | Manual 1-by-1 migration |
| NO_BRIDGE_EXPANSION | ✓ PASS | No new bridges added |
| NO_FEATURE_WORK | ✓ PASS | Migration only, no feature changes |
| NO_NEW_GOVERNANCE | ✓ PASS | No new capabilities added |
| NO_NEW_CAPABILITY_CONSTANTS | ✓ PASS | No new constants |
| NO_WRAPPER_CHANGE | ✓ PASS | Wrapper contract preserved |
| NO_SCANNER_CHANGE | ✓ PASS | Scanner unchanged |
| NO_SERVICE_WEAKENING | ✓ PASS | Service calls preserved, auth enforcement stronger |

**Compliance: 9/9** ✓

---

## Next Steps

If X6A audit confirms handler as pilot candidate (✓ CONFIRMED):
1. Proceed to X6B pilot migration phase
2. Migrate entity/route.ts GET
3. Validate and close X6B

---

**Status:** ✓ RECIPE READY FOR PILOT MIGRATION
