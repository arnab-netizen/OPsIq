# Real-Business Proof-Evidence — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`). Operator `opWeak` reviews their OWN proofs
(self-review — separation of duty bypassed) on two jobs. Previously the self-review signal had no
proof IDs and could not be adjudicated; now it carries the exact supporting proofs. Plus a clean
workspace (`wsClean`) for isolation. DB-backed (`proof-evidence-lists-simulation.db.test.ts`,
`TEST_WITH_DB=true`).

## Flow + result
| Step | Result |
|---|---|
| Baseline (p1, p2 self-reviewed) | `topGamingSignal = SELF_REVIEW_ATTEMPT`, `sourceCompleteness = COMPLETE`, `supportingProofIds = [p1, p2]`; `topCredibilityConcern = SELF_REVIEW_BLOCKED_OR_ATTEMPTED` (2 proofs); `ANTI_GAMING_RISK = FAIL`; no fraud label |
| Dismiss **ANTI_GAMING_SIGNAL** [p1,p2] | self-review gaming signal **suppressed** (now adjudicable) + `ANTI_GAMING_RISK` eases; the credibility concern (different source) stays visible |
| Dismiss **CREDIBILITY_CONCERN** [p1,p2] | the self-review credibility concern is suppressed too |
| **New evidence**: p3 self-reviewed | `topGamingSignal = SELF_REVIEW_ATTEMPT` **re-surfaces** (p3 not cleared); `ANTI_GAMING_RISK = FAIL` |
| Clean workspace | no self-review signal, no adjudication, no `wsL` bleed |

## Interpretation for the owner
"OpsIQ flagged that opWeak signed off on their own two jobs — and now it shows me exactly which two
proofs that's based on. Because it names the proofs, I can fairly decide: 'that was an authorised solo
shift, dismiss it,' and OpsIQ stops nagging me about those exact two. The moment opWeak self-reviews a
THIRD job, the flag comes right back — a cleared decision never hides future self-review. Nothing is
called fraud; I just get evidence-backed flags I can act on."
