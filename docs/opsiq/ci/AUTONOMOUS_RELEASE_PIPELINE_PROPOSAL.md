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
1. Verbatim origin guard -> checkout `main` -> release SHA = main HEAD, which must equal `GITHUB_SHA` -> required CI (`branch-protection`) already green at that exact SHA, else no-op.
2. Production identity: repository variable `PRODUCTION_DATABASE_HOST` (bare direct host; unset = fail closed), the operator URL's host, and the database's own identity.
3. Ledger plan (`release-plan-cli.ts`, explicit `BEGIN READ ONLY`): NOOP / MIGRATE / BLOCK. BLOCK or any error fails the run before any write.
4. **Phase 2 (implemented, untested on GitHub):** MIGRATE with every pending migration allowlisted, in ascending order, applies ONLY when a verified encrypted backup succeeded within 36 h (the backup workflow has never succeeded, so this is currently REFUSED by design), then the ledger must be NOOP. Destructive/incompatible/unknown/out-of-order/failed/modified states never auto-apply. The allowlist is a policy filter, not a compatibility proof.
5. Runtime-role reconcile + strict gate in drift mode (conforming role: no write, no lock).
6. **Exact-SHA release:** fast-forward-only advance of the `release/production` branch to this SHA, after a durable attempt ref `refs/release-attempts/<sha>/<epochMs>` is written (max 3 per SHA per 24 h; refills as attempts age out; independent of any provider record). Retrying the same SHA uses the optional deploy hook bound to that branch.
7. **Acceptance:** the public site's `/api/health` (approved origins only, redirects refused) must report HTTP 200, database healthy and `commit` equal to the release SHA (needs the `/api/health` commit field, PR #687). Build success, a deployment record and a deploy-hook 200 are NOT acceptance.

## Why a release branch (smallest exact-SHA mechanism, researched in Vercel's documentation)
- A Vercel deploy hook is bound to a Git BRANCH, not a SHA: it deploys the branch tip. A REST create-deployment with `gitSource.sha` or a redeploy needs a Vercel bearer token, which cannot be limited to one project or endpoint: too broad.
- Making `release/production` the project's Production Branch means a push (including a `GITHUB_TOKEN` push, which still reaches Vercel's GitHub App) builds exactly that commit as Production. The request is bound to the SHA, no Vercel credential is needed, pushes to `main` stop causing premature production builds (previews only), and the existing migration/role release gate still runs as defence in depth.
- One-time, owner-approved Vercel change: Project Settings -> Environments -> Production -> Branch Tracking = `release/production`, plus a deploy hook for that branch (`VERCEL_PRODUCTION_DEPLOY_HOOK_URL`). Until it is made the advance only creates previews and acceptance times out safely.

## Continuity (scheduled runs can be delayed or dropped)
`docs/opsiq/ci/proposed/release-watchdog.yml.draft`: an UNPRIVILEGED watchdog (no secrets, no environment) that opens/updates one GitHub issue when the last SUCCESS of the reconcile is older than 4 h and closes it on the next success.

## New privileged execution paths (everything a reviewer must check)
- Scheduled trigger of a job in `production-operator` using only `OPERATOR_DATABASE_URL` and the optional branch deploy hook.
- `contents: write` for that job: it can fast-forward `release/production` and create `refs/release-attempts/*`. `main` is protected by the ruleset (no bypass actors), so the token cannot write it.
- Phase 2: `prisma migrate deploy` on production, reachable only through `auto-migrate-cli.mjs` after the pure decision allows it.
- Runtime-role reconcile through the existing gate (drift only).
- `GITHUB_TOKEN`: `checks: read`, `deployments: read`, `contents: write` (above).

## Known limits (stated, not hidden)
- Never executed on GitHub. A supervised first run (manual dispatch) and an end-to-end rehearsal are required before any autonomy claim.
- Whether `production-operator` requires a reviewer for scheduled runs is unknown from this session (the proxy refuses the environments API). If it does, runs wait for approval and the pipeline is NOT autonomous.
- Needs `PRODUCTION_DATABASE_HOST` (non-secret variable) and the Vercel Production Branch change above.
- Phase 2 is refused until the encrypted backup workflow has produced a success.
