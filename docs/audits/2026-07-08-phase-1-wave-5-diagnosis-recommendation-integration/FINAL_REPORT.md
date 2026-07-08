# Phase 1 Wave 5 — Diagnosis→Recommendation Integration Proof (Final Report)

Reactivate the smallest meaningful diagnosis-to-recommendation integration test, proving that a
diagnostic input produces persisted, structured recommendations (and findings) through the current
service against a real database. No feature build, no diagnosis-engine rewrite, no test deletion, no
assertion weakening.

> Status note: this Wave-5 branch/PR is prepared while Wave-4 (service-ranking) CI runs. Per the owner
> no-idle loop, the Wave-5 PR is **held until Wave 4 is green + merged and main is verified GREEN**,
> then the branch is rebased onto the post-Wave-4 main and the draft PR opened.

## 1. Previous PR (Wave 4) merge summary
Recorded in the final response / Wave-5 PR body once Wave 4 is merged (Wave 4 = mocked service-ranking
reranking proof, SERVICE_LOGIC_ONLY).

## 2. Post-merge main verification (Wave 4)
Confirmed GREEN before this wave's PR opens (recorded in the final response once merged).

## 3. Wave-5 branch and HEAD
- Branch: `claude/phase-1-wave-5-diagnosis-recommendation-integration`
- HEAD before: `origin/main` (post-Wave-3, later rebased onto post-Wave-4). HEAD after commit: see final response.

## 4. Total quarantined tests remaining before Wave 5
**90** (post-Wave-3; Wave 4 does not change the count until it merges).

## 5. Diagnosis→recommendation tests identified
`diagnosis.integration.test.ts` (real-DB via `diagnoseBusiness`), `findings.integration.test.ts`
(findings CRUD), `action.integration.test.ts` (recommendation→action, Wave-6 scope), scenario suites
`f1–f10` (broad), `f3-wrong-diagnosis` (outcome tracking). Full map in the inventory.

## 6. Tests selected for reactivation and why
**`diagnosis.integration.test.ts`** — `diagnoseBusiness` is the diagnosis entry point that validates
input, orchestrates the engines, and **persists** client/engagement/findings/recommendations, returning
a `DiagnosisResult` whose `recommendations[]` is exactly the diagnosis→recommendation output. It proves
the required Wave-5 dimensions (diagnostic input → expected structured recommendations; findings/reasoning
surface; sparse input does not fabricate high confidence; workspace scoping) and keeps the pure
`validateBusinessProblem` fail-closed checks. The broad scenario suites (f1–f10) are intentionally NOT
reactivated all at once; `findings`/`action` integration are deferred to their own scopes.

## 7. Tests reactivated
Moved (`git mv`, history preserved) + **migrated to the current API**:
`src/__ignored_tests__/services/diagnosis.integration.test.ts` →
`src/services/__tests__/diagnosis.integration.test.ts` (under a `__tests__` dir: excluded from the `tsc`
gate, included in the vitest `src/**/*.test.ts` lane). Why a migration: the original called
`diagnoseBusiness(input, "test-actor")` (old 2-arg signature); the current service is
`diagnoseBusiness(input, authContext, workspaceId)` and persists to the DB. The migration seeds a
workspace + user, builds a `CanonicalAuthContext`, calls the current signature against the real DB
(gated `describe.skipIf(!SHOULD_RUN_DB_TESTS)`), and asserts on the returned `DiagnosisResult` +
persisted rows. 8 it-blocks (4 pure `validateBusinessProblem`, 4 DB-backed `diagnoseBusiness`).
Quarantine **90 → 89**.

## 8. Tests still quarantined and why
**89 remaining.** `findings.integration.test.ts` (findings CRUD) and `action.integration.test.ts`
(recommendation→action) deferred to their scopes; scenario suites f1–f10 deferred (broad — not all at
once); `findings-manager.test.tsx` (UI). None deleted, none weakened.

## 9. Defects found
**None in product/source.** The only issue was **API drift** (old `diagnoseBusiness` signature) in the
quarantined test, addressed by migrating to the current API — not a product defect.

## 10. Fixes made
**No product/source fix. No diagnosis-engine change. No assertion weakened.** The change is the migration
of one test to the current DB-backed API (documented in §7 and the EVIDENCE_LEDGER).

## 11. Files changed
- Reactivated + migrated: `src/services/__tests__/diagnosis.integration.test.ts` (from `src/__ignored_tests__/...`).
- Added: `docs/audits/2026-07-08-phase-1-wave-5-diagnosis-recommendation-integration/{FINAL_REPORT.md,
  DIAGNOSIS_RECOMMENDATION_QUARANTINE_INVENTORY.md,EVIDENCE_LEDGER.json}`.
- No product/source/schema/CI files. No Phase-0/Wave-1..4 file touched.

## 12. Commands run
`git checkout -B claude/phase-1-wave-5-diagnosis-recommendation-integration origin/main`; inventory;
read `diagnoseBusiness`/`validateBusinessProblem`/`DiagnosisResult`/`BusinessProblemInput`/
`determinePrimaryCategory`/`calculateSeverity`; `git mv` + migration rewrite; static verify
(imports/exports/usage/constants); JSON validation; `[ -d node_modules ]` → NO.

## 13. Pass / fail / deferred status
| Gate | Status |
|---|---|
| Static consistency (imports/exports/usage; category/severity constants) | **PASS** |
| Reactivated test in active vitest lane, DB-gated, not in json quarantine | **PASS** |
| typecheck (tsc) | **N/A for this file** (tsconfig excludes `**/__tests__/**`); whole-project tsc **BLOCKED** locally → PR CI |
| lint | **BLOCKED** locally → PR CI |
| **vitest DB run (diagnosis→recommendation) — active proof** | **DEFERRED to PR CI** (no node_modules/DB locally). Not claimed as locally proven. |

## 14. Remaining risks
1. Local execution blocked: proven only in CI. Residual runtime risk is in the diagnosis-engine
   behavioural assumptions (a valid problem yields ≥1 recommendation; sparse input yields
   `confidence != high` + `dataWarnings`). If a behavioural assertion mismatches the current engine in
   CI, the fix is a minimal assertion/fixture adjustment to the engine's real output — without weakening
   the core diagnosis→recommendation proof.
2. 89 tests remain quarantined (findings/action integration, scenario suites, UI).
3. Unrelated: production login `500 membership_lookup_failed` on main needs separate owner attention.

## 15. Rollback plan
One commit: 1 migrated test (git mv + rewrite) + 3 audit docs. `git revert` (or `git mv` the test back
and restore prior contents) restores the prior quarantine state. No product/source/schema/CI change →
clean, immediate.

## 16. Exact next recommended phase
**Phase 1 Wave 6 — owner next-best-action / action-priority proof** (per the owner loop):
`action.integration.test.ts` / operator action-priority tests.

## Product logic changed
**No.** Only test reactivation (1 migrated diagnosis→recommendation DB test) + audit docs. No product
source, schema, CI, or prior-wave file changed.
