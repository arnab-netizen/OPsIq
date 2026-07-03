# OpsIQ Runtime-Readiness — P3-A3 Outcome-Loop Steering Report

> Final P3 slice. Closes major **M9** (the outcome loop records but does not steer): `composeUpdatedPlan` never read
> the persisted `FundedInitiativeOutcome` dispositions, so a recorded FAILED/BLOCKED initiative was silently re-funded
> next time. Now a prior FAILED outcome (marked `safeForLearning`) demonstrably changes the next composed plan — the
> matching candidate is DEFERRED and a guard signal + a what-not-to-do are added. Workspace/business-scoped; no
> fabrication; behaviour unchanged when there is no history.

## Branch & base
- Branch: `claude/runtime-readiness-p3a3-outcome-steering`
- Base HEAD: `86db5b8` (main; after P3-A2 #85 merged).

## The gap (M9)
`action-link.service.ts` already **records** real outcomes: on completion it classifies the funded action and persists
a `FundedInitiativeOutcome` row (workspace/business-scoped, with `outcome`, `safeForLearning`, and a disposition note),
even counting prior FAILED for the same label. But the only reader of those rows was generated Prisma code — the plan
composer (`composeUpdatedPlan`, called from `reassessBudget`) never consumed them. So the loop recorded outcomes and
then ignored them: a plan that failed before was re-proposed unchanged.

## What was implemented (read → steer, real data)
- **`domain/owner-budget/updated-plan.ts`**:
  - New `PriorInitiativeOutcome` type + optional `outcomeHistory` on `UpdatedPlanInput`.
  - Prior-outcome steering: for each prior outcome that is `FAILED`/`BLOCKED` **and** `safeForLearning`, the plan now
    (a) DEFERS a matching `FUND`/`PARTIAL_FUND` allocation candidate (funding withheld — the steer is real, not
    advisory), (b) emits a `prior_initiative_failure` guard signal, and (c) adds a what-not-to-do
    ("do not re-fund what already failed without a changed approach + proof"). Recomputes `fundedTotal`/`blockedCount`.
    Deduped by initiative; absent history → no change.
- **`domain/owner-budget/types.ts`**: added the `prior_initiative_failure` `BudgetSignalType`.
- **`domain/owner-budget/signal-routing.ts`**: routed it as an `owner_risk_audit`-consumed governance signal.
- **`services/owner-budget/budget.service.ts`** (`reassessBudget`): loads recent `FundedInitiativeOutcome` rows
  (workspace/business-scoped, latest 50) and passes them as `outcomeHistory` — the live wiring that makes the steer
  fire in production.

Only `safeForLearning` outcomes steer, so failures attributed to an external factor or an owner override (excluded
upstream by `classifyBudgetOutcome`) do not penalise the next plan.

## Files changed
- CHANGED `src/domain/owner-budget/updated-plan.ts` (input + steering)
- CHANGED `src/domain/owner-budget/types.ts` (`prior_initiative_failure` signal type)
- CHANGED `src/domain/owner-budget/signal-routing.ts` (route the new signal)
- CHANGED `src/services/owner-budget/budget.service.ts` (load + pass outcome history)
- NEW `src/__tests__/owner-budget/prior-outcome-steering.test.ts`
- NEW `OPSIQ_RUNTIME_READINESS_P3A3_OUTCOME_STEERING_REPORT.md`

## DB / migration changes
**None** (`FundedInitiativeOutcome` already exists and is already written). **API:** none. **UI:** the new signal +
what-not-to-do surface through the existing plan fields.

## Tests / checks run (local, Postgres)
- **NEW** `prior-outcome-steering.test.ts` — **5/5**: baseline funds the candidate with no guard; a prior FAILED
  (safeForLearning) outcome DEFERS the matching candidate + adds the `prior_initiative_failure` signal + what-not-to-do;
  a not-safe-for-learning failure does NOT steer; a SUCCESS outcome does NOT steer; a failure for a different initiative
  guards but leaves the unrelated candidate funded.
- No-regression: `src/__tests__/owner-budget` → **184/184**; owner-budget service DB tests
  (`budget.service.db` exercises `reassessBudget` with the new read; `action-link.service.db` writes the outcomes) →
  **61/61**.
- `tsc --noEmit` ✓ · eslint (changed files) 0/0 ✓ · `lint:ratchet` PASS (current 2112 = 2112; no new errors).

## Honest scope (not overclaimed)
- Closes **M9** for the owner-budget composer: a recorded FAILED/BLOCKED funded-initiative outcome now demonstrably
  changes the next plan, from real persisted data, workspace/business-scoped, learning only from outcomes flagged safe.
- Reuses the existing outcome store (`FundedInitiativeOutcome`) — no new store, no new engine, no duplicate composer.
- The `decision-lifecycle.service.ts` learning hook noted in the audit is a **separate** decision-domain path; the
  decision-recommendation learning is already live via B6 (#84). No further change is claimed there.

## Classification
**`P3_OUTCOME_LOOP_STEERS`** (unit-proven + owner-budget DB no-regression): the funded-initiative outcome loop is
closed — record → read → steer; no gate weakened; no fabrication.

## Merge recommendation
Open PR; drive CI green before merge. No new browser spec. With B6 (#84) + M7 (#85) + M9 merged, **P3 (learning &
reassessment loop closure) is complete except M8** (scheduled reassessment dead code — P3-B). After merge, next is
**P3-B (M8)** then **P4** (governance hardening). Public SaaS / billing / launch / integrations remain out of scope.
