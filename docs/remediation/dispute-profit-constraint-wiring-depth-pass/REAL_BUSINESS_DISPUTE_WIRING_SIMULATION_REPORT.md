# Real-Business Dispute Wiring — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`) — an operator's accepted proof is disputed for
rework, and the governed dispute is shown to move the business-risk layer (not only proof
integrity). Plus a clean workspace (`wsClean`) for isolation. DB-backed
(`dispute-risk-simulation.db.test.ts`, `TEST_WITH_DB=true`).

## Flow exercised
1. Operator `opWeak` submits a photo proof; reviewer **ACCEPTS** it.
2. Reviewer disputes it via the **live dispute service** — category `REWORK_REQUIRED`, "customer
   returned item — rewash required" (writes the `proof.disputed` audit).

## Result (real, from the persisted dispute record)
| Layer | Result |
|---|---|
| Dispute-risk service | maps the dispute → **REWORK_REDO_COST** (profit) + **QUALITY** (constraint); `disputeReworkCount=1`, `disputeQualityCount=1` |
| Profit-Leak Radar (via now-view) | **topProfitLeak = REWORK_REDO_COST**, evidence "disputed as rework/quality failure", impact **NEEDS_DATA** (no fabricated redo cost) |
| Constraint Engine (via now-view) | **topConstraint = QUALITY** |
| Proof integrity | `PROOF_OUTCOME_INTEGRITY` = **FAIL** (unchanged, not duplicated) |
| Credibility | `ACCEPTED_PROOF_WITH_BAD_OUTCOME` (unchanged) |
| Reassessment | **1** row (not duplicated) |

Before this pass the dispute only moved proof integrity + credibility; now the same governed
dispute makes **rework cost the top profit leak** and **quality the binding constraint** — the
business-risk layer reacts, with no invented complaint/rework record and no fabricated revenue.

## Honest missing-data + isolation (workspace wsClean)
- `getDisputeRiskAnalysis(wsClean)` → `total:0`; no `wsL` dispute bleeds in.
- Clean-workspace now-view `topProfitLeak` is not dispute-derived (no fabricated dispute risk).

## Interpretation for the owner
"The rewash I disputed isn't just a bad proof anymore — OpsIQ now tells me rework cost is my top
profit leak and quality is the constraint holding the business back, and points me at the SOP/proof
fix first. It still says the revenue impact is unmeasured, because there's no complaint model yet —
it won't guess a number."
