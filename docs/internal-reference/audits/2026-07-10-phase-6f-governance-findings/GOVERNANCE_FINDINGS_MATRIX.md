# Governance Findings Matrix — Phase 6F

**Audit date:** 2026-07-10  
**Scope:** Whole-repo idle audit, pre-triaged findings from prior reconnaissance

---

| ID | Finding | File | Function | Pre-triage | Verified | Root Cause | Fix Pattern | Dead/Live | DB Test |
|----|---------|------|----------|-----------|----------|-----------|------------|-----------|---------|
| F1 | No audit on decision creation | `src/services/decisions/decision-creation-service.ts` | `createDecision` | MEDIUM | CONFIRMED | `logger.info` only — no `AuditEvent` row | Create + `emitAuditEvent` in `$transaction` | LIVE | ✅ 4 tests |
| F2 | Non-atomic status change, swallowed audit | `src/services/decision/status-management.ts` | `changeDecisionStatus` | MEDIUM | CONFIRMED | `update({ where: { id } })` without state guard; `logAuditEvent().catch(swallow)` post-commit | CAS `updateMany` + `emitAuditEvent(tx)` in `$transaction` | DEAD | ✅ 6 tests |
| F3 | Unaudited grants, TOCTOU in all mutations | `src/services/private-mode/role-access.service.ts` | All 4 mutations | MEDIUM | CONFIRMED | Zero `emitAuditEvent` calls; no DB-level state guard in WHERE | CAS `updateMany` + `emitAuditEvent(tx)` in `$transaction` for all 4 | DEAD (HTTP) | ✅ +9 tests |
| F4 | Version guard unused, lost-update risk | `src/services/deliverable.ts` | `updateDeliverableReviewStatus` | HIGH | CONFIRMED | `update({ where: { id } })` — `input.version` ignored; post-commit audit | Pre-check + CAS `updateMany({ version, status guard })` + `emitAuditEvent(tx)` | DEAD | ✅ 5 tests |

---

## Finding Detail

### F1: createDecision — Missing audit (CONFIRMED_MEDIUM, LIVE)

**Evidence:** `decision-creation-service.ts` line 50 (pre-fix): `logger.info("Decision created", { ... })` — no `emitAuditEvent` call anywhere in the function. `AuditEvent` table never received a row for decision creation.

**Risk:** Every decision intake was ungoverned. No audit trail for the most common write operation in the system.

**Fix:** `db.$transaction(async (tx) => { const created = await tx.operatorItem.create(...); await emitAuditEvent({ eventName: AUDIT_EVENTS.OPERATOR_ITEM_CREATED, ... }, tx); return created; })`

**Test proof:** `decision-creation-audit.db.test.ts` — confirms `AuditEvent` row with `eventName = OPERATOR_ITEM_CREATED` exists after `createDecision` call; count consistency test rules out phantom rows.

---

### F2: changeDecisionStatus — Non-atomic, swallowed audit (CONFIRMED_MEDIUM, DEAD)

**Evidence (pre-fix):**
```ts
// Non-atomic — no current-status guard in WHERE
await db.operatorItem.update({ where: { id: decisionId }, data: { status: newStatus } });

// Post-commit audit (wrong order)
logAuditEvent(AuditEventTypes.DECISION_STATUS_CHANGED, { ... })
  .catch((error) => classifyOperatorError(error));  // swallowed
```

**Risk (when wired):**
1. TOCTOU: two concurrent callers both pass `isValidTransition`, both write — second silently overwrites.
2. Crash between update commit and audit write → status changed, no trail.
3. Audit failure invisible — `.catch()` ate it.

**Fix:** `db.$transaction(async (tx) => { const res = await tx.operatorItem.updateMany({ where: { id, workspaceId, status: currentStatus } }); if (res.count !== 1) throw new InvalidStateTransitionError(...); await emitAuditEvent({ eventName, ... }, tx); })`

**Test proof:** `change-decision-status-atomic.db.test.ts` — CAS guard test confirms that after consuming `pending` state, a second call targeting `pending` fails because the CAS WHERE finds no matching row.

---

### F3: PrivateModeRoleAccessService — Zero audit, TOCTOU (CONFIRMED_MEDIUM, DEAD FROM HTTP)

**Evidence (pre-fix):** No `import { emitAuditEvent }` in the file. No `$transaction` calls. All four mutations (`grantRoleAccess`, `approveRoleAccess`, `rejectRoleAccess`, `revokeRoleAccess`) used plain `update` or `create` with only application-layer state checks — no DB-level state predicates in WHERE.

**Risk (when wired):**
- `approveRoleAccess`: Two concurrent approvers could both pass the `approver.role !== 'OWNER'` check and both write `approvalStatus = 'approved'`.
- `revokeRoleAccess`: Double-revoke is only caught if `revokedAt` is re-read; no guarantee under concurrency.
- All four: state changes leave no `AuditEvent` trail regardless.

**Fix:** Each method now has `this.prisma.$transaction(async (tx) => { ... updateMany(WHERE with state guard ...) + count check + emitAuditEvent(..., tx) })`.

**Test proof:** `role-access.service.db.test.ts` Phase 6F blocks — 5 audit emission tests + 4 CAS tests covering grant/approve/reject/revoke concurrent guard.

---

### F4: updateDeliverableReviewStatus — Version guard no-op, lost-update (CONFIRMED_HIGH, DEAD)

**Evidence (pre-fix):**
```ts
// input.version received but never used in WHERE
const res = await db.deliverable.update({
  where: { id: deliverableId },  // version not here
  data: { status: "approved", version: input.version + 1 },
});

// Post-commit audit
await emitAuditEvent({ eventName: AUDIT_EVENTS.DELIVERABLE_APPROVED, ... });
```

**Risk (when wired):**
1. Lost-update: Stale caller (old version) silently overwrites concurrent change — optimistic lock mechanism completely non-functional.
2. Silent re-approval: No status guard → second `approve` call runs again with bumped version.
3. Crash between update commit and audit write → deliverable approved, no trail.

**Fix:**
```ts
// Pre-check (clear error before transaction)
if (deliv.status === "approved") throw new ConflictError("Deliverable is already approved");

// Transaction with CAS
await db.$transaction(async (tx) => {
  const res = await tx.deliverable.updateMany({
    where: { id: deliverableId, version: input.version, status: { not: "approved" } },
    data: { status: "approved", version: input.version + 1, ... },
  });
  if (res.count !== 1) throw new OptimisticLockError("Deliverable", deliverableId);
  await emitAuditEvent({ eventName: AUDIT_EVENTS.DELIVERABLE_APPROVED, ... }, tx);
});
```

**Test proof:** `deliverable-approval-governance.db.test.ts` — stale version (version=1 when DB has version=3) → `OptimisticLockError`; already-approved → `ConflictError`; audit atomicity proof confirms no phantom event on failed approval.

---

## Severity Rationale

| ID | Severity | Rationale |
|----|----------|-----------|
| F1 | MEDIUM | Live production code path. No audit on creation. Not exploitable for privilege escalation but violates audit completeness. |
| F2 | MEDIUM | Dead code (no HTTP route). TOCTOU + audit failure would matter when wired. |
| F3 | MEDIUM | Dead code from HTTP. TOCTOU is real but no exposure path currently. |
| F4 | HIGH | Dead code but version guard completely non-functional — optimistic locking advertised but not enforced. Silent re-approval possible. |
