# MAPPING FIX — PHASE 3 NEWLY CORRECT CASE ROOT-CAUSE AUDIT

**Date:** 2026-06-17  
**Cases:** BLND-006, BLND-010

---

## BLND-006 (demand_forecasting_mismatch)

| Audit Question | Answer |
|---|---|
| Old prediction wrong for a known reason? | YES — PHASE 2 showed DFM was unreachable via financial+market context; only market-only Pattern 6 fired weakly, GTM/TQC cluster won. |
| Did the fix target that exact reason? | YES — Pattern 10 maps a financial_health+market_position demand signal to DFM. |
| Did the fix add the correct diagnosis as a candidate? | YES — DFM now generated at conf 50, rank 1. |
| Won for causal evidence (not generic wording)? | YES — requires three co-occurring causal signals: CAC/acquisition-cost pressure + market deceleration/competitive consolidation + stable retention (NPS/repeat). This is the canonical demand-forecasting signature (demand softening while satisfaction intact). |
| Evidence sufficient for the ground-truth diagnosis? | YES — CAC rising, acquisition 25%→15%, faster-growing funded competitor, NPS 48 / repeat 72%. |
| Confidence appropriate? | YES — 50/65, mid-high, not inflated. |
| Generalizes outside this benchmark? | YES — the conjunction is semantic, not phrase-locked; any case with CAC pressure + market deceleration + stable satisfaction would match. |
| Hidden answer-key dependency? | NO — regex matches business-metric language, not answer-key strings or case IDs. |

**Verdict: VALID_CORRECT (not accidental).**

## BLND-010 (strategic_pricing_error)

| Audit Question | Answer |
|---|---|
| Old prediction wrong for a known reason? | YES — strategic_pricing_error was mapped to NO pattern at all (PHASE 2: confidence 0, never generated). |
| Did the fix target that exact reason? | YES — Pattern 9 maps explicit pricing/monetization evidence (financial+market) to strategic_pricing_error. |
| Did the fix add the correct diagnosis as a candidate? | YES — SPE now generated at conf 50, rank 1. |
| Won for causal evidence (not generic wording)? | YES — validator requires explicit pricing-power / willingness-to-pay / monetization language AND excludes cost-pressure-dominated cases (to avoid stealing unit-economics cases). BLND-010 evidence explicitly discusses willingness-to-pay and pricing power. |
| Evidence sufficient for the ground-truth diagnosis? | YES — "flat rates", "under-monetized positioning", "pricing power if it leaned into specialization", depth-driven (not price-driven) losses. |
| Confidence appropriate? | YES — 50/65. |
| Generalizes outside this benchmark? | PARTIAL — the validator regex (`pricing.*error|price.*wrong|willingness.*to.*pay|price.*power|monetiz`) is moderately specific. It will match genuine pricing cases but could MISS pricing cases worded differently (e.g., "rate realization", "discount leakage"). Low false-positive risk; moderate false-negative risk. See PHASE 7. |
| Hidden answer-key dependency? | NO — no case IDs or answer-key strings; matches generic pricing vocabulary. |

**Verdict: VALID_CORRECT (not accidental), with a noted generalization narrowness on the pricing regex.**

---

## OVERALL PHASE 3 CONCLUSION

Both newly-correct cases are correct for the **right causal reason**, with appropriate (non-inflated) confidence and no answer-key dependency. **Promotion is NOT blocked on grounds of accidental correctness.** The only caveat is the moderate phrase-specificity of the pricing validator (false-negative risk on unseen pricing vocabulary), carried forward to PHASE 7.
