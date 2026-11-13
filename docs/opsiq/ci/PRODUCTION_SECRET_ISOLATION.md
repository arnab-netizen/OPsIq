# Production secret isolation — consumer matrix and staged migration

Status: **proposed by PR `claude/production-secret-isolation`; nothing in GitHub or Vercel is changed by it.** Owner actions are listed in section 6 and must be done **before** the PR is merged.

> **UPDATE (supersedes the secret names in §2, §5 and §6 below).** The seven `production-operator` jobs now read **uniquely named, environment-only** secrets, and the three diagnostic smoke workflows run in a new protected environment `production-smoke`. Reason: GitHub resolves `secrets.X` environment-first and then falls back to a repo-level secret of the same name, so an environment secret that is missing or misspelled silently resolves to the older, unprotected repo-level copy. With unique names there is no repo-level target to fall back to, and every job additionally fails closed (empty check, `exit 1`) before use.

## 0. Secret names, scopes and exact owner setup (nothing here is done by Claude)

| Environment | Secret (name only) | Used by |
|---|---|---|
| `production-operator` | `OPERATOR_DATABASE_URL` | migrate-production, production-db-status, provision-administration-operator, provision-acceptance-fixture-operator, scheduled-backup (legacy, disabled) |
| `production-operator` | `OPERATOR_ACCEPTANCE_EMAIL` | production-owner-acceptance, production-root-probe, provision-acceptance-fixture-operator |
| `production-operator` | `OPERATOR_ACCEPTANCE_PASSWORD` | production-owner-acceptance, production-root-probe |
| `production-smoke` | `SMOKE_DIAGNOSTIC_KEY` | smoke-production-dashboard / -diagnosis-dashboard / -signup-dashboard |

The old names `PRODUCTION_DATABASE_URL`, `PRODUCTION_ACCEPTANCE_EMAIL`, `PRODUCTION_ACCEPTANCE_PASSWORD` are no longer referenced by the seven jobs (only `stage7-capture*` in `stage7-evidence-signing` still uses them). `OPSIQ_DIAGNOSTIC_KEY` is no longer referenced by any workflow. Tests forbid any `production-operator`/`production-smoke` job from referencing a non-unique secret.

**Owner steps, in order (before any dispatch of the changed workflows):**
1. Create `production-operator`: deployment branches = `main` only; required reviewer = the owner (prevent-self-review OFF for a sole owner); disallow admin bypass if offered. Add secrets `OPERATOR_DATABASE_URL`, `OPERATOR_ACCEPTANCE_EMAIL`, `OPERATOR_ACCEPTANCE_PASSWORD` (values copied from the current ones; nothing is rotated by this PR).
2. Create `production-smoke` with the same protections; add `SMOKE_DIAGNOSTIC_KEY` (same value the Vercel runtime accepts).
3. Merge only after the owner has confirmed 1-2; then dispatch each workflow once and approve the environment gate to verify.
4. Only after verification: delete repo-level `OPSIQ_DIAGNOSTIC_KEY`, the Production-environment copies and later the other old-name copies per §5. Never earlier.
A job dispatched before its environment exists would auto-create an unprotected environment and fail at its preflight; do not dispatch first.

## 0.1 Diagnostic-key exfiltration (smoke workflows)

Findings: `base_url` was free text, so a dispatcher could aim the key (`x-opsiq-diagnostic-key`) at any host; Node `fetch` follows redirects and re-sends custom headers cross-origin; `smoke-production-dashboard.ts` also had a fallback that put the key in a query string (`?key=`; the server already ignores query keys). Controls: `base_url` is a `choice` of three canonical origins; the workflow validates it in shell before any secret-bearing step; the scripts use `src/lib/security/diagnostic-destination.ts` (exact-origin allow-list, relative paths only, `redirect: "manual"` so a 3xx is never followed, key header-only, key never logged); the `curl` wait steps use `--proto '=https' --max-redirs 0`. Tests: `src/__tests__/security/diagnostic-destination.test.ts` (real loopback servers prove the key never reaches an unapproved or redirect-target host) and mutation tests M10-M18 in the isolation test.
Not changed (follow-up): other key users (`scripts/validate-deployment.ts`, `deployment-preflight.mjs`, stage7 probes) and `smoke-production-login.ts` (sends demo credentials to `BASE_URL`). Pre-existing: the signup/diagnosis smoke scripts abort on a production URL unless `SMOKE_ALLOW_PRODUCTION_WRITES=true`, which the workflows do not set.

## 0.2 `MIGRATION_DATABASE_URL` classification (metadata only; never read, decoded or used)

Evidence: it exists at repo level and in the `Production` environment, created 18 s apart on 2026-09-27 (a copy of one value, or two values set in one sitting); 12 workflow consumers read the repo-level copy with no protected environment (matrix in §4); module-migration jobs fall back to it unless `staging` defines its own. Scope cannot be proven from metadata, so it is classified **POTENTIALLY PRODUCTION-PRIVILEGED**. Consequence: treat the repo-level copy as exposed to anyone who can push a workflow branch; do not use it for any new job; migrate consumers per §5 stages 2-3 and have the owner confirm (from the Neon console, not from CI) which role/database it targets before deciding on rotation.

## 1. Problem

* The seven Production-grade Actions jobs below ran in the GitHub environment `production`. That is also the environment name **Vercel** records its Production deployments under (GitHub environment names are case-insensitive), it has **no deployment-branch rule and no reviewer**, and it cannot safely get reviewers while Vercel shares it (GitHub's docs do not say how reviewers interact with deployments created by integrations).
* `ref: main` on the later checkout only selects which repository **content** is built. The steps that run - and the secrets they reference - come from the workflow **file of the ref that was dispatched**. Without an environment branch rule, a dispatch from any branch runs that branch's workflow with Production secrets.
* Several Production-grade secrets also exist as **repo-level duplicates**, which no environment protection applies to.

## 2. What this PR changes

| # | Workflow | Job | Before | After |
|---|---|---|---|---|
| 1 | `migrate-production.yml` | `migrate` | `production` | `production-operator` + origin guard |
| 2 | `production-db-status.yml` | `status` | `production` | `production-operator` + origin guard |
| 3 | `production-owner-acceptance.yml` | `acceptance` | `production` | `production-operator` + origin guard |
| 4 | `production-root-probe.yml` | `probe` | `production` | `production-operator` + origin guard |
| 5 | `provision-acceptance-fixture-operator.yml` | `provision` | `production` | `production-operator` + origin guard |
| 6 | `provision-administration-operator.yml` | `provision` | `production` | `production-operator` + origin guard |
| 7 | `scheduled-backup.yml` (legacy plaintext, `disabled_manually`) | `backup` | `production` | `production-operator` + origin guard |

Preserved unchanged: every typed-confirmation gate, `if:` condition, input validation, `ref: main` checkout, pinned-SHA / expected-host checks, permissions and concurrency. The only structural edit per job is the `environment:` line and one new **first** step.

**Workflow-origin guard** (`Assert workflow origin is main (fail-closed)`): the first step of each of the seven jobs, before any step that references a secret. It fails the job unless the trigger is `workflow_dispatch`/`schedule`, `GITHUB_REF` is `refs/heads/main`, **and** `GITHUB_WORKFLOW_REF` ends in `@refs/heads/main`. Honest limit: a workflow author can edit the guard out of a branch copy, so the guard is **defence in depth against accidental off-main dispatch**. The **enforcing** control is the `production-operator` environment's deployment-branch rule (section 6, step 2).

**Tests** (`src/__tests__/ci-cd/production-secret-isolation.test.ts`, now 27): the seven jobs use `production-operator` with the verbatim guard as step 1; no job may use the shared `production` environment; Production-grade secrets (`PRODUCTION_DATABASE_URL`, `VERCEL_PRODUCTION_DEPLOY_HOOK_URL`, `PRODUCTION_ACCEPTANCE_*`, `VERCEL_TOKEN`, `EVIDENCE_SIGNING_KEY`, backup/R2 secrets) may only be used in their listed protected environments, with zero exemptions; `MIGRATION_DATABASE_URL` and `OPSIQ_DIAGNOSTIC_KEY` may be read without a protected environment **only** by an exact, shrinking allowlist (a new consumer fails; a migrated consumer must be deleted from the list); module migrations can only target `staging`; no age private identity is referenced; 9 mutation tests prove each rule fails on its violation. Seven older tests that pinned the old environment name by substring were tightened to the exact new name.

## 3. Audit scope

* **All 94 workflows** were parsed. Production-referencing: the 7 above. **Module migrations** (`module-1..8,10-*-migrate.yml`): `environment` comes from the `target` input whose only option is `staging`, so they cannot reach `production`. **Reusable** (`reusable-pr-validation.yml`, the only `workflow_call` workflow): references no Production-grade secret (enforced by a test). **Diagnostic smoke** (`smoke-production-*.yml`, 3): read the repo-level `OPSIQ_DIAGNOSTIC_KEY` with no environment (transitional; stage 4).
* `VERCEL_PRODUCTION_DEPLOY_HOOK_URL` is referenced by `migrate-production.yml` but **exists in no scope**. It is **optional by design** (the step exits 0 and tells the operator to redeploy in Vercel). **This PR does not create, invent or require it.**

## 4. Consumer matrix (generated from the workflow files at the PR head)

### `PRODUCTION_DATABASE_URL` (owner/migrator credential) — existing scope: `Production` environment only
| Workflow | Job | Trigger | Environment before | Environment after |
|---|---|---|---|---|
| `migrate-production` | `migrate` | workflow_dispatch | `production` | `production-operator` |
| `production-db-status` | `status` | workflow_dispatch | `production` | `production-operator` |
| `provision-acceptance-fixture-operator` | `provision` | workflow_dispatch | `production` | `production-operator` |
| `provision-administration-operator` | `provision` | workflow_dispatch | `production` | `production-operator` |
| `scheduled-backup` | `backup` | schedule,workflow_dispatch | `production` | `production-operator` |
| `stage7-capture` | `capture` | workflow_dispatch | `stage7-evidence-signing` | `stage7-evidence-signing` |

### `MIGRATION_DATABASE_URL` — existing scopes: repo-level **and** `Production` environment (set 18 s apart on 2026-09-27)
| Workflow | Job | Trigger | Environment before | Environment after |
|---|---|---|---|---|
| `db-verification` | `lane-a-neon-verify` | workflow_dispatch | `None` | `None` |
| `migrate-neon-test` | `migrate-neon-test` | workflow_dispatch | `None` | `None` |
| `module-1-owner-recovery-migrate` | `migrate` | workflow_dispatch | `${{ github.event.inputs.target }}` | `${{ github.event.inputs.target }}` |
| `module-10-data-intake-migrate` | `migrate` | workflow_dispatch | `${{ github.event.inputs.target }}` | `${{ github.event.inputs.target }}` |
| `module-2-finance-migrate` | `migrate` | workflow_dispatch | `${{ github.event.inputs.target }}` | `${{ github.event.inputs.target }}` |
| `module-3-sales-migrate` | `migrate` | workflow_dispatch | `${{ github.event.inputs.target }}` | `${{ github.event.inputs.target }}` |
| `module-4-operations-migrate` | `migrate` | workflow_dispatch | `${{ github.event.inputs.target }}` | `${{ github.event.inputs.target }}` |
| `module-5-cashflow-migrate` | `migrate` | workflow_dispatch | `${{ github.event.inputs.target }}` | `${{ github.event.inputs.target }}` |
| `module-6-marketing-migrate` | `migrate` | workflow_dispatch | `${{ github.event.inputs.target }}` | `${{ github.event.inputs.target }}` |
| `module-7-sop-migrate` | `migrate` | workflow_dispatch | `${{ github.event.inputs.target }}` | `${{ github.event.inputs.target }}` |
| `module-8-strategy-migrate` | `migrate` | workflow_dispatch | `${{ github.event.inputs.target }}` | `${{ github.event.inputs.target }}` |
| `resolve-failed-migration` | `resolve-failed-migration` | workflow_dispatch | `None` | `None` |

**No job runs this secret in `production`/`production-operator`: the `Production`-environment copy has no workflow consumer.** The 12 consumers above read the repo-level copy unless their environment (`staging`) defines its own; whether the repo-level value points at a Production, staging or test database is **UNKNOWN** and must be established before any change (stage 2).

### `PRODUCTION_ACCEPTANCE_EMAIL` — existing scope: repo-level only
| Workflow | Job | Trigger | Environment before | Environment after |
|---|---|---|---|---|
| `production-owner-acceptance` | `acceptance` | workflow_dispatch | `production` | `production-operator` |
| `production-root-probe` | `probe` | workflow_dispatch | `production` | `production-operator` |
| `provision-acceptance-fixture-operator` | `provision` | workflow_dispatch | `production` | `production-operator` |
| `stage7-capture-control-plane` | `capture` | workflow_dispatch | `stage7-evidence-signing` | `stage7-evidence-signing` |
| `stage7-capture` | `capture` | workflow_dispatch | `stage7-evidence-signing` | `stage7-evidence-signing` |

### `PRODUCTION_ACCEPTANCE_PASSWORD` — existing scopes: repo-level (2026-08-21) **and** `Production` environment (2026-10-27, newer)
| Workflow | Job | Trigger | Environment before | Environment after |
|---|---|---|---|---|
| `production-owner-acceptance` | `acceptance` | workflow_dispatch | `production` | `production-operator` |
| `production-root-probe` | `probe` | workflow_dispatch | `production` | `production-operator` |
| `stage7-capture-control-plane` | `capture` | workflow_dispatch | `stage7-evidence-signing` | `stage7-evidence-signing` |
| `stage7-capture` | `capture` | workflow_dispatch | `stage7-evidence-signing` | `stage7-evidence-signing` |

**Hazard:** after this PR, `production-operator` jobs read the env copy if present, otherwise the OLDER repo-level password. The current password must be copied into `production-operator` before merge (section 6).

### `OPSIQ_DIAGNOSTIC_KEY` — existing scopes: repo-level **and** `Production` environment (the Vercel runtime has its own variable)
| Workflow | Job | Trigger | Environment before | Environment after |
|---|---|---|---|---|
| `smoke-production-dashboard` | `smoke` | workflow_dispatch | `None` | `None` |
| `smoke-production-diagnosis-dashboard` | `smoke-test` | workflow_dispatch | `None` | `None` |
| `smoke-production-signup-dashboard` | `smoke-test` | workflow_dispatch | `None` | `None` |

**No job runs this secret in `production`: the `Production`-environment copy has no workflow consumer.**

### `VERCEL_PRODUCTION_DEPLOY_HOOK_URL` — exists in no scope
| Workflow | Job | Trigger | Environment before | Environment after |
|---|---|---|---|---|
| `migrate-production` | `migrate` | workflow_dispatch | `production` | `production-operator` |

### Scope snapshot (names only; read 2026-11-13)
* Repo-level: `DATABASE_URL_TEST`, `MIGRATION_DATABASE_URL`, `NEON_DATABASE_URL`, `OPENAI_API_KEY`, `OPSIQ_DIAGNOSTIC_KEY`, `PRODUCTION_ACCEPTANCE_EMAIL`, `PRODUCTION_ACCEPTANCE_PASSWORD`, `STAGING_DATABASE_URL`, `TEST_DATABASE_URL`.
* `Production` environment: `MIGRATION_DATABASE_URL`, `OPSIQ_DIAGNOSTIC_KEY`, `PRODUCTION_ACCEPTANCE_PASSWORD`, `PRODUCTION_DATABASE_URL`.
* `staging`, `test`, `Preview`, `stage-7-evidence`, `stage7-evidence-signing`: **secret names UNKNOWN (not read)** - read them in stage 1 before relying on any fallback behaviour.
* Environments do not exist yet: `production-operator`, `backup-write`, `backup-recovery`.

## 5. Staged secret migration - a secret is deleted only after EVERY consumer has migrated AND been verified

Verification means: the consumer ran (owner-dispatched, typed gate, reviewer-approved) against the new scope and succeeded, **and** the matrix above shows no remaining reader of the old scope. Deleting is always the **last** act of a stage and is its own owner action.

| Stage | Action (owner unless stated) | Gate to proceed |
|---|---|---|
| **0** | Create environment `production-operator`: deployment branches = `main` only; required reviewer = owner (self-review allowed); no admin bypass. **Do not dispatch anything first** - a missing environment is auto-created with no protection. | Settings screenshot/readback shows the three settings. |
| **1** | Add to `production-operator` the **current** values of `PRODUCTION_DATABASE_URL`, `PRODUCTION_ACCEPTANCE_EMAIL`, `PRODUCTION_ACCEPTANCE_PASSWORD` (the 2026-10-27 password, not the older repo copy). Read the secret **names** of `staging`, `test`, `stage7-evidence-signing`. Merge this PR (separate authorization). | Names present. |
| **1v** | Dispatch `production-db-status` (read-only) and `production-root-probe` (read-only) from `main`; approve; both succeed. | Both green. This proves the 3 secrets work in the new scope. |
| **1d** | Delete the `Production`-environment copies of `PRODUCTION_DATABASE_URL` and `PRODUCTION_ACCEPTANCE_PASSWORD` **only if** 1v is green **and** the matrix shows no other reader (`stage7-capture*` read them from `stage7-evidence-signing`; confirm that environment holds its own copies first, else migrate them there first). | Matrix re-run shows zero readers of the old scope. |
| **2** | Establish what the repo-level `MIGRATION_DATABASE_URL` points to (Neon console: project, branch, role). If it is staging/test: add it to the `staging` environment; if it is Production-grade: **create a dedicated staging value** and put it in `staging` - never leave a Production-grade migrator readable by staging dispatches. Verify one module-migration dispatch against staging. | Target of every one of the 12 consumers known and verified. |
| **3** | Move `db-verification` (lane-a), `migrate-neon-test`, `resolve-failed-migration` to the `test` environment (separate PR) and delete them from `TRANSITIONAL`. Delete the repo-level `MIGRATION_DATABASE_URL`, then the unused `Production`-environment copy. | Test shows `TRANSITIONAL.MIGRATION_DATABASE_URL` empty; every dispatch above re-verified. |
| **4** | Move `smoke-production-*` (3) to `production-operator` or a dedicated protected environment (separate PR) and delete them from `TRANSITIONAL`. Then delete repo-level `OPSIQ_DIAGNOSTIC_KEY`, then the unused `Production`-environment copy. The Vercel runtime variable is **untouched**. | Smoke dispatches verified; matrix shows no reader. |
| **5** | Delete repo-level `PRODUCTION_ACCEPTANCE_EMAIL`/`PASSWORD` once `stage7-evidence-signing` holds its own verified copies. | `stage7-capture*` dispatch verified. |

## 6. Owner actions before merging this PR (nothing here is done by Claude)

1. Read the secret names of `staging`, `test`, `stage7-evidence-signing` (Settings, Environments).
2. Create `production-operator` (stage 0 settings) **before any dispatch or merge**.
3. Add the three secrets of stage 1.
4. Merge only then; run stage 1v.

## 7. Vercel shared Production environment compatibility

* This PR does **not** touch the `Production`/`Preview` environments or their rules, and **adds no reviewer to `Production`.** After it, no Actions job references `Production`, so Actions no longer competes with Vercel for that name.
* Vercel deploys through its own Git integration. `.github/workflows/*` and tests are classified `runtime` by `scripts/vercel-ignore-build.mjs` (see PR #662's build log), so merging triggers one ordinary Production redeploy of the same application code, gated by the release gate - expected, not a risk.
* A `main`-only branch rule on `Production` itself (a later, separate owner decision) is compatible with Vercel's Production deployments, which are built from `main`; adding reviewers there remains **unverified** and is deliberately out of scope.

## 8. Not done / limits

* No environment, secret, Vercel setting, database, R2 or workflow-dispatch change was made.
* The scope snapshot is from 2026-11-13; re-read names before each stage.
* The origin guard cannot stop a branch author who edits the guard away; only the environment branch rule does.
