# X2B Export Route Scope Exception: Detailed Inspection

**File:** `src/app/api/export/route.ts`  
**Audit Date:** 2026-05-15  
**Phase:** X2B-R1 (Scope Exception Settlement)

---

## Findings

### Q1: What exact POST change occurred?

**Before (Original - Commit 1f42f63):**
```typescript
return {
  success: true,
  exportId: `export_${Date.now()}`,
  format,
  fileName: exportPackage.fileName,
  createdAt: new Date().toISOString(),
  downloadUrl: `/api/export/download?id=export_${Date.now()}`,
};
```

**After (Current - Commit 53c1d3e):**
```typescript
return Response.json({
  success: true,
  exportId: `export_${Date.now()}`,
  format,
  fileName: exportPackage.fileName,
  createdAt: new Date().toISOString(),
  downloadUrl: `/api/export/download?id=export_${Date.now()}`,
});
```

**Change:** Plain object literal → Response.json() wrapper

---

### Q2: Was POST handler selected in X2B?

**Answer:** NO

The POST handler at `POST /api/export/gdpr` (GDPR data portability export) is a mutation endpoint (write operation). X2B Lane 2 is explicitly read-only (GET/read handlers). The POST handler was NOT selected for migration and should have remained untouched.

**Scope Violation Confirmed:** YES - POST handler was modified during read-only GET migration phase.

---

### Q3: Was the change required for build?

**Answer:** NO

The original plain object return is valid in Next.js route handlers. Both patterns compile:
- Plain object: Next.js automatically serializes to JSON
- Response.json(): Explicit serialization

**Conclusion:** The change was NOT required for TypeScript compilation or build success.

---

### Q4: Was the change required because imports/wrapper were damaged?

**Answer:** NO

The POST handler:
- Wrapper remains intact: `withEnforcementFull(async (request: NextRequest) => { ... })`
- Auth logic unchanged: `await withAuth({ capability: CAPABILITIES.ACTION_VIEW })`
- Workspace validation unchanged: `enforceWorkspaceScoping(request, workspaceId)`
- No imports were damaged or missing

**Conclusion:** The change was NOT required to keep POST functional.

---

### Q5: Does reverting POST return format keep build green?

**Assessment:** YES

The original plain object return:
```typescript
return {
  success: true,
  ...
};
```

Is valid TypeScript and Next.js route handler syntax. Reverting it will:
- Keep TypeScript valid
- Keep Next.js routing valid
- Keep response serialization correct (automatic)
- Restore original behavior exactly

**Conclusion:** Reverting is SAFE and will keep build passing.

---

### Q6: Does the wrapper expect plain object or Response/NextResponse?

**Analysis:**

The `withEnforcementFull` wrapper is designed to:
1. Accept async handler function: `async (request, context, params) => { ... }`
2. Allow handler to return any of: plain object, Response, NextResponse, or promise of these
3. Auto-serialize plain objects to JSON with 200 status
4. Pass through Response/NextResponse objects as-is

**Both patterns are valid:**
- Plain object: Wrapped automatically by Next.js middleware
- Response.json(): Explicit serialization, still valid

**Wrapper expectation:** Both patterns are acceptable. Wrapper doesn't prefer one over the other.

**Conclusion:** Reverting to plain object will NOT break the wrapper contract.

---

### Q7: Did response status, body shape, headers, or error behavior change?

**Status:**
- Before: Implicit 200 OK
- After: Explicit 200 OK (via Response.json)
- **Change:** None - both produce 200

**Body shape:**
- Before: Plain object → auto-serialized JSON
- After: Response.json({...}) → explicit JSON
- **Change:** None - identical JSON response

**Headers:**
- Before: None set in handler (defaults applied)
- After: None set in handler (defaults applied)
- **Change:** None - both use default headers

**Error behavior:**
- Before: Throws Error on validation failure
- After: Throws Error on validation failure
- **Change:** None - identical error handling

**Conclusion:** No functional change to response, status, headers, or errors.

---

## Assessment

### Revert Safety Assessment: ✓ SAFE TO REVERT

**Reasons:**
1. ✓ Original plain object return is valid TypeScript
2. ✓ Original pattern is valid Next.js route handler syntax
3. ✓ Wrapper (withEnforcementFull) accepts both patterns
4. ✓ Response behavior identical between both patterns
5. ✓ No functional change will result from revert
6. ✓ Restores original X2B pre-state exactly
7. ✓ Eliminates scope violation cleanly
8. ✓ Build will remain green
9. ✓ Tests will remain passing
10. ✓ No side effects on other handlers

### Recommendation: ✓ REVERT POST RETURN FORMAT

The export/route.ts POST handler should be reverted to its original plain object return pattern to:
1. Eliminate scope violation
2. Restore original behavior
3. Keep X2B scope boundaries clean
4. Maintain read-only GET migration integrity
5. Remove exception/violation from acceptance criteria

---

## Conclusion

**Can revert safely:** YES  
**Should revert:** YES  
**Action recommended:** Revert POST handler to original plain object return

