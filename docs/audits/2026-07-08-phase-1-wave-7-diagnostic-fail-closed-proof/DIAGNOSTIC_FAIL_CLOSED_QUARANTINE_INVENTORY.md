# Diagnostic Uncertainty / Fail-Closed Quarantine Inventory — Phase 1 Wave 7

- Branch: `claude/phase-1-wave-7-diagnostic-fail-closed-proof` · Base: `origin/main` (post-Wave-6, `d1dabac0`)
- Date: 2026-07-08
- Quarantined before Wave 7: 87 (post-Wave-6) · Reactivated: 1 · Remaining: 86.

## Candidate map

| # | Path | Source targeted | DB | Real DB? | Status / action |
|---|---|---|---|---|---|
| 1 | `services/control/__tests__/recommendation.test.ts` | `isDataSufficient`, `hasPatterns`, `getPatternsByProblemType`, `hasHighSuccessRatePatterns` (`@/services/control/recommendation`) | none (pure) | no | **REACTIVATED** — fail-closed data-sufficiency gate |
| 2 | `services/control/__tests__/decision-gate.test.ts` | decision-gate control | mixed | no | defer — decision-gate scope (separate control surface) |
| 3 | `services/contradiction-detector/__tests__/detector.test.ts` | contradiction detection | none/async | no | defer — contradiction detection is its own scope; larger surface |
| 4 | `services/decision-control/decision-control.service.test.ts` | decision-control service | mixed | mixed | defer — decision-control scope |
| 5 | `integration/scenarios/f7-contradictory-kpi.test.ts` | contradictory-KPI scenario | mixed | mixed | defer — broad scenario suite (not all at once) |
| 6 | `app/api/__tests__/dashboard-blocked-metrics.test.ts` / `audit-blocked-paths.test.ts` | blocked-path API surfaces | mixed | mixed | defer — API-layer scope |

## Why #1 selected (smallest meaningful diagnostic fail-closed proof)
`isDataSufficient(patterns, variables)` is the **control gate** that decides whether there is enough
evidence to emit a recommendation. It is the canonical fail-closed surface: it **blocks** (never emits a
confident recommendation) when evidence is insufficient. The reactivated test proves, against the current
source (`src/services/control/recommendation.ts`):

- **insufficient patterns → blocked** (`status: "blocked"`, `reason: "INSUFFICIENT_PATTERNS"`) when
  `patterns.length < 3` (incl. the empty-patterns edge) — no fabricated certainty from thin evidence;
- **low-confidence variables → blocked** (`reason: "LOW_CONFIDENCE_VARIABLES"`, with the offending
  variable names surfaced, sorted) when any variable confidence `< 0.6` — uncertainty is surfaced, not
  masked;
- **sufficient evidence → approved** (`status: "approved"`) only when both gates pass;
- helper contracts: `hasPatterns` (problem-type match), `getPatternsByProblemType` (filter + success-rate
  sort), `hasHighSuccessRatePatterns` (>60% threshold) — used to decide whether evidence is actionable.

This is exactly the Wave-7 mandate: insufficient/low-confidence evidence must fail closed (block), with no
fake certainty. It is a **pure unit test** (no DB, no mocks), the strongest, most deterministic form of proof.

## Labelling (honest proof classification)
- All four functions are **pure** (no DB, no mocks, no I/O). This is **genuine deterministic fail-closed
  proof** — not SERVICE_LOGIC-with-mocked-DB and not real-DB (neither is needed; the gate is pure).

## API / fixture notes
- The test is **current-API**: `isDataSufficient`/`hasPatterns`/`getPatternsByProblemType`/
  `hasHighSuccessRatePatterns` and the `DataSufficiencyResult`/`VariableWithConfidence` types match the
  current exports of `src/services/control/recommendation.ts`; `DetectedPattern` is imported from
  `@/services/intelligence/pattern-engine`.
- The `DetectedPattern` fixtures provide `{patternId, problemType, itemIds, successRate}` and omit
  `outcomePattern`/`frequency`/`avgImpact`/`impactRange`. This is **type-only** (the file sits under a
  `__tests__` dir, excluded from the `tsc` gate; vitest is transpile-only) — verified against the source
  that **none of the four functions read those fields** (they read only `length`, `problemType`,
  `successRate`, and `variables[].confidence/name`), and `problemType` is compared by string equality.
  So the fixtures are runtime-sufficient; no repair needed and no assertion changed.
- The import path is **unchanged** (`../recommendation`): the file moved between two `.../control/__tests__/`
  directories of equal depth, so the relative path still resolves.
- **No `@/lib/db` mock** — the test does not touch the DB module, so it is immune to the
  maintained-suite (`TEST_WITH_DB=true`) `getDbInstance` suite-load requirement.

## Rules honored
- No quarantined test deleted (reactivation is `git mv`; history preserved). No assertion weakened.
- Pure unit — no mocked DB counted as proof; genuine fail-closed proof.
- 86 tests remain quarantined, each with a documented action. Broad scenario/API/UI suites explicitly NOT
  reactivated in this wave.
