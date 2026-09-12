# Phase 6G — Governance & Lane Integrity Fixes — Final Report

**Date**: 2026-07-10  
**Phase**: 6G  
**Branch**: `claude/phase-6g-governance-lane-integrity-fixes`  
**Base**: `8a16d1fa` (Phase 6F squash-merge)

---

## A. Files Created

- `src/__tests__/services/diagnosis-audit.db.test.ts` — DB regression guard for F-G1 (DIAGNOSIS_COMPLETED audit persistence)
- `src/__tests__/services/decision/transaction-actions-cas.db.test.ts` — Unit + DB tests for F-G2 (CAS/audit/workspace isolation)
- `src/__tests__/services/decision/transaction-execution-cas.db.test.ts` — Unit + DB tests for F-G3 (CAS/audit/workspace isolation)
- `docs/audits/2026-07-10-phase-6g-governance-lane-integrity-fixes/FINAL_REPORT.md` (this file)
- `docs/audits/2026-07-10-phase-6g-governance-lane-integrity-fixes/PHASE_6G_FINDINGS_MATRIX.md`
- `docs/audits/2026-07-10-phase-6g-governance-lane-integrity-fixes/EVIDENCE_LEDGER.json`

## B. Files Changed

- `src/services/diagnosis.ts` — F-G1: added `await` to `emitAuditEvent` call at line 884
- `src/services/decision/transaction-actions.ts` — F-G2: CAS `updateMany` + `emitAuditEvent(tx)` in `$transaction`; removed `logAuditEvent` and `classifyOperatorError` imports
- `src/services/decision/transaction-execution.ts` — F-G3: CAS `updateMany` + `emitAuditEvent(tx)` in `$transaction`; mapped execution status to existing audit event constants; removed `logAuditEvent` and `classifyOperatorError` imports
- `src/__tests__/batch-1-phase-2-subbatch-1.test.ts` — F-G4: replaced two `expect(true).toBe(true)` with real `hasCapability` assertions
- `scripts/mvp-readiness-check.sh` — P4: `NODE_OPTIONS=--max-old-space-size=4096` for build; show output on failure

## C. Schema Changes

None. All fixes are in service/test/script layer.

## D. Backend Logic Implemented

**F-G1**: `emitAuditEvent` for `DIAGNOSIS_COMPLETED` in `diagnoseBusiness` is now awaited. Per the existing comment at line 830, this remains outside the transaction (nested transactions are not supported here).

**F-G2**: `executeDecisionAction` now uses:
```ts
await db.$transaction(async (tx: Prisma.TransactionClient) => {
  const res = await tx.operatorItem.updateMany({
    where: { id: decisionId, workspaceId, status: { in: allowedStates } },
    data: { status: newStatus, updatedAt: timestamp },
  });
  if (res.count !== 1) throw new InvalidStateTransitionError(...);
  await emitAuditEvent({ eventName, workspaceId, ... }, tx);
});
```
After the transaction, `findUnique` returns the updated record. Removes `logAuditEvent` post-commit pattern.

**F-G3**: `updateExecutionStatus` follows the same pattern with `{ id: decisionId, workspaceId }` in the WHERE. Execution status values map to `DECISION_EXECUTION_STARTED` / `DECISION_EXECUTION_SUCCESS` / `DECISION_EXECUTION_FAILED` / `DECISION_STATUS_CHANGED`.

## E. Frontend Logic Implemented

None.

## F. Acceptance Criteria Checklist

- [x] F-G1: `emitAuditEvent` for `DIAGNOSIS_COMPLETED` is awaited
- [x] F-G1: DB test proves the event is persisted after `diagnoseBusiness` returns
- [x] F-G2: `executeDecisionAction` uses CAS `updateMany` with `workspaceId` and `status` guard
- [x] F-G2: Audit is emitted inside `$transaction` (fail-closed)
- [x] F-G2: `logAuditEvent().catch(swallow)` removed
- [x] F-G3: `updateExecutionStatus` uses CAS `updateMany` with `workspaceId` in write WHERE
- [x] F-G3: Audit is emitted inside `$transaction` (fail-closed)
- [x] F-G3: `logAuditEvent().catch(swallow)` removed
- [x] F-G3: Execution status values mapped to correct existing audit event constants
- [x] F-G4: Both `expect(true).toBe(true)` placebo tests replaced with real `hasCapability` assertions
- [x] F-G4: Tests verify `CAPABILITIES.ENGAGEMENT_VIEW === "engagement:view"` and allow/deny paths
- [x] P4: `NODE_OPTIONS=--max-old-space-size=4096` added to build step
- [x] P4: Build failure output shown instead of silently discarded
- [x] TypeScript: zero new errors in modified files
- [x] Unit tests: 11 pass (F-G2 unit, F-G3 unit, F-G4 real assertions)
- [x] DB tests: properly gated by `SHOULD_RUN_DB_TESTS`

## G. Known Limitations

- DB tests require `TEST_WITH_DB=true` in the environment. The CI `mvp-readiness.yml` does not set this variable; the tests run when the per-DB-test workflow runs.
- `getExecutionSummary` references `DECISION_EXECUTION_STATUS_CHANGED` in a string filter that was cleaned up to use the `AUDIT_EVENTS` constants — old events in the DB with the legacy string `"DECISION_EXECUTION_STATUS_CHANGED"` will not be found. This is acceptable because the old `logAuditEvent` calls used a non-canonical event name that was never in `AUDIT_EVENTS`.
- The F-G2 `override` action clears override metadata from the `updateMany` data. Override-specific data (reason, approver) should be recorded in `OverrideRecord` (existing model); this was already broken before Phase 6G — the old code wrote non-schema fields to Prisma `update` that would be silently ignored. Not changed in Phase 6G scope.

## H. Manual Verification Steps

1. `npm run typecheck` — confirm zero errors in src/ (excludes e2e/ scripts/)
2. `npx vitest run src/__tests__/batch-1-phase-2-subbatch-1.test.ts` — 14 tests pass
3. `npx vitest run src/__tests__/services/decision/` — 11 unit tests pass, 16 DB tests skipped
4. With `TEST_WITH_DB=true`: `npx vitest run src/__tests__/services/diagnosis-audit.db.test.ts` — 2 DB tests pass

## I. Trigger Map

No new triggers added. The fixes are in existing write paths:
- `diagnoseBusiness` → triggered by POST `/api/diagnosis`
- `executeDecisionAction` → triggered by decision approval/rejection/override routes
- `updateExecutionStatus` → triggered by execution status update routes

## J. Failure Modes Covered

| Failure Mode | Before | After |
|---|---|---|
| `emitAuditEvent` throws during diagnosis | Silently swallowed (no await) | Propagates to caller |
| Concurrent `executeDecisionAction` on same decision | TOCTOU race, both writes succeed | CAS prevents second write; `InvalidStateTransitionError` |
| `executeDecisionAction` from wrong workspace | No workspace guard on write | `updateMany` WHERE filters on `workspaceId`; count=0 → error |
| Audit write failure during decision action | Error swallowed post-commit; state changed, audit lost | Transaction rolls back both state change and audit write |
| `updateExecutionStatus` from wrong workspace | No workspace guard on write | `updateMany` WHERE filters on `workspaceId`; count=0 → error |
| OOM during Next.js build in readiness check | Silent exit 2, no diagnostics | 4GB heap; build log shown on failure |

## K. Events Emitted

| Event | When |
|---|---|
| `diagnosis.completed` | After `diagnoseBusiness` completes (now awaited) |
| `decision.approved` | `executeDecisionAction` approve/override succeeded |
| `decision.rejected` | `executeDecisionAction` reject succeeded |
| `decision.overridden` | `executeDecisionAction` override succeeded |
| `decision.execution_started` | `updateExecutionStatus` → `in_progress` |
| `decision.execution_success` | `updateExecutionStatus` → `completed` |
| `decision.execution_failed` | `updateExecutionStatus` → `failed` |
| `decision.status_changed` | `updateExecutionStatus` → other statuses |

## L. Automated Tests Added

| File | Tests | Type |
|---|---|---|
| `src/__tests__/services/diagnosis-audit.db.test.ts` | 2 | DB (gated) |
| `src/__tests__/services/decision/transaction-actions-cas.db.test.ts` | 5 unit + 5 DB (gated) | Unit + DB |
| `src/__tests__/services/decision/transaction-execution-cas.db.test.ts` | 6 unit + 5 DB (gated) | Unit + DB |
| `src/__tests__/batch-1-phase-2-subbatch-1.test.ts` (modified) | 0 new tests; 2 existing upgraded from placebo | Unit |
