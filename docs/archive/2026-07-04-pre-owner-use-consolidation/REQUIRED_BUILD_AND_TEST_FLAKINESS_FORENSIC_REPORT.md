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

## 9. Minimal fix (APPLIED)
Kept the user-approved Option C (workflow without the redundant `test` job) and **updated `ci-cd-foundations.test.ts` to assert the NEW intended structure**: dropped the `test`-job assertions, added one positive assertion that the redundant `test` job is absent, changed `branch-protection`/`deploy-staging` expectations to `needs: [verify]`, and dropped the `Tests`/`needs.test.result` summary assertions. The test still validates the workflow comprehensively (metadata, concurrency, the `verify` job's 6 steps, `branch-protection`, `deploy-staging`, best-practices, YAML validity) — 49 assertions. This is **not** weakening-to-game: it syncs a contract test to an intentional, approved change in the artifact it validates; no test is skipped/quarantined/deleted-wholesale, and the removed assertions describe a job that no longer exists by design.

## 10. Files changed
- `src/__tests__/workflows/ci-cd-foundations.test.ts` — contract test synced to the new workflow (test-only).
- `.github/workflows/ci-cd-foundations.yml` — redundant `test` job removed (committed earlier this slice).

## 11. Why tests were not weakened
The contract test would still assert the full intended workflow structure; only assertions about a deliberately-removed job are dropped. No DB test, no product test, no assertion strength on retained jobs is changed.

## 12. Repeated-green evidence
- Local (no DB needed for this test): `ci-cd-foundations.test.ts` → **49 passed / 0 failed, 3/3 identical runs** (was 18 failed / 42 passed, also deterministic).
- `tsc --noEmit`: **0 errors**.
- Authoritative DB-lane proof (CONFIRMED): on PR #35 head `817be22`, **both** required `ci.yml` `build-and-test (20.x)` lanes ran the full suite (with postgres:16) and passed:
  - run `28098539803`, job `83194076486` → **success** (PR/merge-ref lane)
  - run `28098536773`, job `83194065833` → **success** (push lane)
  - Companion `ci-cd-foundations` workflow on the same head: `Build + Type + Prisma Verify` job `83194076547` → **success**; `Enforce Branch Protection` job `83194641423` → **success**.
  - All 14 check-runs on `817be22` completed green or expected-skip (no failures, none pending).

## 13. Remaining risks
- If branch protection considers the duplicate push-triggered `build-and-test` run, ensure both go green.
- The original `ci-cd-foundations "Run Tests"` red (DB tests without a DB) is what this slice set out to fix; Option C resolves it by removing the redundant job — but it requires the contract-test update above to land cleanly.

## 14. Merge recommendation for PR #35
**CLEARED TO MERGE.** Final classification: **`REQUIRED_LANE_STABILIZED`**. The contract-test sync landed on `817be22`; both required `build-and-test (20.x)` lanes are green (run IDs in §12), the companion `ci-cd-foundations` verify/branch-protection gates are green, and GitHub reports `mergeable_state: clean`. Merging PR #35 makes `main` fully green.

## 15. Final classification
**`REQUIRED_LANE_STABILIZED`** — the required `build-and-test` lane is deterministically green on the PR head; the failure was a workflow/contract-test desynchronization (now synced), not a flake, not a product/DB defect. No retries, skips, quarantines, or suppressions were added.
