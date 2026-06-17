# OPTION 3 VALIDATION REPORT
## Make Keyword Boosts Proportional to Pattern Strength

**Date:** 2026-06-17  
**Implementation Status:** COMPLETE_CODE_VERIFIED_NOT_VALIDATED_BENCHMARK  
**Test Result:** REGRESSION - Net Gain: -2 cases (8/21 → 6/21)  

---

## EXECUTIVE SUMMARY

Option 3 was implemented exactly as specified in the authorization: proportional scaling of keyword, specificity, and causal boosts by average pattern strength. However, the 21-case benchmark test shows regression rather than improvement.

**Expected outcome (per authorization):** 10-14/21 accuracy (48-67%)  
**Actual outcome:** 6/21 accuracy (28.6%)  
**Regression:** 2 cases (BLND-007, PD-017)  
**Newly fixed:** 0 cases  

---

## IMPLEMENTATION DETAILS

### Code Changes
**File:** `src/services/stage-a/hypothesis-generator.ts` (lines 409-445)

**Algorithm:**
```typescript
const avgPatternStrength = matchingPatterns.length > 0
  ? matchingPatterns.reduce((sum, p) => sum + (p.patternStrength || 1), 0) / matchingPatterns.length
  : 1.0;

const strengthMultiplier = avgPatternStrength / 10;  // Range 0.1 to 1.0

// Applied to:
- Keyword boost: 5 * strengthMultiplier
- Specificity boost: Math.round(specificityMatch * 10) * strengthMultiplier
- Causal boost: causalBoost * strengthMultiplier
- Keyword penalty: 15 * strengthMultiplier
```

### Multiplier Behavior
- Strength 1: multiplier 0.1 (90% reduction in boosts)
- Strength 2-3: multiplier 0.2-0.3 (70-80% reduction)
- Strength 4-6: multiplier 0.4-0.6 (40-60% reduction)
- Strength 8: multiplier 0.8 (20% reduction)
- Strength 10: multiplier 1.0 (no reduction)

---

## REGRESSION ANALYSIS

### Case: BLND-007 (Regression)
- **Expected:** go_to_market_misalignment ✓ SLICE_8
- **Actual Option 3:** demand_forecasting_mismatch ✗ (confidence 39.2)
- **Impact:** Proportional scaling reduced boosts for GTM pattern, allowing Demand to win

### Case: PD-017 (Regression)
- **Expected:** demand_forecasting_mismatch ✓ SLICE_8
- **Actual Option 3:** operational_bottleneck ✗ (confidence 50)
- **Impact:** Proportional scaling changed confidence ordering

### Unchanged Failures (13 cases)
Cases that were already failing in SLICE_8 remain failing in Option 3:
- BLND-006: Still predicts GO_TO_MARKET (expected DEMAND_FORECASTING)
- BLND-008: Still predicts GO_TO_MARKET (expected INSUFFICIENT_EVIDENCE)
- BLND-009: Still predicts TRUST_QUALITY (expected OPERATIONAL_BOTTLENECK)
- ...and 10 more

### Correct Cases (6/21, Preserved)
- RW-018, RW-020, PD-011, PD-013, PD-015, SYN-011

---

## ROOT CAUSE ANALYSIS

### Problem 1: Baseline Mismatch
The SLICE_8 baseline (8/21, created at earlier code stage) may have been generated with:
- Different pattern strength calculations
- Different F1 content validators (if not fully integrated)
- Different base evidence synthesis

When Option 3 applies proportional scaling to the current code's pattern strengths, it breaks the SLICE_8 baseline expectations.

### Problem 2: Blanket Application
Option 3 applies strengthMultiplier uniformly to ALL diagnoses that have matching patterns. This means:
- Diagnoses with strength 4-6 patterns get 40-60% boost reduction
- This affects confidence scores uniformly across all diagnoses
- Diagnoses that were winning due to +5 boost now win with +2 boost
- This reverses previous rankings (regressions)

### Problem 3: Insufficient Differentiation
For BLND-006 (expected effect: Quality → Demand):
- Quality pattern has strength ~1 (F1 suppressed)
- Demand pattern has strength ~8 (strong)
- Even with proportional scaling, base confidences (44% vs 48%) determine winner
- Boosts (0.5 vs 4) don't create enough differentiation

---

## BENCHMARK DETAILS

### Baseline (SLICE_8): 8/21 (38.1%)
- 8 correct cases
- Tests in baseline: RW-018, RW-020, PD-011, PD-013, PD-015, SYN-011, and 2 others

### Option 3: 6/21 (28.6%)
- 6 correct cases (preserved from baseline)
- 2 regressions (BLND-007, PD-017)
- 0 newly fixed cases
- Net gain: -2 cases

### Gates Run
- ✓ npm run build: PASS
- ✓ npx tsc --noEmit: PASS
- ✓ npx prisma validate: PASS (no schema changes)
- ⚠ npm test (hypothesis-generator tests): NEEDS UPDATE (confidence assertions change)
- ✗ F1 Benchmark (21-case validation): FAIL (regression, -2 cases)

---

## DECISION TREE

**Per authorization:**
- ✓ Code compiles without errors
- ✗ Benchmark shows regression (< 8/21 baseline)
- ✗ No improvement on failing cases

**Classification:** BLOCKED - REGRESSIONS DETECTED

**Recommended Action:**
1. Do NOT commit Option 3 as-is (causes regressions)
2. Revert hypothesis-generator.ts changes
3. Escalate to Option 2 (Remove keyword rescoring entirely)

---

## NEXT STEP: OPTION 2

**Option 2 (Remove keyword rescoring completely):**
- Expected impact: 12-16/21 accuracy (57-76%)
- Risk: High complexity, removes pattern-independent keyword logic
- Authorization contingency: "Fallback path (if 10-14/21 not achieved)"

**Re-evaluation Required:**
- Option 3 failed as implemented per specification
- Root cause: proportional scaling breaks SLICE_8 baseline uniformly
- Option 2 should be implemented as next remediation

---

## TEST ARTIFACTS

**Benchmark Output:**
- `simulation_runs/round_002/stage_a_pipeline_contract_fix_outputs/OPTION_3_benchmark_validation.json`
- `simulation_runs/round_002/stage_a_pipeline_contract_fix_outputs/OPTION_3_benchmark_details.json`

**Test File:**
- `src/__tests__/services/stage-a/f1-hypothesis-integration.test.ts` (6 new integration tests)
- `src/__tests__/services/stage-a/f1-benchmark.test.ts` (updated to compare against SLICE_8)

**Updated Files:**
- `src/services/stage-a/hypothesis-generator.ts` (strengthMultiplier logic added)

---

## CONCLUSION

Option 3 was implemented correctly according to specification but produced regressions instead of improvements. The proportional scaling approach reduces boosts across all diagnoses uniformly, which destabilizes the SLICE_8 baseline rather than disambiguating suppressed vs strong patterns.

**Status:** COMPLETE_CODE_VERIFIED_NOT_VALIDATED_BENCHMARK  
**Escalate to:** Option 2 - Remove Keyword Rescoring Entirely
