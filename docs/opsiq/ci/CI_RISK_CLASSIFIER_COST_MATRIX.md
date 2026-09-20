# CI Risk Classifier — Cost Matrix and Required-Check Audit

**Status:** Local documentation for `scripts/ci-risk-classifier.mjs`. Originally
produced during the owner correction pass of 2026-08-29 (Issues 8 and 9 of the
"FINAL LOCAL PRE-PUSH HOSTILE AUDIT AND CORRECTION" directive); updated for
CI-MIN-01 ("MINIMUM COST-SAFE CI"), which consolidated `ci.yml`'s three PR-gate
jobs into one (`build-and-test`), added a `TARGETED_CI_GOVERNANCE` suite mode,
made `package.json`/`package-lock.json` classification diff-content-aware
instead of path-blind, added a required `npm run build` step, and stopped
`main-integration.yml`'s full DB suite from running automatically on push to
main (DB-risk validation now runs pre-merge, on the PR, via
`db-verification.yml`).

This is the exact, code-derived cost matrix the classifier enforces, plus the
static hostile-audit finding and fix for the one required-check job
(`branch-protection`) that gates PR merges.

---

## 1. Cost matrix — what runs per PR, by risk tier

Every row below is a real execution path in `ci.yml` today (a single
`build-and-test` job; `lint` and `bundle-validate` no longer exist as
separate jobs — their steps were merged in to eliminate their own separate
`npm ci`), traced directly from the workflow YAML, not estimated.

| Risk tier | npm install | Governance scans / tsc / prisma validate / preservation gate / bundle+evidence validators | lint + lint:ratchet | `npm run build` | Broad non-DB Vitest suite | Targeted recovery checks | Targeted CI-governance checks | Full Main-DB integration |
|---|---|---|---|---|---|---|---|---|
| `DOCS_ONLY` (0) | **No** | **No** | **No** | **No** | No | No | No | No (pre-merge; see §4) |
| `RECOVERY_INFRA_ONLY` (1) | Yes | Yes | Yes | Yes | No | **Yes (targeted)** | No | No (pre-merge; see §4) |
| `CI_GOVERNANCE` (2) | Yes | **No** | Yes | **No** | No | No | **Yes (targeted)** | No (pre-merge; see §4) |
| `APPLICATION_NON_DB` (3) | Yes | Yes | Yes | Yes | Yes (once) | No | No | No (pre-merge; see §4) |
| `SECURITY_AUTH_TENANCY_ENTITLEMENT` (4) | Yes | Yes | Yes | Yes | Yes (once) | No | No | No (pre-merge; see §4) |
| `DB_RUNTIME` (5) | Yes | Yes | Yes | Yes | Yes (once) | No | No | Pre-merge, once, via `db-verification.yml` (see §4) |
| `UNKNOWN` (6) | Yes | Yes | Yes | Yes | Yes (once) | No | No | No (pre-merge; see §4) |
| `MANUAL_DISPATCH` (workflow_dispatch on `main-integration.yml`, not a diff-derived tier) | n/a (not a `ci.yml` run) | n/a | n/a | n/a | n/a | n/a | n/a | **Yes (always, unconditionally)** — disaster-recovery / release re-verification only, never automatic |

Notes:

- **DOCS_ONLY now skips `npm ci` entirely** (CI-MIN-01) — previously it ran
  every governance/tsc/prisma/lint step regardless of tier, paying real cost
  for a diff with zero executable content. Now the job runs only checkout +
  Node setup and finishes immediately; the job's own result stays `success`
  (steps skipped by their own `if:` do not change the enclosing job's
  result), so `branch-protection`'s per-job check is unaffected.
- **CI_GOVERNANCE now skips the governance/tsc/prisma/preservation/build
  steps** (CI-MIN-01) — a change confined to workflow YAML or a named CI
  script cannot touch application source (if it did, the path would already
  classify at a higher tier via max-wins), so those checks have nothing to
  verify. It still runs `npm ci` (needed for its own targeted test step),
  lint (a workflow/CI-script file is still real JS/TS content ESLint should
  see), and the CI workflow governance check.
- `SECURITY_AUTH_TENANCY_ENTITLEMENT` and `UNKNOWN` no longer force a DB
  suite run **on this PR's own gate** — DB validation is scoped to genuine
  DB-risk changes (prisma schema/migrations, `.db.test.ts` files, DB
  scripts, or the small named DB-adjacent service list) via
  `db-verification.yml`'s own `pull_request` trigger, not via `ci.yml`.
  `runMainIntegrationFullSuite` (still computed by the classifier, still
  `true` for tiers 4-6) now only controls `main-integration.yml`'s
  `workflow_dispatch` path, which always runs the full suite regardless of
  classification (see §4) — it does not gate anything on the PR itself.

### 1.1 Required counts (per PR)

| Risk tier | `npm ci` count | `BROAD_NON_DB_SUITE_COUNT_PER_PR` | `TARGETED_RECOVERY_COUNT_PER_PR` | `TARGETED_CI_GOVERNANCE_COUNT_PER_PR` | `PRE_MERGE_DB_SUITE_COUNT` (via `db-verification.yml`) |
|---|---|---|---|---|---|
| `DOCS_ONLY` | **0** | 0 | 0 | 0 | 0 |
| `RECOVERY_INFRA_ONLY` | 1 | 0 | 1 | 0 | 0 |
| `CI_GOVERNANCE` | 1 | 0 | 0 | 1 | 0 |
| `APPLICATION_NON_DB` (incl. a `package.json` scripts-only or non-DB dependency change) | 1 | 1 | 0 | 0 | 0 |
| `SECURITY_AUTH_TENANCY_ENTITLEMENT` | 1 | 1 | 0 | 0 | 0 |
| `DB_RUNTIME` (prisma schema/migration, `.db.test.ts`, DB scripts, a DB-package dependency change) | 1 | 1 | 0 | 0 | **1** (`db-verification.yml`, path-triggered independently of `ci.yml`) |
| `UNKNOWN` | 1 | 1 | 0 | 0 | 0 |

`npm ci` runs at most **once** per PR (inside `build-and-test`), never twice
— `ci.yml`'s former separate `lint` job and `bundle-validate` job (which
called `reusable-pr-validation.yml`) each paid for their own `npm ci` on
every PR unconditionally; both were merged into `build-and-test` as steps
(CI-MIN-01 root-cause fix). `reusable-pr-validation.yml` itself is left in
place, unused by `ci.yml`, for any future caller that wants the same
sequence without duplicating it.

`BROAD_NON_DB_SUITE_COUNT_PER_PR` is 0 or 1, never 2, for every tier — the
original defect this classifier was built to close. `TARGETED_CI_GOVERNANCE`
(CI-MIN-01) gets the same one-suite-max treatment `TARGETED_RECOVERY`
already had: a workflow/CI-script-only change cannot break the ~28,000-test
application suite, so it never runs it — only the classifier's own tests and
the CI-trigger-governance structural tests.

A `package.json`/`package-lock.json` change is classified from its own diff
text (`classifyPackageJsonDiffText`/`classifyPackageLockDiffText` in
`scripts/ci-risk-classifier.mjs`), not blindly by path: a `scripts`-only
edit or a non-DB dependency change classifies `APPLICATION_NON_DB` (1
broad-suite run, 0 DB suite); a DB-related package
(`prisma`, `pg`, `mysql2`, `mongoose`, `@neondatabase/serverless`, etc.)
classifies `DB_RUNTIME`. Diff text unavailable (e.g. a caller that doesn't
pass `--base`/`--head`) falls back to the prior conservative blind `UNKNOWN`
— ambiguous is still never treated as cheap.

---

## 2. `branch-protection` required-check audit (Issue 9, still enforced)

**Hostile-audit finding (fixed 2026-08-29, semantics corrected 2026-08-29):**
`ci.yml`'s `branch-protection` job — the one job every other required PR
check ultimately routes through, and the **only** GitHub required status
check on `main` (confirmed via the repository's branch ruleset, which lists
exactly one `required_status_checks` context: `branch-protection`) — had
`needs: [...]` but a plain `if: github.event_name == 'pull_request'`
condition, with no status-check function in it.

**Precise mechanism.** GitHub Actions implicitly ANDs a job's `if:` with
`success()` whenever the condition does not itself contain one of
`success()`, `always()`, `cancelled()`, or `failure()` — a custom `if:` does
not *replace* that gate, it is combined with it by default. So the old
condition here actually evaluated as
`success() && github.event_name == 'pull_request'`. Concretely: if
`build-and-test` (the job that runs governance scans, `tsc`,
`prisma validate`, and the non-DB test suite) FAILED, this job's effective
condition was false, and the job was **skipped** — it did not run its body
at all. The defect is what GitHub does with that skip: a skipped job/check
is reported to the checks API as a non-blocking, passing conclusion, and
GitHub's required-status-checks branch protection treats a skipped required
check as satisfying "required to pass." So the one required PR gate still
reported **green while real CI was red** — via a skip counting as success,
not via this job's body running despite a real failure.

**Fix (unchanged by CI-MIN-01):** `if: ${{ always() && github.event_name == 'pull_request' }}`,
plus an explicit step that reads every dependency's
`${{ needs.<job>.result }}` and `exit 1`s if any is not literally
`"success"` (covering `failure`, `cancelled`, and `skipped` uniformly — a
skipped dependency is exactly as disqualifying as a failed one).

**CI-MIN-01 changed the `needs:` list, not the mechanism:**
`needs: [classify, build-and-test, lint, bundle-validate, actionlint]`
became `needs: [classify, build-and-test, actionlint]` — `lint` and
`bundle-validate` are steps inside `build-and-test` now, so a failure in
either surfaces as a `build-and-test` job failure, still caught by the exact
same fail-closed mechanism.

**Regression coverage:** `src/__tests__/ci-cd/ci-trigger-governance.test.ts`,
describe block `"ci.yml — branch-protection fails closed on any
required-job non-success (Issue 9, 2026-08-29)"` — structural assertions on
the `if:`/`needs:` shape, plus a nested
`"real script execution against all required-job scenarios"` block that
extracts the step's actual `run:` script, substitutes
`${{ needs.<job>.result }}` tokens exactly the way GitHub's runner does
(plain text substitution before bash runs), executes the real script via
`bash -c`, and asserts the real exit code for: all-success (PASS); a
`build-and-test` failure (FAIL); an `actionlint` failure (FAIL); a
`classify` failure (FAIL); a `cancelled` dependency (FAIL); an unexpected
`skipped` dependency (FAIL); and the `RECOVERY_INFRA_ONLY` case where only
an internal step of `build-and-test` is conditionally skipped while the job
itself still resolves to `success` (PASS).

---

## 3. What this matrix does not cover

- Wall-clock/dollar cost per column is not quantified here (that lives in
  `docs/opsiq/ci/NON_DB_SUITE_CAPACITY.md` and the workflow files' own
  timeout comments) — this document is about *how many times* each
  expensive lane runs per risk tier, which is the dimension the classifier
  controls.
- `main-integration.yml`'s own `classify` job (push-diff safety) is
  documented separately in `scripts/ci-risk-classifier.mjs`'s
  `resolvePushDiffFiles`/`classifyPushEvent` doc comments and proven by the
  5 PUSH TEST scenarios in `src/__tests__/workflows/ci-risk-classifier.test.ts`.
  Since `main-integration.yml` no longer triggers on `push`, this logic now
  only ever executes for a `workflow_dispatch` run, where it is
  unconditionally overridden to always run the full suite (dead but
  harmless for the push-diff branch specifically).
- A source file's own change is not correlated to the `.db.test.ts` files
  that exercise it — `db-verification.yml` triggers on `.db.test.ts` files
  themselves, prisma/**, DB-interacting scripts, and a short named list of
  DB-adjacent services, not on an arbitrary service file that some DB test
  elsewhere happens to cover. This is a pre-existing, accepted limitation of
  path-based CI classification generally (see the owner's own narrow
  "DB-risk" definition in the CI-MIN-01 mission), not something introduced
  or worsened by this change.

## 4. Where DB validation runs after CI-MIN-01

Before CI-MIN-01, `main-integration.yml` ran its full DB suite
unconditionally-by-risk-class on every push to `main` — i.e. after merge.
After CI-MIN-01:

- `db-verification.yml`'s `pull_request` trigger (paths: `prisma/**`,
  `prisma.config.ts`, `src/infra/prisma-datasource.ts`, every
  `**/*.db.test.ts` file repo-wide, DB-interacting scripts
  (`scripts/seed-*`, `scripts/reset-*`, anything matching `*migrate*` under
  `scripts/`), and 4 named DB-adjacent service files) runs the DB suite
  **pre-merge**, on the PR itself, once, whenever a DB-risk change is
  present.
- `main-integration.yml` is `workflow_dispatch`-only: it does not run
  automatically on push to `main` any more. It stays available for
  disaster-recovery / release re-verification of `main` ("is main actually
  green"), not as a routine per-merge gate.
- A normal merge to `main` — one whose PR already passed the merge gate,
  DB-risk or not — does not re-run any suite a second time post-merge.
