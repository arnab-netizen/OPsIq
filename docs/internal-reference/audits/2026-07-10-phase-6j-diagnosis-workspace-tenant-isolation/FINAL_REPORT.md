# Phase 6J Audit — Diagnosis Route Workspace Tenant-Isolation

**Date:** 2026-07-10
**Branch:** `claude/phase-6j-diagnosis-workspace-tenant-isolation`
**Base commit:** `ae718f195` (A0 squash-merge)
**Severity:** CONFIRMED_HIGH
**Finding ID:** D4-01

---

## Executive Summary

Three POST routes under `/api/diagnosis/` accepted a `workspaceId` field from the untrusted
request body without validating that the authenticated caller belongs to that workspace.
Any authenticated user could supply a foreign `workspaceId`, causing:

1. Cross-tenant idempotency cache pollution (IdempotencyRecord keyed by the foreign workspaceId's
   payload hash, stored globally).
2. Analysis results containing the foreign workspaceId embedded and stored in `responseBody`.
3. Engine calls executing under the context of a workspace the caller does not belong to.

The fix inserts a `db.workspaceMembership.findFirst` check for `{ workspaceId: body.workspaceId,
userId: authContext.session.user.id, isActive: true }` **before** the idempotency cache lookup,
ensuring unauthorized requests are rejected with `403 ForbiddenError` before any DB write occurs.

---

## Routes Affected

| Route | Engine | Status |
|---|---|---|
| `POST /api/diagnosis/maturity` | `maturityEngine.analyzeMaturity` | FIXED |
| `POST /api/diagnosis/bottleneck` | `bottleneckEngine.analyzeBottleneck` | FIXED |
| `POST /api/diagnosis/root-cause` | `rootCauseEngine.analyzeRootCause` | FIXED |

---

## Root Cause

`withAuth` resolves against the `"system"` workspace by default — it validates that the caller
has the `DIAGNOSIS_READ` capability globally but does **not** bind the session to a specific
tenant workspace. The `workspaceId` therefore came entirely from the request body, which is
untrusted input from any authenticated user.

---

## Fix Applied

**Pattern (identical across all three routes):**

```typescript
const membership = await db.workspaceMembership.findFirst({
  where: {
    workspaceId: body.workspaceId,
    userId: authContext.session.user.id,
    isActive: true,
  },
  select: { role: true },
});
if (!membership) {
  throw new ForbiddenError("Access denied: not an active member of this workspace");
}
```

**Placement:** After `parseRequestBody` (body available), before `checkIdempotencyKey`
(no DB write has occurred for unauthorized requests).

---

## Tests Added

**File:** `src/__tests__/api/diagnosis-workspace-tenant-isolation-6j.test.ts`
**Count:** 22 tests (8 maturity, 7 bottleneck, 7 root-cause)
**Result:** 22/22 PASS

Test scenarios verified:
- Active member → 200, engine called, idempotency recorded
- Cross-workspace (foreign workspaceId) → ForbiddenError, engine NOT called
- Inactive membership (findFirst returns null) → ForbiddenError
- Unauthorized → ForbiddenError before idempotency write
- Missing `idempotency-key` header → BadRequestError
- Idempotent retry → cached response, engine not re-called, workspace still verified
- Membership query uses session `userId`, not any body-supplied field
- Result shape unchanged for authorized request

---

## Security Baseline Impact

| Dimension | Before | After |
|---|---|---|
| Cross-tenant body.workspaceId exploitation | OPEN | CLOSED |
| IdempotencyRecord pollution by foreign workspace | OPEN | CLOSED |
| Engine invocation under unauthorized workspace | OPEN | CLOSED |
| Unauthorized request creates DB record | YES | NO |

Security Baseline classification: **HONEST_GREEN** after merge.

---

## No-Idle Audit Findings (Read-Only)

Domains reviewed during CI:

| ID | Domain | Finding | Classification |
|---|---|---|---|
| D3-01 | Budget spend idempotency | `recordBudgetSpend` has no idempotency guard on double-POST | CONFIRMED — Phase 6K |
| D5-01 | Test quality (fake assertions) | All Phase 6I tests verified real — FALSE_POSITIVE |
| D6-01 | Finance snapshot/audit transaction | `createFinancialSnapshot` not wrapped in DB transaction | NOTED |
| D7-01 | Finance PATCH idempotency | PATCH /api/finance/[id] has no idempotency-key enforcement | NOTED |
| D8-01 | Billing upgrade audit | Upgrade path does not emit audit event | NOTED |
| D9-01 | ExternalFieldMapping dead schema | Schema exists, no active service consumers found | NOTED |
| D10-01 | A0 capability matrix overclaims | Capability matrix accurately reflects implemented routes | FALSE_POSITIVE |
| D11-01 | Connector/LLM readiness | Connector stubs present; no production LLM calls wired | CONFIRMED — Phase 6K scope |
