# Owner Recovery Runtime Proof Plan

Date: 2026-06-10
Branch: `claude/vibrant-ramanujan-mdqej8`
Baseline commit: `81b63eb`

## Baseline (Phase 0) results

- `git status --short`: V1 owner-recovery changes present, uncommitted (per prior task's no-commit rule).
- `npx prisma validate`: **valid**.
- `npx vitest run src/__tests__/founder-recovery/`: **7 files, 33 tests passed** (note: the task wrote `src/tests/founder-recovery/`; the actual path is `src/__tests__/founder-recovery/`).
- Prior reports read: `OWNER_MODE_RECONCILIATION_REPORT.md`, `OWNER_ONLY_MODE_IMPLEMENTATION_PLAN.md`, `OWNER_ONLY_END_TO_END_MODE_IMPLEMENTATION_REPORT.md`.
- **Environment change vs prior task:** a real PostgreSQL 16 server has been started locally on `localhost:5432` (db `opsiq_test`, user `postgres/postgres`, matching `.env.test`). PG16 binaries + the `postgres` system user are present; Docker is NOT usable. This means DB-backed proof is now **possible** in this session (it was BLOCKED before).

## What remains unproven (and the plan to prove each)

### 1. Migration status — UNPROVEN → provable now
The 6 new models exist in `schema.prisma` and validate, but no migration file exists. Plan: with the live DB, run `prisma migrate dev --name owner_recovery_mode` (repo uses timestamped SQL migrations under `prisma/migrations/`). Verify the generated SQL contains the 6 tables + indexes + unique constraint. Fallback if `migrate dev` is unsafe: `prisma migrate diff` to emit SQL, or `db push` for runtime proof.

### 2. Database availability — RESOLVED for this session
Live Postgres running. Will be documented with exact start commands so it is reproducible. If it had been unavailable, the report would mark all DB items BLOCKED_BY_ENVIRONMENT with the exact command to run once a DB exists.

### 3. API runtime proof — UNPROVEN
Routes build but were never executed. Plan: prefer service-layer DB proof (deterministic, no server). For HTTP-level auth, the repo's route tests rely on the canonical enforcement wrapper; full HTTP requires a running Next server. Plan: (a) unit-test the authorization wiring (capability map) deterministically; (b) document the exact server-required command path for live HTTP.

### 4. UI route proof — PARTIAL
`/owner/recovery` builds. Plan: confirm build output includes the page; verify empty-state vs data-state logic; provide manual verification steps (no headless browser harness in repo for authenticated pages).

### 5. Authorization proof — UNPROVEN
Plan: prove via the capability policy (`getCapabilitiesForRole`) that OWNER_VIEW/OWNER_MANAGE gate reads/writes and that `client_team_member`/`viewer` lack them; prove route wrappers declare the right capabilities (static assertion test).

### 6. Workspace isolation proof — UNPROVEN → provable now
Plan: DB-backed test — create two workspaces, create a business in WS-A, assert WS-B queries (service layer, scoped by workspaceId) cannot read/update it (NotFound).

### 7. Dashboard data proof — UNPROVEN → provable now
Plan: DB-backed test — after creating business+snapshot+cycle, call `getRecoveryDashboard` and assert it returns persisted findings/actions/verification, plus the empty state when none exist.

### 8. End-to-end owner recovery cycle proof — UNPROVEN → provable now
Plan: `scripts/smoke-owner-recovery-runtime.ts` at the **service layer** (auth/session setup for full HTTP is heavy) exercising the 15 required steps against the live DB, printing PASS/FAIL with the failing step. API/UI HTTP runtime remains documented as the residual gap.

### 9. Legacy/new flow conflict risk — UNAUDITED
Plan: Phase 6 audit — confirm `/owner/recovery` uses only the new Recovery* models and never the legacy `Action`/`outcome/verification.ts`; identify any page mixing old/new.

### 10. Public subscription readiness — OUT OF SCOPE
Will remain NO, NOT PROVEN (billing/onboarding/multi-tenant hardening not built; explicitly excluded).

## Proof method ranking (highest fidelity first)
1. Live-DB service tests + smoke script (real `INSERT`/`SELECT`/`UPDATE`) — primary proof.
2. Live migration SQL inspection — schema proof.
3. Deterministic capability/authorization unit assertions — authz proof.
4. Build output — UI route proof.
5. Documented server-required command path — residual HTTP/UI runtime gap.

## Guardrails
- Changes limited to: owner-recovery code, migration, tests, access control, runtime proof.
- No commit/push. If a hook forces it, stop and report.
- No faked proof; blocked items reported with exact reason + the command that would prove them.
