# Phase R0 — Audit Atomicity Inventory

**Date:** 2026-07-10
**Scope:** All services that create governed records AND emit audit events

---

## Classification

- `ATOMIC` — record create + audit emit wrapped in `db.$transaction`
- `NON_ATOMIC` — record create and audit emit are separate DB operations
- `FIXED_R0` — was `NON_ATOMIC`, now `ATOMIC` after Phase R0 (D3-03)
- `AUDIT_ONLY` — emits audit event without record create (inherently atomic)

---

## Services Assessed

| Service | Function | Pattern | Status |
|---|---|---|---|
| `src/services/owner-finance/snapshot.service.ts` | `createFinancialSnapshot` | create + emitAuditEvent | FIXED_R0 (D3-03) |
| `src/services/owner-budget/budget.service.ts` | `recordSpendEntry` | create + emitAuditEvent | TO_VERIFY |
| `src/services/owner-mode/do-not-repeat.service.ts` | `recordDoNotRepeat` | create + emitAuditEvent | NON_ATOMIC (assessed low-risk) |
| `src/services/founder-recovery/business.service.ts` | `createBusiness` | create + emitAuditEvent | TO_VERIFY |
| `src/services/findings/finding.service.ts` | `createFinding` | create + emitAuditEvent | TO_VERIFY |
| `src/services/engagement/engagement.service.ts` | `createEngagement` | create + emitAuditEvent | TO_VERIFY |
| Decision state-change routes | various | update + emitAuditEvent | ENFORCED — via `db.$transaction` in service layer |

---

## D3-03 Fix Detail

**File:** `src/services/owner-finance/snapshot.service.ts`

**Before:**
```typescript
const created = await db.ownerFinancialSnapshot.create({ data: {...} });
await emitAuditEvent({ ... }); // separate call — could fail leaving snapshot with no trail
```

**After:**
```typescript
const snapshot = await db.$transaction(async (tx) => {
  const created = await tx.ownerFinancialSnapshot.create({ data: {...} });
  await emitAuditEvent({ ... }, tx); // atomic — audit failure rolls back snapshot
  return created;
});
```

**Key implementation detail:** `emitAuditEvent` accepts an optional second argument
`client: AuditClient = db` where `AuditClient = Pick<Prisma.TransactionClient, "auditEvent">`.
Passing `tx` as the second argument makes the audit write participate in the same transaction.

**Test file:** `src/__tests__/services/finance-snapshot-audit-transaction-r0.test.ts` (6 tests)

---

## Deferred Assessment

`recordDoNotRepeat` creates an `ownerDoNotRepeatRule` row and then calls `emitAuditEvent`
outside a transaction. This is assessed LOW_RISK because:
1. Do-not-repeat rules are operational memory, not financial records.
2. If audit fails, the rule still exists and blocks correctly — the missing audit is recoverable.
3. Wrapping in a transaction would require refactoring the `DnrDb` interface (currently `create` only, no `$transaction`).

Deferred to Phase R1.

---

## Recommendation

All services in `TO_VERIFY` status should be assessed in Phase R1 to confirm
whether they use `db.$transaction` for record + audit pairs. Priority:
1. `recordSpendEntry` (budget) — financial record
2. `createBusiness` — governed entity creation
3. `createFinding` — governed evidence record
4. `createEngagement` — governed lifecycle record
