# Current Status Update — Operational Event Resolution / Aging

- **Base:** `origin/main` @ `57c1769b` (Complaint/Rework Event Linkage, PR #117, merged).
- **Branch:** `claude/operational-event-resolution-aging-depth-pass`.
- **Classification:** `OPERATIONAL_EVENT_RESOLUTION_AGING_REAL_AND_OWNER_VISIBLE`
  (+ `CONSTRAINT_ENGINE_STRENGTHENED`, `PROFIT_LEAK_RADAR_STRENGTHENED`, `BUSINESS_CONTROL_SLO_STRENGTHENED`).

## Schema change
Two additive, backfill-safe columns on `operational_events`: `resolved_by_user_id`, `resolution_note`.
Migration `20260705150000_operational_event_resolution`. The status vocabulary
(OPEN | IN_REVIEW | RESOLVED | DISMISSED | DUPLICATE) uses the existing `status` column.

## What the owner can use now
`POST /api/complaint-rework { action:"resolve"|"dismiss"|"in_review"|"duplicate", eventId, note?, reason? }`
plus reads (`getOperationalEventAgingSummary`, `getOpenOperationalEvents`) — resolve/dismiss a
complaint/rework event with a note, mark it in review, or flag a duplicate. Results update the now-view.

## What became measurable
- **Event age / overdue / escalation** — from the server `createdAt`, on a severity-scaled window
  (CRITICAL 24h / HIGH 48h / MEDIUM 120h / LOW 240h). Overdue-severe active events escalate.
- **Resolution vs unresolved risk** — a resolved/dismissed event stops driving the live profit
  leak / constraint / credibility picture; the historical `PROOF_OUTCOME_INTEGRITY` fact stays.

## Delivery / pricing / quality wiring status
- Linked **delivery/late-service** complaint → `DELIVERY` constraint + `DELIVERY_DELAY_COST` leak.
- Linked **billing/pricing** complaint → `PRICING` constraint + `PRICING_UNDERCHARGE` leak, both
  **NEEDS_DATA** until a real amount/margin is entered (no fabricated figure).
- **Quality** complaint/rework → `QUALITY` (as before); measured impact only when an amount is supplied.

## SLO impact
- New `OPERATIONAL_EVENT_RESOLUTION`: PASS / WARN (overdue) / FAIL (overdue severe) / NOT_MEASURABLE.
- `PROOF_OUTCOME_INTEGRITY` still consumes linked complaint/rework (unchanged, honest historical grade).

## What remains missing
- Financial impact stays qualitative unless a real amount is entered on the event.
- CUSTOMER_RETENTION from complaints still needs repeat-customer data (not wired this pass).
- Direct fake-proof → Anti-Gaming link; UI + browser E2E.

## Remaining restrictions
Impact sizing depends on owner/manager-entered amounts; OpsIQ never fabricates a figure. Not a CRM /
ticketing / refund / messaging module.

## Next safest implementation order
1. Direct fake-proof dispute → Anti-Gaming signal link (close the last dispute→gaming gap).
2. Customer-retention wiring once repeat-customer data exists per event.
3. Then Process Intelligence over the proof → dispute → complaint/rework → resolution → risk chains.

## Out of scope (per instructions)
Full complaint management / CRM / ticketing / refund / messaging; Process Intelligence; public SaaS /
Product Hunt / billing; UI redesign; browser E2E.
