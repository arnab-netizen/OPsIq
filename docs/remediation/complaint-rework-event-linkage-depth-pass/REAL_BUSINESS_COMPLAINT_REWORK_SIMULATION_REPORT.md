# Real-Business Complaint / Rework — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`) — an operator's accepted proof is contradicted by a
real customer quality complaint, recorded + linked as a per-event `OperationalEvent`. Plus a clean
workspace (`wsClean`) for isolation. DB-backed (`complaint-rework-simulation.db.test.ts`,
`TEST_WITH_DB=true`).

## Flow exercised
1. Operator `opWeak` submits a photo proof; reviewer **ACCEPTS** it.
2. Owner records a **QUALITY_COMPLAINT** ("customer says stain remained after wash") **linked to the
   accepted proof** via the live `recordOperationalEvent` service. A cross-workspace record is refused;
   re-linking the same proof is idempotent.

## Result (real, from the linked event)
| Layer | Result |
|---|---|
| Linkage service | `proofComplaintMeasurable = true`; `complaintLinkedCount = 1`; attributed to `opWeak` |
| Profit-Leak Radar (now-view) | **topProfitLeak = COMPLAINT_REVENUE_RISK** |
| Evidence Credibility | **topCredibilityConcern = ACCEPTED_PROOF_WITH_COMPLAINT** (opWeak) |
| Proof→Outcome | **PROOF_TO_COMPLAINT_LINK = LINKED** (was NOT_MEASURABLE) |
| Business-Control SLO | `PROOF_OUTCOME_INTEGRITY` = **FAIL** (now consumes the complaint) |
| Reassessment | disputing the proof creates **1** reassessment (idempotent on repeat) |

Before this pass, proof→complaint was NOT_MEASURABLE and a complaint only moved period aggregates.
Now a **specific customer complaint is tied to the specific accepted proof and the operator who
produced it**, and it flows through profit, credibility, and the integrity SLO.

## Honest missing-data + isolation (workspace wsClean)
- `getComplaintReworkLinks(wsClean)` → `complaintLinkedCount = 0`; no `wsL` event bleeds in.
- Clean-workspace now-view `topProfitLeak` is not `COMPLAINT_REVENUE_RISK`.
- No financial figure was invented — impact stays qualitative (NEEDS_DATA) because no amount was supplied.

## Interpretation for the owner
"The stain complaint is now tied to the exact job opWeak did and the reviewer accepted. OpsIQ shows
it as my top profit-leak risk (complaint revenue), flags opWeak's proof as accepted-with-complaint,
fails proof integrity, and opens a reassessment — all from one recorded complaint. It won't guess the
dollar loss unless I enter one."
