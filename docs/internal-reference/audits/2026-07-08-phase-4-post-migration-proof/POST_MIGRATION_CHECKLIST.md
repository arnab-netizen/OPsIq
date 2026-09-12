# POST-MIGRATION PROOF CHECKLIST — production schema-drift remediation

> **Verification-only document.** This checklist prepares the exact sequence to run **after** the
> production migration is applied. **No migration has been run. No production database was touched.
> No secrets were read or changed.** Nothing here authorizes running the migration.

## 0. Required explicit approval phrase (HARD GATE)
The production migration must NOT be run by anyone/automation until the repository **owner** states,
verbatim:

> **"I approve running the production migration."**

Until that exact phrase is given, this remains verification-only. Any other wording (e.g. "go ahead",
"looks good", "approved") is **NOT** sufficient — the exact phrase is required to avoid ambiguity.

## 1. Pre-migration backup / snapshot check (MANDATORY)
- [ ] A fresh, restorable production snapshot/backup was taken immediately before the migration.
- [ ] Snapshot id / point-in-time / timestamp recorded: `__________________________`
- [ ] Restore path verified (you know how to roll back to this snapshot).

## 2. Confirm target environment
- [ ] Target is the intended **production** database (not staging/dev).
- [ ] Migration will use the production **DIRECT (non-pooler)** endpoint (per `DB_MIGRATION_ENVIRONMENT_GUIDE.md`).
- [ ] The direct URL is supplied via environment only; it is never printed/echoed/committed.

## 3. Confirm the migration
- [ ] Migration to apply: **`20260625120000_owner_mode_execution_tables`**.
- [ ] `npx prisma migrate status` (pre) shows it as **not yet applied**.
- [ ] Migration file re-inspected: additive only (`ADD COLUMN IF NOT EXISTS`, nullable/defaulted) +
      `CREATE TABLE`; **no** `DROP`, no `ALTER COLUMN ... TYPE`, no non-defaulted `NOT NULL` backfill,
      no data-moving statements.

## 4. Migration command (OWNER-RUN ONLY unless the approval phrase is given)
```
# OWNER-RUN ONLY — do NOT run in CI/automation, and NOT until the exact approval phrase is given.
# MIGRATION_DATABASE_URL = production DIRECT (non-pooler) endpoint, from env, never echoed.
npx prisma migrate deploy
```
- Never `prisma migrate dev` or `prisma migrate reset` against production.

## 5. Expected output / evidence to capture (no secrets)
- [ ] `prisma migrate deploy` output shows `20260625120000_owner_mode_execution_tables` applied,
      "All migrations have been successfully applied."
- [ ] `prisma migrate status` (post) shows the migration **applied**; no pending migrations.
- [ ] Capture command exit code (0) and the applied-migration line only (redact any URL/secret).

## 6. Post-migration smoke sequence (all must pass)
Run against the deployed production app (the `Smoke - Production Dashboard` script or equivalent):
- [ ] `GET /api/internal/build-info` → **200**, deployed commit matches expected.
- [ ] `POST /api/auth/login` (demo user) → **200**, session established.
- [ ] `GET /` (dashboard page) → **200**.
- [ ] `GET /api/internal/demo-permission-proof` → **200** with `classification: "permission_ready"`
      (or a legitimate permission state). **NOT** `schema_drift`, **NOT** 500. (This is the exact
      step that was drifting; it must now be healthy.)
- [ ] `GET /api/engagements` → **200** (policy path resolves; no membership/default-select 500).
- [ ] `GET /api/engagements/{id}/dashboard` and `/drift` → **200**.
- [ ] Membership / default-select read path healthy (no P2022 / ColumnNotFound anywhere).
- [ ] Unauthorized user still denied (bad credentials → 401; no session → denied). **No auth bypass.**
- [ ] `Smoke - Production Dashboard` workflow on `main` is **green end-to-end**.

## 7. Stop conditions (halt + restore)
Stop immediately, do NOT continue or patch, and restore from the snapshot (step 1) if any of:
- [ ] The migration command errors or is interrupted.
- [ ] `prisma migrate status` (post) does not show the migration applied.
- [ ] Any post-migration smoke step returns an unexpected 500.
- [ ] `demo-permission-proof` still returns `schema_drift` (or 500).
- [ ] Any auth/permission regression (authorized user blocked, or unauthorized user allowed).
- [ ] Any destructive statement is discovered in the migration.
Do NOT apply additional migrations or hand-patches to production without a **new, separate** approval.

## 8. Rollback / escalation plan
- Primary: the migration is additive, so the columns can safely remain. If policy requires rollback,
  **restore from the snapshot** (step 1) — do not hand-write `DROP COLUMN` against production.
- Escalation: if restore is needed or smoke fails post-restore, notify the owner immediately with the
  captured evidence (status codes + classifications, no secrets) and stop.

## 8b. Evidence capture template (fill in during/after the OWNER-RUN migration — no secrets)
Capture the following as the migration record (redact any connection string / token / password):

```
run_timestamp_utc:        __________________________   (ISO 8601, e.g. 2026-07-09T14:03:00Z)
actor:                    __________________________   (who ran it — owner / authorized operator)
environment:              production
deployment_commit_sha:    __________________________   (from GET /api/internal/build-info)
approval_phrase_recorded: __________________________   ("I approve running the production migration")
snapshot_id_or_timestamp: __________________________   (from §1)
migration_status_pre:     __________________________   (prisma migrate status BEFORE — expect 20260625120000 pending)
migration_command_output: __________________________   (applied-migration line + exit code; NO url/secret)
migration_status_post:    __________________________   (prisma migrate status AFTER — expect applied, 0 pending)
smoke_build_info:         __________________________   (status; deployed commit match yes/no)
smoke_login:              __________________________   (status; expect 200)
smoke_dashboard_root:     __________________________   (status; expect 200)
smoke_demo_permission:    __________________________   (status + classification; expect 200 / permission_ready — NOT schema_drift, NOT 500)
smoke_engagements:        __________________________   (status; expect 200)
smoke_engagement_dash:    __________________________   (status; expect 200)
smoke_unauthorized:       __________________________   (expect denied / 401; no auth bypass)
smoke_workflow_result:    __________________________   (Smoke - Production Dashboard on main: green / red)
final_health:             __________________________   (HEALTHY | BLOCKED | FAILED — per §9)
stop_condition_hit:       __________________________   (none | which one, and action taken)
```
Save the completed record into a new run entry (do not overwrite this template).

## 9. Final production-health classification criteria
Declare production **HEALTHY** only when ALL are true:
- [ ] `20260625120000_owner_mode_execution_tables` is applied (migrate status).
- [ ] Every step in §6 passed.
- [ ] `Smoke - Production Dashboard` is green end-to-end.
- [ ] No auth bypass; unauthorized still denied.
Otherwise classify **BLOCKED** (environment) or **FAILED** (regression) with the captured evidence,
and follow §7 / §8.
