# OpsIQ Runtime-Readiness — P3-A2 Dead Learning-Store Removal Report

> Follow-up to P3-A (#84). Closes major **M7** (two learning subsystems, one dead): removes the duplicate learning
> subsystem that wrote to a Prisma model which does not exist — so its writes threw and were swallowed, persisting
> nothing — leaving ONE real learning path. Pure deletion of dead code + its swallowed writer calls; no behavior change
> (the removed calls never did anything), and the live decision-learning read-back landed in P3-A reads the real
> `OperatorItem` history instead.

## Branch & base
- Branch: `claude/runtime-readiness-p3a2-dead-learning-store`
- Base HEAD: `5acd162` (main; after P3-A #84 merged).

## The gap (M7)
Two learning subsystems existed:
- **Real / live:** `PrismaLearningStore` → `behavioral_learning_artifacts` (owner plan reads it; B6's read-back reads
  real `OperatorItem` outcomes).
- **Dead / duplicate:** `src/services/learning/store.ts` + `src/services/metrics/decision-metrics-service.ts`. These
  target a Prisma model **`LearningRecord` / table `learning_records` that does not exist** in the schema or
  migrations, so `db.learningRecord.create/findMany` threw on every call and was swallowed by the surrounding
  `try/catch`/`.catch`. The read functions had zero live callers. Nothing was ever persisted or read — a pure footgun
  that masqueraded as "learning."

## What was removed (dead code only)
- **DELETED** `src/services/learning/store.ts` (the dead store — write/read of the nonexistent table).
- **DELETED** `src/services/metrics/decision-metrics-service.ts` (`recordDecisionMetrics` / `calculateSuccessMetrics` /
  `getMetricsSnapshot` — same nonexistent table; production callers were only the swallowed writers below).
- **DELETED** `src/__ignored_tests__/services/metrics/__tests__/decision-metrics-service.test.ts` (its only test — was
  already in the ignored tree).
- **`src/services/operator/store.ts`**: removed the `recordOperatorItemLearning(...)` call (and its import) in
  `updateOperatorItem` — it threw-and-swallowed on every completed decision.
- **`src/services/execution/execution-service.ts`**: removed both `recordDecisionMetrics(...)` calls (and the import,
  plus the now-unused `classifyOperatorError`/`logger` imports). The success-path call threw-and-swallowed; the
  failure-path call was already unreachable (`markFailure` is retired and throws first).

Each removal left a short `// NOTE (M7)` comment explaining why, and pointing at the real recording (the `OperatorItem`
row + audit event) that the live B6 read-back consumes.

## Files changed
- DELETED `src/services/learning/store.ts`
- DELETED `src/services/metrics/decision-metrics-service.ts`
- DELETED `src/__ignored_tests__/services/metrics/__tests__/decision-metrics-service.test.ts`
- CHANGED `src/services/operator/store.ts` (remove dead writer call + import)
- CHANGED `src/services/execution/execution-service.ts` (remove dead writer calls + now-unused imports)
- NEW `OPSIQ_RUNTIME_READINESS_P3A2_DEAD_LEARNING_STORE_REPORT.md`

## DB / migration changes
**None** (the removed code targeted a table that never existed). **API:** none. **UI:** none.

## Tests / checks run (local, Postgres)
- No-regression: `services/execution` + `services/operator` + `services/intelligence` → **114/114**; broad
  `src/__tests__/services` → **2366 passed, 7 skipped, 1 failed** — the single failure is the **pre-existing, unrelated**
  `diagnosis-legal-governance-textual.test.ts` (identical before this change; legal-text boundary guard).
- `tsc --noEmit` ✓ · eslint (changed files) no NEW errors ✓ · `lint:ratchet` **PASS** — and error count **dropped
  2155 → 2112** (deleting the dead files removed 43 baseline lint errors; a strict improvement). Re-baselining the
  ratchet to lock this in is left to **P4-A**, which owns the lint baseline, to avoid a CI count-mismatch here.

## Honest scope (not overclaimed)
- Pure removal of dead, non-persisting code — no behavior change (the removed calls never persisted anything). The
  real decision-learning path (B6, #84) is untouched and remains the single learning read-path.
- Does **not** address **M9** (feed prior `block`ed outcomes into `composeUpdatedPlan` — owner-budget), which is the
  next focused slice.

## Classification
**`P3_LEARNING_SUBSYSTEM_CONSOLIDATED`** (broad no-regression + full grep-verified reference removal): one learning
read-path remains; the dead duplicate and its swallowed writers are gone; no gate weakened; lint errors reduced.

## Merge recommendation
Open PR; drive CI green before merge. No new browser spec. After merge, next is **M9** (outcome-loop steering in the
owner-budget composer), then P3-B (M8) and P4. Public SaaS / billing / launch / integrations remain out of scope.
