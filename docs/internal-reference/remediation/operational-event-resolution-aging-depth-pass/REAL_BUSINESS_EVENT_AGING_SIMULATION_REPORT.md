# Real-Business Event Aging — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`). An operator's photo proof is ACCEPTED. A customer
reports a **HIGH-severity DELIVERY complaint** ("delivered a day late, customer angry") linked to that
accepted proof. The event is recorded backdated **60h** — past the HIGH 48h window — so it is OVERDUE.
Plus a clean workspace (`wsClean`) for isolation. DB-backed
(`operational-event-aging-simulation.db.test.ts`, `TEST_WITH_DB=true`).

## Flow exercised
1. Record the delivery complaint via the live `recordOperationalEvent` (backdated clock → real 60h age).
2. Read aging + the live now-view while the event is **open + overdue**.
3. Owner **RESOLVES** the event with a note (`resolveOperationalEvent`), governed + audited.
4. Re-read the now-view after resolution.

## Result — while OPEN + OVERDUE
| Layer | Result |
|---|---|
| Aging summary | `openCount=1`, `overdueCount=1`, `overdueSevereCount=1`, `escalationTriggered=true`; top active event = the complaint |
| Constraint engine | **topConstraint = DELIVERY** (from the linked delivery complaint) |
| Profit-Leak Radar | **topProfitLeak = DELIVERY_DELAY_COST** (delivery-specific leak outranks the generic complaint leak) |
| Owner Now View | `operationalEventHealth.overdueCount=1`, `escalationTriggered=true` |
| Business-Control SLO | `OPERATIONAL_EVENT_RESOLUTION` = **FAIL** (overdue severe); `PROOF_OUTCOME_INTEGRITY` = **FAIL** |

## Result — after RESOLVE (with note)
| Layer | Result |
|---|---|
| Audit | one `operational_event.status_changed` (fromStatus OPEN → toStatus RESOLVED); re-resolve is idempotent |
| Owner Now View | `operationalEventHealth.activeCount=0`, `resolvedCount=1` |
| Business-Control SLO | `OPERATIONAL_EVENT_RESOLUTION` = **PASS** (no active overdue) |
| Profit-Leak Radar | topProfitLeak is **no longer** DELIVERY_DELAY_COST or COMPLAINT_REVENUE_RISK (live risk cleared) |
| Business-Control SLO | `PROOF_OUTCOME_INTEGRITY` = **still FAIL** — the sign-off historically did not hold |

## Honest missing-data + isolation (workspace wsClean)
- `getOperationalEventAgingSummary(wsClean)` → `activeCount=0`, no `wsL` event bleeds in.
- Clean-workspace now-view: `OPERATIONAL_EVENT_RESOLUTION` = NOT_MEASURABLE; `topConstraint` not DELIVERY.
- No financial figure was invented — the delivery leak is qualitative (no amount supplied).

## Interpretation for the owner
"The late-delivery complaint on that accepted job is now tracked. While it sat unresolved past its
same-day-ish window, OpsIQ made it my top delivery bottleneck and delivery-cost leak, flagged it as an
overdue severe event, and failed both the resolution and the sign-off-integrity checks. The moment I
resolved it with a note, the live delivery risk cleared and the resolution check went green — but the
integrity check stays red, honestly reminding me that job never should have been signed off clean.
OpsIQ won't guess the dollar loss unless I enter one."
