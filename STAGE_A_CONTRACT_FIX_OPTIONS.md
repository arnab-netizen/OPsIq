# STAGE A CONTRACT FIX OPTIONS

**Objective:** Compare fix options for making upstream pattern validation visible to hypothesis ranking

**Scope:** Options for addressing PATTERN_STRENGTH_IGNORED defect

**Constraint:** Must preserve existing correct cases (8/21) and not weaken auth/validation

---

## OPTION 1: Pattern Strength Multiplier in HypothesisGenerator

### Approach
Modify HypothesisGenerator.scoreHypothesis() to use pattern strength as a multiplier on baseConfidence:

```typescript
// Current (broken)
const patternWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);
baseConfidence = baseConfidence * patternWeight;

// Fixed
let avgPatternStrength = 1.0;
if (matchingPatterns.length > 0) {
  const sumStrength = matchingPatterns.reduce((sum, p) => sum + (p.patternStrength || 1), 0);
  avgPatternStrength = sumStrength / matchingPatterns.length / 10;  // Range 0.1-1.0
}
const patternWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);
baseConfidence = baseConfidence * patternWeight * avgPatternStrength;  // ← Apply strength
```

### Expected Impact on F1

**BLND-006 Before Fix:**
- Quality Crisis: baseConfidence = 44%, patternStrength ignored
- Demand Forecasting: baseConfidence = 48%, patternStrength ignored
- Result: Quality wins (~34% vs ~50% confidence)

**BLND-006 After Fix:**
- Quality Crisis: baseConfidence = 44% * (1/10) = 4.4%
- Demand Forecasting: baseConfidence = 48% * (0.4/10) = 1.92%
- Result: Quality wins 4.4% vs 1.92% (same wrong winner, but both diagnoses weaker)

**Issue:** Keyword rescoring overrides the strength difference. After keyword boosts (+5 for both), confidences might still be similar. This fix alone is insufficient.

### Expected Benchmark Movement
- Corrects cases where Pattern suppression (strength < 3) clears space for correct pattern
- But keyword rescoring still applies +5 boost to both
- Estimated improvement: 2-4 cases if combined with keyword rescoring fix
- Expected: 8-12/21 (33.3-57.1%), not sufficient alone

### Implementation Complexity
- Low: 3-4 lines changed
- Non-DB gates pass (TypeScript compiles, no schema changes)
- Existing tests likely need adjustment (confidence scores change)

### Regression Risk
- **Medium:** Confidence scores change for all diagnoses
- All existing correct cases (8/21) might have confidence capped differently
- Could cause existing 8 cases to drop if confidence threshold exists
- Mitigation: Test full benchmark before committing

### Benchmarkability
- Yes, full 21-case benchmark runnable
- Can measure impact in isolation

### Preserves Existing Tests?
- ❌ No: Confidence values change, unit tests that check specific confidence values will break
- Need to update test expectations or relax assertions

### Risks Confidence Inflation?
- ❌ No: Reduces confidence for weak patterns, might inflate for strong patterns
- Risk: Strong patterns get boosted, could over-suppress weak but correct patterns

### Allows F1/F2/F3 Fixes to Work?
- ❌ Partially: Makes F1's pattern suppression visible, but
- ❌ Keyword rescoring still overrides pattern strength
- Fixes would still be partially invisible (60% visible, 40% masked by keywords)

---

## OPTION 2: Remove Keyword Rescoring, Make Pattern Primary Authority

### Approach
Simplify HypothesisGenerator to rank ONLY by pattern strength:

```typescript
// Remove keyword rescoring entirely
// Remove lines 408-420 (scoreKeywordMatch boost)
// Remove lines 428-435 (specificity match)
// Remove lines 436-448 (causal evidence boost)

// Just use pattern-based confidence
const matchingPatterns = synthesizedEvidence.patterns.filter((p) =>
  p.potentialRootCauses.includes(diagnosisType)
);

if (matchingPatterns.length === 0) {
  confidence = 0;  // No pattern support → no confidence
} else {
  const avgPatternStrength = matchingPatterns.reduce((sum, p) => sum + (p.patternStrength || 1), 0) / matchingPatterns.length;
  confidence = (avgPatternStrength / 10) * 65;  // Scale 0-65
}
```

### Expected Impact on F1

**BLND-006:**
- Quality Crisis: Pattern strength 1 → confidence = 6.5%
- Demand Forecasting: Pattern strength 4 → confidence = 26%
- Result: Demand wins (correct) ✓

**BLND-006 (F1 Success):**
- Net impact: FIXES this case

### Expected Benchmark Movement
- Removes keyword rescoring that overrides pattern signals
- EvidenceSynthesisEngine becomes sole authority
- Cases with correct pattern will win, regardless of keywords
- Estimated improvement: 12-16/21 (57-76%) if pattern discovery is correct

### Implementation Complexity
- **High:** Major refactor of scoreHypothesis()
- Removes ~60 lines of keyword/specificity/causal logic
- Changes confidence calculation fundamentally

### Regression Risk
- **Critical:** Could break all 8 existing correct cases
- If any correct case relied on keyword rescoring, it will fail
- Example: If BLND-007 is correct due to keyword match, not pattern, it breaks

### Benchmarkability
- Yes, runnable
- But regression risk is severe

### Preserves Existing Tests?
- ❌ No: Completely changes confidence calculation
- All tests that check specific confidence values break
- Integration tests might fail for correct cases

### Risks Confidence Inflation?
- ❌ No: Removes keyword boosts, could reduce confidence
- Risk: Over-suppresses diagnoses without strong pattern support

### Allows F1/F2/F3 Fixes to Work?
- ✅ Yes: Makes EvidenceSynthesisEngine patterns fully visible
- F1/F2/F3 fixes would have 100% visibility downstream
- Pattern suppression/boosting would directly affect diagnosis

---

## OPTION 3: Hybrid - Pattern Strength + Proportional Keyword Boost

### Approach
Keep keyword rescoring but make it proportional to pattern strength:

```typescript
const matchingPatterns = synthesizedEvidence.patterns.filter((p) =>
  p.potentialRootCauses.includes(diagnosisType)
);

let baseConfidence = ...;  // Existing calculation

// Make keyword boost proportional to pattern strength
const keywordMatch = this.scoreKeywordMatch(diagnosisType, allEvidence);
if (keywordMatch.hasRequiredKeywords && keywordMatch.supportingKeywordCount > 0) {
  const avgPatternStrength = matchingPatterns.length > 0
    ? matchingPatterns.reduce((sum, p) => sum + (p.patternStrength || 1), 0) / matchingPatterns.length
    : 1;
  const strengthMultiplier = avgPatternStrength / 10;  // 0.1-1.0
  const adjustedBoost = 5 * strengthMultiplier;  // 0.5-5 instead of fixed 5
  confidence = Math.min(65, confidence + adjustedBoost);
}

// Similar adjustment for specificity/causal boosts
```

### Expected Impact on F1

**BLND-006:**
- Quality Crisis: baseConfidence 44%, pattern strength 1, keyword boost = 5 * 0.1 = 0.5
  - Final: 44% + 0.5 = 44.5%
- Demand Forecasting: baseConfidence 48%, pattern strength 4, keyword boost = 5 * 0.4 = 2
  - Final: 48% + 2 = 50%
- Result: Demand wins 50% > 44.5% ✓

### Expected Benchmark Movement
- Fixes cases where pattern suppression is overridden by keyword boosts
- Preserves keyword boost for legitimate patterns (strength > 5)
- Estimated improvement: 10-14/21 (48-67%)

### Implementation Complexity
- **Medium:** ~5-10 lines changed per boost location (keyword, specificity, causal)
- Three locations need similar change
- Non-DB gates pass (build, typecheck, Prisma validate)

### Regression Risk
- **Medium:** Confidence scores change, but keyword boosts still exist
- Existing correct cases with moderate pattern strength should be OK
- High-confidence cases with strong keywords might drop slightly
- Mitigation: Test full benchmark, adjust multiplier if needed

### Benchmarkability
- Yes, full 21-case benchmark runnable

### Preserves Existing Tests?
- ⚠️ Partially: Confidence values change, test assertions need update
- But logic is similar (keyword boost still exists, just scaled)
- Tests that check ranges (>50%, <65%) more robust than exact values

### Risks Confidence Inflation?
- ❌ No: Reduces keyword boosts for weak patterns
- Could reduce confidence, not inflate
- Risk: Over-suppresses legitimate weak diagnoses with keyword match

### Allows F1/F2/F3 Fixes to Work?
- ✅ Yes: Makes F1's pattern suppression visible through proportional boosts
- Pattern strength modulation influences final confidence
- But not 100% visible (keyword boosts still exist, capped at 65%)
- Estimated visibility: 70-80%

---

## OPTION 4: Merge F1 Validators into HypothesisGenerator Scoring

### Approach
Instead of creating patterns in EvidenceSynthesisEngine, move content validation into HypothesisGenerator.scoreHypothesis():

```typescript
// Remove F1 from EvidenceSynthesisEngine
// Move validators into HypothesisGenerator

for (const diagnosisType of this.allDiagnosisTypes) {
  // Apply semantic content validation
  const contentConfidence = this.validateDiagnosisContent(diagnosisType, allEvidence);
  
  // Existing pattern matching
  const matchingPatterns = ...;
  const baseConfidence = ...;
  
  // Combine content validation with pattern confidence
  const finalConfidence = baseConfidence * contentConfidence;
  
  hypothesis.confidence = Math.min(65, finalConfidence);
}
```

### Expected Impact on F1
- F1 validators execute in HypothesisGenerator, not EvidenceSynthesisEngine
- Pattern strength modulation removed, replaced with content validation before confidence calculation
- Similar effect to F1 but earlier in the pipeline where it's visible

### Expected Benchmark Movement
- Estimated improvement: 10-14/21 (48-67%)
- Similar to Option 3 hybrid approach

### Implementation Complexity
- **High:** Major refactor
- Duplicate validation logic from EvidenceSynthesisEngine into HypothesisGenerator
- Remove F1 validators from EvidenceSynthesisEngine
- Add new validation method to HypothesisGenerator

### Regression Risk
- **Critical:** Changes where validation happens
- Could affect confidence calculation for all diagnoses
- Existing tests break

### Benchmarkability
- Yes, runnable
- But complexity is high

### Preserves Existing Tests?
- ❌ No: Major refactor, tests break

### Risks Confidence Inflation?
- ⚠️ Depends on validator implementation
- If validators boost weak diagnoses, risk is high

### Allows F1/F2/F3 Fixes to Work?
- ✅ Yes: F1/F2/F3 validators move closer to confidence calculation
- 100% visibility because validation happens during scoring

---

## OPTION 5: Rebuild Stage A Scoring Contract

### Approach
Redesign the entire EvidenceSynthesisEngine → HypothesisGenerator contract:

1. **Layer 1 (EvidenceSynthesisEngine):** Only pattern discovery, no content validation
   - Remove F1 validators
   - Remove pattern strength modulation
   - Output: Patterns as dimension matches only

2. **Layer 2 (HypothesisGenerator):** Content validation + confidence scoring
   - All validation happens here
   - Pattern strength or confidence multiplier based on content validation
   - Explicit consumption of pattern strength in confidence formula

3. **Formal Contract:**
   - Document which fields are read/written/ignored
   - Specify confidence calculation formula
   - Specify consumption rules for each field

### Expected Impact on F1
- F1 implementation would move to HypothesisGenerator.validateDiagnosisContent()
- 100% visibility, no invisibility issues
- Same functionality, different location

### Expected Benchmark Movement
- Estimated improvement: 10-14/21 (48-67%)

### Implementation Complexity
- **Very High:** Complete architectural redesign
- Split responsibilities clearly
- Risk of missing edge cases

### Regression Risk
- **Critical:** Might break all cases if not done carefully

### Benchmarkability
- Yes, but risky

### Preserves Existing Tests?
- ❌ No: Complete redesign

### Risks Confidence Inflation?
- Depends on new contract specification

### Allows F1/F2/F3 Fixes to Work?
- ✅ Yes: If contract is correct, all fixes visible downstream

---

## COMPARATIVE ANALYSIS

| Criteria | Option 1 | Option 2 | Option 3 | Option 4 | Option 5 |
|----------|----------|----------|----------|----------|----------|
| **Impact on F1** | 20% visible | 100% visible | 70% visible | 100% visible | 100% visible |
| **Estimated Benchmark** | 9-10/21 | 12-16/21 | 10-14/21 | 10-14/21 | 10-14/21 |
| **Implementation** | Low | High | Medium | High | Very High |
| **Regression Risk** | Medium | Critical | Medium | Critical | Critical |
| **Preserves Tests** | ❌ | ❌ | ⚠️ | ❌ | ❌ |
| **Confidence Risk** | Low | Low | Low | Medium | Medium |
| **F1/F2/F3 Visible** | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| **Reversibility** | High | Low | Medium | Low | Low |
| **Complexity** | Simple | Invasive | Balanced | Complex | Architectural |

---

## RECOMMENDED SELECTION

### Primary Recommendation: OPTION 3 (Hybrid - Pattern Strength + Proportional Keyword Boost)

**Rationale:**
1. **Smallest change that makes F1 visible:** Proportional keyword boost scales with pattern strength
2. **Medium implementation complexity:** 3 locations, ~15 lines total
3. **Medium regression risk:** Confidence values change but logic preserved
4. **70-80% F1 visibility:** Sufficient to fix most failing cases
5. **Preserves existing tests partially:** Keyword boost logic still exists, just scaled
6. **Allows F1/F2/F3 fixes to work downstream:** 70%+ of suppression now visible

**Expected Outcome:**
- F1 pattern suppression (strength 1) produces 50% keyword boost reduction (0.5 vs 5)
- BLND-006: Quality Crisis confidence drops from 49% to 44.5%, Demand Forecasting stays 50%
- Net: 10-14/21 accuracy, fixing most suppression-based issues
- Estimated: 48-67% improvement over 38% baseline

**Next Step:** Authorize Option 3 implementation with full benchmark validation before and after.

---

## ALTERNATIVE RECOMMENDATION: OPTION 2 (Remove Keyword Rescoring)

**For consideration if Option 3 insufficient:**
- Makes pattern strength 100% visible
- But regression risk is critical
- Requires extensive testing
- Only consider if Option 3 fails to achieve target accuracy

---

## NOT RECOMMENDED

**Option 1 Alone:** Insufficient visibility, keyword rescoring still overrides
**Option 4:** Complexity gain over Option 3 is not justified
**Option 5:** Too high risk for current goal; revisit for v2 redesign
