# Phase 2: Canonical Error Contract Implementation

## Context
After TASK A-C of contract definition:
1. Wrapper modified to use `classifiedError.statusCode` instead of hardcoded 500
2. Scanner enhanced with violation classification
3. Baseline shows 69 violations classified as:
   - 59 success_only_response_return (safe for Phase 2)
   - 7 custom_status_response_return (now fixable with error contract)
   - 2 custom_header_or_cookie_response_return (deferred)
   - 1 redirect_stream_file_response_return (deferred)

## Canonical Wrapped Handler Contract (ESTABLISHED)

### Success Case
```typescript
export const GET = withCanonicalEnforcement(async (ctx) => {
  return { ok: true, data: [...] }; // Plain object
  // Wrapper returns: HTTP 200 + JSON.stringify(result)
});
```

### Error Case (WITH STATUS CODE)
```typescript
export const GET = withCanonicalEnforcement(async (ctx) => {
  if (!found) {
    throw new NotFoundError("Resource", id); // statusCode: 404
  }
  if (invalid) {
    throw new BadRequestError("Invalid input"); // statusCode: 400
  }
  // Wrapper catches and returns: HTTP {statusCode} + safe JSON
});
```

### Error Hierarchy (Pre-existing)
- UnauthorizedError: 401
- ForbiddenError: 403
- BadRequestError: 400
- ValidationError: 400
- NotFoundError: 404
- ConflictError: 409
- DuplicateSubmissionError: 409
- InvalidStateTransitionError: 400
- OptimisticLockError: 409
- PolicyViolationError: 403
- PlanLimitError: 429
- TooManyRequestsError: 429
- ServiceUnavailableError: 503

## Phase 2 Route Categories

### Category A: Success-Only Response Returns (59 routes)
**Safe for immediate Phase 2 execution**

Pattern: `return Response.json(data)` (no custom status code)
Fix: `return data` (plain object)

Examples:
- app/api/actions/[actionId]/complete/route.ts
- app/api/clients/[clientId]/contacts/route.ts
- app/api/organizations/[orgId]/members/route.ts
- (and 56 more)

### Category B: Custom Status Response Returns (7 routes)
**NOW FIXABLE with error contract**

Pattern: `return Response.json({error}, {status: 404/400})` in error path
Fix strategy:
1. Identify which path returns custom status
2. Convert error return to thrown ClassifiedApiError
3. Keep success return as plain object

Affected routes (custom_status_response_return):
1. app/api/engagements/[engagementId]/experiments/[experimentId]/approve/route.ts
2. app/api/engagements/[engagementId]/experiments/[experimentId]/learning/route.ts
3. app/api/engagements/[engagementId]/experiments/[experimentId]/progress/route.ts
4. app/api/engagements/[engagementId]/experiments/[experimentId]/start/route.ts
5. app/api/engagements/[engagementId]/experiments/route.ts
6. app/api/owner/config/route.ts
7. app/api/owner/dashboard/route.ts

**Action**: After this Phase 2 contract work is validated, these 7 routes can proceed.

### Category C: Custom Header/Cookie Returns (2 routes)
**DEFERRED - need separate strategy**

Pattern: `return Response.json(data, {headers: {...}})` with custom headers/cookies
Status: Requires research - may need to throw with response headers

Affected routes:
- (2 routes with custom headers/cookies)

### Category D: Redirect/Stream/File Returns (1 route)
**DEFERRED - outside wrapper scope**

Pattern: Redirect, streaming, or file responses
Status: These are special cases - may not be wrapped or need special handling

---

## Phase 2 Sub-Batch Strategy

### Sub-batch 2a: High-Confidence Success-Only (10-15 routes)
- Single violation
- Simple data structure
- No complex error handling

### Sub-batch 2b: Medium-Confidence Success-Only (15-20 routes)
- Single violation
- Moderate complexity
- Standard error handling patterns

### Sub-batch 2c: Multi-Violation Success-Only (15-20 routes)
- Multiple returns in single route
- All success paths (no custom status)
- Requires comprehensive path testing

### Sub-batch 2d: Custom Status Routes (7 routes)
- Uses new error contract
- Requires error path testing
- May need new test fixtures for 404/400 cases

---

## Success Criteria for Phase 2

### Before Phase 2 Execution Begins
- ✅ Wrapper contract tests pass (canonical-wrapped-error-contract.test.ts)
- ✅ Error hierarchy verified (404, 400, 403, 401, 503 accessible)
- ✅ Wrapper modification validated (status: classifiedError.statusCode used)
- ✅ Baseline classification complete (59 + 7 + 2 + 1 = 69)
- ✅ Ratchet compatible with classifications

### Per Sub-batch
- ✅ TypeScript compiles
- ✅ All tests passing
- ✅ Ratchet confirms violations reduced (not increased)
- ✅ No auth changes
- ✅ No permission changes
- ✅ No seed/demo data changes

### Final Phase 2
- ✅ 59 success-only routes fixed (Category A)
- ✅ 7 custom-status routes fixed (Category B, using error contract)
- ✅ 66 total Phase 2 routes remediated
- ✅ Baseline: 69 → 3 (only deferred custom-header and redirect routes)
- ✅ Production smoke green
- ✅ Zero regressions

---

## Technical Patterns for Category B (Custom Status Routes)

### Pattern 1: 404 Error Path
```typescript
// BEFORE
export const GET = withCanonicalEnforcement(async (ctx) => {
  const resource = await findResource(id);
  if (!resource) {
    return Response.json({ error: "Not found" }, { status: 404 }); // ❌
  }
  return Response.json(resource); // ✅
});

// AFTER
export const GET = withCanonicalEnforcement(async (ctx) => {
  const resource = await findResource(id);
  if (!resource) {
    throw new NotFoundError("Resource", id); // ✅ wrapper returns 404
  }
  return resource; // ✅ plain object
});
```

### Pattern 2: 400 Error Path
```typescript
// BEFORE
export const POST = withCanonicalEnforcement(async (ctx, params) => {
  try {
    const validated = validateInput(params);
    return Response.json(validated); // ✅
  } catch (e) {
    return Response.json(
      { error: "Invalid input" },
      { status: 400 } // ❌
    );
  }
});

// AFTER
export const POST = withCanonicalEnforcement(async (ctx, params) => {
  const validated = validateInput(params); // throws if invalid
  return validated; // ✅ plain object
});
```

### Pattern 3: 403 Error Path (existing capability/permission check)
```typescript
// Pattern with ForbiddenError
export const DELETE = withCanonicalEnforcement(
  async (ctx) => {
    if (!hasCapability(ctx, "DELETE_RESOURCE")) {
      throw new ForbiddenError("CAPABILITY_NOT_GRANTED", "...");
    }
    return { deleted: true };
  },
  { requireCapabilities: ["DELETE_RESOURCE"] }
);
```

---

## Validation Checklist (TASK E)

- [ ] TypeScript: `npx tsc --noEmit`
- [ ] Build: `npm run build`
- [ ] Contract tests: `npm test -- canonical-wrapped-error-contract.test.ts`
- [ ] Scanner tests: `npm test -- wrapped-handlers-scanner.test.ts`
- [ ] Ratchet: `npm run audit:wrapped-handlers:ratchet`
- [ ] No TypeScript suppression (no `as any`, no `@ts-ignore`)
- [ ] No false error suppression (no `|| true`, no try-catch-swallow)

---

## Phase 2 Readiness Decision

**Status**: Ready for Phase 2a execution after:
1. ✅ Contract tests pass
2. ✅ Validation suite passes
3. ✅ Commit to feature branch
4. ✅ Production smoke green (from Phase 1)

**Timeline**: Week 2-3 (1-2 weeks for full 66 routes)

**Risk**: LOW - error contract is pre-existing pattern, scanner validates no regressions

---

## Next Steps

1. **NOW (TASK E-G)**: Validate contract work
2. **Phase 2a**: Sub-batch 2a (10-15 success-only routes)
3. **Phase 2b**: Sub-batch 2b (15-20 success-only routes)
4. **Phase 2c**: Sub-batch 2c (15-20 multi-violation routes)
5. **Phase 2d**: Sub-batch 2d (7 custom-status routes)
6. **Complete**: 69 violations → 3 deferred (only header/redirect/stream routes)

---

## Known Unknowns

- Category C (custom headers): May require wrapper enhancement to support response headers
- Category D (redirect/stream): May not be wrapped at all; need code inspection
- Exact line numbers: Will be determined per route during Phase 2a

---

**Document status**: COMPLETE - Ready for TASK E validation
