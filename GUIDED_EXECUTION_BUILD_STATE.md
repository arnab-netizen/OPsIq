# OpsIQ Personalized Guided Execution & Learning System — Build State

Canonical rolling state for the Owner Mode guided-execution build stream
(separate from `CURRENT_WORKFLOW_STATE.md`, which tracks the Decision-OS stream).

Branch: `claude/opsiq-owner-mode-build-219oib`
Last updated: 2026-06-25

## Completed slices

| Slice | Commit | Classification | Notes |
|---|---|---|---|
| 6 — Approved Execution Boundary v2 + validator | `c33b4fb`, `f879c82`, `5cf711d` | PASS_BACKEND_DOMAIN_ONLY | Fail-closed validator, 16/16 enum, 45 tests. DOMAIN_ONLY_NOT_RUNTIME_ENFORCED → runtime wiring pending Slice 10. |
| 3 — Employee/Manager Lifecycle | `678fc52` | PASS_BACKEND_PARTIAL_WITH_DB_FOLLOWUP | Real session revocation + `requireActiveMembership` server-side guard. No schema change. 26 local tests + 4 [db]. |
| 4 — Explicit Permission Grants | `69b264c` | PASS_BACKEND_ONLY_UI_PENDING | Owner-only vs grantable; stored in existing `UserRoleAssignment`; denies SUSPENDED/OFFBOARDED first. 24 local tests + 3 [db]. |
| (fixes) | `40023a7` | — | FK-safe cleanup in [db] tests (audit_events before users). |

## Components by enforcement level
- **Runtime-enforced (server-side):** `requireActiveMembership`, `assertEmployeeAssignable`,
  `requirePermission`/`hasPermissionFor` (all fail-closed; deny non-ACTIVE members first).
- **Domain-only (no runtime caller yet):** boundary validator
  (`validateInstructionAgainstBoundary`) — pending Slice 10 guidance integration.
- **MOCK_ONLY (not used for runtime safety):** `src/services/workspace/member-enforcement.ts`
  in-memory store. Untouched.

## DB / CI proof status
- Local DB unreachable (P1001) and `prisma generate`/`validate` engine download flaky →
  no local DB lane. `prisma validate` PASSES (schema valid). `migrate status` NOT_RUN (P1001).
- CI lane `ci.yml` runs on every push to `claude/**` with `TEST_WITH_DB=true` + postgres:16 +
  `migrate deploy` (all green: tsc, validate, migrate, build).
- Lane B (`lane-b-db-test.yml`, workflow_dispatch) **cannot be triggered**: integration token
  lacks `actions:write` (403). → GITHUB_WORKFLOW_DISPATCH_BLOCKED; push lane used instead.
- First CI runs failed on (a) lint-ratchet (2 unused-var warnings — fixed in `5cf711d`) and
  (b) the blocking suite due to FK-unsafe cleanup in my authored [db] tests (fixed in `40023a7`).
- **[db] proof: DB_TESTS_AUTHORED_CI_PENDING** — verifying on run for `40023a7`.

## Blocked
- **Slice 3B (richer employee profile fields + invite/accept): MIGRATION_LANE_BLOCKED.**
  Evidence: `prisma migrate status` → P1001 (DB unreachable); cannot apply or DB-prove an
  additive migration locally; hosted DB has documented drift history. `prisma validate` does
  pass, so the additive field set is designed and ready for when a DB lane that can apply
  migrations is available. Does NOT block Slice 4/5 (which need no new columns).

## Cross-slice regression (local, TEST_WITH_DB unset)
- `src/__tests__/domain/` + `src/__tests__/services/workspace/`: 70 files / 2955 passing,
  7 [db] skipped. tsc 0 errors. lint 0 problems on changed files. No earlier gate weakened.

## Next actions
1. Confirm CI run for `40023a7` build-and-test (blocking suite) GREEN → mark
   Slice 3/4 [db] as DB_PROVEN_BY_GITHUB_POSTGRES_SERVICE.
2. Slice 5 — Role-Scoped Dashboards (consume `requireActiveMembership` + `requirePermission`;
   employee API payloads must exclude owner-only fields).
3. Slice 7 — Work Orders & Delegated Task State Machine (bind tasks to
   approvedBoundaryId/version/contentHash; employee cannot mark APPROVED_COMPLETE).
