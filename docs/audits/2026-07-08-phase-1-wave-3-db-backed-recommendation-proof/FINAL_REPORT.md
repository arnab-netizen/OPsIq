# Phase 1 Wave 3 — DB-backed Recommendation Proof (Final Report)

Reactivate the smallest meaningful quarantined test that proves **DB-backed** recommendation behavior
(persist → prioritise → list → isolate) against a real database. No feature build, no recommendation
architecture rewrite, no test deletion, no assertion weakening.

## 1. Part A — PR #184 merge summary
Phase 1 Wave 2 (recommendation-ranking reactivation) merged into `main` via the normal merge method —
merge commit **`a6f005879b897e2f039715b520311d1d58536d97`** (PR #184). Final hostile diff review was
clean: 2 test moves + documented stale-fixture fixes + 3 docs; no product/source/schema/CI/Phase-0
files; no Wave-1 regression; **zero `expect()` assertions changed**; quarantine 93→91; both
`build-and-test` runs green with the 2 Wave-2 tests executed actively. The only reds were 2
non-required browser-pack `next build` OOM/SIGABRT infra flakes (could not be rerun — 403).

## 2. Part B — post-merge main verification summary
Main HEAD = `a6f00587` (the merge commit); PR #184 head `3d05efdc` in ancestry; clean tree; all 6
active tests (Wave-1 ×4 + Wave-2 ×2) present. Main push-triggered CI: **CI - Build & Test** ✅
(maintained suite ran Wave-1 + Wave-2 tests), **P2B Database Verification** ✅, **MVP Readiness Gate**
✅, **CI/CD Foundations - Phase 13** ✅. Only red: **Smoke - Production Dashboard** ❌ — pre-existing
production `membership_lookup_failed`, non-required, not a regression. **Classification: GREEN. Phase 1
Wave 2 fully closed on main.**

## 3. Wave-3 branch and HEAD
- Branch: `claude/phase-1-wave-3-db-backed-recommendation-proof`
- HEAD before: `a6f00587` (base = verified main). HEAD after commit: see final response.

## 4. Total quarantined tests remaining before Wave 3
**91** test files under `src/__ignored_tests__/`.

## 5. DB-backed recommendation tests identified
Full map in `DB_RECOMMENDATION_QUARANTINE_INVENTORY.md`. Real-DB: `recommendation.integration.test.ts`.
Mocked-db (not real-DB): `recommendation.priority.test.ts`, `recommendation.reranking.test.ts`.
Non-DB / UI: `control/recommendation.test.ts`, `recommendations-manager.test.tsx`. Broader:
`action.integration.test.ts`.

## 6. Tests selected for reactivation and why
**`recommendation.integration.test.ts`** — the only quarantined recommendation test whose intent is
**real-database** persistence. The priority/reranking tests mock the `db` boundary (`vi.spyOn`), so
per Wave-3 rules 8–9 they cannot serve as DB-backed proof. The integration test was migrated onto the
**proven** DB-test setup pattern in `src/__tests__/p2a/p2a-production-path.test.ts` to minimise
blind-authoring risk, and it covers the required Wave-3 dimensions the current architecture supports:
persisted create, priority-from-score, persisted listing + ordering, engagement/workspace isolation,
determinism.

## 7. Tests reactivated
Moved (`git mv`, history preserved) and **migrated to the current recommendation API**:
`src/__ignored_tests__/services/recommendation.integration.test.ts` →
`src/services/__tests__/recommendation.integration.test.ts`.

Why a migration, not a verbatim move: the original imported `generateRecommendations` and
`listRecommendationsForEngagement`, both **removed** in a service refactor. The migration targets the
current API — `createRecommendation` (persist + priority-from-score) and
`getRecommendationsForEngagement` (persisted listing + ordering + engagement access) — while
preserving the original intent. It is gated `describe.skipIf(!SHOULD_RUN_DB_TESTS)` and runs against the
real test DB in the maintained suite (`TEST_WITH_DB=true`). Placed under a `__tests__` dir (excluded
from the `tsc --noEmit` gate, included in the vitest include `src/**/*.test.ts`), matching repo
convention and the active p2a DB test.

The 5 active it-blocks:
1. persists a recommendation with the caller-provided priority (row present, workspace-scoped);
2. derives priority from `scoringInput` **exactly** (the assertion computes the expected value with the
   same `calculateRecommendationScoreBreakdown` + `mapScoreToPriority` the create path uses);
3. derives the same priority deterministically for identical `scoringInput`;
4. lists persisted recommendations for the engagement, ordered by (priority desc, createdAt desc);
5. isolates recommendations by engagement/workspace (no cross-engagement leakage).

## 8. Tests still quarantined and why
**90 remaining** — full map in the inventory. DB-recommendation follow-ups deferred: the mocked
`recommendation.priority`/`reranking` tests (a mock→real-DB rewrite is a later wave; `reRank` also needs
persisted `scoringMetrics` fixtures the create path doesn't set), `control/recommendation.test.ts`
(pure-unit), `recommendations-manager.test.tsx` (UI), `action.integration.test.ts` (broader). None
deleted, none weakened.

## 9. Defects found
**None in product/source.** Static analysis found the current recommendation service correct; the only
issue was **API drift** in the quarantined test (imports of removed functions), addressed by migrating
to the current API — not a product defect.

## 10. Fixes made
**No product/source fix. No recommendation architecture change. No assertion weakened.** The change is
the migration of one test to the current DB-backed API (documented in §7 and the EVIDENCE_LEDGER).

## 11. Files changed
- Reactivated + migrated: `src/services/__tests__/recommendation.integration.test.ts` (from
  `src/__ignored_tests__/...`).
- Added: `docs/audits/2026-07-08-phase-1-wave-3-db-backed-recommendation-proof/{FINAL_REPORT.md,
  DB_RECOMMENDATION_QUARANTINE_INVENTORY.md,EVIDENCE_LEDGER.json}`.
- No product/source/schema/CI files modified. No Phase-0/Wave-1/Wave-2 file touched.

## 12. Commands run
`git checkout -B claude/phase-1-wave-3-db-backed-recommendation-proof origin/main`; quarantine +
DB-backed candidate classification (grep `vi.spyOn`/`@/lib/db`); source-contract study of
`createRecommendation`/`getRecommendationsForEngagement`/`reRankRecommendationsInEngagement` +
`assertEngagementAccess` + Prisma models (User/EngagementMembership/Engagement/Recommendation) +
`db-test-gate`; reference study of the active `p2a-production-path.test.ts`; `git mv` + migration
rewrite; static verify (imports/exports/usage/gate); JSON validation; `[ -d node_modules ]` → NO.

## 13. Pass / fail / deferred status
| Gate | Status |
|---|---|
| Static consistency (imports/exports/usage; gate present) | **PASS** |
| Reactivated test in active vitest lane, DB-gated, not in json quarantine | **PASS** |
| typecheck (tsc) | **N/A for this file** (tsconfig excludes `**/__tests__/**`); whole-project tsc **BLOCKED** locally → PR CI |
| lint | **BLOCKED** locally → PR CI |
| **vitest DB run (migrated test + Wave-1/Wave-2 tests) — active proof** | **DEFERRED to PR CI** (no node_modules, no local DB). Not claimed as locally proven. |
| Prisma / Playwright | **N/A** (schema untouched; no UI) |

Active proof is DEFERRED to the Wave-3 PR's CI (`build-and-test` maintained suite, `TEST_WITH_DB=true`,
real Postgres), per the phase rule not to claim active proof when node_modules/DB are missing.

## 14. Remaining risks
1. Local execution blocked (no node_modules, no DB): the migrated test is statically verified and
   modeled on a proven active DB test, but **proven only in CI**. A CI failure would be a genuine
   finding to triage (setup/fixture drift vs product) — the smallest fix would be pushed and re-watched.
2. 90 tests remain quarantined — mocked recommendation priority/reranking (real-DB rewrite pending),
   recommendation UI, and broader action/diagnosis integration remain unproven.
3. `reRankRecommendationsInEngagement` real-DB proof is deferred: it only reranks rows with persisted
   `scoringMetrics`, which `createRecommendation` does not set — a real-DB rerank proof needs
   direct-insert fixtures (a later wave).
4. Unrelated: production login `500 membership_lookup_failed` on main needs separate owner attention.

## 15. Rollback plan
One commit on `claude/phase-1-wave-3-db-backed-recommendation-proof`: 1 migrated test (git mv +
rewrite) + 3 audit docs. `git revert` (or `git mv` the test back and restore its prior contents)
restores the prior quarantine state. No product/source/schema/CI change → clean, immediate revert.

## 16. Exact next recommended phase
**Phase 1 Wave 4 — real-DB recommendation priority/reranking:** rewrite `recommendation.priority.test.ts`
+ `recommendation.reranking.test.ts` from mocked `db` to the real DB lane (adding persisted
`scoringMetrics` fixtures so `reRankRecommendationsInEngagement` reorders meaningfully), then
`control/recommendation.test.ts`. UI (`recommendations-manager`) and Playwright remain later waves.

## Product logic changed
**No.** Only test reactivation (1 migrated DB-backed test) + audit docs. No product source, schema, CI,
Phase-0, Wave-1, or Wave-2 file changed.
