# Real-Business Proof Dispute — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`) — an operator's accepted proof is disputed after the
customer returned the item for a rewash; plus a clean workspace (`wsClean`) for isolation. DB-backed,
LIVE dispute service (`proof-dispute-simulation.db.test.ts`, `TEST_WITH_DB=true`).

## Flow exercised
1. Operator `opWeak` submits a photo proof; reviewer **ACCEPTS** it (real `proof.reviewed→ACCEPTED` audit).
2. Later, the customer returns the item → reviewer disputes it via the **live `disputeAcceptedProof`
   service** (category `REWORK_REQUIRED`, reason "customer returned item — rewash required").

## Governed result (real, end-to-end)
| Check | Result |
|---|---|
| SoD | `opWeak` disputing their own proof → **blocked**, proof stays ACCEPTED |
| Cross-workspace | disputing `wsL`'s proof from `wsClean` → **fails closed** (not found) |
| Reversal | proof ACCEPTED → **DISPUTED**, `reviewReason` persisted |
| Atomic audit | `proof.reviewed(ACCEPTED→DISPUTED)` **and** `proof.disputed` (full record) both written |
| Reassessment | governed `OwnerReassessmentEvent` created, keyed `sourceProofId`; **idempotent** (2nd dispute → 1 row) |
| Linkage | `getProofOutcomeLinkage` measures **contradictedCount=1** of 1 accepted |
| SLO | live now-view `PROOF_OUTCOME_INTEGRITY` = **FAIL** (100% reversed) |
| Credibility | `topCredibilityConcern` = **ACCEPTED_PROOF_WITH_BAD_OUTCOME** |
| Now-view | `proofOutcomeLinkage` surfaced with the contradiction |

## Honest missing-data + isolation (workspace wsClean)
- `getProofOutcomeLinkage(wsClean)` → `measurable:false`; no `wsL` proof bleeds in.
- Live now-view `PROOF_OUTCOME_INTEGRITY` = **NOT_MEASURABLE** (no fabricated failure).

## Interpretation for the owner
"The customer returned a job opWeak submitted and the reviewer accepted. I disputed that proof as
rework-required. OpsIQ reversed the sign-off (audited), flagged opWeak's evidence as a credibility
concern, opened a reassessment tied to that exact proof, and dropped proof-integrity to FAIL — and it
refused to let opWeak dispute their own work or a job in another business." A real governed challenge
to accepted proof, driven by real business reality, with no fabricated complaint record.
