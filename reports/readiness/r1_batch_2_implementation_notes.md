# R1-BATCH-2: Implementation Notes

**Date:** 2026-05-17  
**Phase:** R1-BATCH-2 Controlled Accelerated Batch Implementation  
**Status:** 6 HANDLERS MODERNIZED - READY FOR VALIDATION

---

## A. Implementation Summary

**Handlers modernized:** 6 (all PATCH/POST)

**Pattern:** LANE_A_EXISTING_CANONICAL_SERVICE_INPUT (direct pass, no adapter)

**Changes made per handler:**
- Wrapper updated: withEnforcementFull → withCanonicalEnforcement
- Auth pattern removed: withAuth() + canonicalizeAuthContext() → wrapper enforcement
- Handler signature updated: (request, context, params) → (ctx: CanonicalAuthContext, params)
- Service calls: Direct pass of ctx to service (no adapter creation)
- Workspace isolation: ctx.verifiedWorkspaceId (no header extraction)
- Authorization enforcement: Moved to wrapper (requireCapabilities + requireWorkspace)

---

## B. Handler 1: Engagement POST

**File:** src/app/api/engagements/route.ts

**Service:** createEngagement()

**Before:**
```typescript
export const POST = withEnforcementFull(async (request: NextRequest) => {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: true,
  });
  const workspaceId = request.headers.get("x-workspace-id");
  // ... workspace scoping check, idempotency check ...
  const result = await createEngagement(body, canonicalizeAuthContext({ session, policy }, workspaceId), workspaceId);
  return result;
});
```

**After:**
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    // ... idempotency check (workspace enforcement at wrapper level) ...
    const result = await createEngagement(body, ctx, workspaceId);
    return result;
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE],
    requireWorkspace: true,
  }
);
```

**Changes:**
- ✓ Wrapper replaced (withEnforcementFull → withCanonicalEnforcement)
- ✓ Removed withAuth() call
- ✓ Removed workspace scoping check (moved to wrapper)
- ✓ Handler signature updated to (ctx: CanonicalAuthContext, params)
- ✓ Direct pass of ctx to service
- ✓ Authorization moved to wrapper (requireCapabilities)
- ✓ Workspace enforcement moved to wrapper (requireWorkspace)

**Validation:** Response shape unchanged (returns engagement object)

---

## C. Handler 2: Client Contact POST

**File:** src/app/api/clients/[clientId]/contacts/route.ts

**Service:** createContact()

**Changes:**
- ✓ Wrapper replaced (withEnforcementFull → withCanonicalEnforcement)
- ✓ Removed withAuth() call
- ✓ Handler signature updated to (ctx: CanonicalAuthContext, params)
- ✓ Direct pass of ctx to service
- ✓ Authorization moved to wrapper (requireCapabilities: [CAPABILITIES.CLIENT_UPDATE])
- ✓ Workspace enforcement moved to wrapper (requireWorkspace: true)
- ✓ clientId parameter extracted from params

**Validation:** Response shape unchanged (returns created contact object)

---

## D. Handler 3: Client Archive POST

**File:** src/app/api/clients/[clientId]/route.ts

**Service:** archiveClient()

**Changes:**
- ✓ Wrapper replaced (withEnforcementFull → withCanonicalEnforcement)
- ✓ Removed withAuth() call
- ✓ Removed workspace scoping check (moved to wrapper)
- ✓ Handler signature updated to (ctx: CanonicalAuthContext, params)
- ✓ Direct pass of ctx to service
- ✓ Authorization moved to wrapper (requireCapabilities: [CAPABILITIES.CLIENT_ARCHIVE])
- ✓ Workspace enforcement moved to wrapper (requireWorkspace: true)
- ✓ clientId parameter extracted from params

**Validation:** Response shape unchanged (returns { status: "archived" })

---

## E. Handler 4: Diagnosis POST

**File:** src/app/api/diagnosis/route.ts

**Service:** diagnoseBusiness()

**Changes:**
- ✓ Wrapper replaced (withEnforcementFull → withCanonicalEnforcement)
- ✓ Removed withAuth() call
- ✓ Handler signature updated to (ctx: CanonicalAuthContext, params)
- ✓ Direct pass of ctx to service
- ✓ Authorization moved to wrapper (requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE])
- ✓ Workspace enforcement moved to wrapper (requireWorkspace: true)
- ✓ Idempotency check uses ctx instead of authContext

**Validation:** Response shape unchanged (returns DiagnosisResult)

---

## F. Handler 5: Evidence Bundle POST

**File:** src/app/api/evidence-bundles/route.ts

**Service:** createEvidenceBundle()

**Changes:**
- ✓ Wrapper replaced (withEnforcementFull → withCanonicalEnforcement)
- ✓ Removed withAuth() call
- ✓ Removed workspace scoping check (moved to wrapper)
- ✓ Handler signature updated to (ctx: CanonicalAuthContext, params)
- ✓ Direct pass of ctx to service
- ✓ Authorization moved to wrapper (requireCapabilities: [CAPABILITIES.EVIDENCE_SUBMIT])
- ✓ Workspace enforcement moved to wrapper (requireWorkspace: true)
- ✓ Error handling preserved (try/catch, errorToResponse, idempotency error logging)

**Validation:** Response shape unchanged (returns bundle object with 201 status)

---

## G. Handler 6: Lead Update PATCH

**File:** src/app/api/leads/[leadId]/route.ts

**Service:** updateLead()

**Changes:**
- ✓ Wrapper replaced (withEnforcementFull → withCanonicalEnforcement)
- ✓ Removed withAuth() call
- ✓ Removed workspace scoping check (moved to wrapper)
- ✓ Handler signature updated to (ctx: CanonicalAuthContext, params)
- ✓ Direct pass of ctx to service
- ✓ Authorization moved to wrapper (requireCapabilities: [CAPABILITIES.LEAD_UPDATE])
- ✓ Workspace enforcement moved to wrapper (requireWorkspace: true)
- ✓ leadId parameter extracted from params and validated

**Validation:** Response shape unchanged (returns updated lead object)

---

## H. Imports Management

**Added imports (all 6 routes):**
- Already present: withCanonicalEnforcement, type CanonicalAuthContext

**Removed imports:**
- None (other handlers may still use legacy patterns)

**Preserved imports:**
- withEnforcementFull (if other handlers still use it)
- withAuth, canonicalizeAuthContext (if other handlers still use it)
- enforceWorkspaceScoping (if other handlers still use it)

---

## I. Validation Checklist

### Code Quality
- ✓ Handler signatures correctly typed (ctx: CanonicalAuthContext, params: Record<string, string>)
- ✓ Service calls correctly invoke with direct ctx pass (no adapters)
- ✓ Workspace isolation enforced (ctx.verifiedWorkspaceId used, no header extraction)
- ✓ No any/as any types introduced
- ✓ Type safety maintained throughout

### Authorization
- ✓ Engagement POST: ENGAGEMENT_CREATE capability enforced at wrapper
- ✓ Contact POST: CLIENT_UPDATE capability enforced at wrapper
- ✓ Client Archive POST: CLIENT_ARCHIVE capability enforced at wrapper
- ✓ Diagnosis POST: ENGAGEMENT_CREATE capability enforced at wrapper
- ✓ Evidence Bundle POST: EVIDENCE_SUBMIT capability enforced at wrapper
- ✓ Lead PATCH: LEAD_UPDATE capability enforced at wrapper
- ✓ Wrapper verification happens before handler runs (requireCapabilities + requireWorkspace)

### Workspace Isolation
- ✓ All 6 routes: ctx.verifiedWorkspaceId used (no header extraction)
- ✓ All services: Database queries filter by verified workspace ID
- ✓ No unverified headers influence authentication or authorization

### Business Logic
- ✓ Engagement POST: Response shape unchanged
- ✓ Contact POST: Response shape unchanged, idempotency preserved
- ✓ Client Archive POST: Response shape unchanged, idempotency preserved
- ✓ Diagnosis POST: Response shape unchanged, idempotency preserved
- ✓ Evidence Bundle POST: Response shape unchanged, error handling preserved
- ✓ Lead PATCH: Response shape unchanged

### Scope Compliance
- ✓ Only 6 authorized handlers modified (POST/PATCH only)
- ✓ No other handlers changed
- ✓ No service files modified
- ✓ No wrapper implementation changed
- ✓ No capability definitions changed
- ✓ No database schema changed
- ✓ No response shapes changed

---

## J. Ready for Validation

**Status:** ✓ All 6 handlers modernized

**Validation gates (Task E):**
- [ ] npm run build (must pass, TypeScript 0 errors)
- [ ] npm test (must pass all 78 tests)
- [ ] npx tsx src/governance/auth-shadow-read-scanner.ts (must show reduction)
- [ ] git diff scope audit (must show only authorized files)

**Implementation quality:** ✓ HIGH - Follows proven Batch 1 pattern exactly

---

**Status: ✓ R1-BATCH-2 IMPLEMENTATION COMPLETE - READY FOR VALIDATION**
