# R1-SPECIAL-1D-BATCH-2: Implementation Notes

**Date:** 2026-05-17  
**Phase:** R1-SPECIAL-1D-BATCH-2 Implementation  
**Status:** IMPLEMENTATION COMPLETE

---

## A. Handlers Modernized (5 Total)

### 1. src/app/api/override/route.ts (POST)
**Pattern:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK

**Changes:**
- ✓ Wrapper: withEnforcementFull → withCanonicalEnforcement
- ✓ Handler signature: (request: NextRequest) → (ctx: CanonicalAuthContext)
- ✓ Route-local logic: resolveServerRole() + canEdit() preserved exactly
- ✓ Audit logic: AUTH_FAILED, PERMISSION_DENIED, OVERRIDE_DENIED, OVERRIDE_APPROVED preserved exactly
- ✓ Service calls: getItems(), addOverride(), applyOverride() unchanged
- ✓ Actor ID: session.user.id → ctx.verifiedActorId
- ✓ Request access: request.json() → ctx.request!.json()

**Preserved Semantics:**
- Multi-point audit pattern intact
- Policy checks (canEdit) remain in route-local logic
- Business logic (override validation, state capture) unchanged

---

### 2. src/app/api/users/[userId]/roles/route.ts (POST)
**Pattern:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK

**Changes:**
- ✓ Wrapper: withEnforcementFull → withCanonicalEnforcement
- ✓ Handler signature: (request, context, params) → (ctx: CanonicalAuthContext, params: Record<string, string>)
- ✓ Route-local logic: getActorHierarchyLevel() preserved exactly
- ✓ Hierarchy-based authorization: policy object reconstructed for getActorHierarchyLevel (role + capabilities)
- ✓ Idempotency logic: checkIdempotencyKey() + recordIdempotency* preserved exactly
- ✓ Service call: assignRole() unchanged
- ✓ Workspace ID: x-workspace-id header → ctx.verifiedWorkspaceId
- ✓ Actor ID: session.user.id → ctx.verifiedActorId
- ✓ Actor level: getActorHierarchyLevel(policy) preserved with reconstructed policy

**Preserved Semantics:**
- Hierarchy-based permission checks intact
- Idempotency pattern unchanged
- Role assignment business logic unchanged

---

### 3. src/app/api/users/[userId]/roles/route.ts (DELETE)
**Pattern:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK

**Changes:**
- ✓ Wrapper: withEnforcementFull → withCanonicalEnforcement
- ✓ Handler signature: (request, context, params) → (ctx: CanonicalAuthContext, params: Record<string, string>)
- ✓ Route-local logic: getActorHierarchyLevel() preserved exactly
- ✓ Hierarchy-based authorization: policy object reconstructed for getActorHierarchyLevel
- ✓ Service call: revokeRole() unchanged
- ✓ Workspace ID: x-workspace-id header → ctx.verifiedWorkspaceId
- ✓ Actor ID: session.user.id → ctx.verifiedActorId
- ✓ Actor level: getActorHierarchyLevel(policy) preserved

**Preserved Semantics:**
- Hierarchy checks intact
- Role revocation business logic unchanged

---

### 4. src/app/api/users/[userId]/memberships/route.ts (POST)
**Pattern:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK

**Changes:**
- ✓ Wrapper: withEnforcementFull → withCanonicalEnforcement
- ✓ Handler signature: (request, context, params) → (ctx: CanonicalAuthContext, params: Record<string, string>)
- ✓ Route-local logic: No explicit policy functions (bridge pattern)
- ✓ Idempotency logic: checkIdempotencyKey() + recordIdempotency* preserved exactly
- ✓ Service call: addMember() - ctx passed directly (replaces canonicalizeAuthContext helper)
- ✓ Workspace ID: x-workspace-id header → ctx.verifiedWorkspaceId
- ✓ Actor ID: session.user.id → ctx.verifiedActorId
- ✓ Context conversion: canonicalizeAuthContext({ session, policy }, workspaceId) → ctx

**Preserved Semantics:**
- Bridge pattern (workspace membership) unchanged
- Idempotency pattern unchanged
- Member addition business logic unchanged

---

### 5. src/app/api/users/[userId]/memberships/route.ts (DELETE)
**Pattern:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK

**Changes:**
- ✓ Wrapper: withEnforcementFull → withCanonicalEnforcement
- ✓ Handler signature: (request, context, params) → (ctx: CanonicalAuthContext, params: Record<string, string>)
- ✓ Route-local logic: No explicit policy functions
- ✓ Service call: removeMember() - ctx passed directly
- ✓ Workspace ID: x-workspace-id header → ctx.verifiedWorkspaceId
- ✓ Actor ID: session.user.id → ctx.verifiedActorId
- ✓ Context conversion: canonicalizeAuthContext({ session, policy }, workspaceId) → ctx

**Preserved Semantics:**
- Bridge pattern unchanged
- Member removal business logic unchanged

---

## B. D4 Strategy Implementation

**Wrapper Pattern:** ✓ withCanonicalEnforcement (all 5 handlers)

**Handler Signature Pattern:** ✓ (ctx: CanonicalAuthContext, params?) (all applicable)

**Verified Context Usage:**
- ✓ ctx.verifiedActorId (replaces all session.user.id references)
- ✓ ctx.verifiedWorkspaceId (replaces all x-workspace-id header reads)
- ✓ ctx.verifiedCapabilities (used for policy reconstruction where needed)
- ✓ ctx.request! (for request body parsing)

**Route-Local Policy Preservation:**
- ✓ resolveServerRole() - called as-is (override)
- ✓ canEdit() - called as-is (override)
- ✓ getActorHierarchyLevel() - called with reconstructed policy object (roles POST/DELETE)
- ✓ Audit logic - all audit event types preserved exactly

**Defense-in-Depth:**
- ✓ Wrapper enforces capabilities via requireCapabilities parameter
- ✓ Route-local policy logic remains as secondary validation (canEdit, getActorHierarchyLevel)
- ✓ Service layer receives verified context, preventing downstream spoofing

---

## C. Changes NOT Made (Per Authorization)

**Service Files:** ✓ NOT CHANGED  
**Service Signatures:** ✓ NOT CHANGED (assignRole, revokeRole, addMember, removeMember - all accept same params)  
**Capabilities:** ✓ NOT CHANGED (USER_ASSIGN_ROLE, ENGAGEMENT_MANAGE_MEMBERS already exist)  
**Roles:** ✓ NOT CHANGED  
**Entitlements:** ✓ NOT CHANGED  
**Database/Schema:** ✓ NOT CHANGED  

---

## D. Implementation Artifact Summary

**Files Modified:** 3
1. src/app/api/override/route.ts (1 handler modernized)
2. src/app/api/users/[userId]/roles/route.ts (2 handlers modernized)
3. src/app/api/users/[userId]/memberships/route.ts (2 handlers modernized)

**Total Handlers Modernized:** 5

**Import Changes:**
- override: removed withAuth, kept withEnforcementFull import changed to withCanonicalEnforcement
- roles: removed withAuth, enforceWorkspaceScoping, added resolveServerRole import
- memberships: removed withAuth, canonicalizeAuthContext, enforceWorkspaceScoping, kept imports minimal

**Code Deletions:** withAuth() calls, x-workspace-id header reads (replaced with verified context)

**Code Additions:** withCanonicalEnforcement wrappers, policy object reconstruction (roles only), verified context references

---

**Status: ✓ BATCH 2 IMPLEMENTATION COMPLETE - ALL 5 HANDLERS MODERNIZED**
