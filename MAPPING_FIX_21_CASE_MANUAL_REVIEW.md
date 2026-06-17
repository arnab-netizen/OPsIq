# MAPPING FIX — PHASE 8 MANUAL REVIEW OF ALL 21 CASES

**Date:** 2026-06-17  
**Source:** ALL21_POST_FIX_TRACE.json + Round 2 answer keys

Judgments: VALID_CORRECT / QUESTIONABLE_CORRECT / VALID_INCORRECT / QUESTIONABLE_INCORRECT / BENCHMARK_AMBIGUOUS / SHOULD_ABSTAIN_INSUFFICIENT_EVIDENCE

---

| Case | GT | Predicted (conf) | Judgment | Evidence justification | Conf appropriate? | Acceptable for Stage A? |
|---|---|---|---|---|---|---|
| BLND-006 | demand_forecasting_mismatch | demand_forecasting_mismatch (50) | VALID_CORRECT | CAC pressure + competitive deceleration + stable NPS/repeat = demand signature | YES | YES |
| BLND-007 | go_to_market_misalignment | go_to_market_misalignment (38) | VALID_CORRECT | Positioning/channel evidence; correct though narrow margin (4) | OK (slightly low) | YES |
| BLND-008 | insufficient_evidence | go_to_market_misalignment (33) | SHOULD_ABSTAIN_INSUFFICIENT_EVIDENCE | Deal-structure/value not quantified; system cannot abstain | NO (asserts at 33) | NO |
| BLND-009 | operational_bottleneck | trust_quality_crisis (29) | VALID_INCORRECT | Key-person/succession evidence not in op/team dim → OB unreachable | Low conf limits harm | NO |
| BLND-010 | strategic_pricing_error | strategic_pricing_error (50) | VALID_CORRECT | Explicit pricing power / willingness-to-pay / under-monetization | YES | YES |
| ADV-011 | insufficient_evidence | unit_economics_breakdown (50) | SHOULD_ABSTAIN_INSUFFICIENT_EVIDENCE | Incomplete decline analysis; **false high-confidence (50)** | NO (over-confident) | NO (safety) |
| ADV-012 | trust_quality_crisis | customer_retention_erosion (45) | QUESTIONABLE_INCORRECT / BENCHMARK_AMBIGUOUS | Churn↑, NRR↓, no cohort/quality split; CRE vs TQC genuinely close (gap 5) | Borderline | PARTIAL (defensible miss) |
| ADV-013 | insufficient_evidence | unit_economics_breakdown (26) | SHOULD_ABSTAIN_INSUFFICIENT_EVIDENCE | Conflicting cohort vs blended economics; low conf (26) — least harmful | Borderline (low) | NO |
| ADV-014 | insufficient_evidence | operational_bottleneck (50) | SHOULD_ABSTAIN_INSUFFICIENT_EVIDENCE | Margin erosion ambiguous (mix shift vs softness); **false high-confidence (50)** | NO (over-confident) | NO (safety) |
| RW-016 | go_to_market_misalignment | unit_economics_breakdown (50) | VALID_INCORRECT | Strong str-8 financial+op pattern dominates; GTM under-ranked | NO (confident wrong) | NO |
| RW-018 | unit_economics_breakdown | unit_economics_breakdown (50) | VALID_CORRECT | CAC/payback/margin evidence | YES | YES |
| RW-020 | unit_economics_breakdown | unit_economics_breakdown (50) | VALID_CORRECT | Unit-economics evidence | YES | YES |
| RW-022 | unit_economics_breakdown | demand_forecasting_mismatch (50) | VALID_INCORRECT | Cost-per-unit rising = UEB; lost to DFM by 5 (ranking tie) | NO (confident wrong) | NO |
| RW-024 | operational_bottleneck | brand_erosion (10) | VALID_INCORRECT | Non-canonical `talent_retention` dim → 0 patterns; floor guess | Low conf limits harm | NO |
| PD-011 | unit_economics_breakdown | unit_economics_breakdown (50) | VALID_CORRECT | Unit-economics evidence | YES | YES |
| PD-013 | operational_bottleneck | operational_bottleneck (50) | VALID_CORRECT | Capacity/throughput evidence; Pattern 11 reinforced | YES | YES |
| PD-015 | unit_economics_breakdown | unit_economics_breakdown (50) | VALID_CORRECT | Unit-economics evidence | YES | YES |
| PD-017 | demand_forecasting_mismatch | demand_forecasting_mismatch (50) | VALID_CORRECT | Demand/market evidence | YES | YES |
| PD-019 | unit_economics_breakdown | demand_forecasting_mismatch (50) | VALID_INCORRECT | Cost-per-mile rising = UEB; lost to DFM by 5 (ranking tie) | NO (confident wrong) | NO |
| SYN-011 | trust_quality_crisis | trust_quality_crisis (65) | VALID_CORRECT | Reliability/quality + churn evidence; robust margin (19) | YES | YES |
| SYN-013 | customer_retention_erosion | go_to_market_misalignment (33) | VALID_INCORRECT | Adoption/CS failure (TTFV, CSM ratio); CRE under-generated (floor 10) | NO (wrong winner) | NO |

---

## SUMMARY

| Judgment | Count | Cases |
|---|---|---|
| VALID_CORRECT | 10 | BLND-006/007/010, RW-018/020, PD-011/013/015/017, SYN-011 |
| SHOULD_ABSTAIN_INSUFFICIENT_EVIDENCE | 4 | BLND-008, ADV-011, ADV-013, ADV-014 |
| VALID_INCORRECT | 5 | BLND-009, RW-016, RW-022, PD-019, SYN-013 |
| QUESTIONABLE_INCORRECT / AMBIGUOUS | 1 | ADV-012 |
| QUESTIONABLE_CORRECT | 0 | — |

## REVIEWER NOTES

- **All 10 correct predictions are VALID_CORRECT** — none is accidental; evidence supports each.
- **4 cases should abstain.** 2 of them (ADV-011, ADV-014) assert a wrong root cause at **confidence 50 — false high-confidence answers, the most serious quality/safety issue in the set.** An abstention gate would convert all 4 to acceptable behavior and remove the 2 over-confident wrong answers.
- **3 confident wrong answers among ranking failures** (RW-016, RW-022, PD-019 — all @50): the correct diagnosis is present but loses by ≤5 (RW-022/PD-019) or is under-ranked (RW-016). These need ranking/adjudication work (out of scope here).
- **ADV-012** is a defensible near-miss (CRE vs TQC), arguably benchmark-ambiguous.
