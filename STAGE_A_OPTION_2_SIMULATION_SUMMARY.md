# OPTION 2 IMPACT SIMULATION - SUMMARY

**Date:** 2026-06-17  
**Status:** SIMULATION ANALYSIS COMPLETE (NO PRODUCTION CODE CHANGES)

---

## SIMULATION APPROACH

Created comprehensive mathematical analysis of 4 Option 2 variants WITHOUT modifying production code:

- **Variant A:** Disable keyword boosts (+5/-15 removal)
- **Variant B:** Patterns only (remove keyword/specificity/causal)
- **Variant C:** Pattern primary, keywords as tiebreaker
- **Variant D:** Remove keyword boosts/penalties, keep specificity/causal

---

## SIMULATION FINDINGS

### Variant A: RECOMMENDED
- **Expected accuracy:** 9-10/21 (43-48%)
- **Improvement over baseline:** +1-2 cases
- **Regression risk:** Low (0-2 cases)
- **Code change:** Minimal (remove 7 lines: 419-425)
- **Implementation time:** < 30 minutes
- **Reversibility:** High

**Key insight:** Disabling keyword boosts allows Pattern 3 (strength 1) to lose to Pattern 6 (strength 4) in BLND-006. Currently keyword +5 overrides this difference.

### Variant B: NOT RECOMMENDED
- **Expected accuracy:** 6-12/21 (unpredictable)
- **Improvement over baseline:** -2 to +4 cases (unclear)
- **Regression risk:** Critical (3-5+ cases)
- **Risk assessment:** Cannot predict which cases break

**Key insight:** Removing all boosts (specificity, causal) is too aggressive. Specificity boosts provide necessary disambiguation.

### Variant C: ALTERNATIVE
- **Expected accuracy:** 9-11/21 (43-52%)
- **Improvement over baseline:** +1-3 cases
- **Regression risk:** Low (0-1 cases)
- **Code change:** Medium (add tiebreaker logic)
- **Complexity:** Higher than A, worth considering if A insufficient

### Variant D: EQUIVALENT TO A
- **Expected accuracy:** 9-11/21 (43-52%)
- **Improvement over baseline:** +1-3 cases
- **Regression risk:** Low (0-1 cases)
- **Code change:** Minimal (same as A)
- **Note:** Analysis shows D should perform same as A

---

## CONFIDENCE LEVEL

**Confidence that Variant A improves to 9-10/21:** 85%

**Basis:**
1. BLND-006 will definitely fix (Pattern 3 strength 1 vs Pattern 6 strength 4)
2. 0-1 additional cases may fix (keyword boost was overriding correct pattern)
3. Regression probability low (Specificity and causal boosts remain as backup)

**Caveats:**
- Depends on actual pattern strength values (F1 suppressions must be working)
- If other cases rely critically on keyword +5 boost, could have more regressions
- Limited to benchmark data (21 cases)

---

## RECOMMENDATION

**PROCEED WITH VARIANT A** with following plan:

1. **Approval:** Confirm 9-10/21 is acceptable improvement target
2. **Implementation:** Remove lines 419-425 from hypothesis-generator.ts
3. **Benchmarking:** Run full 21-case F1 benchmark
4. **Decision gate:** 
   - If >= 9/21 AND <= 2 regressions: COMMIT
   - If < 9/21 OR > 2 regressions: REVERT
   - If >= 9/21 AND >= 3 regressions: EVALUATE Variant D
5. **Escalation:** If Variant A fails, defer to Option 4 or Option 5 (architectural redesigns)

---

## NOT IMPLEMENTED

Per hard constraints, this simulation harness was created as documentation only:
- ❌ No production code changes
- ❌ No hypothesis-generator.ts modifications
- ❌ No answer-key modifications
- ❌ No test changes (except standalone simulation file for reference)
- ✅ Mathematical analysis only
- ✅ Complete documentation

---

## FILES CREATED

- `OPTION_2_IMPACT_SIMULATION_REPORT.md` - Comprehensive variant analysis
- `option-2-impact-simulation.test.ts` - Standalone simulation harness (reference only)
- `STAGE_A_OPTION_2_SIMULATION_SUMMARY.md` - This summary

**Output directory:** `simulation_runs/round_002/stage_a_option_2_impact_simulation_outputs/`

---

## NEXT STEPS BLOCKED UNTIL APPROVAL

Current status: **AWAITING DECISION ON VARIANT A IMPLEMENTATION**

- Approve Variant A and proceed with implementation
- Reject Variant A and pivot to Option 4/5
- Defer entire STAGE_A_PIPELINE_CONTRACT_FIX work
