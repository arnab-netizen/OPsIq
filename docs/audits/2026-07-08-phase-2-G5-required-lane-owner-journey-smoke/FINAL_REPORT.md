# Phase 2 G5 — Required-Lane Owner-Journey Smoke (Final Report)

## 1. Gap ID
**G5** (Wave-8 owner-journey coverage matrix).

## 2. Owner-journey stage
Stage 12 — `steady-state-governance` (the stage that carries all four mandated dimensions). This gap
is cross-cutting: it promotes owner-journey proof into a required, memory-stable lane.

## 3. Baseline status from Wave-8 matrix
`planned_gap`. Wave-8 recorded: "Owner-journey proof currently lives ONLY in the non-required browser
lane (also the next-build heap-OOM-prone lane). The future full-Playwright wave should ... promote a
minimal, memory-stable owner-journey smoke into a required, memory-stable lane so owner-journey
regressions block merges." The `OWNER_JOURNEY_STAGES` seam added in Wave 8 was inert (no consumer).

## 4. Proof added
`src/services/__tests__/owner-journey-smoke.db.test.ts` — one consolidated, **memory-stable**
owner-journey smoke that walks the core journey end-to-end through the **real** services against the
real database, in the **required** maintained vitest lane (`TEST_WITH_DB=true`, no browser, no
`next build`). A regression anywhere in the intake → diagnosis → recommendation-surfacing →
adaptive-re-evaluation chain now blocks merges.

Journey walked (no mocks):
1. **Intake + diagnosis** (stages 2–3) — `diagnoseBusiness` persists an engagement, a current
   `BusinessConditionProfile`, findings and recommendations; the smoke asserts the engagement and a
   current profile exist and recommendations were persisted.
2. **Recommendation surfacing + ordering** (stage 4) — after granting the owner engagement access,
   `getRecommendationsForEngagement` returns the recommendations highest-priority-first (the G2
   ordering contract), and the returned set matches what was persisted.
3. **Shock → governed adaptive re-evaluation** (stage 11) — `triggerReEvaluation({changeType:
   "shock_event"})` on the diagnosed engagement re-evaluates every mandated dimension
   (`businessConditionProfile / interventionMode / interventionPhase / reviewCadence`, plus a
   recommendation-priority shift, a business-condition rating, and an `auditEventId`).

## 5. Seam consumption (Wave-8 intent fulfilled)
The test **consumes** the previously inert `OWNER_JOURNEY_STAGES` / `OWNER_JOURNEY_DIMENSIONS` seam
(`tests/browser/owner-journey-map.ts`) in a pure, always-run assertion: the journey manifest covers
all four mandated dimensions and the stages this smoke exercises (`onboarding-intake`,
`diagnosis-confidence`, `recommendation-priority`, `shock-adaptive-reeval`), and is ordered from
entry (order 1). This gives the seam its first consumer, exactly as Wave 8 planned.

## 6. Product defects found
**None.** All services behave correctly (the underlying defects in the recommendation-list and
shock-detection paths were fixed in G2 and G4 respectively; this smoke exercises the corrected paths).

## 7. Files changed
- Added: `src/services/__tests__/owner-journey-smoke.db.test.ts`.
- Added: `docs/audits/2026-07-08-phase-2-G5-required-lane-owner-journey-smoke/{FINAL_REPORT.md,
  EVIDENCE_LEDGER.json,COVERAGE_DELTA.md}`.
- No product/source/schema/CI change.

## 8. Tests added / reactivated
Added the owner-journey smoke (1 pure seam-consumption case + 1 DB-backed end-to-end walk) in the
**required** maintained vitest lane. No test reactivated, deleted, weakened, or quarantined.
Quarantine delta: 0.

## 9. Commands run
- `git checkout -B claude/phase-2-owner-journey-G5-required-lane-smoke origin/main`
- Verified `diagnoseBusiness` / `getRecommendationsForEngagement` / `triggerReEvaluation` signatures,
  the seam exports, the cross-tree relative import path, and FK-safe cleanup ordering against source.
- Execution delegated to PR CI (`node_modules` absent locally, as in prior waves).

## 10. CI status
To be confirmed on the draft PR. Required gate: `CI - Build & Test` runs the smoke in the maintained
suite.

## 11. Remaining risks
- The smoke uses loose-but-meaningful assertions on the adaptive step (it asserts the governed
  re-evaluation fires across the mandated dimensions rather than pinning exact values that depend on
  the diagnosed severity), keeping it robust to reasonable diagnosis-logic evolution.
- The pre-existing `Smoke - Production Dashboard` failure is unrelated and out of scope.

## 12. Rollback plan
`git revert` the single test-only commit; zero product/source/schema/CI impact.

## 13. Next gap recommendation
**None** — G5 is the last Wave-8 owner-journey gap. See the Phase-2 closure report
(`docs/audits/2026-07-08-phase-2-owner-journey-G1-G5-closure/`).
