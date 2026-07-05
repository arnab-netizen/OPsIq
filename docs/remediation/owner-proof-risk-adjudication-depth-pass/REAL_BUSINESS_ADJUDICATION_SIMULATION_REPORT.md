# Real-Business Owner Adjudication — SIMULATION REPORT

**Scenario:** Sparkle Laundry (workspace `wsL`). Operator `opWeak` reused one photo (`fileHash`) as
proof for two different jobs (`taskA`, `taskB`). The reused-hash precheck raised a NEEDS_REVIEW finding.
The owner adjudicates it. Plus a clean workspace (`wsClean`) for isolation. DB-backed
(`proof-risk-adjudication-simulation.db.test.ts`, `TEST_WITH_DB=true`).

## Flow exercised
1. Read the now-view — the reused risk is surfaced (`reusedProofFindings.needsReviewCount = 2`).
2. Owner adjudicates **REQUIRE_FRESH_PROOF** (governed, audited).
3. Owner re-adjudicates the same finding to **DISMISS_FALSE_POSITIVE** (idempotent update + fresh audit).

## Result
| Step | Result |
|---|---|
| Before adjudication | `reusedProofFindings.needsReviewCount = 2`; `proofRiskAdjudications = []` |
| REQUIRE_FRESH_PROOF | `status = ACTIVE`; `proof_risk.adjudicated` audit written; **risk stays visible** (needsReviewCount still 2); `ownerActionRequired = true`; no fraud label |
| Re-adjudicate → DISMISS_FALSE_POSITIVE | `updated = true`, `status = CLEARED`; **1** record (updated in place), **2** audits |
| After DISMISS | `reusedProofFindings.needsReviewCount = 0`; `topGamingSignal` no longer `REUSED_PROOF_PATTERN`; adjudication retained with `status = CLEARED`; **both proofs still exist** (evidence retained) |
| Clean workspace | `proofRiskAdjudications = []`; no reused finding; no `wsL` data leaks in |

## Interpretation for the owner
"OpsIQ flagged that opWeak used the same photo on two jobs. I first said 'require fresh proof' — that
stayed on my radar as active risk, and the decision was recorded and audited. When I looked closer and
saw the jobs were genuinely different, I changed my decision to 'dismiss false positive.' OpsIQ updated
the same record (with a second audit entry), stopped nagging me about it, and — crucially — kept the
original proofs and the full decision history. It never called anyone a fraud; it just let me decide
fairly and remembered what I decided and why."
