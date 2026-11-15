# Production Release Procedure (authoritative)

This is the single source of truth for releasing OpsIQ to production, including releases that
carry Prisma migrations. Older documents (`docs/DEPLOYMENT_RUNBOOK.md` Step 3,
`docs/deployment/owner-self-use/OWNER_SELF_USE_DEPLOY_RUNBOOK.md` §4) defer to this one for
production migrations.

## Why this exists (incident, 2026-09-25)

Merge `58f1d87e` added migration `20260925120000_add_verification_baseline_provenance`.
Vercel's Git integration built and **promoted** the merge commit to production immediately.
Production migrations only run through the manual, owner-approved
`Migrate Production Database` workflow, which had not run yet. Vercel reported the deployment
READY while the application's startup check reported
`FAILED — Migration history is not current: 1 pending`, and code reading the new columns
would have failed until the workflow ran. Nothing in the release path connected
"this commit needs a migration" to "production has applied it".

## The invariant

> Production application code that requires unapplied database migrations is never promoted
> into production. Production migrations stay explicitly approved, run only through the
> approved workflow, and never run automatically.

## How it is enforced

| Layer | Mechanism | Blocks? |
|---|---|---|
| PR | `ci.yml` › build-and-test › **Production migration release signal** (`scripts/release/migration-release-signal.mjs`) diffs `prisma/migrations/**` against the PR base. It reports `PRODUCTION MIGRATION REQUIRED` with each migration's name and whether it is additive or potentially destructive. | Blocks merge (required job) for: an existing migration modified or deleted, `migration_lock.toml` changed, a bad or out-of-order name, or a potentially destructive migration without the acknowledgement line. **Adding** a migration does not block merge; it is reported. |
| Production build | `npm run build` = `node scripts/release/production-migration-gate.mjs && next build`. On a Vercel **production** build (`VERCEL_ENV=production`), the gate reads production's `_prisma_migrations` (one read-only `SELECT`, using the production `DATABASE_URL` Vercel injects) and compares it with the commit's `prisma/migrations`. | **Fails the build** if any committed migration is pending, any migration row is failed, in progress or rolled back, or an applied migration's file changed after it was applied. It also fails closed if the database or the migrations directory can't be read. A failed build is never promoted; production keeps serving the last good deployment. Preview, CI and local builds are not gated. |
| Migration | `.github/workflows/migrate-production.yml` (manual `workflow_dispatch`, `production` environment) | Unchanged safeguards: the confirmation phrase; an exact, owner-pinned DB host (checked before anything touches the database); a direct, non-pooler URL; exactly one pending migration, and it must be the named one; no failed migrations; `prisma migrate deploy` only (no seed or reset); post-deploy status check; `concurrency: migrate-production` (no parallel runs). **New:** after a successful, post-verified MAIN-mode run it asks Vercel to redeploy `main` through the optional `VERCEL_PRODUCTION_DEPLOY_HOOK_URL` secret, so the build gate re-checks and promotes. |
| Runtime | Startup check (`src/services/monitoring/migration-check.ts`) and `/api/readiness` (503) | Unchanged, and a last line of defence. The build gate applies the same failed and pending rules, so a build that passes the gate cannot boot into "Migration history is not current". |

## Normal release (no migration)

1. PR → CI green. The migration signal says "no production migration required".
2. Merge to `main` (owner authorization at an exact SHA, per `CLAUDE.md`).
3. Vercel builds `main`. The gate finds every committed migration applied and passes (`[release-gate] PASS: MIGRATIONS_CURRENT`). The build is promoted as before.

No extra manual step.

## Release with a migration

1. **PR.** The signal step shows **PRODUCTION MIGRATION REQUIRED** with the migration names and their class. Write migrations as *expand* steps (see below). Merge **at most one migration PR between production migrations**: the approved workflow applies exactly one pending migration per run.
2. **Merge** to `main`.
3. **Vercel production build of the merge commit is refused** by the gate (`BLOCKED: PRODUCTION_MIGRATION_REQUIRED`, listing the migration). Production keeps serving the previous deployment. This is expected and is not an outage. The Vercel deployment and the `main` commit status show the failure.
4. **Run the migration.** Actions → *Migrate Production Database* → Run workflow on `main`:
   - environment `production`, mode `MAIN`, confirm `MIGRATE PRODUCTION`
   - `migration_name` = the exact folder name from step 1
   - `expected_database_host` = the verified production DB hostname (bare hostname, taken from the authoritative production configuration)
5. **Promotion.** If the `VERCEL_PRODUCTION_DEPLOY_HOOK_URL` secret is configured, the workflow redeploys `main` itself. Otherwise open Vercel → the refused production deployment of `main` → **Redeploy**. The gate re-checks, passes, and the release is promoted.
6. **Verify.** `/api/startup` shows `migration_pending: 0`, `migration_failed: 0`, `startup_status: READY`. `/api/readiness` returns 200. The Vercel production deployment is the intended `main` SHA.

To configure the optional hook (one-time, owner): create a Vercel Deploy Hook for branch `main` and store its URL as the GitHub secret `VERCEL_PRODUCTION_DEPLOY_HOOK_URL` (repository or `production` environment). The URL is a secret; never paste it anywhere else.

## Writing migrations: expand / contract

Production runs the **previous** application version against the **new** schema between step 4 and step 5, and again after any rollback. Every migration must therefore be compatible with the code already in production:

- **Additive (expand), safe:** new tables, new nullable columns, columns with a default, new indexes, new enum values.
- **Potentially destructive (contract), needs two releases:** `DROP` of a table, column or constraint; `RENAME`; column type changes; `SET NOT NULL` on an existing column; `ADD COLUMN … NOT NULL` without a default; `UPDATE`/`DELETE` backfills; `TRUNCATE`; enum value rename or drop.
  1. Release A (expand): add the new shape and ship code that no longer depends on the old shape.
  2. Release B (contract), only after A is fully live: remove or tighten the old shape. The migration file must contain the line `-- opsiq-migration: destructive-approved` plus a comment giving the reason and naming release A. Without that line CI blocks the PR.
- **Never edit or delete a migration that exists on `main`.** CI blocks it. Add a new migration instead.

## Failed migration

If the workflow reports a failed or uncertain migration, or the build gate says `FAILED_MIGRATION_PRESENT`:

- **Do not** re-run the workflow blindly, redeploy, or hand-edit `_prisma_migrations`.
- **Do not** run `prisma migrate deploy` or `db push` from a laptop against production.
- Production keeps serving the last good deployment: the gate refuses new builds while a failed row exists.
- Inspect the workflow log (`migration-status-after.txt`) and fix the cause. Resolving the row (`prisma migrate resolve --applied|--rolled-back <name>`) needs owner authorization. Note that **any** row left with `rolled_back_at` set, or with no `finished_at`, keeps both the runtime startup check and this build gate failing, even after the migration is later re-applied under the same name. So a rolled-back resolution also needs an owner decision on that history row before production can be promoted again. Then re-run the workflow and redeploy.

## Rollback

- **Vercel Instant Rollback** re-promotes an older build without rebuilding (the gate does not run). The older code then runs on the newer schema:
  - **After an additive migration: safe.** Older code ignores new nullable or default columns and new tables.
  - **After a contract (destructive) migration: NOT safe.** Older code may read a dropped or renamed column. Destructive changes go through expand/contract precisely so that rollback targets never depend on removed shapes. Do not roll back past a contract release. Roll forward with a fix instead.
- **Schema rollback** (reverting a migration) is never automatic. Write a new forward migration and follow the migration release procedure.
- **Redeploying an older commit** (a rebuild) passes the gate. The gate reports "production has N applied migration(s) newer than this commit" and doesn't block, because the older code is expected to be compatible (expand/contract).

## Emergency: what is production running?

| Question | Where |
|---|---|
| Production deployment and SHA | Vercel → project `o-ps-iq` → Deployments → filter Production (the current one is marked *Current*). Or the `main` commit status "Vercel". |
| Why a production build was refused | That deployment's build log: lines starting with `[release-gate]`. |
| Migration state | `GET /api/startup` → `migration_pending`, `migration_failed`, `startup_status`. Authoritative: the last *Migrate Production Database* run summary (post-deploy `prisma migrate status`). |
| Readiness | `GET /api/readiness` (200 means ready, 503 means not ready, with `startup_status`) and `GET /api/health`. |
| Run a gate dry-run by hand | Only from an owner-controlled shell holding the production `DATABASE_URL`: `OPSIQ_RELEASE_GATE_FORCE=1 node scripts/release/production-migration-gate.mjs`. It is read-only and prints no connection details. |

## Known limitations

- The build gate only runs when Vercel builds. `vercel deploy --prebuilt --prod` from a machine that built without `VERCEL_ENV=production` would skip it. That needs deliberate team credentials; don't do it.
- Instant Rollback and re-promotion of an existing production deployment don't rebuild, so they aren't gated. This is by design, and safe under expand/contract.
- The approved workflow applies exactly one migration per run. With two migrations pending it refuses (fail closed). Avoid this by merging one migration PR at a time. Clearing it requires an owner decision (for example a workflow change to name several migrations).
- The destructive-SQL classification is a conservative pattern scan, not a SQL parser. The acknowledgement line is an explicit human assertion, not a proof.
- A skipped Vercel build (`vercel.json` `ignoreCommand` skips governance-only commits) doesn't promote anything. If the deploy hook's build of `main` is skipped this way, redeploy the last runtime commit in Vercel manually.
- The gate trusts the production `DATABASE_URL` configured in Vercel, which is the same database the deployment will use. Host pinning for **mutations** remains the job of the migration workflow's `expected_database_host`.
