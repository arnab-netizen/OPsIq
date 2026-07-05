# Real-Business Adjudication Suppression — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`). Operator `opWeak` reuses one photo hash across jobs,
which surfaces a `REUSED_PROOF_PATTERN` anti-gaming signal, a `REUSED_PROOF` credibility concern, and
reused-hash findings. The owner adjudicates each source and OpsIQ suppresses consistently — without
hiding confirmed or new risk. Plus a clean workspace (`wsClean`) for isolation. DB-backed
(`adjudication-suppression-simulation.db.test.ts`, `TEST_WITH_DB=true`).

## Flow + result
| Step | Result |
|---|---|
| Baseline (proofA, proofB reuse one hash) | `topGamingSignal = REUSED_PROOF_PATTERN`, `topCredibilityConcern = REUSED_PROOF`, `reusedProofFindings = 2`, `ANTI_GAMING_RISK = FAIL` |
| Dismiss **ANTI_GAMING_SIGNAL** [A,B] | gaming signal suppressed + `ANTI_GAMING_RISK` eases; **credibility concern stays** (per-source scope); reused findings stay; `clearedCount = 1`; no fraud label |
| Dismiss **CREDIBILITY_CONCERN** [A,B] | the credibility concern is suppressed too |
| **New evidence**: proofC reuses the same hash (new job) | gaming risk **re-surfaces** (`REUSED_PROOF_PATTERN`); `reusedProofFindings = 3` — a cleared decision never permanently hides future risk |
| **CONFIRM** the gaming signal [A,B,C] | stays visible; `ANTI_GAMING_RISK = FAIL` (confirm is not a clearing decision) |
| Dismiss **REUSED_HASH_FINDING** [A,B] | A + B suppressed from reused findings; **proofC (new evidence) still flagged** |
| Dispute proofC → dismiss **PROOF_DISPUTE** [C] | `PROOF_OUTCOME_INTEGRITY` **stays FAIL** and the `proof.disputed` audit is retained — a dispute adjudication never marks bad proof good |
| Clean workspace | no adjudication state, no reused finding, no `wsL` bleed |

## Interpretation for the owner
"When I told OpsIQ 'this reuse flag is a false positive,' it stopped nagging me about that exact issue —
but only for the thing I dismissed, and only for the proofs I reviewed. The moment opWeak reused the
photo on a NEW job, the risk came right back. When I confirmed the pattern, it stayed on my radar. And
when I dismissed a dispute to cut review noise, OpsIQ still honestly kept the integrity check red and
kept the dispute record — it never quietly turned bad work into good work, and it never called anyone
a fraud."
