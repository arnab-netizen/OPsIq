# X2D Lane 3: Pilot Execution Plan

**Phase:** X2D (Preflight - Plan only, no migration)  
**Status:** PLANNING ONLY - No Lane 3 migration has occurred  
**Pilot Date:** Ready for X3A when authorized

---

## Pilot Scope

**Selected 3 Low-Risk Mutation Handlers:**
1. `src/app/api/actions/route.ts` - POST (ACTION_CREATE)
2. `src/app/api/clients/route.ts` - POST (CLIENT_CREATE)
3. `src/app/api/leads/route.ts` - POST (LEAD_CREATE)

**Expected Violation Reduction:** 9 (312 → 303)  
**Expected Risk:** LOW (pure create operations, no bridges, no state machines)  
**Scope:** Migration only - no functional changes

---

## Migration Recipe

### For Each Selected Handler

**Current Pattern:**
```typescript
export const POST = withEnforcementFull(async (request: NextRequest) => {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ACTION_CREATE,
    internalOnly: false
  });
  
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) throw new UnauthorizedError("Workspace ID required");
  
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) throw new ForbiddenError("Unauthorized");
  
  const body = await parseRequestBody(request, createActionSchema);
  const result = await createAction(body, { session, policy }, workspaceId);
  return Response.json(result);
});
```

**Target Pattern:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    
    const body = await parseRequestBody(ctx.request, createActionSchema);
    const result = await createAction(body, ctx, workspaceId);
    return Response.json(result);
  },
  { requireCapabilities: ["ACTION_CREATE"], requireWorkspace: true }
);
```

**Key Changes:**
1. Wrapper: `withEnforcementFull` → `withCanonicalEnforcement`
2. Context: Extract from `await withAuth()` → Receive as `ctx: CanonicalAuthContext`
3. Workspace: Manual header read + enforceWorkspaceScoping → `ctx.verifiedWorkspaceId` + wrapper option
4. Auth: Remove manual auth checks → Rely on wrapper validation
5. Service call: Pass `{ session, policy }` → Pass `ctx` directly
6. Imports: Keep only what's needed for service calls

---

## Proof Requirements (Per Handler)

### Unauthenticated Request Fails Closed
```bash
curl -X POST http://localhost:3000/api/actions \
  -H "Content-Type: application/json" \
  -d '{"title":"Test"}'
# Expected: 401 Unauthorized
```

### Missing Capability Fails Closed
```bash
# User without ACTION_CREATE capability tries to create action
# Expected: 403 Forbidden
```

### Wrong Workspace Cannot Mutate
```bash
# User from workspace A tries to create action in workspace B
# Expected: 400/403 Unauthorized
```

### Correct Capability Can Mutate
```bash
# User with ACTION_CREATE in correct workspace creates action
# Expected: 201 Created + valid action response
```

### Response Shape Preserved
```bash
# Verify POST response JSON structure matches original
# - success: boolean
# - actionId: UUID
# - createdAt: ISO timestamp
# - etc (original response fields)
```

### Audit Event Preserved
```bash
# Check audit log for "action.created" event
# Verify: actor_id, workspace_id, action_id, timestamp
```

### Idempotency Preserved
```bash
# Send same request twice with Idempotency-Key header
# Expected: First → 201 Created, Second → 200 OK with same result
```

### Wrapper Contract Respected
```bash
# Verify withCanonicalEnforcement still enforces capability
# Verify x-workspace-id header enforcement works
# Verify error responses are standard HTTP codes
```

---

## Checkpoint Cadence

### Checkpoint 1: Individual Handler Build
- **Action:** Migrate first handler only (actions/route.ts)
- **Validation:** npm run build (0 errors)
- **Rollback Rule:** If build fails, revert immediately

### Checkpoint 2: Scanner Validation
- **Action:** Run scanner after first handler migration
- **Validation:** Scanner shows reduced violations (~309)
- **Rollback Rule:** If violations increase, revert

### Checkpoint 3: Test Suite
- **Action:** Run full test suite
- **Validation:** All tests pass (pre-existing failures excluded)
- **Rollback Rule:** If new failures, investigate then revert if blocking

### Checkpoint 4: Proof Execution
- **Action:** Execute all proof requirements for migrated handler
- **Validation:** All proofs pass (auth, capability, workspace, response, audit, idempotency)
- **Rollback Rule:** If any proof fails, revert and investigate

### Checkpoint 5: Scale to 3 Handlers
- **Action:** After first handler validated, migrate other 2 handlers
- **Validation:** Same as Checkpoint 1-4 for each additional handler
- **Rollback Rule:** If any handler fails validation, revert all

---

## Rollback Rule

**Hard Rule:** If any proof requirement fails, revert entire pilot.

**Execution:**
```bash
git revert <commit-sha>
git push origin claude/verify-execution-hardening-LRoqi
```

**Post-Revert:** File incident ticket for investigation before attempting another pilot.

---

## Scanner Expectations

### Before Pilot
```
Total violations: 312
Violations in actions/route.ts POST: 3
Violations in clients/route.ts POST: 3
Violations in leads/route.ts POST: 3
Total pilot violations: 9
```

### After Pilot (All 3 Handlers)
```
Total violations: 303
Violations removed: 9
Remaining violations: 312 - 9 = 303
Violations in other POST handlers: ~300+
```

---

## Validation Commands

```bash
# Before pilot
npm run build                    # Verify clean build
npx tsx scripts/scan-shadow-reads.js    # Baseline: 312 violations
npm test -- phase-d phase-e phase-f     # Baseline test state

# After each handler migration
npm run build                    # 0 errors required
npx tsx scripts/scan-shadow-reads.js    # Verify reduction ~3 per handler
npm test -- phase-d phase-e phase-f     # No new failures

# After all 3 handlers
git status                       # Verify only route handlers changed
git diff                         # Verify only auth pattern changed
npm run build                    # Final build check
npx tsx scripts/scan-shadow-reads.js    # Final count: 303 violations
npm test -- phase-d phase-e phase-f     # Final test suite
```

---

## Warning

**⚠️ THIS IS A PREFLIGHT PLAN ONLY**

No Lane 3 migration has occurred. This document outlines the exact strategy for the pilot phase when X3A is authorized. The selected 3 handlers are validated as safe for initial mutation migration but remain unmigrated in current state.

**Do not execute this plan without explicit X3A authorization.**

---

## Next Phase Trigger

This pilot execution plan becomes active when:
1. X2D preflight is complete and approved
2. X3A authorization is explicitly given
3. No blocking issues discovered in X2D validation

**Current Status:** Ready for X3A (awaiting authorization)

