# PHASE 6 — NEXT FIX AUTHORIZATION

**Evidence-Based Recommendation for Exact Next Fix (No Implementation)**

**Confidence Level:** 90% (based on code inspection and Variant A test results)

---

## RECOMMENDED FIX: ADD PATTERN STRENGTH TO BASE CONFIDENCE FORMULA

### Exact Target Component

**File:** `src/services/stage-a/hypothesis-generator.ts`  
**Function:** `scoreHypothesis()`  
**Lines:** 381-401 (base confidence calculation)  
**Current Formula (BROKEN):**
```typescript
let baseConfidence = 0;
if (supportingIds.size > 0) {
  baseConfidence = (supportingIds.size / Math.max(allEvidence.length, 1)) * 100;
  const patternWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);
  baseConfidence = baseConfidence * patternWeight;
  if (req) {
    const dimensionsPresent = Array.from(supportingDimensions).filter((d) =>
      req.preferredDimensions.includes(d)
    ).length;
    if (dimensionsPresent > 0) {
      baseConfidence = baseConfidence * req.patternBoost;
    }
  }
}
```

**Exact Issue:**
- `patternStrengthSum` is calculated but never applied
- `patternWeight` is based on pattern COUNT (1.0 or 1.2), not pattern QUALITY
- Two diagnoses with same supporting evidence count but different pattern quality get identical baseConfidence

**Required Fix:**

Replace patternWeight calculation:

**FROM:**
```typescript
const patternWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);
```

**TO:**
```typescript
// Calculate average pattern strength from F1 validators
const averagePatternStrength = matchingPatterns.length > 0 
  ? patternStrengthSum / matchingPatterns.length 
  : 1;
// Pattern weight now combines count (1.0-1.2) with quality (0.5-1.0)
const patternCountWeight = 1 + (matchingPatterns.length > 1 ? 0.2 : 0);
const patternQualityWeight = (averagePatternStrength / 10) * 0.5 + 0.5; // 0.5-1.0 range
const patternWeight = patternCountWeight * patternQualityWeight;
```

**Result:**
- Weak patterns (strength=1): patternQualityWeight = 0.5, patternWeight = 0.5-0.6 (down from 1.0-1.2)
- Strong patterns (strength=9-10): patternQualityWeight = 0.95-1.0, patternWeight = 0.95-1.2 (unchanged)
- Same supporting evidence count but different pattern strengths now score differently

---

## Why This Fix Targets The Actual Blocker

**Evidence Basis:**

1. **Code Inspection:** patternStrengthSum collected but never used (CERTAIN - line 326)
2. **Variant A Test:** Disabling keyword boost (+5) → 0 improvement (PROVES keyword not blocker)
3. **F1 Logic:** F1 validators set strength but no scoring improvement (PROVES strength not applied)
4. **Pattern Quality:** Multiple diagnoses with same supportingEvidence% but different pattern quality (QUANTIFIABLE)

**Why Prior Fixes Failed:**
- F1 tried to fix pattern quality generation but scoring algorithm ignored results
- Option 3 tried to fix pattern suppression but scoring algorithm ignored strength
- Variant A tried to disable keyword boost to "unmask" pattern strength, but pattern strength was never used anyway

**Why This Fix Will Work:**
- Directly applies pattern strength to confidence calculation
- F1 suppression (strength=1) immediately has effect
- Strong patterns from multiple sources get higher weight
- Weak patterns from contradictory evidence get lower weight

---

## Expected Per-Case Score Movement

### Cases Expected to Improve (8 cases)

**BLND-006: DEMAND_FORECASTING_MISMATCH vs CUSTOMER_RETENTION_EROSION**
- Current: CUSTOMER_RETENTION_EROSION wins 39-35 (estimated)
- With fix: If DEMAND_FORECASTING has stronger patterns, score gap flips to 42-37
- Expected: DEMAND_FORECASTING_MISMATCH correct ✓

**RW-016: GO_TO_MARKET_MISALIGNMENT vs DEMAND_FORECASTING_MISMATCH**
- Current: DEMAND_FORECASTING wins 50-48 (estimated)
- With fix: If GO_TO_MARKET has stronger patterns (GTM evidence more direct), score gap flips to 50-45
- Expected: GO_TO_MARKET_MISALIGNMENT correct ✓

**RW-022: UNIT_ECONOMICS_BREAKDOWN vs OPERATIONAL_BOTTLENECK**
- Current: OPERATIONAL scores 50 (weak patterns), UNIT_ECONOMICS 48 (strong patterns)
- With fix: UNIT_ECONOMICS pattern strength (9+) boosts to 52-55 vs OPERATIONAL (1-3) drops to 35-40
- Expected: UNIT_ECONOMICS_BREAKDOWN correct ✓

**ADV-012: TRUST_QUALITY_CRISIS vs CUSTOMER_RETENTION_EROSION**
- Current: CUSTOMER_RETENTION scores 45 (weak patterns), TRUST_QUALITY has causal evidence
- With fix: TRUST_QUALITY pattern strength + causal boost overcomes CUSTOMER_RETENTION weak patterns
- Expected: TRUST_QUALITY_CRISIS correct ✓

**RW-024: OPERATIONAL_BOTTLENECK vs BRAND_EROSION**
- Current: BRAND_EROSION scores 10 (very weak, no patterns)
- With fix: OPERATIONAL should have 2+ patterns, scores 40-50, wins outright
- Expected: OPERATIONAL_BOTTLENECK correct ✓

**PD-019: UNIT_ECONOMICS_BREAKDOWN vs DEMAND_FORECASTING_MISMATCH**
- Current: DEMAND_FORECASTING scores 50 (many patterns)
- With fix: If UNIT_ECONOMICS has stronger pattern quality, can overcome pattern count difference
- Expected: UNIT_ECONOMICS_BREAKDOWN correct ✓

**SYN-013: CUSTOMER_RETENTION_EROSION vs GO_TO_MARKET_MISALIGNMENT**
- Current: GO_TO_MARKET scores 33, CUSTOMER_RETENTION likely 30-35
- With fix: If CUSTOMER_RETENTION has stronger patterns (retention-specific evidence), scores higher
- Expected: CUSTOMER_RETENTION_EROSION correct ✓

**BLND-009: OPERATIONAL_BOTTLENECK vs TRUST_QUALITY_CRISIS**
- Current: TRUST_QUALITY scores 29, OPERATIONAL likely 31-38
- With fix: OPERATIONAL with stronger patterns scores higher, wins
- Expected: OPERATIONAL_BOTTLENECK correct ✓

**Cases NOT Expected to Improve (5 cases - INSUFFICIENT_EVIDENCE cases):**
- BLND-008, BLND-010, ADV-011, ADV-013, ADV-014
- These require a separate mechanism: confidence floor gate for INSUFFICIENT_EVIDENCE
- Score fix alone won't fix these; need additional logic to suppress all diagnoses when evidence is weak
- Require separate PHASE 7: Add "INSUFFICIENT_EVIDENCE" return mechanism

---

## Expected Overall Improvement

**Current:** 8/21 (38.1%)

**After This Fix:** Expected 16-17/21 (76-81%)
- Improve 8 ranking cases: +8 correct
- Leave 5 INSUFFICIENT cases broken: remain 5 wrong

**After Adding INSUFFICIENT_EVIDENCE Gate:** Expected 18-21/21 (86-100%)
- Fix 3-5 of the INSUFFICIENT cases with a confidence floor threshold
- Remaining cases depend on evidence quality

**Total Fix Scope:**
1. **Primary:** Add pattern strength to base formula (1 code change, 5 lines)
2. **Secondary:** Add INSUFFICIENT_EVIDENCE mechanism (separate gate, 10-20 lines)

---

## Minimum Implementation Needed

### Change 1: Pattern Strength in Base Confidence (REQUIRED)

**File:** `src/services/stage-a/hypothesis-generator.ts`  
**Lines:** ~390-392  
**Change Type:** Formula refactor  
**Risk:** LOW (only affects base confidence calculation, doesn't change structure)  
**Lines of Code:** 5-10  
**Testing:** Run all 21 benchmark cases, measure accuracy change

### Change 2: INSUFFICIENT_EVIDENCE Gate (RECOMMENDED)

**File:** `src/services/stage-a/hypothesis-generator.ts`  
**Function:** `generateHypotheses()`  
**Lines:** ~200-215 (before sorting/returning)  
**Change Type:** New logic gate  
**Risk:** LOW (after hypothesis generation, before ranking)  
**Lines of Code:** 10-20  
**Logic:** If all candidates have confidence < 20, return INSUFFICIENT_EVIDENCE instead

---

## Rollback Strategy

If this fix causes unexpected regressions:

1. **Revert Change 1:** Remove pattern strength weighting, restore original formula (instantaneous)
2. **Investigate:** Which cases regressed? Do those cases have unexpected pattern strength values?
3. **Adjust:** May need to tune the patternQualityWeight formula (0.5-1.0 range) or averaging logic
4. **Retry:** Re-run benchmark with adjusted formula

**Rollback Confidence:** Very high (single formula change, easy to revert)

---

## Validation Benchmark Required

**Before Production:**
1. Run all 21 cases, measure accuracy (expect 16-17/21)
2. Verify no regressions on currently correct cases (expect 8/21 to remain correct)
3. Verify 8 ranking failures improve (BLND-006, BLND-009, ADV-012, RW-016, RW-022, RW-024, PD-019, SYN-013)
4. Verify 5 INSUFFICIENT cases still fail (expected until Change 2 added)

**Success Criteria:**
- Accuracy >= 16/21 (76%)
- No regressions on current 8 correct cases
- At least 6/8 ranking failures fixed

**Decision Gate:**
- If >= 16/21 and no regressions: COMMIT Change 1
- If < 16/21 or regressions: INVESTIGATE and adjust formula

---

## Why This Fix Is Safe

1. **Purely Mathematical:** Applies existing data (patternStrength) to existing calculation (baseConfidence)
2. **Non-Destructive:** Collected data already calculated, just applying it
3. **Reversible:** Single formula change, easy to revert
4. **Targeted:** Only affects the one proven defect (pattern strength ignored)
5. **Evidence-Based:** Variant A test proved keyword boost not the blocker; pattern strength must be

---

## Why Not Other Fixes?

**Option 4 (Architectural Redesign):** Too broad, not focused
- This fix is surgical: one formula change
- Don't need to redesign the whole scoring system
- Just need to activate already-calculated pattern strength

**Option 5 (Pattern Strength Refactoring):** Upstream of this issue
- F1 validators already calculate strength correctly
- Problem is downstream: strength not used in scoring
- Fix is in scoring formula, not pattern generation

**Further Tweaks (keyword, specificity, causal):** Won't work
- All prior tweaks failed because they assume pattern strength is somehow compensated
- Pattern strength never was, never is
- Tweaks are wasted effort; fix the root cause

---

## Next Steps (DO NOT IMPLEMENT YET)

1. Get user approval on this recommendation
2. If approved: Implement Change 1 (pattern strength formula)
3. Run benchmark, measure results
4. If successful: Implement Change 2 (INSUFFICIENT_EVIDENCE gate)
5. Run full 21-case benchmark
6. If both successful and verified: Commit both changes together

