# Autonomous release pipeline: trust model and status

Status (session 6): **Phase 1 IMPLEMENTED_NOT_VERIFIED, INERT**. The workflow is shipped as
`docs/opsiq/ci/proposed/production-release-reconcile.yml.draft` (outside `.github/workflows`, so it cannot run); the supporting scripts and
tests are live code. It has never executed. Phase 2 (automatic migration execution) is NOT implemented and NOT started.

## Activation (a human-reviewed change; not done by the implementing agent)
`src/__tests__/governance/prisma-mutation-governance.test.ts` states that a fourth workflow carrying production authorization
`must not be added here without the same review this one received`. The activation change is therefore exactly: (1) move the draft to
`.github/workflows/production-release-reconcile.yml`, (2) add that filename to that test's allowlist and its comment, (3) point
`production-release-reconcile.test.ts`'s `DRAFT` constant at the new path and delete its inertness test. An independent human reviewer must
approve that diff; the implementing agent must not make or merge it.

## Why a scheduled workflow and not a push-triggered one
`src/__tests__/ci-cd/production-secret-isolation.test.ts` pins the production-grade jobs behind a verbatim origin guard that allows
only `workflow_dispatch|schedule`, forbids reusable workflows from referencing production secrets, and requires `production-operator`.
A `push`-triggered or reusable release broke 6 of those tests, and editing them in the same PR would let a change approve itself.
A `schedule` trigger is already inside the trust model, needs no external dispatch, runs only from the default branch, and gives
durable recovery: a missed, superseded or cancelled release is simply picked up by the next run, because every run reconciles
production with `main`'s current state rather than reacting to one event. No existing governance test is edited by this change.

## What one run does (all in `production-operator`, shared concurrency group `migrate-production`)
1. Origin guard (verbatim) -> checkout `main` -> release SHA = main HEAD, which must equal `GITHUB_SHA` (else stop before any DB step).
2. Required CI (`branch-protection`) must already be green at that exact SHA, else the run is a no-op.
3. Production identity: repository variable `PRODUCTION_DATABASE_HOST` (bare direct host; unset = fail closed) against the operator
   URL's host, plus the database's own identity (same reviewed checks as the role tool).
4. Release plan from the REAL ledger (`release-plan-cli.ts`, explicit `BEGIN READ ONLY`, always rolled back): NOOP / MIGRATE / BLOCK. A
   non-NOOP plan fails the run before any write. The plan uses the fail-closed allowlist classifier; it is a policy filter, not a
   compatibility proof.
5. Runtime-role reconcile and strict least-privilege gate in drift mode: a fully conforming role causes no write and no lock.
6. Exact-SHA deployment: GitHub Deployments API for THIS sha. No successful production build -> the deploy hook is triggered once;
   the run then waits for THIS sha to reach success. At most one trigger per run (hourly cron); BLOCK after 5 failed builds of the
   same SHA.

## New privileged execution paths (everything a reviewer must check)
- Scheduled trigger of a job in `production-operator` (new) using only `OPERATOR_DATABASE_URL` and the optional deploy hook.
- It can run `opsiq-role-cutover.ts apply --only-if-present` (reconcile-only, existing tool) through the gate when drift exists.
- It can POST the deploy hook. A forged hook call is impossible without the secret; a wrong-SHA deploy is detected because success is
  accepted only for the exact release SHA.
- `GITHUB_TOKEN` with `checks: read` and `deployments: read` only.

## Known limits (stated, not hidden)
- Migrations are still applied only by `migrate-production.yml` (manual). Phase 1 detects and alerts; Phase 2 would add ordered
  automatic apply under the allowlist classifier and still needs its own independent review.
- Whether `production-operator` requires a reviewer for scheduled runs is unknown from this session. If it does, each hourly run
  waits for approval and the pipeline is NOT autonomous until the owner replaces that rule with an independently reviewed equivalent.
- Needs the repository variable `PRODUCTION_DATABASE_HOST` (non-secret) and, for redeploy, `VERCEL_PRODUCTION_DEPLOY_HOOK_URL`.
- Deployment state relies on Vercel's GitHub integration recording Production deployments; if it records none, every run falls back
  to REDEPLOY (bounded to one hook trigger per run).
- The workflow has not run; first execution must be supervised (manual dispatch) before relying on the schedule.
