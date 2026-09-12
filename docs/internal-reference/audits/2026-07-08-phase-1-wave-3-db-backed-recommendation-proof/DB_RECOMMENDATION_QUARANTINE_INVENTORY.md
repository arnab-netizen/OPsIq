# DB-backed Recommendation Quarantine Inventory — Phase 1 Wave 3

- Branch: `claude/phase-1-wave-3-db-backed-recommendation-proof` · Base: `origin/main @ a6f00587` (PR #184 merge)
- Date: 2026-07-08
- Quarantine root: `src/__ignored_tests__/` (excluded from vitest via `exclude: ["**/__ignored_tests__/**"]`)
- **Quarantined before Wave 3: 91** · **Reactivated this wave: 1** · **Remaining: 90**
- DB test gate: `SHOULD_RUN_DB_TESTS = (process.env.TEST_WITH_DB === "true")`; the maintained CI suite sets `TEST_WITH_DB: "true"`, so `describe.skipIf(!SHOULD_RUN_DB_TESTS)` tests **run** there (not ignored-only).

## Method / columns
path · domain · source targeted · DB models · why-ignored · still-relevant · deps · lane · proposed action · risk-if-left.

**Shared why-ignored:** all live under `src/__ignored_tests__/` (directory-level vitest exclusion from an earlier bulk quarantine). Relative imports broke on the move; some also drifted against a refactored recommendation API.

---

## A. DB-backed recommendation candidate map

| # | Path | Source targeted | DB models | Lane | Real DB? | Status / action |
|---|---|---|---|---|---|---|
| 1 | `services/recommendation.integration.test.ts` | `createRecommendation`, `getRecommendationsForEngagement` (+ scoring) | Recommendation, Engagement, EngagementMembership, Workspace, ClientAccount, User | DB (`TEST_WITH_DB`) | **YES** | **REACTIVATED (migrated to current API)** — see FINAL_REPORT §7/§10 |
| 2 | `services/__tests__/recommendation.priority.test.ts` | `mapScoreToPriority`, `createRecommendation`, `updateRecommendationPriorityFromScore` | Recommendation (mocked) | unit (mocked) | no (`vi.spyOn(db.recommendation,…)`) | defer — mocks the db boundary; not real-DB proof (Wave-3 rules 8–9). Candidate for a mock→real-DB rewrite in a later wave. |
| 3 | `services/__tests__/recommendation.reranking.test.ts` | `reRankRecommendationsInEngagement` | Recommendation (mocked) | unit (mocked) | no (`vi.spyOn`) | defer — mocked; also `reRankRecommendationsInEngagement` only reranks rows with persisted `scoringMetrics` (not set by `createRecommendation`), so a real-DB rerank proof needs direct-insert fixtures. Later wave. |
| 4 | `services/control/__tests__/recommendation.test.ts` | `@/services/control/recommendation` (`isDataSufficient`, etc.) | none | pure-unit | n/a | defer — pure-unit control gate; not DB-backed. |
| 5 | `recommendations-manager.test.tsx` | recommendations UI manager | none | component-harness | n/a | defer — UI wave. |
| 6 | `services/action.integration.test.ts` | action service (recommendation-adjacent) | Action/Recommendation | DB | partial | defer — broader action lifecycle; out of the smallest ranking subset. |

## B. API-drift note (why the integration test was migrated, not moved verbatim)
The quarantined `recommendation.integration.test.ts` imported `generateRecommendations` and `listRecommendationsForEngagement` from `@/services/recommendation`. Both were **removed** during a service refactor:
- `generateRecommendations(from findings)` → no direct replacement (generation is now `createRecommendationsFromInterventions` / direct `createRecommendation`).
- `listRecommendationsForEngagement` → replaced by `getRecommendationsForEngagement(engagementId, userId, workspaceId)`.

A verbatim reactivation would fail to compile. Per the owner's Wave-3 decision, the test was **migrated to the current API against a real database**, preserving the original intent (persist → prioritise → list → isolate) — see FINAL_REPORT §7.

## C. Why #1 selected as the smallest meaningful DB-backed subset
- It is the only quarantined recommendation test whose intent is **real-DB persistence** (the priority/reranking tests mock the db boundary, so per rules 8–9 they cannot serve as DB-backed proof).
- Migrated onto the **proven** DB-test setup pattern in `src/__tests__/p2a/p2a-production-path.test.ts` (real `db.workspace/clientAccount/engagement` seed + `CanonicalAuthContext` + `createRecommendation`), minimising blind-authoring risk.
- Covers the required Wave-3 dimensions (where the current architecture supports them): persisted create, **priority-from-score** (exact, mirrors the service's own scoring), persisted **listing + ordering** (priority desc, createdAt desc), **engagement/workspace isolation**, and **determinism**.

## Rules honored
- No quarantined test deleted (reactivation is a `git mv`; history preserved). No assertion weakened.
- The reactivated test runs actively in the maintained suite's DB lane (not ignored-only).
- 90 tests remain quarantined, each with a documented domain and proposed future action.
