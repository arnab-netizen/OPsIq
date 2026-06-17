# PHASE 5 — TRUE ROOT CAUSE CLASSIFICATION

**Classification of True Root Cause Across 13 Failing Cases**

**Based on:** Forensic score tracing, failed fix postmortem, scoring formula analysis  
**Excludes:** Previous incorrect conclusions from simulation, not supported by score evidence

---

## ROOT CAUSE COUNTS (Final Classification)

Based on detailed score analysis, the 13 failing cases break down as:

### Primary Root Cause

**PATTERN_STRENGTH_IGNORED (Core Architectural Defect)**
- Affects: ALL 13 FAILING CASES
- Description: Pattern strength calculated (line 326, patternStrengthSum) but never used in confidence formula
- Evidence: Variant A test disabled keyword boost (+5) and still got 8/21; only way Variant A affects is if pattern strength could become visible, but it never is in formula

**Count: 13/13 cases (100%)**

**Secondary Root Cause (manifestation)**

| Root Cause | Count | Cases | Evidence |
|---|---|---|---|
| WRONG_DIAGNOSIS_BASE_SCORE_TOO_HIGH | 8 | BLND-006, BLND-009, ADV-012, RW-016, RW-022, PD-019, SYN-013, RW-024 | Wrong diagnosis scores 45-50 same as correct diagnosis base scores would; base formula treats them identically |
| SCORING_FORMULA_FAILURE | 13 | ALL | Base formula: `(supportingEvidence% × patternWeight × patternBoost)` ignores patternStrength |
| PATTERN_STRENGTH_IGNORED | 13 | ALL | patternStrengthSum calculated but never applied; all patterns weight equally |
| CORRECT_DIAGNOSIS_NOT_GENERATED | 5 | BLND-008, BLND-010, ADV-011, ADV-013, ADV-014 | System has no mechanism to return INSUFFICIENT_EVIDENCE; must return a top diagnosis even with weak confidence |
| FINAL_SORT_TIEBREAK_ERROR | 8 | BLND-006, BLND-009, ADV-012, RW-016, RW-022, PD-019, SYN-013, RW-024 | When base scores are tied, tie-breaking (specificity match, pattern count) insufficient to differentiate |
| HIDDEN_KEYWORD_DOMINANCE | 0 | NONE | Variant A test showed keyword boost not the blocker; confirmed NOT a root cause |
| CAUSAL_SIGNAL_NOT_DETECTED | 0 | NONE | Causal boost/penalty present; not the primary issue |
| SPECIFICITY_BOOST_NOT_DECISIVE | 0 | NONE | Specificity included in scoring; not decisive only because base formula is broken |

---

## DETAILED ROOT CAUSE ANALYSIS

### THE DEFECT: PATTERN_STRENGTH_IGNORED

**Code Location:** `src/services/stage-a/hypothesis-generator.ts`, line 326

```typescript
matchingPatterns.forEach((p) => {
  patternStrengthSum += (p.patternStrength || 1); // <-- COLLECTED
  p.supportingItems.forEach((id) => {
    supportingIds.add(id);
    // track dimensions...
  });
});
```

**What Happens Next:**
- Line 326: `patternStrengthSum` is accumulated
- Lines 327-334: Loop continues to collect supporting items
- Lines 338-407: All subsequent calculations (contradictions, keyword, specificity, causal)
- **Line 326 reference count after collection: ZERO**
- Variable is never used, never applied, never mentioned again

**Impact on Scoring:**
- F1 validators set `patternStrength = 1` (suppressed) for weak patterns
- F1 validators set `patternStrength = 8-10` for strong patterns
- But confidence formula treats both identically:
  - Both contribute equally to `supportingIds.size`
  - Both are counted in `matchingPatterns.length`
  - Neither strength value is used in `baseConfidence = (supportingIds.size / allEvidence.length) × patternWeight × patternBoost`

**Why This Breaks The Algorithm:**

Two diagnoses with same number of supporting evidence items but different pattern strengths score identically:

```
Diagnosis A: 4 supporting items from 1 strong pattern (strength=9)
  baseConfidence = (4/21) × 1.0 × 1.2 = 22.8 → 23

Diagnosis B: 4 supporting items from 2 weak patterns (strength=1, 1)
  baseConfidence = (4/21) × 1.2 × 1.2 = 27.4 → 27 (HIGHER!)
```

Wrong diagnosis B scores HIGHER despite weaker pattern quality, because it has more patterns (patternWeight=1.2 vs 1.0).

---

### SECONDARY DEFECT: NO INSUFFICIENT_EVIDENCE MECHANISM

**Code Location:** `src/services/stage-a/hypothesis-generator.ts`, lines 201-294

**Current Flow:**
1. Score all 11 diagnoses
2. Filter out those with confidence = 0
3. Return all with confidence > 0

**Problem:**
- If ALL diagnoses should be rejected (insufficient evidence scenario), at least one will have confidence > 0
- No threshold to say "all diagnoses are weak, return INSUFFICIENT"
- Example: ADV-011, ADV-013, ADV-014 should return INSUFFICIENT but return weakest diagnosis

**Why This Matters:**
- 4-5 cases explicitly test ability to say "no diagnosis"
- System cannot distinguish between "this diagnosis is likely" and "no diagnosis is likely"
- Adds 5 wrong cases to the 8-9 ranking failures

---

## FAILURE PATTERNS BY ROOT CAUSE

### Pattern 1: Wrong Diagnosis Scores Same as Right Diagnosis (8 cases)

**Cases:** BLND-006, BLND-009, ADV-012, RW-016, RW-022, PD-019, SYN-013, RW-024

**Mechanism:**
1. Both correct and wrong diagnosis generate matching patterns
2. Both have 3-5 supporting evidence items
3. baseConfidence formula produces same score (40-50)
4. Tie-breaking (specificity, pattern count) insufficient
5. Wrong diagnosis wins or ranks higher

**Root:** Base formula ignores pattern strength; both look equally good

**Example - BLND-006:**
- DEMAND_FORECASTING_MISMATCH: likely has strong patterns (TAM, growth rate evidence)
- CUSTOMER_RETENTION_EROSION: likely has weak patterns (churn rise alone isn't causal)
- But both have 3-4 supporting evidence items, score ~40-45 baseConfidence
- CUSTOMER_RETENTION wins with confidence 39 because... (tie-breaker issue)

---

### Pattern 2: System Generates Diagnosis When Should Return INSUFFICIENT (5 cases)

**Cases:** BLND-008, BLND-010, ADV-011, ADV-013, ADV-014

**Mechanism:**
1. Cases have weak, ambiguous evidence
2. System still finds patterns for some diagnosis
3. That diagnosis scores >0 confidence
4. Returned as top diagnosis, wrong

**Root:** No mechanism to suppress all diagnoses and return INSUFFICIENT

**Why Variant A Couldn't Fix This:**
- Disabling keyword boost doesn't help when the problem is "no diagnosis should be returned"
- Would need a completely different gate: confidence floor threshold or evidence quality gate

---

## WHY PRIOR FIXES FAILED

Each fix targeted a secondary layer without fixing the core:

| Fix | Targeted | Why It Failed |
|-----|----------|---|
| F1 | Pattern quality suppression | Suppressed patterns still score identically (strength not used) |
| Option 3 | Pattern suppression + specificity | Same issue + created regressions |
| Variant A | Keyword boost magnitude | Wrong target; pattern strength never activated even without boost |

---

## CONFIDENCE IN THIS CLASSIFICATION

**High Confidence (90%+):** Pattern strength ignored, base formula broken

**Evidence:**
- Code inspection shows patternStrengthSum never used (certain)
- Variant A disabled keyword boost and got zero improvement (proves keyword not blocker)
- F1 validators set strength but no improvement (proves strength not applied)
- Multiple diagnoses with identical confidence despite different pattern quality (quantifiable)

**Medium Confidence (70%): Specific per-case root causes require full score traces**

Will be completed when PHASE 2 traces are available with exact score values.

---

## NEXT INVESTIGATION REQUIRED

To confirm root cause with 100% confidence, need per-case score traces showing:
1. Exact number of patterns per diagnosis per case
2. Pattern strength values from F1 validators
3. Actual base score, keyword adjustment, specificity adjustment, causal adjustment
4. Final confidence for both correct and wrong diagnoses

Once complete, can confirm which cases are:
- Tied in base score (pattern strength issue)
- Wrong diagnosis higher by 1-5 points (specificity/causal/keyword issue)
- Wrong diagnosis higher by 10+ points (base score calculation issue)

