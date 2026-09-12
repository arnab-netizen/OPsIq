# Phase 6C-F1 — fix decisions intake raw-500 (fast-follow)

**Date:** 2026-07-10
**Branch:** `claude/phase-6c-f1-decisions-intake-raw500` (from `main` @ `6e4df2b`)
**Type:** Minimal owner-facing raw-500 fix + real-DB regression test. No schema change, no secrets, no
production migration.

## 1. PR #212 final status & main verification

Phase 6C Wave 1 **PR #212 merged** → main `6e4df2b`. Main verified: createDecision fix present on main;
required gates green on the merge (`CI - Build & Test #3022` ✅, `CI/CD Foundations #1370` ✅,
`MVP Readiness #1636` ✅ with **Security Baseline HONEST_GREEN**). Only non-required Smoke red (known
schema drift). Main-after-#212 push CI was confirmed green before merging this fast-follow.

## 2. Confirmed idle-audit finding (source of this fix)

During the Phase 6C Wave 1 read-only idle audit, the operatorItem-create raw-500 class was checked
repo-wide. `app/api/decisions/intake/route.ts` was CONFIRMED_HIGH: same defect class as `createDecision`,
still unfixed → `POST /api/decisions/intake` raw-500s on every call.

## 3. Files inspected & false positives cleared

Every `operatorItem.create` site in `src` was inspected:
- `decision-creation-service.ts` (createDecision) — fixed in PR #212.
- **`app/api/decisions/intake/route.ts` — the defect fixed here.**
- `services/operator/store.ts` (×2 create sites) — FALSE_POSITIVE (correct `createdByUserId` + `id` + `updatedAt`).
- `createAction` (`services/action.ts`) — FALSE_POSITIVE (correct `id`/`updatedAt`/real columns).
- `recommendation.create` (`services/action.ts:561`) — FALSE_POSITIVE (Recommendation has `@default` for id/updatedAt).

So the operatorItem-create raw-500 class existed in exactly two decisions sites; both are now fixed.
(Separately noted for a future auth phase, SUSPECTED_NEEDS_PROOF: diagnosis routes `root-cause`/`maturity`/
`bottleneck` pass `body.workspaceId` into the engine without a visible membership check — possible
cross-workspace bypass. Not touched here.)

## 4. Exact defect in the intake route

`db.operatorItem.create({ data: { ... } })` was invoked with:
- phantom **`createdBy`** column (real column: `createdByUserId`),
- phantom **`decisionType: "general"`** (no such column),
- phantom **`problemType: ...`** (no such column),
- **no `id`** (OperatorItem.id required, no default),
- **no `updatedAt`** (required, no default).

Each triggers `PrismaClientValidationError` → raw 500. All other written fields (`recommendationId`,
`inputsSnapshot`, `executionStatus`, `engineVersion`, `blockStage`, `blockReason`, etc.) are real columns.

## 5. Source fix

- Extracted the create payload into `buildIntakeOperatorItemData(input, workspaceId, userId)` in a colocated
  module `src/app/api/decisions/intake/intake-data.ts`, so the exact payload is unit-testable.
- The builder writes only real columns and all required fields: adds `id: randomUUID()` and
  `updatedAt: new Date()`, uses `createdByUserId` instead of `createdBy`, and drops the phantom
  `decisionType`/`problemType`.
- The route now calls `db.operatorItem.create({ data: buildIntakeOperatorItemData(input, workspaceId, userId) })`.
- **Auth/tenant behavior unchanged:** `withEnforcementFull` + `withAuth` + `enforceWorkspaceScoping` (and the
  first-active-workspace fallback) are untouched. No schema change. (Also removed a pre-existing unused
  `IntakeInput` type + unused `getSession`/`randomUUID` imports surfaced by the edit.)

## 6. Tests added

`src/__tests__/api/decisions-intake.db.test.ts` (gated by `TEST_WITH_DB`):
1. **[db]** runs the exact intake payload (`buildIntakeOperatorItemData`) through a real database and asserts
   a **pending, workspace-scoped** decision is persisted with `createdByUserId`, `id`, and `updatedAt`
   (regression proof — raw-500'd before the fix).
2. asserts the builder writes **no phantom columns** (`createdBy`/`decisionType`/`problemType` absent) and
   includes the previously-missing required fields.

## 7. Proof it fails before / passes after

Before the fix the create payload contained phantom `createdBy`/`decisionType`/`problemType` and no
`id`/`updatedAt` → `PrismaClientValidationError` (empirically observed while diagnosing the identical
`createDecision` defect). After the fix the same-shaped payload persists cleanly — test 1 passes. Test 2
encodes the exact defect signature (phantom columns absent, required fields present).

## 8. Commands run

```
npx tsc --noEmit                                                      → exit 0
npx eslint <route + intake-data + test>                              → 0 problems
TEST_WITH_DB=true npx vitest run decisions-intake.db.test.ts         → 2 passed
npx vitest run (no DB)                                               → 2 skipped (gated)
npm run lint:ratchet                                                 → PASS (0 changed-file errors)
npm run governance:scan:strict                                       → 0 new findings
```

## 9. Pass/fail/deferred

Fixed: 1 confirmed raw-500. Tests: **2 passing** (real DB). Deferred: full HTTP route invocation (harness
limitation — documented; the DB create, i.e. the defect locus, is proven directly).

## 10. Files changed

- `src/app/api/decisions/intake/route.ts` — use the schema-valid builder (+ import cleanup).
- `src/app/api/decisions/intake/intake-data.ts` — new, testable create-payload builder.
- `src/__tests__/api/decisions-intake.db.test.ts` — real-DB regression test.
- `docs/audits/2026-07-10-phase-6c-f1-decisions-intake-raw500/` — this report + evidence ledger.

## 11. Rollback plan

Revert the three source files (reintroduces the raw-500) or `git revert` the merge. No schema/data impact.

## 12. Updated phase queue

1. **Phase 6C-F1 — decisions intake raw-500 (this PR).**
2. Phase 6C Wave 2 — `api/actions` placebo conversion (createAction is FALSE_POSITIVE for the phantom class; still prove with real assertions).
3. Phase 6D — approval workflow audit/status/idempotency.
4. Phase 6E — workspace enforcement drift select + invite boolean + withAuth migration.
5. New: **auth/tenant-isolation proof** for diagnosis routes (`body.workspaceId`) — SUSPECTED_HIGH, needs proof.
6. Phase 6F/6G — agent-reported governance + lane integrity.
7. Continue placebo waves (hostile-auth, governed wrappers, dashboard/recommendation routes, execution-certainty, constraint-checks, escalation/review-cycles, operator-queue last).
8. Production migration only on the exact owner approval phrase.

## 13. Next recommended phase

**Phase 6C Wave 2 — `api/actions` placebo conversion** (owner instruction required).
