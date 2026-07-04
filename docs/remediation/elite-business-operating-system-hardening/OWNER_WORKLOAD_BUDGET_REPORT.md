# Owner Workload Budget — Report

**Classification:** `REAL_AND_OWNER_VISIBLE` ·
**Code:** `src/domain/owner-guidance/owner-workload-budget.ts` (pure),
integrated in `src/services/owner-guidance/owner-now-view.service.ts`, surfaced via
`GET /api/owner/now-view`. ·
**Tests:** `src/__tests__/owner-guidance/owner-workload-budget.test.ts` (7),
`src/__tests__/services/owner-guidance/owner-now-view.db.test.ts` (workload-budget DB case).

## What it does
Turns the owner's already-assembled issue list + real owner-decision-surface counts into a budget that
proves OpsIQ *reduces* owner load:

- **Groups** related owner alerts by category → one owner-facing line per group (`groupedAlertCollapses`).
- **Suppresses** LOW-severity, non-owner-action noise from the owner's day (`lowValueAlertsSuppressed`).
- **Separates** owner-only decisions from staff/manager-**delegable** work (`ownerDecisionsRequired` vs
  `delegableItems`).
- **Flags the owner bottleneck** (`ownerBottleneckItems`, owner-action overload).
- Counts concrete owner-decision surfaces: `reviewsRequired` (proofs in `NEEDS_HUMAN_REVIEW`),
  `approvalsRequired` (opportunity approvals), `ownerDecisionsRequired` (grouped owner issues + pending
  reassessments).
- Estimates `estimatedOwnerMinutes` and `estimatedMinutesSaved` with a **transparent** weighted-count
  basis (`estimateBasis` string) — labelled as planning estimates, never measured time.
- Emits `ownerTodayList`: the grouped, owner-only, severity-sorted list the owner should actually see.

## Integration (not a disconnected engine)
It consumes the **same** `BusinessIssue[]` the live Owner Now View already produces (no parallel truth)
and real workspace-scoped DB counts, and rides the existing `/api/owner/now-view` payload — so it is
owner-visible through the current owner surface with no new route.

## Proof
- Unit: suppression, owner-only/delegable separation, category grouping (most-severe headline +
  "+N related"), urgent-stays-visible amid noise, owner-bottleneck flag, real-surface counting, and
  **budget drops when work is delegated**.
- DB: seeds two `NEEDS_HUMAN_REVIEW` proofs → `reviewsRequired === 2`; a different workspace reads 0
  (isolation).

## Honest limits
`opportunityApprovalsPending` currently contributes 0 because opportunity decisions are computed on
demand with no persisted pending-approval queue; when such a queue exists, wire its count in. Estimates
are deterministic planning figures, not measured owner time.
