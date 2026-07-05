# Dispute Category → Profit-Leak + Constraint Wiring — PLAN

**Branch:** `claude/dispute-profit-constraint-wiring-depth-pass`
**Base:** `origin/main` @ `dc18ca6e` (Governed Proof Dispute Surface, PR #115, merged).

## Objective
Make governed proof disputes affect **business-risk intelligence**, not only proof integrity: a
disputed accepted proof must be able to drive the Profit-Leak Radar, the Constraint Engine, and the
Owner Now View — using the existing dispute category + `proof.disputed` audit record, inventing no
complaint/rework rows and fabricating no revenue/churn/margin figure.

## Source (no new data, no new schema)
The dispute service (PR #115) already persists a `proof.disputed` audit event carrying
`disputeCategory` + `reason`, keyed by proofId. This pass reads that trail and maps categories into
Profit-Leak + Constraint drivers. No schema change.

## Category → business-risk mapping
| Category | Profit leak | Constraint |
|---|---|---|
| REWORK_REQUIRED | REWORK_REDO_COST | QUALITY |
| QUALITY_FAILURE | REWORK_REDO_COST | QUALITY |
| BAD_OUTCOME | REWORK_REDO_COST | QUALITY |
| CUSTOMER_COMPLAINT | COMPLAINT_REVENUE_RISK | QUALITY |
| WRONG_OR_INSUFFICIENT_PROOF | WEAK_PROOF_REWORK_RISK | STAFF |
| SUSPECTED_FAKE_OR_REUSED_PROOF | WEAK_PROOF_REWORK_RISK | STAFF |
| MANAGER_REVIEW_ERROR | WEAK_PROOF_REWORK_RISK | MANAGER |
| OTHER | (none — not overclassified) | (none) |

Financial impact is always **qualitative (NEEDS_DATA)** — no per-event complaint/rework model exists,
so no revenue/churn/redo number is fabricated.

## Layering (no orphan path)
1. `src/domain/owner-mode/dispute-risk.ts` — pure: the mapping table, the `DisputeRiskSignal`
   (full required shape), aggregate counts, and the ranked `topRisk`.
2. `src/services/owner-mode/dispute-risk.service.ts` — reads `proof.disputed` audits (90-day,
   workspace-scoped) → records → analysis.
3. `profit-leak-radar.ts` / `constraint-engine.ts` — extended with dispute count inputs +
   dispute-attributed findings that **compete in the existing top-leak / top-constraint selection**.
4. `owner-now-view.service.ts` — feeds the aggregate counts into both engines and exposes
   `disputeRisk` (the structured, attributable signals) on the payload.

## Honesty
No fake revenue/churn/margin (NEEDS_DATA); OTHER not overclassified; missing complaint/rework model
disclosed on each signal; existing credibility + `PROOF_OUTCOME_INTEGRITY` behaviour unchanged (not
duplicated); reassessment not duplicated; workspace-scoped with isolation tested.
