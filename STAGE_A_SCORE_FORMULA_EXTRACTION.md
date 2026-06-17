# STAGE A SCORE FORMULA EXTRACTION

**Date:** 2026-06-17  
**Extraction Method:** Direct code analysis of src/services/stage-a/hypothesis-generator.ts, evidence-synthesis-engine.ts, hypothesis-ranker.ts, and causal-diagnosis-adjudicator.ts  
**Purpose:** Document the exact scoring formula used to produce final diagnosis  

---

## LAYER 1: EVIDENCE PATTERN GENERATION

### EvidenceSynthesisEngine.synthesizeEvidence()
**File:** `src/services/stage-a/evidence-synthesis-engine.ts`  

**Inputs:**
- `evidence: EvidenceItem[]` — raw evidence items with dimension, finding, isCritical flag

**Output:**
- `SynthesizedEvidence` containing patterns with `patternStrength: 0-10`

**Pattern Generation Logic:**
1. Maps evidence dimensions to pattern types
2. Applies F1 validators to suppress patterns with contradicting evidence
3. Calculates patternStrength (1-10, suppressed to 1 if contradictions found)

**Critical Issue:** Pattern strength is calculated but later IGNORED in confidence scoring (PATTERN_STRENGTH_IGNORED defect)

---

## LAYER 2: HYPOTHESIS SCORING FORMULA

### HypothesisGenerator.scoreHypothesis() — THE CORE ALGORITHM
**File:** `src/services/stage-a/hypothesis-generator.ts` **Lines:** 297-492

**Scoring Components (executed in sequence):**

1. **Pattern Matching** (line 303-305):
   - Select patterns with `potentialRootCauses.includes(diagnosisType)`
   - patternStrengthSum calculated (line 326) but NEVER USED

2. **Supporting Evidence Collection** (lines 320-335):
   - Count unique evidence IDs from matching patterns
   - supportingIds.size = number of evidence items supporting diagnosis

3. **Base Confidence Calculation** (lines 381-401):
   ```
   baseConfidence = (supportingIds.size / evidence.length) × 100
   baseConfidence = baseConfidence × patternWeight  // 1.0 or 1.2
   baseConfidence = baseConfidence × req.patternBoost  // diagnosis-specific: 1.1-1.3
   ```
   - **patternWeight:** 1.0 (1 pattern) or 1.2 (2+ patterns)
   - **patternBoost:** UNIT_ECONOMICS=1.3, OPERATIONAL=1.2, others=1.1-1.15

4. **Contradiction Penalty** (lines 404-407):
   - For each contradicting evidence item: -8 points
   - `scoreAfterContradictions = Math.max(0, baseConfidence - contradictions * 8 - negativeIndicatorPenalty)`

5. **Keyword Boost/Penalty** (lines 419-425) — **THIS IS WHAT VARIANT A DISABLED:**
   ```
   if (hasRequiredKeywords && supportingKeywords > 0) {
     confidence += 5  // VARIANT A: disabled
   } else if (!hasRequiredKeywords && contradictoryKeywords > 0) {
     confidence -= 15
   }
   ```

6. **Specificity Boost** (lines 428-430):
   ```
   if (specificityMatch > 0.5) {
     confidence += Math.round(specificityMatch × 10)  // 0-10 point boost
   }
   ```

7. **Causal Evidence Boost** (lines 432-445):
   ```
   if (causalIndicators found) {
     causalBoost = Math.min(15, causalCount × 3)
     confidence += causalBoost
   } else if (causalIndicators defined but NOT found) {
     confidence -= 15
   }
   ```

8. **Final Confidence Cap:**
   - Pattern-based: min(65)
   - Baseline (no patterns): min(40)

---

## WHY VARIANT A FAILED (0 improvement)

**Expected:** Removing keyword +5 boost would allow pattern strength (F1-suppressed values) to become decisive

**Actual Result:** 8/21 → 8/21 (no change)

**Root Cause Analysis:**
- Keyword boost affects only 1 case (BLND-006: changed prediction but still wrong)
- The real problem is NOT keyword boosts, but one of:
  1. **Base score formula allows wrong patterns to dominate** (same supportingEvidence% for right and wrong patterns)
  2. **patternStrengthSum is unused** (F1 strength values ignored completely)
  3. **Specificity boost overpowers weak patterns** (diagnosis with higher dimension match wins regardless of pattern quality)
  4. **Pattern generation is wrong** (wrong diagnoses getting patterns at all)

---

## CRITICAL DEFECT EVIDENCE

**Line 326:** `patternStrengthSum += (p.patternStrength || 1);`
- This variable is COLLECTED but NEVER REFERENCED
- All matching patterns treated as if they have strength = 1
- F1 validators that set strength = 1 (suppressed) and strength = 10 (strong) are indistinguishable in scoring

**Implication:** Disabling keyword boosts was the wrong target. The scoring algorithm needs to actually USE pattern strength in the base confidence calculation.

---

## CONFIDENCE FORMULA (SIMPLIFIED)

```
confidence = base_score ± adjustments
  where:
    base_score = (supportingEvidence% × patternWeight × patternBoost)
    
    adjustments = 
      - (contradictions × 8)
      - (negativeIndicators × 10)
      + (hasRequiredKeywords ? 5 : 0)
      - (noRequiredKeywords && hasContradictions ? 15 : 0)
      + (specificityMatch > 0.5 ? specificityMatch × 10 : 0)
      + (hasCausal ? causalCount × 3 : 0)
      - (!hasCausal && causalDefined && confidence > 40 ? 15 : 0)
      
    capped at 65 (or 40 for baseline)
```

---

## WHAT IS NOT USED

- **patternStrengthSum** — Calculated but never applied to confidence
- **HypothesisRanker** — Defined class, never called in main flow
- **Pattern strength differential** — All patterns treated equally if they match

---

## NEXT FORENSIC FOCUS

The investigation must trace per-case to understand:
1. Are matching patterns being generated for WRONG diagnoses?
2. Does base_score formula place right and wrong diagnoses equally?
3. What exact adjustment component causes wrong diagnosis to win?
4. Can that component be traced back to a specific code section?

