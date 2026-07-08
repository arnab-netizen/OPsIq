# Diagnosis→Recommendation Quarantine Inventory — Phase 1 Wave 5

- Branch: `claude/phase-1-wave-5-diagnosis-recommendation-integration` · Base: `origin/main` (post-Wave-3)
- Date: 2026-07-08
- Quarantined before Wave 5: 90 · Reactivated: 1 · Remaining: 89.
- DB gate: `SHOULD_RUN_DB_TESTS = (TEST_WITH_DB === "true")`; maintained CI suite sets it true.

## Candidate map

| # | Path | Source targeted | DB | Real DB? | Status / action |
|---|---|---|---|---|---|
| 1 | `services/diagnosis.integration.test.ts` | `diagnoseBusiness`, `validateBusinessProblem` (`@/services/diagnosis`) | real (client/engagement/findings/recommendations) | **YES** | **REACTIVATED + migrated** — diagnosis→recommendation proof |
| 2 | `services/findings.integration.test.ts` | findings service | real DB | yes | defer — finding CRUD, not diagnosis→recommendation |
| 3 | `services/action.integration.test.ts` | action service | real DB | yes | defer — recommendation→action (Wave 6 owner-NBA scope) |
| 4 | `integration/scenarios/f3-wrong-diagnosis.test.ts` | outcome-core (impact/variance/confidence) + scenario-builder helper | none | no | defer — outcome tracking, not diagnosis→recommendation generation; depends on quarantined `../helpers/scenario-builder` |
| 5 | `integration/scenarios/f1..f10*.test.ts` | broad end-to-end scenario suites | mixed | mixed | defer — broad scenario suites (rule: don't reactivate all at once) |
| 6 | `findings-manager.test.tsx` | findings UI | none | no | defer — UI wave |

## Why #1 selected (smallest meaningful diagnosis→recommendation proof)
`diagnoseBusiness(input, authContext, workspaceId)` is the diagnosis entry point: it validates the input, orchestrates the diagnosis engines, and **persists** a client + engagement + findings + recommendations, returning a `DiagnosisResult` whose `recommendations[]` is exactly the diagnosis→recommendation output. Reactivating its test proves the required Wave-5 dimensions:
- diagnostic input produces expected recommendations (persisted, structured: id/title/priority/description);
- diagnostic reasoning surface (`findings`) is produced;
- unsupported/sparse input does not fabricate high confidence (`confidence !== "high"` + `dataWarnings`);
- workspace scoping of the created diagnosis (tenant isolation).
It also keeps the pure `validateBusinessProblem` fail-closed input checks.

## API-drift note (migration, not verbatim move)
The quarantined test called `diagnoseBusiness(input, "test-actor")` (old 2-arg signature). The current service is `diagnoseBusiness(input, authContext: CanonicalAuthContext, workspaceId)` and persists to the DB. A verbatim move would not compile / would not run. Per the owner loop, the test was **migrated to the current API against the real DB** (gated `describe.skipIf(!SHOULD_RUN_DB_TESTS)`), preserving the original intent. Setup follows the proven pattern in `src/__tests__/p2a/p2a-production-path.test.ts` and this repo's Wave-3 recommendation DB test.

## Rules honored
- No quarantined test deleted (reactivation is `git mv`; history preserved). No assertion weakened.
- The DB-backed block runs in the maintained suite's real-Postgres lane (not ignored-only); the pure `validateBusinessProblem` block runs in every lane.
- 89 tests remain quarantined, each with a documented action. Broad scenario suites (f1–f10) explicitly NOT reactivated all at once.
