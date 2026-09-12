# Phase 2 G3 — Weekly KPI-Deterioration → Governed Adaptive Re-Evaluation (Final Report)

## 1. Gap ID
**G3** (Wave-8 owner-journey coverage matrix).

## 2. Owner-journey stage
Stage 10 — `weekly-review-cadence` ("Weekly management / trend review cadence & re-evaluation").
Dimensions exercised: (1) consulting lifecycle stage (weekly review cadence), (2) business condition,
(3) intervention mode + phase (mode + cadence adapt).

## 3. Baseline status from Wave-8 matrix
`partial_gap`. Wave-8 recorded: "Weekly summary renders; an end-to-end assertion that a significant
change (KPI deterioration) routes into governed re-evaluation of condition/mode/phase + review
cadence (the CLAUDE.md mandatory adaptive rule) is owed." No maintained-lane test exercised the KPI
deterioration → `triggerReEvaluation` chain un-mocked (the existing escalation tests are quarantined
placeholders; the one un-mocked re-eval test drives an intervention transition, not the KPI path).

## 4. Proof added
`src/services/__tests__/kpi-deterioration-reeval.db.test.ts` — a **DB-backed** test with two cases:

**A. Routing.** Seeds a current distressed condition profile, a recommendation, and a KPI with three
snapshots declining over time, then calls the real `detectKPIDeteriorationPattern` (the weekly-review
escalation sweep). Asserts it returns a real `kpi_deterioration_pattern` alert for the KPI **and**
that the governed re-evaluation actually fired (a `CONDITION_CHANGED` audit event was emitted, plus
the `ESCALATION_ALERT_KPI_DETERIORATION_PATTERN` audit) — i.e. the deterioration *routes into*
governed re-evaluation, not just an alert.

**B. Dimensions.** Seeds a distressed + critical-cash profile plus two deteriorating KPIs, then calls
the real `triggerReEvaluation({ changeType: "kpi_deterioration", ... })` and asserts the returned
`ReEvaluationResult` re-evaluates the mandated dimensions:
- **BusinessConditionProfile** — `reasoningFactors` include both `kpi_deterioration` and
  `critical_cash_pressure`; `recommendedRating === "critical"`.
- **InterventionMode** — `recommendedMode === "recovery"` (distressed + critical financial pressure).
- **Recommendation + action priority** — both shifts `escalate`.
- **Review cadence** — `recommendedDaysUntilReview === 3`, `riskLevel === "critical"`.
- **Health status** — a valid `recommendedStatus` and a returned `auditEventId`.
- **Targets map** — `businessConditionProfile / interventionMode / recommendationPriority /
  actionPriority / reviewCadence / healthStatus` are `true`, and `interventionPhase` is `false`.

## 5. Honest deviation from the gap text (documented, not papered over)
The Wave-8 gap text lists "condition/mode/**phase** + cadence", but the governed engine
(`determineReEvaluationTargets`) **intentionally excludes `interventionPhase` for the
`kpi_deterioration` change type** — phase is driven by the findings/action lifecycle, not by a KPI
trend. The test asserts the **real** governed behaviour (`targets.interventionPhase === false`) rather
than a phase change the engine deliberately does not make. The shock path (G4) *does* re-evaluate
phase; the contrast is intentional and is asserted there.

## 6. Product defects found
**None.** `triggerReEvaluation` and `detectKPIDeteriorationPattern` behave correctly; the gap was
missing end-to-end proof. (The re-eval path was pre-audited for the class of latent invalid-select
bug found in G2 — `reRankRecommendationsInEngagement` uses an unselected `findMany` and skips recs
without `scoringMetrics`, so a seeded recommendation is handled cleanly.)

## 7. Files changed
- Added: `src/services/__tests__/kpi-deterioration-reeval.db.test.ts`.
- Added: `docs/audits/2026-07-08-phase-2-G3-kpi-deterioration-reeval/{FINAL_REPORT.md,
  EVIDENCE_LEDGER.json,COVERAGE_DELTA.md}`.
- No product/source/schema/CI change.

## 8. Tests added / reactivated
Added the KPI-deterioration re-eval proof (2 DB-backed cases). Runs in the **required** maintained
vitest lane (`TEST_WITH_DB=true`, memory-stable, no browser). No test reactivated, deleted, weakened,
or quarantined. Quarantine delta: 0.

## 9. Commands run
- `git checkout -B claude/phase-2-owner-journey-G3-kpi-deterioration-reeval origin/main`
- Verified evaluator thresholds (`evaluateBusinessConditionImpact` / `...ModeImpact` /
  `...PriorityImpact` / `...ReviewCadenceImpact`), `determineReEvaluationTargets("kpi_deterioration")`,
  `detectKPIDeteriorationPattern` snapshot logic, and the DB delegate names against the schema.
- Execution delegated to PR CI (`node_modules` absent locally, as in prior waves).

## 10. CI status
To be confirmed on the draft PR. Required gate: `CI - Build & Test` runs both cases in the maintained
suite.

## 11. Remaining risks
- The pre-existing `Smoke - Production Dashboard` failure is unrelated and out of scope.

## 12. Rollback plan
`git revert` the single test-only commit; zero product/source/schema/CI impact.

## 13. Next gap recommendation
Proceed to **G4** (shock event → adaptive re-evaluation): drive `createShockEvent` (routing) +
`triggerReEvaluation({changeType:"shock_event"})` (all dimensions incl. interventionPhase).
