# PHASE 3 — WINNER-LOSER DELTA MATRIX

**13 Failing Cases: Score Delta Analysis**

---

## DELTA MATRIX

| Case ID | Ground Truth | Winner | Correct Present? | Winner Score | Correct Score | Gap | Primary Failure Cause |
|---------|---|---|---|---|---|---|---|
| BLND-006 | DEMAND_FORECASTING_MISMATCH | CUSTOMER_RETENTION_EROSION | YES | 39 | TBD* | TBD | WRONG_DIAGNOSIS_PATTERN_SUPPORT_TOO_HIGH or CORRECT_DIAGNOSIS_PATTERN_SUPPORT_TOO_LOW |
| BLND-008 | INSUFFICIENT_EVIDENCE | GO_TO_MARKET_MISALIGNMENT | NO | 33 | N/A | N/A | CORRECT_DIAGNOSIS_NOT_GENERATED (should return INSUFFICIENT, not a top diagnosis) |
| BLND-009 | OPERATIONAL_BOTTLENECK | TRUST_QUALITY_CRISIS | YES | 29 | TBD | TBD | WRONG_DIAGNOSIS_BASE_SCORE_TOO_HIGH or CORRECT_DIAGNOSIS_PATTERN_SUPPORT_TOO_LOW |
| BLND-010 | STRATEGIC_PRICING_ERROR | GO_TO_MARKET_MISALIGNMENT | NO | 38 | N/A | N/A | CORRECT_DIAGNOSIS_NOT_GENERATED |
| ADV-011 | INSUFFICIENT_EVIDENCE | UNIT_ECONOMICS_BREAKDOWN | NO | 50 | N/A | N/A | CORRECT_DIAGNOSIS_NOT_GENERATED (should reject all diagnoses) |
| ADV-012 | TRUST_QUALITY_CRISIS | CUSTOMER_RETENTION_EROSION | YES | 45 | TBD | TBD | WRONG_DIAGNOSIS_BASE_SCORE_TOO_HIGH |
| ADV-013 | INSUFFICIENT_EVIDENCE | UNIT_ECONOMICS_BREAKDOWN | NO | 26 | N/A | N/A | CORRECT_DIAGNOSIS_NOT_GENERATED |
| ADV-014 | INSUFFICIENT_EVIDENCE | OPERATIONAL_BOTTLENECK | NO | 45 | N/A | N/A | CORRECT_DIAGNOSIS_NOT_GENERATED |
| RW-016 | GO_TO_MARKET_MISALIGNMENT | DEMAND_FORECASTING_MISMATCH | YES | 50 | TBD | TBD | WRONG_DIAGNOSIS_BASE_SCORE_TOO_HIGH |
| RW-022 | UNIT_ECONOMICS_BREAKDOWN | OPERATIONAL_BOTTLENECK | YES | 50 | TBD | TBD | WRONG_DIAGNOSIS_BASE_SCORE_TOO_HIGH |
| RW-024 | OPERATIONAL_BOTTLENECK | BRAND_EROSION | NO | 10 | TBD | TBD | CORRECT_DIAGNOSIS_GENERATED_TOO_LOW or CORRECT_DIAGNOSIS_NOT_GENERATED |
| PD-019 | UNIT_ECONOMICS_BREAKDOWN | DEMAND_FORECASTING_MISMATCH | YES | 50 | TBD | TBD | WRONG_DIAGNOSIS_BASE_SCORE_TOO_HIGH |
| SYN-013 | CUSTOMER_RETENTION_EROSION | GO_TO_MARKET_MISALIGNMENT | YES | 33 | TBD | TBD | WRONG_DIAGNOSIS_BASE_SCORE_TOO_HIGH |

---

## FAILURE CAUSE CLASSIFICATION (PRELIMINARY)

**CORRECT_DIAGNOSIS_NOT_GENERATED (5 cases):**
- BLND-008, BLND-010, ADV-011, ADV-013, ADV-014
- System gives a diagnosis when it should recognize INSUFFICIENT_EVIDENCE
- **Pattern:** Adversarial (ADV) cases and edge cases
- **Root issue:** No mechanism to return "INSUFFICIENT_EVIDENCE" — all diagnoses evaluated, confidence floor is 0 but any diagnosis with >0 confidence gets returned

**WRONG_DIAGNOSIS_BASE_SCORE_TOO_HIGH (7-8 cases):**
- BLND-006, BLND-009, ADV-012, RW-016, RW-022, PD-019, SYN-013
- Correct diagnosis generated but loses to wrong diagnosis at comparable or higher confidence
- **Pattern:** Both diagnoses have patterns, but one (wrong) scores higher
- **Root issue:** Base score formula `(supportingEvidence% × patternWeight × patternBoost)` allows different diagnoses with similar supporting-evidence counts to score identically, regardless of pattern quality
- **Evidence:** Multiple wrong diagnoses with confidence=50 (max pattern-based score)

---

## KEY OBSERVATIONS

### Observation 1: GO_TO_MARKET_MISALIGNMENT Dominance
- Predicted in 5 wrong cases (BLND-008, BLND-010, SYN-013, RW-016 wrong, others)
- This diagnosis has high `patternBoost` (1.2) and broad evidence requirements
- May be generating patterns too easily across different evidence dimensions

### Observation 2: Correct Diagnoses Also Generated
- Most failing cases (8/13) DO generate the correct diagnosis as a candidate
- Problem is ranking, not generation
- The wrong diagnosis outscores the correct one via base confidence calculation

### Observation 3: INSUFFICIENT_EVIDENCE Not Recognized
- 4 cases explicitly should return INSUFFICIENT_EVIDENCE (not a "best diagnosis" but a "no diagnosis")
- System has no mechanism to suppress all diagnoses and return INSUFFICIENT
- All diagnoses must be evaluated and top-3 returned

### Observation 4: Confidence Scores Too Similar
- Correct and wrong diagnoses often have same confidence (50, 45, 38-39)
- Base score formula produces plateauing confidence: many diagnoses hit the 0-65 max
- Tie-breaking logic (specificity, pattern count, diversity) insufficient to differentiate

---

## DELTA CALCULATION METHODOLOGY

To complete the delta matrix, per-case traces are needed:

1. **Extract from benchmark:** Winner's confidence score (already have)
2. **Reverse-engineer:** Correct diagnosis's likely score given:
   - Number of patterns supporting it (guess from evidence)
   - Keyword match strength (guess from evidence)
   - Contradiction count (guess from evidence)
3. **Calculate gap:** Winner - Correct
4. **Identify winning component:** Which adjustment (+/-) pushed winner above correct?

**Current Gap estimates:**
- BLND-006: Winner=39, Correct=30-35 likely, Gap=4-9
- RW-016: Winner=50, Correct=45-48 likely, Gap=2-5
- RW-022: Winner=50, Correct=45-48 likely, Gap=2-5

---

## FAILURE CAUSE ROOT ANALYSIS

### Why Base Score Formula Is The Problem

**Formula:** `baseConfidence = (supportingEvidence% × patternWeight × patternBoost)`

**Problem:** This formula equalizes diagnoses with similar supporting-evidence counts:

- UNIT_ECONOMICS: 4 evidence items, patternBoost=1.3 → 19% × 1.2 × 1.3 = 30 base
- OPERATIONAL: 4 evidence items, patternBoost=1.2 → 19% × 1.2 × 1.2 = 27 base
- GO_TO_MARKET: 5 evidence items, patternBoost=1.2 → 24% × 1.2 × 1.2 = 35 base

If both have similar evidence supporting them, they score within 5-10 points of base. Adjustments (keyword ±5, specificity ±0-10, causal ±0-15) may not be sufficient to separate them when both match evidence.

**Fix required:** Use patternStrength in base calculation, not just pattern count.

---

## VARIANCE FROM BASELINE

**Baseline accuracy:** 8/21 (38.1%)

**Distribution of wrong predictions:**
- High confidence wrong (50): 4 cases (RW-016, RW-022, PD-019, ADV-011)
- Medium confidence wrong (38-45): 5 cases (BLND-010, ADV-012, ADV-014, SYN-013, BLND-009)
- Low confidence wrong (10-29): 2 cases (BLND-008, ADV-013, RW-024)
- Correct (generated but not top): 8/13 failing cases

**Pattern:** System generates correct diagnosis in 8/13 cases but fails to rank it first.

