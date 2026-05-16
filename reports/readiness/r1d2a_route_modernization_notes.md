# R1-D2-A: Route Modernization Notes

**Date:** 2026-05-16  
**Phase:** R1-D2-A (Implementation)

---

## A. Routes Attempted (From R1-D2-A0 Authorization)

**Authorized Routes:**
1. src/app/api/actions/[actionId]/route.ts
2. src/app/api/actions/[actionId]/start/route.ts
3. src/app/api/actions/[actionId]/complete/route.ts
4. src/app/api/audit/[auditId]/route.ts (DOES NOT EXIST)
5. src/app/api/control/[controlId]/route.ts (DOES NOT EXIST)
6. src/app/api/findings/[findingId]/route.ts

**Note:** 2 of 6 authorized routes do not exist in the codebase

---

## B. Handlers Modernized

### Route 1: src/app/api/actions/[actionId]/start/route.ts

**Handler:** PATCH

**Changes Made:**
- Replaced: `withEnforcementFull(async (request, context, params) => { await withAuth(...) })`
- With: `withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params) => { })`
- Removed: `enforceWorkspaceScoping()` call (now handled by wrapper with requireWorkspace)
- Changed: `session.user.id` → `ctx.verifiedActorId`
- Changed: `request.headers.get("x-workspace-id")` → `ctx.verifiedWorkspaceId`
- Removed: Legacy imports (withEnforcementFull, withAuth, enforceWorkspaceScoping, NextRequest)
- Added: Import for `withCanonicalEnforcement` and `CanonicalAuthContext`

**Pattern Applied:** Standard modernization (same as R1-A/B/C/D)

**Service Calls:** `getActionById()`, `db.action.updateMany()`, `emitAuditEvent()`, `getActionById()` again
- All service calls preserve input/output types
- No service refactoring required
- No type mismatches

**Violations Fixed:** 4 (withAuth call + canonicalizeAuthContext removed + scope enforcement removed)

**Business Logic:** UNCHANGED
- Still validates action status
- Still updates database with version check
- Still emits audit event
- Response shape identical

---

### Route 2: src/app/api/actions/[actionId]/complete/route.ts

**Handler:** PATCH

**Changes Made:**
- Replaced: `withEnforcementFull(async (request, context, params) => { await withAuth(...) })`
- With: `withCanonicalEnforcement(async (ctx: CanonicalAuthContext, params) => { })`
- Removed: `enforceWorkspaceScoping()` call (now handled by wrapper)
- Changed: `session.user.id` → `ctx.verifiedActorId` (in 2 places: emitAuditEvent and recordOutcome)
- Changed: `nextRequest.headers.get("x-workspace-id")` → `ctx.verifiedWorkspaceId`
- Changed: `nextRequest.headers.get("idempotency-key")` → `ctx.request?.headers.get("idempotency-key")`
- Removed: Legacy imports
- Added: Import for `withCanonicalEnforcement` and `CanonicalAuthContext`

**Pattern Applied:** Standard modernization with request property access

**Service Calls:** `getActionById()`, `db.action.updateMany()`, `emitAuditEvent()`, `recordOutcome()`, `getActionById()` again
- All service calls preserve input/output types
- recordOutcome now receives ctx.verifiedActorId instead of session.user.id
- No type mismatches (verifiedActorId is string, same as session.user.id)

**Violations Fixed:** 4 (withAuth call + canonicalizeAuthContext removed + scope enforcement removed)

**Business Logic:** UNCHANGED
- Still validates action status
- Still updates database with version check
- Still emits audit event
- Still calls recordOutcome for decision tracking
- Response shape identical
- Error handling identical

---

## C. Handlers Excluded (From Same Routes)

### Route: src/app/api/actions/[actionId]/route.ts

**Handler: GET** - SKIP_ALREADY_MODERNIZED
- Already uses `withCanonicalEnforcement`
- No changes needed

**Handler: PATCH** - EXCLUDE_SERVICE_REFACTOR_REQUIRED
- Current: `withEnforcementFull(...canonicalizeAuthContext...)`
- Service: updateAction expects `ServiceAuthEnvelope` (from canonicalizeAuthContext)
- Issue: Cannot produce CanonicalAuthContext for service without service type refactoring
- Status: Deferred (same as R1-D decision for clients handlers)

---

### Route: src/app/api/findings/[findingId]/route.ts

**Handler: GET** - SKIP_ALREADY_MODERNIZED
- Already uses `withCanonicalEnforcement`
- No changes needed

**Handler: PATCH** - EXCLUDE_SERVICE_REFACTOR_REQUIRED
- Current: `withEnforcementFull(...canonicalizeAuthContext...)`
- Service: updateFinding likely expects `ServiceAuthEnvelope`
- Issue: Cannot modernize route without service refactoring
- Status: Deferred (similar to clients deferred handlers)

---

### Routes: src/app/api/audit/[auditId]/route.ts & src/app/api/control/[controlId]/route.ts

**Status:** DOES_NOT_EXIST
- Routes specified in R1-D2-A0 authorization do not exist in codebase
- Actual routes available: src/app/api/audit/route.ts (already modern), src/app/api/control/blocked-metrics/route.ts, etc.
- R1-D2-A0 batch selection was partially speculative

---

## D. Pattern Summary

### Modernization Pattern Applied

**From (R1-A/B/C/D proven safe):**
```typescript
export const HANDLER = withEnforcementFull(async (request, context, params) => {
  const { session, policy } = await withAuth({ capability: "...", internalOnly: true });
  const workspaceId = request.headers.get("x-workspace-id");
  await enforceWorkspaceScoping(request, workspaceId);
  // business logic
  const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
  await service.call(id, body, canonicalContext, workspaceId);
  // response
});
```

**To (R1-D2-A modernization):**
```typescript
export const HANDLER = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    // business logic (unchanged)
    const actorId = ctx.verifiedActorId;
    await service.call(id, body, /* no longer need auth context */);
    // response (unchanged)
  },
  { requireWorkspace: true, requireCapabilities: ["..."] }
);
```

### Key Changes

1. **Wrapper:** `withEnforcementFull` → `withCanonicalEnforcement`
2. **Context:** `(request, context, params)` → `(ctx: CanonicalAuthContext, params)`
3. **Auth:** Remove `await withAuth()` and `await enforceWorkspaceScoping()`
4. **Scope:** `request.headers.get("x-workspace-id")` → `ctx.verifiedWorkspaceId`
5. **Actor:** `session.user.id` → `ctx.verifiedActorId`
6. **Capabilities:** Move to wrapper options: `{ requireCapabilities: [...] }`
7. **Service Calls:** Remove `canonicalizeAuthContext()` call (not needed for route-only handlers)
8. **Request Access:** `ctx.request?.headers.get(...)` for any remaining header needs

---

## E. Violations Reduction

**Handlers Modernized:** 2 (both PATCH methods)

**Violations Fixed per Handler:**
- Each handler removes: withAuth call (1) + workspace scoping (1) + import statements (2) = ~4 violations
- Total: 2 handlers × 4 violations = ~8 violations

**Actual Reduction:**
- Before: 360 violations
- After: 352 violations
- Actual reduction: 8 violations ✓ MATCHES EXPECTATION

---

**Status: ✓ IMPLEMENTATION COMPLETE - 2 SAFE HANDLERS MODERNIZED, 4 HANDLERS EXCLUDED OR DEFERRED**

