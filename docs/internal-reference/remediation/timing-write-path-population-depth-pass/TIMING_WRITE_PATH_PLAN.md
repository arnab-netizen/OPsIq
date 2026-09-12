# Timing Write-Path Population — PLAN

## Objective
Populate the timing evidence fields from REAL governed write paths so `SUSPICIOUS_FAST_COMPLETION` and
`MANAGER_IGNORES_ESCALATION` are produced naturally during live operations, not only from seeded data —
without fabricating timestamps, inventing baselines, accusing staff, or holding a hidden score.

## Findings from the existing write paths
- **`Proof.submittedAt`** is ALREADY set server-side by `submitProof` on the SUBMITTED transition. ✓
  (preserved; a regression test confirms it).
- **`Proof.workStartedAt`** had no source — no explicit work-start action wrote it.
- **`Escalation.acknowledgedAt` / `acknowledgedBy`** had no source — no acknowledgement action existed
  (the FSM allowed OPEN → ACKNOWLEDGED but nothing performed it).
- A governed task FSM exists (`applyTaskTransition`) with an ACKNOWLEDGED → IN_PROGRESS edge = work start.

## Changes
1. **Schema (additive, nullable, backfill-safe):** `DelegatedTask.workStartedAt` — the server-trusted
   time the task first started. Migration `20260705180000_task_work_started_at`.
2. **Work-start population:** `applyTaskTransition` stamps `workStartedAt = now` ONLY on the first-start
   edge (ACKNOWLEDGED → IN_PROGRESS). A resume (BLOCKED → IN_PROGRESS) does NOT overwrite it. A task that
   never starts keeps `workStartedAt = null` → the fast-completion signal reads it as TIMING_MISSING
   (fail-visible, never fabricated).
3. **Proof timing copy:** `intakeProofSubmission` loads the task's `workStartedAt` and passes it to
   `submitProof`, which writes it onto the proof alongside the already-set `submittedAt`. Null start →
   proof `workStartedAt` stays null (TIMING_MISSING). Proof submission time is NEVER used as work start.
4. **Escalation acknowledgement (new governed path):**
   - Domain `planEscalationAcknowledgement(from, by)` — OPEN → ACKNOWLEDGED with an acknowledger; an
     already-handled escalation is an idempotent no-op (not an error).
   - Service `acknowledgeEscalation` — workspace-scoped, concurrency-guarded (`status: OPEN`), atomic
     audit (`escalation.acknowledged`), idempotent (repeat matches 0 OPEN rows → no-op, no second audit,
     original ack time preserved), fail-closed on wrong workspace / missing acknowledger.
   - Route `POST /api/escalation/acknowledge` — canonical enforcement + `requirePermission(PROOF_REVIEW_
     LOW_RISK)` (owners auto-pass; managers with the grant pass; others denied), sanitized errors.
   - `resolvedAt` semantics are untouched (existing resolution path unchanged).

## Integration (already wired in prior passes — this pass only populates)
- Owner Now View already reads `Proof.workStartedAt` + `Escalation.acknowledgedAt`; naturally-populated
  timing now flows through `timingEvidence` and `ANTI_GAMING_RISK`. Missing data stays fail-visible.
- Acknowledging escalations eases `MANAGER_IGNORES_ESCALATION` (acknowledged rows are no longer
  ack-overdue); a new overdue escalation re-surfaces the pattern.

## Safety
No fabricated timestamps/baselines; completion time never inferred from text; no fraud/negligence label;
no hidden score; cross-workspace isolation preserved (all writes workspace-guarded).

## Out of scope
Building a task-start UI; SOP/training engine; Process Intelligence (next pass); public SaaS/billing.
