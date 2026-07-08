# Phase 1 Wave 7 — Diagnostic Uncertainty / Fail-Closed Proof (Final Report)

Reactivate the smallest meaningful diagnostic fail-closed test, proving that the recommendation control
gate **blocks** (never fabricates certainty) when evidence is insufficient or low-confidence, through the
current service. No feature build, no engine rewrite, no test deletion, no assertion weakening.

## 1. Previous PR (Wave 6 #189) merge summary
Wave 6 (owner next-best-action / action-priority proof) merged into `main` — merge commit
`d1dabac08d15aac231afc2cd81364498da83bc4f`. The required `CI - Build & Test` run (`28931745697`,
`TEST_WITH_DB=true`) completed **success**, including step 15 "Run maintained test suite" — the reactivated
`next-action.service.test.ts` (21 blocks) ran and passed. Wave 6 needed one in-PR fix (`eb56efd8`): the test's
full `vi.mock("@/lib/db")` had omitted `getDbInstance`, which the DB-lane setup imports; adding it (repo
convention) fixed a suite-load failure. Non-required scenario/browser packs OOM-flaked (`next build` heap
OOM) — unrelated; `mergeable_state` was `unstable` (mergeable), not `blocked`.

## 2. Post-merge main verification (Wave 6)
Confirmed GREEN (structural): main HEAD `d1dabac0`; merge commit in ancestry; clean tree; all reactivated
tests present (Wave-1 ×4, Wave-2 ×2, Wave-3 ×1, Wave-4 ×1, Wave-5 ×1, Wave-6 ×1); quarantine 87. This
Wave-7 branch is cut from `d1dabac0`.

## 3. Wave-7 branch and HEAD
- Branch: `claude/phase-1-wave-7-diagnostic-fail-closed-proof`
- HEAD before: `main` (`d1dabac0`). HEAD after commit: see final response.

## 4. Total quarantined tests remaining before Wave 7
**87** (post-Wave-6).

## 5. Diagnostic uncertainty / fail-closed tests identified
`control/__tests__/recommendation.test.ts` (`isDataSufficient` data-sufficiency gate),
`control/__tests__/decision-gate.test.ts`, `contradiction-detector/__tests__/detector.test.ts`,
`decision-control/decision-control.service.test.ts`, scenario `f7-contradictory-kpi.test.ts`. Full map in
`DIAGNOSTIC_FAIL_CLOSED_QUARANTINE_INVENTORY.md`.

## 6. Tests selected for reactivation and why
**`control/__tests__/recommendation.test.ts`** — `isDataSufficient(patterns, variables)` is the control
gate that decides whether there is enough evidence to emit a recommendation; it is the canonical
fail-closed surface. It proves the Wave-7 dimensions: insufficient patterns (`< 3`) → `blocked`
(`INSUFFICIENT_PATTERNS`); any low-confidence variable (`< 0.6`) → `blocked` (`LOW_CONFIDENCE_VARIABLES`,
offending names surfaced); only sufficient evidence → `approved`. Plus helper contracts (`hasPatterns`,
`getPatternsByProblemType` sort, `hasHighSuccessRatePatterns` >60%). It is a **pure unit test** (no DB, no
mocks) — the strongest, most deterministic proof, and per the Wave-7 preference for pure unit/service.
`decision-gate` / `contradiction-detector` / scenario suites are deferred to their own scopes (not all at
once).

## 7. Tests reactivated
Moved (`git mv`, history preserved), **no import change**:
`src/__ignored_tests__/services/control/__tests__/recommendation.test.ts` →
`src/services/control/__tests__/recommendation.test.ts` (under a `__tests__` dir: excluded from the `tsc`
gate, included in the vitest `src/**/*.test.ts` lane). Because the file moved between two equal-depth
`.../control/__tests__/` directories, the `../recommendation` import still resolves — **zero edits to the
test body**. **22 active it-blocks.** Quarantine **87 → 86**.

## 8. Tests still quarantined and why
**86 remaining.** `decision-gate.test.ts`, `contradiction-detector/detector.test.ts`,
`decision-control.service.test.ts`, `f7-contradictory-kpi.test.ts`, blocked-path API tests, and the rest
remain quarantined with documented actions. None deleted, none weakened.

## 9. Defects found
**None in product/source. None in the test.** The test is current-API and required no edits (not even an
import fix). The `DetectedPattern` fixtures omit some interface fields, but that is **type-only** — verified
the four functions never read them at runtime (tsc excludes `__tests__`, vitest is transpile-only).

## 10. Fixes made
**No product/source fix. No control-gate change. No import change. No fixture repair. No assertion
weakened.** The change is a pure `git mv` reactivation + 3 audit docs.

## 11. Files changed
- Reactivated: `src/services/control/__tests__/recommendation.test.ts` (from `src/__ignored_tests__/...`).
- Added: `docs/audits/2026-07-08-phase-1-wave-7-diagnostic-fail-closed-proof/{FINAL_REPORT.md,
  DIAGNOSTIC_FAIL_CLOSED_QUARANTINE_INVENTORY.md,EVIDENCE_LEDGER.json}`.
- No product/source/schema/CI files. No Phase-0/Wave-1..6 file touched.

## 12. Commands run
`git checkout -B claude/phase-1-wave-7-diagnostic-fail-closed-proof main`; verify
`isDataSufficient`/`hasPatterns`/`getPatternsByProblemType`/`hasHighSuccessRatePatterns` exports +
`MIN_PATTERNS_REQUIRED=3`/`MIN_CONFIDENCE_REQUIRED=0.6`; confirm the four functions do not read the omitted
`DetectedPattern` fields; `mkdir -p` target + `git mv` (no import change); static verify (imports/exports/
usage; no `@/lib/db` mock; not in json quarantine); JSON validation; `[ -d node_modules ]` → NO.

## 13. Pass / fail / deferred status
| Gate | Status |
|---|---|
| Static consistency (imports/exports/usage; thresholds; source resolves) | **PASS** |
| Reactivated test in active vitest lane, not in json quarantine | **PASS** |
| typecheck (tsc) | **N/A for this file** (tsconfig excludes `**/__tests__/**`); whole-project tsc **BLOCKED** locally → PR CI |
| lint | **BLOCKED** locally → PR CI |
| **vitest run (data-sufficiency fail-closed) — active proof** | **DEFERRED to PR CI** (no node_modules locally). Not claimed as locally proven. |
| DB lane | **N/A** (pure unit; no DB, no mocks) |

## 14. Remaining risks
1. Local execution blocked (no node_modules): proven only in CI. Residual risk is minimal — the four
   functions are pure and every asserted status/reason/threshold matches the source; the fixtures are
   runtime-sufficient (verified the omitted `DetectedPattern` fields are never read).
2. 86 tests remain quarantined overall.

## 15. Rollback plan
One commit: 1 reactivated test (git mv) + 3 audit docs. `git revert` (or `git mv` the test back) restores
the prior quarantine state. No product/source/schema/CI change → clean, immediate.

## 16. Exact next recommended phase
**Phase 1 Wave 8 — owner-journey E2E proof PLAN (NOT full Playwright)**: an owner-journey coverage matrix +
minimal seams only. Per the owner loop, **STOP after Wave 8** (PR opened + green + merged + main verified);
do not start full Playwright without a new owner instruction.

## Product logic changed
**No.** Only test reactivation (1 pure-unit fail-closed control-gate test) + audit docs. No product source,
schema, CI, or prior-wave file changed. All four functions are pure — genuine deterministic fail-closed
proof (no mocked-DB counted as proof).
