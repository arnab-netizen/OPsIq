# MAPPING FIX — PHASE 2 SCORE-LEVEL TRACE OF CHANGED CASES

**Date:** 2026-06-17  
**Source:** Regenerated FORENSIC_SCORE_TRACE_LOGS.json + ALL21_POST_FIX_TRACE.json (final committed code)

Changed cases (prediction differs pre→post fix): **BLND-006, BLND-010** (newly correct) and **BLND-009, RW-016, RW-022, RW-024** (incorrect→incorrect reshuffle).

---

## BLND-006 — NEWLY CORRECT ✓

| Field | Value |
|---|---|
| Ground truth | demand_forecasting_mismatch |
| New pattern added | `financial_health-market_position-pattern` (Pattern 10) |
| Validator triggered | inline: hasCACorAcquisitionPressure AND hasMarketDeceleration AND hasStableRetention |
| Triggering evidence | "CAC $45… if CAC rises to $60"; "marketing spend increased 40%"; "acquisition growth decelerated 25%→15%"; "Rent the Runway… growing 30% YoY (faster)"; "repeat purchase rate 72%, NPS 48" |
| Pattern strength | 6 (3 supporting financial+market items) |
| potentialRootCauses | [demand_forecasting_mismatch] |

Candidates AFTER fix: DFM **50** (#1) > TQC 34 > GTM 28.
Pre-fix: DFM not generated as winner (GTM/TQC cluster won at ~34). Correct diagnosis **became reachable AND won**. Min delta needed: beat 34 → achieved 50 (margin 16). **Won on valid causal evidence** (demand-side: CAC pressure + competitive deceleration + stable satisfaction = textbook demand forecasting mismatch, not a quality problem). NOT an accidental side effect.

## BLND-010 — NEWLY CORRECT ✓

| Field | Value |
|---|---|
| Ground truth | strategic_pricing_error |
| New pattern added | `financial_health-market_position-pattern` (Pattern 9) |
| Validator triggered | validateStrategicPricingError (explicit pricing terms, no cost-pressure domination) |
| Triggering evidence | "willingness-to-pay"; "pricing power if it leaned fully into specialization"; "under-monetized… positioning"; "flat rates" |
| Pattern strength | 5 |
| potentialRootCauses | [strategic_pricing_error] |

Candidates AFTER fix: SPE **50** (#1) > TQC 34 > GTM 33.
Pre-fix: SPE was NEVER generated (unmapped → confidence 0). Now reachable and wins. Min delta: beat 33 → achieved 50 (margin 17). **Won on valid causal evidence** (explicit pricing/monetization language). NOT accidental.

## BLND-009 — incorrect → incorrect (reshuffle, NOT caused by new patterns)

| Field | Value |
|---|---|
| Ground truth | operational_bottleneck |
| New patterns fired | NONE (only old quality+retention and market+retention patterns) |
| Candidates | TQC 29 (#1), GTM 33 (#2), CRE 24 (#3) |

The correct diagnosis (operational_bottleneck) was **not generated** — BLND-009 has no `operational_efficiency` or `team_capability` dimension (its key-person evidence is filed under quality_delivery/customer_retention/market_position), so neither Pattern 1, Pattern 4, nor the new Pattern 11 can fire. The prediction label difference vs the benchmark's hardcoded baseline is a baseline-label artifact (see PHASE 1); the actual pre-fix winner was already trust_quality_crisis. **No new pattern contributed.** Note: TQC(29) ranked above GTM(33) due to pre-existing ranker keyword-swap logic (negative margin) — unrelated to the mapping fix.

## RW-016 — incorrect → incorrect (reshuffle among wrong answers)

| Field | Value |
|---|---|
| Ground truth | go_to_market_misalignment |
| New patterns fired | NONE of Pattern 9/10 (no stable retention; pricing validator did not match). |
| Candidates | UEB **50** (#1, str8), OB 45 (#2, str8), DFM 40 (#3, str6) |

Correct GTM has only a weak market+retention pattern (str3) and does not reach top-3. UEB's strength-8 financial+operational pattern dominates. This is the **pre-existing pattern-strength ranking issue** (documented in PHASE 2 forensic), unchanged by the mapping fix. The label shift vs benchmark baseline (DFM→UEB) is a baseline-label artifact. **Not fixed; not regressed** (GT was never correct here).

## RW-022 — incorrect → incorrect (new Pattern 11 fired but did not change outcome correctness)

| Field | Value |
|---|---|
| Ground truth | unit_economics_breakdown |
| New pattern fired | `operational_efficiency-bottleneck-pattern` (Pattern 11), str=2 → OB |
| Candidates | DFM **50** (#1), OB 45 (#2, patCnt=2), UEB 45 (#3) |

The correct UEB is generated (rank 3, conf 45) but loses to DFM (50) by 5 — an **equal-pattern-strength ranking/boosting tie** (PHASE 2 category). Pattern 11 added a second OB pattern (patCnt 2) but OB still lost to DFM and did not displace UEB's correctness outcome. **Side-effect reshuffle among non-winning candidates; no correctness change.**

## RW-024 — incorrect → incorrect (0 patterns; dimension mismatch)

| Field | Value |
|---|---|
| Ground truth | operational_bottleneck |
| Dimensions | talent_retention (non-canonical), financial_health, market_position |
| New patterns fired | NONE — Pattern 11 needs `team_capability`/`operational_efficiency` (absent); Pattern 9/10 need stable-retention/pricing signals (absent) |
| Candidates | brand_erosion 10, cash_runway_crisis 10 (floor only) |

`talent_retention` is NOT a recognized canonical dimension, so the operational-bottleneck evidence is invisible to pattern generation. 0 patterns → floor diagnoses. The mapping fix could not help because the evidence dimension itself is unrecognized. **Root cause is upstream dimension naming, not pattern mapping.**

---

## SUMMARY

| Case | Correct became reachable? | Won by valid causal evidence? | Verdict |
|---|---|---|---|
| BLND-006 | YES | YES | Legitimate fix |
| BLND-010 | YES | YES | Legitimate fix |
| BLND-009 | NO (dim missing) | n/a | Unaffected by fix |
| RW-016 | partial (weak, outranked) | n/a | Pre-existing ranking issue |
| RW-022 | already reachable | n/a (ranking tie) | Side-effect reshuffle only |
| RW-024 | NO (dim unrecognized) | n/a | Upstream dimension issue |

Both newly-correct cases won for the **right causal reason**. The other 4 changed cases are non-winning reshuffles or pre-existing issues — none represents a regression.
