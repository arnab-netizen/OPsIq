# F1 INVISIBILITY ANALYSIS

**Objective:** Prove why F1's pattern suppression had zero impact on final diagnosis prediction

**Data Source:** F1_benchmark_details.json (21-case benchmark results)

**Finding:** F1 successfully modified pattern strength but modification was invisible to HypothesisGenerator's confidence calculation

---

## PART 1: F1'S PATTERN STRENGTH CHANGES

### Pattern 3 (TRUST_QUALITY_CRISIS)

F1 implemented content validation: `validateTrustQualityCrisis()`

**Detection Logic:**
- Looks for quality defects: "uptime", "incident", "outage", "defect", "bug", "support.*rising"
- Looks for churn linked to quality: "churn.*quality", "dissatisfy"
- Looks for stable quality: "nps.*4[0-9]", "repeat.*7[0-9]%", "satisfaction.*intact"

**Suppression Trigger:** If `hasStableQuality = TRUE` → confidence = 0.1

**Before F1:**
- Pattern 3 always created with strength = min(10, 2 items * 2) = 4

**After F1:**
- Pattern 3 with stable quality: strength = max(1, round(4 * 0.1)) = 1
- Pattern 3 with defects: strength = 4 (unchanged)

### Pattern 5 (GO_TO_MARKET_MISALIGNMENT)

F1 implemented: `validateGoToMarketMisalignment()`

**Suppression Logic:**
- If evidence shows adoption/onboarding failures AND no channel/acquisition evidence → confidence = 0.2
- If evidence shows GTM positioning/channel/offer → confidence = 0.8-0.9

### Pattern 6 (DEMAND_FORECASTING_MISMATCH)

F1 implemented: `validateDemandForecastingMismatch()`

**Suppression Logic:**
- Only fires if hasGrowthDeceleration AND (hasCompetitiveContext OR hasMarketStructuralLimit)
- Confidence = 0.9 if all three conditions met; 0.4-0.7 for partial matches

---

## PART 2: BLND-006 CASE TRACE

### Before F1 (SLICE_9 Baseline)

**Patterns Created:**
```
Pattern 3 (Quality Crisis):
  - Dimensions: quality_delivery + customer_retention
  - Supporting items: 2
  - Pattern strength: min(10, 2*2) = 4
  - Potential causes: [TRUST_QUALITY_CRISIS, CUSTOMER_RETENTION_EROSION]

Pattern 6 (Demand Forecasting):
  - Evidence: growth deceleration, competitive pressure, stable retention
  - Pattern strength: calculated (likely ~6-8)
  - Potential causes: [DEMAND_FORECASTING_MISMATCH]
```

**HypothesisGenerator Scoring:**
- TRUST_QUALITY_CRISIS: baseConfidence = (2/5) * 100 * 1.0 * 1.1 = 44%
  - Keyword matches ("nps", "repeat") → +5
  - Confidence capped at 65
  - Result: ~40% confidence

- DEMAND_FORECASTING_MISMATCH: baseConfidence = (2/5) * 100 * 1.0 * 1.2 = 48%
  - Keyword matches ("decelerate", "compete") → +5
  - Confidence capped at 65
  - Result: ~50% confidence

**Final Diagnosis (SLICE_9):** TRUST_QUALITY_CRISIS (confidence 34)
- Despite Pattern 6 having confidence ~50%, Pattern 3 wins
- Reason: Multiple factors (adjudication logic, confidence ceiling, keyword matching)

### After F1 (F1 Benchmark)

**Pattern 3 Creation (with F1 Suppression):**
```
validateTrustQualityCrisis() analysis:
  - Evidence: "NPS 48", "repeat 72%", "operations stable"
  - hasStableQuality = TRUE ✓
  - confidence = 0.1 ← Suppression triggered

patternStrength = max(1, round(4 * 0.1)) = 1
```

**Pattern 6 Creation (unchanged):**
```
validateDemandForecastingMismatch() analysis:
  - Evidence: "Growth 25%→15%", "competitive pressure", "NPS stable", "repeat 72%"
  - hasGrowthDeceleration = TRUE
  - hasCompetitiveContext = TRUE
  - hasStableRetention = TRUE
  - confidence = 0.9 ← Full support

patternStrength = max(1, round(6 * 0.9)) = 5-6
```

**HypothesisGenerator Scoring:**
The critical question: Does HypothesisGenerator use the pattern strength values (1 vs 5)?

**Evidence from code (hypothesis-generator.ts, line 322-335):**
```typescript
let patternStrengthSum = 0;
const supportingIds = new Set<string>();

matchingPatterns.forEach((p) => {
  patternStrengthSum += (p.patternStrength || 1);  // ← Line 326: READ strength
  p.supportingItems.forEach((id) => {
    supportingIds.add(id);
  });
});
```

Variable `patternStrengthSum` is calculated but **NEVER APPEARS IN CONFIDENCE CALCULATION**.

**Confidence Formula (line 381-407):**
```typescript
let baseConfidence = 0;
if (supportingIds.size > 0) {
  baseConfidence = (supportingIds.size / Math.max(allEvidence.length, 1)) * 100;
  const patternWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);  // Uses COUNT
  baseConfidence = baseConfidence * patternWeight;  // Never multiplies by strength
  
  if (req && req.patternBoost) {
    baseConfidence = baseConfidence * req.patternBoost;  // Fixed 1.1, 1.2 multiplier
  }
}
```

The variable `patternStrengthSum` is never referenced again.

**For BLND-006 After F1:**
```
TRUST_QUALITY_CRISIS:
  - matchingPatterns = [Pattern 3]
  - patternStrengthSum = 1 (F1 suppressed)
  - supportingIds.size = 2
  - patternWeight = 1 + 0 = 1.0 (COUNT-based)
  - baseConfidence = (2/5) * 100 * 1.0 * 1.1 = 44%
  - CRITICAL: patternStrengthSum = 1 was NEVER USED
  
DEMAND_FORECASTING_MISMATCH:
  - matchingPatterns = [Pattern 6]
  - patternStrengthSum = 5-6 (F1 boosted)
  - supportingIds.size = 2
  - patternWeight = 1 + 0 = 1.0 (COUNT-based)
  - baseConfidence = (2/5) * 100 * 1.0 * 1.2 = 48%
  - CRITICAL: patternStrengthSum = 5-6 was NEVER USED
```

**Final Diagnosis (F1):** TRUST_QUALITY_CRISIS (confidence 34)
- Pattern strength suppression (1 vs 5) had zero effect
- Both diagnoses scored identically to baseline (baseConfidence differences from 0.1 boost difference)
- Ranking unchanged

### PROOF: Pattern Strength Suppression Was Invisible

**Before F1:**
- Pattern 3 strength: 4
- Pattern 6 strength: 6-8
- HypothesisGenerator uses: Pattern COUNT (both 1) ✓

**After F1:**
- Pattern 3 strength: 1 (suppressed by F1)
- Pattern 6 strength: 5-6 (unchanged)
- HypothesisGenerator uses: Pattern COUNT (both 1) ✓
- **Effect: ZERO** because count didn't change, strength changes ignored

---

## PART 3: WHY HYPOTHESISGENERATOR NEVER CONSUMED PATTERN STRENGTH

### Root Cause: Algorithm Design Independence

HypothesisGenerator.scoreHypothesis() was designed with independent scoring logic:

1. **Pattern Collection:**
   ```typescript
   const matchingPatterns = synthesizedEvidence.patterns.filter(...)
   const patternStrengthSum = ...  // Calculated
   ```

2. **Evidence Count Based Confidence:**
   ```typescript
   baseConfidence = (supportingIds.size / allEvidence.length) * 100
   ```
   This uses evidence items, not pattern strength.

3. **Pattern Count Based Weighting:**
   ```typescript
   const patternWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);
   ```
   This uses count of patterns, not strength of patterns.

4. **Fixed Diagnosis Boost:**
   ```typescript
   baseConfidence = baseConfidence * req.patternBoost;  // Hardcoded 1.1, 1.2
   ```
   This is per-diagnosis, not per-pattern-strength.

5. **Keyword Rescoring:**
   ```typescript
   const keywordMatch = this.scoreKeywordMatch(diagnosisType, allEvidence);
   if (keywordMatch.hasRequiredKeywords) {
     confidence = Math.min(65, confidence + 5);
   }
   ```
   This recalculates from raw evidence keywords, independent of pattern strength.

**The algorithm has NO INPUT VARIABLE that depends on patternStrength values.**

### The Variable is Dead Code

```typescript
let patternStrengthSum = 0;  // Line 325: Initialize
matchingPatterns.forEach((p) => {
  patternStrengthSum += (p.patternStrength || 1);  // Line 326: Accumulate
  // ...
});

// Lines 381-407: baseConfidence calculation
// patternStrengthSum is NEVER REFERENCED

// Line 482: Store in hypothesis
hypothesis.patternStrengthSum = patternStrengthSum;  // ← Only use: reporting

// Rest of code: NO mention of patternStrengthSum
```

The variable is calculated and stored for reporting, but not used in confidence formula.

---

## PART 4: F1 BENCHMARK FAILURE PROOF

### Correct Cases: Unchanged by F1

Before F1 (SLICE_9):
```
BLND-007: GO_TO_MARKET_MISALIGNMENT ✓ (correct)
RW-018: UNIT_ECONOMICS_BREAKDOWN ✓ (correct)
RW-020: UNIT_ECONOMICS_BREAKDOWN ✓ (correct)
PD-011: UNIT_ECONOMICS_BREAKDOWN ✓ (correct)
PD-013: OPERATIONAL_BOTTLENECK ✓ (correct)
PD-015: UNIT_ECONOMICS_BREAKDOWN ✓ (correct)
PD-017: DEMAND_FORECASTING_MISMATCH ✓ (correct)
SYN-011: TRUST_QUALITY_CRISIS ✓ (correct)
```

After F1:
```
All 8 cases: UNCHANGED ✓ (zero regressions)
```

Why? Because these cases were never affected by F1's suppression logic. Either:
- They don't have stable quality evidence (Pattern 3 not suppressed)
- They don't have adoption evidence without GTM (Pattern 5 not suppressed)
- They have demand evidence (Pattern 6 properly boosted)

### Failing Cases: Still Failing After F1

Before F1 (SLICE_9):
```
BLND-006: Expected DEMAND_FORECASTING_MISMATCH, Got TRUST_QUALITY_CRISIS (wrong)
BLND-008: Expected INSUFFICIENT_EVIDENCE, Got GO_TO_MARKET_MISALIGNMENT (wrong)
... (11 more failing cases)
```

After F1:
```
BLND-006: Expected DEMAND_FORECASTING_MISMATCH, Got TRUST_QUALITY_CRISIS (still wrong)
BLND-008: Expected INSUFFICIENT_EVIDENCE, Got GO_TO_MARKET_MISALIGNMENT (still wrong)
... (11 still failing)
```

F1 Made Zero Changes to Failing Cases.

Why BLND-006 Still Fails After F1:
1. ✅ Pattern 3 suppressed from strength 4 → 1
2. ✅ Pattern 6 confidence = 0.9 (high confidence)
3. ❌ HypothesisGenerator ignores both strength values
4. ❌ baseConfidence formula uses (2/5) * 100 * 1.1 = 44% for both diagnoses
5. ❌ Keyword boosts applied equally to both diagnoses
6. ❌ Final diagnosis still TRUST_QUALITY_CRISIS (lower correct diagnosis)

---

## PART 5: ROOT CAUSE SUMMARY

**Why F1 Was Invisible:**

1. **EvidenceSynthesisEngine:** Produced patternStrength = 1 (suppressed) ✓
2. **Data Contract:** SynthesizedEvidence included patternStrength field ✓
3. **HypothesisGenerator Input:** Received patterns with patternStrength populated ✓
4. **HypothesisGenerator Algorithm:** Does NOT read patternStrength in confidence formula ❌
5. **HypothesisGenerator Output:** Confidence calculated independently of pattern strength ❌

**The contract was violated at the algorithm level.** HypothesisGenerator was designed to calculate confidence from:
- Evidence count (supportingIds.size)
- Pattern count (matchingPatterns.length)
- Keyword matching (searchKeywords in evidence)
- Fixed multipliers (patternBoost per diagnosis)

It has no computational path to use pattern strength values, even if they are provided.

---

## PART 6: WHAT WOULD HAVE MADE F1 VISIBLE

To make F1 work, HypothesisGenerator would need to change the confidence formula:

**Current (broken for F1):**
```typescript
const patternWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);
baseConfidence = baseConfidence * patternWeight;  // Uses COUNT
```

**Required (to use pattern strength):**
```typescript
const avgPatternStrength = patternStrengthSum / matchingPatterns.length;
const patternWeight = (avgPatternStrength / 10) * 1.5;  // Uses STRENGTH
baseConfidence = baseConfidence * patternWeight;
```

Or alternatively:

**Required (to use max pattern strength):**
```typescript
const maxPatternStrength = Math.max(...matchingPatterns.map(p => p.patternStrength || 1));
const strengthMultiplier = maxPatternStrength / 10;  // Range 0.1 to 1.0
baseConfidence = baseConfidence * strengthMultiplier;
```

Without this change, F1's pattern strength modulation is dead code.

---

## CONCLUSION

**F1 Was Invisible Because:**

1. Pattern strength was successfully modulated in EvidenceSynthesisEngine
2. Pattern strength was correctly transmitted to HypothesisGenerator
3. HypothesisGenerator never read or used patternStrength in confidence calculation
4. Confidence scores remained identical to SLICE_9 baseline
5. Final diagnosis rankings unchanged
6. Benchmark result: 0 net gain, 8/21 accuracy (identical to baseline)

**This is not a bug in F1, but an architectural contract defect:** The data field (patternStrength) exists and is populated, but the algorithm was not designed to consume it.
