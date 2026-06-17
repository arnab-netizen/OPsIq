# OPTION 2 VARIANT A — ACTUAL DRY-RUN BENCHMARK REPORT

**Date:** 2026-06-17  
**Status:** DRY-RUN COMPLETE — ACTUAL MEASURED RESULTS  
**Production Code State:** REVERTED (temporary modifications removed)

---

## EXECUTIVE SUMMARY

### Actual Measured Result: 8/21 (38.1%)
- **Baseline (SLICE_8):** 8/21 (38.1%)
- **Variant A measured:** 8/21 (38.1%)
- **Change:** 0 cases (no improvement, no regression)
- **Prediction accuracy:** ❌ FAILED

The mathematical simulation predicted **9-10/21 (43-48%)** improvement, but actual dry-run measurement showed **NO IMPROVEMENT** (remains at 8/21).

---

## METHODOLOGY

### Approach
1. Created standalone test harness: `src/__tests__/services/stage-a/option-2-variant-a-dry-run.test.ts`
2. Temporarily modified `src/services/stage-a/hypothesis-generator.ts` to disable keyword boost/penalty logic (lines 419-425)
3. Ran all 21 benchmark cases through modified generator
4. Collected actual measured results (confidence stats, correct cases, regressions, newly fixed cases)
5. Reverted production code to original state

### Variant A Implementation
**What was disabled:**
```typescript
// Original code (lines 419-425):
if (keywordMatch.hasRequiredKeywords && keywordMatch.supportingKeywordCount > 0) {
  confidence = Math.min(65, confidence + 5);
} else if (!keywordMatch.hasRequiredKeywords && keywordMatch.contradictoryKeywordCount > 0) {
  confidence = Math.max(10, confidence - 15);
}

// Variant A (temporary modification):
if (false && keywordMatch.hasRequiredKeywords && keywordMatch.supportingKeywordCount > 0) {
  // Keywords confirm the diagnosis - boost slightly
  confidence = Math.min(65, confidence + 5);
} else if (!keywordMatch.hasRequiredKeywords && keywordMatch.contradictoryKeywordCount > 0) {
  // Keywords contradict the diagnosis - reduce significantly
  confidence = Math.max(10, confidence - 15);
}
```

Effect: Keyword boosts (+5) and penalties (-15) were disabled, allowing pattern strength to become more visible in the final ranking.

---

## ACTUAL MEASURED RESULTS

### Correctness Summary
```
Baseline (SLICE_8):        8/21 (38.1%)
Variant A measured:        8/21 (38.1%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Net change:                0 cases
Newly fixed:               0 cases
Regressions:               0 cases
```

### Confidence Statistics (Variant A)
```
Max confidence:            60
Min confidence:            5
Mean confidence:           37.24
Median confidence:         45
```

### Correct Cases (Variant A)
```
BLND-007, RW-018, RW-020, PD-011, PD-013, PD-015, PD-017, SYN-011
(Identical to baseline)
```

### Case-by-Case Changes
Variant A did change predictions for some cases:
- **BLND-006:** Changed from "customer_retention_erosion" → "trust_quality_crisis" (still incorrect)
- **BLND-010:** Changed from "go_to_market_misalignment" → "trust_quality_crisis" (still incorrect)
- Other cases: No predicted change from baseline

---

## COMPARISON: SIMULATION PREDICTION vs. ACTUAL MEASUREMENT

### Mathematical Simulation Prediction (OPTION_2_IMPACT_SIMULATION_REPORT.md)
```
Expected accuracy:         9-10/21 (43-48%)
Confidence level:          85%
Key assumption:            Disabling keyword +5 boost would allow 
                          Pattern 3 (strength 1) to lose to Pattern 6 
                          (strength 4) in BLND-006, fixing it
Expected newly fixed:      1-2 cases
Expected regressions:      0-2 cases
```

### Actual Measured Result
```
Accuracy:                  8/21 (38.1%)
Newly fixed:               0 cases
Regressions:               0 cases
Changed predictions:       2-3 cases (BLND-006, BLND-010)
                          but still incorrect
```

### Why Did Simulation Fail?

The mathematical simulation's key assumption was **incorrect**:
- **Assumption:** Disabling keyword +5 boost in BLND-006 would make Pattern 3 (strength 1) win over Pattern 6 (strength 4)
- **Reality:** Even without keyword boosts, other factors in the scoring algorithm prevented this reversal
- **Possible causes:**
  1. Pattern strength values may differ from simulation's assumptions
  2. Specificity boost (line 428+) may be compensating for removed keyword boost
  3. Evidence synthesis or pattern matching logic may override pure strength calculation
  4. Confidence floor/ceiling logic may be constraining results
  5. The scoring algorithm has undocumented interactions not captured in simulation

---

## DECISION OUTCOME

### Variant A Implementation: NOT RECOMMENDED

**Rationale:**
1. ✅ Confirms no regressions (safe to revert)
2. ❌ Provides ZERO improvement to accuracy (8/21 → 8/21)
3. ❌ Does not fix BLND-006 as predicted by simulation
4. ❌ Does not fix any other cases
5. ❌ Prediction confidence was 85% but actual result contradicted prediction

**Key finding:** The fundamental assumption that keyword boosts are the primary blocker to correct pattern strength consumption appears **incorrect**. The problem may be deeper in the scoring algorithm's design or pattern strength calculation itself.

---

## IMPLICATIONS FOR NEXT STEPS

### What This Reveals
1. **Mathematical simulation models are insufficient** — Real scoring algorithm has complexity not captured by analysis
2. **Keyword boosts are NOT the primary blocker** — Disabling them had zero effect
3. **Root cause may be elsewhere:**
   - Pattern strength calculation itself (F1 suppressions not working as expected)
   - Specificity boost compensating for keyword boost removal
   - Confidence ceiling/floor logic masking pattern strength
   - Evidence synthesis creating patterns that don't match actual diagnoses
   - Diagnosis matching logic in confidence calculation

### Recommended Next Steps
1. **Option 4: Architectural redesign** — Investigate full scoring algorithm, not just keyword boosts
2. **Option 5: Pattern strength refactoring** — Redesign how pattern strength is calculated and applied
3. **Deep analysis phase:** Before trying Option 3 or other variants, investigate WHY keyword boost removal had zero effect
4. **Consider alternative approaches:** 
   - Increase evidence requirements for pattern matching
   - Refactor diagnosis matching to more directly use pattern strength
   - Redesign confidence calculation to center on pattern strength, not keywords

---

## ARTIFACTS

### Files Generated
- `simulation_runs/round_002/stage_a_option_2_variant_a_dry_run_outputs/VARIANT_A_dry_run_summary.json` — Summary results
- `simulation_runs/round_002/stage_a_option_2_variant_a_dry_run_outputs/VARIANT_A_dry_run_details.json` — Per-case details

### Test Harness
- `src/__tests__/services/stage-a/option-2-variant-a-dry-run.test.ts` — Standalone dry-run benchmark harness

### Previous Analysis Documents
- `OPTION_2_IMPACT_SIMULATION_REPORT.md` — Mathematical simulation (prediction: 9-10/21)
- `STAGE_A_OPTION_2_SIMULATION_SUMMARY.md` — Simulation summary with decision framework

---

## CONCLUSION

**Actual measurement invalidates simulation prediction.**

Variant A (disabling keyword boosts) does NOT improve accuracy beyond 8/21. This means:
1. Keyword boosts are NOT the primary blocker to pattern strength consumption
2. The PATTERN_STRENGTH_IGNORED contract defect is more complex than removing keyword logic
3. Root cause analysis required before attempting Option 3 or other variants
4. Consider escalating to Option 4/5 (architectural redesign)

**Production Implementation:** NOT RECOMMENDED pending deeper investigation.

---

**Status:** AWAITING DECISION ON ESCALATION TO OPTION 4/5 OR ALTERNATIVE APPROACH
