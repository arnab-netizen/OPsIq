# Current Status Update — Timing Write-Path Population

- **Base:** `origin/main` @ `e59eb2fe` (Owner Adjudication Browser E2E, PR #126, merged).
- **Branch:** `claude/timing-write-path-population-depth-pass`.
- **Classification:** `TIMING_WRITE_PATH_POPULATION_REAL_AND_OWNER_VISIBLE` (+ `OWNER_MODE_EXCELLENCE_DEEPENED`).

## What changed
The timing evidence fields are now populated by REAL governed write paths, so the two timing signals are
produced naturally during live operations:
- **`DelegatedTask.workStartedAt`** (new nullable column) is stamped when a task first transitions
  ACKNOWLEDGED → IN_PROGRESS (`applyTaskTransition`); a resume never overwrites it.
- **`Proof.submittedAt`** stays server-set on submit; **`Proof.workStartedAt`** is copied from the task at
  submission. No work-start → TIMING_MISSING (never fabricated; submit time is never used as work start).
- **`Escalation.acknowledgedAt` / `acknowledgedBy`** are set by a new governed `acknowledgeEscalation`
  service + `POST /api/escalation/acknowledge` route (workspace-scoped, authz, idempotent, audited,
  fail-closed). `resolvedAt` semantics unchanged.

## What the owner can use now
Fast-completion and ignored-escalation flags now light up from real operations, not just seeded data:
when staff genuinely start and submit jobs, and when managers do (or don't) acknowledge escalations, the
Owner Now View `timingEvidence` reflects it and `ANTI_GAMING_RISK` reacts. Acknowledging escalations
eases the ignore signal; a new overdue one re-surfaces it.

## Safety
No fabricated timestamps/baselines; completion time never inferred from text; no fraud/negligence label;
no hidden score; every timing write is workspace-guarded (cross-workspace isolation tested).

## What remains
- Legacy rows stay TIMING_MISSING / unacknowledged until touched by the live write paths.
- No task-start / acknowledge UI (routes/services only).
- Process Intelligence not started (next pass).

## Verification
tsc 0 · prisma valid · governance 31-frozen/0-new · `next build` exit 0 · 16 unit + 6 DB-sim tests ·
owner-mode+execution unit regression 1243 · DB regression 218.

## Next safest pass
Process Intelligence v1 over the trusted event/proof/risk/adjudication/timing chain.

## Out of scope (per instructions)
Task-start UI; SOP/training engine; public SaaS / billing / Product Hunt; hidden scores.
