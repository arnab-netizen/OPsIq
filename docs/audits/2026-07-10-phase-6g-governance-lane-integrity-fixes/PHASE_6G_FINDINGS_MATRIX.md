# Phase 6G — Governance & Lane Integrity Findings Matrix

**Date**: 2026-07-10  
**Branch**: `claude/phase-6g-governance-lane-integrity-fixes`  
**Scope**: Fix four governance defects found during Phase 6F hostile audit

---

## Findings

| ID | Severity | Status | File | Line | Defect | Fix |
|----|----------|--------|------|------|--------|-----|
| F-G1 | HIGH | CONFIRMED/LIVE | `src/services/diagnosis.ts` | 884 | `emitAuditEvent` called without `await` — fire-and-forget, errors silently dropped, event may not persist | Added `await` |
| F-G2 | MEDIUM | CONFIRMED/DEAD | `src/services/decision/transaction-actions.ts` | 43–85 | `update({ where: { id } })` — no `workspaceId`, no status CAS guard; `logAuditEvent().catch(swallow)` post-commit | CAS `updateMany({ id, workspaceId, status: { in: allowedStates } })` + `emitAuditEvent(tx)` in `$transaction` |
| F-G3 | MEDIUM | CONFIRMED/DEAD | `src/services/decision/transaction-execution.ts` | 33–66 | `update({ where: { id } })` — missing `workspaceId` in write WHERE; `logAuditEvent().catch(swallow)` post-commit | CAS `updateMany({ id, workspaceId })` + `emitAuditEvent(tx)` in `$transaction` |
| F-G4 | LOW | CONFIRMED/TEST | `src/__tests__/batch-1-phase-2-subbatch-1.test.ts` | 76, 143 | `expect(true).toBe(true)` placebo — capability enforcement tests did not exercise `hasCapability` | Real `hasCapability` assertions with allow/deny paths |
| P4 | LOW | CONFIRMED/OOM | `scripts/mvp-readiness-check.sh` | 100 | `npm run build` OOM-kills silently; output discarded | `NODE_OPTIONS=--max-old-space-size=4096`; build log shown on failure |

---

## Pattern Legend

| Pattern | Description |
|---------|-------------|
| LIVE | Code path reachable in production |
| DEAD | Code path exists but unreachable without specific prerequisite |
| TEST | Defect in test code, not production |
| OOM | Out-of-memory risk in CI/deployment scripts |
| CAS | Compare-and-swap: atomically validate precondition + write |
| AUDIT-01 | Audit-in-transaction: `emitAuditEvent(payload, tx)` inside `$transaction` |

---

## Audit Pattern Applied

All F-G2 and F-G3 fixes follow the established AUDIT-01 pattern used by `deliverable.ts`, `status-management.ts`, and other Phase 6F-fixed services:

```
await db.$transaction(async (tx: Prisma.TransactionClient) => {
  const res = await tx.model.updateMany({ where: { id, workspaceId, ...casGuard } });
  if (res.count !== 1) throw new InvalidStateTransitionError(...);
  await emitAuditEvent({ ... }, tx);
});
```

F-G1 is NOT moved into a transaction per the existing comment at `diagnosis.ts:830` ("Do NOT do side effects inside transaction to avoid nested transaction issues").

---

## New Tests Added

| File | Type | Covers |
|------|------|--------|
| `src/__tests__/services/diagnosis-audit.db.test.ts` | DB (gated) | F-G1: DIAGNOSIS_COMPLETED event persisted |
| `src/__tests__/services/decision/transaction-actions-cas.db.test.ts` | Unit + DB (gated) | F-G2: CAS, atomic audit, workspace isolation |
| `src/__tests__/services/decision/transaction-execution-cas.db.test.ts` | Unit + DB (gated) | F-G3: CAS, atomic audit, workspace isolation |
