# Phase 6I — Idempotency Route Inventory

**Date:** 2026-07-10  
**Branch:** claude/phase-6i-idempotency-auth-cleanup

---

## Routes Fixed in Phase 6I

| Route | Severity | Header Required | Operation Name | Payload Fields |
|-------|----------|----------------|----------------|----------------|
| `POST /api/decisions/intake` | CRITICAL | `idempotency-key` | `intakeDecision` | `{ title, workspaceId }` |
| `POST /api/decisions/create` (single JSON) | CRITICAL | `idempotency-key` | `createDecision` | `{ title, type, workspaceId }` |
| `POST /api/decisions/create` (bulk JSON) | CRITICAL | `idempotency-key` | `createDecisionsBulk` | `{ workspaceId, decisionCount }` |
| `POST /api/decisions/create` (CSV) | CRITICAL | `idempotency-key` | `importDecisionsCSV` | `{ workspaceId, fileName }` |
| `POST /api/decisions/[id]/accept` | HIGH | `idempotency-key` | `acceptDecision` | `{ decisionId, workspaceId, engagementId }` |
| `POST /api/decisions/[id]/reject` | HIGH | `idempotency-key` | `rejectDecision` | `{ decisionId, workspaceId, reason }` |
| `POST /api/decisions/[id]/close` | HIGH | `idempotency-key` | `closeDecision` | `{ decisionId, workspaceId }` |
| `POST /api/decisions/[id]/fail` | HIGH | `idempotency-key` | `failDecision` | `{ decisionId, workspaceId, reason }` |
| `POST /api/decisions/[id]/verify` | HIGH | `idempotency-key` | `verifyOutcome` | `{ decisionId, workspaceId, verificationStatus }` |
| `POST /api/decisions/[id]/record-outcome` | HIGH | `idempotency-key` | `recordDecisionOutcome` | `{ decisionId, workspaceId }` |

**Already idempotent (no change):**

| Route | Note |
|-------|------|
| `POST /api/decisions/[id]/execute` | `idempotency-key` required since Phase 6E; key passed to `executeDecision` service which handles check/record internally |

---

## Pattern Used

All fixes follow the route-level idempotency pattern:

```
1. Authenticate + authorize (fail-closed)
2. Require idempotency-key header (throw ValidationError if absent)
3. Parse and validate request body (Zod)
4. checkIdempotencyKey({ idempotencyKey, operationName, actorId, workspaceId, payload })
5. If !isNew && cachedResponse → return cachedResponse.body (no DB write)
6. If !isNew && cachedError   → throw cachedError (no DB write)
7. try { service call → recordIdempotencyResponse(key, 200, body, ws) → return }
8. catch { recordIdempotencyError(key, error, ws) → rethrow }
```

The `payload` hash is used as a tamper-check: reusing the same key with different payload/operationName throws `ValidationError` (mismatched idempotency).

---

## Workspace Isolation

Every `checkIdempotencyKey` call includes `workspaceId` in both the `workspaceId` option (for audit trail) and in the `payload` hash. This prevents a key generated in workspace A from inadvertently matching a request in workspace B.

---

## Known Limitation: Intake Create + Audit Non-Atomic

`POST /api/decisions/intake` calls `db.operatorItem.create` and then `logAuditEvent` outside of a transaction. If `logAuditEvent` fails after the create succeeds, the idempotency record is marked "failed". On retry, the cached error is returned (preventing a second creation). However, the first orphaned decision record remains in the DB without an audit trail. This pre-existing atomicity defect (present before Phase 6I) is tracked for a future phase that will migrate the intake route to use `emitAuditEvent` inside a `db.$transaction` (like `createDecision` in `decision-creation-service.ts`).
