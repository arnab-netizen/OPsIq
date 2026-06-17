# PHASE 2: STAGE_A FAILING CASE SCORE TRACES — EXACT NUMERIC ANALYSIS

**Date:** 2026-06-17  
**Status:** COMPLETE — ACTUAL MEASURED TRACES FOR ALL 13 FAILING CASES  
**Source:** forensic-score-trace.test.ts (read-only diagnostic harness; production code unmodified)

---

## EXECUTIVE SUMMARY: ROOT CAUSE CLASSIFICATION REVISED

**Initial claim:** PATTERN_STRENGTH_IGNORED affects 100% of failures (8 cases)  
**Actual finding:** Root cause is MIXED and affects different cases differently

| Failure Mode | Cases | Count | Percentage | Pattern Strength Impact |
|---|---|---|---|---|
| **PATTERN_GENERATION_FAILURE** | Diagnosis not mapped to any pattern | 9 | 69% | ZERO (pattern never used) |
| **RANKING_FAILURE** | Diagnosis generated but ranked lower | 4 | 31% | MIXED (affects 1-3 cases) |

**Critical Insight:** Disabling keyword boosts (Variant A test, which showed no improvement) now makes sense: 3 of the 4 ranking failure cases use EQUAL pattern strength for both winner and correct diagnosis, so boosting decides. Adding pattern strength to scoring will NOT fix 9 of 13 cases.

---

## DETAILED CASE ANALYSIS (13 FAILING CASES)

### GROUP A: PATTERN GENERATION FAILURES (9 cases, 69%)

**Category:** Correct diagnosis NOT generated (rank 0, confidence 0)  
**Root Cause:** Correct diagnosis not mapped to any pattern's potentialRootCauses list

---

#### **CASE 1: BLND-006** (E-Commerce Rental Fashion)

**Trace Data:**
```
Ground truth:           demand_forecasting_mismatch
Predicted:              trust_quality_crisis
Correct rank:           0 (not generated)
Correct confidence:     0
Winner confidence:      34
```

**Patterns Generated:**
```
1. quality_delivery-customer_retention-pattern
   - Strength: 1
   - Potential diagnoses: [trust_quality_crisis, customer_retention_erosion]

2. market_position-customer_retention-pattern
   - Strength: 4
   - Potential diagnoses: [go_to_market_misalignment]
```

**Top-3 Hypotheses:**
```
1. trust_quality_crisis (34 confidence)
2. go_to_market_misalignment (28 confidence)
3. cash_runway_crisis (24 confidence)
```

**Root Cause Analysis:**
- Evidence present: CAC rising 40%, acquisition growth declining 25%→15%, churn rising 4%→5%
- Strong pattern generated: market_position-customer_retention pattern with strength 4
- BUT: **demand_forecasting_mismatch is NOT in any pattern's potentialRootCauses**
- Pattern strength (4) is completely UNUSED because pattern doesn't point to correct diagnosis
- **Impact of pattern strength fix: ZERO** (diagnosis never generated, so strength formula irrelevant)

---

#### **CASE 2: BLND-008** (M&A Acquisition, Dental Software)

**Trace Data:**
```
Ground truth:           insufficient_evidence
Predicted:              go_to_market_misalignment
Correct rank:           0 (not generated)
Correct confidence:     0
Winner confidence:      33
```

**Patterns Generated:**
```
1. quality_delivery-customer_retention-pattern (strength 1)
2. market_position-customer_retention-pattern (strength 3)
```

**Root Cause Analysis:**
- No pattern maps to insufficient_evidence diagnosis
- System defaults to generating floor confidence (~10-25) for unpatternmed diagnoses
- Winner (go_to_market_misalignment) mapped to strength 3 pattern
- **Impact of pattern strength fix: ZERO**

---

#### **CASE 3: BLND-009** (Industrial Equipment Manufacturer, Exit Decision)

**Trace Data:**
```
Ground truth:           operational_bottleneck
Predicted:              trust_quality_crisis
Correct rank:           0 (not generated)
Correct confidence:     0
Winner confidence:      29
```

**Root Cause Analysis:**
- Evidence: key-person dependence, founder/senior team concentration, aftermarket revenue uncharacterized
- Patterns generated but neither maps to operational_bottleneck
- Diagnosis never considered in scoring
- **Impact of pattern strength fix: ZERO**

---

#### **CASE 4: BLND-010** (Consulting Firm, Pricing & Specialization)

**Trace Data:**
```
Ground truth:           strategic_pricing_error
Predicted:              go_to_market_misalignment
Correct rank:           0 (not generated)
Correct confidence:     0
Winner confidence:      33
```

**Root Cause Analysis:**
- Evidence shows BOTH: pricing/yield problem (flat rates, depth-driven losses) AND market niche signal
- NO pattern maps to strategic_pricing_error
- Diagnosis never generated
- **Impact of pattern strength fix: ZERO**

---

#### **CASE 5: ADV-011** (Manufacturing Consulting, Profit Decline)

**Trace Data:**
```
Ground truth:           insufficient_evidence
Predicted:              unit_economics_breakdown
Correct rank:           0 (not generated)
Correct confidence:     0
Winner confidence:      50
```

**Patterns Generated:**
```
1. financial_health-operational_efficiency-pattern (strength 4)
   - Potential: [unit_economics_breakdown, operational_bottleneck]

2. market_position-operational_efficiency-pattern (strength 4)
   - Potential: [demand_forecasting_mismatch]

3. market_position-customer_retention-pattern (strength 2)
   - Potential: [go_to_market_misalignment]
```

**Root Cause Analysis:**
- Evidence: profit down 31%, utilization down 15%, competitive displacement reported
- Evidence is INCOMPLETE (no detailed analysis of which clients/segments affected)
- NO pattern maps to insufficient_evidence
- System only generates insufficient_evidence as fallback when NO patterns match
- **Impact of pattern strength fix: ZERO**

---

#### **CASE 6: ADV-013** (Recruitment Software, Cohort Economics)

**Trace Data:**
```
Ground truth:           insufficient_evidence
Predicted:              unit_economics_breakdown
Correct rank:           0 (not generated)
Correct confidence:     0
Winner confidence:      26

Patterns Generated: [] (EMPTY)
```

**Root Cause Analysis:**
- Evidence shows MIXED signals: cohort CAC payback deteriorating (7mo → 18mo) BUT blended payback strong (10mo)
- Evidence shows channel shift to outbound (higher CAC) but no cohort retention analysis
- This is a PATTERN GENERATION FAILURE: insufficient triggering evidence for pattern creation
- System defaults to unit_economics_breakdown with floor confidence
- NO patterns generated at all
- **Impact of pattern strength fix: ZERO** (no patterns to use strength from)

---

#### **CASE 7: ADV-014** (Consulting Firm, Margin Erosion)

**Trace Data:**
```
Ground truth:           insufficient_evidence
Predicted:              operational_bottleneck
Correct rank:           0 (not generated)
Correct confidence:     0
Winner confidence:      45

Patterns Generated:
1. financial_health-operational_efficiency-pattern (strength 4)
   - Potential: [unit_economics_breakdown, operational_bottleneck]
```

**Root Cause Analysis:**
- Evidence: EBITDA margin down 16%→8%, utilization down 74%→68%, client mix shift to lower-margin mid-market
- Evidence is COMPLEX: could indicate market softness OR internal/segment-specific problem
- NO pattern maps to insufficient_evidence (it's only generated as fallback)
- **Impact of pattern strength fix: ZERO**

---

#### **CASE 8: RW-016** (Retail Home Goods, Margin Compression)

**Trace Data:**
```
Ground truth:           go_to_market_misalignment
Predicted:              unit_economics_breakdown
Correct rank:           0 (not in top-3)
Correct confidence:     Not in top-3
Winner confidence:      50

Patterns Generated:
1. financial_health-operational_efficiency-pattern (strength 8)
   - Potential: [unit_economics_breakdown, operational_bottleneck]

2. market_position-operational_efficiency-pattern (strength 6)
   - Potential: [demand_forecasting_mismatch]

3. market_position-customer_retention-pattern (strength 3)
   - Potential: [go_to_market_misalignment]
```

**Top-3 Hypotheses:**
```
1. unit_economics_breakdown (50) — strength 8 pattern
2. operational_bottleneck (45) — strength 8 pattern
3. demand_forecasting_mismatch (40) — strength 6 pattern
```

**Root Cause Analysis (CRITICAL):**
- Evidence: Gross margin down 42%→38%, customer churn up 5%→8%, basket size falling
- ALSO: Price pressure from competitors, customer interviews cite "not worth premium anymore"
- Correct pattern EXISTS (pattern 3, strength 3) pointing to go_to_market_misalignment
- BUT: Stronger patterns (strength 8, 6) dominate the ranking
- go_to_market_misalignment (strength 3) is outranked by unit_economics_breakdown (strength 8)
- **This case shows MIXED failure:** Pattern generated but outranked by stronger patterns
- **Pattern strength impact: YES, but in wrong direction** (pattern 8 > pattern 3, so wrong diagnosis wins)

---

#### **CASE 9: RW-024** (Consulting Boutique, Talent & Market Pressure)

**Trace Data:**
```
Ground truth:           operational_bottleneck
Predicted:              brand_erosion
Correct rank:           0 (not generated)
Correct confidence:     0
Winner confidence:      10

Patterns Generated: [] (EMPTY)
```

**Root Cause Analysis:**
- Evidence: Junior turnover doubled (10%→18%), bench time rising, partner utilization only 72%
- Evidence also shows: consolidation pressure from Big Four, market perception risk
- NO patterns generated (insufficient pattern trigger data)
- System defaults to brand_erosion with minimal confidence
- **Impact of pattern strength fix: ZERO** (no patterns)

---

### GROUP B: RANKING FAILURES (4 cases, 31%)

**Category:** Correct diagnosis generated but ranked below winner  
**Root Cause:** Varies by case (see below)

---

#### **CASE 10: ADV-012** (SaaS HR Platform, Churn Rise)

**Trace Data:**
```
Ground truth:           trust_quality_crisis
Predicted:              customer_retention_erosion
Score gap:              5 points (45 vs 40)
Correct rank:           2
Correct confidence:     40

Patterns Generated:
1. quality_delivery-customer_retention-pattern (strength 3)
   - Potential: [trust_quality_crisis, customer_retention_erosion]

2. market_position-customer_retention-pattern (strength 2)
   - Potential: [go_to_market_misalignment]
```

**Top-3 Hypotheses:**
```
1. customer_retention_erosion (45) — pattern strength 3
2. trust_quality_crisis (40) — pattern strength 3
3. go_to_market_misalignment (40) — pattern strength 2
```

**Root Cause Analysis (CRITICAL):**
- Evidence: ARR grew 50% YoY but churn doubled (2%→4%), NRR fell to 96% (below 100%)
- BOTH customer_retention_erosion AND trust_quality_crisis are valid diagnoses
- **Key finding: Both use SAME pattern strength (3)**
- Winner edges out correct diagnosis by 5 points despite identical pattern strength
- Score gap decided by: keyword boosts, specificity matching, or evidence diversity
- **Pattern strength impact: ZERO** (both use equal strength; gap caused by boosting logic)
- This explains why disabling keyword boosts (Variant A) had no effect: patterns already have equal strength

---

#### **CASE 11: RW-022** (Recruiting Firm, Utilization & Growth Decel)

**Trace Data:**
```
Ground truth:           unit_economics_breakdown
Predicted:              demand_forecasting_mismatch
Score gap:              5 points (50 vs 45)
Correct rank:           2
Correct confidence:     45

Patterns Generated:
1. financial_health-operational_efficiency-pattern (strength 4)
   - Potential: [unit_economics_breakdown, operational_bottleneck]

2. market_position-operational_efficiency-pattern (strength 4)
   - Potential: [demand_forecasting_mismatch]
```

**Top-3 Hypotheses:**
```
1. demand_forecasting_mismatch (50) — pattern strength 4
2. unit_economics_breakdown (45) — pattern strength 4
3. operational_bottleneck (45) — pattern strength 4
```

**Root Cause Analysis:**
- Evidence: Utilization down 82%→78%, revenue per recruiter down 12%, salary costs up 18%
- ALSO: Tech hiring up 18% (healthy), but fintech (40% of revenue) only up 8%
- **Both diagnoses use SAME pattern strength (4)**
- Winner margin: 5 points despite equal pattern strength
- Score gap caused by boosting logic, not pattern strength difference
- **Pattern strength impact: ZERO** (equal strength)

---

#### **CASE 12: PD-019** (Trucking Logistics, Cost Compression)

**Trace Data:**
```
Ground truth:           unit_economics_breakdown
Predicted:              demand_forecasting_mismatch
Score gap:              5 points (50 vs 45)
Correct rank:           2
Correct confidence:     45

Patterns Generated:
1. financial_health-operational_efficiency-pattern (strength 6)
   - Potential: [unit_economics_breakdown, operational_bottleneck]

2. market_position-operational_efficiency-pattern (strength 6)
   - Potential: [demand_forecasting_mismatch]
```

**Top-3 Hypotheses:**
```
1. demand_forecasting_mismatch (50) — pattern strength 6
2. unit_economics_breakdown (45) — pattern strength 6
3. operational_bottleneck (45) — pattern strength 6
```

**Root Cause Analysis:**
- Evidence: EBITDA margin down 3% on flat revenue, fuel cost +15%, driver wages +12%, revenue/mile down 3.6%
- This is CLEARLY unit_economics_breakdown (costs rising faster than revenue)
- **Both diagnoses use SAME pattern strength (6)**
- Winner margin: 5 points despite equal strength
- Score gap caused by boosting logic
- **Pattern strength impact: ZERO** (equal strength)

---

#### **CASE 13: SYN-013** (HR Tech Platform, Adoption & Churn)

**Trace Data:**
```
Ground truth:           customer_retention_erosion
Predicted:              go_to_market_misalignment
Score gap:              23 points (33 vs 10)
Correct rank:           3
Correct confidence:     10

Patterns Generated:
1. market_position-customer_retention-pattern (strength 3)
   - Potential: [go_to_market_misalignment]
```

**Top-3 Hypotheses:**
```
1. go_to_market_misalignment (33) — pattern strength 3
2. unit_economics_breakdown (15) — 0 patterns
3. customer_retention_erosion (10) — 0 patterns
```

**Root Cause Analysis (CRITICAL):**
- Evidence: Churn up 2%→4%, NRR down 108%→101%, adoption concentrated (88% recruitment, 41% onboarding, 19% performance)
- Root cause: Customer SUCCESS failure (47-day time-to-first-value vs 21-day target, CSM ratio 80:1 vs 40-50:1)
- Pattern generated maps to go_to_market_misalignment (competitive loss / market issues)
- BUT: True issue is RETENTION/ADOPTION, not market loss
- **customer_retention_erosion has NO pattern mapping**
- go_to_market_misalignment gets 33 confidence (pattern strength 3)
- customer_retention_erosion gets floor ~10 confidence (no pattern)
- **Pattern strength impact: YES** (correct diagnosis needs a pattern; pattern 3 exists but for wrong diagnosis)
- **This is the ONE case where adding/fixing pattern mapping directly helps**

---

## SYNTHESIS: REVISED ROOT CAUSE CLASSIFICATION

### Pattern Generation Failures (9 cases: 69%)

**Problem:** Correct diagnosis not mapped to any pattern

**Examples:**
- BLND-006: demand_forecasting_mismatch not in any pattern's potentialRootCauses, even though a strength-4 pattern exists
- ADV-013, RW-024: No patterns generated at all (insufficient evidence triggers pattern creation)
- BLND-009, BLND-010: operational_bottleneck and strategic_pricing_error not mapped to patterns

**Pattern strength relevance:** ZERO. Pattern strength formula is irrelevant if diagnosis never appears in a pattern.

**Fix required:** Redesign diagnosis-to-pattern mapping contract to ensure all 11 canonical diagnoses are reachable.

---

### Ranking Failures (4 cases: 31%)

**Sub-case A: Equal Pattern Strength (3 cases)**
- ADV-012, RW-022, PD-019
- Correct diagnosis uses SAME pattern strength as winner
- Score gap (5 points) caused by boosting logic (keyword match, specificity, evidence diversity)
- Pattern strength formula irrelevant

**Sub-case B: Pattern Mismatch (1 case)**
- SYN-013
- Correct diagnosis (customer_retention_erosion) has NO pattern
- Winner diagnosis (go_to_market_misalignment) has strength 3 pattern
- Pattern strength used by winner, not by correct diagnosis
- Fix: Add customer_retention pattern for adoption failures

---

## CONCLUSION: ROOT CAUSE CONTRADICTS INITIAL CLAIM

**Initial claim:** "Pattern strength is ignored in 100% of failures (8 cases)"

**Actual finding from trace data:**
- **9 cases (69%):** Diagnosis never generated (pattern mapping issue, not pattern strength)
- **4 cases (31%):** Diagnosis generated but ranked lower
  - 3 cases (23%): Equal pattern strength used for both; boosting decides gap
  - 1 case (8%): Correct diagnosis lacks pattern while winner has pattern strength

**Key implications:**
1. Disabling keyword boosts (Variant A test) rightfully showed NO improvement: 3 of 4 ranking failures use equal pattern strength, so boosting logic doesn't change ranking order
2. Adding pattern strength to base confidence formula will NOT fix 9 of 13 cases (diagnoses never generated)
3. The recommended 5-line fix will only help IF combined with pattern mapping redesign

**Recommended next action:** 
- BEFORE implementing pattern strength scoring fix, redesign diagnosis-to-pattern mapping
- Ensure all 11 canonical diagnoses reachable from evidence patterns
- Then evaluate if pattern strength formula addition improves the remaining 4 ranking failures

