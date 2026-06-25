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
| 4 — Explicit Permission Grants | `69b264c` | PASS_BACKEND_ONLY_UI_PENDING + DB_PROVEN | Owner-only vs grantable; stored in existing `UserRoleAssignment`; denies SUSPENDED/OFFBOARDED first. 24 local + 3 [db] (CI-green). |
| 5 — Role-Scoped Dashboard & Task Access (backbone) | _pending push_ | PASS_BACKEND_DOMAIN+SERVICE_UI_PENDING | Scopes OWNER/MANAGER/EMPLOYEE; fail-closed `requireDashboardAccess`; owner-only-field redaction; minimal task-access pull-forward. 32 local + 4 [db]. |
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
- **[db] proof: DB_PROVEN_BY_GITHUB_POSTGRES_SERVICE** — CI run `28144620840` (commit `40023a7`),
  job `build-and-test (20.x)`: tsc ✓, prisma validate ✓, `migrate deploy` ✓, build ✓, and the
  maintained suite ran **10842 passed / 13 skipped** on real postgres:16. My Slice 3 + Slice 4
  `[db]` tests are in the passing set (no employee-lifecycle/permissions/boundary failures).
- The job's overall `failure` conclusion is **FAIL_UNRELATED_PREEXISTING**: the only failing test
  is `src/__tests__/infra/load-testing/mock-load-tester.test.ts > "should simulate errors"`
  (`expected 0 to be greater than 0`) — a randomized load-sim assertion (100 reqs @ ~5% error;
  P(0 errors)=0.95^100≈0.6%/run), last touched in `4444508` (Module 12), unrelated to this build.
  Not fixed here (out of scope, Rule 4); a re-run clears it ~99.4% of the time.

## Blocked
- **Slice 3B (richer employee profile fields + invite/accept): MIGRATION_LANE_BLOCKED.**
  Evidence: `prisma migrate status` → P1001 (DB unreachable); cannot apply or DB-prove an
  additive migration locally; hosted DB has documented drift history. `prisma validate` does
  pass, so the additive field set is designed and ready for when a DB lane that can apply
  migrations is available. Does NOT block Slice 4/5 (which need no new columns).

## Cross-slice regression (local, TEST_WITH_DB unset)
- `src/__tests__/domain/` + `src/__tests__/services/workspace/`: 70 files / 2955 passing,
  7 [db] skipped. tsc 0 errors. lint 0 problems on changed files. No earlier gate weakened.

## Slice 5 notes
- Backbone built as testable services (UI routes deferred): `requireDashboardAccess`,
  `scopedResponse` (owner-only/manager-only field redaction, recursive, non-mutating),
  `requireTaskAccess`. All fail-closed; deny SUSPENDED/OFFBOARDED first.
- **Minimal Slice 7 pull-forward:** `task-access.ts` models only `{workspaceId, assignedUserId}`
  to prove "employee cannot access another employee's task" + workspace isolation. The full
  Slice 7 work-order/state-machine MUST reuse `canViewTask`.
- **DEPENDS_ON_SLICE_7 (not yet provable):** the dashboard *data sections* (proof-review queue,
  blocked/overdue tasks, escalations, rework) need the Slice 7 task + Slice 8 proof models; the
  access/redaction backbone is proven now, the section payloads come with those slices.
- UI routes (owner/manager/employee pages) deferred — backend guards ready for routes to call.

## Slice 7 notes (delegated task FSM)
- `delegated-task.ts` (pure): 15-status FSM with explicit `VALID_TASK_TRANSITIONS`; fail-closed
  `planTaskTransition` authorizing by actor role/capability — **employee can never mark
  APPROVED_COMPLETE** (owner, or manager with completion authority, only); reviewer-only
  reject/dispute; assigner-only assign/cancel; system-only EXPIRE. Boundary binding via Slice 6:
  `validateTaskGuidance` re-validates the task's `approvedBoundaryId/version/contentHash` →
  hash/version mismatch or superseded boundary **fails closed (blocks guidance)**.
- `delegated-task.service.ts` (DI): `applyTaskTransition` authorizes then applies the status
  change + audit in ONE `$transaction` with a status+workspace guard (concurrency + isolation);
  **failed audit write rolls back the state change** (rule 4, proven by DI test). Audit written
  tx-atomically via `tx.auditEvent.create` (TASK_STATUS_CHANGED) — not hash-chained (tradeoff for
  atomicity; audit_events has no append-only trigger).
- 22 local tests (FSM + service DI incl. rule-4 rollback, concurrency, isolation).
- **MIGRATION_LANE_PENDING:** the Prisma `DelegatedTask`/`WorkOrder` table + its [db] tests
  (table needed; can't apply migration locally, P1001). FSM/service are the enforcement core the
  table + routes must use.

## Slice 8 notes (proof system)
- `proof.ts` (pure): 12-status proof FSM; fail-closed `planProofTransition` — assignee-only
  submission, **human-reviewer-only** accept/reject/dispute (AI/system can only precheck or route
  to NEEDS_HUMAN_REVIEW → AI can never final-accept), **rejection requires a reason**, owner-only
  OVERRIDDEN_NOT_VERIFIED. `validateProofSubmission` (type match + required fields),
  `isDuplicateFileHash`, `isProofClearedForCompletion` (completion gate: ACCEPTED/NOT_REQUIRED),
  `requiresHumanReview` (high-risk types).
- `proof.service.ts` (DI): `submitProof` (validate → authorize → tx status+audit, duplicate-flag),
  `reviewProof` (authorize → tx status+audit guarded on status+workspace). **Failed proof-review
  audit write prevents the final proof status update** (rule, DI-proven).
- 24 local tests. tsc 0; eslint clean; cross-slice 3033 passing.
- **MIGRATION_LANE_PENDING:** Prisma Proof table + [db] tests.

## Slice 9 notes (blocker / escalation)
- `escalation.ts` (pure): blocker types, severity (incl. CRITICAL_OWNER_NOW), targets, status FSM;
  deterministic `routeEscalation` (refund/discount-beyond-boundary/lost-damaged/safety → owner;
  payment → manager or manager+owner; complaint by severity; staff-absent → supervisor unless
  repeated) with per-severity SLA; `appearsInOwnerDashboard`; `planEscalationResolution` (cannot
  silently close — note + resolver required); `classifyClarification` (outside boundary → escalate,
  never answer).
- `escalation.service.ts` (DI): `raiseBlocker` (route → persist OPEN → audit, SLA dueAt);
  `resolveEscalation` (require note+resolver → tx status+audit, status+workspace guard; failed
  audit rolls back). 19 local tests. tsc 0; eslint clean; cross-slice 3052 passing.
- **MIGRATION_LANE_PENDING:** Prisma Escalation table + [db] tests.

## Next actions
1. The MIGRATION_LANE batch (Slices 3B/7/8/9 Prisma tables + [db] tests) when a DB-capable apply
   lane is available (local DB is P1001-unreachable; CI postgres lane can apply migrations).
2. Wire dashboard data sections + owner/manager/employee UI routes consuming the Slice 5 backbone.
3. Slices 10–20 (guided-choice flow UI, AI proof precheck, outcome/profit/attribution, SOP engine,
   workflow libraries, capacity, customer-comms) per the build plan.
