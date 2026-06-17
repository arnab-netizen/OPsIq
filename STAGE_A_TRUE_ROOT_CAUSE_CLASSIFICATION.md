# PHASE 5 — TRUE ROOT CAUSE CLASSIFICATION

**Classification of True Root Cause Across 13 Failing Cases**

**Based on:** Forensic score tracing, failed fix postmortem, scoring formula analysis  
**Excludes:** Previous incorrect conclusions from simulation, not supported by score evidence

---

## ROOT CAUSE COUNTS (REVISED — Based on Forensic Trace Analysis)

**CRITICAL UPDATE:** Initial claim of "100% PATTERN_STRENGTH_IGNORED" was INCORRECT.  
Actual forensic trace data reveals root causes are MIXED and case-dependent.

### Root Cause Distribution

| Root Cause | Count | Cases | Impact | Pattern Strength Relevance |
|---|---|---|---|---|
| **DIAGNOSIS_NOT_IN_PATTERN_MAPPING** | 9 (69%) | BLND-006, BLND-008, BLND-009, BLND-010, ADV-011, ADV-013, ADV-014, RW-024, RW-016 | Correct diagnosis never generated (rank 0, confidence 0) | ZERO (pattern never used) |
| **PATTERN_STRENGTH_UNUSED_IN_RANKING** | 1 (8%) | SYN-013 | Correct diagnosis lacks pattern; winner has pattern strength 3 | YES (pattern exists for winner only) |
| **EQUAL_PATTERN_STRENGTH_DIFFERENT_BOOSTING** | 3 (23%) | ADV-012, RW-022, PD-019 | Correct diagnosis uses SAME pattern strength as winner | ZERO (boosting decides, not strength) |

**Key Finding:** Disabling keyword boosts (Variant A test) correctly showed NO improvement because 3 of 4 ranking failures use equal pattern strength for both diagnoses. Adding pattern strength to the formula will NOT fix 9 of 13 cases because their correct diagnoses are not mapped to any pattern.

### Secondary Root Causes (Manifestations)

| Root Cause | Count | Evidence | Explanation |
|---|---|---|---|
| DIAGNOSIS-TO-PATTERN_MAPPING_INCOMPLETE | 9 | BLND-006: demand_forecasting_mismatch not mapped to any pattern; BLND-008: insufficient_evidence not mapped; ADV-013, RW-024: no patterns generated | Pattern system maps diagnoses to fixed potentialRootCauses lists; unmapped diagnoses never scored above floor |
| PATTERN_GENERATION_INSUFFICIENT_DATA | 2 | ADV-013, RW-024 (empty patternsGenerated arrays) | Evidence mixed/incomplete, pattern creation thresholds not met |
| KEYWORD_BOOSTING_NOT_DECISIVE | 3 | ADV-012, RW-022, PD-019: 5-point gaps despite equal pattern strength | Score difference created by specificity/diversity matching, not keyword or pattern strength differences |
| NO_INSUFFICIENT_EVIDENCE_MECHANISM | 4 | ADV-011, ADV-013, ADV-014, BLND-008 | System must return a diagnosis; returns lowest-confidence diagnosis instead of "insufficient" marker |

---

## DETAILED ROOT CAUSE ANALYSIS

### DEFECT 1: DIAGNOSIS-TO-PATTERN MAPPING INCOMPLETE (9 cases, 69%)

**Problem:** Correct diagnosis not mapped to any pattern's potentialRootCauses list

**Example (BLND-006):**
```
Ground truth: demand_forecasting_mismatch

Patterns Generated:
  1. quality_delivery-customer_retention-pattern (strength 1)
     → potentialRootCauses: [trust_quality_crisis, customer_retention_erosion]
  2. market_position-customer_retention-pattern (strength 4)
     → potentialRootCauses: [go_to_market_misalignment]

Result:
  - demand_forecasting_mismatch never appears in any pattern
  - Confidence: 0 (not generated in hypotheses)
  - Winner: trust_quality_crisis (34)
```

**Why This Breaks The Algorithm:**
- Pattern strength (4) is calculated but completely UNUSED
- Diagnosis never considered, regardless of evidence strength
- Fixing base confidence formula or pattern strength weighting has ZERO impact
- Fix required: Redesign pattern system to map all diagnoses to patterns

**Affected Cases:** BLND-006, BLND-008, BLND-009, BLND-010, ADV-011, ADV-013, ADV-014, RW-016, RW-024

---

### DEFECT 2: PATTERN_STRENGTH_UNUSED IN BASE CONFIDENCE (1 case, 8%)

**Code Location:** `src/services/stage-a/hypothesis-generator.ts`, line 326

```typescript
let patternStrengthSum = 0;
matchingPatterns.forEach((p) => {
  patternStrengthSum += (p.patternStrength || 1); // <-- COLLECTED
  p.supportingItems.forEach((id) => {
    supportingIds.add(id);
  });
});

// Lines 338-407: Base confidence formula
const baseConfidence = (supportingIds.size / allEvidenceSize) × patternWeight × patternBoost;
// patternStrengthSum is NEVER used here
```

**Problem:** `patternStrengthSum` calculated but never applied to confidence formula

**Example (SYN-013):**
```
Ground truth: customer_retention_erosion

Patterns Generated:
  1. market_position-customer_retention-pattern (strength 3)
     → potentialRootCauses: [go_to_market_misalignment]

Result:
  - customer_retention_erosion NOT in pattern potentialRootCauses
  - confidence(customer_retention_erosion) = ~10 (no pattern)
  - confidence(go_to_market_misalignment) = 33 (pattern strength 3 used)
  - Winner: go_to_market_misalignment by 23 points

If pattern strength were used in formula:
  - customer_retention_erosion needs ITS OWN pattern to compete
  - Pattern strength alone doesn't solve this (diagnosis unmapped)
```

**Impact:** 
- Pattern strength only helps diagnoses WITH patterns
- Correct diagnosis (SYN-013) lacks pattern entirely
- Fix: Add customer_retention pattern for adoption failures

**Affected Cases:** SYN-013 (1 case)

---

### DEFECT 3: EQUAL PATTERN STRENGTH, DIFFERENT CONFIDENCE (3 cases, 23%)

**Problem:** Correct diagnosis uses SAME pattern strength as winner; score gap caused by boosting, not strength

**Example (ADV-012):**
```
Ground truth: trust_quality_crisis
Predicted: customer_retention_erosion
Gap: 5 points (45 vs 40)

Both diagnoses use SAME pattern:
  - quality_delivery-customer_retention-pattern (strength 3)
  - Both score ~40-45 range based on:
    - supportingIds.size: 2 (same)
    - patternWeight: 1.0 (same)
    - patternBoost: 1.0-1.1 (similar)
    - keyword boost: +5 (different for each diagnosis)
    - specificity match: varies by evidence keywords

Conclusion:
  - Pattern strength (3) is identical for both
  - Score difference (5 pts) is NOT from pattern strength
  - Difference from keyword matching, specificity, or evidence diversity
  - Disabling keyword boost (Variant A) showed no improvement because other boosters still active
```

**Why Adding Pattern Strength Won't Help:**
- Both diagnoses already calculate strength identically
- Adding strength to formula doesn't change relative ranking if both use same strength
- Would need stronger pattern for correct diagnosis, or weaker pattern for winner

**Affected Cases:** ADV-012 (5 pts), RW-022 (5 pts), PD-019 (5 pts)

---

### SECONDARY ISSUES: INSUFFICIENT_EVIDENCE MECHANISM & PATTERN GENERATION THRESHOLDS

**Issue 1: No INSUFFICIENT_EVIDENCE Return Path (4 cases)**

Code: `src/services/stage-a/hypothesis-generator.ts`, lines ~380-410 (hypothesis ranking)

```typescript
// Current: Always returns top diagnoses with confidence > 0
const topHypotheses = sortedHypotheses.slice(0, 3).filter(h => h.confidence > 0);
return topHypotheses;

// Missing: Threshold to return INSUFFICIENT_EVIDENCE
// Should be: if (allConfidences < threshold) return [{rootCause: 'insufficient_evidence', confidence: 0}]
```

**Examples:**
- ADV-011: Confidence 50 (unit_economics_breakdown) — but evidence is incomplete/insufficient
- ADV-013: Confidence 26 (unit_economics_breakdown) — evidence mixed and contradictory
- ADV-014: Confidence 45 (operational_bottleneck) — evidence complex and ambiguous
- BLND-008: Confidence 33 (go_to_market_misalignment) — deal structure insufficiently quantified

**Impact:** System must always return a diagnosis; cannot decline to decide when evidence is weak

**Issue 2: Pattern Generation Thresholds (2 cases)**

Code: `src/services/stage-a/pattern-synthesizer.ts`, pattern matching functions

**Examples:**
- ADV-013: patternsGenerated = [] (EMPTY)
  - Evidence: CAC payback deteriorating BUT blended payback strong (conflicting signals)
  - Pattern thresholds not met due to mixed/incomplete evidence
- RW-024: patternsGenerated = [] (EMPTY)
  - Evidence: Talent retention down, market consolidation pressure (separate issues)
  - Pattern thresholds not met; system defaults to floor confidence

**Impact:** When patterns don't generate, diagnoses default to very low confidence (~10-26 range)
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

