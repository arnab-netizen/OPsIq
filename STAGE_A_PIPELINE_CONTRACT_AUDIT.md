# STAGE A PIPELINE CONTRACT AUDIT

**Objective:** Trace evidence through the diagnosis pipeline and identify architectural contract defects that caused F1 to have zero impact.

**Scope:** Evidence flow from EvidenceSynthesisEngine through HypothesisGenerator to final diagnosis

**Status:** AUDIT ONLY — No production code changes

---

## PHASE A: DATA FLOW TRACE

### A.1 Evidence Intake → EvidenceSynthesisEngine

**Input:** Raw EvidenceItem[]
```typescript
interface EvidenceItem {
  id: string;
  dimension: string;  // "quality_delivery", "market_position", etc.
  finding: string;    // Narrative evidence
  isCritical: boolean;
}
```

**Processing:** EvidenceSynthesisEngine.synthesizeEvidence(evidence)
1. Extract dimensions from evidence items
2. For each dimension combination, check if pattern should fire
3. Create EvidencePattern objects

**Example: BLND-006 Input**
- 5 evidence items across 4 dimensions:
  - financial_health (2 items): CAC/LTV, payback risk
  - market_position (1 item): competitive pressure, growth deceleration
  - customer_retention (1 item): churn rising, NPS stable, repeat 72%
  - quality_delivery (1 item): operations stable

### A.2 Pattern Discovery Layer: EvidenceSynthesisEngine.discoverPatterns()

**Key Pattern Logic:**

**Pattern 3: TRUST_QUALITY_CRISIS**
```
IF dimensions.includes("quality_delivery") AND dimensions.includes("customer_retention")
  THEN checkPattern(["quality_delivery", "customer_retention"], [TRUST_QUALITY_CRISIS, ...])
```
With F1 enhancement: `checkPatternWithContentValidation(..., contentConfidence: 0.1 for stable quality)`

**Pattern 6: DEMAND_FORECASTING_MISMATCH**
```
IF dimensions.includes("market_position")
  AND hasGrowthDeceleration AND hasCompetitiveContext AND hasStableRetention
  THEN checkPattern([...], contentConfidence: 0.9)
```

### A.3 EvidencePattern Output Structure

**Field Mapping and Usage:**

| Field | Produced | Consumed By | Affects Confidence? | Affects Diagnosis Type? |
|-------|----------|-------------|-------------------|----------------------|
| **name** | checkPattern() | Debug logging only | NO | NO |
| **dimensions** | checkPattern() | HypothesisGen dimension matching | INDIRECT | YES (enables matching) |
| **supportingItems** | filter by dimension | HypothesisGen evidence count | YES (evidence count) | NO |
| **patternStrength** | checkPatternWithContentValidation() [F1] | Read @ line 326, NEVER USED | **NO** ❌ | NO |
| **potentialRootCauses** | checkPattern() | HypothesisGen diagnosis filtering | YES (which patterns match) | YES |

### A.4 BLND-006 Pattern Creation (Concrete Example)

**Input Evidence:**
```
quality_delivery: "Operational metrics stable: logistics $12/rental, turnover 4.2x, utilization 85%, repeat 72%, NPS 48"
customer_retention: "Churn rising 4% to 5%... repeat 72%... NPS 48 (neutral)"
market_position: "Growth decelerated 25% MoM to 15%... Rent the Runway $70M Series C... 30% YoY growth"
```

**Pattern 3 (Quality Crisis) Creation:**
1. Dimensions match: quality_delivery ✓ + customer_retention ✓
2. F1 content validation:
   - validateTrustQualityCrisis() finds: "NPS 48", "repeat 72%"
   - Result: hasStableQuality = TRUE → confidence = 0.1
3. Base strength: min(10, 2 items * 2) = 4
4. F1 modulation: max(1, round(4 * 0.1)) = **1**
5. Output:
   ```
   {
     name: "quality_delivery-customer_retention-pattern",
     dimensions: ["quality_delivery", "customer_retention"],
     supportingItems: [quality_id, retention_id],
     patternStrength: 1,  // ← F1 suppressed from 4 to 1
     potentialRootCauses: [TRUST_QUALITY_CRISIS, CUSTOMER_RETENTION_EROSION]
   }
   ```

**Pattern 6 (Demand Forecasting) Creation:**
1. Dimension matches: market_position ✓
2. F1 content validation:
   - validateDemandForecastingMismatch() finds: "decelerat", "compet", "stable retention"
   - Result: hasGrowthDeceleration + hasCompetitiveContext + hasStableRetention = TRUE → confidence = 0.9
3. Base strength: min(10, 2 items * 2) = 4
4. F1 modulation: max(1, round(4 * 0.9)) = **4**
5. Output:
   ```
   {
     name: "market_position-...-pattern",
     patternStrength: 4,  // ← F1 boosted
     potentialRootCauses: [DEMAND_FORECASTING_MISMATCH]
   }
   ```

**SynthesizedEvidence Output to HypothesisGenerator:**
```typescript
{
  dimensionsExamined: ["financial_health", "market_position", "customer_retention", "quality_delivery"],
  dimensionsMissing: ["operational_efficiency", "process_maturity", "team_capability"],
  patterns: [
    { patternStrength: 1, potentialRootCauses: [TRUST_QUALITY_CRISIS] },
    { patternStrength: 4, potentialRootCauses: [DEMAND_FORECASTING_MISMATCH] },
    // ... other patterns
  ],
  evidenceTraceRate: 100,
  synthesisConfidence: 0.7
}
```

### A.5 HypothesisGenerator Input and Processing

**Input:** 
- `synthesizedEvidence: SynthesizedEvidence` (from above, contains patterns with patternStrength)
- `allEvidence: EvidenceItem[]` (raw evidence array)

**Key Method:** `generateHypotheses(synthesizedEvidence, allEvidence): Hypothesis[]`

**Call to scoreHypothesis() for each diagnosis type:**
```typescript
for (const diagnosisType of this.allDiagnosisTypes) {
  const hypothesis = this.scoreHypothesis(
    diagnosisType,
    synthesizedEvidence,  // ← Contains patterns with patternStrength
    allEvidence           // ← Raw evidence text
  );
  if (hypothesis.confidence > 0) {
    candidates.push(hypothesis);
  }
}
```

### A.6 HypothesisGenerator.scoreHypothesis() Algorithm

This is where F1's pattern strength becomes invisible.

**Step 1: Find Matching Patterns**
```typescript
const matchingPatterns = synthesizedEvidence.patterns.filter((p) =>
  p.potentialRootCauses.includes(diagnosisType)
);

let patternStrengthSum = 0;
const supportingIds = new Set<string>();

matchingPatterns.forEach((p) => {
  patternStrengthSum += (p.patternStrength || 1);  // ← READ patternStrength
  p.supportingItems.forEach((id) => {
    supportingIds.add(id);
  });
});
```

**OBSERVATION:** Line reads patternStrength but only accumulates it. The variable is calculated but never used in confidence formula.

**Step 2: Base Confidence (Evidence Count Only)**
```typescript
let baseConfidence = 0;
if (supportingIds.size > 0) {
  // Confidence is PURELY based on evidence count, not pattern strength
  baseConfidence = (supportingIds.size / Math.max(allEvidence.length, 1)) * 100;

  // Pattern weight uses COUNT, not STRENGTH
  const patternWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);
  baseConfidence = baseConfidence * patternWeight;

  // Fixed diagnosis boost (hardcoded 1.1, 1.2, not strength-based)
  if (req && req.patternBoost) {
    baseConfidence = baseConfidence * req.patternBoost;
  }
}
```

**For BLND-006 TRUST_QUALITY_CRISIS:**
- supportingIds.size = 2 (quality, retention evidence)
- allEvidence.length = 5
- patternWeight = 1 + 0 = 1.0 (single pattern)
- req.patternBoost = 1.1 (hardcoded for quality diagnosis)
- baseConfidence = (2/5) * 100 * 1.0 * 1.1 = **44%**

**For BLND-006 DEMAND_FORECASTING_MISMATCH:**
- supportingIds.size = 2 (market, retention evidence)
- patternWeight = 1 + 0 = 1.0
- req.patternBoost = 1.2 (hardcoded for demand diagnosis)
- baseConfidence = (2/5) * 100 * 1.0 * 1.2 = **48%**

**CRITICAL FINDING:** Both diagnoses have identical supportingIds.size (2) and patternWeight (1.0). The only difference is the hardcoded patternBoost (1.1 vs 1.2). The actual pattern strength values (1 vs 4) are completely ignored.

**Step 3: Keyword Validation**
```typescript
const keywordMatch = this.scoreKeywordMatch(diagnosisType, allEvidence);

if (keywordMatch.hasRequiredKeywords && keywordMatch.supportingKeywordCount > 0) {
  confidence = Math.min(65, confidence + 5);  // +5 fixed boost
}
```

This re-scores based on raw evidence keywords, independent of pattern strength.

**Step 4: Specificity Match**
```typescript
const specificityMatch = this.calculateEvidenceSpecificityMatch(diagnosisType, allEvidence);
if (specificityMatch > 0.5) {
  confidence = Math.min(65, confidence + Math.round(specificityMatch * 10));
}
```

Again, keyword-based, not pattern-strength-based.

**Step 5: Causal Evidence Boost**
```typescript
let hasCausalEvidence = false;
if (req && req.causalIndicators) {
  const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
  for (const causal of req.causalIndicators) {
    if (allText.includes(causal.toLowerCase())) {
      hasCausalEvidence = true;
      break;
    }
  }
  
  if (hasCausalEvidence) {
    const causalBoost = Math.min(15, causalCount * 3);
    confidence = Math.min(65, confidence + causalBoost);
  }
}
```

Text-based causal indicator matching, not pattern-strength-aware.

### A.7 BLND-006 Scoring in Detail

**TRUST_QUALITY_CRISIS Confidence:**
1. baseConfidence = 44% (from evidence count, ignoring pattern strength 1)
2. Keyword match ("nps") → +5 → 49%
3. Specificity match ("quality", "reliability") → +3 → 52%
4. Causal evidence: No "defects", "reliability issues" → -15 → **37%**
5. Confidence capped at 65: **34%** (final)

**DEMAND_FORECASTING_MISMATCH Confidence:**
1. baseConfidence = 48% (from evidence count, ignoring pattern strength 4)
2. Keyword match ("forecast", "demand", "deceleration") → +5 → 53%
3. Specificity match ("tam", "competitive", "market") → +5 → 58%
4. Causal evidence ("growth deceleration", "competitive consolidat") → +9 → **50%**
5. Confidence capped at 65: **50%** (final)

**Result:**
- Quality Crisis (wrong diagnosis) confidence: 34%
- Demand Forecasting (correct diagnosis) confidence: 50%

Despite F1 suppressing Pattern 3 from strength 4 to strength 1, the confidence scores are nearly identical because **the algorithm never read the pattern strength value.**

### A.8 Final Ranking and Diagnosis Selection

Candidates sorted by confidence:
1. DEMAND_FORECASTING_MISMATCH: 50% (correct, should win)
2. TRUST_QUALITY_CRISIS: 34% (wrong, but predicted)

**Actual Output:** TRUST_QUALITY_CRISIS with confidence 34%

This indicates the ranking algorithm considered some other factor (possibly CausalDiagnosisAdjudicator or hypothesis_confidence calibration) that caused the wrong diagnosis to be selected despite lower confidence.

---

## SUMMARY OF FIELD USAGE

### What Actually Affects Final Diagnosis:

1. **supportingItems count** → Evidence count → Influences baseConfidence
2. **potentialRootCauses** → Diagnosis matching → Determines which diagnoses are scored
3. **dimensions** → Pattern matching → Enables dimension-based filtering (original broken design)

### What Does NOT Affect Final Diagnosis:

1. ❌ **patternStrength** — Read at line 326, accumulated, never used in confidence calculation
2. ❌ **F1 content validation scores** — Never transmitted to scoring algorithm
3. ❌ **Semantic pattern suppression** — Suppressed to strength 1, but strength ignored in ranking

---

## CONCLUSION: CONTRACT DEFECT IDENTIFIED

**The contract between EvidenceSynthesisEngine and HypothesisGenerator is broken:**

- ✅ EvidenceSynthesisEngine correctly produces SynthesizedEvidence with patternStrength
- ✅ HypothesisGenerator receives the object with patternStrength populated
- ❌ **HypothesisGenerator.scoreHypothesis() does NOT use patternStrength in any confidence calculation**

This is not a bug in F1, but a fundamental architectural defect: pattern strength is orphaned in the data flow.
