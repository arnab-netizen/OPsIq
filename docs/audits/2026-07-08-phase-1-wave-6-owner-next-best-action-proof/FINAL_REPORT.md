# Phase 1 Wave 6 — Owner Next-Best-Action / Action-Priority Proof (Final Report)

Reactivate the smallest meaningful owner next-best-action test, proving that the drift→required-action
selector picks the **highest-priority** action deterministically (and derives commitment status
fail-safely), through the current service. No feature build, no engine rewrite, no test deletion, no
assertion weakening.

## 1. Previous PR (Wave 5 #188) merge summary
Wave 5 (real-DB diagnosis→recommendation proof) merged into `main` — merge commit
`c13a0ca34410315d9b5c35a04599b817087a5f42`. The required `CI - Build & Test` maintained suite
(run `28926731864`, `TEST_WITH_DB=true`, real Postgres) completed **success**; the migrated real-DB
`diagnosis.integration.test.ts` (8 blocks) passed. Non-required scenario/browser packs OOM-flaked
(`next build` heap OOM / SIGABRT) — unrelated to the test change; `mergeable_state` was `unstable`
(mergeable), not `blocked`.

## 2. Post-merge main verification (Wave 5)
Confirmed GREEN (structural): main HEAD `c13a0ca3`; merge commit in ancestry; clean tree; all reactivated
tests present (Wave-1 ×4, Wave-2 ×2, Wave-3 ×1, Wave-4 ×1, Wave-5 ×1); quarantine 88. This Wave-6 branch
is cut from `c13a0ca3`.

## 3. Wave-6 branch and HEAD
- Branch: `claude/phase-1-wave-6-owner-next-best-action-proof`
- HEAD before: `main` (`c13a0ca3`). HEAD after commit: see final response.

## 4. Total quarantined tests remaining before Wave 6
**88** (post-Wave-5).

## 5. Owner next-best-action / action-priority tests identified
`execution-drift/next-action.service.test.ts` (`mapDriftToRequiredAction` + `deriveCommitmentStatus`),
`action.integration.test.ts` (action lifecycle), `evidence-action-lifecycle.integration.test.ts`,
`app/api/operator/queue.test.ts` (operator queue API), `action-center.test.tsx` (UI). Full map in
`OWNER_NEXT_BEST_ACTION_QUARANTINE_INVENTORY.md`.

## 6. Tests selected for reactivation and why
**`next-action.service.test.ts`** — `mapDriftToRequiredAction(drift)` is the owner next-best-action
**selector**: it scores every drift condition (overdue critical actions, blockers, health crisis,
execution-certainty, unresolved findings/recommendations, inactivity) and returns the single
highest-priority required action. It proves the Wave-6 dimensions (highest-priority selected
deterministically; higher-risk/cash-critical categories outrank lower ones; no-drift ⇒ no fabricated
action; commitment status derived fail-safely and workspace-scoped). `action.integration.test.ts` is
deferred (action state-machine, its own scope); `recommendation.priority.test.ts` remains deferred from
Wave 4 (broad mock repair pending).

## 7. Tests reactivated
Moved (`git mv`, history preserved) + relative-import path fix forced by the move:
`src/__ignored_tests__/services/execution-drift/next-action.service.test.ts` →
`src/services/execution-drift/__tests__/next-action.service.test.ts` (under a `__tests__` dir: excluded
from the `tsc` gate, included in the vitest `src/**/*.test.ts` lane). The only edit is `./` → `../` on the
two relative imports (`../next-action.service`, `../execution-drift.service`), required because the file
moved one directory deeper. **21 active it-blocks** (11 `mapDriftToRequiredAction`, 9
`deriveCommitmentStatus`, 1 scoring-accuracy). Quarantine **88 → 87**.

## 8. Tests still quarantined and why
**87 remaining.** `action.integration.test.ts` / `evidence-action-lifecycle.integration.test.ts`
(action/evidence lifecycle scopes), `queue.test.ts` (operator API layer), `action-center.test.tsx` (UI),
`recommendation.priority.test.ts` (Wave-4 mock repair pending), and the rest remain quarantined with
documented actions. None deleted, none weakened.

## 9. Defects found
**None in product/source.** The test is current-API; the only change needed was the relative-import path
after the directory move.

## 10. Fixes made
**No product/source fix. No next-action/drift engine change. No assertion weakened.** One mechanical
edit: `./` → `../` on two relative imports (forced by the `git mv` into `__tests__/`).

## 11. Files changed
- Reactivated: `src/services/execution-drift/__tests__/next-action.service.test.ts` (from
  `src/__ignored_tests__/...`).
- Added: `docs/audits/2026-07-08-phase-1-wave-6-owner-next-best-action-proof/{FINAL_REPORT.md,
  OWNER_NEXT_BEST_ACTION_QUARANTINE_INVENTORY.md,EVIDENCE_LEDGER.json}`.
- No product/source/schema/CI files. No Phase-0/Wave-1..5 file touched.

## 12. Commands run
`git checkout -B claude/phase-1-wave-6-owner-next-best-action-proof main`; verify
`DriftDetectionResult`/`mapDriftToRequiredAction`/`deriveCommitmentStatus`/`scoreDriftConditions`
exports + score ordering; `git mv` + import path fix; static verify (imports/exports/usage/score
constants; no remaining `./` imports; not in json quarantine); JSON validation; `[ -d node_modules ]` → NO.

## 13. Pass / fail / deferred status
| Gate | Status |
|---|---|
| Static consistency (imports/exports/usage; score-ordering constants) | **PASS** |
| Reactivated test in active vitest lane, not in json quarantine | **PASS** |
| typecheck (tsc) | **N/A for this file** (tsconfig excludes `**/__tests__/**`); whole-project tsc **BLOCKED** locally → PR CI |
| lint | **BLOCKED** locally → PR CI |
| **vitest run (next-action priority + commitment) — active proof** | **DEFERRED to PR CI** (no node_modules locally). Not claimed as locally proven. |
| DB lane | **N/A** (`mapDriftToRequiredAction` pure; `deriveCommitmentStatus` mocked — SERVICE_LOGIC_ONLY) |

## 14. Remaining risks
1. Local execution blocked (no node_modules): proven only in CI. Residual runtime risk is minimal — the
   priority-mapping is pure deterministic logic and every asserted score/type/urgency matches the source's
   `scoreDriftConditions`; the commitment block mocks `db.action.findFirst`.
2. `deriveCommitmentStatus` is proven at **service-logic** level only (mocked DB) — NOT real-DB proof.
   Real-DB action persistence remains for a later wave.
3. 87 tests remain quarantined overall.

## 15. Rollback plan
One commit: 1 reactivated test (git mv + import path fix) + 3 audit docs. `git revert` (or `git mv` the
test back and restore the `./` imports) restores the prior quarantine state. No product/source/schema/CI
change → clean, immediate.

## 16. Exact next recommended phase
**Phase 1 Wave 7 — diagnostic uncertainty / fail-closed proof** (per the owner loop): insufficient/
contradictory evidence, low-confidence, no fake certainty, blocked recommendations; prefer pure
unit/service tests.

## Product logic changed
**No.** Only test reactivation (1 owner next-best-action test) + one relative-import path fix + audit docs.
No product source, schema, CI, or prior-wave file changed. `mapDriftToRequiredAction` assertions are pure
deterministic proof; `deriveCommitmentStatus` is labelled SERVICE_LOGIC_ONLY (mocked DB, not DB proof).
