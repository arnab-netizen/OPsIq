# Phase 3 — Item 1: Fix `getRecommendation` invalid select

**Date:** 2026-07-08
**Branch:** `claude/phase-3-fix-getRecommendation-invalid-select`
**Commit subject:** `Phase 3: fix getRecommendation invalid select`
**Classification:** Real owner-facing 500 defect — fixed, guarded by a required-lane DB regression test.

---

## A. Files created
- `src/services/__tests__/getRecommendation-invalid-select.db.test.ts` — DB-backed required-lane regression test.
- `docs/audits/2026-07-08-phase-3-getRecommendation-invalid-select/FINAL_REPORT.md` — this report.
- `docs/audits/2026-07-08-phase-3-getRecommendation-invalid-select/EVIDENCE_LEDGER.json` — evidence ledger.

## B. Files changed
- `src/services/recommendation.ts` — corrected the `getRecommendation` Prisma `select`.

## C. Schema changes
None. The defect was a query requesting columns absent from the existing schema; the fix aligns the query to the schema.

## D. Backend logic implemented
`getRecommendation(recommendationId, workspaceId)` previously selected four fields that do **not** exist on the `Recommendation` Prisma model:

| Requested (invalid) field   | Reality on `Recommendation` model |
|-----------------------------|-----------------------------------|
| `expectedImpact`            | No such column — real column is `estimatedImpact` |
| `implementationPhase`       | No such column |
| `executionCertaintyScore`   | No such column |
| `scoreBreakdown`            | No such column |

Because Prisma validates `select` against the model, `prisma.recommendation.findUnique`
threw `PrismaClientValidationError` on **every** call. Both owner-facing entrypoints that
call `getRecommendation` therefore returned a 500 on every request:
- `GET /api/recommendations/[recommendationId]` (owner opens a single recommendation)
- `PATCH /api/recommendations/[recommendationId]` (the post-update re-read at the tail of the handler)

This is the **identical** defect Phase 2 G2 fixed for the listing path
(`getRecommendationsForEngagement`), documented as a follow-up.

**Fix (smallest possible):** replace the four non-existent fields with the single real
impact column `estimatedImpact: true`. No other selected field, ordering, ranking, or
architecture was touched. Workspace scoping (`where: { id, workspaceId }`) and the
`NotFoundError` fail path are unchanged.

## E. Frontend logic implemented
None. No UI change. The route response now succeeds instead of 500-ing; the removed fields
never carried real data (the call always threw), so no consumer could have relied on them.

## F. Acceptance criteria checklist
- [x] `getRecommendation` no longer 500s on the affected path (proven: post-fix test passes against real DB).
- [x] Regression test touches the real service path behind the route (`getRecommendation`), following existing repo DB-test conventions (Wave-3 / G2).
- [x] Test fails before the fix (`PrismaClientValidationError: Unknown field 'expectedImpact'`) and passes after.
- [x] Tenant/workspace isolation preserved and asserted (foreign workspace → `NotFoundError`, not a 500 and not a cross-tenant read).
- [x] Existing Phase 2 G2 recommendation tests still pass (`recommendation-priority-ordering.test.ts`, `owner-journey-smoke.db.test.ts`).
- [x] Recommendation ordering/priority semantics untouched.
- [x] `npx tsc --noEmit` clean; `eslint` clean on changed files.

## G. Known limitations
- The regression test exercises the service function `getRecommendation` directly (the exact
  call the route delegates to), consistent with the established repo DB-test pattern
  (Wave-3, G2). It does not spin up the full HTTP route handler; there is no in-repo
  convention for route-level HTTP harness tests for this endpoint, and the 500 originated
  entirely inside the service query, so the service-level test reproduces the defect exactly.
- No other invalid-select site was found in `recommendation.ts` beyond the listing path
  (already fixed in G2) and `getRecommendation` (fixed here).

## H. Manual verification steps
1. Start Postgres, apply migrations (`npx prisma migrate deploy`), generate client.
2. `TEST_WITH_DB=true npx vitest run src/services/__tests__/getRecommendation-invalid-select.db.test.ts` → 2 passed.
3. Revert only the `select` change in `getRecommendation` → same test → 2 failed with
   `PrismaClientValidationError: Unknown field 'expectedImpact' for select statement on model 'Recommendation'`.
4. `TEST_WITH_DB=true npx vitest run src/services/__tests__/recommendation-priority-ordering.test.ts src/services/__tests__/owner-journey-smoke.db.test.ts` → 4 passed.

## I. Trigger map
Owner opens/updates a single recommendation → API route
`/api/recommendations/[recommendationId]` (GET or PATCH) → `getRecommendation` →
`prisma.recommendation.findUnique({ select })`. Pre-fix: invalid select → 500 on every call.
Post-fix: valid select → 200 with the recommendation.

## J. Failure modes covered
- Owner-facing 500 on single-recommendation view (GET) — fixed.
- Owner-facing 500 on single-recommendation update read-back (PATCH tail) — fixed (same call).
- Cross-workspace read of a recommendation — remains denied (`NotFoundError`), now asserted.

## K. Events emitted
None added or changed. `getRecommendation` is a pure read; it emits no audit/canonical events, and none were introduced.

## L. Automated tests added
- `src/services/__tests__/getRecommendation-invalid-select.db.test.ts` (2 tests), DB-backed,
  runs in the required `build-and-test` CI lane (`TEST_WITH_DB=true`, not `*.integration.test.ts`, not quarantined).
