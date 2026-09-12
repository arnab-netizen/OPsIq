# Real-Business Timing Evidence — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`). Five accepted 60-minute "wash" jobs set a **trusted
observed baseline**. Operator `opFast` then submits two wash jobs in **4 and 5 minutes** — impossibly
fast for a real wash. Manager `mgrLazy` is assigned two HIGH escalations and **never acknowledges**
them past their due time. Both signals were `BLOCKED_BY_DATA` before this pass. DB-backed
(`completion-escalation-timing-simulation.db.test.ts`, `TEST_WITH_DB=true`).

## Flow + result
| Step | Result |
|---|---|
| Baseline (5 accepted 60-min wash jobs) | per-type baseline established: `OBSERVED_ACCEPTED_HISTORY(proofType=wash, median≈60min)`, confidence MEDIUM |
| `opFast` submits 2 jobs in 4–5 min | `timingEvidence.fastCompletion = SUSPICIOUS_FAST_COMPLETION_PATTERN`, `sourceCompleteness = COMPLETE`, `supportingProofIds = [f1, f2]` |
| `mgrLazy` ignores 2 HIGH escalations past due | `timingEvidence.escalationTiming = MANAGER_IGNORES_ESCALATION_PATTERN`, `supportingProofIds = [esc1, esc2]`, `actorId = mgrLazy` |
| Combined | `topGamingSignal ∈ {SUSPICIOUS_FAST_COMPLETION, MANAGER_IGNORES_ESCALATION}`; `ANTI_GAMING_RISK = FAIL`; **no fraud label** |
| Owner **dismisses** the fast-completion signal `[f1, f2]` | fast-completion suppressed from the top slot; the ignores-escalation signal (different source) stays visible |
| **New evidence**: `opFast` submits a 3rd fast job `f3` | `SUSPICIOUS_FAST_COMPLETION_PATTERN` **re-surfaces** (`f3` not cleared) |
| Clean workspace | fast-completion `DATA_INSUFFICIENT`, escalation `DATA_INSUFFICIENT`; no `wsL` bleed |
| Proof with `submitted_at` but no `work_started_at` | `TIMING_MISSING` (`BLOCKED_BY_DATA`) — never fakes a duration |

## Interpretation for the owner
"OpsIQ learned how long a wash normally takes from my own accepted jobs — about an hour. When opFast
'finished' two washes in four and five minutes, it flagged it and showed me exactly which two jobs,
against that real baseline. It didn't call anyone a cheat — it said 'review these.' I know that shift
ran an authorised express batch, so I dismissed it, and OpsIQ stopped nagging me about those two. The
moment a third impossibly-fast wash appears, the flag comes straight back. Separately, it noticed my
manager sat on two urgent escalations past their deadline and named them. And when a workspace has no
start-times recorded, OpsIQ says so plainly instead of inventing a number."
