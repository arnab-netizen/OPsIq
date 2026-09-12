# Current Status Update — Dispute → Profit/Constraint Wiring

- **Base:** `origin/main` @ `dc18ca6e` (Governed Proof Dispute Surface, PR #115, merged).
- **Branch:** `claude/dispute-profit-constraint-wiring-depth-pass`.
- **Classification:** `DISPUTE_PROFIT_CONSTRAINT_WIRING_REAL_AND_OWNER_VISIBLE`.

## What dispute categories now affect
A governed proof dispute now drives business-risk intelligence, not only proof integrity:
- **Profit-Leak Radar:** REWORK_REQUIRED/QUALITY_FAILURE/BAD_OUTCOME → REWORK_REDO_COST;
  CUSTOMER_COMPLAINT → COMPLAINT_REVENUE_RISK; WRONG/FAKE/MANAGER_ERROR → WEAK_PROOF_REWORK_RISK.
- **Constraint Engine:** quality categories → QUALITY; wrong/fake proof → STAFF; manager error → MANAGER.
- **Owner Now View:** `topProfitLeak` / `topConstraint` can now be dispute-derived; the payload also
  exposes a `disputeRisk` block (attributable per-proof signals).

## What the owner can use now
After disputing accepted proof (`POST /api/proof/dispute`), the now-view shows the resulting profit
leak (e.g. rework cost) and binding constraint (e.g. quality), with a concrete first corrective
action — alongside the existing integrity SLO and credibility concern.

## SLO / integration impact
`PROOF_OUTCOME_INTEGRITY` remains the direct proof SLO (unchanged, not duplicated). Dispute-derived
profit/constraint findings compete in the existing top-selection, so they surface only when they are
the highest-priority risk (owner is not flooded).

## What remains missing
- Per-event complaint/rework models — dispute financial impact stays qualitative (NEEDS_DATA); no
  revenue/churn/redo number is fabricated.
- Direct Anti-Gaming re-fire from fake-proof disputes (currently feeds STAFF constraint + weak-proof leak).
- UI + browser E2E.

## Remaining restrictions
Dispute financial sizing needs a complaint/rework model; without it, impact is qualitative.

## Next safest implementation order
1. Minimal per-event complaint/rework model (unlocks measured revenue/redo impact + the last
   proof→outcome edge).
2. Direct fake-proof dispute → Anti-Gaming signal link.
3. Then Process Intelligence over the now-live, trustworthy dispute→risk chains.

## Out of scope (per instructions)
Process Intelligence; public SaaS / Product Hunt / billing; broad complaint-management module; UI redesign.
