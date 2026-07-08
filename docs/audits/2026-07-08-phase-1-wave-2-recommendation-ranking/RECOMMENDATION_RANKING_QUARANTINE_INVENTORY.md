# Recommendation-Ranking Quarantine Inventory — Phase 1 Wave 2

- Branch: `claude/phase-1-wave-2-recommendation-ranking` · Base: `origin/main @ 4bd6ce2f` (PR #183 merge)
- Date: 2026-07-08
- Quarantine root: `src/__ignored_tests__/` (excluded from vitest via `exclude: ["**/__ignored_tests__/**"]`)
- Blocking-lane per-file exclude list: `.claude/test-quarantine.json` (21 files; none are recommendation-ranking)
- **Quarantined before Wave 2: 93** · **Reactivated this wave: 2** · **Remaining: 91**

## Method / columns
For each candidate: path · domain · source under test · why-ignored · still-relevant? · dependencies · unit/service vs integration · proposed action · risk-if-left.

**Shared why-ignored:** all candidates live under `src/__ignored_tests__/`, excluded wholesale by the vitest config. They were bulk-moved there during earlier CI-stabilization. The move broke each test's `../<module>` relative import (the source was never moved with it), so they cannot pass from the quarantine location; reactivation requires relocating each test beside its source. Some also drifted against evolved shared domain types (`OperatorItem`, `DetectedPattern`, `ProblemType`) since authoring.

---

## A. Recommendation-ranking / priority candidate map

| # | Path | Source under test | Unit? | `@/lib/db`? | Still relevant | Proposed action | Risk if left |
|---|---|---|---|---|---|---|---|
| 1 | `services/operator/__tests__/priority.test.ts` | `services/operator/priority.ts` | **pure-unit** | no | yes | **REACTIVATED (this wave)** | priority scoring / calibration weighting unproven |
| 2 | `services/intelligence/__tests__/recommendation.test.ts` | `services/intelligence/recommendation.ts` | **pure-unit** | no | yes | **REACTIVATED (this wave)** | recommendation ordering / data-sufficiency demotion unproven |
| 3 | `services/control/__tests__/recommendation.test.ts` | `services/control/recommendation.ts` | pure-unit | no | yes | defer to Wave 3 (keep wave minimal) | control-gate ranking contract unproven |
| 4 | `services/__tests__/recommendation.priority.test.ts` | `services/recommendation.ts` (`mapScoreToPriority`, `createRecommendation`, `updateRecommendationPriorityFromScore`) | **DB-bound** (`db from @/lib/db`) | yes | yes | defer (DB lane) — Wave-2 rule prefers pure-unit first | DB-persisted priority mapping unproven |
| 5 | `services/__tests__/recommendation.reranking.test.ts` | `services/recommendation.ts` (`reRankRecommendationsInEngagement`) | **DB-bound** (`db from @/lib/db`) | yes | yes | defer (DB lane) | engagement-wide reranking unproven |
| 6 | `services/recommendation.integration.test.ts` | recommendation service (integration) | integration/DB | likely | yes | defer (integration wave) | end-to-end recommendation flow unproven |
| 7 | `recommendations-manager.test.tsx` | recommendations UI manager | component-harness | no | yes | defer (UI wave) | UI recommendation surface unproven |

## B. Ranking-adjacent (not selected this wave)
- `services/operator/__tests__/*` (other operator tests), `services/outcome/__tests__/outcome-accuracy.test.ts`, `services/calibration/__tests__/engine.test.ts`, `app/api/calibration/__tests__/route.test.ts` — calibration/outcome feed the priority multiplier but are separate modules; defer.

## C. Why #1 and #2 selected (smallest meaningful subset)
- Both are **pure-unit** (only vitest + the engine + domain types — no DB, no Prisma, no route/component harness), so they run in the default vitest lane and in the blocking maintained suite without extra setup.
- Together they cover the required Wave-2 dimensions:
  1. **baseline ranking/order** — `generateMultipleRecommendations` returns patterns sorted by success rate (desc).
  2. **priority/risk weighting** — `calculatePriorityScore` (impact × confidence × recency), `getCalibrationMultiplier`.
  3. **evidence/confidence impact** — calibration multiplier scales weight by historical accuracy; confidenceScore = successRate/100.
  4. **uncertainty / fail-closed** — `generateRecommendation` data-sufficiency gate (≥3 patterns, confidence ≥0.6) blocks/insufficient; calibration null-safety.
  5. **deterministic ordering** — explicit determinism describes in both.
  6. **rejection/demotion of unsupported recommendations** — insufficient-data and no-matching-pattern fallbacks; sub-threshold (≤60%) patterns demoted.
- The DB-bound `recommendation.priority`/`recommendation.reranking` tests are the literal "priority/reranking" names but require a live DB; per the Wave-2 rule (prefer pure-unit, avoid DB-heavy unless unavoidable) they are deferred to a DB lane wave. `control/recommendation.test.ts` is pure-unit but overlaps the same control gate already exercised transitively by #2; deferred to keep this wave minimal.

## Rules honored
- No quarantined test deleted. No assertion value weakened. Reactivation was a `git mv` (history preserved).
- The only edits were **stale-fixture/type updates** required to compile against evolved shared domain types (documented in FINAL_REPORT §10 and EVIDENCE_LEDGER `source_fixes`), not assertion changes.
- 91 tests remain quarantined, each with a documented domain and proposed future action.
