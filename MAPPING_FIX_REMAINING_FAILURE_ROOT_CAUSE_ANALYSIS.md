# MAPPING FIX — PHASE 5 REMAINING 11 FAILURE ROOT-CAUSE ANALYSIS

**Date:** 2026-06-17  
**Source:** ALL21_POST_FIX_TRACE.json (final committed code)

---

| Case | Ground Truth | Current Prediction | Correct Gen? | Correct Score | Winner Score | Gap | Primary Failure Stage | Exact Root Cause | Required Fix Type | Risk of Fix |
|---|---|---|---|---|---|---|---|---|---|---|
| BLND-008 | insufficient_evidence | go_to_market_misalignment | NO (ungeneratable) | — | 33 | — | ABSTENTION_REQUIRED | `insufficient_evidence` is not a diagnosis type / has no pattern; system must emit a root cause even when evidence is mixed/uncertain | Add abstention gate (low-confidence / conflicting-signal → INSUFFICIENT_EVIDENCE) | MEDIUM (gate threshold could suppress valid low-conf diagnoses) |
| ADV-011 | insufficient_evidence | unit_economics_breakdown | NO (ungeneratable) | — | 50 | — | ABSTENTION_REQUIRED | Confident UEB asserted (50) on incomplete evidence; no abstention path | Abstention gate | MEDIUM |
| ADV-013 | insufficient_evidence | unit_economics_breakdown | NO (ungeneratable) | — | 26 | — | ABSTENTION_REQUIRED | 0 patterns; floor UEB(26) returned instead of abstaining | Abstention gate (0-pattern / low-conf → abstain) | LOW–MEDIUM |
| ADV-014 | insufficient_evidence | operational_bottleneck | NO (ungeneratable) | — | 50 | — | ABSTENTION_REQUIRED | Confident OB asserted (50) on ambiguous margin-erosion evidence | Abstention gate | MEDIUM |
| ADV-012 | trust_quality_crisis | customer_retention_erosion | YES (rank 2) | 40 | 45 | 5 | WRONG_CANDIDATE_TOO_HIGH | CRE and TQC share the same quality+retention pattern (equal strength); boosting/specificity gives CRE +5 | Ranking/adjudication tie-break refinement (causal precedence quality→retention) | MEDIUM (could regress CRE cases) |
| RW-016 | go_to_market_misalignment | unit_economics_breakdown | NO (not in top-3) | ~0 | 50 | ~50 | WRONG_CANDIDATE_TOO_HIGH | Strength-8 financial+op pattern (UEB/OB) dominates; GTM has only weak str-3 market+retention pattern | Pattern-strength rebalance OR GTM evidence boost | HIGH (touches scoring; explicitly out of scope) |
| RW-022 | unit_economics_breakdown | demand_forecasting_mismatch | YES (rank 3) | 45 | 50 | 5 | WRONG_CANDIDATE_TOO_HIGH | UEB and DFM both str-4; DFM wins by boosting margin | Ranking tie-break (financial-cost precedence over market) | MEDIUM |
| PD-019 | unit_economics_breakdown | demand_forecasting_mismatch | YES (rank 2) | 45 | 50 | 5 | WRONG_CANDIDATE_TOO_HIGH | UEB and DFM both str-6; DFM wins by boosting margin | Ranking tie-break | MEDIUM |
| BLND-009 | operational_bottleneck | trust_quality_crisis | NO | 0 | 29 | — | EVIDENCE_PATTERN_NOT_CREATED | Key-person/succession evidence filed under quality/market dims; no operational_efficiency/team_capability dim → OB pattern cannot fire | Dimension mapping / classifier upstream OR OB reachability from financial+market succession signals | MEDIUM–HIGH |
| RW-024 | operational_bottleneck | brand_erosion | NO | 0 | 10 | — | EVIDENCE_PATTERN_NOT_CREATED | Evidence uses non-canonical dimension `talent_retention` (unrecognized); 0 patterns generated | Canonicalize/alias non-standard dimensions (talent_retention→team_capability) | MEDIUM |
| SYN-013 | customer_retention_erosion | go_to_market_misalignment | YES (rank 3) | 10 | 33 | 23 | CANDIDATE_GENERATED_TOO_LOW | CRE adoption/customer-success signal not captured; non-canonical dims (product_adoption, customer_success) ignored; CRE only reaches floor (10) | Adoption→CRE pattern (Priority 2) + dimension canonicalization | MEDIUM |

---

## ROLL-UP BY PRIMARY FAILURE STAGE

| Stage | Count | Cases |
|---|---|---|
| ABSTENTION_REQUIRED | 4 | BLND-008, ADV-011, ADV-013, ADV-014 |
| WRONG_CANDIDATE_TOO_HIGH (ranking) | 4 | ADV-012, RW-016, RW-022, PD-019 |
| EVIDENCE_PATTERN_NOT_CREATED (dimension) | 2 | BLND-009, RW-024 |
| CANDIDATE_GENERATED_TOO_LOW (mapping/adoption) | 1 | SYN-013 |

## KEY OBSERVATION

After the mapping fix, **pure "diagnosis-not-mapped" failures are essentially eliminated**. The remaining 11 are dominated by two NEW bottlenecks of equal size:
1. **Abstention gap (4):** the system has no `INSUFFICIENT_EVIDENCE` output path and asserts confident wrong answers (3 of 4 at conf 50/26) on cases the answer key marks as insufficient evidence.
2. **Ranking ties (4):** the correct diagnosis is generated but loses by ~5 points to an equal/stronger pattern (the PHASE 2 "equal pattern strength, boosting decides" category — untouched by mapping work).

Plus 2 upstream dimension-recognition failures and 1 adoption-mapping gap.
