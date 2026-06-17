# MAPPING FIX — PHASE 7 GENERALIZATION / OVERFITTING AUDIT

**Date:** 2026-06-17  
**Scope:** src/services/stage-a/evidence-synthesis-engine.ts (the only file changed by the fix)

---

## CONTAMINATION CHECKS (grep-verified)

| Check | Result |
|---|---|
| Case IDs (BLND/ADV/RW/PD/SYN) in engine code | **NONE** ✓ |
| Answer-key strings (`root_cause_diagnosis`, `ANSWER_KEY`) | **NONE** ✓ |
| Benchmark filenames / `slice_7` / `slice_8` references | **NONE** ✓ |
| Route/test-only branches in engine | **NONE** ✓ |
| Benchmark harness modified | **NO** ✓ (harness untouched) |

The engine is free of benchmark contamination. All new logic keys on business-metric vocabulary in `evidence.finding`.

## REGEX SPECIFICITY AUDIT

### Pattern 9 — validateStrategicPricingError (gate: hasPricingEvidence || confidence ≥ 0.4; confidence is 0.9 or 0.05, so effectively requires hasPricingSpecificSignals)
- Trigger regex: `pricing.*error|price.*wrong|willingness.*to.*pay|price.*power|can't.*raise.*price|pricing.*challenge|price.*sensitivity.*issue|monetiz`
- Plus guards: NOT cost-pressure-dominated, NOT competitor-pricing context.
- **Assessment:** Moderately specific. Low false-positive risk (the cost-pressure exclusion prevented the PD-011 regression). **Moderate false-NEGATIVE risk** — genuine pricing cases worded as "rate realization", "discount leakage", "yield management" would be missed. Acceptable but narrow.

### Pattern 10 — Demand Forecasting (financial+market)
- Requires conjunction of THREE: CAC/acquisition-cost pressure AND market deceleration/consolidation AND stable retention (NPS/repeat).
- **Assessment:** Quite specific (3-way conjunction). Very low false-positive risk; this is why it fired only on BLND-006 and on no preserved-correct case. **Moderate false-negative risk** (demand cases lacking the stable-retention clause won't match). Conservative, safe.

### Pattern 11 — Operational Bottleneck (team/operational)
- Gate: `hasBottleneckEvidence || confidence ≥ 0.4`. Confidence floor for any operational_efficiency/team case is 0.3, and rises to 0.7–0.9 with throughput/key-person signals. Trigger fires whenever throughput OR key-person signals appear.
- **Assessment:** **BROADEST of the three.** It fired on PD-013, PD-017, SYN-011, RW-022 (added OB as a candidate/runner-up). It never overtook a correct winner, but it raises OB prevalence as runner-up. This is the main generalization watch-item. **Too-broad risk: MEDIUM.** It is not currently harmful but could threaten a thin-margin UEB/DFM case in future data.

## OUTPUT-QUALITY AUDIT

| Check | Result |
|---|---|
| Hidden lazy default introduced | NO — floor diagnoses (brand_erosion/cash_runway @10) are pre-existing fallback behavior, not added by fix |
| Diagnosis distribution distortion | NO — predicted distribution (UEB 7, DFM 4, GTM 3, TQC 2, OB 2, SPE 1, CRE 1, BE 1) tracks ground-truth shape (UEB 6, OB 3, DFM 2…). No single-diagnosis collapse. |
| Confidence inflation | NO — cap remains 65; new wins are at 50; SYN-011 still 65; no artificial boosts. |
| Evidence trace loss | NO — all new patterns carry `supportingItems`; trace rate 100% on 19/21 cases, 80% on 2 (unchanged behavior). |
| False high-confidence WRONG answers | **YES — pre-existing & surfaced:** ADV-011 UEB@50, ADV-014 OB@50 (both should be INSUFFICIENT_EVIDENCE), RW-022 DFM@50, PD-019 DFM@50, RW-016 UEB@50. The mapping fix did not create these, but they remain a safety concern (see PHASE 9). |
| Route/test-only behavior | NONE |

## OVERFITTING VERDICT

**Overfitting found: NO (no benchmark contamination, no case-ID/answer-key coupling).**

**Generalization caveats (not overfitting, but robustness risks):**
1. Pattern 11 trigger is broad → adds OB candidates widely (MEDIUM watch-item).
2. Pattern 9 pricing regex is phrase-specific → false-negative risk on unseen pricing vocabulary (MEDIUM).
3. Pattern 10 is conservative (3-way conjunction) → safe but may under-fire on partial demand signals.

The fix is **structurally generalizable** (semantic evidence matching, no benchmark coupling) but carries **moderate robustness risk on Pattern 11 breadth and Pattern 9 narrowness**, which should be revisited if the benchmark set is expanded.
