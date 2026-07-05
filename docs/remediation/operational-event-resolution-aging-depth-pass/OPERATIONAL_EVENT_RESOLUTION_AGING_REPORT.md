# Operational Event Resolution / Aging — REPORT

**Classification:** `OPERATIONAL_EVENT_RESOLUTION_AGING_REAL_AND_OWNER_VISIBLE`
(+ `CONSTRAINT_ENGINE_STRENGTHENED`, `PROFIT_LEAK_RADAR_STRENGTHENED`, `BUSINESS_CONTROL_SLO_STRENGTHENED`).

## A. Files created
- `src/domain/execution/operational-event-aging.ts` — pure status FSM + severity aging + summary.
- `prisma/migrations/20260705150000_operational_event_resolution/migration.sql` — 2 additive columns.
- `src/__tests__/execution/operational-event-aging.test.ts` — 8 domain tests.
- `src/__tests__/execution/operational-event-aging-simulation.db.test.ts` — 4 DB simulation tests.
- Docs under `docs/remediation/operational-event-resolution-aging-depth-pass/`.

## B. Files changed
- `prisma/schema.prisma` — `OperationalEvent.resolvedByUserId`, `resolutionNote`; status comment.
- `src/domain/constants/audit-events.ts` — `OPERATIONAL_EVENT_STATUS_CHANGED`.
- `src/domain/execution/complaint-rework.ts` — active-only risk aggregates + historical measurement
  split; `eventHealth` aging summary; delivery/pricing measured impacts.
- `src/services/execution/complaint-rework.service.ts` — resolve/dismiss/in-review/duplicate +
  `getOperationalEventAgingSummary` / `getOpenOperationalEvents`; select resolution columns.
- `src/domain/owner-mode/constraint-engine.ts` — `complaintDeliveryCount` → DELIVERY,
  `complaintPricingCount` → PRICING (NEEDS_DATA without margin evidence).
- `src/domain/owner-mode/profit-leak-radar.ts` — delivery/pricing complaint signals → DELIVERY_DELAY_COST
  / PRICING_UNDERCHARGE (measured only when an amount is supplied).
- `src/domain/owner-mode/business-control-slo.ts` — `OPERATIONAL_EVENT_RESOLUTION` SLO.
- `src/services/owner-guidance/owner-now-view.service.ts` — feed delivery/pricing counts; expose
  `operationalEventHealth`; wire the resolution SLO.
- `src/app/api/complaint-rework/route.ts` — resolve/dismiss/in_review/duplicate actions.
- Existing tests extended: complaint-rework (domain/service), constraint-engine, profit-leak-radar,
  business-control-slo.

## C. Schema changes
`operational_events`: `resolved_by_user_id UUID?`, `resolution_note TEXT?` — additive, backfill-safe,
non-destructive (nullable, no default). Status vocabulary needs no column change.

## D. Backend logic
Status FSM + aging (pure) → governed status-change service (idempotent, concurrency-safe, atomic audit)
→ active-vs-historical aggregate split → constraint/radar/SLO/now-view integration.

## E. Frontend logic
None (backend + API only; no UI this pass).

## F. Acceptance criteria
- Age from server `createdAt`; overdue is severity-scaled; overdue-severe escalates. ✓
- Resolution requires a note; dismissal requires a reason; terminal locks; idempotent + audited. ✓
- Delivery/late-service → DELIVERY; billing/pricing → PRICING (NEEDS_DATA w/o margin). ✓
- Resolved event stops driving top leak/constraint; integrity stays FAIL (historical). ✓
- `OPERATIONAL_EVENT_RESOLUTION` SLO PASS/WARN/FAIL/NOT_MEASURABLE. ✓
- Now-view exposes `operationalEventHealth`. ✓
- No fabricated financial impact; cross-workspace isolation tested. ✓

## G. Known limitations
- Financial impact stays qualitative unless a real amount is entered on the event.
- Constraint wiring covers QUALITY/DELIVERY/PRICING; CUSTOMER_RETENTION from complaints still needs
  repeat-customer data (unchanged this pass).
- Fake-proof → anti-gaming link and UI + browser E2E remain future work.
- `NOW_VIEW_SIGNAL_COMPLETENESS` intentionally left at its 5 core signals; event health is graded by
  the dedicated `OPERATIONAL_EVENT_RESOLUTION` SLO instead (avoids redefining a stable metric).

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md`.

## I. Trigger map
record (backdated) → overdue → now-view shows open/overdue + DELIVERY constraint + DELIVERY_DELAY_COST
+ OPERATIONAL_EVENT_RESOLUTION FAIL + PROOF_OUTCOME_INTEGRITY FAIL → resolve(note) → live risk clears,
resolution SLO PASS, integrity stays FAIL.

## J. Failure modes covered
Missing note/reason (fail-closed); terminal re-transition (rejected); cross-workspace mutation
(fail-closed); concurrent transition (optimistic guard → idempotent); empty workspace (no fabrication);
no amount (NEEDS_DATA, never invented).

## K. Events emitted
`operational_event.status_changed` (payload: fromStatus, toStatus, outcome, reason).

## L. Automated tests
23 new (8 aging domain + 4 service + 2 constraint + 2 radar + 1 SLO + 2 complaint-rework domain +
4 DB simulation). Changed-area suites green; see the ledgers.
