# Phase 1 Wave 4 — Service Ranking Proof (Final Report) — SERVICE_LOGIC_ONLY

Reactivate the mocked service-logic reranking test deferred from Wave 3, proving service-layer
ranking/reranking logic **at the DB boundary with persistence mocked**. This is **NOT real-DB proof**
(real-DB recommendation persistence is proven by Wave 3's `recommendation.integration.test.ts`).

> Status note: this Wave-4 branch/PR is prepared while Wave-3 (PR #185) CI is finishing. Per the owner
> no-idle loop, the Wave-4 PR is **held until Wave 3 is green + merged and main is verified GREEN**, then
> the branch is rebased onto the post-Wave-3 main and the draft PR opened.

## 1. Previous PR (Wave 3) merge summary
See the Wave-4 PR body / final response for the confirmed Wave-3 (#185) merge commit and main
verification (Wave 3 = real-DB recommendation proof: `createRecommendation` + `getRecommendationsForEngagement`).

## 2. Post-merge main verification (Wave 3)
Confirmed GREEN before this wave starts (recorded in the final response and EVIDENCE_LEDGER once merged).

## 3. Wave-4 branch and HEAD
- Branch: `claude/phase-1-wave-4-service-ranking-proof`
- HEAD before: `origin/main` (post-Wave-3). HEAD after commit: see final response.

## 4. Total quarantined tests remaining before Wave 4
**90** (post-Wave-3).

## 5. Service-ranking tests identified
`recommendation.reranking.test.ts` (mocked, current API) and `recommendation.priority.test.ts` (mocked,
partially stale). Full map in `SERVICE_RANKING_QUARANTINE_INVENTORY.md`.

## 6. Tests selected for reactivation and why
**`recommendation.reranking.test.ts`** — the clean SERVICE_LOGIC candidate. `reRankRecommendationsInEngagement`
is self-contained (`requireServiceContext` → `db.recommendation.findMany` → per-rec pure
`calculateRecommendationScore`→`mapScoreToPriority` → on change `db.recommendation.update` + `emitAuditEvent`),
and the test mocks exactly those db calls + audit, so it exercises the real reranking/priority-mapping logic
with persistence mocked. `recommendation.priority.test.ts` is **deferred** — its `createRecommendation` blocks
are stale against the heavily-evolved service (new auth-context shape + unmocked `EventEmitterService.emit`,
`recordRecommendationUsage`, evidence/KPI evaluation); reliable reactivation needs broad mock repair (a
follow-up wave). Its score→priority mapping is exercised transitively by the reranking test.

## 7. Tests reactivated
Moved (`git mv`, history preserved) + one fixture fix:
`src/__ignored_tests__/services/__tests__/recommendation.reranking.test.ts` →
`src/services/__tests__/recommendation.reranking.test.ts` (under a `__tests__` dir: excluded from the `tsc`
gate, included in the vitest `src/**/*.test.ts` lane). 9 active it-blocks covering: empty-engagement no-op,
skip-without-scoring-metrics, score-driven change to high/medium/low, no-op-when-priority-matches,
multiple-mixed-results, `recommendation.updated` audit payload, version increment. Quarantine **90 → 89**.

## 8. Tests still quarantined and why
**89 remaining.** `recommendation.priority.test.ts` deferred (see §6). `control/recommendation.test.ts`
(pure-unit control gate, not ranking/reranking) and the rest remain quarantined with documented actions.
None deleted, none weakened.

## 9. Defects found
**None in product/source.** The only issue was **fixture staleness** (auth-context shape) in the
reactivated test — corrected without changing any assertion.

## 10. Fixes made
**No product/source fix.** One fixture fix: `mockAuthContext` migrated from the pre-refactor
`{session, policy}` shape to the `CanonicalAuthContext`-style `{verifiedActorId,…}` shape that
`requireServiceContext` reads. No assertion weakened.

## 11. Files changed
- Reactivated: `src/services/__tests__/recommendation.reranking.test.ts` (from `src/__ignored_tests__/...`).
- Added: `docs/audits/2026-07-08-phase-1-wave-4-service-ranking-proof/{FINAL_REPORT.md,
  SERVICE_RANKING_QUARANTINE_INVENTORY.md,EVIDENCE_LEDGER.json}`.
- No product/source/schema/CI files. No Phase-0/Wave-1/Wave-2/Wave-3 file touched.

## 12. Commands run
`git checkout -B claude/phase-1-wave-4-service-ranking-proof origin/main`; read
`reRankRecommendationsInEngagement`/`createRecommendation`/`requireServiceAuth`/`AUDIT_EVENTS`; `git mv` +
fixture fix; static verify (imports/exports/usage/constants); JSON validation; `[ -d node_modules ]` → NO.

## 13. Pass / fail / deferred status
| Gate | Status |
|---|---|
| Static consistency (imports/exports/usage; audit constant; version-bump) | **PASS** |
| Reactivated test in active vitest lane, not in json quarantine | **PASS** |
| typecheck (tsc) | **N/A for this file** (tsconfig excludes `**/__tests__/**`); whole-project tsc **BLOCKED** locally → PR CI |
| lint | **BLOCKED** locally → PR CI |
| **vitest run (reranking service-logic test) — active proof** | **DEFERRED to PR CI** (no node_modules locally). Not claimed as locally proven. |
| DB lane | **N/A** (mocked; SERVICE_LOGIC_ONLY) |

## 14. Remaining risks
1. Local execution blocked (no node_modules): proven only in CI. Residual runtime risk is the score-bucket
   assertions (metric fixtures must land in the expected high/medium/low buckets under
   `calculateRecommendationScore`) — if a boundary fails in CI, the fix is a minimal fixture-metric tweak.
2. `recommendation.priority.test.ts` remains quarantined (mock repair pending).
3. 89 tests remain quarantined overall.

## 15. Rollback plan
One commit: 1 reactivated test (git mv + fixture fix) + 3 audit docs. `git revert` (or `git mv` the test
back and restore the old `mockAuthContext`) restores the prior quarantine state. No product/source/schema/CI
change → clean, immediate.

## 16. Exact next recommended phase
**Phase 1 Wave 5 — diagnosis/recommendation integration proof** (per the owner loop). A focused mock-repair
of `recommendation.priority.test.ts` can be folded into a later service-logic wave.

## Product logic changed
**No.** Only test reactivation (1 mocked service-logic test) + one auth-context fixture fix + audit docs.
No product source, schema, CI, or prior-wave file changed. Labelled SERVICE_LOGIC_ONLY — not DB proof.
