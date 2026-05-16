# X9C-4R: findings.ts Service Behavior Audit

**Date:** 2026-05-15  
**Status:** AUDIT COMPLETE  
**Verdict:** ✓ PASS

---

## Service Refactor Overview

**Service:** src/services/findings.ts  
**Scope:** Pilot service #1  
**Functions Refactored:** 7  
**Auth Pattern Change:** CanonicalAuthContext + auth-guard calls → ServiceAuthEnvelope

---

## Auth-Guard Import Removal Verification

### Before X9C-4
```typescript
import { requireCapabilityForService } from "@/lib/auth-guard";
import { requireServiceContext } from "@/lib/service-auth";
```

### After X9C-4
✓ Both imports removed  
✓ No longer present in file  
✓ Scanner violation reduced (1 removed)

**Verdict:** ✓ PASS - Auth-guard imports successfully removed

---

## Function-by-Function Audit

### Function 1: createFinding()

**Before:**
```typescript
export async function createFinding(
  input: CreateFindingInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ id: string; engagementId: string }>
```

**After:**
```typescript
export async function createFinding(
  input: CreateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<{ id: string; engagementId: string }>
```

**Changes Audit:**
- ✓ Signature changed from (input, authContext, workspaceId) to (input, auth)
- ✓ Now uses `auth.verifiedWorkspaceId` instead of workspaceId parameter
- ✓ Capability check changed: `auth.verifiedCapabilities.has(CAPABILITIES.FINDING_CREATE)` instead of `requireCapabilityForService()`
- ✓ Actor ID sourced from `auth.verifiedActorId` (verified, not from request)
- ✓ Audit event includes verified actor ID and workspace ID
- ✓ Error handling preserved: Still throws ForbiddenError on missing capability
- ✓ Business logic preserved: Create operation unchanged

**Verdict:** ✓ PASS - Function correctly refactored

### Function 2: updateFinding()

**Before:**
```typescript
export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ id: string }>
```

**After:**
```typescript
export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<{ id: string }>
```

**Changes Audit:**
- ✓ Signature simplified: workspaceId now sourced from `auth.verifiedWorkspaceId`
- ✓ Capability check: `auth.verifiedCapabilities.has(CAPABILITIES.FINDING_UPDATE)`
- ✓ Workspace scoping preserved: Still validates finding belongs to workspace
- ✓ Audit event includes verified actor and workspace
- ✓ Error behavior: ForbiddenError on missing capability, NotFoundError if not in workspace
- ✓ Business logic: Update operation unchanged

**Verdict:** ✓ PASS - Function correctly refactored

### Function 3: validateFinding()

**Before:**
```typescript
export async function validateFinding(
  findingId: string,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ id: string }>
```

**After:**
```typescript
export async function validateFinding(
  findingId: string,
  auth: ServiceAuthEnvelope
): Promise<{ id: string }>
```

**Changes Audit:**
- ✓ Requires `FINDING_VALIDATE` capability (checked via `auth.verifiedCapabilities.has()`)
- ✓ Workspace scope enforced: Finding must exist in verified workspace
- ✓ No service-side canonicalization
- ✓ Error handling: ForbiddenError for missing capability
- ✓ Business logic: Validation logic unchanged

**Verdict:** ✓ PASS - Function correctly refactored

### Function 4: disputeFinding()

**Before:** Used CanonicalAuthContext with workspaceId parameter  
**After:** Uses ServiceAuthEnvelope

**Changes Audit:**
- ✓ Requires `FINDING_VALIDATE` capability
- ✓ Workspace scope enforced
- ✓ Verified actor ID used for audit trail
- ✓ Business logic preserved

**Verdict:** ✓ PASS - Function correctly refactored

### Function 5: supersedeFinding()

**Before:** Used CanonicalAuthContext with workspaceId parameter  
**After:** Uses ServiceAuthEnvelope

**Changes Audit:**
- ✓ Requires `FINDING_CREATE` and `FINDING_UPDATE` capabilities
- ✓ Workspace scope enforced for both old and new findings
- ✓ Verified actor ID used throughout
- ✓ Business logic preserved

**Verdict:** ✓ PASS - Function correctly refactored

### Function 6: linkEvidenceToFinding()

**Before:**
```typescript
export async function linkEvidenceToFinding(
  findingId: string,
  evidenceId: string,
  maybeAuthContext?: AuthContext,
  workspaceId?: string
): Promise<{ id: string }>
```

**After:**
```typescript
export async function linkEvidenceToFinding(
  findingId: string,
  evidenceId: string,
  auth: ServiceAuthEnvelope
): Promise<{ id: string }>
```

**Changes Audit:**
- ✓ No longer accepts optional AuthContext
- ✓ Now requires ServiceAuthEnvelope (mandatory)
- ✓ Requires `FINDING_LINK_EVIDENCE` capability
- ✓ Workspace scope enforced
- ✓ Verified actor ID for audit
- ✓ Business logic preserved

**Verdict:** ✓ PASS - Function signature strengthened

### Function 7: unlinkEvidenceFromFinding()

**Before:** Accepted optional AuthContext  
**After:** Requires ServiceAuthEnvelope

**Changes Audit:**
- ✓ No longer accepts optional auth
- ✓ Requires ServiceAuthEnvelope (mandatory)
- ✓ Requires `FINDING_UNLINK_EVIDENCE` capability
- ✓ Workspace scope enforced
- ✓ Verified actor ID for audit
- ✓ Business logic preserved

**Verdict:** ✓ PASS - Function signature strengthened

---

## Service-Level Audit Results

### Auth Boundary Compliance
- ✓ Service does NOT import auth-guard functions
- ✓ Service does NOT call requireCapabilityForService()
- ✓ Service does NOT call requireServiceContext()
- ✓ Service does NOT accept CanonicalAuthContext
- ✓ Service does NOT canonicalize auth internally
- ✓ Service does NOT re-verify workspace membership (trusts verified facts)

### Type Safety
- ✓ No `any` type coercions
- ✓ No `as any` patterns
- ✓ ServiceAuthEnvelope properly imported
- ✓ All capability checks use `auth.verifiedCapabilities.has()`
- ✓ All workspace references use `auth.verifiedWorkspaceId`
- ✓ All actor references use `auth.verifiedActorId`

### Business Logic Preservation
- ✓ Create/update/validate logic unchanged
- ✓ Audit events emit same data (actor, workspace, payload)
- ✓ Error messages preserved
- ✓ Response shapes preserved
- ✓ Database operations unchanged
- ✓ Re-evaluation triggers unchanged

### Required Capabilities Unchanged
- ✓ FINDING_CREATE still required for createFinding
- ✓ FINDING_UPDATE still required for updateFinding
- ✓ FINDING_VALIDATE still required for validateFinding, disputeFinding, supersedeFinding
- ✓ Evidence link/unlink capabilities still required
- ✓ No new capabilities introduced
- ✓ No capability weakening

---

## Verdict Summary

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Auth-guard imports removed | ✓ PASS | Verified in git diff |
| Service accepts AuthContext | ✗ NO | All params are ServiceAuthEnvelope or business inputs |
| Service-side canonicalization | ✗ NO | Uses verified facts from envelope |
| Forbidden patterns present | ✗ NO | No any/as any/requireCapability found |
| Capability checks correct | ✓ PASS | All use auth.verifiedCapabilities.has() |
| Workspace enforcement | ✓ PASS | All queries scoped to auth.verifiedWorkspaceId |
| Business logic preserved | ✓ PASS | All 7 functions maintain pre-refactor behavior |
| Type safety enforced | ✓ PASS | No type coercions, all readonly fields respected |
| Error handling preserved | ✓ PASS | ForbiddenError/NotFoundError unchanged |

---

## X9C-4R Findings Service Audit Result

**Verdict: ✓✓✓ PASS**

findings.ts successfully refactored to accept ServiceAuthEnvelope. All 7 functions maintain business logic integrity while moving auth responsibility to route layer. Auth-guard imports removed. Type safety and error handling preserved. No forbidden patterns detected.

**Classification remains:** RUNTIME_ENFORCED_HYBRID
