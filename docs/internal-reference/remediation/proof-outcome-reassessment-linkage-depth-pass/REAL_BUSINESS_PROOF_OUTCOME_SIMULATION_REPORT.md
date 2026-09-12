# Real-Business Proof→Outcome — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`) — an operator's accepted proof is later reversed,
plus a second clean workspace (`wsClean`) to prove isolation. DB-backed
(`proof-outcome-linkage-simulation.db.test.ts`, `TEST_WITH_DB=true`).

## Seeded persisted state (workspace wsL)
- **Proof 1 (`proofReversed`)** — submitted by operator `opWeak`, reviewed to **ACCEPTED** (5h ago),
  then reviewed to **DISPUTED** (2h ago). Both transitions are real `proof.reviewed` audit events
  with `payload.{fromStatus,toStatus}`, keyed by the proof id.
- **Proof 2 (`proofClean`)** — submitted by `opWeak`, **ACCEPTED** and never reversed (the honest
  denominator).

## Measured result (real, from the audit trail)
| Signal | Measured value | Owner meaning |
|---|---|---|
| `PROOF_TO_BAD_RESULT_LINK` | LINKED, latency **3h** (accept→dispute) | An accepted proof was reversed 3h later. |
| `PROOF_OUTCOME_INTEGRITY` SLO | **FAIL** — 50% reversed (1/2 accepted) | Half of accepted proof did not hold up. |
| Credibility | `ACCEPTED_PROOF_WITH_BAD_OUTCOME` for `opWeak` (top concern) | This operator's sign-offs can't be trusted at face value. |
| `REASSESSMENT_LATENCY` | now **measured** (an open reassessment exists) | OpsIQ opened a correction after the contradiction. |
| Reassessment | 1 governed `OwnerReassessmentEvent`, keyed `sourceProofId=proofReversed`, audited, **idempotent** | The reassessment loop fired once, not twice, on the same cause. |

`PROOF_OUTCOME_INTEGRITY` was **NOT_MEASURABLE** before this pass — it is now a measured FAIL from
real persisted timestamps, and OpsIQ created a governed reassessment keyed to the exact proof.

## Honest missing-data + isolation (workspace wsClean)
- `getProofOutcomeLinkage(wsClean)` → `measurable:false`, 0 contradictions.
- Live now-view: `PROOF_OUTCOME_INTEGRITY` = **NOT_MEASURABLE** (no fabricated failure with no data).
- **No bleed:** none of the laundry's links (`proofReversed`) appear in `wsClean`; every link echoes
  its own `workspaceId`.

## Interpretation for the owner
"An accepted proof from opWeak was disputed 3 hours later — that sign-off wasn't reliable. OpsIQ
marked opWeak's evidence as a credibility concern and opened a reassessment tied to that exact
proof. Re-verify opWeak's other recent accepted work before trusting it." That is a concrete,
owner-visible trust judgement built on real records — not a guess, and not a fabricated linkage.
