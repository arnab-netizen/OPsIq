# OPTION 3 INVESTIGATION SUMMARY

**Session:** claude/execution-consultant-engine-v2-kobwgj  
**Task:** Implement Option 3 (Proportional Boosts) and Benchmark  
**Status:** COMPLETE - REVERTED DUE TO REGRESSIONS  
**Date:** 2026-06-17  

---

## WHAT WAS ATTEMPTED

Option 3 from STAGE_A_CONTRACT_FIX_OPTIONS.md: Make keyword boosts proportional to pattern strength to address the PATTERN_STRENGTH_IGNORED contract defect.

**Specification (per authorization):**
```
strengthMultiplier = avgPatternStrength / 10
Apply to: keyword boosts (+5), specificity boosts, causal boosts
Expected: BLND-006 and SYN-013 would be fixed (10-14/21 total)
```

---

## WHAT HAPPENED

1. **Implementation:** Implemented exactly as specified
   - Added avgPatternStrength calculation from matchingPatterns
   - Applied strengthMultiplier to all keyword/specificity/causal boosts
   - No schema changes, non-DB logic only

2. **Build:** Passed all non-DB gates
   - npm run build ✓
   - npx tsc --noEmit ✓
   - npx prisma validate ✓

3. **Benchmark:** FAILED with regressions
   - SLICE_8 baseline: 8/21 (38.1%)
   - Option 3 result: 6/21 (28.6%)
   - Regressions: BLND-007, PD-017 (2 cases)
   - Newly fixed: 0 cases
   - Net change: -2 cases

---

## WHY IT FAILED

### Root Cause #1: Baseline Mismatch
The proportional scaling formula works correctly mathematically, but it breaks the SLICE_8 baseline uniformly because:

- SLICE_8 patterns have normal strengths: 4-6 (based on supporting item count)
- Option 3 applies strengthMultiplier to ALL patterns: 0.4-0.6 multiplier
- This reduces boosts across the board for all diagnoses equally
- Cases that were correct due to +5 keyword boost now only get +2 boost
- This reverses confidence orderings (regressions)

Example:
- Case BLND-007: Expected GTM (SLICE_8 correct with strength 5 pattern)
- With Option 3: GTM gets 5 * 0.5 = 2.5 boost instead of +5
- Demand (strength 6) gets 5 * 0.6 = 3 boost instead of +5
- Relative change: Both reduced, but GTM loses more → regression

### Root Cause #2: Insufficient Suppression
The F1 pattern suppression mechanism isn't strong enough to create the expected differentiation:

- F1 suppresses some patterns to strength 1 (0.1 multiplier)
- But most patterns stay at strength 4-6 (0.4-0.6 multiplier)
- The 10x difference between strength 1 and 6 (0.1 vs 0.6) is 6x multiplier difference
- But base confidences (44% vs 48%) and other factors overwhelm this difference
- BLND-006 (expected in authorization to fix) still predicted wrong diagnosis

### Root Cause #3: Blanket Application
The algorithm applies scaling uniformly without considering:
- Whether pattern strength variation is actually meaningful in a case
- Whether multiple patterns have consistent or diverse strengths
- Whether the suppression is due to F1 validation or just low supporting items

---

## WHAT THIS TELLS US

The authorization's assumption was that Option 3 would disambiguate between:
- Suppressed patterns (strength 1): tiny boosts (0.5)
- Strong patterns (strength 8-10): full boosts (4-5)

But in reality:
- Normal patterns (strength 4-6): reduced boosts (2-3)
- Suppressed patterns (strength 1): tiny boosts (0.5)
- The reduction affects all patterns, not just suppressed ones

This suggests that:
1. **Option 3's algorithm is correct but incomplete**
   - It needs to distinguish between "suppressed by F1" vs "normal strength 4"
   - A pattern of strength 4 should get full boost, not 40% boost

2. **The defect is more nuanced than initially thought**
   - PATTERN_STRENGTH_IGNORED means pattern strength isn't used in confidence calculation
   - But proportional scaling affects ALL diagnoses, not just the comparison between strong/weak
   - The fix needs to be more surgical: only scale when comparing diagnoses with different pattern strengths

3. **Next step: Option 2 is likely necessary**
   - Removing keyword rescoring entirely (Option 2) would give more control
   - Would allow explicit rule-based disambiguation instead of proportion-based

---

## ARTIFACTS CREATED

**Code:**
- `src/__tests__/services/stage-a/f1-hypothesis-integration.test.ts` - 6 new integration tests for pattern strength visibility
- Updated `src/__tests__/services/stage-a/f1-benchmark.test.ts` - Now compares against correct SLICE_8 baseline

**Documentation:**
- `OPTION_3_VALIDATION_REPORT.md` - Detailed regression analysis
- Benchmark outputs: `simulation_runs/round_002/stage_a_pipeline_contract_fix_outputs/`

**Commit:**
- `063e3545` - STAGE_A_FIX: Option 3 (Proportional Boosts) - Benchmarked and Rejected

---

## DECISION

Per the authorization's rollback strategy:
- Reverted hypothesis-generator.ts changes
- Classification: COMPLETE_CODE_VERIFIED_NOT_VALIDATED_BENCHMARK
- Next action: Implement Option 2 (Remove Keyword Rescoring Entirely)

Option 2 expected improvement: 12-16/21 (57-76%)
