# Real-Business Control Correlation — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`) — a real owner running the OpsIQ control loop, plus a
second clean workspace (`wsClean`) to prove isolation. DB-backed
(`control-correlation-simulation.db.test.ts`, `TEST_WITH_DB=true`).

## Seeded persisted state (workspace wsL)
- **2 closed reassessments** — `OwnerReassessmentEvent` closed 1 day and 2 days after their trigger.
- **3 shocks** (`service_breakdown`, high) with their audit trail:
  - `shockOk1`, `shockOk2` — each has a `SHOCK_EVENT_RECORDED` audit **and** a `CONDITION_CHANGED`
    re-evaluation audit ~30–45s after record.
  - `shockUnhandled` — has a `SHOCK_EVENT_RECORDED` audit but **no** `CONDITION_CHANGED` (re-eval
    never recorded), created 40 min ago (past the 1-min grace).
- **1 tamper-suspected proof** (`tamperSuspected=true`) + 1 accepted proof.

## Measured result (real, from persisted timestamps)
| SLO / stat | Measured value | Grade |
|---|---|---|
| `REASSESSMENT_LATENCY` | median 1.5 days across 2 closed, 0 overdue | **PASS** |
| `AUDIT_DURABILITY` (shock class) | 3/3 shocks audited = **100%** coverage | **PASS** |
| `SHOCK_HANDLING_LATENCY` | 2 LINKED (<60s), **1 unhandled** past grace | **FAIL** |
| Tamper signal | 1/2 proof tamper-suspected (persisted, queryable) | credibility `TAMPER_SUSPECTED_PROOF` |

The unhandled shock is surfaced as a real `FAILED` `SHOCK_TO_HANDLING_CORRELATION` with a **null**
`targetTimestamp` — no fabricated handling time. The three target SLOs are **no longer NOT_MEASURABLE**
via the live `getOwnerNowView(wsL, bizL)` — the pass's core conversion, from real data.

## Honest missing-data + isolation (workspace wsClean)
- `getControlCorrelations(wsClean)` → reassessment/shock/audit all `measurable:false`; tamper count 0.
- Live now-view: `REASSESSMENT_LATENCY`, `SHOCK_HANDLING_LATENCY`, `AUDIT_DURABILITY` all
  **NOT_MEASURABLE** (no fabricated green with no data).
- **No bleed:** none of the laundry's correlations (`shockOk1` etc.) appear in `wsClean`; every
  correlation echoes its own `workspaceId`.

## Interpretation for the owner
Sparkle Laundry's control loop closes reassessments on time and audits every governed change — but one
recorded shock never triggered a re-evaluation. OpsIQ surfaces that as a concrete, owner-visible
`SHOCK_HANDLING_LATENCY` FAIL with the exact shock id, not a vague warning. That is a measurable defect
in OpsIQ's own reaction loop, caught by the correlation, not hidden.
