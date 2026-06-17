# ABSTENTION GATE — BENCHMARK COMPARISON

**Date:** 2026-06-17  
**Baseline:** mapping fix = 10/21 (47.6%)  
**Abstention gate:** 13/21 (61.9%), abstention-aware scoring

---

## HEADLINE

| Metric | Mapping fix | Abstention gate | Δ |
|---|---|---|---|
| Correct (diagnosis + valid abstention) | 10/21 (47.6%) | **13/21 (61.9%)** | +3 / +14.3pp |
| Abstentions emitted | 0 | 4 | +4 |
| Correct abstentions (GT = insufficient_evidence) | 0 | 3 | +3 |
| Wrong abstentions | 0 | 1 | +1 |
| Valid-correct regressions | — | **0** | 0 |
| False-high-confidence wrong answers (insufficient cases @50) | 2 | **1** | −1 (ADV-014 removed) |
| Max confidence | 65 | 65 | cap intact |
| Avg confidence | ~41.8 | 41.48 | ~flat (no inflation) |
| Avg evidence trace rate | 98.1% | 98.1% | unchanged (>=85%) |

## PER-CASE CHANGES (only changed cases)

| Case | GT | Mapping-fix pred | Abstention pred | Effect |
|---|---|---|---|---|
| ADV-013 | insufficient_evidence | unit_economics_breakdown (26) | **insufficient_evidence (20)** | ✓ correct abstention (Rule A) |
| ADV-014 | insufficient_evidence | operational_bottleneck (50) | **insufficient_evidence (20)** | ✓ correct abstention + removed false-high-conf (Rule B) |
| BLND-008 | insufficient_evidence | go_to_market_misalignment (33) | **insufficient_evidence (20)** | ✓ correct abstention (Rule B) |
| BLND-009 | operational_bottleneck | trust_quality_crisis (29) | **insufficient_evidence (20)** | ~ wrong abstention; but was already wrong (TQC) and its correct dx is structurally unreachable. Honest non-answer rather than confident wrong. |

All other 17 cases: unchanged. The 10 valid-correct remain concrete and correct. The remaining incorrect ranking cases (ADV-012, RW-016, RW-022, PD-019, SYN-013) and the still-unfixed insufficient case (ADV-011) are unchanged — abstention does not touch them.

## SCORING NOTES

- **Abstention-aware accuracy** counts an INSUFFICIENT_EVIDENCE prediction as correct ONLY when the answer key's ground truth is INSUFFICIENT_EVIDENCE. The 1 wrong abstention (BLND-009) is counted as incorrect.
- **Net gain = +3** (ADV-013, ADV-014, BLND-008). BLND-009 is neutral on accuracy (wrong → wrong).
- **ADV-011 remains a false-high-confidence wrong answer** (UEB @ 50) — documented limitation (indistinguishable from valid PD-017).
- The other @50 wrong answers (RW-016, RW-022, PD-019) are RANKING failures on real-diagnosis cases, out of scope for the abstention gate.

## DIAGNOSIS DISTRIBUTION (post-gate, 21 predictions)

unit_economics_breakdown 6, demand_forecasting_mismatch 4, **insufficient_evidence 4**, go_to_market_misalignment 2, strategic_pricing_error 1, customer_retention_erosion 1, brand_erosion 1, operational_bottleneck 1, trust_quality_crisis 1.

INSUFFICIENT_EVIDENCE now appears (4) — closely tracking the ground-truth count (4). No diagnosis collapse; no lazy-abstention flood.

## PROMOTION GATE

61.9% >= 40% promotion threshold. Per instructions, **do not proceed to Stage B**; fresh manual review still required.

## ARTIFACTS

- New benchmark output: `simulation_runs/round_002/stage_a_abstention_gate_outputs/ABSTENTION_GATE_benchmark_validation.json`
- Prior outputs (mapping fix, slices) NOT overwritten.
