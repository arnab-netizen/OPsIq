# Least-privilege runtime role (`opsiq_app`) — design, tooling and cutover

Status: implemented, NOT applied to Production. Applying it, changing Vercel variables and rotating the owner credential are separate, owner-authorized steps. Production QBO stays disabled.

## 1. Roles

| Role | Purpose | Attributes | Used by |
|---|---|---|---|
| `neondb_owner` (migrator) | schema owner, migrations only | existing | `migrate-production.yml` (`PRODUCTION_DATABASE_URL` secret), operator cutover tool (`OWNER_DATABASE_URL`) |
| `opsiq_app` (runtime) | the web/runtime connection | LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; owns nothing; CONNECT; schema USAGE; no CREATE | Vercel Production `DATABASE_URL` (pooled) |
| `opsiq_privacy_eraser` | governed-erasure group | NOLOGIN; no members except the owner until an authorized operator is added | erasure operators (none exist yet — none are created) |

Roles are created with SQL only (the tool), never through the Neon console/API (those inherit `neon_superuser`). The tool never handles a password: set it out of band (`\password opsiq_app` in psql against the DIRECT endpoint), then build the pooled URL.

## 2. Runtime DB access matrix (audited; `RUNTIME_OWNER_DEPENDENCIES=0`)

| RUNTIME_PATH | REQUIRED_DB_PRIVILEGES | OWNER_PRIVILEGE_REQUIRED? |
|---|---|---|
| Prisma reads/writes (every modelled table) | SELECT/INSERT/UPDATE/DELETE | NO |
| Auth/session (`sessions`, `users`) incl. raw pooled queries | SELECT/INSERT/UPDATE/DELETE | NO |
| Finance / Cashflow / owner modules | DML on their tables | NO |
| Scheduler (`scheduled_tasks`) enqueue/claim/update | DML | NO |
| QBO connection/token/state/snapshot persistence | DML | NO |
| Audit writes (`audit_events`, hash chain, append-only guards) | INSERT/SELECT (+ UPDATE where the model allows) | NO |
| Rate limiter (`rate_limit_buckets`), idempotency | DML | NO |
| Serial/identity columns | sequence USAGE, SELECT | NO |
| Migration-status / health check (`_prisma_migrations`) | SELECT only | NO |
| `qbo_erasure_authorized()` inside guard triggers | EXECUTE (returns false for the runtime) | NO |
| Erasure ledger `privacy_erasure_requests` | none (denied) | n/a — eraser path only |
| DDL, TRUNCATE, GRANT, SET ROLE, `session_replication_role`, extensions | none | owner/migrator path only |

A static test fails if any non-test runtime SQL literal contains DDL/TRUNCATE/GRANT/SET ROLE/etc.

## 3. Tool: `scripts/db/opsiq-role-cutover.ts`

```
OWNER_DATABASE_URL=<owner direct url> npx tsx scripts/db/opsiq-role-cutover.ts <command> --target <local|ci|test|staging|production> [options]
  plan                      print the exact SQL (no connection)                              ROLE_TOPOLOGY_PLAN=READY
  apply [--dry-run]         one transaction: apply, verify INSIDE it, commit only on PASS    ROLE_TOPOLOGY_APPLY=PASS|FAIL
  apply --only-if-present   reconcile grants only if the role exists; never creates it      ROLE_TOPOLOGY_APPLY=SKIPPED_ROLE_ABSENT
  verify [--phase pre|post] read-only catalog checks                                         ROLE_TOPOLOGY_VERIFY=PASS|FAIL
                                                         (production also emits PRODUCTION_RUNTIME_ROLE_VERIFY=PASS|FAIL)
  probe                     connect AS the runtime login (OPSIQ_RUNTIME_PROBE_DATABASE_URL); allowed + denied statements, always rolled back
```

* Production needs `OPSIQ_DB_TARGET=production`, `OPSIQ_ALLOW_PRODUCTION_DB_COMMAND=true`, a known production DIRECT endpoint, `--expected-host <exact host>`, and for a non-dry-run apply `--confirm "APPLY PRODUCTION RUNTIME ROLE TOPOLOGY"`. After connecting, the database's own Neon identity must also be production. A non-production label on a production database (or the reverse) is refused.
* It never reads `DATABASE_URL`/`MIGRATION_DATABASE_URL`, never rotates the owner password, never touches Vercel, and prints only sanitized results.
* Grants are RECONCILED (deterministic), not inherited: no `ALTER DEFAULT PRIVILEGES … TO opsiq_app`. A table created by a later migration is denied to the runtime until the reconcile runs, so a future governance table can never be silently exposed. Runtime DML is limited to Prisma-modelled tables (parsed from `prisma/schema.prisma`) minus `privacy_erasure_requests`; `_prisma_migrations` is SELECT-only.
* After EVERY production migration that adds a table: run `apply --only-if-present` (owner URL, expected host, confirm), then redeploy. The release gate enforces this (see §5).

## 4. SECURITY DEFINER hardening

The only definer function is `qbo_erasure_authorized(uuid, uuid)`: owned by the migrator; `SET search_path = pg_catalog, public, pg_temp` (pg_temp last); catalog and table references schema-qualified; identity from `session_user` (a definer's `current_user` is the owner); no dynamic SQL; fail-closed on every branch; EXECUTE revoked from PUBLIC, granted to the runtime (it returns false for it) and the eraser group; PUBLIC and the runtime cannot CREATE in `public`, so nothing can shadow a searched name. A test fails if a new SECURITY DEFINER function appears without the same properties.

## 5. Credential separation (fail closed)

* Runtime `DATABASE_URL` = `opsiq_app`, pooled. The migrator URL exists only as the GitHub secret `PRODUCTION_DATABASE_URL` and the operator's `OWNER_DATABASE_URL`; Prisma CLI only honours `MIGRATION_DATABASE_URL` under the production two-factor opt-in (`src/infra/prisma-datasource.ts`); no runtime code reads any of them (static test).
* Release gate (`npm run build`, Production builds): BLOCKS if `MIGRATION_DATABASE_URL`, `OWNER_DATABASE_URL`, `PRODUCTION_DATABASE_URL` or `OPSIQ_RUNTIME_PROBE_DATABASE_URL` is present in the build environment. When `OPSIQ_REQUIRE_RUNTIME_ROLE=opsiq_app` is set (at cutover step 3b) it additionally requires `DATABASE_URL` to authenticate as that role, hold no dangerous attribute, and be able to read every application table except the erasure ledger.
* Verified read-only on 2026-10-27: Vercel Production has only `DATABASE_URL` (+ unrelated `OPSIQ_PRIVATE_OWNER_USER_ID`); there is no Development-target `DATABASE_URL`; Preview has a generic `DATABASE_URL` plus four stale branch-scoped ones. Preview/Development must never use the Production database or an owner credential: compare HOSTNAMES only before the cutover.

## 6. Cutover and rollback sequence (owner-authorized; none executed here)

1. Keep the current owner runtime URL available as `OLD_RUNTIME_URL` (saved by the owner; not rotated).
2. With the owner URL (direct endpoint): `verify --phase pre`, `apply --dry-run`, then `apply --confirm "…"`; set the `opsiq_app` password via `\password`; `verify --phase post` → `PRODUCTION_RUNTIME_ROLE_VERIFY=PASS`; `probe` as `opsiq_app` → `ROLE_TOPOLOGY_PROBE=PASS`.
3. Set Vercel Production `DATABASE_URL` to the `opsiq_app` POOLED URL. 3b: add `OPSIQ_REQUIRE_RUNTIME_ROLE=opsiq_app` (build-time guard).
4. Deploy the SAME main commit (no code change).
5. Health + authenticated smoke (login, owner business load, Finance/Cashflow read+write, an action, scheduler tick, migration status).
6. Observe runtime logs for `permission denied` / `42501` for the agreed window.
7. On any failure: restore `OLD_RUNTIME_URL` as `DATABASE_URL`, remove `OPSIQ_REQUIRE_RUNTIME_ROLE`, redeploy.
8. Fix the missing NARROW grant in code (never `GRANT ALL`, never owner membership), re-test on a disposable database.
9. Retry from step 2 (idempotent).
10. Only after a stable observation period, rotate/revoke the old owner runtime credential (separately authorized; not part of this change).
