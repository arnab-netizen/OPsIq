# Phase 1 — Diagnostic-Core Reactivation (Final Report)

Reactivate the smallest meaningful diagnostic-core test subset from quarantine so diagnostic
correctness becomes actively proven instead of hidden. No feature build, no rewrite, no test deletion,
no assertion weakening.

## 1. Part A — post-merge main verification (summary)
- **Main HEAD:** `49649a6e430274adda4bb1c0040a346066348747` — the Phase-0 merge commit (PR #182); verified as tip of `origin/main` and in ancestry. (Local `main` was a stale divergent ref `fa1e0576`; realigned to `origin/main`, no code changed.)
- **Required code gates on main = GREEN:** lint, TypeScript type-checking, Prisma validate/migrate/generate, Build (no OOM), governance + auth-route scans, wrapped-handlers ratchet, MVP Readiness Gate, B12-S3 DB Verification, CI/CD Foundations. The `pull_request`-only workflows (browser packs, DB-backed lanes, Security Baseline, owner-pilot-e2e/db, branch-protection) passed on PR #182 and do not re-trigger on the main push.
- **Maintained vitest suite on main:** still running/unverified at hand-off (slow serial runner; byte-identical code+tests already passed green on PR #182; no failure observed).
- **One non-required failure:** `Smoke - Production Dashboard` — production `POST /api/auth/login` returned `500 membership_lookup_failed` (Vercel had deployed the commit). **Classification: pre-existing / production-environment issue, NOT a Phase-0 regression** (Phase-0 touched no auth/login/membership code) and **not a required code gate**. Flagged for separate owner attention.
- **Proceed decision:** the user authorized proceeding ("Proceed") on the strength of the green required gates + the PR-proven identical maintained suite.

## 2. Phase-1 branch and HEAD
- Branch: `claude/phase-1-diagnostic-core-reactivation`
- HEAD before: `49649a6e` (base = verified main). HEAD after commit: see final response.

## 3. Total quarantined tests counted
**97** test files under `src/__ignored_tests__/` (vitest excludes `**/__ignored_tests__/**`).

## 4. Diagnostic-core tests identified
Four pure-unit inference-engine tests with 1:1 source ownership in `src/services/diagnostic-core/`:
`root-cause-engine.test.ts`, `archetype-engine.test.ts`, `bottleneck-engine.test.ts`, `maturity-engine.test.ts`. (Related recommendation-ranking/diagnosis-integration tests also exist in quarantine — deferred to later waves, see QUARANTINE_INVENTORY.md §B.)

## 5. Tests selected for reactivation and why
All **4 diagnostic-core engine tests**. Selection rationale:
- Smallest subset with real diagnostic value: covers **root-cause inference** (hypothesis competition, evidence-vs-confidence), **archetype classification**, **bottleneck detection**, **maturity assessment**, plus **uncertainty/failure handling** (each has fail-closed data-sufficiency-gate tests) and **evidence use** (scoring).
- Clear 1:1 source ownership; **pure-unit** (only `uuid` + the engine — no DB, no Prisma, no route/component harness), so they run in the default vitest lane and in CI without extra setup.
- **Statically verifiable** against current source (critical, since local execution is blocked — see §12): all imports resolve, method signatures match, and every asserted result field is produced by the source.

Why others remain quarantined: recommendation-ranking, diagnosis/recommendation integration, consulting-engine/best-path/contradiction/calibration tests have broader dependencies (DB, engagement fixtures, or route/component harnesses) that need per-file refresh and cannot be statically proven to pass without execution. Reactivating them now would risk red CI without local verification. They are the next waves.

## 6. Tests reactivated
Moved (`git mv`, history preserved) from `src/__ignored_tests__/services/diagnostic-core/__tests__/` to `src/services/diagnostic-core/__tests__/`:
- `root-cause-engine.test.ts`, `archetype-engine.test.ts`, `bottleneck-engine.test.ts`, `maturity-engine.test.ts`

The relocation fixes the broken `../<engine>` relative import (the source was never moved into quarantine, so the import was dangling there) and places each test in vitest's active `src/**/*.test.ts` include. No CI config change needed.

## 7. Tests still quarantined and why
**93 remaining** — full map in QUARANTINE_INVENTORY.md. Kept quarantined to keep this phase minimal and lowest-risk; each has a documented domain and proposed future action. None deleted, none weakened.

## 8. Defects found
**None** exposed by static analysis. The engine sources are byte-identical to the co-authored tests and unchanged since authoring; the only breakage was the relative-import path from the earlier bulk quarantine move, corrected by re-homing the tests.

## 9. Fixes made
**No source fix required.** No assertion changed. The change is purely the 4 test relocations (reactivation) + these audit docs.

## 10. Files changed
- Reactivated (renamed): `src/services/diagnostic-core/__tests__/{root-cause,archetype,bottleneck,maturity}-engine.test.ts` (from `src/__ignored_tests__/...`).
- Added: `docs/audits/2026-07-07-phase-1-diagnostic-core-reactivation/{FINAL_REPORT.md,QUARANTINE_INVENTORY.md,EVIDENCE_LEDGER.json}`.
- No product/source/schema/CI files modified. Phase-0 files untouched.

## 11. Commands run
`git checkout -B claude/phase-1-diagnostic-core-reactivation origin/main`; quarantine inventory (`find`/`grep`); static cross-check of each engine test's imports + method + asserted-field-vs-source; `git mv` ×4; `vitest.config` include/exclude confirmation; `[ -d node_modules ]` → NO.

## 12. Pass / fail / deferred status
| Gate | Status |
|---|---|
| Static consistency (imports/API/fields) of 4 reactivated tests | **PASS** |
| Reactivated tests included in active vitest lane | **PASS** (not under `__ignored_tests__`; matches `src/**/*.test.ts`) |
| typecheck (tsc) | **BLOCKED** (no node_modules; install forbidden) → CI |
| lint | **BLOCKED** → CI |
| **vitest run (reactivated diagnostic-core tests) — active proof** | **DEFERRED to PR CI** (no node_modules locally). Not claimed as locally proven. |
| DB tests / Prisma / Playwright | **N/A** (pure-unit; no DB/schema/UI touched) |

**Active proof is DEFERRED to the draft PR's CI** (`build-and-test` maintained suite), per the phase rule not to claim active proof when node_modules is missing.

## 13. Remaining risks
1. Local execution was blocked (no node_modules), so the reactivated tests' green is **verified statically, proven in CI** — if CI surfaces a failure it is a genuine finding to triage (stale test vs product defect) per the phase rules.
2. 93 tests remain quarantined (incl. recommendation-ranking and diagnosis integration) — diagnostic *ranking* and end-to-end diagnosis remain unproven until later waves.
3. Unrelated to this phase: the production login `500 membership_lookup_failed` on main needs separate owner attention.
4. The CI maintained suite is slow on some runners (~24–50 min); no change made to it here.

## 14. Rollback plan
One commit on `claude/phase-1-diagnostic-core-reactivation`: 4 test-file renames + 3 docs. `git revert` the commit (or `git mv` the tests back) restores the prior quarantine state. No source/product/schema/CI change → clean, immediate revert.

## 15. Exact next recommended phase
**Phase 1 wave 2 — recommendation-ranking reactivation:** reactivate the recommendation priority/reranking tests (§B of the inventory) with a live test run to prove ranking correctness, fixing real defects if exposed. Then diagnosis/recommendation integration. (Playwright signup/member-invite E2E and live-LLM smoke remain later, separate phases.)

## Product logic changed
**No.** Only test reactivation (4 file moves) + audit docs. No source, schema, CI, or Phase-0 file changed.
