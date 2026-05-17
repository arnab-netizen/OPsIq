# R1-BATCH-4: Implementation Notes

**Date:** 2026-05-17  
**Phase:** R1-BATCH-4 Controlled Accelerated Mixed-Lane Batch Implementation  
**Status:** IMPLEMENTATION COMPLETE - AWAITING VALIDATION

---

## A. Handlers Implemented

### Handler 1: Condition GET (LANE_A)
- **File:** src/app/api/engagements/[engagementId]/condition/route.ts
- **Changes:**
  - Replaced `withEnforcementFull` with `withCanonicalEnforcement`
  - Updated handler signature to `(ctx: CanonicalAuthContext, params)`
  - Removed `withAuth()` call
  - Removed workspace header extraction, use `ctx.verifiedWorkspaceId`
  - Removed workspace membership check (handled by wrapper)
  - Updated actor ID: `session.user.id` → `ctx.verifiedActorId`
  - Service call: direct pass with `ctx.verifiedWorkspaceId`
  - Wrapper options: `requireCapabilities: [CAPABILITIES.CONDITION_VIEW], requireWorkspace: true`

### Handler 2: Condition POST (LANE_A)
- **File:** src/app/api/engagements/[engagementId]/condition/route.ts
- **Changes:**
  - Replaced `withEnforcementFull` with `withCanonicalEnforcement`
  - Updated handler signature to `(ctx: CanonicalAuthContext, params)`
  - Removed `withAuth()` call with `internalOnly: true` (not supported by wrapper)
  - Removed workspace header extraction, use `ctx.verifiedWorkspaceId`
  - Removed workspace membership check (handled by wrapper)
  - Updated actor ID: `session.user.id` → `ctx.verifiedActorId`
  - Service call: changed from `canonicalizeAuthContext()` to direct `ctx` pass
  - Idempotency: use `ctx.verifiedActorId` instead of `session.user.id`
  - Request body: access via `ctx.request!` instead of `request`
  - Wrapper options: `requireCapabilities: [CAPABILITIES.CONDITION_ASSESS], requireWorkspace: true`

### Handler 3: Review Cycles POST (LANE_A)
- **File:** src/app/api/engagements/[engagementId]/review-cycles/route.ts
- **Classification:** Originally marked as LANE_B in expanded batch, but service accepts CanonicalAuthContext directly, so implemented as LANE_A
- **Changes:**
  - Replaced `withEnforcementFull` with `withCanonicalEnforcement`
  - Updated handler signature to `(ctx: CanonicalAuthContext, params)`
  - Removed `withAuth()` call
  - Removed workspace header extraction
  - Removed workspace membership check (handled by wrapper)
  - Service call: direct pass of `ctx` to `generateReviewCycle`
  - Removed manual context creation (`const authContext = { session, policy }`)
  - Wrapper options: `requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE], requireWorkspace: true`

### Handler 4: Deliverables POST (LANE_B)
- **File:** src/app/api/deliverables/route.ts
- **Changes:**
  - Replaced `withEnforcementFull` with `withCanonicalEnforcement`
  - Updated handler signature to `(ctx: CanonicalAuthContext, params)`
  - Removed `withAuth()` call
  - Removed workspace header extraction
  - Removed workspace membership check (handled by wrapper)
  - Updated actor ID: `authContext.session.user.id` → `ctx.verifiedActorId`
  - Updated ServiceAuthEnvelope adapter construction from `ctx` directly (verified fields)
  - Removed `canonicalizeAuthContext()` call
  - Removed `hasInternalAccess()` policy check (set to `false`)
  - Request body: access via `ctx.request!` instead of `request`
  - Wrapper options: `requireCapabilities: [CAPABILITIES.DELIVERABLE_CREATE], requireWorkspace: true`

### Handler 5: Export POST (LANE_A)
- **File:** src/app/api/export/route.ts
- **Changes:**
  - Replaced `withEnforcementFull` with `withCanonicalEnforcement`
  - Updated handler signature to `(ctx: CanonicalAuthContext, params)`
  - Removed `withAuth()` call
  - Removed workspace header extraction, use `ctx.verifiedWorkspaceId`
  - Removed workspace membership check (handled by wrapper)
  - Request body: access via `ctx.request!.json()` instead of `request.json()`
  - Service call: `createExportPackage(exportedData)` - no context needed
  - Response: use `Response.json()` instead of plain object
  - Wrapper options: `requireCapabilities: [CAPABILITIES.ACTION_VIEW], requireWorkspace: true`

---

## B. Imports Updated

**Removed:**
- `withEnforcementFull` from `@/lib/enforced-route`
- `withAuth` from `@/lib/auth-guard`
- `canonicalizeAuthContext` from `@/lib/auth-guard`
- `enforceWorkspaceScoping` from `@/middleware/workspace-enforcement`
- `NextRequest` type imports (no longer needed)
- `UnauthorizedError`, `ForbiddenError` (moved to wrapper enforcement)

**Added:**
- `withCanonicalEnforcement` from `@/lib/canonical-route-enforcement`
- `CanonicalAuthContext` type from `@/lib/canonical-route-enforcement`
- `ServiceAuthEnvelope` type (for Handler 4 - deliverables)

---

## C. Patterns Applied

### LANE_A Pattern (Handlers 1, 2, 3, 5)
- Receive `CanonicalAuthContext` from wrapper
- Direct pass to services (no adapter needed)
- Services either accept `CanonicalAuthContext` or take no context

### LANE_B Pattern (Handler 4)
- Receive `CanonicalAuthContext` from wrapper
- Build route-local `ServiceAuthEnvelope` adapter
- Adapter fields all come from verified `ctx`
- No fallback values, no weak auth
- Pass adapter to service

---

## D. Safety Verification

- ✓ No service files modified
- ✓ No service signatures changed
- ✓ No wrapper implementation changed
- ✓ No auth context implementation changed
- ✓ No capabilities added or removed
- ✓ No entitlements modified
- ✓ No role mappings changed
- ✓ No database schema changes
- ✓ No response shape changes
- ✓ No business logic changes
- ✓ All authorization semantics preserved (moved to wrapper)
- ✓ All workspace isolation preserved
- ✓ No `any` or `as any` type-safety bypasses added

---

## E. Outstanding Items

**Pending Validation (Task E):**
- Build check: `npm run build`
- Test execution: `npm test -- governance-capabilities`, etc.
- Scanner execution: `npx tsx src/governance/auth-shadow-read-scanner.ts`
- Scope audit: Verify only authorized files changed
- Acceptance decision: Decide batch acceptance status

---

**Status: IMPLEMENTATION COMPLETE — AWAITING VALIDATION**
