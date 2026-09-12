# MIGRATION RUNBOOK — production schema-drift remediation (OWNER-RUN ONLY)

> ⚠️ **OWNER-RUN ONLY.** No step in this runbook has been executed. No production database
> was touched, no migration was run, no secrets were read or changed. Automation and CI must
> NEVER run these commands. Only the owner (or an authorized operator the owner designates),
> after reviewing this runbook, may execute the migration step.

## 1. Suspected missing migration
- **`20260625120000_owner_mode_execution_tables`**

## 2. Why it is suspected
- Phase 3 confirmed, against a real database, that a default-select read of `workspace_memberships`
  throws Prisma **`P2022`** (PostgreSQL `42703`, `ColumnNotFound`) when a newer column is absent.
- The production dashboard smoke on `725998a4` shows: `POST /api/auth/login` → **200** (Phase 3
  login fix works), then `GET /api/internal/demo-permission-proof` → **500**. That endpoint's
  membership read is a default select; the deployed database is missing at least one column that
  migration `20260625120000_owner_mode_execution_tables` adds.
- That migration **is present in the repository** (`prisma/migrations/20260625120000_owner_mode_execution_tables/migration.sql`)
  but the deployed database has not had it applied (deploy/migration drift).

## 3. Exact code paths that fail without it
Default-select `workspace_memberships` reads (they select every column, so a missing column throws):
- `src/app/api/internal/demo-permission-proof/route.ts` (the smoke's current failing step)
- `src/services/auth.ts` `getPolicyContext` (policy path behind `/api/engagements`)
- `src/app/api/internal/demo-engagement-proof/route.ts`, other internal proof endpoints
- (Owner login `src/app/api/auth/login/route.ts` was already hardened in Phase 3 to select only `workspaceId`.)

The columns the migration adds to `workspace_memberships` (all nullable / defaulted):
`accepted_at, allowed_task_types, authority_limits, created_by_owner_id, designation,
invitation_status, invited_at, manager_id, offboarded_at, primary_auth_method, suspended_at`
(plus new tables — see the migration file).

## 4. Pre-migration checks (owner)
1. Confirm the target is the intended **production** database (not staging/dev). Verify the host in
   the deploy environment's `MIGRATION_DATABASE_URL` / `DIRECT_DATABASE_URL` (Neon **direct**,
   non-pooler endpoint — see `DB_MIGRATION_ENVIRONMENT_GUIDE.md`).
2. Confirm current applied state: `npx prisma migrate status` against the production **direct** URL.
   Expect `20260625120000_owner_mode_execution_tables` to be listed as **not yet applied**.
3. Confirm the repo migration file is unchanged from what CI validated (no local edits).
4. Confirm a maintenance/notification window if your change-management process requires one.

## 5. Backup / snapshot requirement (MANDATORY before running)
- Take a fresh production database snapshot/backup immediately before the migration
  (e.g. Neon branch/point-in-time restore point, or `pg_dump`). Record the snapshot id/timestamp.
- Do not proceed without a verified, restorable snapshot.

## 6. Destructive classification
- **NON-DESTRUCTIVE / ADDITIVE / IDEMPOTENT.** The migration is `ADD COLUMN IF NOT EXISTS` (nullable
  or defaulted) plus `CREATE TABLE` for new tables. It drops nothing, alters no existing column type,
  and re-running it is safe (`IF NOT EXISTS`). No data loss expected.
- Verify this yourself before running: inspect
  `prisma/migrations/20260625120000_owner_mode_execution_tables/migration.sql` and confirm there are
  no `DROP`, `ALTER COLUMN ... TYPE`, `NOT NULL` back-fills without defaults, or data-moving statements.

## 7. Migration command (OWNER-RUN ONLY)
Run against the production **direct** (non-pooler) URL. Do NOT print the URL or any secret to logs.
```
# OWNER-RUN ONLY — do not run in CI/automation.
# MIGRATION_DATABASE_URL must be the production DIRECT (non-pooler) endpoint, supplied
# via the environment, never hardcoded or echoed.
npx prisma migrate deploy
```
- `prisma migrate deploy` applies only pending migrations and never resets or drops.
- Do NOT use `prisma migrate dev` or `prisma migrate reset` against production.

## 8. Rollback strategy
- Because the migration is additive, the primary "rollback" is to leave the new columns in place
  (they are nullable/defaulted and harmless to existing code).
- If a rollback is nonetheless required by policy, restore from the snapshot taken in step 5.
- Do NOT hand-write `DROP COLUMN` statements against production; prefer snapshot restore.

## 9. Post-migration smoke checks (must all pass before declaring healthy)
Run the production dashboard smoke (or the equivalent manual sequence) against the deployed app:
1. `GET /api/internal/build-info` → 200, deployed commit matches.
2. `POST /api/auth/login` (demo user) → **200**, session established.
3. `GET /` → 200.
4. `GET /api/internal/demo-permission-proof` → **200** with `classification: "permission_ready"`
   (or a legitimate permission state) — **NOT** `schema_drift`, **NOT** 500.
5. `GET /api/engagements` → 200 (policy path resolves; no membership/default-select 500).
6. `GET /api/engagements/{id}/dashboard` and `/drift` → 200.
7. Unauthorized user still denied; no auth bypass.
See `POST_MIGRATION_CHECKLIST.md` (Phase 4 Item 2) for the full evidence template.

## 10. Stop conditions
- Stop immediately and restore from snapshot if: the migration errors, any post-migration smoke step
  returns an unexpected 500, `demo-permission-proof` still returns `schema_drift`, an auth/permission
  regression appears, or any destructive statement is detected in the migration.
- Do NOT apply additional migrations or hand-patches to production without a new, separate approval.

## 11. Who must approve
- The repository **owner** must explicitly approve running the migration ("I approve running the
  production migration") after reviewing this runbook. Automation/CI/agents must not self-authorize.

## 12. Proof required before marking production healthy
- `prisma migrate status` shows `20260625120000_owner_mode_execution_tables` **applied**.
- All post-migration smoke checks (§9) pass, captured as evidence (status codes + classifications,
  no secrets) per `POST_MIGRATION_CHECKLIST.md`.
- The `Smoke - Production Dashboard` workflow on `main` goes green end-to-end.
