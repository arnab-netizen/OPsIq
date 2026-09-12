# Operational Event Resolution / Aging + Delivery/Pricing Constraint Wiring — PLAN

## Objective
Make per-event complaint/rework events **resolvable, age-sensitive, and business-actionable**, and
wire delivery/pricing/quality complaint categories precisely into the constraint engine, profit-leak
radar, and a new resolution SLO — so OpsIQ distinguishes **unresolved risk** from **resolved noise**.

Minimal by design: NOT full complaint management / CRM / ticketing / refund / customer messaging.

## What the owner gets
1. Which complaint/rework events are still open, and which are overdue (severity-scaled window).
2. Which proof/operator each open event affects, and the biggest current event-derived risk.
3. Whether an open event is a quality, delivery, or pricing constraint / profit leak.
4. Whether resolving an event removed the live risk (and what stays historically true).

## Design
- **Status vocabulary** (carried in the existing `status` TEXT column, no schema change for it):
  `OPEN → IN_REVIEW → RESOLVED | DISMISSED | DUPLICATE`.
- **Aging** (`operational-event-aging.ts`, pure): age from server `createdAt`; severity-scaled overdue
  thresholds (CRITICAL 24h / HIGH 48h / MEDIUM 120h / LOW 240h); an overdue **severe** active event
  triggers escalation/reassessment. `occurredAt` stays untrusted context.
- **Status FSM** (pure `planStatusChange`): fail-closed — RESOLVED/DISMISSED/DUPLICATE require a note,
  DISMISSED additionally requires a reason (no silent drop of a severe event); terminal events lock;
  only IN_REVIEW→OPEN reopen is allowed.
- **Active-vs-historical split:** live-risk aggregates (profit leak / constraint / credibility) count
  only ACTIVE (OPEN/IN_REVIEW) events, so resolving clears the live risk. Historical facts
  (proof→complaint measurability, `PROOF_OUTCOME_INTEGRITY`) keep counting every ever-linked event — a
  resolved complaint does not un-fail a sign-off that genuinely did not hold.
- **Delivery/pricing wiring:** linked delivery/late-service complaints → `DELIVERY` constraint +
  `DELIVERY_DELAY_COST` leak; billing/pricing complaints → `PRICING` constraint + `PRICING_UNDERCHARGE`
  leak, both **NEEDS_DATA** until a real amount/margin is supplied (never a fabricated figure).

## Services / API
- `resolveOperationalEvent`, `dismissOperationalEvent`, `markOperationalEventInReview`,
  `markOperationalEventDuplicate` — governed, audited (`operational_event.status_changed`),
  workspace-scoped, idempotent, concurrency-safe (optimistic guard on the read status).
- `getOperationalEventAgingSummary`, `getOpenOperationalEvents` — reads.
- `POST /api/complaint-rework` extended with `action: resolve | dismiss | in_review | duplicate`.

## SLO
- New `OPERATIONAL_EVENT_RESOLUTION`: PASS (no overdue) / WARN (overdue, not severe) / FAIL (overdue
  severe) / NOT_MEASURABLE (no events). `PROOF_OUTCOME_INTEGRITY` continues consuming linked events.

## Out of scope
Full complaint management / CRM / ticketing / refund / messaging; Process Intelligence; public SaaS /
Product Hunt / billing; UI redesign; browser E2E.
