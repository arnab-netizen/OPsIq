# Owner Recovery Runtime Proof Report

Date: 2026-06-10
Branch: `claude/vibrant-ramanujan-mdqej8`
Baseline commit: `81b63eb`

## Executive Verdict

Status: **OWNER_MODE_PROVEN**

The owner-only recovery mode is now operationally proven end-to-end against a **real PostgreSQL 16 database** (started locally on `localhost:5432/opsiq_test`, matching `.env.test`). A real Prisma migration was generated and applied (the full 41-migration legacy chain + the new `owner_recovery_mode` migration → "Database schema is up to date"). Real persistence was proven by 8 DB-backed service tests and a 15-step service smoke (real `INSERT`/`SELECT`/`UPDATE`, verified by direct SQL). The HTTP layer was proven against a running production build: unauthenticated requests get **401**, non-owner roles get **403** on read and write, cross-workspace access gets **404**, and an authenticated owner can create a business → record an INR snapshot → run a diagnosis cycle → get evidence-backed findings → execute actions through a valid status machine → record a real before/after verification (`verified_improved`, baseline 30 → after 60) → see it reflected on the dashboard → run a second linked cycle. The only suite failures are 8 pre-existing `ops-endpoints-auth` tests that require a running server configured with `OPSIQ_DIAGNOSTIC_KEY`; proven unrelated by turning them green (16/16) once that env was supplied. Owner use on Tumbledry is proven at runtime; public subscription remains out of scope.

## Migration Status

PROVEN. Migration `prisma/migrations/20260610120000_owner_recovery_mode/migration.sql` created and applied.
- Generated via `prisma migrate diff` against the live DB (legacy chain pre-applied), then isolated to **owner-recovery objects only** (the diff also surfaced pre-existing schema↔migration drift on `approval_requests`/`operator_items`/`aggregate_locks`, which was deliberately excluded — see Remaining Gaps).
- Contents: 6 `CREATE TABLE` (`owner_businesses`, `owner_metric_snapshots`, `recovery_cycles`, `recovery_findings`, `recovery_actions`, `recovery_verifications`), 14 indexes (incl. unique `owner_metric_snapshots(business_id, period_start, period_end)`), 8 foreign keys (all internal to the owner-recovery graph).
- Applied with `prisma migrate deploy` → "Applying migration `20260610120000_owner_recovery_mode` … All migrations have been successfully applied."
- `prisma migrate status` → "42 migrations found … Database schema is up to date!"
- `prisma validate` → valid.
- Verified in DB: 6 tables, 8 FK constraints, unique index all present (`information_schema`/`pg_constraint`/`pg_indexes`).

## Database Runtime Proof

PROVEN. PostgreSQL 16.13 started locally (PG binaries + `postgres` system user present; Docker unusable). 8 DB-backed tests (`src/__tests__/founder-recovery/db-persistence.db.test.ts`, gated by `[db]` + `TEST_WITH_DB=true`) pass against it, asserting real rows (not mocks):
1. business persisted + read back, workspace-scoped
2. cycle: snapshot → findings → actions persisted (findings carry source metric/evidence/verification metric)
3. dashboard reflects persisted data + empty state
4. action status machine + before/after verification → `verified_improved` persisted
5. invalid transition rejected
6. second cycle linked to first (`previousCycleId`)
7. workspace isolation enforced
8. duplicate snapshot rejected

Direct SQL confirmation after the runs: `recovery_verifications` row = `repeatCustomerRatePct, baseline 30, after 60, verified_improved, movement 30`.

## API Runtime Proof

PROVEN against a running production build (`next start`) on the live DB:

| Check | Endpoint | Result |
|---|---|---|
| Unauthenticated rejected | GET `/api/owner/recovery/dashboard` | **401** "Please authenticate" |
| Unauthenticated write rejected | POST `/api/owner/recovery/businesses` | **401** |
| No OWNER_VIEW (viewer) rejected | GET `…/dashboard` | **403** "Insufficient permissions" |
| No OWNER_MANAGE (viewer) rejected | POST `…/businesses` | **403** |
| Cross-workspace rejected | GET `…/businesses/{otherWsBiz}` | **404** |
| Valid owner read | GET `…/dashboard` | **200** (empty state, then data) |
| Valid owner create business | POST `…/businesses` | **201** |
| Valid owner snapshot | POST `…/businesses/{id}/snapshots` | **201** |
| Valid owner run cycle | POST `…/businesses/{id}/cycles` | **201** (findings: DELIVERY_COST_LEAKAGE, HIGH_COST_RATIO, WEAK_REPEAT_RATE) |
| Action transitions | PATCH `…/actions/{id}` assigned→in_progress→completed | **200** ×3 |
| Invalid transition | PATCH proposed→completed | **400** (ValidationError) |
| Invalid payload | PATCH bad status enum | **400** |
| Verify outcome | POST `…/actions/{id}/verify` `{afterValue:60}` | **201** `verified_improved`, movement 30 |

Defect fixed during proof: invalid transitions previously returned **500**; `action.service.ts` now throws `ValidationError` → clean **400**. (Re-verified at runtime + DB test still 8/8.)

## UI Route and Nav Proof

PROVEN.
- `/owner/recovery` builds (in route table) and loads for an authenticated owner: **HTTP 200**, 17 KB, renders the "Owner Recovery" heading.
- Unauthenticated `/owner/recovery` → **307 redirect to `/login`**.
- Nav gating implemented (layout computes `OWNER_VIEW` from the user's effective capabilities → `AppShell` → `SidebarNav`): owner's `/dashboard` HTML contains "Owner Recovery" **1×**; viewer's contains it **0×**; both still show "Dashboard". So the sidebar entry is shown only to owner/internal (OWNER_VIEW) users.
- Empty state (no business/data) and populated state both proven via the dashboard API + DB tests.

## End-to-End Owner Recovery Smoke Result

PROVEN. `scripts/smoke-owner-recovery-runtime.ts` (service layer, refuses non-localhost DBs) → **PASS, 15/15 steps**: seed owner → create "Tumbledry Mukundapur Test" (INR) → period-1 snapshot → diagnosis cycle → findings (metric/evidence/threshold) → actions (owner/due/metric/target) → in_progress → complete with notes → period-2 snapshot → before/after verify (`verified_improved`, movement 30) → dashboard reflects verification → second cycle linked to first (WEAK_REPEAT_RATE resolved) → workspace ownership guard.

## Authorization and Workspace Isolation Proof

PROVEN three ways: (1) capability-policy unit tests — OWNER_VIEW/OWNER_MANAGE granted to `admin_or_portfolio_manager`/`system_admin`, denied to `client_owner`/`client_team_member`/`viewer`/`analyst`; route-declaration tests assert every recovery route enforces `requireWorkspace: true` + the correct OWNER capability. (2) Runtime HTTP — 401/403/404 as tabled above. (3) DB-backed service test — WS-B cannot read/list/dashboard WS-A's business. Workspace IDs are server-derived from membership (cannot be spoofed by the client).

## Dashboard Reflection Proof

PROVEN. `GET /api/owner/recovery/dashboard` (authenticated owner) returns persisted businesses, latest snapshot, latest cycle with findings + actions, overdue actions, and cycle history. Runtime check showed the completed action's verification surfaced: `repeatCustomerRatePct … verified_improved, baseline 30, after 60, movement 30`, with `hasData:true` and cycle history length 1. Empty state (`hasData:false`, no businesses) also returned correctly before any data.

## Before/After Verification Proof

PROVEN and real (not hardcoded). The new engine (`src/domain/founder-recovery/verification.ts`) compares baseline/target/after with direction-awareness and emits one of `unverified | verified_improved | verified_not_improved | inconclusive | disputed`. Unit tests cover improved (up/down), missed target, wrong-direction, missing after/baseline, disputed, and "equal = not improved". DB + HTTP runtime both produced a real `verified_improved` from baseline 30 → after 60 (target 40). This explicitly replaces the legacy `outcome/verification.ts` (which was hardcoded to confidence 0 / customer-reported) — the legacy file is untouched and unused by recovery mode.

## Closed-Loop Cycle Proof

PROVEN. Two linked cycles demonstrated at unit, DB, and smoke levels: cycle 2 carries `previousCycleId = cycle1.id`, uses cycle 1's snapshot for trend context (`revenueTrendPct` computed across cycles), and the WEAK_REPEAT_RATE/DELIVERY_COST_LEAKAGE findings from cycle 1 are resolved in cycle 2 after the improved snapshot. Cycle history is preserved and returned by the dashboard.

## Legacy / New Flow Separation

1. **Does `/owner/recovery` use only new recovery models?** YES — services touch only `ownerBusiness`, `ownerMetricSnapshot`, `recoveryCycle`, `recoveryFinding`, `recoveryAction`, `recoveryVerification`; the UI page calls only `/api/owner/recovery/*`. No `db.action`/`db.operatorItem`/`db.recommendation` usage.
2. **Can the old broken Action enum affect owner recovery?** NO — recovery uses its own `RecoveryAction` table + an explicit, tested status machine (`action-status.ts`). The legacy `actions` table and its enum are never referenced.
3. **Can the hardcoded old outcome verification affect owner recovery?** NO — recovery uses its own `verifyOutcome` + `RecoveryVerification` table. `src/services/outcome/verification.ts` is untouched and unimported by recovery code (grep-confirmed).
4. **Are public/customer dashboards still using broken legacy verification?** YES — the legacy decision/operator/owner-mode flows still use `outcome/verification.ts` and the legacy `Action` graph. These are outside owner-recovery scope and unchanged.
5. **Is any user-facing page mixing old and new data?** NO — `/owner/recovery` is a separate route/namespace; the legacy owner-mode dashboard (`/api/owner/dashboard`, no UI page) is independent. No page renders both.
6. **What must be repaired later?** (a) The pre-existing schema↔migration drift on `approval_requests`/`operator_items`/`aggregate_locks` (a baseline migration should be generated to reconcile it). (b) The legacy `Action` status-enum/route mismatch and hardcoded `outcome/verification.ts` for the consultant/public flow. (c) Reconcile the two legacy owner-dashboard services. All out of scope for this task.

## Commands Run

```
git status --short ; git branch --show-current ; git log -1 --oneline
# Local Postgres bring-up (PG16):
initdb -D /tmp/opsiq_pgdata -U postgres --auth=md5 --pwfile=...   # as postgres user
pg_ctl -D /tmp/opsiq_pgdata -o "-c listen_addresses=localhost -p 5432" start
psql -c "CREATE DATABASE opsiq_test;"
# Migration:
npx prisma migrate deploy                # applied 41 legacy migrations
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script   # generated SQL
npx prisma migrate deploy                # applied 20260610120000_owner_recovery_mode
npx prisma migrate status                # "Database schema is up to date!"
npx prisma validate                      # valid
# Tests:
npx vitest run src/__tests__/founder-recovery/                       # 33 (unit+authz)
TEST_WITH_DB=true npx vitest run src/__tests__/founder-recovery/db-persistence.db.test.ts   # 8 DB-backed
TEST_WITH_DB=true npx vitest run src/__tests__/founder-recovery/      # 46 total
DATABASE_URL=<local> npx tsx scripts/smoke-owner-recovery-runtime.ts # PASS 15/15
npm run build                            # Compiled successfully
npm test                                 # 5459 passed / 159 skipped / 8 failed (ops-auth only)
# HTTP runtime proof:
npm run start  (NODE_ENV=production, DATABASE_URL=<local>, OPSIQ_DIAGNOSTIC_KEY=test-key)
curl ... (401/403/404/200/201/400 as tabled)
npx vitest run src/__tests__/security/ops-endpoints-auth.test.ts     # 16/16 WITH server+key
```

## Passing Commands

- `npx prisma validate` ✓ valid
- `npx prisma migrate deploy` ✓ applied owner_recovery_mode
- `npx prisma migrate status` ✓ up to date (42 migrations)
- `npx vitest run src/__tests__/founder-recovery/` ✓ 33/33 (unit + authz)
- `TEST_WITH_DB=true npx vitest run src/__tests__/founder-recovery/` ✓ **46/46** (incl. 8 DB-backed)
- `npx tsx scripts/smoke-owner-recovery-runtime.ts` ✓ **PASS 15/15**
- `npm run build` ✓ compiled, all `/owner/recovery` routes + page present
- `npm test` ✓ **5459 passed**, 159 skipped
- HTTP runtime checks ✓ (401/403/404/200/201/400)
- `ops-endpoints-auth.test.ts` ✓ **16/16** when server + `OPSIQ_DIAGNOSTIC_KEY=test-key` present

## Failed / Blocked Commands

- `npm test` → **8 failed, all in `src/__tests__/security/ops-endpoints-auth.test.ts`** ("valid diagnostic key should be accepted" cases). Root cause (evidence, not assumption): the test uses `process.env.OPSIQ_DIAGNOSTIC_KEY || "test-key"` and expects the **server** to accept it, but the server process under a bare `npm test` is either not running (ECONNREFUSED) or running without `OPSIQ_DIAGNOSTIC_KEY`. The file has **0** references to owner/recovery/founder. **Proven unrelated**: with the server running and `OPSIQ_DIAGNOSTIC_KEY=test-key`, this file passes **16/16**.
  - Exact verification path:
    1. `OPSIQ_DIAGNOSTIC_KEY=test-key DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test npm run start`
    2. `npx vitest run src/__tests__/security/ops-endpoints-auth.test.ts`
- `docker` → unusable in this environment (used local PG binaries instead; not a blocker).
- No owner-recovery command is blocked. All owner-recovery proofs succeeded against the real DB.

## Remaining Gaps

1. The new migration was applied via `migrate deploy` against a freshly-bootstrapped local DB; it has **not** been run against the real Neon/staging database (would require those credentials). Command to apply there: `DATABASE_URL=<neon-direct-url> npx prisma migrate deploy`.
2. Pre-existing schema↔migration drift (`approval_requests`, `operator_items`, `aggregate_locks`) exists in the repo independent of this work; a reconciliation migration should be generated (out of scope; explicitly excluded from the owner-recovery migration to avoid destructive legacy changes).
3. Legacy consultant/public flows still use the broken `Action` enum and hardcoded `outcome/verification.ts` (untouched by design).
4. Snapshot editing (currently create-only) and richer assign-to-specific-user UI are minimal.
5. Public-subscription concerns (billing, multi-tenant hardening, onboarding) are not built.

## Can Owner Use This for Tumbledry Today?

**YES, PROVEN** — at the service, DB, and HTTP+UI runtime layers, against a real database, for a laundry/local-service business in INR, from intake → diagnosis → action → before/after verification → dashboard → repeated cycle. (Caveat: production deployment still needs the migration applied to the real database and a session/login for the human owner; the mechanism is proven, the production DB apply is the one remaining operational step.)

## Can This Be Sold as Subscription Now?

**NO, NOT PROVEN** — billing, public onboarding, demo/real separation, and multi-tenant hardening are explicitly out of scope and not built.

## Final Go / No-Go

1. Is `/owner/recovery` operationally proven? **YES, PROVEN**
2. Is migration ready? **YES, PROVEN** (created + applied locally; apply to prod DB is the one remaining step)
3. Is DB persistence proven? **YES, PROVEN**
4. Is API authorization proven? **YES, PROVEN** (401/403/404 at runtime)
5. Is UI access proven? **YES, PROVEN** (page loads for owner; nav gated; unauth redirected)
6. Is before/after verification proven? **YES, PROVEN**
7. Is closed loop proven? **YES, PROVEN**
8. Can founder use it seriously now? **YES, PROVEN** (pending prod-DB migration apply)
9. Can public customers use it now? **NO, NOT PROVEN**
10. Single next required action: **Apply the `owner_recovery_mode` migration to the real (Neon/staging) database** (`DATABASE_URL=<neon-direct-url> npx prisma migrate deploy`), then smoke `/owner/recovery` with a real owner login.
