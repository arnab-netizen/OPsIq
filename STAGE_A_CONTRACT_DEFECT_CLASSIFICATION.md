# STAGE A CONTRACT DEFECT CLASSIFICATION

**Objective:** Classify the architectural defects that caused F1 to have zero impact

**Scope:** Data flow contract between EvidenceSynthesisEngine and HypothesisGenerator

---

## DEFECT #1: PATTERN_STRENGTH_IGNORED

### Definition
Pattern strength field (patternStrength: number) is produced upstream, transmitted through the data contract, but never consumed by the downstream ranking algorithm.

### Affected Files
- **Producer:** src/services/stage-a/evidence-synthesis-engine.ts
  - Function: `checkPatternWithContentValidation()` (lines 413-443)
  - Produces: `patternStrength = max(1, round(baseStrength * contentConfidence))`

- **Consumer:** src/services/stage-a/hypothesis-generator.ts
  - Function: `scoreHypothesis()` (lines 283-448)
  - Line 326: `patternStrengthSum += (p.patternStrength || 1);`
  - Lines 381-407: baseConfidence calculation (NEVER REFERENCES patternStrengthSum)

### Evidence

**Code Location 1 (Calculation, EvidenceSynthesisEngine):**
```typescript
// Line 427-434
const patternStrength = Math.max(
  1,
  Math.round(baseStrength * contentConfidence)
);

return {
  name: `${requiredDimensions.join("-")}-pattern`,
  // ...
  patternStrength,  // ← Set here
  // ...
};
```

**Code Location 2 (Receipt, HypothesisGenerator):**
```typescript
// Line 322-335
let patternStrengthSum = 0;
const supportingIds = new Set<string>();

matchingPatterns.forEach((p) => {
  patternStrengthSum += (p.patternStrength || 1);  // ← Accumulated
  p.supportingItems.forEach((id) => {
    supportingIds.add(id);
  });
});
```

**Code Location 3 (Use, HypothesisGenerator):**
```typescript
// Lines 381-407: baseConfidence calculation
let baseConfidence = 0;
if (supportingIds.size > 0) {
  baseConfidence = (supportingIds.size / Math.max(allEvidence.length, 1)) * 100;
  const patternWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);  // ← Uses COUNT
  baseConfidence = baseConfidence * patternWeight;
  
  if (req && req.patternBoost) {
    baseConfidence = baseConfidence * req.patternBoost;
  }
}
// patternStrengthSum is NEVER REFERENCED
```

**Code Location 4 (Reporting only, HypothesisGenerator):**
```typescript
// Line 482: Only use of patternStrengthSum is for reporting
const hypothesis: Hypothesis = {
  // ...
  patternStrengthSum: patternStrengthSum,  // ← Stored but never used for ranking
  // ...
};
```

### Benchmark Consequence

**BLND-006 Case:**
- Pattern 3: patternStrength = 1 (F1 suppressed from 4)
- Pattern 6: patternStrength = 4-5 (F1 boosted)

**If patternStrength were consumed:**
- Quality Crisis confidence should be: 44% * (1/10) = 4.4%
- Demand Forecasting confidence should be: 48% * (4/10) = 19.2%
- Demand would win with 19.2% > 4.4% ✓

**Actual (patternStrength ignored):**
- Quality Crisis confidence: 44% → 34% (keyword boosts)
- Demand Forecasting confidence: 48% → 50% (keyword boosts)
- Quality Crisis wins with 34% predicted ❌

**Impact:** F1's pattern suppression (strength 1) was invisible. No diagnostic improvement.

### Fix Option
Make HypothesisGenerator use pattern strength in confidence formula (see STAGE_A_CONTRACT_FIX_OPTIONS.md Option 1).

### Risk
If changed without careful calibration, could over-suppress legitimate patterns or inflate confidence for weak patterns.

---

## DEFECT #2: KEYWORD_RESCORING_OVERRIDES_PATTERNS

### Definition
HypothesisGenerator recalculates confidence from evidence keywords independently, overriding any pattern-based scoring. Keyword matching happens AFTER pattern scoring, with fixed +5 boost regardless of pattern strength.

### Affected Files
- **File:** src/services/stage-a/hypothesis-generator.ts
- **Function:** `scoreHypothesis()` (lines 408-420)
- **Method:** `scoreKeywordMatch()` (implementation not shown, but called at line 409)

### Evidence

**Code Location (HypothesisGenerator lines 408-420):**
```typescript
const keywordMatch = this.scoreKeywordMatch(diagnosisType, allEvidence);

if (keywordMatch.hasRequiredKeywords && keywordMatch.supportingKeywordCount > 0) {
  confidence = Math.min(65, confidence + 5);  // ← Fixed +5 boost, ignores pattern strength
}

// Check for negative indicators
if (req && req.negativeIndicators) {
  const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
  for (const negative of req.negativeIndicators) {
    if (allText.includes(negative.toLowerCase())) {
      confidence = Math.max(0, confidence - 5);  // ← Fixed -5 penalty
    }
  }
}
```

### Benchmark Consequence

**BLND-006 Keyword Rescoring:**

For TRUST_QUALITY_CRISIS:
- baseConfidence = 44%
- keywordMatch for "nps" (found in evidence) → +5 → 49%
- Negative indicator "nps positive"? Not present → no -5
- Final: ~49% → capped at 65

For DEMAND_FORECASTING_MISMATCH:
- baseConfidence = 48%
- keywordMatch for "forecast", "demand", "deceleration" (found) → +5 → 53%
- Negative indicator "nps stable"? (found) → -5 → 48%
- Final: ~48%

**The Issue:** Keyword boosts are fixed at ±5, regardless of pattern strength. If Pattern 3 has strength 1 (F1 suppressed), it should not get the same +5 keyword boost as Pattern 6 with strength 4.

**Impact:** Keyword-based rescoring acts as a secondary confidence calculation that overrides pattern-based suppression.

### Fix Option
Make keyword boosts proportional to pattern strength: 
```typescript
const strengthAdjustedBoost = 5 * (avgPatternStrength / 10);
confidence = Math.min(65, confidence + strengthAdjustedBoost);
```

### Risk
Could reduce confidence in legitimate diagnoses if pattern strength is weak but keywords are strong.

---

## DEFECT #3: ROOT_CAUSE_MAPPING_DUPLICATED

### Definition
Both EvidenceSynthesisEngine (via patterns) and HypothesisGenerator (via scoring) claim authority over which root cause diagnosis is correct. The two calculations are independent and can conflict.

### Affected Files
- **Producer 1:** src/services/stage-a/evidence-synthesis-engine.ts
  - Produces: `potentialRootCauses: DiagnosisType[]` per pattern
  - Example: Pattern 3 → [TRUST_QUALITY_CRISIS, CUSTOMER_RETENTION_EROSION]

- **Producer 2:** src/services/stage-a/hypothesis-generator.ts
  - Scores: All diagnosisTypes independently
  - Line 195-206: Iterates through allDiagnosisTypes
  - Each scored with independent confidence calculation

### Evidence

**EvidenceSynthesisEngine (line 284-288):**
```typescript
const pattern = this.checkPatternWithContentValidation(
  evidence,
  ["quality_delivery", "customer_retention"],
  [
    DiagnosisType.TRUST_QUALITY_CRISIS,  // ← Pattern says this diagnosis is possible
    DiagnosisType.CUSTOMER_RETENTION_EROSION,  // ← Or this one
  ],
  validation.confidence
);
```

**HypothesisGenerator (lines 195-206):**
```typescript
for (const diagnosisType of this.allDiagnosisTypes) {  // ← Scores ALL diagnoses
  const hypothesis = this.scoreHypothesis(
    diagnosisType,  // ← Independent scoring per diagnosis
    synthesizedEvidence,
    allEvidence
  );

  if (hypothesis.confidence > 0) {
    candidates.push(hypothesis);
  }
}
```

### Benchmark Consequence

**BLND-006 Conflict:**

Pattern 3 says: "TRUST_QUALITY_CRISIS might be the root cause"
Pattern 6 says: "DEMAND_FORECASTING_MISMATCH might be the root cause"

HypothesisGenerator independently scores:
- TRUST_QUALITY_CRISIS: 44% (from evidence count, keyword match)
- DEMAND_FORECASTING_MISMATCH: 48% (from evidence count, keyword match)

The pattern suppression (strength 1 vs 4) was meant to tell HypothesisGenerator "Pattern 3 is wrong, Pattern 6 is right." But HypothesisGenerator never reads this signal. It independently scores both and chooses based on confidence, which ends up being similar because keyword matching is independent of pattern strength.

**Impact:** Pattern filtering is ineffective because HypothesisGenerator scores all diagnoses regardless of pattern support.

### Fix Option
Make HypothesisGenerator only score diagnoses that match patterns, and only score those diagnoses with confidence proportional to pattern strength.

### Risk
Could exclude valid diagnoses that aren't supported by patterns (though this was the original intent—dimension-based filtering).

---

## DEFECT #4: HYPOTHESIS_GENERATOR_HAS_HIDDEN_PRIMARY_AUTHORITY

### Definition
While EvidenceSynthesisEngine produces patterns as the "authoritative" input layer, HypothesisGenerator actually operates with hidden primary authority: it recalculates everything from raw evidence text keywords, making pattern strength decorative.

### Affected Files
- **File:** src/services/stage-a/hypothesis-generator.ts
- **Functions:**
  - `scoreHypothesis()` (primary authority)
  - `scoreKeywordMatch()` (hidden calculation)
  - `calculateEvidenceSpecificityMatch()` (hidden calculation)

### Evidence

**Authority Flow:**

EvidenceSynthesisEngine produces patterns:
```
Evidence → patterns with potentialRootCauses → Output: SynthesizedEvidence
```

HypothesisGenerator receives patterns but ignores them:
```
Input: SynthesizedEvidence (with patterns)
But also input: allEvidence (raw items)
Actual calculation: scoreKeywordMatch(diagnosisType, allEvidence)
Result: Confidence from keywords, not patterns
```

### Benchmark Consequence

**Intended Authority (EvidenceSynthesisEngine):**
- Pattern 3 (Quality) suppressed → suggests Quality Crisis is wrong
- Pattern 6 (Demand) boosted → suggests Demand Forecasting is right

**Hidden Authority (HypothesisGenerator):**
- Quality Crisis found keyword "nps" in evidence → +5 confidence
- Demand Forecasting found keywords "decelerate" + "competitive" → +5 confidence
- Both end up similar confidence despite pattern guidance

**Impact:** Pattern authority is decorative. HypothesisGenerator is the real decision-maker, and it uses keyword matching, not pattern strength.

### Fix Option
Make EvidenceSynthesisEngine the sole authority:
- Restrict HypothesisGenerator to only score diagnoses supported by patterns
- Make confidence proportional to pattern strength, not keyword match

Or make HypothesisGenerator's hidden authority explicit by removing pattern-based filtering entirely.

### Risk
Fundamental architectural change. Could break existing correct cases if pattern filtering is too aggressive.

---

## DEFECT #5: DATA_CONTRACT_UNCLEAR

### Definition
The interface contract between EvidenceSynthesisEngine and HypothesisGenerator never specifies:
- Which fields are authoritative for which decisions
- How patternStrength should influence confidence
- Whether pattern scoring overrides or informs keyword scoring

### Affected Files
- **Type Definition:** src/domain/consulting-engine/types.ts
  - Interface: `EvidencePattern`
  - Missing: Documentation of field semantics
  - Missing: Specification of consumption rules

- **Consumer:** src/services/stage-a/hypothesis-generator.ts
  - Missing: Comments explaining which fields are read and how they're used

### Evidence

**Type Definition (no documented contract):**
```typescript
export interface EvidencePattern {
  name: string;
  dimensions: string[];
  supportingItems: string[];
  patternStrength: number;  // ← No documented semantics
  potentialRootCauses: DiagnosisType[];
}
```

No documentation saying:
- "patternStrength is used to weight confidence calculation by HypothesisGenerator"
- OR "patternStrength is for tracing only, HypothesisGenerator calculates independently"

**Hypothesis Consumer (no documented expectation):**
```typescript
export class HypothesisGenerator {
  generateHypotheses(
    synthesizedEvidence: SynthesizedEvidence,  // ← No spec: which fields matter?
    allEvidence: EvidenceItem[]
  ): Hypothesis[] {
    // Missing: Comments explaining the contract
  }
}
```

### Benchmark Consequence

F1 author assumed the contract was:
- "If I produce patternStrength = 1, HypothesisGenerator will treat Pattern 3 as weak"

Actual contract was:
- "patternStrength is calculated and stored for reporting, but the ranking algorithm uses evidence count and keyword matching"

Mismatch between assumed contract and actual implementation.

### Fix Option
Explicitly document the contract in type definitions and function comments:
```typescript
/**
 * CONSUMPTION RULES:
 * - dimensions: Used to filter which diagnoses are evaluated
 * - patternStrength: Used to scale confidence (0-10 range maps to confidence multiplier)
 * - potentialRootCauses: Which diagnoses this pattern supports
 * 
 * Pattern matching and strength take precedence over keyword-based rescoring.
 */
```

### Risk
No code change needed, just documentation. Zero risk.

---

## SUMMARY: DEFECT PRIORITIZATION

### By Impact on F1 Failure

1. **PATTERN_STRENGTH_IGNORED** (Critical - Primary cause)
   - patternStrength calculated but never consumed in confidence formula
   - F1's strength modulation (1 vs 4) had zero effect
   - Impact: 100% of F1 invisibility

2. **KEYWORD_RESCORING_OVERRIDES_PATTERNS** (Critical - Secondary cause)
   - Keyword matching rescores confidence independently
   - Overrides pattern-based suppression with fixed boosts
   - Impact: 50% of confidence uncertainty in final diagnosis

3. **HYPOTHESIS_GENERATOR_HAS_HIDDEN_PRIMARY_AUTHORITY** (Severe - Architectural)
   - HypothesisGenerator operates independently of pattern authority
   - Recalculates everything from raw keywords
   - Impact: Makes EvidenceSynthesisEngine output decorative

4. **ROOT_CAUSE_MAPPING_DUPLICATED** (Moderate - Design issue)
   - Both layers claim authority over diagnosis selection
   - Conflict not visible when pattern strength is ignored
   - Impact: Would be visible if defect #1 fixed

5. **DATA_CONTRACT_UNCLEAR** (Low - Documentation issue)
   - No formal specification of contract between layers
   - F1 author made wrong assumption
   - Impact: Contributed to misdirected effort in F1

---

## ARCHITECTURAL IMPLICATIONS

### Current State
```
EvidenceSynthesisEngine → Produces patterns with strength (1-10)
                        ↓
                        SynthesizedEvidence
                        ↓
HypothesisGenerator → Receives patterns but ignores strength
                   → Independently rescores from keywords
                   → Returns confidence independent of pattern strength
```

### Problem
The two layers are in conflict:
- Layer 1 says: "Pattern 3 is weak (strength 1), Pattern 6 is strong (strength 4)"
- Layer 2 says: "Both patterns have similar keyword match, similar confidence"
- Result: Layer 1's message is lost

### What Would Fix It
One of these approaches:
1. Make Layer 2 respect Layer 1's strength signals
2. Make Layer 1 the sole authority, remove Layer 2's independent scoring
3. Merge the two layers into a single scoring system

---

## CONCLUSION

**Primary Defect:** PATTERN_STRENGTH_IGNORED

F1 failed because HypothesisGenerator.scoreHypothesis() was architected to calculate confidence independent of pattern strength. The field is produced, transmitted, and stored, but never read in the confidence calculation loop.

This is not a bug in F1, but a fundamental contract defect in the Stage A architecture: EvidenceSynthesisEngine and HypothesisGenerator have incompatible assumptions about how pattern strength influences diagnosis ranking.
