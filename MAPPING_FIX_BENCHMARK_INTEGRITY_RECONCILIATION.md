# MAPPING FIX — PHASE 1 BENCHMARK INTEGRITY RECONCILIATION

**Date:** 2026-06-17  
**Method:** Independent reconciliation from saved JSON + 3 harness re-runs (not trusting the report prose)

---

## VERIFICATION CHECKLIST

| Check | Result |
|---|---|
| All 21 cases executed | YES (21 entries in benchmark JSON; 21 in all-21 trace) |
| Answer keys loaded correctly | YES (spot-checked ADV-011 → INSUFFICIENT_EVIDENCE matches benchmark `expected`) |
| Predictions loaded correctly | YES (3 harnesses agree on the 10 correct cases) |
| Correct count == 10 | YES |
| Incorrect count == 11 | YES |
| Duplicate cases | NONE (21 distinct IDs) |
| Missing cases | NONE |
| Skipped-as-correct | NONE |
| Old output mixed with new | One stale artifact found & corrected (FORENSIC_SCORE_TRACE_LOGS.json — see note) |
| Benchmark harness changed scoring | NO (harness untouched; uses production path) |
| Zero regressions claim | TRUE (all 8 baseline-correct preserved) |
| +2 improvement claim | TRUE (BLND-006, BLND-010 newly correct) |
| 10/21 reproducible | YES — reproduced 3× independently |

## RECONCILIATION TABLE (authoritative)

Baseline correctness set (SLICE_7, locked): {BLND-007, RW-018, RW-020, PD-011, PD-013, PD-015, PD-017, SYN-011} = 8 correct. No failing case was ever correct at baseline.

| Case | Ground Truth | Pre-Fix Correct? | Post-Fix Prediction | Post-Fix Correct? | Status |
|---|---|---|---|---|---|
| BLND-006 | demand_forecasting_mismatch | NO | demand_forecasting_mismatch | YES | **NEWLY_CORRECT** |
| BLND-007 | go_to_market_misalignment | YES | go_to_market_misalignment | YES | PRESERVED_CORRECT |
| BLND-008 | insufficient_evidence | NO | go_to_market_misalignment | NO | PRESERVED_INCORRECT |
| BLND-009 | operational_bottleneck | NO | trust_quality_crisis | NO | PRESERVED_INCORRECT |
| BLND-010 | strategic_pricing_error | NO | strategic_pricing_error | YES | **NEWLY_CORRECT** |
| ADV-011 | insufficient_evidence | NO | unit_economics_breakdown | NO | PRESERVED_INCORRECT |
| ADV-012 | trust_quality_crisis | NO | customer_retention_erosion | NO | PRESERVED_INCORRECT |
| ADV-013 | insufficient_evidence | NO | unit_economics_breakdown | NO | PRESERVED_INCORRECT |
| ADV-014 | insufficient_evidence | NO | operational_bottleneck | NO | PRESERVED_INCORRECT |
| RW-016 | go_to_market_misalignment | NO | unit_economics_breakdown | NO | PRESERVED_INCORRECT |
| RW-018 | unit_economics_breakdown | YES | unit_economics_breakdown | YES | PRESERVED_CORRECT |
| RW-020 | unit_economics_breakdown | YES | unit_economics_breakdown | YES | PRESERVED_CORRECT |
| RW-022 | unit_economics_breakdown | NO | demand_forecasting_mismatch | NO | PRESERVED_INCORRECT |
| RW-024 | operational_bottleneck | NO | brand_erosion | NO | PRESERVED_INCORRECT |
| PD-011 | unit_economics_breakdown | YES | unit_economics_breakdown | YES | PRESERVED_CORRECT |
| PD-013 | operational_bottleneck | YES | operational_bottleneck | YES | PRESERVED_CORRECT |
| PD-015 | unit_economics_breakdown | YES | unit_economics_breakdown | YES | PRESERVED_CORRECT |
| PD-017 | demand_forecasting_mismatch | YES | demand_forecasting_mismatch | YES | PRESERVED_CORRECT |
| PD-019 | unit_economics_breakdown | NO | demand_forecasting_mismatch | NO | PRESERVED_INCORRECT |
| SYN-011 | trust_quality_crisis | YES | trust_quality_crisis | YES | PRESERVED_CORRECT |
| SYN-013 | customer_retention_erosion | NO | go_to_market_misalignment | NO | PRESERVED_INCORRECT |

**Tally:** PRESERVED_CORRECT = 8, NEWLY_CORRECT = 2, PRESERVED_INCORRECT = 11, REGRESSED = 0. Total correct = 10/21. ✓

## INTEGRITY CAVEAT (material, but does not invalidate the 10/21 result)

The benchmark harness stores **hardcoded `slice7Predicted` baseline strings**. For several cases these do NOT match the actual pre-fix code behavior observed in the original forensic traces:

| Case | Benchmark `slice7Predicted` | Actual pre-fix forensic prediction |
|---|---|---|
| BLND-009 | GO_TO_MARKET_MISALIGNMENT | trust_quality_crisis |
| RW-024 | UNIT_ECONOMICS_BREAKDOWN | brand_erosion (0 patterns) |
| BLND-006 | GO_TO_MARKET_MISALIGNMENT | trust_quality_crisis |

**Implication:** the benchmark's `changed`/`slice7Predicted` fields are unreliable for tracking *intermediate prediction shifts*. HOWEVER, the **correctness-level** invariant is robust and independently verified: the 8 baseline-correct cases are stable, and exactly 2 new cases became correct. The +2/zero-regression conclusion stands. The unreliable field is the intermediate prediction label, not the correct/incorrect outcome.

## CONCLUSION

**Benchmark integrity: VERIFIED at the correctness level. 10/21 is real and reproduced 3×. Zero regressions confirmed. +2 confirmed.** One stale trace artifact was corrected; one harness baseline-label inconsistency is documented (non-fatal).
