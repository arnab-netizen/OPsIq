# AUDIT-01 Remaining Paths — Closure

**Status:** CLOSED_PROVEN · **Commit:** `18a7005c` · **Test:** `src/__tests__/security/audit-01-remaining-paths.db.test.ts`

## Finding
Three governed-mutation paths changed state and then emitted their audit event *after* the
transaction (or with a swallowed `.catch`), so an audit-sink failure left a mutated record with no
audit trail — violating the "all meaningful mutations must emit audit events" rule and the atomic-audit
guarantee already applied to the operator write path.

## Paths fixed
1. **`decision-acceptance.service.ts › rejectDecision`** — guarded `updateMany({ status: {in:["pending","in_progress"]} → "blocked" })` and `emitAuditEvent(..., tx)` now run inside one `db.$transaction`; `res.count !== 1` throws `ValidationError`.
2. **`decisions/decision-lifecycle.service.ts › transitionDecisionState`** — moved the guarded `updateMany` + `emitAuditEvent(..., tx)` into `$transaction`; removed the post-commit `.catch` swallow.
3. **`outcome/verification-approval.service.ts › approveOutcomeVerification`** — guarded `updateMany` on `verificationStatus` + `emitAuditEvent(..., tx)` inside `$transaction`; preserves the existing GAP-PROOF-01 separation-of-duties check.

## Guarantee
For each path: the state change and its audit event commit together or not at all. The DB test drives
a real lifecycle transition (`pending`/SUBMITTED → APPROVED) proving the audit is written on success,
then forces `emitAuditEvent` to reject and asserts the row is unchanged (rolled back).

## Pattern
All three follow the established atomic pattern: `emitAuditEvent(input, tx)` accepts an optional
`Prisma.TransactionClient`; guarded `updateMany` provides optimistic-concurrency safety
(`where:{id, workspaceId, <expected status>}` + `count===1`).
