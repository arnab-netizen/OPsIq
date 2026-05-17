# R1-BATCH-1: Authorization Confirmation

**Date:** 2026-05-17  
**Phase:** R1-BATCH-1 Controlled Accelerated Batch Implementation  
**Status:** AUTHORIZATION CONFIRMED - IMPLEMENTATION MAY PROCEED

---

## A. Exact Selected Routes

**Authorized Routes (3 total, PATCH handlers only):**

### Route 1: Contact PATCH
- **File:** src/app/api/clients/[clientId]/contacts/[contactId]/route.ts
- **Handler:** PATCH (lines 25-48)
- **Service Function:** updateContact
- **Current Implementation:** withEnforcementFull + withAuth() + canonicalizeAuthContext()
- **Expected Pattern:** Direct pass of CanonicalAuthContext to service

### Route 2: Engagement PATCH
- **File:** src/app/api/engagements/[engagementId]/route.ts
- **Handler:** PATCH (lines 52-124)
- **Service Function:** updateEngagement
- **Current Implementation:** withEnforcementFull + withAuth() + canonicalizeAuthContext()
- **Expected Pattern:** Direct pass of CanonicalAuthContext to service

### Route 3: Engagement Action PATCH
- **File:** src/app/api/engagements/[engagementId]/actions/[actionId]/route.ts
- **Handler:** PATCH (lines 20-37)
- **Service Function:** updateActionStatus
- **Current Implementation:** withEnforcementFull + withAuth() + canonicalizeAuthContext()
- **Expected Pattern:** Direct pass of CanonicalAuthContext to service

---

## B. Authorized Lane

**Lane:** LANE_A_EXISTING_CANONICAL_SERVICE_INPUT

**Definition:** Direct pass of CanonicalAuthContext to service (no adapter required)

**Service Contract:** All three services already accept CanonicalAuthContext
- updateContact(contactId, input, ctx: CanonicalAuthContext, workspaceId)
- updateEngagement(engagementId, input, ctx: CanonicalAuthContext, workspaceId)
- updateActionStatus(actionId, input, ctx: CanonicalAuthContext, workspaceId)

**Pattern Verification:** Source-inspected and confirmed LANE_A for all 3 routes (R1-ACCEL-0R batch revalidation)

---

## C. Exact Forbidden Files

**No Changes Allowed:**
✗ src/services/* (all service files)
✗ src/lib/canonical-route-enforcement.ts (wrapper implementation)
✗ src/lib/enforced-route.ts (wrapper implementation)
✗ src/lib/auth-guard.ts (auth guard implementation)
✗ src/middleware/* (middleware files)
✗ src/policies/* (policy files)
✗ src/domain/constants/capabilities.ts (capability definitions)
✗ src/lib/db.ts (database client)
✗ prisma/* (schema and migrations)
✗ package.json, package-lock.json (dependencies)
✗ tsconfig.json, next.config.js (configuration)
✗ Any other route files outside the 3 authorized routes

**Handler Restrictions:**
✗ GET handlers (only PATCH, no other methods)
✗ DELETE handlers (only PATCH, no other methods)
✗ POST handlers (only PATCH, no other methods)
✗ PUT/HEAD/PATCH handlers (only PATCH on authorized routes)

---

## D. Exact Allowed Changes (Per Route)

**Contact PATCH (src/app/api/clients/[clientId]/contacts/[contactId]/route.ts):**
✓ Replace wrapper: withEnforcementFull → withCanonicalEnforcement
✓ Remove withAuth() call and import if not used elsewhere
✓ Remove canonicalizeAuthContext() call (if not used elsewhere)
✓ Remove enforceWorkspaceScoping() call (if not used elsewhere)
✓ Update PATCH handler signature: (request, context, params) → (ctx: CanonicalAuthContext, params)
✓ Pass ctx directly to updateContact (no adapter)
✓ Use ctx.verifiedWorkspaceId for workspace isolation
✓ Add requireCapabilities: [CAPABILITIES.CLIENT_UPDATE] to wrapper options
✓ Add requireWorkspace: true to wrapper options

**Engagement PATCH (src/app/api/engagements/[engagementId]/route.ts):**
✓ Same changes as Contact PATCH
✓ Keep idempotency key check (occurs before service call)
✓ Keep interventionPhase redirect check (occurs before service call)

**Engagement Action PATCH (src/app/api/engagements/[engagementId]/actions/[actionId]/route.ts):**
✓ Same changes as Contact PATCH
✓ Simpler than Engagement (no idempotency or special checks)

---

## E. Exact Forbidden Changes

✗ Service file modifications (updateContact, updateEngagement, updateActionStatus signatures unchanged)
✗ Service signature changes (services remain as-is)
✗ GET/DELETE/POST handler modifications (only PATCH handlers modernized)
✗ Response shape changes (return types unchanged)
✗ Business logic changes (service logic preserved)
✗ Capability additions/removals (same capabilities enforced)
✗ Entitlement/role changes (no new entitlements needed)
✗ Workspace scoping changes (wrapper-enforced, not route-enforced)
✗ Feature work (strict modernization only)
✗ Bulk replace (manual per-route modernization)
✗ Any/as any (strict typing maintained)
✗ Weak AuthContext in services (no fallback auth)
✗ Service-side canonicalization (moved to route wrapper)

---

## F. Authorization Status

**Authorization Confirmation:** ✓ YES - IMPLEMENTATION MAY PROCEED

**Authorization Source:**
- R1-ACCEL-0R Final Decision (r1_accel_0r_final_decision.md)
- R1-ACCEL-0R Batch 1 Revalidation (r1_accel_0r_batch1_revalidation.md)
- R1-ACCEL-0R Lane Normalization (r1_accel_0r_lane_normalization.md)

**Authorization Criteria Met:** ✓ YES
- ✓ Lane clearly defined (LANE_A)
- ✓ Routes clearly specified (3 routes, PATCH only)
- ✓ Pattern verified (direct pass, no adapter)
- ✓ Services pre-audited (all accept CanonicalAuthContext)
- ✓ Scope boundaries clear (forbidden files documented)
- ✓ Stop conditions defined
- ✓ Expected reduction specified (~10 violations)

**Confidence Level:** MEDIUM-HIGH (85%+)
- Contact PATCH: HIGH (95%+ - proven pattern R1-SERVICE-3)
- Engagement PATCH: MEDIUM-HIGH (85%+ - source verified)
- Action PATCH: MEDIUM-HIGH (85%+ - source verified)

**Go/No-Go:** ✓ GO - IMPLEMENTATION AUTHORIZED

---

**Status: ✓ R1-BATCH-1 AUTHORIZATION CONFIRMED - IMPLEMENTATION MAY PROCEED**
