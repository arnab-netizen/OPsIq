# Employee/Manager Account Lifecycle + Fail-Closed Access Revocation — Slice Report

Date: 2026-06-25
Branch: `claude/opsiq-owner-mode-build-219oib`
Slice: **SLICE 3 — Owner/Manager/Employee Account Lifecycle** (Addendum C)
Classification: **PASS_BACKEND_ONLY_UI_PENDING** (security core; richer profile fields deferred — see G)

## Decision: build on the REAL model, no schema change
Repo-evidence verification of the runtime auth path:
- `src/services/auth.ts` `getSession()` (lines 63–73) rejects a session when
  `session.revokedAt` is set, `session.expiresAt` is past, or `user.isActive` is false.
- `getPolicyContext()` (lines 122–126) **re-reads `db.workspaceMembership.isActive`
  on every request** and returns null (→ `requirePolicyContext` throws Unauthorized)
  when the membership is inactive.
- `Session` model has `userId` + `revokedAt`, so a user's live sessions can be revoked.
- `WorkspaceMembership` has `isActive` + `removedAt`, which already encode three states.

So the **real** membership/auth model (Prisma `WorkspaceMembership` + `Session`) supports
fail-closed existing-session denial today. The in-memory `member-enforcement.ts` is a
parallel **MOCK_ONLY** legacy store and was **not** used; this slice wires the real model.

`prisma validate`/`generate` both fail on engine download (ECONNRESET via proxy) in this
env, so **a schema migration cannot be validated here**. Per Rule 6 / Addendum B, this slice
therefore makes **no schema change**, mapping status onto existing columns:
- ACTIVE = `isActive=true && removedAt=null`
- SUSPENDED = `isActive=false && removedAt=null` (reversible)
- OFFBOARDED = `removedAt!=null` (terminal)
- NONE = no row (fail-closed default)

## A. Files created
- `src/domain/workspace/employee-lifecycle.ts` — pure decision logic (status
  derivation, fail-closed transition planning, assignability/live-access predicates).
- `src/services/workspace/employee-lifecycle.service.ts` — IO service applying
  transitions on the real model with concurrency-safe conditional writes + session
  revocation + audit; injectable deps; lazy real-binding resolution.
- `src/__tests__/domain/workspace/employee-lifecycle.test.ts` — 14 pure tests.
- `src/__tests__/services/workspace/employee-lifecycle.service.test.ts` — 12 service
  tests (DI fakes) proving the session-revocation wiring without a DB.
- `src/__tests__/services/workspace/employee-lifecycle.service.db.test.ts` — `[db]`
  end-to-end test (CI lane) proving existing-session revocation.
- this report.

## B. Files changed
- `src/domain/constants/audit-events.ts` — additive: `EMPLOYEE_SUSPENDED`,
  `EMPLOYEE_REACTIVATED`, `EMPLOYEE_OFFBOARDED`, `EMPLOYEE_SESSIONS_REVOKED`.

## C. Schema changes
- **NONE.** No migration (cannot be validated in this env; status mapped onto existing
  columns). Richer profile fields are deferred to a migration-lane follow-up (see G).

## D. Backend logic implemented
- `deriveAccessStatus` (fail-closed NONE for absent membership).
- `planLifecycleTransition` — fail-closed FSM: only ACTIVE→SUSPEND; only SUSPENDED→REACTIVATE;
  ACTIVE/SUSPENDED→OFFBOARD; **OFFBOARDED is terminal** (no reactivation); every other
  transition rejected. Encodes when sessions must be revoked.
- `suspendEmployee` / `reactivateEmployee` / `offboardEmployee` — apply the plan inside an
  interactive `$transaction` with a **concurrency-safe state-guarded conditional update**
  (count must equal 1, else `LifecycleConflictError` + rollback). SUSPEND/OFFBOARD
  **revoke all of the user's un-revoked sessions** (`session.updateMany` → `revokedAt`).
  Audit events emitted after commit.
- `requireActiveMembership` — fail-closed runtime guard (throws `UnauthorizedError` unless
  ACTIVE); re-reads status server-side each call (for employee routes in Slice 5).
- `assertEmployeeAssignable` — fail-closed assignment guard (Slice 7): only ACTIVE assignable.

## E. Frontend logic implemented
- **NONE** (employee dashboards are Slice 5).

## F. Acceptance criteria checklist (Addendum C / Slice 3)
- [x] suspended employee loses access (membership inactive + sessions revoked)
- [x] offboarded employee loses access and is terminal (cannot be reactivated)
- [x] **existing session** denied: SUSPEND/OFFBOARD set `session.revokedAt` → `getSession`
      returns null; `requireActiveMembership` throws — server-side, every request
- [x] offboarded employee cannot be assigned new task (`assertEmployeeAssignable`)
- [x] suspended employee with existing session cannot pass the runtime guard
- [x] status check occurs server-side, not only in UI (`requireActiveMembership`/`getPolicyContext`)
- [x] reactivation only from SUSPENDED; terminal OFFBOARDED rejected
- [x] concurrency-safe (state-guarded conditional update; conflict fails closed)
- [x] lifecycle changes emit audit events (`employee.suspended/reactivated/offboarded`,
      `employee.sessions_revoked`)

## G. Known limitations
- **Richer profile fields deferred** (require schema migration, not validatable here):
  `status` enum column, `designation`, `managerId`, `allowedTaskTypes`, `invitationStatus`,
  `primaryAuthMethod`, `createdByOwnerId`, lifecycle timestamps, and the **invite/accept**
  flow. Status is currently derived from `isActive`+`removedAt`. → next migration-lane slice.
- **Audit atomicity:** the shared `emitAuditEvent` is not transaction-aware repo-wide, so
  the audit write happens after the (atomic) membership+session-revocation transaction
  commits. The security-critical pair is atomic; making audit tx-atomic would be an unrelated
  refactor of shared infra (out of scope). Addendum I’s "failed audit prevents state change"
  is therefore **not** fully met for the audit row specifically.
- `member-enforcement.ts` mock store is untouched and remains MOCK_ONLY (not used by the
  runtime path); not replaced in this slice.

## H. Manual verification steps
1. `TEST_WITH_DB= npx vitest run src/__tests__/domain/workspace/ src/__tests__/services/workspace/`
   → 26 new tests pass (`[db]` file auto-skips).
2. `npx tsc --noEmit` → 0 errors (whole project; generated client present this run).
3. CI (`TEST_WITH_DB=true`) runs the `[db]` test proving end-to-end session revocation.

## I. Trigger map
- Owner suspends/offboards employee → `suspendEmployee`/`offboardEmployee` → membership
  status change + session revocation (atomic) → audit events → existing session denied next request.
- Task assignment (Slice 7) → `assertEmployeeAssignable` → blocks non-ACTIVE.
- Employee route (Slice 5) → `requireActiveMembership` → blocks non-ACTIVE.

## J. Failure modes covered
Suspend/offboard non-eligible state; reactivate terminal/absent member; concurrent
transition (state-guard conflict → rollback); absent membership (NONE, fail closed);
existing valid session after suspend/offboard (revoked); new assignment to suspended/offboarded.

## K. Events emitted
`employee.suspended`, `employee.reactivated`, `employee.offboarded`,
`employee.sessions_revoked` (additive names; emitted by the service).

## L. Automated tests added
14 pure-domain + 12 service (DI) = 26 locally-passing; +4 `[db]` (CI lane). Total 30.

---

## SLICE 3 CLOSEOUT
- **Classification:** PASS_BACKEND_ONLY_UI_PENDING
- **Prisma validate:** NOT_RUN_WITH_REASON — engine download blocked (ECONNRESET); no schema change.
- **Prisma migrate status:** MIGRATE_STATUS_NOT_RUN_WITH_REASON — no migration added.
- **Backend enforcement:** fail-closed FSM + concurrency-safe conditional writes + session revocation.
- **UI path:** none (Slice 5).
- **Authorization/security:** existing-session denial via real session revocation + server-side
  per-request status checks; offboard terminal; assignment guard.
- **AI boundary/ledger:** N/A this slice.
- **Business audit:** 4 additive events; emitted by the service (post-commit).
- **Transaction/atomicity review:** membership status change + session revocation are atomic
  in one `$transaction`; conflict guard rolls back. Audit is post-commit (shared helper not
  tx-aware) — documented limitation.
- **Prompt-injection containment:** N/A (no untrusted text consumed).
- **Tests added:** 30 (14 domain + 12 service + 4 `[db]`).
- **Tests run:** workspace domain+service (26 passed; `[db]` skipped locally); full domain
  suite (65 files / 2793 tests passed) — no regression. `npx tsc --noEmit` → 0 errors.
- **Cross-slice regressions run:** domain layer green; Slice 6 boundary tests still green
  (unchanged). DB-backed lanes for AI ledger/business-audit NOT run locally (CI lane).
- **Cross-slice regression result:** PASS (no earlier gate weakened).
- **Result:** PASS
- **Can this slice be used by a real owner?** PARTIAL — backend lifecycle is usable, but there is
  no owner UI yet (Slice 5) and no invite/accept flow (deferred). The access-revocation core is real.
- **Can this slice be used by a real employee?** NO — no employee login/dashboard yet (Slice 5).
- **What would break in real use?** Nothing in the revocation path; the gap is missing UI +
  richer profile fields. An employee can be suspended/offboarded and is denied immediately.
- **What proof exists?** 26 locally-passing tests incl. service-level proof that suspend/offboard
  revoke all live sessions and the runtime guard denies non-ACTIVE; code-path proof that
  `getSession`/`getPolicyContext` enforce server-side; `[db]` end-to-end test authored for CI.
- **What proof is missing?** Live DB run of the `[db]` test (CI lane / not run against the
  unverified hosted DB here) — DB_NOT_VERIFIED_LOCALLY; richer-fields migration.
- **Any previously passing gate weakened?** NO.
- **Next slice:** migration-lane follow-up for richer membership fields + invite/accept, then
  Slice 4 (explicit permission grants) and Slice 5 (role-scoped dashboards consuming
  `requireActiveMembership`).
