# X2B Batch 1: Export Route Scope Audit

**File:** `src/app/api/export/route.ts`  
**Audit Date:** 2026-05-15  
**Phase:** X2B-R (Reconciliation)

## Executive Summary

The export/route.ts file contains a GET handler (selected for Lane 2 migration) and a POST handler (not selected, mutation path). Audit found ONE SCOPE VIOLATION: the POST handler's return statement was modified during the GET-only migration phase.

**Verdict: VIOLATION FOUND - POST handler return statement changed without scope authorization.**

---

## Detailed Findings

### A. GET Handler Migration (Selected - Lane 2)

**Status:** ✓ CLEAN

The GET handler was correctly migrated:
- **Before:** `withEnforcementFull(async (request: NextRequest) => { ... })`
- **After:** `withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => { ... })`

**Changes (correct):**
1. Wrapper changed to withCanonicalEnforcement
2. Removed withAuth() call (enforcement via wrapper)
3. Removed manual workspace validation (enforcement via wrapper)
4. Query param extraction changed from `new URL(request.url)` to `new URL(ctx.request?.url || "")`
5. Workspace ID extraction changed from manual header read to `ctx.verifiedWorkspaceId`
6. Response wrapped in `new NextResponse(...)`

**Assessment:** GET handler migration is clean and correct.

### B. POST Handler Status (NOT Selected - Mutation Path)

**Status:** ✗ VIOLATION - Return statement modified

The POST handler should have been left untouched except for imports needed to keep unmigrated code compilable.

**POST Handler Comparison:**

**Before (Commit 7a9079c - Partial Batch):**
```typescript
export const POST = withEnforcementFull(async (request: NextRequest) => {
  const authContext = await withAuth({ capability: CAPABILITIES.ACTION_VIEW });
  // ... workspace validation, body validation ...
  const exportPackage = createExportPackage(exportedData);

  return {
    success: true,
    exportId: `export_${Date.now()}`,
    format,
    fileName: exportPackage.fileName,
    createdAt: new Date().toISOString(),
    downloadUrl: `/api/export/download?id=export_${Date.now()}`,
  };
});
```

**After (Commit 32a10a4 - Complete Batch):**
```typescript
export const POST = withEnforcementFull(async (request: NextRequest) => {
  const authContext = await withAuth({ capability: CAPABILITIES.ACTION_VIEW });
  // ... workspace validation, body validation ...
  const exportPackage = createExportPackage(exportedData);

  return Response.json({
    success: true,
    exportId: `export_${Date.now()}`,
    format,
    fileName: exportPackage.fileName,
    createdAt: new Date().toISOString(),
    downloadUrl: `/api/export/download?id=export_${Date.now()}`,
  });
});
```

**The Change:**
- Line 155-162: `return { ... };` changed to `return Response.json({ ... });`
- Indentation also changed (extra 2-space indent on closure)

### C. Analysis of Scope Violation

#### 1. Was this change authorized by X2B scope?
**NO.** X2B explicitly states:
- "NO ROUTE MIGRATION" (GET handlers only, not mutation handlers)
- "NO MUTATION MIGRATION" (POST/PATCH/DELETE handlers untouched)

The POST handler is a mutation path (write operation). Only GET handlers are in scope.

#### 2. What changed in the POST handler?
**Functional change:**
- The response serialization was changed
- **Before:** Plain object returned: `return { success: true, ... }`
- **After:** Explicit JSON response: `return Response.json({ ... })`

In Next.js route handlers:
- Both patterns are valid
- Returning a plain object: Next.js automatically serializes to JSON
- Using Response.json(): Explicit, but functionally equivalent

#### 3. Why was this change made?
**Likely reasons:**
1. Consistency with GET handler changes (all handlers now use Response.json)
2. Implicit style cleanup during migration
3. Accidental scope creep during refactoring

**Assessment:** The change appears benign but is OUT OF SCOPE for X2B Lane 2.

#### 4. Is the change harmful?
**Technical impact:** MINIMAL
- Both patterns produce identical HTTP responses
- No security implications
- No functional behavior change
- Backwards compatible (clients see same JSON response)

**Compliance impact:** MODERATE
- Violates explicit X2B scope constraints
- Represents undocumented scope creep
- Sets precedent for modifying non-selected handlers

#### 5. Should this be reverted?
**Assessment:**
- **Revert?** Not necessary - change is correct and improves consistency
- **Document?** YES - violation must be noted in acceptance decision
- **Escalate?** YES - reported to user in acceptance decision

---

## Audit Questions

### Q1: Was only GET migrated?
**Answer:** Technically YES - only the GET wrapper and logic changed. But POST return statement also modified.

### Q2: Was POST/PATCH/DELETE behavior changed?
**Answer:** YES - POST return statement format changed (plain object → Response.json). This is technically a behavioral change, though functionally equivalent.

### Q3: Were imports restored only to keep non-selected handlers intact?
**Answer:** YES - withEnforcementFull and withAuth imports were correctly restored for POST handler.

### Q4: Was withEnforcementFull call in POST changed?
**Answer:** NO - POST wrapper remains `withEnforcementFull(async (request: NextRequest) => { ... })`. Wrapper contract unchanged.

### Q5: Did any mutation/export generation semantics change?
**Answer:** NO - export data construction, GDPR logic, workspace validation all unchanged. Only return format modified.

### Q6: Should any change be reverted or separately tracked?
**Answer:** No revert needed (change is correct). Should be documented as violation in acceptance decision.

---

## Verdict

**EXPORT ROUTE SCOPE AUDIT: VIOLATION FOUND**

**Violation Summary:**
- **Type:** POST handler return statement modified during GET-only migration
- **File:** src/app/api/export/route.ts
- **Lines:** 155-162 (changed from plain object to Response.json)
- **Severity:** MEDIUM
- **Scope Compliance:** VIOLATED
- **Technical Correctness:** CORRECT (change is valid, improves consistency)
- **Impact:** Minimal (backwards compatible, functionally equivalent)

**Recommendation:**
- **Accept:** The change is technically correct and beneficial
- **Document:** Clearly note the violation in final acceptance decision
- **No Revert:** Response.json is the correct pattern for Next.js route handlers
- **Learning:** Scope boundaries around non-selected handlers should be more strictly maintained

---

## Pattern Review

The POST handler should have looked like this (unchanged except imports):
```typescript
export const POST = withEnforcementFull(async (request: NextRequest) => {
  // Authenticate
  const authContext = await withAuth({ capability: CAPABILITIES.ACTION_VIEW });
  // ... rest of handler unchanged ...
  return {  // ← Plain object, unchanged
    success: true,
    exportId: `export_${Date.now()}`,
    // ...
  };
});
```

But instead it was changed to:
```typescript
return Response.json({  // ← Changed: Response.json wrapper added
  success: true,
  exportId: `export_${Date.now()}`,
  // ...
});
```

This represents scope creep, though the change itself is benign and correct.

