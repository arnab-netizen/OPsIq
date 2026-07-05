# Timing Write-Path Population — REPORT

## A. Files created
- `prisma/migrations/20260705180000_task_work_started_at/migration.sql` — additive `work_started_at`.
- `src/app/api/escalation/acknowledge/route.ts` — governed acknowledgement route.
- `src/__tests__/services/execution/escalation-acknowledgement.test.ts` — 7 domain+service tests.
- `src/__tests__/services/execution/task-work-start.test.ts` — 3 work-start tests.
- `src/__tests__/execution/timing-write-path-population-simulation.db.test.ts` — 6 laundry DB-sim tests.
- `docs/remediation/timing-write-path-population-depth-pass/` — this pack (6 docs).

## B. Files changed
- `prisma/schema.prisma` — `DelegatedTask.workStartedAt`.
- `src/domain/constants/audit-events.ts` — `ESCALATION_ACKNOWLEDGED = "escalation.acknowledged"`.
- `src/domain/execution/escalation.ts` — `planEscalationAcknowledgement`.
- `src/services/execution/escalation.service.ts` — `acknowledgeEscalation`.
- `src/services/execution/delegated-task.service.ts` — stamp `workStartedAt` on first start.
- `src/services/execution/proof.service.ts` — accept + persist `workStartedAt` on submit.
- `src/services/execution/proof-intake.service.ts` — load + pass the task's `workStartedAt`.

## C. Schema changes
`DelegatedTask.workStartedAt DateTime?` (nullable, no default, backfill-safe). No existing column/row
altered. `Proof.workStartedAt` / `Escalation.acknowledgedAt` / `acknowledgedBy` already existed (PR #124).

## D. Write paths changed
- **Work start:** `applyTaskTransition` → on ACKNOWLEDGED → IN_PROGRESS sets `workStartedAt = now`
  (first-start only; resume never overwrites).
- **Proof submit:** `submitProof` already set `submittedAt`; now also copies the task's `workStartedAt`
  onto the proof (null → left null).
- **Escalation ack:** new `acknowledgeEscalation` service + `POST /api/escalation/acknowledge` route set
  `acknowledgedAt` + `acknowledgedBy` (OPEN → ACKNOWLEDGED) with an atomic audit; idempotent; fail-closed.

## E. Proof timing behavior
`submittedAt` is server-trusted (submit path). `workStartedAt` is server-trusted (task first-start),
copied to the proof at submission. No work-start → TIMING_MISSING (never fabricated; submit time is never
used as work start). With work-start + submit + ≥3 accepted timed samples per type, a fast completion
surfaces; <3 samples → BASELINE_MISSING.

## F. Escalation acknowledgement behavior
A manager/owner acknowledges via the governed route → `acknowledgedAt`/`acknowledgedBy` set + audited.
Repeat = idempotent no-op (original time preserved, no second audit). Wrong workspace / missing
acknowledger = fail-closed (no mutation). Acknowledged escalations are no longer ack-overdue.

## G. Owner Now View / SLO integration
Unchanged wiring (from PR #124) now consumes naturally-populated timing: `timingEvidence.fastCompletion`
/ `escalationTiming` reflect live data; `ANTI_GAMING_RISK` reacts. Missing data stays fail-visible;
no SLO passes by hiding it.

## H. Acceptance criteria checklist
- [x] Real write paths populate the timing fields.
- [x] Missing-data behavior honest (TIMING_MISSING / BASELINE_MISSING / no fabrication).
- [x] Timing-backed signals consume naturally-populated timing.
- [x] Owner now-view can expose the timing-backed risk.
- [x] Tests pass (16 unit + 6 DB-sim); DB simulation passes.
- [x] Cross-workspace isolation tested; unauthorized/idempotent/fail-closed tested.
- [x] No fabricated timestamps/baselines; no fraud/negligence label; no hidden score.
- [x] tsc 0 · prisma valid · governance 31 frozen/0 new · `next build` exit 0.

## I. Known limitations
- `workStartedAt`/`acknowledgedAt` populate going forward; legacy rows stay TIMING_MISSING / unacknowledged.
- No task-start / acknowledge UI in this pass (routes/services only).
- Acknowledgement authorization reuses `PROOF_REVIEW_LOW_RISK` (the manager/owner review capability) —
  no new permission invented.

## J. Failure modes covered
Null work-start (TIMING_MISSING); resume not overwriting start; thin history (BASELINE_MISSING); wrong
workspace ack (no-op); repeat ack (idempotent); missing acknowledger (rejected); unauthorized ack
(denied); clean workspace (DATA_INSUFFICIENT); cross-workspace isolation.

## K. Events emitted
New `escalation.acknowledged` (atomic, inside the ack transaction). Task start still emits
`task.status_changed`; proof submit unchanged.

## L. Automated tests added
16 unit (7 ack + 3 work-start + 6 DB-sim... ) — precisely: 7 acknowledgement + 3 work-start unit +
6 DB simulation = 16.
