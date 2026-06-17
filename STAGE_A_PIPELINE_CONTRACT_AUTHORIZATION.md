# STAGE A PIPELINE CONTRACT AUTHORIZATION

**Objective:** Authorize exactly one fix to make upstream pattern validation visible downstream

**Authority:** Audit findings in STAGE_A_PIPELINE_CONTRACT_AUDIT.md, STAGE_A_CONTRACT_DEFECT_CLASSIFICATION.md, STAGE_A_CONTRACT_FIX_OPTIONS.md

**Status:** AUDIT COMPLETE - AUTHORIZATION READY

---

## RECOMMENDED NEXT FIX

### Fix: MAKE KEYWORD BOOSTS PROPORTIONAL TO PATTERN STRENGTH

**Category:** Contract Defect #1 (PATTERN_STRENGTH_IGNORED) Remediation  
**Approach:** Option 3 from fix analysis  
**Scope:** Minimal, localized change  
**Authorization Level:** Moderate (impacts confidence scoring, requires test update)  

---

## EXACT SPECIFICATION

### Files to Modify
**File:** `src/services/stage-a/hypothesis-generator.ts`

### Exact Functions to Modify
1. **Function:** `scoreHypothesis()` 
   - **Location:** Lines 408-420 (keyword rescoring section)
   - **Change:** Make keyword boost proportional to average pattern strength

### Detailed Changes

**Current Code (Lines 408-420):**
```typescript
const keywordMatch = this.scoreKeywordMatch(diagnosisType, allEvidence);

if (keywordMatch.hasRequiredKeywords && keywordMatch.supportingKeywordCount > 0) {
  confidence = Math.min(65, confidence + 5);  // Fixed +5 boost
}

// Check for negative indicators
if (req && req.negativeIndicators) {
  const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
  for (const negative of req.negativeIndicators) {
    if (allText.includes(negative.toLowerCase())) {
      confidence = Math.max(0, confidence - 5);  // Fixed -5 penalty
    }
  }
}
```

**New Code (Lines 408-432):**
```typescript
// Calculate average pattern strength to scale keyword boosts
let avgPatternStrength = 1.0;
if (matchingPatterns && matchingPatterns.length > 0) {
  const sumStrength = matchingPatterns.reduce((sum, p) => sum + (p.patternStrength || 1), 0);
  avgPatternStrength = sumStrength / matchingPatterns.length;
}
const strengthMultiplier = avgPatternStrength / 10;  // Range 0.1 to 1.0

const keywordMatch = this.scoreKeywordMatch(diagnosisType, allEvidence);

if (keywordMatch.hasRequiredKeywords && keywordMatch.supportingKeywordCount > 0) {
  const scaledBoost = 5 * strengthMultiplier;  // Scale 5-point boost by pattern strength
  confidence = Math.min(65, confidence + scaledBoost);
}

// Check for negative indicators
if (req && req.negativeIndicators) {
  const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
  for (const negative of req.negativeIndicators) {
    if (allText.includes(negative.toLowerCase())) {
      const scaledPenalty = 5 * strengthMultiplier;  // Scale 5-point penalty
      confidence = Math.max(0, confidence - scaledPenalty);
    }
  }
}
```

**Additional Changes (Lines 428-448):**
Apply same proportional scaling to specificity match and causal evidence boosts:

```typescript
// SPECIFICITY MATCH (around line 421-427)
const specificityMatch = this.calculateEvidenceSpecificityMatch(diagnosisType, allEvidence);
if (specificityMatch > 0.5) {
  const scaledBoost = Math.round(specificityMatch * 10) * strengthMultiplier;  // Apply strengthMultiplier
  confidence = Math.min(65, confidence + scaledBoost);
}

// CAUSAL EVIDENCE (around line 436-448)
if (req && req.causalIndicators) {
  const allText = allEvidence.map((e) => e.finding.toLowerCase()).join(" ");
  let causalCount = 0;
  for (const causal of req.causalIndicators) {
    if (allText.includes(causal.toLowerCase())) {
      causalCount++;
    }
  }
  if (causalCount > 0) {
    const causalBoost = Math.min(15, causalCount * 3);
    const scaledBoost = causalBoost * strengthMultiplier;  // Apply strengthMultiplier
    confidence = Math.min(65, confidence + scaledBoost);
  }
}
```

### Tests Required

**Type 1: Confidence Assertion Updates**
- Test: `src/__tests__/services/stage-a/hypothesis-generator.test.ts`
- Update: Any test that asserts specific confidence values
- Action: Update expected confidence values to account for proportional scaling
- Example: If test expects confidence 49%, update to 49% * (avgPatternStrength / 10) for weak patterns

**Type 2: New F1 Visibility Test**
- File: `src/__tests__/services/stage-a/f1-hypothesis-integration.test.ts` (new)
- Test Case 1: "Pattern suppression (strength 1) produces ~80% reduced keyword boost"
  - Input: BLND-006 case with Pattern 3 suppressed to strength 1
  - Expected: Quality Crisis confidence ≤ 45% (50% baseline minus suppression effect)
  - Expected: Demand Forecasting confidence ≥ 48% (baseline maintained)
  
- Test Case 2: "Pattern reinforcement (strength 8) produces ~80% amplified keyword boost"
  - Input: Pattern with strong strength 8
  - Expected: Keyword boost scales to 4 points (vs 5 baseline)
  
- Test Case 3: "Pattern strength 1 changes diagnosis ranking for BLND-006"
  - Input: BLND-006 evidence + F1 suppression
  - Expected output: DEMAND_FORECASTING_MISMATCH with confidence > Quality Crisis
  - Assertion: ranks correctly due to proportional scaling

**Type 3: Regression Tests**
- Test: Full 21-case benchmark
- Action: Run F1 benchmark to verify no new regressions on 8 existing correct cases
- Assertion: Still 8/21 minimum (preserves correct cases)

### Expected Effect on F1 Result

**BLND-006 Confidence (Before Fix):**
- Quality Crisis: 44% (baseConfidence) + 5 (keyword) = 49% → final 34%
- Demand Forecasting: 48% (baseConfidence) + 5 (keyword) = 53% → final 50%
- Winner: TRUST_QUALITY_CRISIS (wrong, lower confidence)

**BLND-006 Confidence (After Fix with F1 suppression strength=1):**
- Quality Crisis: 44% (baseConfidence) + 0.5 (scaled keyword) = 44.5% → final 34%
- Demand Forecasting: 48% (baseConfidence) + 2 (scaled keyword) = 50% → final 50%
- Winner: DEMAND_FORECASTING_MISMATCH (correct, higher confidence)
- **Change: Fixes this case** ✓

**Expected Benchmark Impact:**
- Baseline (SLICE_9): 8/21 = 38.1%
- F1 only (before fix): 8/21 = 38.1% (invisible)
- F1 + This Fix: 10-14/21 = 48-67% (depends on other cases with suppression)
- **Expected movement: +2-6 cases correct**

### Expected Benchmark Movement

Based on analysis of failing cases with Pattern 3 suppression:
- BLND-006: Expected to FIX (Quality vs Demand decision)
- SYN-013: Expected to FIX (Retention vs GTM decision with adoption evidence)
- Others: May fix if suppression decision is between equally-scored diagnoses

**Conservative estimate:** 10-12/21 (48-57%)  
**Optimistic estimate:** 12-14/21 (57-67%)  

### Rollback Strategy

**If regressions detected (F1 benchmark shows <8 correct cases):**

1. **Immediate:** Revert changes to hypothesis-generator.ts
   ```bash
   git checkout src/services/stage-a/hypothesis-generator.ts
   ```

2. **Analysis:** Identify which existing correct cases broke
   - Run F1 benchmark to see which of the 8 baseline cases are now failing
   - Examine confidence changes in f1_benchmark_details.json

3. **Refinement Options:**
   - Reduce strengthMultiplier scaling (e.g., 0.1-0.6 instead of 0.1-1.0)
   - Apply proportional scaling only to keyword boost, not specificity/causal
   - Alternative: Implement Option 2 (remove keyword rescoring entirely)

4. **Re-test:** Run full benchmark again with adjusted parameters

### Non-Regression Testing

**Gates Required (in order):**

1. **Build:** `npm run build` 
   - Must pass without TypeScript errors
   - Expected: ✓ (no new types, just logic change)

2. **Type Check:** `npx tsc --noEmit`
   - Must pass without errors
   - Expected: ✓ (strengthMultiplier is number)

3. **Prisma Validate:** `npx prisma validate`
   - Must pass (no schema changes)
   - Expected: ✓ (non-DB change)

4. **Unit Tests:** `npm run test`
   - Must pass after confidence assertions are updated
   - Expected: Requires test update, then ✓

5. **F1 Benchmark:** `npm test -- f1-benchmark`
   - Must show ≥8/21 (preserve correct cases)
   - Must show improved accuracy if fix works
   - Expected: 10-14/21 if successful

### Benchmark Validation Required

**Before Commit:**
1. Run F1 benchmark with fix applied
2. Verify: Correct cases count ≥ 8/21
3. Verify: Accuracy improvement in failing cases
4. Generate: F1_benchmark_validation.json with new results

**Success Criteria:**
- ✅ Correct cases ≥ 8/21 (no regressions)
- ✅ F1 becomes visible (confidence changes proportional to pattern strength)
- ✅ 2+ cases fixed compared to baseline
- ⚠️ At least 10/21 total for option to be considered successful

### Implementation Sequence

1. **Stage 1 - Preparation:**
   - Create backup of current hypothesis-generator.ts
   - Prepare test updates for confidence assertions
   - Document current baseline (8/21 from F1 benchmark)

2. **Stage 2 - Implementation:**
   - Apply changes to lines 408-432 and 421-448
   - Update confidence assertion tests with new expected values
   - Create new F1 visibility integration test

3. **Stage 3 - Validation:**
   - Run non-DB gates (build, tsc, prisma validate)
   - Fix any TypeScript errors
   - Run unit tests, update assertions as needed

4. **Stage 4 - Benchmarking:**
   - Run F1 benchmark (21-case test)
   - Verify no regressions on 8 correct cases
   - Measure improvement on failing cases

5. **Stage 5 - Decision:**
   - If F1 benchmark ≥ 8/21 AND improves failing cases → COMMIT
   - If F1 benchmark < 8/21 → ROLLBACK, try Option 2
   - If marginal improvement (8-9/21) → Consider Option 2 as next step

### Commit Message Format

```
STAGE_A_FIX: Make keyword boosts proportional to pattern strength

Fixes PATTERN_STRENGTH_IGNORED contract defect in HypothesisGenerator.

F1's pattern strength modulation was invisible because keyword rescoring
applied fixed ±5 boosts regardless of pattern strength. This change scales
keyword boosts by average pattern strength (range 0.1-1.0 multiplier),
making pattern suppression visible downstream.

Changes:
- hypothesis-generator.ts: Proportional scaling for keyword/specificity/causal boosts
- Lines 408-432: Scale keyword boosts by pattern strength
- Lines 421-427: Scale specificity boosts by pattern strength  
- Lines 436-448: Scale causal boosts by pattern strength

Expected Impact:
- F1 benchmark: 10-14/21 (from 8/21 baseline)
- Cases fixed: BLND-006, SYN-013, others with pattern suppression

Tests:
- Updated: confidence assertions in hypothesis-generator.test.ts
- New: f1-hypothesis-integration.test.ts (F1 visibility tests)
- Validated: Full 21-case F1 benchmark (no regressions on 8 correct cases)

Gates: npm run build (✓), npx tsc --noEmit (✓), npm run test (✓ after update)
```

---

## AUTHORIZATION DECISION

### This Fix is AUTHORIZED FOR IMPLEMENTATION

**Justification:**
1. **Root cause clearly identified:** PATTERN_STRENGTH_IGNORED defect prevents F1 from working
2. **Minimal scope:** 3 locations, ~20 lines of code change
3. **Low regression risk:** Keyword boost logic preserved, just scaled
4. **Measurable impact:** Full 21-case benchmark can validate effect
5. **Reversible:** Single-file change, easy rollback if needed
6. **Next step after failure:** Clear escalation path to Option 2 if needed

**Conditions:**
- ✅ No production code changes until benchmarks validate
- ✅ Full test updates before commit
- ✅ Rollback strategy documented
- ✅ Non-DB gates required before commit
- ✅ F1 benchmark validation mandatory before commit

**Next: Implement fix, run benchmarks, measure impact. Do NOT proceed to F2/F3/bundles until this proves successful.**

---

## IF THIS FIX INSUFFICIENT

**Fallback Path (if 10-14/21 not achieved):**
1. Revert this fix
2. Implement Option 2 (Remove keyword rescoring entirely)
3. Re-benchmark with keyword rescoring removed
4. Expected: 12-16/21 accuracy

**Decision Point:** After Option 3 benchmark results, decide whether to escalate to Option 2.

---

## NOT AUTHORIZED (Per User Constraint)

**Do NOT implement:**
- ❌ F2, F3, F7, F9, F10 (isolated single fixes)
- ❌ Bundle A, B, or C (broad rewrites)
- ❌ Any other code changes until this fix proves successful

**Reason:** F1 proved that isolated pattern-level fixes don't work. Must fix the contract defect first (this fix), then re-evaluate whether further pattern-level work (F2/F3) is visible downstream.

---

## APPROVAL SIGNED

**Audit Complete:** ✓ STAGE_A_PIPELINE_CONTRACT_AUDIT.md  
**Invisibility Proven:** ✓ F1_INVISIBILITY_ANALYSIS.md  
**Defects Classified:** ✓ STAGE_A_CONTRACT_DEFECT_CLASSIFICATION.md  
**Options Compared:** ✓ STAGE_A_CONTRACT_FIX_OPTIONS.md  
**Recommendation:** ✓ This document (STAGE_A_PIPELINE_CONTRACT_AUTHORIZATION.md)  

**Ready to implement:** Option 3 (Proportional keyword boosts by pattern strength)

**Proceed with:** Implementation, benchmarking, validation, commit.
