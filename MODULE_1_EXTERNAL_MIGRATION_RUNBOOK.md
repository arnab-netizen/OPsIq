# Module 1 External Migration Runbook

How to apply the Owner Recovery V1 migration to the real/staging Neon database
from a network-enabled environment (the Claude sandbox cannot — it blocks TCP
5432). No secrets appear in this file. Do not paste real DB URLs into chat or
commit them anywhere.

## 1. Current status

- **Module 1 (Owner Recovery V1): implemented and locally proven.** Code, the
  migration `prisma/migrations/20260610120000_owner_recovery_mode/migration.sql`,
  `/owner/recovery`, and `/api/owner/recovery/*` are in HEAD (commit `5fc46a0`);
  proven end-to-end against a local PostgreSQL in prior runs.
- **Migration env hardening: committed** (`46501f6`). `prisma.config.ts` now
  resolves the migration datasource as
  `MIGRATION_DATABASE_URL || DATABASE_URL || DATABASE_URL_TEST || local default`;
  `.env.example` documents the pooled-vs-direct convention; see
  `DB_MIGRATION_ENVIRONMENT_GUIDE.md`.
- **Claude sandbox: blocked on TCP 5432.** `prisma validate` passes and resolves
  the correct direct datasource, but `prisma migrate status`/`deploy` fail with
  `P1001` purely because outbound 5432 is blocked here (only 443 is open).
- **Real DB migration: still pending.** Must be run from an environment with
  5432 egress to Neon.

## 2. Security warning (do this first)

- The real Neon password was pasted into chat and is **exposed**. **Rotate the
  Neon database credential now** (Neon Console → roles/reset password) before any
  deployment attempt.
- Store the new value **only** in a secure environment / secrets manager
  (CI repository secret, Vercel env var, your shell's secret store).
- Never print env vars, never paste DB URLs in chat, never commit `.env.local`.

## 3. Required secret

- Variable: **`MIGRATION_DATABASE_URL`**
- Must be the Neon **direct (non-pooler)** URL.
- The host **must NOT contain `-pooler`** (e.g. `ep-xxxx.REGION.aws.neon.tech`,
  not `ep-xxxx-pooler.REGION.aws.neon.tech`).
- Include `?sslmode=require` (Neon). Keep it out of git and out of chat.

## 4. Local / network-enabled command path

Run from a machine/shell that can reach Neon on 5432 (set the secret in the shell
only; do not echo it):

```bash
export MIGRATION_DATABASE_URL="<rotated-neon-direct-non-pooler-url>"
npx prisma validate
npx prisma migrate status      # expect: 20260610120000_owner_recovery_mode pending
npx prisma migrate deploy      # applies it (additive: 6 tables, 8 FKs, 14 indexes)
npx prisma migrate status      # expect: "Database schema is up to date!"
```

## 5. CI / GitHub Actions path

1. Add `MIGRATION_DATABASE_URL` as a **repository secret** (Settings → Secrets and
   variables → Actions). Value = rotated direct non-pooler URL.
2. Run a manual workflow (`workflow_dispatch`) or a migration job **from a runner
   that can reach Neon on 5432** (GitHub-hosted runners have public egress).
3. Job steps (env: `MIGRATION_DATABASE_URL: ${{ secrets.MIGRATION_DATABASE_URL }}`):
   ```bash
   npx prisma validate
   npx prisma migrate status
   npx prisma migrate deploy
   ```
   Do not echo the secret; do not add it to logs. (Creating/modifying workflow
   files is out of scope for this runbook — this documents the required steps.)

## 6. Vercel / deploy-platform path

1. Add `MIGRATION_DATABASE_URL` as a **secure environment variable** (Project →
   Settings → Environment Variables), scoped to the appropriate environment.
2. Run the migration from an environment that permits **5432 egress** (a Vercel
   build/deploy step, a one-off job, or the platform's CLI from a networked host):
   ```bash
   npx prisma migrate deploy
   ```
3. Keep `DATABASE_URL` (runtime) as the **pooled** URL; only the migration step
   uses `MIGRATION_DATABASE_URL` (direct).

## 7. Explicitly forbidden commands / actions

- `npx prisma migrate reset` (DESTRUCTIVE — drops & recreates schema)
- `npx prisma db push` (bypasses migration history; can drop data)
- Manual `DROP` / `TRUNCATE` / schema reset
- Printing env vars / connection strings (e.g. `echo $MIGRATION_DATABASE_URL`)
- Committing `.env.local` or any real secret
- Pasting DB URLs/passwords into chat

## 8. Post-migration verification checklist

Read-only checks after `migrate deploy` (or via Neon SQL editor):

- [ ] `_prisma_migrations` contains `20260610120000_owner_recovery_mode`
      (`SELECT migration_name FROM _prisma_migrations WHERE migration_name='20260610120000_owner_recovery_mode';`)
- [ ] Six tables exist: `owner_businesses`, `owner_metric_snapshots`,
      `recovery_cycles`, `recovery_findings`, `recovery_actions`,
      `recovery_verifications`.
- [ ] Unique constraint on `owner_metric_snapshots(business_id, period_start, period_end)`.
- [ ] 8 foreign keys across the `owner_*`/`recovery_*` tables.
- [ ] Deployed app is on commit **`5fc46a0`** or later (build-info / deploy dashboard).
- [ ] `/owner/recovery` loads for an authorized owner (role `admin_or_portfolio_manager`
      → `OWNER_VIEW`/`OWNER_MANAGE`); unauth redirects to login; non-owner gets 403.
- [ ] One staging owner recovery cycle passes:
      business → snapshot → diagnosis → findings → actions → status update → after
      snapshot → before/after verification → dashboard → second linked cycle.
- [ ] Before/after verification passes (baseline/target/after compared; status set).
- [ ] Dashboard reflects finding, action, action status, verification status, metric movement.

## 9. Final status after run

- Migration succeeds but app/cycle proof not yet done →
  **`MODULE_1_DB_MIGRATED_APP_PROOF_PENDING`**
- Migration + one staging owner recovery cycle succeed →
  **`MODULE_1_DEPLOYED_AND_STAGING_PROVEN`**
- Migration + one real Tumbledry business cycle succeed →
  **`MODULE_1_DEPLOYED_AND_REAL_BUSINESS_PROVEN`**

Until one of the above is reached, **Module 2 remains blocked** and public/SaaS
work stays frozen.
