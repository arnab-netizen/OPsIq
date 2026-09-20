# CI Risk Classifier — Cost Matrix and Required-Check Audit

**Status:** Local documentation for `scripts/ci-risk-classifier.mjs`. Originally
produced during the owner correction pass of 2026-08-29 (Issues 8 and 9 of the
"FINAL LOCAL PRE-PUSH HOSTILE AUDIT AND CORRECTION" directive); updated for
CI-MIN-01 ("MINIMUM COST-SAFE CI") and its owner correction pass, which:
consolidated `ci.yml`'s three PR-gate jobs into one (`build-and-test`); added
a `TARGETED_CI_GOVERNANCE` suite mode that also skips the full-repo ESLint
traversal; made `package.json`/`package-lock.json` classification
diff-content-aware instead of path-blind; added a required `npm run build`
step; stopped `main-integration.yml`'s full DB suite from running
automatically on push to main; and — the owner correction — moved automatic
pre-merge DB validation INTO `ci.yml` itself as a `db-verify` job gated by
the classifier's own `db_required` output, removing `db-verification.yml`'s
`pull_request` trigger entirely (it was never actually a merge gate, since
`branch-protection` is the only required GitHub status context on `main`).

This is the exact, code-derived cost matrix the classifier enforces, plus the
static hostile-audit finding and fix for the one required-check job
(`branch-protection`) that gates PR merges.

---

## 1. Cost matrix — what runs per PR, by risk tier

Every row below is a real execution path in `ci.yml` today (`classify`,
`build-and-test`, `db-verify`, `actionlint`, `branch-protection` — `lint` and
`bundle-validate` no longer exist as separate jobs, and DB validation is a
job in this same file, not a separate workflow), traced directly from the
workflow YAML, not estimated.

| Risk tier | npm install | Governance scans / tsc / prisma validate / preservation gate / bundle+evidence validators | lint + lint:ratchet | `npm run build` | Broad non-DB Vitest suite | Targeted recovery checks | Targeted CI-governance checks | `db-verify` (throwaway Postgres) |
|---|---|---|---|---|---|---|---|---|
| `DOCS_ONLY` (0) | **No** | **No** | **No** | **No** | No | No | No | No |
| `RECOVERY_INFRA_ONLY` (1) | Yes | Yes | Yes | Yes | No | **Yes (targeted)** | No | No |
| `CI_GOVERNANCE` (2) | Yes | **No** | **No** | **No** | No | No | **Yes (targeted)** | No |
| `APPLICATION_NON_DB` (3) | Yes | Yes | Yes | Yes | Yes (once) | No | No | No |
| `SECURITY_AUTH_TENANCY_ENTITLEMENT` (4) | Yes | Yes | Yes | Yes | Yes (once) | No | No | No* |
| `DB_RUNTIME` (5) | Yes | Yes | Yes | Yes | Yes (once) | No | No | **Yes** |
| `UNKNOWN` (6) | Yes | Yes | Yes | Yes | Yes (once) | No | No | **Yes** |
| `MANUAL_DISPATCH` (workflow_dispatch on `main-integration.yml` or `db-verification.yml`, not a diff-derived tier) | n/a (not a `ci.yml` run) | n/a | n/a | n/a | n/a | n/a | n/a | n/a — manual re-verification only, never automatic |

\* A `SECURITY_AUTH_TENANCY_ENTITLEMENT`-tier path alone (e.g.
`src/lib/auth/session.ts`) does not by itself require `db-verify` — see
§4's discussion of this narrower, deliberate scoping and its accepted
limitation.

Notes:

- **DOCS_ONLY skips `npm ci` entirely** — the job runs only checkout + Node
  setup and finishes immediately; the job's own result stays `success`
  (steps skipped by their own `if:` do not change the enclosing job's
  result), so `branch-protection`'s per-job check is unaffected.
- **CI_GOVERNANCE skips governance/tsc/prisma/preservation/build AND lint**
  (owner correction) — a change confined to workflow YAML or a named CI
  script cannot touch application source (if it did, the path would already
  classify at a higher tier via max-wins), so none of these checks have
  anything to verify, including a full-repo ESLint traversal. It still runs
  `npm ci` (needed for its own targeted test step), the CI workflow
  governance check, and its `TARGETED_CI_GOVERNANCE` step: the classifier's
  own regression tests, the CI-trigger-governance structural tests, and a
  `node --check` syntax check on any changed CI script.
- `db-verify` is gated on exactly one signal: the classifier's `db_required`
  output (`true` for `DB_RUNTIME` and `UNKNOWN` tiers). It is deliberately
  minimal — checkout, `npm ci`, a throwaway `postgres:16` service, Prisma
  generate/validate/migrate-deploy, and `npm test -- '.db.test.ts'` — because
  `build-and-test` already proved tsc, the production build, lint, the
  owner-preservation gate, and the broad non-DB suite on this exact PR; it
  does not re-run any of them.

### 1.1 Required counts (per PR)

| Risk tier | `npm ci` count | `BROAD_NON_DB_SUITE_COUNT_PER_PR` | `TARGETED_RECOVERY_COUNT_PER_PR` | `TARGETED_CI_GOVERNANCE_COUNT_PER_PR` | `db_required` | `PRE_MERGE_DB_SUITE_COUNT` |
|---|---|---|---|---|---|---|
| `DOCS_ONLY` | **0** | 0 | 0 | 0 | false | 0 |
| `RECOVERY_INFRA_ONLY` | 1 | 0 | 1 | 0 | false | 0 |
| `CI_GOVERNANCE` | 1 | 0 | 0 | 1 | false | 0 |
| `APPLICATION_NON_DB` (incl. a `package.json` scripts-only or non-DB dependency change) | 1 | 1 | 0 | 0 | false | 0 |
| `SECURITY_AUTH_TENANCY_ENTITLEMENT` | 1 | 1 | 0 | 0 | false | 0 |
| `DB_RUNTIME` (prisma schema/migration, any `*.db.test.ts` file, DB scripts, a DB-package dependency change) | 2 (`build-and-test` + `db-verify`, each its own runner) | 1 | 0 | 0 | true | **1** |
| `UNKNOWN` (unrecognized path — "ambiguous -> FULL" applies to the DB dimension too) | 2 | 1 | 0 | 0 | true | **1** |

`npm ci` runs at most **once per job** — `build-and-test` and `db-verify` are
separate jobs on separate runners (one needs a Postgres service container,
the other doesn't), so each necessarily has its own install; that is not the
duplication this classifier exists to eliminate. What it does eliminate: the
former separate `lint` job and `bundle-validate` job (which called
`reusable-pr-validation.yml`) each paid for their own **extra** `npm ci` on
every single PR unconditionally, on top of `build-and-test`'s — both were
merged into `build-and-test` as steps. `reusable-pr-validation.yml` itself is
left in place, unused by `ci.yml`, for any future caller that wants the same
sequence without duplicating it.

`BROAD_NON_DB_SUITE_COUNT_PER_PR` is 0 or 1, never 2, for every tier — the
original defect this classifier was built to close. `TARGETED_CI_GOVERNANCE`
gets the same one-suite-max treatment `TARGETED_RECOVERY` already had.

A `package.json`/`package-lock.json` change is classified from its own diff
text (`classifyPackageJsonDiffText`/`classifyPackageLockDiffText` in
`scripts/ci-risk-classifier.mjs`), not blindly by path: a `scripts`-only
edit or a non-DB dependency change classifies `APPLICATION_NON_DB`
(`db_required=false`); a DB-related package (`prisma`, `pg`, `mysql2`,
`mongoose`, `@neondatabase/serverless`, etc.) classifies `DB_RUNTIME`
(`db_required=true`). Diff text unavailable (e.g. a caller that doesn't pass
`--base`/`--head`) falls back to the prior conservative blind `UNKNOWN`
(`db_required=true`) — ambiguous is still never treated as cheap on either
the suite dimension or the DB dimension.

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

**`needs:` list evolution:**
`needs: [classify, build-and-test, lint, bundle-validate, actionlint]`
(original) → `needs: [classify, build-and-test, actionlint]` (CI-MIN-01:
`lint`/`bundle-validate` merged into `build-and-test`) →
`needs: [classify, build-and-test, actionlint, db-verify]` (owner
correction, item 1: `db-verify` added).

**`db-verify` is the one exception to "any non-success fails closed":**
because it is legitimately, conditionally skipped (`db_required=false`), the
generic per-job loop does not apply to it. A dedicated rule instead: when
`db_required=true`, `db-verify` must be literally `"success"` (`skipped`,
`failure`, and `cancelled` all fail closed, exactly like every other
required job); when `db_required=false`, `"skipped"` is the expected,
correct outcome and passes, but `"failure"` or `"cancelled"` (which should
be unreachable given `db-verify`'s own `if:` gate, but is still checked
defensively) fails closed.

**Regression coverage:** `src/__tests__/ci-cd/ci-trigger-governance.test.ts`,
describe block `"ci.yml — branch-protection fails closed on any
required-job non-success (Issue 9, 2026-08-29)"` — structural assertions on
the `if:`/`needs:` shape (including that `db-verify` is in `needs:`), a
nested `"real script execution against all required-job scenarios"` block
covering all-success (PASS), a `build-and-test`/`actionlint`/`classify`
failure (FAIL each), a `cancelled` or unexpected `skipped` dependency
(FAIL), and the `RECOVERY_INFRA_ONLY` internal-step-skip case (PASS); plus a
dedicated nested `"db-verify conditional requirement"` block proving all 7
`(db_required, db-verify result)` combinations against the real extracted
script via `bash -c`.

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
  that exercise it — `db_required` is `true` for `DB_RUNTIME` (prisma
  schema/migrations, `.db.test.ts` files themselves, DB scripts, a
  DB-related dependency change) and `UNKNOWN`, but a
  `SECURITY_AUTH_TENANCY_ENTITLEMENT`-tier change (e.g. editing
  `src/lib/auth/session.ts` without touching its own `.db.test.ts`) does not
  by itself require `db-verify`, even though that source file's behavior is
  exercised by a DB test elsewhere. This is a pre-existing, accepted
  limitation of path-based CI classification generally — solving it would
  require tracing which tests exercise which source files, which is
  explicitly out of scope ("do not build another risk engine").

## 4. Where DB validation runs after CI-MIN-01 (owner correction)

Before CI-MIN-01, `main-integration.yml` ran its full DB suite
unconditionally-by-risk-class on every push to `main` — i.e. after merge.
The first CI-MIN-01 pass moved this to a separate `db-verification.yml`
workflow's own `pull_request` trigger; the owner correction found that this
was **not actually a merge gate**, since `branch-protection` is the only
required GitHub status check on `main` — a DB-risk PR could merge with a
red, stale, or entirely-absent `db-verification.yml` run and nothing would
block it. The fix:

- `ci.yml`'s own `db-verify` job runs the DB suite **pre-merge, on the PR
  itself, inside the one required workflow**, gated directly on the
  classifier's `db_required` output — computed by the SAME classifier that
  decides every other tier, not a second, separate static path-filter
  system. `branch-protection`'s fail-closed script (§2) makes `db-verify`
  actually block the merge when `db_required=true`.
- `db-verification.yml` is `workflow_dispatch`-only now (both LANE_A and
  LANE_B): it has no `pull_request` trigger at all, and is never a source of
  truth for DB risk. It stays available for explicit Neon/throwaway-Postgres
  re-verification.
- `main-integration.yml` is also `workflow_dispatch`-only: it does not run
  automatically on push to `main`. It stays available for disaster-recovery
  / release re-verification of `main` ("is main actually green"), not as a
  routine per-merge gate.
- A normal merge to `main` — one whose PR already passed the merge gate,
  DB-risk or not — does not re-run any suite a second time post-merge.

`scripts/ci-governance-check.mjs` rules 14-15 guard this structurally:
`db-verification.yml` must never regain a `pull_request` trigger, and
`ci.yml` must keep `db-verify` wired directly to
`needs.classify.outputs.db_required`.

## 5. Duplicate automatic owner-mode test workflows removed (owner correction, item 4)

`owner-mode-holdout.yml`, `owner-real-world-smb-cases.yml`, and
`owner-real-world-simulation.yml` each had `push`/`pull_request` triggers on
`tests/owner-mode/<subdir>/**` and `src/{services,domain}/consulting-engine/**`
— paths already covered by `vitest.config.ts`'s default include
(`"tests/owner-mode/**/*.test.ts"`), so any PR touching them already ran
these exact tests once inside `build-and-test`'s broad non-DB suite. All
three are `workflow_dispatch`-only now (tests and jobs unchanged, available
for manual/ad-hoc re-runs); `scripts/ci-governance-check.mjs`'s
`PUSH_BANNED_OVERLAPPING` list guards against the automatic triggers
returning.
