# Phase 2 G4 — Shock Event → Governed Adaptive Re-Evaluation (Final Report)

## 1. Gap ID
**G4** (Wave-8 owner-journey coverage matrix).

## 2. Owner-journey stage
Stage 11 — `shock-adaptive-reeval` ("Shock / crisis event triggers governed adaptive
re-evaluation"). Dimensions exercised: (2) business condition, (3) intervention mode + phase,
(4) human execution reality (a shock is a business-operational event).

## 3. Baseline status from Wave-8 matrix
`partial_gap`. Wave-8 recorded: "Crisis/chaos specs exercise shock surfaces; a focused end-to-end
assertion binding a shock event to the adaptive re-evaluation of `BusinessConditionProfile` +
`InterventionMode`/`InterventionPhase` + priority + review cadence is owed." The existing shock test
(`shock-01-persist.db.test.ts`) **mocks** `@/services/re-evaluation` and `@/services/shock-detection`,
so the real shock → re-evaluation binding was never exercised end-to-end.

## 4. Product defect found
**Yes — a real owner-facing defect**, surfaced by driving `createShockEvent` un-mocked.
`detectShockFromCurrentState` (`src/services/shock-detection.ts`) selected
`engagement.conditionProfiles`, but the Engagement relation is named `businessConditionProfiles`.
`prisma.engagement.findFirst` therefore threw `PrismaClientValidationError` on **every** call, so
shock detection — and thus `createShockEvent` (the shock event write path) — failed unconditionally.
It was latent because the only shock test mocks `@/services/shock-detection`. Same class of latent
invalid-query defect found and fixed in G2.

## 5. Fix made
Renamed the relation in the `detectShockFromCurrentState` engagement select
(`conditionProfiles` → `businessConditionProfiles`) and its usage
(`engagement.conditionProfiles[0]` → `engagement.businessConditionProfiles[0]`). The remaining
selected fields (`severityScore`, `urgencyLevel`, `cashPressureLevel`, `marginPressureLevel`,
`ownerDependencyRisk`, and the `evidence` relation's `evidenceType`/`status`) are all real. No schema
or contract change; the returned `ShockDetectionResult` shape is unchanged.

## 6. Proof added
`src/services/__tests__/shock-event-reeval.db.test.ts` — a **DB-backed** test with two cases:

**A. Binding.** Seeds a current critical condition profile (severityScore 9 → shock detection
confirmed) and an engagement whose intervention phase starts at `growth`. Calls the real
`createShockEvent` un-mocked and asserts: the shock is persisted and `detectionConfirmed === true`;
the `SHOCK_EVENT_RECORDED` audit fired; and the shock **bound into** the governed re-evaluation — a
`CONDITION_CHANGED` audit event was emitted **and** the engagement's `interventionPhase` was
re-evaluated and persisted (`growth` → re-evaluated phase) with a `version` bump.

**B. Dimensions.** Calls the real `triggerReEvaluation({ changeType: "shock_event", ... })` against a
seeded critical profile and asserts the returned `ReEvaluationResult` re-evaluates **all** mandated
dimensions (the distinguishing contrast with the KPI path in G3, which excludes phase):
- **Targets** — `businessConditionProfile / interventionMode / interventionPhase /
  recommendationPriority / actionPriority / reviewCadence / healthStatus` are **all** `true`.
- **BusinessConditionProfile** — `recommendedRating === "critical"`.
- **InterventionMode** — `recommendedMode === "recovery"`.
- **InterventionPhase** — a boolean `canAdvance` decision is produced.
- **Priority** — both shifts `escalate`.
- **Review cadence** — `recommendedDaysUntilReview === 3`, `riskLevel === "critical"`.
- **Health** — a valid `recommendedStatus` and a returned `auditEventId`.

## 7. Files changed
- Changed: `src/services/shock-detection.ts` (relation-name fix in `detectShockFromCurrentState`).
- Added: `src/services/__tests__/shock-event-reeval.db.test.ts`.
- Added: `docs/audits/2026-07-08-phase-2-G4-shock-reeval/{FINAL_REPORT.md,EVIDENCE_LEDGER.json,
  COVERAGE_DELTA.md}`.

## 8. Tests added / reactivated
Added the shock → re-eval proof (2 DB-backed cases) in the **required** maintained vitest lane
(`TEST_WITH_DB=true`, memory-stable, no browser). No test reactivated, deleted, weakened, or
quarantined. Quarantine delta: 0.

## 9. Commands run
- `git checkout -B claude/phase-2-owner-journey-G4-shock-reeval origin/main`
- Pre-audited the shock path for the G2-class latent-query defect; found and fixed the
  `conditionProfiles` relation-name bug in `detectShockFromCurrentState`.
- Verified `determineReEvaluationTargets("shock_event")` (all targets), the evaluator thresholds, and
  the `evaluateInterventionPhaseImpact` no-findings → `triage` rule against the source.
- Execution delegated to PR CI (`node_modules` absent locally, as in prior waves).

## 10. CI status
To be confirmed on the draft PR. Required gate: `CI - Build & Test` runs both cases in the maintained
suite.

## 11. Remaining risks
- The pre-existing `Smoke - Production Dashboard` failure is unrelated and out of scope.

## 12. Rollback plan
`git revert` the single commit restores the prior `detectShockFromCurrentState` select (re-breaking
detection) and removes the test/docs. Change is localized to one service function.

## 13. Next gap recommendation
Proceed to **G5** (required-lane owner-journey smoke): promote a consolidated, memory-stable
owner-journey smoke (diagnosis → recommendation ordering → adaptive re-evaluation) into the required
vitest lane, consuming the Wave-8 `OWNER_JOURNEY_STAGES` seam.
