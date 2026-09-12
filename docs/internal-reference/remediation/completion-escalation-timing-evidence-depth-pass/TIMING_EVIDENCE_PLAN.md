# Completion / Escalation Timing Evidence — PLAN

## Objective
Persist the minimum trusted timing evidence needed to unblock two risk signals that were previously
`BLOCKED_BY_DATA` (modelled but never produced because no timing source was persisted):

- **`SUSPICIOUS_FAST_COMPLETION`** — needs trusted completion timing + a duration baseline.
- **`MANAGER_IGNORES_ESCALATION`** — needs trusted escalation acknowledgement / resolution timing.

Do this **without** fabricating timestamps or baselines, without accusing staff, and without a hidden
score. Missing data stays fail-visible (a named blocked status), never guessed.

## What is persisted (additive, backfill-safe)
| Table | New column | Meaning |
|---|---|---|
| `proofs` | `work_started_at` | Server-trusted time the operator was dispatched / marked work started. Null on legacy rows. |
| `escalations` | `acknowledged_at` | Server-trusted first acknowledgement (OPEN → ACKNOWLEDGED/IN_REVIEW). |
| `escalations` | `acknowledged_by` | Who acknowledged (audit trail). |

Every column is **nullable with no default** — legacy rows are null and the evaluators treat null as
`TIMING_MISSING` / unacknowledged (fail-visible), never a made-up value. `submitted_at` (completion),
`due_at` (ack SLA) and `resolved_at` already exist.

## Fast-completion logic
- Trusted duration = `submitted_at − work_started_at` (both server-set; sub-second durations ignored).
- **Baseline is DERIVED from the workspace's own accepted history** — the median accepted-proof duration
  for the *same proof type*, reported as `baselineSource` + `baselineConfidence`. It adapts to the real
  business and is never an invented constant. Fewer than 3 accepted samples for a type → `BASELINE_MISSING`.
- A completion is "fast" only when it beats its type baseline by a wide margin (< 20%). One fast job =
  `FAST_COMPLETION_WARNING`; ≥ 2 by one operator = `SUSPICIOUS_FAST_COMPLETION_PATTERN`.
- Statuses: `NO_SIGNAL` · `TIMING_MISSING` · `BASELINE_MISSING` · `FAST_COMPLETION_WARNING` ·
  `SUSPICIOUS_FAST_COMPLETION_PATTERN` · `DATA_INSUFFICIENT`.

## Ignores-escalation logic
- **Ack-overdue** = escalation still `OPEN`, never acknowledged, past its `due_at`.
- **Resolution-overdue** = acknowledged/in-review but unresolved past a per-severity resolution window.
- Attributed to the escalation's assigned manager/owner. One overdue = `ESCALATION_ACK_OVERDUE` /
  `ESCALATION_RESOLUTION_OVERDUE`; ≥ 2 unacknowledged for one target = `MANAGER_IGNORES_ESCALATION_PATTERN`.
- Statuses: `NO_SIGNAL` · `ESCALATION_TIMING_MISSING` (no due time) · `NO_MANAGER_ASSIGNMENT` ·
  `ESCALATION_ACK_OVERDUE` · `ESCALATION_RESOLUTION_OVERDUE` · `MANAGER_IGNORES_ESCALATION_PATTERN` ·
  `DATA_INSUFFICIENT`.

## Integration
1. **Domain** `src/domain/owner-mode/timing-evidence.ts` — pure evaluators + the 16-field `TimingSignal`.
2. **Anti-gaming** — active timing signals map into `identifyGamingSignals` as
   `SUSPICIOUS_FAST_COMPLETION` / `MANAGER_IGNORES_ESCALATION` gaming signals, keeping their exact
   evidence ids so the existing per-source adjudication suppression applies unchanged.
3. **Now-view** — queries proof timing + escalations, evaluates both signals, exposes them via
   `topGamingSignal` and a new `timingEvidence` block (so blocked statuses stay visible), feeds the
   `ANTI_GAMING_RISK` SLO.
4. **Adjudication** — fast-completion carries proof ids, ignores-escalation carries escalation ids, both
   as the suppression key: clearing exactly those ids suppresses the signal; a new id re-surfaces it.

## Safety
No fraud/theft/negligence label; no hidden score; no fabricated timestamps or baselines; completion time
never inferred from user text; missing data is fail-visible, not treated as failure.
