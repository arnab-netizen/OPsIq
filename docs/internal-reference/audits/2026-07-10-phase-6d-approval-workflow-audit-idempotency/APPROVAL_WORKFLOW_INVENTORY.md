# Phase 6D — approval workflow inventory (`src/services/approval/workflow.ts`)

**Date:** 2026-07-10 · **Branch:** `claude/phase-6d-approval-workflow-audit-idempotency` · **Base:** `c68e8029`

Governed surface: high-value (> $100k, `APPROVAL_THRESHOLD = 100000`) approval records on the
`ApprovalRequest` model. `ApprovalRequest` has **no** `version`/`updatedAt`/`workspaceId` column and a
`@@unique([operatorItemId, approverUserId])`; workspace is derived via `operatorItem.workspaceId`.

## Function-by-function (before → after)

| Fn | File:line (pre-fix) | Op | Audit (before→after) | Status guard (before→after) | Idempotency (before→after) | Concurrency (before→after) | Authorization | DB tx | Business impact | Class | Smallest safe fix | Proof |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `requestApproval` | 42 | create | none → **APPROVAL_REQUESTED** | n/a (create) | unique-key returns existing → **unchanged (still idempotent)** | unique constraint → unchanged | none (caller-supplied approver) | none → **tx(create+audit)** | governed record created with no audit history | CONFIRMED_HIGH | emit creation audit in a tx (fail-closed); keep unique-key idempotency | test 1,2 |
| `approveOutcome` | 75 | approve | none → **APPROVAL_GRANTED** | none (unconditional `update`) → **CAS on `status="pending"`** | re-stamps `approvedAt` each call → **idempotent no-op (`already recorded`)** | read-then-write TOCTOU → **atomic guarded `updateMany`** | approver-id check (kept) | none → **tx(updateMany+audit)** | approved w/o audit; rejected→approved silent flip; double-apply | CONFIRMED_HIGH | status-guarded `updateMany` + audit in tx | test 3,6,7,9,10 |
| `rejectOutcome` | 113 | reject | none → **APPROVAL_DENIED** | none (unconditional `update`) → **CAS on `status="pending"`** | overwrites each call → **idempotent** | read-then-write TOCTOU → **atomic guarded `updateMany`** | approver-id check (kept) | none → **tx(updateMany+audit)** | rejected w/o audit; **approved→rejected silent flip**; double-apply | CONFIRMED_HIGH | status-guarded `updateMany` + audit in tx | test 4,5,9,10 |
| `getApprovalStatus` | 127 | read | n/a | n/a | n/a | n/a | n/a | none | read-only aggregate | OK (unchanged) | — | — |
| `requiresApproval` | 155 | pure | n/a | n/a | n/a | n/a | n/a | none | threshold predicate | OK (unchanged) | — | existing `approval-workflow.test.ts` |
| `enforceApprovalRequirement` | 159 | orchestrate | inherits requestApproval audit | n/a | inherits | inherits | delegates | none | entrypoint (operator route) | OK (unchanged behavior) | — | regression suites |
| `canCompleteWithApprovalStatus` | 211 | read/gate | n/a | fails closed on rejected/pending/not-approved (kept) | n/a | n/a | n/a | none | completion gate | OK (unchanged) | — | regression suites |

## Helper added
`resolveApprovalWorkspaceId(operatorItemId)` — derives the audit `workspaceId` from the operator item
(ApprovalRequest has no workspace column); throws `NotFoundError` if the operator item is missing.

## Reused sibling pattern (smallest proven)
`src/services/decision-validation/decision-acceptance.service.ts` (`acceptDecision`/`rejectDecision`,
tags DEC-01 + CONC-01 + AUDIT-01): status-guarded `updateMany` (`count !== 1` → controlled) inside a
`$transaction` with `emitAuditEvent(input, tx)` on the same client (fail-closed). Applied verbatim in
shape to approve/reject. No new architecture introduced.

## Tests inspected
- `src/__tests__/r1-runtime/approval-workflow.test.ts` — covers only `requiresApproval` (threshold);
  no transition/audit coverage (the gap this phase fills). Unchanged, still passes (4/4).
- `src/__tests__/p2b/decision-outcome-path.test.ts`, `verified-lifecycle.test.ts`,
  `src/__tests__/api/operator-queue.test.ts` — approval-consuming paths; run as regression (138 passed).
- No placebo (`expect(true).toBe(true)`) assertions found in the approval-workflow domain.
- Owner-mode approval tests (`owner-approval-resolution`, `approval-memory`, `approval-threshold-policy`)
  cover a **different** path (`resolveOwnerApproval`) and are out of scope; left untouched.

## Authorization note (unchanged, not loosened)
`approveOutcome`/`rejectOutcome` reject when `request.approverUserId !== approverId` (kept verbatim).
Workspace/capability enforcement remains the responsibility of the calling route wrapper; not loosened.

## Not done (documented, not overclaimed)
- No schema change (no `version`/`updatedAt` column added) — the CAS `updateMany` provides atomicity
  without one, so no migration is required. (A dedicated optimistic-lock column is deferred; unnecessary
  for the confirmed defects.)
- The transition primitives (`approveOutcome`/`rejectOutcome`) currently have no HTTP route wrapper in
  the app (only `enforceApprovalRequirement`/`canCompleteWithApprovalStatus` are wired into
  `operator/route.ts`); route-level auth/capability coverage stays a Phase 6E/route concern.
