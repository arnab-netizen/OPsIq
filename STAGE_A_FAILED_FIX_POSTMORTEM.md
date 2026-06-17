# PHASE 4 — FAILED FIX POSTMORTEM

**Analysis of Why F1, Option 3, and Option 2 Variant A Failed to Improve Accuracy**

---

## FIX 1: F1 (SLICE_8 - Causal Evidence Distinction)

**What It Changed:**
- Added causal vs symptom distinction (SLICE_8 added causal/negative indicators)
- Added F1 validators to suppress patterns when contradicting evidence found
- Added causal evidence boost (+0-15 points) and causal penalty (-15 if defined but missing)

**Expected Impact:**
- Cases with strong causal evidence should score higher
- Cases with only symptoms (no causal evidence) should score lower
- Patterns suppressed to strength=1 when F1 validators found contradictions
- Overall accuracy improvement from pattern quality enhancement

**Actual Result:**
- 8/21 (38.1%) — NO IMPROVEMENT over baseline

**Why It Failed:**

1. **Pattern strength is collected but unused:**
   - F1 validators set patternStrength = 1 (suppressed) or higher (strong)
   - But `patternStrengthSum` calculated at line 326 is NEVER USED
   - Suppressed patterns score identically to strong patterns in base confidence formula

2. **Causal boost/penalty too weak:**
   - Causal boost: +0 to +15 (only if causal keywords found)
   - Many cases don't have causal keyword matches even if they have causal signals
   - Causal penalty -15 applies to diagnoses with defined causal indicators but no matches
   - Not enough to flip wrong diagnoses at confidence 50

3. **Base score formula dominates:**
   - Base confidence from `(supportingEvidence% × patternWeight × patternBoost)` = 25-35 points
   - Causal boost/penalty only ±15 on top
   - If two diagnoses both have patterns with similar supporting evidence, they start nearly equal
   - Causal signals don't move them enough

4. **Contradictions not strong enough:**
   - Each contradiction: -8 points
   - But diagnoses with 1-2 contradictions still score 40+ (starting from 45-50 base)
   - Not enough separation

**Verdict:** F1 targeted pattern quality via F1 validators, but the scoring algorithm ignores pattern strength. The fix was correct in theory (distinguish strong patterns from weak ones) but failed because the formula doesn't USE pattern strength.

---

## FIX 2: OPTION 3 (F1 + Specificity Match + Pattern Suppression)

**What It Changed:**
- (Built on F1 foundationsscaling)
- Added evidence specificity match scoring
- Enhanced contradiction detection and F1 suppression
- Adjusted causal boost mechanics

**Expected Impact:**
- More granular discrimination between diagnoses using specificity
- Better pattern suppression from enhanced F1
- Higher accuracy by using evidence quality more directly

**Actual Result:**
- First benchmark: 6/21 (28.6%) — **REGRESSION**
- Reverted immediately

**Why It Failed:**

1. **Too aggressive on pattern suppression:**
   - Suppressed some correct-diagnosis patterns entirely
   - Left wrong-diagnosis patterns unsuppressed
   - Led to regressions (went backward)

2. **Specificity match ineffective:**
   - Specificity boost added but formula: `confidence + round(specificity × 10)` = +0 to +10
   - Not enough to differentiate when wrong diagnosis already at 50
   - May have suppressed wrong diagnoses' specificity but also suppressed correct ones

3. **Over-targeted approach:**
   - Tried to fix pattern quality AND specificity AND causal signals simultaneously
   - Too many changes at once
   - When it failed, couldn't isolate which component caused regression

**Verdict:** Option 3 was too ambitious. Tried to solve multiple layers (pattern generation, specificity, causal) but created regressions. Reverted immediately.

---

## FIX 3: OPTION 2 VARIANT A (Disable Keyword Boosts)

**What It Changed:**
- Disabled keyword boost logic (lines 419-425)
- Removed +5 boost when diagnosis has required keywords and supporting keywords
- Kept -15 penalty when diagnosis lacks required keywords but has contradictory keywords

**Expected Impact:**
- Disabled keyword boost would allow pattern strength to become more visible
- Keyword boost was "overriding correct pattern strength"
- Expected improvement: 9-10/21 (43-48%)
- Confidence level: 85%

**Actual Result:**
- 8/21 (38.1%) — ZERO IMPROVEMENT
- Some predictions changed (BLND-006, BLND-010) but still wrong
- No newly fixed cases, no regressions, just different wrong answers

**Why It Failed:**

1. **Keyword boost not the blocker:**
   - Keyword boost is only +5 points
   - Affecting only cases where diagnosis has required keywords but also has contradictory keywords
   - BLND-006 changed predictions (had keyword match issue) but diagnosis still wrong
   - The real wrong diagnosis (CUSTOMER_RETENTION_EROSION) likely scored higher for different reasons

2. **Wrong target diagnosis:**
   - Mathematical simulation assumed Pattern 3 (strength 1) vs Pattern 6 (strength 4) would flip
   - But even without keyword boost, Pattern 6 still wins
   - This means either:
     a) Pattern strength values are different than assumed
     b) Specificity boost/causal signals favor Pattern 6 more than keyword boost favors Pattern 3
     c) Pattern matching is wrong (Pattern 6 shouldn't be generated for this case)
     d) Base score formula allows Pattern 6 to score high on different evidence

3. **Simulation model was incomplete:**
   - Simulation predicted removal of keyword boost would cause pattern strength to become decisive
   - But scoring algorithm doesn't actually USE pattern strength (it's calculated but not applied)
   - So removing keyword boost couldn't unlock pattern strength
   - This reveals the fundamental PATTERN_STRENGTH_IGNORED defect

4. **Cannot fix with adjustments alone:**
   - Keyword boost is a refinement, not a structural fix
   - Pattern strength is structurally unused
   - No amount of tweaking keyword logic will activate pattern strength
   - Need to refactor base score formula to include pattern strength

**Verdict:** Variant A failed because it targeted the wrong architectural layer. The problem is not keyword boost magnitude, but the complete absence of pattern strength from the base confidence calculation.

---

## COMPARATIVE FAILURE ANALYSIS

| Fix | Target | Expected | Actual | Root Cause of Failure |
|-----|--------|----------|--------|----------------------|
| F1 | Pattern quality (suppress weak, boost strong) | Better discrimination | 8/21 (no change) | Pattern strength calculated but unused in scoring |
| Option 3 | Pattern quality + specificity + causal | Better multi-factor discrimination | 6/21 (regression) | Over-aggressive suppression + interaction side effects |
| Variant A | Keyword boosts obscuring pattern strength | Pattern strength becomes visible | 8/21 (no change) | Pattern strength never used even without keyword boost |

---

## KEY INSIGHT: THE STRUCTURAL DEFECT

All three fixes failed for the same reason:

**The scoring formula calculates patternStrengthSum (line 326) but NEVER USES IT (no reference after line 326).**

This means:
- F1 validators set patternStrength = 1 (weak) or 1-10 (strong)
- But all matching patterns are treated identically in confidence calculation
- Whether a pattern is suppressed to strength=1 or rated strong, it contributes equally
- No amount of adjustment to other components (keyword, specificity, causal) can compensate

**To fix this, the base confidence formula must be refactored to include pattern strength:**

Current (broken):
```
baseConfidence = (supportingEvidence% × patternWeight × patternBoost)
  where patternWeight = 1.0 or 1.2 (based on pattern count only, not quality)
```

Required (to fix):
```
baseConfidence = (supportingEvidence% × patternStrengthAverage × patternWeight × patternBoost)
  where patternStrengthAverage = sum(patternStrengths) / count(patterns)
```

---

## IMPLICATIONS FOR NEXT FIX

1. **Do not target adjustments (keyword, specificity, causal)** — they're secondary
2. **Target the base formula** — pattern strength must be included
3. **Pattern strength must matter for ranking** — suppressed patterns should score lower
4. **F1 validators must have measurable impact** — currently they don't

---

## FAILED FIX REUSABILITY

- **F1 logic:** KEEP (correct distinction of causal vs symptom, correct suppression mechanism)
- **Option 3 specificity:** DISCARD (too aggressive, unclear benefit)
- **Variant A keyword logic:** KEEP AS-IS (not the blocker, but also not harmful)

All three fixes were built on the assumption that adjusting scoring components could work around the missing pattern strength. They all failed for this reason.

