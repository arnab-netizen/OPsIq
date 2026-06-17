# ABSTENTION GATE — PRE-IMPLEMENTATION ANALYSIS

**Date:** 2026-06-17  
**Scope:** Stage A INSUFFICIENT_EVIDENCE abstention gate (no mapping/ranking changes)

---

## THE 4 INSUFFICIENT-EVIDENCE CASES (from manual review)

Signals from ALL21_POST_FIX_TRACE.json (mapping-fix state, before abstention gate):

| Case | Current pred | Conf | #patterns | Missing-data density | Why evidence is insufficient | Missing signal | Abstention trigger that should fire |
|---|---|---|---|---|---|---|---|
| ADV-011 | unit_economics_breakdown | 50 | 1 | 0.25 | Profit/utilization decline reported but no analysis of which clients/segments drive it | per-segment / per-client decline attribution | **NONE SAFE** — structurally identical to valid PD-017 (conf 50, pat 1, patStr 4). False-high-confidence risk, but undetectable without regressing PD-017. |
| ADV-013 | unit_economics_breakdown | 26 | 0 | 0.50 | Blended economics strong but cohort payback deteriorating; no cohort retention pulled | cohort/channel retention split | **Rule A** (no pattern support + low conf + missing-data note) |
| ADV-014 | operational_bottleneck | 50 | 2 | 1.75 | Margin erosion ambiguous: mix-shift vs market softness; utilization never split | per-segment profitability / utilization split | **Rule B** (pervasive missing-data) + false-high-confidence |
| BLND-008 | go_to_market_misalignment | 33 | 1 | 1.20 | M&A value cannot be compared until deal structure known; retention only partially characterized | deal structure / cohort durability | **Rule B** (pervasive missing-data) |

## SEPARABILITY ANALYSIS (insufficient vs valid-correct)

The hard constraint is **zero valid-correct regression**. The 10 valid-correct cases have:
- patternCount >= 1 (all)
- missing-data density <= 0.6 (max is BLND-010 at 0.6)
- confidence 38-65

Therefore two trigger thresholds cleanly clear all valid-correct cases:
- **Rule A — NO_PATTERN_SUPPORT:** patternCount == 0 (no valid-correct case qualifies) — refined with >=3 evidence items, confidence < 40, and missing-data density > 0, to avoid abstaining a clean single-dimension strong case.
- **Rule B — PERVASIVE_MISSING_DATA:** density >= 1.0 (max valid-correct is 0.6) — refined with >=4 evidence items, since per-item density is only meaningful with enough items.

## WHY NOT A TOP-TWO-MARGIN RULE

The spec lists "top-two ambiguity" as a consideration, but six valid-correct cases (RW-018/020, PD-011/013/015/017) win by only ~5 points over a co-ranked candidate due to the shared `financial_health-operational_efficiency` pattern (UEB/OB both in its roots). A margin-only abstention rule would regress all of them. **Margin-only abstention is therefore deliberately excluded.** Ambiguity is only acted on when combined with absence of pattern support (Rule A).

## WHY ADV-011 IS NOT TARGETED

ADV-011 (UEB @ 50, 1 pattern, patStr 4, missing-data 0.25) is structurally indistinguishable from valid-correct PD-017 (DFM @ 50, 1 pattern, patStr 4, missing-data 0.0). The only difference is a single hedge phrase (0.25 vs 0.0 density). Any threshold low enough to catch ADV-011 would also abstain BLND-006/RW-018/PD-015 (densities 0.25-0.4) — multiple valid-correct regressions. **ADV-011 is documented as an accepted limitation**; catching it requires evidence-completeness reasoning beyond this gate's scope.

## DESIGN DECISION

Implement two conservative, principled triggers (Rule A + Rule B) located in `HypothesisGenerator.generateHypotheses` after ranking, before returning. Emit `DiagnosisType.INSUFFICIENT_EVIDENCE` (new enum member) at low confidence (20), preserving the original candidates at lower ranks for traceability and an explanation of what data is missing.

Expected outcome: fixes 3 of 4 insufficient cases (ADV-013, ADV-014, BLND-008), removes 1 of 2 false-high-confidence wrong answers (ADV-014), zero valid-correct regressions; ADV-011 remains unfixed (documented).
