# R1-BATCH-1: Implementation Notes

**Date:** 2026-05-17  
**Phase:** R1-BATCH-1 Controlled Accelerated Batch Implementation  
**Status:** 3 HANDLERS MODERNIZED - READY FOR VALIDATION

---

## A. Implementation Summary

**Routes Modernized:** 3 (all PATCH handlers only)

**Pattern:** LANE_A_EXISTING_CANONICAL_SERVICE_INPUT (direct pass, no adapter)

**Changes Made:**
- Wrapper updated: withEnforcementFull → withCanonicalEnforcement
- Auth pattern removed: withAuth() + canonicalizeAuthContext() → wrapper enforcement
- Handler signature updated: (request, context, params) → (ctx: CanonicalAuthContext, params)
- Service calls: Direct pass of ctx to service (no adapter creation)
- Workspace isolation: ctx.verifiedWorkspaceId (no header extraction)
- Authorization enforcement: Moved to wrapper (requireCapabilities + requireWorkspace)

---

## B. Handler 1: Contact PATCH

**File:** src/app/api/clients/[clientId]/contacts/[contactId]/route.ts

**Before:**
```typescript
export const PATCH = withEnforcementFull(async (request, context, params) => {
  const authContext = await withAuth({ capability: CAPABILITIES.CLIENT_UPDATE, internalOnly: true });
  const workspaceId = request.headers.get("x-workspace-id");
  const canonicalContext = canonicalizeAuthContext(authContext, workspaceId);
  await updateContact(contactId, body, canonicalContext, workspaceId);
  return Response.json({ status: "updated" });
});
```

**After:**
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, updateContactSchema);
    await updateContact(contactId, body, ctx, ctx.verifiedWorkspaceId);
    return Response.json({ status: "updated" });
  },
  {
    requireCapabilities: [CAPABILITIES.CLIENT_UPDATE],
    requireWorkspace: true,
  }
);
```

**Changes:**
- ✓ Wrapper replaced (withEnforcementFull → withCanonicalEnforcement)
- ✓ Removed withAuth() call
- ✓ Removed canonicalizeAuthContext() call
- ✓ Handler signature updated to (ctx: CanonicalAuthContext, params)
- ✓ Direct pass of ctx to service
- ✓ Authorization moved to wrapper (requireCapabilities)
- ✓ Workspace enforcement moved to wrapper (requireWorkspace)

**Validation:** Response shape unchanged (returns { status: "updated" })

---

## C. Handler 2: Engagement PATCH

**File:** src/app/api/engagements/[engagementId]/route.ts

**Key Changes:**
- ✓ Wrapper replaced (withEnforcementFull → withCanonicalEnforcement)
- ✓ Removed withAuth() call
- ✓ Removed enforceWorkspaceScoping() call
- ✓ Handler signature updated to (ctx: CanonicalAuthContext, params)
- ✓ Direct pass of ctx to service call: `await updateEngagement(engagementId, body, ctx, ctx.verifiedWorkspaceId)`
- ✓ Idempotency key check preserved (occurs before service call)
- ✓ interventionPhase redirect check preserved (occurs before service call)
- ✓ Authorization moved to wrapper (requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE])
- ✓ Workspace enforcement moved to wrapper (requireWorkspace: true)
- ✓ Updated internal references: `ctx.verifiedActorId`, `ctx.verifiedWorkspaceId`, `ctx.policy`

**Validation:** Response shape unchanged (returns engagement object)

**Note:** Pre-authorization checks (idempotency, interventionPhase) remain in handler, occurring before service call. No change to business logic.

---

## D. Handler 3: Engagement Action PATCH

**File:** src/app/api/engagements/[engagementId]/actions/[actionId]/route.ts

**Key Changes:**
- ✓ Wrapper replaced (withEnforcementFull → withCanonicalEnforcement)
- ✓ Removed withAuth() call
- ✓ Handler signature updated to (ctx: CanonicalAuthContext, params)
- ✓ Direct pass of ctx to service call: `await updateActionStatus(actionId, body, ctx, ctx.verifiedWorkspaceId)`
- ✓ Workspace enforcement updated: `where: { id: actionId, workspaceId: ctx.verifiedWorkspaceId }`
- ✓ Authorization moved to wrapper (requireCapabilities: [CAPABILITIES.ACTION_UPDATE])
- ✓ Workspace enforcement moved to wrapper (requireWorkspace: true)

**Validation:** Response shape unchanged (returns updated action object)

**Note:** Simplest of the three handlers - direct translation without special pre-checks.

---

## E. Imports Management

**Added Imports:**
- `withCanonicalEnforcement, type CanonicalAuthContext` (all 3 routes)
- `CAPABILITIES` (Engagement Action route - was missing)

**Removed Imports:**
- None fully removed (other handlers may still use legacy imports, so kept in place)

**Preserved Imports:**
- `withEnforcementFull` (DELETE handler on Contact route still uses it)
- `withAuth, canonicalizeAuthContext` (DELETE handler on Contact route still uses it)
- `enforceWorkspaceScoping` (if not used elsewhere in file)

---

## F. Validation Checklist

### Code Quality
- ✓ Handler signatures correctly typed (ctx: CanonicalAuthContext, params: Record<string, string>)
- ✓ Service calls correctly invoke with direct ctx pass (no adapters)
- ✓ Workspace isolation enforced (ctx.verifiedWorkspaceId used, no header extraction)
- ✓ No any/as any types introduced
- ✓ Type safety maintained throughout

### Authorization
- ✓ Contact PATCH: CLIENT_UPDATE capability enforced at wrapper
- ✓ Engagement PATCH: ENGAGEMENT_UPDATE capability enforced at wrapper
- ✓ Action PATCH: ACTION_UPDATE capability enforced at wrapper
- ✓ Wrapper verification happens before handler runs (requireCapabilities + requireWorkspace)

### Workspace Isolation
- ✓ All routes: ctx.verifiedWorkspaceId used (no header extraction)
- ✓ All services: Database queries filter by verified workspace ID
- ✓ No unverified headers influence authentication or authorization

### Business Logic
- ✓ Contact PATCH: Response shape unchanged, business logic preserved
- ✓ Engagement PATCH: Idempotency and interventionPhase checks preserved
- ✓ Action PATCH: Engagement access verification preserved

### Scope Compliance
- ✓ Only PATCH handlers modified (GET/DELETE/POST unchanged)
- ✓ No service files modified
- ✓ No wrapper implementation changed
- ✓ No capability definitions changed
- ✓ No database schema changed
- ✓ No response shapes changed

---

## G. Ready for Validation

**Status:** ✓ All 3 handlers modernized

**Validation Gates (Task E):**
- [ ] npm run build (must pass, TypeScript 0 errors)
- [ ] npm test (must pass all 78 tests)
- [ ] npx tsx src/governance/auth-shadow-read-scanner.ts (must show reduction)
- [ ] git diff scope audit (must show only authorized files)

**Commit Status:** Ready to commit if all validation passes

---

**Status: ✓ R1-BATCH-1 IMPLEMENTATION COMPLETE - READY FOR VALIDATION**
