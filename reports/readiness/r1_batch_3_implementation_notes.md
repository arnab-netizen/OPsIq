# R1-BATCH-3: Implementation Notes

**Date:** 2026-05-17  
**Phase:** R1-BATCH-3 Implementation  
**Status:** HANDLERS MODERNIZED

---

## A. Modernization Summary

**Total Handlers Implemented:** 5 (all LANE_A)

**Pattern Applied:** withCanonicalEnforcement with direct CanonicalAuthContext pass

---

## B. Handler Modernization Details

### Handler 1: src/app/api/evidence-bundles/[bundleId]/route.ts GET

**Before:**
- Wrapper: withEnforcementFull
- Auth: await withAuth({capability: CAPABILITIES.EVIDENCE_VIEW})
- Workspace: request.headers.get("x-workspace-id")
- Service call: getEvidenceBundleById(bundleId, workspaceId)

**After:**
- Wrapper: withCanonicalEnforcement
- Handler signature: async (ctx: CanonicalAuthContext, params: Record<string, string>)
- Auth enforcement: { requireCapabilities: [CAPABILITIES.EVIDENCE_VIEW], requireWorkspace: true }
- Workspace: ctx.verifiedWorkspaceId
- Service call: getEvidenceBundleById(bundleId, workspaceId)
- Status: ✓ MODERNIZED

### Handler 2: src/app/api/evidence-bundles/[bundleId]/route.ts PUT

**Before:**
- Wrapper: withEnforcementFull
- Auth: await withAuth({capability: CAPABILITIES.EVIDENCE_SUBMIT})
- Workspace: request.headers.get("x-workspace-id")
- Service call: updateEvidenceBundle(bundleId, body, canonicalizeAuthContext(authContext, workspaceId), workspaceId)

**After:**
- Wrapper: withCanonicalEnforcement
- Handler signature: async (ctx: CanonicalAuthContext, params: Record<string, string>)
- Auth enforcement: { requireCapabilities: [CAPABILITIES.EVIDENCE_SUBMIT], requireWorkspace: true }
- Workspace: ctx.verifiedWorkspaceId
- Service call: updateEvidenceBundle(bundleId, body, ctx, workspaceId)
- Body parsing: await parseRequestBody(ctx.request!, updateEvidenceBundleSchema)
- Status: ✓ MODERNIZED

### Handler 3: src/app/api/evidence-bundles/[bundleId]/items/route.ts POST

**Before:**
- Wrapper: withEnforcementFull
- Auth: await withAuth({capability: CAPABILITIES.EVIDENCE_SUBMIT})
- Workspace: request.headers.get("x-workspace-id")
- Idempotency: checkIdempotencyKey(..., actorId: authContext.session.user.id, ...)
- Service call: addEvidenceToBundle(bodyData, canonicalizeAuthContext(authContext, workspaceId), workspaceId)

**After:**
- Wrapper: withCanonicalEnforcement
- Handler signature: async (ctx: CanonicalAuthContext, params: Record<string, string>)
- Auth enforcement: { requireCapabilities: [CAPABILITIES.EVIDENCE_SUBMIT], requireWorkspace: true }
- Workspace: ctx.verifiedWorkspaceId
- Idempotency: checkIdempotencyKey(..., actorId: ctx.verifiedActorId, ...)
- Service call: addEvidenceToBundle(bodyData, ctx, workspaceId)
- Body parsing: await parseRequestBody(ctx.request!, addEvidenceToBundleSchema)
- Status: ✓ MODERNIZED

### Handler 4: src/app/api/evidence-bundles/[bundleId]/items/route.ts DELETE

**Before:**
- Wrapper: withEnforcementFull
- Auth: await withAuth({capability: CAPABILITIES.EVIDENCE_SUBMIT})
- Workspace: request.headers.get("x-workspace-id")
- Service call: removeEvidenceFromBundle(bodyData, canonicalizeAuthContext(authContext, workspaceId), workspaceId)

**After:**
- Wrapper: withCanonicalEnforcement
- Handler signature: async (ctx: CanonicalAuthContext, params: Record<string, string>)
- Auth enforcement: { requireCapabilities: [CAPABILITIES.EVIDENCE_SUBMIT], requireWorkspace: true }
- Workspace: ctx.verifiedWorkspaceId
- Service call: removeEvidenceFromBundle(bodyData, ctx, workspaceId)
- Body parsing: await parseRequestBody(ctx.request!, removeEvidenceFromBundleSchema)
- Status: ✓ MODERNIZED

### Handler 5: src/app/api/evidence/[evidenceId]/route.ts PATCH

**Before:**
- Wrapper: withEnforcementFull
- Auth: await withAuth({capability: CAPABILITIES.EVIDENCE_VALIDATE, internalOnly: true})
- Workspace: request.headers.get("x-workspace-id")
- Service call: updateEvidence(evidenceId, body, canonicalizeAuthContext(authContext, workspaceId), workspaceId)

**After:**
- Wrapper: withCanonicalEnforcement
- Handler signature: async (ctx: CanonicalAuthContext, params: Record<string, string>)
- Auth enforcement: { requireCapabilities: [CAPABILITIES.EVIDENCE_VALIDATE], requireWorkspace: true, internalOnly: true }
- Workspace: ctx.verifiedWorkspaceId
- Service call: updateEvidence(evidenceId, body, ctx, workspaceId)
- Body parsing: await parseRequestBody(ctx.request!, updateEvidenceSchema)
- Status: ✓ MODERNIZED

---

## C. Changes Applied to All Handlers

✓ Removed: withEnforcementFull wrapper  
✓ Added: withCanonicalEnforcement wrapper  
✓ Removed: withAuth() + canonicalizeAuthContext() calls  
✓ Changed: Handler signature to (ctx: CanonicalAuthContext, params: Record<string, string>)  
✓ Changed: Workspace from request.headers.get() to ctx.verifiedWorkspaceId  
✓ Changed: Service calls to direct ctx pass (no adapter)  
✓ Added: Authorization enforcement in wrapper options (requireCapabilities + requireWorkspace)  
✓ Changed: Body parsing to use ctx.request! instead of request parameter  

---

## D. Preserved Elements

✓ All handler business logic unchanged  
✓ All response shapes unchanged (Response.json() calls identical)  
✓ All error handling preserved (errorToResponse, logger calls)  
✓ All validation preserved (parseOrThrow, idempotency checks)  
✓ All service calls with correct signatures  
✓ All capability semantics preserved (EVIDENCE_VIEW, EVIDENCE_SUBMIT, EVIDENCE_VALIDATE)  
✓ All workspace isolation enforced (ctx.verifiedWorkspaceId used)  

---

## E. Files Modified

1. src/app/api/evidence-bundles/[bundleId]/route.ts (GET + PUT)
2. src/app/api/evidence-bundles/[bundleId]/items/route.ts (POST + DELETE)
3. src/app/api/evidence/[evidenceId]/route.ts (PATCH)

**Total files modified:** 3  
**Total handlers modernized:** 5  
**Service files modified:** 0 ✓  
**Wrapper implementation modified:** 0 ✓  
**Auth context definitions modified:** 0 ✓  
**Capability definitions modified:** 0 ✓  

---

**Status: ✓ R1-BATCH-3 IMPLEMENTATION COMPLETE - READY FOR VALIDATION**
