# OpsIQ Runtime-Readiness — P3-A Learning Read-Back Report

> First P3 slice. Closes blocker **B6** (decision/operator learning was write-only): the recommendation path now reads
> the workspace's real decision history and **demonstrably lowers confidence** when prior realized failures exist for
> the same problem type. Pure, self-contained, no new store, no new DB query — it reuses the already-loaded,
> workspace-scoped `items` the route passes in, mirroring the owner-plan's read→annotate→lower-confidence shape.

## Branch & base
- Branch: `claude/runtime-readiness-p3a-learning-loop`
- Base HEAD: `a7e75ce` (main; after P2-B #83 merged).

## The gap (B6) — worse than "write-only"
The audit called the decision/operator learning store "write-only." Tracing it revealed it is worse: the dead
subsystem (`src/services/learning/store.ts`, `src/services/metrics/decision-metrics-service.ts`) writes to a Prisma
model **`LearningRecord` / table `learning_records` that does not exist** in the schema or migrations — so every write
throws and is swallowed by the surrounding `try/catch`. Nothing persisted, and the read-back (`getLearningRecordsFromDays`)
had **zero live callers**. So no recommendation ever changed because of prior outcomes.

Meanwhile the recommendation path (`generateRecommendation`) already receives the workspace's real decision history —
`items: OperatorItem[]` (last 100, workspace-scoped, with real `status` and `outcomeDelta`) — but never consulted prior
outcomes: confidence came only from the pattern success rate.

## What was implemented (B6, real data, pure)
- **`src/services/intelligence/recommendation.ts`**:
  - `priorRealizedFailures(items, problemType)` — counts prior REALIZED failures for the problem type from the
    already-loaded items: a terminal `status === "failed"`, or a completed decision whose measured outcome moved the
    wrong way (`outcomeDelta < 0`). Pure; no new store; no new query.
  - `applyPriorFailureLearning(base, items, problemType)` — folds that signal into the finalized recommendation:
    each prior failure removes 15% of confidence, capped at 60%, and annotates the explanation with the count. No-op
    when there are no prior failures (behaviour unchanged for a clean history).
  - The finalized (`dataSufficiency: "sufficient"`) recommendation is now returned through
    `applyPriorFailureLearning`, so a repeated pattern of failure demonstrably tempers the next recommendation.
  - `ActionRecommendation` gains `learningApplied?` / `priorFailureCount?` for honest disclosure.

The live caller is the existing route `src/app/api/intelligence/recommendations/route.ts` (already passes the
workspace items) — no route change required; the read-back is now exercised on every recommendation.

## Files changed
- CHANGED `src/services/intelligence/recommendation.ts` (prior-failure read-back + confidence penalty + disclosure)
- NEW `src/__tests__/services/intelligence/recommendation-learning.test.ts`
- NEW `OPSIQ_RUNTIME_READINESS_P3A_LEARNING_READBACK_REPORT.md`

## DB / migration changes
**None.** **API:** none (existing route, existing inputs). **UI:** the recommendation's `explanation` now discloses the
learning adjustment; no component change required.

## Tests / checks run (local)
- **NEW** `recommendation-learning.test.ts` — **5/5**: clean history unchanged (no learning applied); 3 realized
  failures → 45% penalty (0.8 → 0.44) + disclosed; a completed decision with negative `outcomeDelta` counts as a
  failure (15% penalty); the penalty is capped at 60% (never collapses to zero); failures for a DIFFERENT problem type
  do not affect the recommendation (scoped signal).
- No-regression (Postgres): `src/__tests__/services` → **2366 passed, 7 skipped, 1 failed** — the single failure is
  **pre-existing and unrelated** (`diagnosis-legal-governance-textual.test.ts`, a legal-text boundary guard), confirmed
  identical on clean `origin/main` (stash-verified) and untouched by this diff. `services/intelligence` +
  `services/control` → **25/25**.
- `tsc --noEmit` ✓ · eslint (changed files) 0 errors ✓ (2 pre-existing unused-import warnings in the file, not
  introduced here) · `lint:ratchet` PASS (2155 = 2155; warnings 1263→1261; 0 new).

## Honest scope (not overclaimed)
- Closes **B6**: the decision-path learning read-back now has a live caller and demonstrably changes the
  recommendation's confidence from real prior outcomes, workspace-scoped, with disclosure.
- **Deliberately deferred to the next slices** (not silently assumed done):
  - **M7** — delete the dead, non-persisting duplicate learning subsystem (`services/learning/store.ts`,
    `services/metrics/decision-metrics-service.ts`, their `__ignored_tests__`) and remove the swallowed writer calls in
    `execution-service.ts` / `operator/store.ts`. That touches governed execution paths, so it is a separate focused PR.
  - **M9** — feed prior `block`ed outcomes into `composeUpdatedPlan` (owner-budget), a different subsystem.
- This slice does **not** wire into the dead store (which never persisted); it reads the real `OperatorItem` history,
  which is the correct decision-domain source and adds no duplicate engine.

## Classification
**`P3_DECISION_LEARNING_READBACK_LIVE`** (unit-proven + broad no-regression): repeated realized failures for a problem
type now lower the next recommendation's confidence and are disclosed; no new store; no gate weakened.

## Merge recommendation
Open PR; drive CI green (unit + DB lanes) before merge. No new browser spec. After merge, next is **M7** (remove the
dead duplicate learning subsystem) then **M9** (outcome loop steering). Public SaaS / billing / launch / integrations
remain out of scope and blocked.
