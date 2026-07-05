# Current Status Update — Completion / Escalation Timing Evidence

- **Base:** `origin/main` @ `ff741bac` (Per-Proof Evidence Lists for Risk Signals, PR #123, merged).
- **Branch:** `claude/completion-escalation-timing-evidence-depth-pass`.
- **Classification:** `COMPLETION_ESCALATION_TIMING_EVIDENCE_REAL_AND_OWNER_VISIBLE`
  (+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `OWNER_MODE_EXCELLENCE_DEEPENED`).

## What was unblocked
Two signals that were `BLOCKED_BY_DATA` last pass are now produced from persisted trusted timestamps:
- **`SUSPICIOUS_FAST_COMPLETION`** — from `Proof.workStartedAt` + `Proof.submittedAt` compared to an
  **observed per-proof-type baseline** (median of the workspace's own accepted, timed completions).
- **`MANAGER_IGNORES_ESCALATION`** — from `Escalation.dueAt` + new `Escalation.acknowledgedAt`
  (+ `resolvedAt`), attributed to the assigned manager/owner.

## Schema (additive, backfill-safe)
`proofs.work_started_at`; `escalations.acknowledged_at`; `escalations.acknowledged_by` — all nullable,
no default. Legacy rows read as `TIMING_MISSING` / unacknowledged (fail-visible), never fabricated.

## Statuses
- Fast-completion: `NO_SIGNAL` · `TIMING_MISSING` · `BASELINE_MISSING` · `FAST_COMPLETION_WARNING` ·
  `SUSPICIOUS_FAST_COMPLETION_PATTERN` · `DATA_INSUFFICIENT`.
- Escalation: `NO_SIGNAL` · `ESCALATION_TIMING_MISSING` · `NO_MANAGER_ASSIGNMENT` ·
  `ESCALATION_ACK_OVERDUE` · `ESCALATION_RESOLUTION_OVERDUE` · `MANAGER_IGNORES_ESCALATION_PATTERN` ·
  `DATA_INSUFFICIENT`.

## What the owner can use now
The now-view surfaces the active signal via `topGamingSignal` and both signals (including fail-visible
blocked statuses) via a new `timingEvidence` block, each with the exact evidence ids and — for
fast-completion — the derived baseline it was judged against. The owner can adjudicate a timing signal
via `POST /api/proof-risk/adjudicate` (dismiss suppresses the exact ids; a new fast job / new ignored
escalation re-surfaces it).

## SLO impact
`ANTI_GAMING_RISK` fails/warns when an active timing gaming signal is present and eases only when it is
cleared with no newer evidence. `BLOCKED_BY_DATA` / `TIMING_MISSING` / `BASELINE_MISSING` statuses are
never hidden to force an SLO pass.

## Remaining restrictions
No fraud/theft/negligence label; no hidden score; no fabricated timestamps or baselines; completion time
never inferred from user text; missing data is fail-visible, not treated as failure. No owner UI.

## Next safest implementation order
1. Populate `work_started_at` / `acknowledged_at` from the dispatch + acknowledgement write paths.
2. A minimal owner UI for the timing signals + the adjudication queue.
3. Then Process Intelligence over the full proof/escalation → risk → adjudication chains.

## Out of scope (per instructions)
Owner UI; Process Intelligence; public SaaS / Product Hunt / billing; hidden staff scores; broad surveillance.
