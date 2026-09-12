# Current Status Update — Complaint / Rework Event Linkage

- **Base:** `origin/main` @ `9381efab` (Dispute → Profit/Constraint Wiring, PR #116, merged).
- **Branch:** `claude/complaint-rework-event-linkage-depth-pass`.
- **Classification:** `COMPLAINT_REWORK_EVENT_LINKAGE_REAL_AND_OWNER_VISIBLE`.

## Schema change
One additive, backfill-safe table: `operational_events` (COMPLAINT | REWORK) + two indexes. Migration
`20260705140000_operational_event`. No change to existing tables.

## What the owner can use now
`POST /api/complaint-rework { action:"record", eventType, category, description, relatedProofId? }`
and `{ action:"link", eventId, proofId }` — record a real per-event complaint/rework and tie it to the
accepted proof it contradicted. Results surface on the now-view.

## What became measurable
- **proof→complaint** and **proof→rework** are now measurable (LINKED) — previously NOT_MEASURABLE.
- The linked event is attributed to the operator whose accepted proof it contradicted.

## SLO / integration impact
- `PROOF_OUTCOME_INTEGRITY` now consumes linked complaint/rework (a linked event on accepted proof is a contradiction).
- Evidence Credibility raises `ACCEPTED_PROOF_WITH_COMPLAINT` / `ACCEPTED_PROOF_WITH_REWORK`.
- Profit-Leak Radar: linked complaint → COMPLAINT_REVENUE_RISK, rework → REWORK_REDO_COST; impact is
  MEASURED when an amount is supplied, else qualitative.
- Constraint Engine: linked quality complaint/rework contributes to QUALITY.

## What remains missing
- Financial impact stays qualitative unless a real amount is entered on the event.
- DELIVERY/PRICING complaint → constraint wiring (radar covered; constraint only QUALITY this pass).
- Direct fake-proof → Anti-Gaming link; UI + browser E2E.

## Remaining restrictions
Impact sizing depends on owner/manager-entered amounts; OpsIQ never fabricates a figure.

## Next safest implementation order
1. Delivery/pricing complaint → constraint wiring + optional resolution/aging of events.
2. Direct fake-proof dispute → Anti-Gaming signal link.
3. Then Process Intelligence over the now-complete proof → dispute → complaint/rework → risk chains.

## Out of scope (per instructions)
Full complaint management / CRM / ticketing / refund / messaging; Process Intelligence; public SaaS /
Product Hunt / billing; broad report cleanup; UI redesign.
