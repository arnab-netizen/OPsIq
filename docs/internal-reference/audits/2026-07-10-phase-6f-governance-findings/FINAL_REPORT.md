# Phase 6F — Governance Findings Final Report

**Date:** 2026-07-10  
**Branch:** claude/phase-6f-governance-findings-5gkiec  
**Audit type:** Whole-repo idle audit — pre-triaged governance findings verification and fix  
**Prior phase:** Phase 6E (auth/workspace invite hardening, merged PR #217, e45a15f)

---

## Executive Summary

Phase 6F verified and fixed four pre-triaged governance defects across two decision services, the deliverable approval path, and the private-mode role-access service. All four findings were confirmed on latest main before any code was touched. Three findings were in dead code (no live HTTP routes call them); one was in live production code.

All fixes use the Phase 6D CAS + audit-in-transaction pattern:
- `db.$transaction(async (tx) => { updateMany(...WHERE with state guard...) + emitAuditEvent(..., tx) })`
- `count !== 1` check triggers rollback (fail-closed)
- Audit atomically bound to state change — crashed server cannot leave state changed without audit trail

---

## Findings Summary

| ID | Location | Severity | Status | Live/Dead |
|----|----------|----------|--------|-----------|
| F1 | `createDecision` (decision-creation-service.ts) | MEDIUM | CONFIRMED + FIXED | LIVE |
| F2 | `changeDecisionStatus` (status-management.ts) | MEDIUM | CONFIRMED + FIXED | DEAD |
| F3 | `PrivateModeRoleAccessService` (role-access.service.ts) | MEDIUM | CONFIRMED + FIXED | DEAD (from HTTP) |
| F4 | `updateDeliverableReviewStatus` (deliverable.ts) | HIGH | CONFIRMED + FIXED | DEAD |

---

## A. Files Created

- `src/__tests__/services/decision/change-decision-status-atomic.db.test.ts`
- `src/__tests__/services/decisions/decision-creation-audit.db.test.ts`
- `src/__tests__/services/deliverable-approval-governance.db.test.ts`
- `docs/audits/2026-07-10-phase-6f-governance-findings/FINAL_REPORT.md` (this file)
- `docs/audits/2026-07-10-phase-6f-governance-findings/GOVERNANCE_FINDINGS_MATRIX.md`
- `docs/audits/2026-07-10-phase-6f-governance-findings/EVIDENCE_LEDGER.json`

---

## B. Files Changed

- `src/domain/constants/audit-events.ts` — added `DECISION_BLOCKED`, `DECISION_OVERRIDDEN`, `DECISION_STATUS_CHANGED`
- `src/services/decisions/decision-creation-service.ts` — atomic create + audit in transaction (F1)
- `src/services/decision/status-management.ts` — CAS + atomic audit, removed `.catch()` swallow (F2)
- `src/services/deliverable.ts` — version guard in WHERE + status guard + atomic audit (F4)
- `src/services/private-mode/role-access.service.ts` — all 4 mutations: CAS + atomic audit (F3)
- `src/__tests__/services/private-mode/role-access.service.db.test.ts` — added User fixtures, Phase 6F audit + CAS test blocks

---

## C. Schema Changes

None. All fixes are application-layer only. No migration required.

---

## D. Backend Logic Implemented

### F1: createDecision — audit atomicity (LIVE CODE)

**Defect:** `db.operatorItem.create` committed, then `logger.info` only — no `AuditEvent` row persisted. Every decision creation was ungoverned.

**Fix:** Wrapped `operatorItem.create` + `emitAuditEvent` in `db.$transaction`. Emits `AUDIT_EVENTS.OPERATOR_ITEM_CREATED`. Failed audit rolls back the creation (fail-closed).

### F2: changeDecisionStatus — CAS + atomic audit (DEAD CODE)

**Defects:**
1. Non-atomic WHERE: `update({ where: { id: decisionId } })` — no current-status guard. TOCTOU possible.
2. Post-commit audit: `logAuditEvent` called after `operatorItem.update` committed.
3. Swallowed errors: `.catch()` ate audit failures.

**Fix:**
- Pre-transaction: `findFirst({ where: { id, workspaceId } })` for existence check + `isValidTransition` guard.
- `db.$transaction`: `updateMany({ where: { id, workspaceId, status: currentStatus } })` + `count !== 1` → `InvalidStateTransitionError`.
- `emitAuditEvent(input, tx)` inside transaction. Per-status event names: `DECISION_APPROVED`, `DECISION_REJECTED`, `DECISION_BLOCKED`, `DECISION_OVERRIDDEN`, `DECISION_EXECUTED`, `DECISION_STATUS_CHANGED`.
- Removed `logAuditEvent` + `.catch()` pattern entirely.

### F3: PrivateModeRoleAccessService — audit + CAS (DEAD FROM HTTP)

**Defects:** All four mutations (`grantRoleAccess`, `approveRoleAccess`, `rejectRoleAccess`, `revokeRoleAccess`) had zero audit events and no DB-level state guards (TOCTOU across all four).

**Fix:** Each mutation now uses `$transaction` with:
- `updateMany` with state predicate in WHERE (CAS)
- `count !== 1` → controlled error
- `emitAuditEvent(input, tx)` for `APPROVAL_REQUESTED`, `ROLE_ASSIGNED`, `APPROVAL_GRANTED`, `APPROVAL_DENIED`, `ROLE_REVOKED`

New-grant path uses `create` inside transaction; re-grant path uses `updateMany WHERE { revokedAt: { not: null } }`.

### F4: updateDeliverableReviewStatus — version guard + status guard + atomic audit (DEAD CODE)

**Defects:**
1. `input.version` passed to function but not used in `WHERE` — optimistic lock mechanism was a no-op.
2. No status guard on `update` — second approve call silently ran again.
3. Post-commit audit: `emitAuditEvent` called after `deliverable.update` committed.

**Fix:**
- Pre-check: `if (deliv.status === "approved") throw new ConflictError(...)` before transaction.
- `db.$transaction`: `updateMany({ where: { id, version: input.version, status: { not: "approved" } } })` + `count !== 1` → `OptimisticLockError`.
- `emitAuditEvent(DELIVERABLE_APPROVED, tx)` inside transaction (fail-closed).
- Post-transaction `findUnique` returns updated record.

---

## E. Frontend Logic Implemented

None. All fixes are backend service-layer only.

---

## F. Acceptance Criteria Checklist

- [x] F1: `createDecision` emits `OPERATOR_ITEM_CREATED` atomically in DB transaction
- [x] F1: Failed audit rolls back OperatorItem creation (fail-closed by transaction)
- [x] F1: Validation (empty title) rejects with descriptive error before DB
- [x] F2: `changeDecisionStatus` uses `updateMany` with `status: currentStatus` CAS guard
- [x] F2: `count !== 1` → `InvalidStateTransitionError` (concurrent race or invalid state)
- [x] F2: Audit event inside same transaction (atomic)
- [x] F2: `.catch()` swallow removed — audit failures propagate and roll back
- [x] F2: All status transitions emit correctly typed event names from `AUDIT_EVENTS`
- [x] F3: All four mutation methods emit audit events inside transactions
- [x] F3: `grantRoleAccess` re-grant CAS: `WHERE { revokedAt: { not: null } }` prevents concurrent re-grant
- [x] F3: `approveRoleAccess` CAS: `WHERE { approvalStatus: 'pending', revokedAt: null }`
- [x] F3: `rejectRoleAccess` CAS: `WHERE { approvalStatus: 'pending' }`
- [x] F3: `revokeRoleAccess` CAS: `WHERE { revokedAt: null }` — "Role already revoked" error preserved
- [x] F4: `input.version` now in `WHERE` clause of `updateMany`
- [x] F4: `status: { not: "approved" }` guard in `WHERE` clause
- [x] F4: Stale version → `OptimisticLockError` (409)
- [x] F4: Already-approved pre-check → `ConflictError` (409)
- [x] F4: Audit inside transaction (fail-closed)
- [x] All DB tests use `describe.skipIf(!SHOULD_RUN_DB_TESTS)` gate
- [x] All DB tests create/delete real User records for FK constraint on `AuditEvent.actorId`
- [x] TypeScript: zero new errors in `src/services/` or `src/__tests__/`

---

## G. Known Limitations

1. **createDecision idempotency**: No idempotency key in the `CreateDecisionInput` interface. Duplicate submission protection deferred to a follow-up phase (requires caller-supplied idempotency key or unique constraint on business fields).
2. **changeDecisionStatus is dead code**: No live HTTP routes call it. Tests prove correctness for when it is wired up. The live equivalent (`acceptDecision`/`rejectDecision` in `decision-acceptance.service.ts`) was already correct from Phase 6D.
3. **updateDeliverableReviewStatus is dead code**: No live HTTP routes call it. Tests prove correctness for when it is wired up.
4. **PrivateModeRoleAccessService HTTP exposure**: The service exists but no HTTP routes currently expose it. Audit governance is now correct; route wiring is a separate concern.

---

## H. Manual Verification Steps

1. `TEST_WITH_DB=true npx vitest run src/__tests__/services/decision/change-decision-status-atomic.db.test.ts`
2. `TEST_WITH_DB=true npx vitest run src/__tests__/services/decisions/decision-creation-audit.db.test.ts`
3. `TEST_WITH_DB=true npx vitest run src/__tests__/services/deliverable-approval-governance.db.test.ts`
4. `TEST_WITH_DB=true npx vitest run src/__tests__/services/private-mode/role-access.service.db.test.ts`
5. `npx tsc --noEmit` — confirm zero new errors in `src/services/` and `src/__tests__/`

---

## I. Trigger Map

| Event | Governance re-evaluation triggered |
|-------|-----------------------------------|
| `createDecision` called | `OPERATOR_ITEM_CREATED` audit event persisted atomically |
| `changeDecisionStatus` called | Per-transition audit event (`DECISION_APPROVED`, `DECISION_REJECTED`, etc.) persisted atomically |
| `grantRoleAccess` called | `APPROVAL_REQUESTED` or `ROLE_ASSIGNED` audit event persisted atomically |
| `approveRoleAccess` called | `APPROVAL_GRANTED` audit event persisted atomically |
| `rejectRoleAccess` called | `APPROVAL_DENIED` audit event persisted atomically |
| `revokeRoleAccess` called | `ROLE_REVOKED` audit event persisted atomically |
| `updateDeliverableReviewStatus` called | `DELIVERABLE_APPROVED` audit event persisted atomically |

---

## J. Failure Modes Covered

| Failure Mode | Handling |
|--------------|----------|
| Server crash between status change and audit write | Transaction rollback — both revert together |
| Concurrent callers both pass app-level state check | CAS `updateMany` WHERE with state guard — second write returns `count=0` → error |
| Stale version deliverable approval | `updateMany WHERE { version: input.version }` → `count=0` → `OptimisticLockError` |
| Double-approve deliverable | Pre-check `status === "approved"` → `ConflictError`; also blocked by `status: { not: "approved" }` in CAS |
| Concurrent re-grant of revoked role | `WHERE { revokedAt: { not: null } }` CAS → `count=0` → error |
| Cross-workspace ID leakage | `workspaceId` in every WHERE clause |
| Audit event emit failure | Transaction rolls back state change (fail-closed) |
| Missing actor authorization | Authorization checks precede all transactions |

---

## K. Events Emitted

New events added to `AUDIT_EVENTS` in this phase:
- `DECISION_BLOCKED: "decision.blocked"`
- `DECISION_OVERRIDDEN: "decision.overridden"`
- `DECISION_STATUS_CHANGED: "decision.status_changed"`

Existing events now emitted correctly (were missing before):
- `OPERATOR_ITEM_CREATED` — emitted by `createDecision`
- `DECISION_APPROVED`, `DECISION_REJECTED` — emitted by `changeDecisionStatus`
- `APPROVAL_REQUESTED`, `ROLE_ASSIGNED`, `APPROVAL_GRANTED`, `APPROVAL_DENIED`, `ROLE_REVOKED` — emitted by `PrivateModeRoleAccessService`
- `DELIVERABLE_APPROVED` — emitted inside transaction by `updateDeliverableReviewStatus`

---

## L. Automated Tests Added

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `src/__tests__/services/decision/change-decision-status-atomic.db.test.ts` | 6 | CAS guard, pending→approved audit, pending→rejected audit, invalid transition, not found, workspace isolation |
| `src/__tests__/services/decisions/decision-creation-audit.db.test.ts` | 4 | OPERATOR_ITEM_CREATED audit, row persisted correctly, audit count consistency, validation error |
| `src/__tests__/services/deliverable-approval-governance.db.test.ts` | 5 | Correct version succeeds, stale version fails, already-approved fails, missing capability fails, audit atomicity proof |
| `src/__tests__/services/private-mode/role-access.service.db.test.ts` | +9 | Phase 6F audit emission (5 tests) + CAS guarded-update (4 tests) |
