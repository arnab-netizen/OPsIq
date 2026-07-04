# Profit-Leak Radar — Report

**Classification:** `PROFIT_LEAK_RADAR_REAL_AND_OWNER_VISIBLE`
**Code:** `src/domain/owner-mode/profit-leak-radar.ts` (pure), integrated in
`src/services/owner-guidance/owner-now-view.service.ts`, surfaced via `GET /api/owner/now-view`
(`payload.topProfitLeak`). Opportunity integration in `opportunity-decision-envelope.ts`.
**Tests:** `src/__tests__/owner-mode/profit-leak-radar.test.ts` (16),
`src/__tests__/owner-mode/profit-leak-radar-simulation.db.test.ts` (3 DB).

## What it answers
"Where is this business losing money, margin, cash, retention, or owner leverage right now?" — the
single highest-value leak, not a flood.

## Leak types
`DISCOUNT_LEAK, PRICING_UNDERCHARGE, LOW_MARGIN_B2B, CASH_RISK_GROWTH, COMPLAINT_REVENUE_RISK,
REWORK_REDO_COST, REPEAT_CUSTOMER_DECLINE, CUSTOMER_CHURN_RISK, STAFF_PRODUCTIVITY_DROP,
WEAK_PROOF_REWORK_RISK, DELIVERY_DELAY_COST, OWNER_BOTTLENECK_COST, CAPACITY_UNDERUSE,
EQUIPMENT_UNDERUSE, DATA_INSUFFICIENT`.

## Finding shape (all 20 required fields)
workspaceId, leakType, domain, severity, confidence, evidence[], missingData[], estimatedImpact
{tier, rangeLow?, rangeHigh?, note}, cashImpact, marginImpact, ownerExplanation, recommendedAction,
ownerApprovalRequired, riskLevel, operationalBurden, successMetric, stopLoss, reassessmentTrigger,
relatedConstraint, evaluatedAt (+ internal leakScore).

## Honesty / no fabricated ROI
- Reports REAL figures only: the period discount amount and revenue are data; the recoverable portion
  is explicitly owner judgment (`rangeLow: 0, rangeHigh: discount`, note: "not a guaranteed saving").
- Margin is never invented — there is no 0..1 margin source in the now-view, so margin-dependent leaks
  carry LOW confidence or `NEEDS_DATA` with the exact gap.
- No signal + no data -> `DATA_INSUFFICIENT` with exact missing data.

## Determinism
Ranked by severity weight + impact-tier weight + type priority (direct cash/margin leaks rank above
indirect on ties). Same signals -> same top leak + leakScore (unit-tested; re-verified across two live
now-view reads in the DB simulation).

## Integration (not a disconnected radar)
1. Owner Now View exposes one `topProfitLeak`.
2. Each leak links the current binding constraint (Constraint Engine).
3. Owner Workload Budget feeds the OWNER_BOTTLENECK_COST leak.
4. Opportunity envelope: an active cash/margin leak (discount/pricing/low-margin-B2B/cash-risk)
   owner-gates the opportunity and caps its upside — do not scale volume through a leak.
5. Reassessment: recomputed on each now-view read; state changes shift the top leak.
