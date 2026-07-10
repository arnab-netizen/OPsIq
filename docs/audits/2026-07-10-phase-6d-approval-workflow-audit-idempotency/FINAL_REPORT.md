# Phase 6D — Final Report: harden approval workflow governance

**Date:** 2026-07-10
**Branch:** `claude/phase-6d-approval-workflow-audit-idempotency`
**Base / HEAD-before:** `c68e8029` (main, Phase 6C Wave 2 merged)

## 1. Phase 6C Wave 2 final main verification
Main `c68e8029` verified **GREEN** on all three required workflows before this phase started:
- `CI - Build & Test` — success (incl. maintained test suite on postgres:16).
- `CI/CD Foundations` — success.
- `MVP Readiness Gate` — success; **Security Baseline HONEST_GREEN** (no Critical/High). The prior
  non-required `MVP Readiness Validation` `next build` OOM flake did **not** recur on `c68e8029`.
- `api/actions` tests + the `assignedTo` regression confirmed present on main.
→ **Phase 6C Wave 2: CLOSED — GREEN.**

## 2. Confirmed governance defects (CONFIRMED_HIGH) in `src/services/approval/workflow.ts`
A > $100k governed approval surface (`APPROVAL_THRESHOLD = 100000`) had:
1. **No audit trail** — `requestApproval` (create), `approveOutcome`, `rejectOutcome` emitted nothing.
2. **No status guard** — approve/reject used an unconditional `update`, so an **already-approved
   request could be silently flipped to rejected** (and rejected→approved).
3. **No idempotency / concurrency guard** — read-then-write (`findUnique` → `update`) TOCTOU; repeated
   approve re-stamped `approvedAt`; concurrent approve+reject could double-apply.

## 3. Source fixes (minimal; reuse proven sibling pattern)
Reused the `decision-acceptance.service.ts` DEC-01/CONC-01/AUDIT-01 pattern: **status-guarded
`updateMany` (compare-and-set on `approvalStatus="pending"`) inside a `$transaction` with the audit
event emitted on the same `tx`** (fail-closed — a failed audit rolls the transition back).
- `requestApproval` → create + `APPROVAL_REQUESTED` audit in one tx; unique-key idempotency preserved.
- `approveOutcome` → CAS pending→approved + `APPROVAL_GRANTED`; re-approve = idempotent no-op; blocks
  approving a rejected/terminal record (controlled result, no throw).
- `rejectOutcome` → CAS pending→rejected + `APPROVAL_DENIED`; **blocks approved→rejected silent flip**;
  repeated reject idempotent.
- Added `resolveApprovalWorkspaceId` helper (audit workspace derived via `operatorItem`).
- Authorization (`approverUserId` check) preserved verbatim; thresholds unchanged; no schema change.

## 4. Tests added (real DB, no mocks) — `src/__tests__/services/approval-workflow-governance.db.test.ts`
10 `[db]` tests (gated by `TEST_WITH_DB=true`, real Postgres):
1. requestApproval persists pending **+ emits APPROVAL_REQUESTED**.
2. requestApproval idempotent (no duplicate row, no second audit).
3. approveOutcome pending→approved **+ APPROVAL_GRANTED**.
4. rejectOutcome pending→rejected **+ APPROVAL_DENIED**.
5. **approved cannot be silently flipped to rejected** (status stays approved; no denial audit).
6. **rejected cannot be silently flipped to approved** (status stays rejected; no grant audit).
7. repeated approve idempotent (no re-stamp of `approvedAt`; single grant audit).
8. unauthorized actor cannot approve/reject (no mutation, no audit).
9. invalid transition returns a controlled result, never a raw 500.
10. **concurrent approve + reject** → exactly one wins, exactly one transition audit (CAS proof).

## 5. Behavior before/after
| Aspect | Before | After |
|---|---|---|
| Audit on create/approve/reject | none | APPROVAL_REQUESTED / GRANTED / DENIED (in-tx, fail-closed) |
| Approve a rejected record | silently flips to approved | controlled `Cannot approve: request is rejected`; no mutation |
| Reject an approved record | **silently flips to rejected** | controlled `Cannot reject: request is already approved`; no mutation |
| Repeat approve | re-stamps `approvedAt` | idempotent no-op (`Approval already recorded`) |
| Concurrent approve+reject | both may apply | exactly one wins (atomic CAS), one audit |
| Authorization | approver-id check | unchanged |

## 6. Files changed
- `src/services/approval/workflow.ts` (hardened; +imports, +helper, +tx/CAS/audit).
- `src/__tests__/services/approval-workflow-governance.db.test.ts` (new, 10 DB tests).
- `docs/audits/2026-07-10-phase-6d-approval-workflow-audit-idempotency/{APPROVAL_WORKFLOW_INVENTORY.md, FINAL_REPORT.md, EVIDENCE_LEDGER.json}`.

## 7. Commands run (local)
`tsc --noEmit` (0) · `TEST_WITH_DB=true vitest approval-workflow-governance.db.test.ts` (10 passed) ·
no-DB (10 skipped) · **fail-before** (revert approve to unconditional update → 4 fail: audit,
rejected→approved guard, idempotent replay, concurrency) · existing `approval-workflow.test.ts`
(4 passed) · regression `decision-outcome-path` + `verified-lifecycle` + `operator-queue` (138 passed) ·
`governance:scan:strict` (0 new) · `governance:scan:auth` (pass) · `prisma validate` (valid) ·
`lint:ratchet` (PASS, 0 changed-file errors).

## 8. Pass/fail/deferred
PASS locally. CI pending on the PR.

## 9. Rollback plan
Single-commit revert of this branch's commit restores prior behavior; no schema/migration change, so
revert is clean (`git revert <sha>`). No data migration to undo.

## 10. Remaining governance risks
- No optimistic-lock/`version` column on `ApprovalRequest` (deferred — CAS suffices for the confirmed
  defects; a version column would be a schema/migration change out of this phase's minimal scope).
- Transition primitives have no dedicated HTTP route wrapper today; route-level auth/capability is a
  Phase 6E/route concern.
- Owner-mode approval path (`resolveOwnerApproval`) not in scope this phase.

## 11. Updated phase queue
- **Phase 6E:** workspace-enforcement drift select; **invite boolean privilege escalation** (CONFIRMED_HIGH — active non-admin can invite/assign roles, `onboarding/invite/route.ts:50`); `withAuth` migration.
- Phase 6E-auth subtask: diagnosis `body.workspaceId` / `withAuth` scoping (SUSPECTED_MEDIUM).
- Phase 6F: agent-reported governance verification. Phase 6G: lane-integrity (incl. `mvp-readiness-check.sh` build OOM/output-swallow hardening).
- Remaining placebo waves: hostile-auth, governed wrappers, dashboard/recommendation/action route clusters, execution-certainty, constraint-checks, escalation/review-cycles, operator queue.
- Production migration: only with exact owner phrase.

## 12. Next recommended phase
**Phase 6E — workspace enforcement + invite-boolean privilege fix + withAuth migration** (contains the
CONFIRMED_HIGH invite privilege-escalation), unless idle audit surfaces a higher-severity runtime breaker.

## Safety
No production migration run · no production DB touched · no secrets altered · no schema change · no test
weakened/skipped/deleted · no faked idempotency/concurrency proof (real DB, real fail-before). Explicit
approval phrase **not** received.
