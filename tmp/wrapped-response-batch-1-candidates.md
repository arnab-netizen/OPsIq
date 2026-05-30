# Batch 1: Read-Only GET Routes Remediation Plan

## Batch Overview
- **Total candidates**: 18 routes
- **Phase 1 COMPLETE**: 8 single-violation routes fixed ✅
- **Phase 2 PENDING**: 10 multi-violation routes (2-6 violations each)
- **All GET-only**: ✅
- **No side effects**: ✅
- **No custom headers/cookies**: ✅
- **No special response handling**: ✅
- **Total violations in Phase 1 (FIXED)**: 8 Response.json() return statements
- **Remaining in Phase 2**: 40 Response.json() return statements
- **Priority**: HIGH (first safe batch to remediate)
- **Timeline**: Phase 1 complete, Phase 2 pending
- **Risk profile**: LOW

## Route Breakdown by Violation Count

### Single Violation Routes (8 routes - fix first)
Safest: each file has exactly 1 Response.json() return to fix.

1. **GET /api/actions/:id/impact-delta**
   - File: `app/api/actions/[actionId]/impact-delta/route.ts`
   - Violations: 1
   - Route pattern: GET /api/actions/[actionId]/impact-delta
   - Wrapper: withCanonicalEnforcement
   - Risk: **Very Low**
   - Test required: Verify response shape matches service return
   - Safe fix: Change line with `return Response.json({...})` to `return {...}`

2. **GET /api/engagements/:id/business-impact/detail**
   - File: `app/api/engagements/[engagementId]/business-impact/detail/route.ts`
   - Violations: 1
   - Route pattern: GET /api/engagements/[engagementId]/business-impact/detail
   - Wrapper: withCanonicalEnforcement
   - Risk: **Very Low**
   - Test required: Verify business impact data structure preserved
   - Safe fix: Change return to plain object

3. **GET /api/intelligence/insights**
   - File: `app/api/intelligence/insights/route.ts`
   - Violations: 1
   - Route pattern: GET /api/intelligence/insights
   - Wrapper: withCanonicalEnforcement
   - Risk: **Very Low**
   - Test required: Verify insights array structure preserved
   - Safe fix: Change return to plain object

4. **GET /api/intelligence/patterns**
   - File: `app/api/intelligence/patterns/route.ts`
   - Violations: 1
   - Route pattern: GET /api/intelligence/patterns
   - Wrapper: withCanonicalEnforcement
   - Risk: **Very Low**
   - Test required: Verify patterns array structure preserved
   - Safe fix: Change return to plain object

5. **GET /api/intelligence/recommendations**
   - File: `app/api/intelligence/recommendations/route.ts`
   - Violations: 1
   - Route pattern: GET /api/intelligence/recommendations
   - Wrapper: withCanonicalEnforcement
   - Risk: **Very Low**
   - Test required: Verify recommendations array structure preserved
   - Safe fix: Change return to plain object

6. **GET /api/intelligence/summary**
   - File: `app/api/intelligence/summary/route.ts`
   - Violations: 1
   - Route pattern: GET /api/intelligence/summary
   - Wrapper: withCanonicalEnforcement
   - Risk: **Very Low**
   - Test required: Verify summary object structure preserved
   - Safe fix: Change return to plain object

7. **GET /api/value/7day**
   - File: `app/api/value/7day/route.ts`
   - Violations: 1
   - Route pattern: GET /api/value/7day
   - Wrapper: withCanonicalEnforcement
   - Risk: **Very Low**
   - Test required: Verify 7-day value metrics preserved
   - Safe fix: Change return to plain object

8. **GET /api/value/summary**
   - File: `app/api/value/summary/route.ts`
   - Violations: 1
   - Route pattern: GET /api/value/summary
   - Wrapper: withCanonicalEnforcement
   - Risk: **Very Low**
   - Test required: Verify summary metrics preserved
   - Safe fix: Change return to plain object

### Multi-Violation Routes (10 routes - fix after single violations)
Safe but require careful handling of multiple returns per file.

9. **GET /api/engagements/:id/dashboard** (2 violations)
   - File: `app/api/engagements/[engagementId]/dashboard/route.ts`
   - Violations: 2 Response.json() returns to fix
   - Risk: **Low** (multiple returns, same handler)
   - Test required: Verify both response paths work correctly
   - Safe fix: Change both return statements to plain objects

10. **GET /api/engagements/:id/drift** (2 violations)
    - File: `app/api/engagements/[engagementId]/drift/route.ts`
    - Violations: 2
    - Risk: **Low**
    - Test required: Verify drift analysis response structure
    - Safe fix: Change both returns to plain objects

11. **GET /api/report** (2 violations)
    - File: `app/api/report/route.ts`
    - Violations: 2
    - Risk: **Low**
    - Test required: Verify report generation response
    - Safe fix: Change both returns to plain objects

12. **GET /api/operator/my-day** (3 violations)
    - File: `app/api/operator/my-day/route.ts`
    - Violations: 3
    - Risk: **Low** (single handler, multiple code paths)
    - Test required: Verify all my-day responses
    - Safe fix: Change all 3 returns to plain objects

13. **GET /api/owner/first-value** (4 violations)
    - File: `app/api/owner/first-value/route.ts`
    - Violations: 4
    - Risk: **Low**
    - Test required: Verify first-value flow responses
    - Safe fix: Change all 4 returns to plain objects

14. **GET /api/operator/queue** (5 violations)
    - File: `app/api/operator/queue/route.ts`
    - Violations: 5
    - Risk: **Low** (multiple paths in single handler)
    - Test required: Verify queue response structures
    - Safe fix: Change all 5 returns to plain objects

15. **GET /api/owner/dashboard** (5 violations)
    - File: `app/api/owner/dashboard/route.ts`
    - Violations: 5
    - Risk: **Low**
    - Test required: Verify dashboard metrics preserved
    - Safe fix: Change all 5 returns to plain objects

16. **GET /api/public/actions** (6 violations)
    - File: `app/api/public/actions/route.ts`
    - Violations: 6
    - Risk: **Low**
    - Test required: Verify public actions API response
    - Safe fix: Change all 6 returns to plain objects

17. **GET /api/public/engagements** (6 violations)
    - File: `app/api/public/engagements/route.ts`
    - Violations: 6
    - Risk: **Low** (public API, well-tested)
    - Test required: Verify public engagements API response
    - Safe fix: Change all 6 returns to plain objects

18. **GET /api/public/kpis** (6 violations)
    - File: `app/api/public/kpis/route.ts`
    - Violations: 6
    - Risk: **Low**
    - Test required: Verify public KPIs response
    - Safe fix: Change all 6 returns to plain objects

## Why Batch 1 is Safe

### Criteria Met
✅ **No authentication changes** - Same auth context used
✅ **No permission changes** - Authorization unchanged
✅ **No DB mutations** - Read-only operations
✅ **No seed/data creation** - No side effects
✅ **No tenant isolation issues** - Workspace scoping unchanged
✅ **No UI impact** - Backend response shape preserved
✅ **No header manipulation** - Standard response headers
✅ **No custom status codes** - Standard 200/error responses
✅ **No streaming/files** - JSON responses only
✅ **No redirects** - Direct responses

### Mechanical Fix Pattern
```typescript
// BEFORE
export const GET = withCanonicalEnforcement(async (ctx) => {
  const data = await service.getData(ctx.workspaceId);
  return Response.json(data);      // ❌ Response object
});

// AFTER
export const GET = withCanonicalEnforcement(async (ctx) => {
  const data = await service.getData(ctx.workspaceId);
  return data;                      // ✅ Plain object
});
```

**Why this works**:
1. Handler returns plain object to wrapper
2. Wrapper does: `JSON.stringify(plainObject)` ✅
3. Wrapper creates: `new NextResponse(JSON.stringified)`
4. Response is correct and complete

## Implementation Checklist

### Phase 1: Single-Violation Routes (8 routes)
- [ ] Create feature branch: `fix/batch-1-single-violation-get-routes`
- [ ] Fix 8 routes (1 violation each)
- [ ] Local validation:
  ```bash
  npm run build
  npm test
  npm run audit:wrapped-handlers:ratchet  # Should show progress
  ```
- [ ] Code review checklist:
  - [ ] All `return Response.json(` → `return {`
  - [ ] All `return NextResponse.json(` → `return {`
  - [ ] No other changes
  - [ ] Build succeeds
  - [ ] Ratchet shows 8 violations resolved
- [ ] Create PR
- [ ] Merge to main
- [ ] Monitor: 2 clean production smokes

### Phase 2: Multi-Violation Routes (10 routes)
- [ ] Create feature branch: `fix/batch-1-multi-violation-get-routes`
- [ ] Fix 10 routes (2-6 violations each)
- [ ] Same validation as Phase 1
- [ ] Create PR
- [ ] Merge to main
- [ ] Monitor: 3 clean production smokes

### After Batch 1 Complete
- [ ] Verify ratchet shows 48 violations resolved (from baseline)
- [ ] Baseline violations: 77 → 29 remaining
- [ ] Schedule Batch 2 (diagnostic/proof routes)

## Risk Mitigation

### If a fix breaks smoke tests
1. Identify which route failed
2. Check response structure
3. Ensure plain object has all required fields
4. Revert batch, fix issue, re-apply
5. No data loss - these are GET routes

### If new violations appear
Ratchet gate will fail CI, preventing merge until resolved.

### If unforeseen issues arise
1. Revert the batch (single commit)
2. Investigate root cause
3. Adjust approach for remaining batches
4. No production impact - GET routes are safe

## Success Criteria

### Per-Route Validation
- [ ] Route returns valid response (HTTP 200)
- [ ] Response structure matches service output
- [ ] Response is properly JSON-encoded
- [ ] No data corruption or loss
- [ ] Auth/permissions unchanged
- [ ] Workspace scoping unchanged

### Batch-Level Validation
- [ ] Build: `npm run build` passes
- [ ] Tests: `npm test` passes
- [ ] Scanner: `npm run audit:wrapped-handlers:ratchet` shows progress
- [ ] TypeScript: `npx tsc --noEmit` passes
- [ ] CI gate: Ratchet passes (exit 0)

### Production Validation
- [ ] Smoke test passes
- [ ] No regression in other routes
- [ ] No customer-impacting errors
- [ ] Metrics stable

## Files and Dependencies

### Affected Routes (18 files)
See list above with file paths

### Related Tests
- `src/__tests__/wrapped-handlers-scanner.test.ts` - validates scanner
- Smoke tests - validate production behavior
- Existing route tests - regression check

### CI Gate
- `.github/workflows/ci.yml` - runs ratchet mode
- `scripts/audit-wrapped-handlers.js` - ratchet implementation
- `qa/baselines/wrapped-response-violations.json` - baseline

## Next Steps

1. **Verify this plan** (you are here)
2. **Fix Batch 1 single-violation routes** (Phase 1)
3. **Merge and monitor** (2 clean smokes)
4. **Fix Batch 1 multi-violation routes** (Phase 2)
5. **Merge and monitor** (3 clean smokes)
6. **Proceed to Batch 2** (diagnostic/proof routes - 3 routes)

## Questions & Notes

- Why read-only first? Lowest risk, no data mutations, no async complexities
- Why single violations first? Simplest pattern, teaches the fix, builds confidence
- Why 18 routes in Batch 1? Maximum that meets safety criteria (GET + no special handling)
- Why two phases? Allows monitoring after phase 1, prevents overloading reviews

---

**Batch 1 Phase 1 Status**: ✅ COMPLETE
- Plan: Complete
- Candidates: Identified and validated
- Risk: Low
- Timeline: Phase 1 complete, Phase 2 pending
- Phase 1 results:
  - 8 single-violation routes fixed
  - Baseline reduced: 77 → 69 violations
  - 8 violations resolved
  - 0 new violations introduced
  - Ratchet gate: PASSING
- Phase 1 routes fixed:
  1. app/api/actions/[actionId]/impact-delta/route.ts ✅
  2. app/api/engagements/[engagementId]/business-impact/detail/route.ts ✅
  3. app/api/intelligence/insights/route.ts ✅
  4. app/api/intelligence/patterns/route.ts ✅
  5. app/api/intelligence/recommendations/route.ts ✅
  6. app/api/intelligence/summary/route.ts ✅
  7. app/api/value/7day/route.ts ✅
  8. app/api/value/summary/route.ts ✅
- Tests added: src/__tests__/batch-1-wrapped-response-contract.test.ts (13 tests, all passing)
- Next action: Implement Phase 2 (10 multi-violation routes with 2-6 violations each)
