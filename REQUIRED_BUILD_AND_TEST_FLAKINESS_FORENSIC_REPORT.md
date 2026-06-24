# REQUIRED build-and-test Lane — Forensic Report

Date: 2026-06-24
Branch: `claude/opsiq-owner-mode-decision-os-3tgwkm`
Investigator scope: read-only forensic pinning of the `build-and-test (20.x)` failures, then minimal fix.

## 1. Executive verdict
The required `ci.yml` `build-and-test (20.x)` failures are **NOT flaky** and **NOT event-sourcing/concurrency races**. They are a **deterministic, self-inflicted regression**: my edits to `.github/workflows/ci-cd-foundations.yml` (this slice) broke its **companion contract test** `src/__tests__/workflows/ci-cd-foundations.test.ts`, which asserts the exact structure of that workflow file. `build-and-test` runs the full suite (including that contract test), so it went red. The prior "flaky required lane" conclusion was **wrong** — it was based on PostgreSQL server-log noise (expected, tolerated errors) and a false "identical code" premise.

**Classification: `TEST_ISOLATION_FIX_REQUIRED`** — specifically a workflow/contract-test sync issue (a deterministic test that must be kept in step with the workflow it validates). No genuine flake, no real product bug, no DB-test defect.

## 2. Affected workflow / job / step
- Workflow `ci.yml`, job `build-and-test (20.x)`, step **"Run maintained test suite (blocking; quarantine excluded)"** (`npx vitest run --maxWorkers 1 <quarantine excludes>`, `TEST_WITH_DB=true`, postgres:16).
- The failing test file is `src/__tests__/workflows/ci-cd-foundations.test.ts` (a pure file-reading test; needs no DB).

## 3. Failed run IDs and commits
| run_id | commit | job | conclusion | note |
|---|---|---|---|---|
| (PR #33) | `18a7a23` | build-and-test ×2 | success | original `ci-cd-foundations.yml` → contract test passes |
| 28078002484 / 28078000555 | `0445a77` | build-and-test | failure | Option A edited the workflow → contract test fails |
| 28091412294 / 28091414104 | `4bb6c85` | build-and-test ×2 | failure | Option C removed the `test` job → contract test fails |

The "identical code" premise was false: `ci-cd-foundations.yml` changed between `18a7a23` and `0445a77`/`4bb6c85`, and `ci-cd-foundations.test.ts` validates that exact file.

## 4. Exact failing test files and test names
**File:** `src/__tests__/workflows/ci-cd-foundations.test.ts` — **18 failed / 42 passed (60)**. Failing tests (all assert the now-removed `test` job or `[verify, test]` deps):
- Jobs structure › should define all required jobs (expects `jobs.test`)
- Test job › name / runs-on / timeout / env / checkout / setup Node / install / "run tests without continue-on-error" (`npm test`) / "add test summary"
- Branch protection job › should depend on verify and test (`needs: [verify, test]`)
- Branch protection job › should report workflow status (expects `Tests` row)
- Deploy-staging job › should depend on verify and test
- Gate enforcement › verify job must complete before test job runs
- CI/CD gates verification › test job runs: npm ci, npm test
- CI/CD gates verification › branch-protection reports to GitHub summary (`needs.test.result`)
- Deployment workflow › deploy-staging only runs after verify and test pass

## 5. Error signatures
`AssertionError: expected undefined to be defined` / `expected undefined to be 'Run Tests'` / `expected undefined to deeply equal [ 'verify', 'test' ]` — i.e. `workflowContent.jobs.test` is now `undefined` because Option C removed the `test` job. First stack frames point to `src/__tests__/workflows/ci-cd-foundations.test.ts:61/142/.../369` (repo test code), NOT to product code.

## 6. Flaky-vs-deterministic classification
**DETERMINISTIC_FAILURE.** Local proof on the branch workflow: 3 consecutive runs → `18 failed | 42 passed` every time (identical). Against the original (main) workflow the same test passes. The PostgreSQL errors seen earlier (`canonical_events` append-only DELETE, `snapshot_data` FK, `storm-idem` duplicate keys, `owner_fin_snapshots` duplicate period) are **expected/tolerated** error-path/cleanup logs from passing event-sourcing tests — red herrings; none correspond to a failed test.

## 7. Root cause
`ci-cd-foundations.test.ts` is a **contract test** pinning the structure of `ci-cd-foundations.yml` (it requires a `test` job named "Run Tests" running `npm test`, and `branch-protection`/`deploy-staging` to `needs: [verify, test]`). This slice intentionally **removed the redundant `test` job** (Option C, user-approved) but **did not update the contract test**. Hence 18 deterministic assertion failures in the required lane. Root cause category: **A. workflow/contract-test desynchronization** (not B intra-test concurrency, not C cross-file leakage, not D date-fixture, not E product bug, not F CI infra).

## 8. Proof it is/ isn't Owner Mode / AI related
**Not related.** The failing test reads a YAML file; it has nothing to do with Owner Mode or governed-AI code. `main` (`5e947ea`, the Owner Mode + AI merge) has the **original** `ci-cd-foundations.yml`, so this contract test **passes on `main`** and `main`'s `build-and-test` is green. The break exists **only** on this slice's branch, caused **only** by this slice's workflow edit.

## 9. Minimal fix (proposed — pending confirmation)
Keep the user-approved Option C (workflow without the redundant `test` job) and **update `ci-cd-foundations.test.ts` to assert the NEW intended structure**: drop the `test`-job assertions, change `branch-protection`/`deploy-staging` expectations to `needs: [verify]`, and drop the `Tests`/`needs.test.result` summary assertions. The test continues to validate the workflow comprehensively (metadata, concurrency, `verify` job's 6 steps, `branch-protection`, `deploy-staging`, best-practices, YAML validity). This is **not** weakening-to-game: it syncs a contract test to an intentional, approved change in the artifact it validates; no test is skipped/quarantined/deleted-wholesale, and the removed assertions describe a job that no longer exists by design.

Alternative (if the contract must keep a test job): revert the workflow to original and instead make the original `Run Tests` job's non-DB `npm test` pass by gating the mislabeled DB suites (`*.service.test.ts` "DB-Backed Tests") — touches `vitest.config.ts` + renames several DB test files; leaves the contract test untouched but is more invasive.

## 10. Files changed
None yet (investigation only). Proposed: `src/__tests__/workflows/ci-cd-foundations.test.ts` (+ the already-committed `ci-cd-foundations.yml`).

## 11. Why tests were not weakened
The contract test would still assert the full intended workflow structure; only assertions about a deliberately-removed job are dropped. No DB test, no product test, no assertion strength on retained jobs is changed.

## 12. Repeated-green evidence
Pending the fix. Plan: contract test 3× locally (no DB needed), `tsc`, then ≥1 green `build-and-test` on the PR head (preferably repeated).

## 13. Remaining risks
- If branch protection considers the duplicate push-triggered `build-and-test` run, ensure both go green.
- The original `ci-cd-foundations "Run Tests"` red (DB tests without a DB) is what this slice set out to fix; Option C resolves it by removing the redundant job — but it requires the contract-test update above to land cleanly.

## 14. Merge recommendation for PR #35
Do **not** merge until the contract test is updated and `build-and-test` is green (repeatedly). With the contract-test sync applied, PR #35 should make both ci-cd-foundations AND build-and-test green, achieving main-fully-green.
