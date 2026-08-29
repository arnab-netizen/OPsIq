# CI Risk Classifier — Cost Matrix and Required-Check Audit

**Status:** Local documentation for `scripts/ci-risk-classifier.mjs`, produced during
the owner correction pass of 2026-08-29 (Issues 8 and 9 of the "FINAL LOCAL
PRE-PUSH HOSTILE AUDIT AND CORRECTION" directive). Not yet pushed.

This is the exact, code-derived cost matrix the classifier enforces, plus the
static hostile-audit finding and fix for the one required-check job
(`branch-protection`) that gates PR merges.

---

## 1. Cost matrix — what runs per PR, by risk tier

Every row below is a real execution path in `ci.yml` / `reusable-pr-validation.yml`
today, traced directly from the workflow YAML, not estimated.

| Risk tier | npm install | Governance scans (strict/auth/a77/ci-governance) | tsc --noEmit | prisma validate | lint job | Broad non-DB Vitest suite | Targeted recovery checks | Full Main-DB integration (on push to main) |
|---|---|---|---|---|---|---|---|---|
| `DOCS_ONLY` (0) | Yes | Yes | Yes | Yes | Yes | **No** | No | **No** |
| `RECOVERY_INFRA_ONLY` (1) | Yes | Yes | Yes | Yes | Yes | **No** | **Yes (targeted)** | No |
| `CI_GOVERNANCE` (2) | Yes | Yes | Yes | Yes | Yes | Yes (once) | No | No |
| `APPLICATION_NON_DB` (3) | Yes | Yes | Yes | Yes | Yes | Yes (once) | No | No |
| `SECURITY_AUTH_TENANCY_ENTITLEMENT` (4) | Yes | Yes | Yes | Yes | Yes | Yes (once) | No | **Yes** |
| `DB_RUNTIME` (5) | Yes | Yes | Yes | Yes | Yes | Yes (once) | No | **Yes** |
| `UNKNOWN` (6) | Yes | Yes | Yes | Yes | Yes | Yes (once) | No | **Yes** |
| `MANUAL_DISPATCH` (workflow_dispatch, not a diff-derived tier) | Yes | Yes | Yes | Yes | n/a (PR-only job) | n/a (PR-only job) | n/a | **Yes (always, unconditionally)** |

Notes on columns that never vary by tier: `npm install`, the four governance/
recurrence scanners, `tsc --noEmit`, `prisma validate`, and the `lint` job all run
unconditionally on every PR today, gated only by `pull_request` triggering at all —
they are cheap (seconds to low tens-of-seconds) relative to the ~28,000-test broad
suite and the full DB integration job, so classifying them is not the cost problem
this classifier exists to solve. The classifier's entire purpose is the last three
columns.

### 1.1 Required counts (Issue 8 exact fields)

| Risk tier | `BROAD_NON_DB_SUITE_COUNT_PER_PR` | `TARGETED_RECOVERY_COUNT_PER_PR` | `FULL_MAIN_DB_SUITE` (on the push that lands it) |
|---|---|---|---|
| `DOCS_ONLY` | 0 | 0 | 0 |
| `RECOVERY_INFRA_ONLY` | **0** | 1 | 0 |
| `CI_GOVERNANCE` | 1 | 0 | 0 |
| `APPLICATION_NON_DB` | 1 | 0 | 0 |
| `SECURITY_AUTH_TENANCY_ENTITLEMENT` | 1 | 0 | 1 |
| `DB_RUNTIME` | 1 | 0 | 1 |
| `UNKNOWN` | 1 | 0 | 1 |

Every tier's `BROAD_NON_DB_SUITE_COUNT_PER_PR` is 0 or 1, never 2 — the exact defect
this classifier was built to close (`ci.yml`'s `build-and-test` and `bundle-validate`
previously both ran the identical ~28,000-test suite on every PR). Enforced by
`ci.yml`'s `bundle-validate` job passing `run_test_suite: false` to
`reusable-pr-validation.yml`, and by `suiteModeForTier()` in
`scripts/ci-risk-classifier.mjs` guaranteeing `RECOVERY_INFRA_ONLY` never receives
`BROAD_NON_DB`. Both guarantees are covered by automated tests:
`src/__tests__/workflows/ci-risk-classifier.test.ts` (`suiteMode per tier` describe
block) and the existing `reusable-pr-validation.yml` `run_test_suite: false` wiring
in `ci.yml`.

`FULL_MAIN_DB_SUITE` is required (1) only for the three tiers whose blast radius can
plausibly touch runtime/database/security behavior
(`SECURITY_AUTH_TENANCY_ENTITLEMENT`, `DB_RUNTIME`, `UNKNOWN`), and is forced to 1
unconditionally for `MANUAL_DISPATCH` regardless of any diff (the disaster-recovery
re-verification path, which must not be second-guessed by the classifier). No tier
runs it more than once per push, since `main-integration.yml`'s `full-suite` job is
gated by a single `classify` job's output.

---

## 2. `branch-protection` required-check audit (Issue 9)

**Hostile-audit finding (fixed 2026-08-29, semantics corrected 2026-08-29):**
`ci.yml`'s `branch-protection` job — the one job every other required PR check
ultimately routes through — had
`needs: [classify, build-and-test, lint, bundle-validate, actionlint]` but a plain
`if: github.event_name == 'pull_request'` condition, with no status-check function
in it.

**Precise mechanism.** GitHub Actions implicitly ANDs a job's `if:` with `success()`
whenever the condition does not itself contain one of `success()`, `always()`,
`cancelled()`, or `failure()` — a custom `if:` does not *replace* that gate, it is
combined with it by default. So the old condition here actually evaluated as
`success() && github.event_name == 'pull_request'`. Concretely: if `build-and-test`
(the job that runs governance scans, `tsc`, `prisma validate`, and the non-DB test
suite) FAILED, this job's effective condition was false, and the job was **skipped**
— it did not run its body at all. The defect is what GitHub does with that skip: a
skipped job/check is reported to the checks API as a non-blocking, passing
conclusion, and GitHub's required-status-checks branch protection treats a skipped
required check as satisfying "required to pass." So the one required PR gate still
reported **green while real CI was red** — via a skip counting as success, not via
this job's body running despite a real failure. The same mechanism applied to a
failure in `lint`, `bundle-validate`, `actionlint`, or the new `classify` job itself.

This is exactly the failure mode named in the owner's directive: "No path-filter
trick that causes GitHub-required checks to disappear," and the more specific
concern that a conditional job could leave the final required check "falsely green
despite classifier failure."

**Fix:** `if: ${{ always() && github.event_name == 'pull_request' }}`, plus an
explicit step that reads every dependency's `${{ needs.<job>.result }}` and
`exit 1`s if any is not literally `"success"` (covering `failure`, `cancelled`, and
`skipped` uniformly — a skipped dependency is exactly as disqualifying as a failed
one). This is the same idiom already used by `main-integration.yml`'s pre-existing
`summary` job, not a new pattern introduced for this fix. `always()` forces the job
to always reach a terminal state (never silently skipped again), and the explicit
result check converts "upstream not success" into an actual job **failure**, which
IS correctly treated as blocking by required-status-checks (unlike a skip).

| Failure mode named by the owner | Before | After |
|---|---|---|
| Required check falsely green despite an upstream failure | **Present** — a failed dependency caused this job to be skipped (implicit `&& success()`), and GitHub reports a skipped required check as passing | Closed — `always()` prevents the skip, and the explicit `.result != "success"` check makes the job actually FAIL (not skip) on any non-success dependency, which required-status-checks correctly blocks on |
| Required check skipped unexpectedly | Present for exactly this scenario (any upstream failure produced a skip here, which is unexpected relative to the intent of a required gate) | Closed structurally — `always()` guarantees the job body always runs whenever the PR event fires, regardless of any dependency's outcome |
| Required check permanently pending | Not applicable to this exact bug (a skip is a terminal state, not a hang) | Also closed by the same `always()` guarantee: the job reaches a terminal pass/fail every time, never left `queued`/`waiting` |

**Regression coverage:** `src/__tests__/ci-cd/ci-trigger-governance.test.ts`, describe
block `"ci.yml — branch-protection fails closed on any required-job non-success
(Issue 9, 2026-08-29)"` — structural assertions on the `if:`/`needs:` shape, plus a
nested `"real script execution against all 9 owner-named scenarios"` block that
extracts the step's actual `run:` script, substitutes `${{ needs.<job>.result }}`
tokens exactly the way GitHub's runner does (plain text substitution before bash
runs), executes the real script via `bash -c`, and asserts the real exit code for
each of the 9 named scenarios: all-success (PASS); a failure in `build-and-test`,
`lint`, `bundle-validate`, `actionlint`, or `classify` (FAIL, one test per job); a
`cancelled` dependency (FAIL); an unexpected `skipped` dependency (FAIL); and the
`RECOVERY_INFRA_ONLY` case where only an internal step of `build-and-test` is
conditionally skipped while the job itself still resolves to `success` (PASS) — the
last of these also asserts the two suiteMode-conditioned steps in `build-and-test`
are mutually exclusive by construction, so a skip at the step level can never
degrade the job's own result.

---

## 3. What this matrix does not cover

- Wall-clock/dollar cost per column is not quantified here (that lives in
  `docs/opsiq/ci/NON_DB_SUITE_CAPACITY.md` and the workflow files' own timeout
  comments) — this document is about *how many times* each expensive lane runs per
  risk tier, which is the dimension the classifier controls.
- `main-integration.yml`'s own `classify` job (push-diff safety) is documented
  separately in `scripts/ci-risk-classifier.mjs`'s `resolvePushDiffFiles`/
  `classifyPushEvent` doc comments and proven by the 5 PUSH TEST scenarios in
  `src/__tests__/workflows/ci-risk-classifier.test.ts`.
