# Real-Business Timing Write-Path — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`). A staff member starts a wash+press order through the
governed task FSM; the workspace has real accepted history; a manager is assigned overdue escalations.
DB-backed (`timing-write-path-population-simulation.db.test.ts`, `TEST_WITH_DB=true`). **6/6 pass.**

## Flow + result
| Step | Result |
|---|---|
| Staff starts the task (`applyTaskTransition` ACKNOWLEDGED → IN_PROGRESS) | `delegated_tasks.work_started_at` is stamped server-side (was null before) |
| Baseline (5 accepted 60-min washes) + two 4–5 min washes by staff | `timingEvidence.fastCompletion = SUSPICIOUS_FAST_COMPLETION_PATTERN` (COMPLETE, proof refs), **no fraud label** |
| Manager acknowledges escalation `esc1` (`acknowledgeEscalation`) | `acknowledged_at` + `acknowledged_by` set + one `escalation.acknowledged` audit |
| Manager re-submits the same acknowledgement | idempotent no-op — original ack time preserved, no second audit |
| Acknowledge `esc2` in the WRONG workspace | fail-closed — `esc2` stays OPEN, nothing mutated |
| After acking `esc1` (one of two overdue) | `escalationTiming` eases to `ESCALATION_ACK_OVERDUE` (single, not a pattern) |
| A NEW overdue escalation `esc3` appears | `MANAGER_IGNORES_ESCALATION_PATTERN` **re-surfaces** (esc2 + esc3) |
| Unauthorized user tries to acknowledge (via `requirePermission`) | denied; the granted manager passes |
| Clean workspace | fast-completion + escalation `DATA_INSUFFICIENT`; no `wsL` bleed; no hidden score |

## Interpretation for the owner
"Now the timing comes from what my team actually does. When the operator starts a job, OpsIQ records the
real start time; when they submit proof, it records the submit time — so it can tell a four-minute 'wash'
apart from a real one, using my own accepted jobs as the yardstick. When my manager finally acknowledges
an escalation, that's logged too, and OpsIQ stops flagging the ones he's handled — but the moment a new
one is ignored, the flag comes back. If a start time was never recorded, OpsIQ says so instead of
guessing. Nobody is called a cheat; I just get honest, evidence-backed timing."

## Browser E2E
Untouched this pass; status unchanged.
