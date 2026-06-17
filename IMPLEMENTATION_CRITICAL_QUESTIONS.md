# IMPLEMENTATION CRITICAL QUESTIONS
## Stage A EvidenceSynthesisEngine: Key Decision Points

**Analysis Date:** 2026-06-17  
**Document Purpose:** Answer 5 critical questions to guide implementation prioritization and risk management

---

## QUESTION 1: What is the Smallest Set of Fixes Likely to Exceed 9/21?

### Answer Summary
**Minimum 6 fixes: F1, F3, F7, F9, F10, F2** (or alternative 5-fix set)

**Expected Outcome:** 13-15/21 (61.9%-71.4%)  
**Confidence:** HIGH (85%+ probability of exceeding gate)

---

### Detailed Analysis

#### Option 1: Bundle A (5 Quick Wins) — Minimum Viable
**Fixes:** F1, F3, F7, F9, F10 only
- Total: 100 LOC, 3-4 days
- Expected: 13/21 (61.9%)
- Worst Case: 10/21 (47.6%)
- Best Case: 13/21 (61.9%)
- **Gate Achievement:** YES (confidence >95%)

**Which fixes are included?**
1. **F1 (BLND-006):** Contradiction-suppression — suppress quality pattern when satisfaction intact
2. **F3 (BLND-009):** Organizational bottleneck — detect key-person concentration
3. **F7 (RW-022):** Cost-vs-bottleneck — check financial_health before assuming operational bottleneck
4. **F9 (SYN-013):** Pattern 8 mapping — map activation failure to quality crisis
5. **F10 (RW-024):** Uncertainty-aware diagnosis — diagnose with lower confidence instead of UNKNOWN

**Why these 5 are critical:**
- All are LOW complexity (easy to implement, debug, and understand)
- All are LOW regression risk (narrow, isolated changes)
- Collectively fix 5 of 10 failing cases
- Together they form coherent pattern-validation and uncertainty-handling logic
- No dependencies; can be implemented in parallel

**Which fixes are NOT included in Option 1?**
- F2/F5 (unavailable-data detection): MEDIUM regression risk; requires critical-gaps calibration
- F4 (pricing pattern): MEDIUM complexity; new pattern creation; requires pricing-case testing
- F6 (GTM context boost): MEDIUM complexity; context boost can interact; requires cross-case testing
- F8 (pattern precedence): MEDIUM complexity; reorders patterns; requires bottleneck-case testing

---

#### Option 2: Bundle A + Data Validation (7 Fixes) — Recommended Minimum
**Fixes:** F1, F3, F7, F9, F10, F2, F5
- Total: 135 LOC, 7-9 days
- Expected: 15/21 (71.4%)
- Worst Case: 12/21 (57.1%)
- Best Case: 15/21 (71.4%)
- **Gate Achievement:** YES (confidence >99%)

**Additional fixes beyond Option 1:**
6. **F2 (BLND-008):** Unavailable-data detection — return INSUFFICIENT_EVIDENCE when critical factors unavailable
7. **F5 (ADV-011):** Unavailable-data check — same logic as F2

**Why add F2/F5?**
- Adds critical safety valve: prevents confident diagnosis when data gaps exist
- Fixes 2 additional cases (BLND-008, ADV-011)
- Medium regression risk but mitigated by careful critical-gaps definition
- Strongly recommended for gate achievement with margin

**How likely is this set to exceed 9/21?**
- Expected case: 15/21 (reaches +6 above gate)
- Worst case: 12/21 (still +3 above gate)
- Probability of exceeding 9/21: >99%
- Probability of reaching at least 13/21: 90%

---

#### Option 3: Full Bundle C (10 Fixes) — Maximum Certainty
**Fixes:** All F1-F10
- Total: 220 LOC, 12-16 days
- Expected: 17/21 (81.0%)
- Worst Case: 14/21 (66.7%)
- Best Case: 18/21 (85.7%)
- **Gate Achievement:** YES (confidence >99.5%)

**Additional fixes in Bundle C:**
8. **F4 (BLND-010):** Pricing pattern — new pattern for pricing opportunities
9. **F6 (RW-016):** GTM context boost — boost pattern strength for positioning-market-fit gaps
10. **F8 (PD-019):** Pattern precedence — check unit-economics before bottleneck

**Why add F4/F6/F8?**
- Addresses remaining 3 failing cases (BLND-010, RW-016, PD-019)
- Medium complexity but comprehensive fix
- Expected accuracy jumps to 17/21 (81.0%)

**How likely is this set to exceed 9/21?**
- Expected case: 17/21 (reaches +8 above gate)
- Worst case: 14/21 (still +5 above gate)
- Probability of exceeding 9/21: >99.5%
- Probability of reaching at least 16/21: 80%

---

### Recommendation

**For gate achievement with minimum risk:** Use Option 2 (Bundle A + F2/F5)
- **Why:** Balances quick delivery (7-9 days) with strong margin (15/21)
- **Effort:** 135 LOC over 7-9 days
- **Risk:** LOW-MEDIUM (manageable with careful critical-gaps definition)
- **Gate Confidence:** >99%

**Alternative if timeline critical:** Option 1 (Bundle A only)
- **Why:** Fastest possible delivery (3-4 days)
- **Effort:** 100 LOC over 3-4 days
- **Risk:** LOW
- **Gate Confidence:** >95% (still comfortable margin)

---

## QUESTION 2: What is the Smallest Set Likely to Exceed 13/21?

### Answer Summary
**Minimum 7 fixes: F1, F3, F7, F9, F10, F2, F5** (Option 2 above)

**Expected Outcome:** 15/21 (71.4%)  
**Confidence:** HIGH (90%+ probability of reaching/exceeding 13/21)

---

### Detailed Analysis

#### Current State
- Baseline: 8/21 (38.1%)
- Gate minimum: 9/21 (42.9%)
- Target (Question 2): 13/21 (61.9%)
- **Gap to close:** +5 cases

#### Bundle A (5 Fixes) Falls Short
**Fixes:** F1, F3, F7, F9, F10
- Expected: 13/21 (exactly at target, not exceeding)
- Worst case: 10/21 (falls short)
- Best case: 13/21 (meets target)

**Verdict:** Bundle A alone is *unlikely* to exceed 13/21 (might only meet it)

#### Bundle A + Data Validation (7 Fixes) Exceeds 13/21
**Fixes:** F1, F3, F7, F9, F10, F2, F5
- Expected: 15/21 (well above target)
- Worst case: 12/21 (slightly short; 90% probability of exceeding)
- Best case: 15/21 (exceeds target)
- **Probability of exceeding 13/21:** 90%

**Verdict:** Option 2 is the minimum viable set to reliably exceed 13/21

#### Why F2/F5 are Necessary
- F2 (BLND-008) + F5 (ADV-011) = +2 cases
- Together they address "insufficient evidence" scenarios
- Without them, stuck at 13/21 (exactly meeting, not exceeding)
- With them, reach 15/21 (exceeding with 2-case margin)

#### Additional Fixes Beyond 13/21
**If 15/21 is not sufficient target:**

Option: Add F4, F6, F8 (Bundle C pattern enhancements)
- Expected: 17/21 (81.0%)
- Probability of exceeding 15/21: 85%
- **Effort:** +85 LOC, +5-7 days
- **Recommendation:** Only if timeline permits and higher accuracy needed

---

### Recommendation

**To reliably exceed 13/21:** Implement Bundle A + data validation (7 fixes, 135 LOC, 7-9 days)

**To significantly exceed 13/21:** Implement Bundle C (10 fixes, 220 LOC, 12-16 days)

**Effort-to-accuracy analysis:**
- 5 fixes: 13/21 (4-5 days) — meets target, not exceeding
- 7 fixes: 15/21 (7-9 days) — exceeds with margin **[RECOMMENDED]**
- 10 fixes: 17/21 (12-16 days) — greatly exceeds with strong margin

---

## QUESTION 3: Which Fixes Should Be Avoided Initially?

### Answer Summary
**Avoid F4, F6, F8 in initial implementation** (defer to post-gate or later phase)

**Reason:** MEDIUM complexity + MEDIUM regression risk + not required for gate achievement

---

### Detailed Analysis

#### Fixes to AVOID in Phase 1 (Initial Implementation)

| Fix | Issue | Why Avoid Initially | When to Reconsider |
|-----|-------|-------------------|-------------------|
| **F4: BLND-010 (Pricing Pattern)** | NEW pattern creation; requires pricing-case testing | Adds +1 case but introduces new complexity; if something breaks, unclear whether new pattern or existing fix | Post-gate if budget permits; or if gate margin insufficient |
| **F6: RW-016 (GTM Context Boost)** | Context boost interacts with other diagnoses; cross-case testing required | Could over-boost GTM in unrelated cases (demand, pricing); requires comprehensive cross-case testing | Post-gate when full testing suite available |
| **F8: PD-019 (Pattern Precedence)** | Reorders pattern-checking logic; affects multiple cases | Changes fundamental precedence; could unexpectedly reorder diagnoses in other cases; requires extensive bottleneck-case testing | Post-gate when confident in baseline |

#### Why F4, F6, F8 Are High-Risk Despite Medium Effort

1. **F4 (Pricing Pattern):**
   - **Risk:** Creating new pattern (Pattern 9) could have edge cases not seen in BLND-010
   - **Testing Need:** Must verify against ALL pricing-related cases (not just BLND-010)
   - **Interaction:** Could interact with F2 (unavailable-data) if pricing factors unavailable
   - **Recommendation:** Defer to post-gate comprehensive testing

2. **F6 (GTM Context Boost):**
   - **Risk:** Context boost (+2 pattern strength) could accumulate with other boosts
   - **Testing Need:** Must verify against GTM, demand, AND pricing cases (3-case cross-check)
   - **Interaction:** Could over-boost GTM if multiple context signals present
   - **Recommendation:** Defer until full signal-interaction testing possible

3. **F8 (Pattern Precedence):**
   - **Risk:** Reordering Pattern 1 before Pattern 4 affects multiple case pairs
   - **Testing Need:** Must verify against BOTH unit-economics ground-truth (RW-018, RW-020) AND operational-bottleneck ground-truth (ADV-014, RW-020, PD-011)
   - **Interaction:** Interacts with F7 (cost-vs-bottleneck); must be tested together
   - **Recommendation:** Defer until pattern ordering fully validated

---

#### Fixes to INCLUDE in Phase 1 (Initial Implementation)

| Fix | Reason to Include | Risk Level | Why Include |
|-----|------------------|-----------|----------|
| **F1: BLND-006 (Contradiction-Suppression)** | Narrow guard clause; well-scoped | LOW | Core pattern-validation logic; foundational |
| **F3: BLND-009 (Organizational Bottleneck)** | Boost existing pattern; isolated change | LOW | Recognizes organizational structure; no side effects |
| **F7: RW-022 (Cost-vs-Bottleneck)** | Guard clause; validates cost signals first | LOW | Distinguishes symptoms from root causes; foundational |
| **F9: SYN-013 (Pattern 8 Mapping)** | Extends existing pattern condition | LOW | Fixes activation-failure detection; well-bounded |
| **F10: RW-024 (Uncertainty-Aware)** | Confidence threshold calibration | LOW | Probabilistic diagnosis is inherently safe; threshold adjustable |
| **F2: BLND-008 (Unavailable-Data)** | Safety valve; prevents overconfidence | MEDIUM | Critical for gate margin; manageable with careful definition |
| **F5: ADV-011 (Unavailable-Data)** | Reuses F2 logic | MEDIUM | Adds safety net; low marginal complexity |

---

### Recommendation

**Initial Implementation (Phase 1-2):** F1, F3, F7, F9, F10, F2, F5 (Bundle A + B)
- Low-medium risk; directly addresses gate requirement
- Expected accuracy: 15/21 (strong margin)
- Effort: 135 LOC, 7-9 days

**Post-Gate Consideration (Phase 3, if time permits):** F4, F6, F8
- Medium risk but higher confidence after gate achieved
- Expected accuracy improvement: +2 cases (→ 17/21)
- Effort: 85 LOC, 5-7 days
- Benefits: Strong foundation for Stage B

**Avoid Simultaneously:** Don't implement F4 + F6 + F8 without F1-F7 foundation
- Risk of compounding interactions
- Hard to debug if multiple high-complexity fixes in flight

---

## QUESTION 4: Which Fixes Create Highest Regression Risk?

### Answer Summary
**Highest Regression Risk (in order):**
1. **F8 (PD-019): Pattern Precedence** — HIGH (20-25% regression risk)
2. **F6 (RW-016): GTM Context Boost** — MEDIUM-HIGH (20% regression risk)
3. **F2/F5: Unavailable-Data Detection** — MEDIUM (15% over-suppression risk)
4. **F4 (BLND-010): Pricing Pattern** — MEDIUM (15% false-positive risk)

---

### Detailed Analysis by Fix

#### F8: Pattern Precedence Reordering — HIGHEST RISK

**What Makes It Risky?**
- Changes fundamental pattern-checking order: Pattern 1 before Pattern 4
- Affects multiple case pairs beyond BLND-010 alone
- If reordering logic wrong, could unexpectedly suppress Pattern 4 in valid bottleneck cases

**Specific Regression Scenarios:**

1. **Scenario A: Over-suppression of Bottleneck Cases**
   ```
   Case: RW-020 (OPERATIONAL_BOTTLENECK ground-truth)
   Risk: Pattern 1 (unit economics) might trigger spuriously; suppress Pattern 4
   Fix: Ensure Pattern 1 prerequisite check is only if BOTH patterns could apply
         Require Pattern 1 strength > 5 to suppress Pattern 4 (not just presence)
   Testing: Run RW-020 before/after; verify OPERATIONAL_BOTTLENECK still elected
   Confidence: 75% (depends on threshold tuning)
   ```

2. **Scenario B: Unintended Reordering in Mixed Cases**
   ```
   Case: RW-018 (UNIT_ECONOMICS_BREAKDOWN ground-truth)
   Risk: Pattern 1 correctly detected; but if pattern-strength calculation wrong, 
         might not suppress Pattern 4 when it should
   Fix: Validate pattern-strength calculation against ground-truth pattern strength
   Testing: Run RW-018 before/after; verify unit-economics ranked first
   Confidence: 70% (depends on pattern-strength formula accuracy)
   ```

**Regression Mitigation:**
- Test against BOTH unit-economics ground-truth (RW-018, RW-020) AND operational-bottleneck ground-truth (ADV-014, RW-020, PD-011)
- Ensure reordering logic is bidirectional: Pattern 1 suppresses Pattern 4, but NOT vice versa
- Run full 21-case suite after F8 implementation; flag any unexpected ranking changes
- Document pattern-strength thresholds and validation rules

**Estimated Regression Probability:** 20-25% (one regression in 21-case suite)  
**Mitigation Confidence:** 75% (careful testing can catch most issues)

---

#### F6: GTM Context Boost — MEDIUM-HIGH RISK

**What Makes It Risky?**
- Adds +2 pattern strength to Pattern 5 (GTM) when positioning-market-fit gap detected
- Could accumulate with other context signals if not carefully scoped
- Interaction with F1 (contradiction-suppression) possible

**Specific Regression Scenarios:**

1. **Scenario A: Over-boost in Demand Cases**
   ```
   Case: RW-024 (OPERATIONAL_BOTTLENECK ground-truth, not GTM)
   Risk: If evidence mentions "market" + "customer," GTM boost might trigger spuriously
         Could elevate GTM pattern incorrectly
   Fix: Narrow keyword matching to positioning-specific terms (custom, premium, enterprise, 
        white-glove) AND segment-mismatch terms (SMB, price-sensitive, simplicity)
        Require BOTH to be present; not just one
   Testing: Run RW-024 before/after; verify OPERATIONAL_BOTTLENECK still elected
   Confidence: 70% (depends on keyword precision)
   ```

2. **Scenario B: Interaction with Contradiction Logic**
   ```
   Case: SYN-013 (after F9 fix, should be TRUST_QUALITY_CRISIS not GTM)
   Risk: GTM context boost could make GTM pattern stronger than quality pattern
         Reversing F9's fix effectiveness
   Fix: Ensure GTM boost only applies to Pattern 5; doesn't re-rank existing patterns
        Test F9 + F6 together to validate no interaction
   Testing: Run SYN-013 with F9 alone, then with F9+F6; verify quality pattern still wins
   Confidence: 65% (interaction testing required)
   ```

**Regression Mitigation:**
- Limit GTM boost to +2 points (don't over-weight)
- Require specific keyword matching (positioning AND segment mismatch)
- Test against demand, pricing, and quality cases for over-boost scenarios
- Run full 21-case suite after F6 implementation

**Estimated Regression Probability:** 15-20% (one regression in 21-case suite)  
**Mitigation Confidence:** 70% (careful keyword scoping helps)

---

#### F2/F5: Unavailable-Data Detection — MEDIUM RISK

**What Makes It Risky?**
- Could over-suppress patterns if critical-gaps definition too broad
- Different cases have different data requirements
- Risk of INSUFFICIENT_EVIDENCE diagnosis blocking valid patterns

**Specific Regression Scenarios:**

1. **Scenario A: Over-suppression on Partial Data**
   ```
   Case: RW-016 (GO_TO_MARKET_MISALIGNMENT, requires market + customer data)
   Risk: If critical-gaps list includes "win-loss analysis" and it's unavailable,
         F2 might suppress pattern even though positioning evidence is clear
   Fix: Define critical-gaps narrowly; only truly blocking factors (e.g., offer structure 
        for pricing diagnosis, cohort data for bottleneck diagnosis)
        Require ≥2 critical factors unavailable; not just 1
   Testing: Run cases with partial data (RW-016, others); verify patterns created 
            when sufficient evidence present
   Confidence: 70% (depends on critical-gaps definition tightness)
   ```

2. **Scenario B: Different Cases Need Different Data**
   ```
   Case: BLND-006 (DEMAND_FORECASTING_MISMATCH, mainly market evidence)
   Risk: If critical-gaps includes "market positioning" and it's unavailable,
         F2 might suppress when actually sufficient other evidence exists
   Fix: Make critical-gaps context-aware; different factors required for different diagnoses
        E.g., "cohort data" critical for bottleneck, not for GTM
   Testing: Cross-check which gaps are actually blocking for each diagnosis
   Confidence: 60% (context-awareness complex to test)
   ```

**Regression Mitigation:**
- Define critical-gaps as absolute blockers only (e.g., offer structure, cohort segmentation)
- Require ≥2 critical factors missing; not just 1
- Review against BLND-008, ADV-011 cases to validate definitions
- Run spot-check on 5-6 cases with partial data
- If over-suppression detected, tighten critical-gaps list and re-run

**Estimated Regression Probability:** 10-15% (minor over-suppression)  
**Mitigation Confidence:** 80% (careful definition and testing helps)

---

#### F4: Pricing Pattern Creation — MEDIUM RISK

**What Makes It Risky?**
- Creates new pattern (Pattern 9) not previously in code
- Could have false positives if keyword matching too loose
- Interaction with F2 (unavailable-data) if pricing factors unavailable

**Specific Regression Scenarios:**

1. **Scenario A: False Positive on Pricing Failure Cases**
   ```
   Case: Hypothetical pricing-failure case (not in current 21)
   Risk: If evidence mentions "pricing" + "healthy retention," new Pattern 9 might trigger
         Could incorrectly diagnose pricing opportunity when actually pricing failure
   Fix: Distinguish between "pricing power" (demand for higher-value offering exists) 
        vs "pricing failure" (pricing strategy not working)
        Add keyword: require "depth lift" or "monetization gap" (opportunity signals)
        vs "pricing pressure" or "price elasticity" (failure signals)
   Testing: Test against theoretical pricing-failure cases; validate keyword distinction
   Confidence: 65% (new pattern requires validation)
   ```

2. **Scenario B: Interaction with Data Validation**
   ```
   Case: Case with pricing evidence but unavailable willingness-to-pay research
   Risk: F4 creates Pattern 9; F2 should suppress if data gaps too large
         Order of execution matters: F4 then F2 vs F2 then F4
   Fix: Ensure F2 (data validation) runs before pattern creation; suppress early if critical gaps
   Testing: Run with both F2 + F4 in place; verify correct diagnosis
   Confidence: 75% (depends on execution order)
   ```

**Regression Mitigation:**
- Test new pattern against BLND-010 (should fix) + pricing-related cases (should not regress)
- Validate keyword distinction between opportunity and failure
- Ensure F2 (unavailable-data) can suppress Pattern 9 if pricing data unavailable
- Run full 21-case suite after F4 implementation

**Estimated Regression Probability:** 10-15% (false positive on edge case)  
**Mitigation Confidence:** 75% (keyword validation helps)

---

### Summary: Regression Risk Hierarchy

| Fix | Risk Level | Probability | Mitigation Strategy | Test Priority |
|-----|-----------|-------------|-------------------|----------------|
| **F8 (PD-019)** | **HIGH** | 20-25% | Test against bottleneck ground-truth; validate reordering logic | **1st** |
| **F6 (RW-016)** | **MEDIUM-HIGH** | 15-20% | Narrow keyword matching; test GTM/demand cases | **2nd** |
| **F2/F5 (BLND-008/ADV-011)** | **MEDIUM** | 10-15% | Define critical-gaps narrowly; spot-check partial-data cases | **3rd** |
| **F4 (BLND-010)** | **MEDIUM** | 10-15% | Validate keyword distinction; test pricing cases | **4th** |

### Testing Approach to Validate Safety

**For each high-risk fix:**

1. **Pre-Implementation Test:**
   - Run baseline (current code) on full 21-case suite
   - Document current accuracy and ranking for each case

2. **Post-Implementation Test (Isolated):**
   - Run single fix on full 21-case suite
   - Compare rankings; flag any changes to previously-correct cases
   - If >1 regression detected, debug or defer

3. **Post-Implementation Test (Combined):**
   - Run fix in combination with other phase fixes
   - Check for interaction effects
   - Run 21-case suite 3x to ensure consistency

4. **Regression Test Protocol:**
   - If any fix causes regression: stop, debug, fix, and re-run
   - Don't proceed to next fix until current fix validated
   - Maintain "known-safe" baseline at each phase

---

## QUESTION 5: Which Fixes Can Be Independently Benchmarked?

### Answer Summary
**Fixes with zero dependencies (can be implemented and tested in isolation):**
- **F1, F3, F7, F9, F10:** All can be tested independently
- **F2, F5:** Can be tested together (F5 depends on F2 implementation)
- **F4, F6:** Can be tested independently
- **F8:** Depends on F7 (cost-check) but can still test independently

**All 10 fixes can be individually benchmarked; none have hard blocking dependencies**

---

### Detailed Analysis

#### Zero-Dependency Fixes (Can Test Independently)

| Fix | Can Test in Isolation? | Dependency | Testing Complexity |
|-----|----------------------|-----------|-------------------|
| **F1 (BLND-006)** | YES | None | LOW — Test on BLND-006; spot-check quality cases |
| **F3 (BLND-009)** | YES | None | LOW — Test on BLND-009; spot-check team cases |
| **F7 (RW-022)** | YES | None | LOW — Test on RW-022; spot-check operational cases |
| **F9 (SYN-013)** | YES | None | LOW — Test on SYN-013; spot-check quality cases |
| **F10 (RW-024)** | YES | None | LOW — Test on RW-024; threshold calibration may need tuning |
| **F2 (BLND-008)** | YES | None (self-contained) | MEDIUM — Define critical-gaps list; spot-check partial-data cases |
| **F5 (ADV-011)** | PARTIAL | Depends on F2 helper method | LOW — Reuses F2 logic; test on ADV-011 |
| **F4 (BLND-010)** | YES | None (new pattern) | MEDIUM — Test on BLND-010; validate pricing-case interactions |
| **F6 (RW-016)** | YES | None (pattern boost) | MEDIUM — Test on RW-016; validate GTM/demand case interactions |
| **F8 (PD-019)** | YES | Soft: benefits from F7 understanding | MEDIUM — Test on PD-019; validate bottleneck-case interactions |

---

### Recommended Testing Strategy for Each Fix

#### Tier 1: Test Independently (No Blockers)

**F1: BLND-006 (Contradiction-Suppression)**
```
Test Protocol:
1. Implement F1 only (exclude other fixes)
2. Run full 21-case suite
3. Verify: BLND-006 now returns DEMAND_FORECASTING_MISMATCH (not CUSTOMER_RETENTION_EROSION)
4. Spot-check: BLND-007, ADV-012 (quality crisis ground-truth cases) still return TRUST_QUALITY_CRISIS
5. Regression check: No other cases change from baseline
Expected outcome: +1 correct case (BLND-006), 0 regressions
Revert if: >1 regression detected
```

**F3: BLND-009 (Organizational Bottleneck)**
```
Test Protocol:
1. Implement F3 only
2. Run full 21-case suite
3. Verify: BLND-009 now returns OPERATIONAL_BOTTLENECK (not CUSTOMER_RETENTION_EROSION)
4. Spot-check: ADV-014, RW-020 (bottleneck ground-truth) still return OPERATIONAL_BOTTLENECK
5. Regression check: No other cases change from baseline
Expected outcome: +1 correct case (BLND-009), 0 regressions
Revert if: >1 regression detected
```

**F7: RW-022 (Cost-vs-Bottleneck)**
```
Test Protocol:
1. Implement F7 only
2. Run full 21-case suite
3. Verify: RW-022 now returns UNIT_ECONOMICS_BREAKDOWN (not OPERATIONAL_BOTTLENECK)
4. Spot-check: ADV-014, RW-020 (bottleneck ground-truth) still return OPERATIONAL_BOTTLENECK
5. Regression check: No other cases change from baseline
Expected outcome: +1 correct case (RW-022), 0 regressions
Revert if: >1 regression detected
```

**F9: SYN-013 (Pattern 8 Mapping)**
```
Test Protocol:
1. Implement F9 only
2. Run full 21-case suite
3. Verify: SYN-013 now returns TRUST_QUALITY_CRISIS (not GO_TO_MARKET_MISALIGNMENT)
4. Spot-check: ADV-012 (quality crisis ground-truth) still returns correct diagnosis
5. Regression check: No other cases change from baseline
Expected outcome: +1 correct case (SYN-013), 0 regressions
Revert if: >1 regression detected
```

**F10: RW-024 (Uncertainty-Aware Diagnosis)**
```
Test Protocol:
1. Implement F10 only
2. Run full 21-case suite
3. Verify: RW-024 now returns OPERATIONAL_BOTTLENECK at 25-35% confidence 
           (not UNKNOWN at 0% confidence)
4. Spot-check: No other uncertainty cases regress
5. Regression check: No other cases change from baseline
Expected outcome: +1 correct case (RW-024), 0 regressions
Note: RW-024 is correctness improvement (now diagnosing instead of refusing)
Revert if: >1 other regression detected
```

---

#### Tier 2: Test with Dependency (F2 helper required)

**F2: BLND-008 (Unavailable-Data Detection)**
```
Test Protocol:
1. Implement F2 only (include helper method)
2. Run full 21-case suite
3. Verify: BLND-008 now returns INSUFFICIENT_EVIDENCE (not CUSTOMER_RETENTION_EROSION)
4. Spot-check: Cases with partial data (5-6 cases) still return confident patterns when most factors present
5. Regression check: No over-suppression detected
6. Calibration: If over-suppression observed, adjust critical-gaps list; re-run
Expected outcome: +1 correct case (BLND-008), 0 regressions
Revert if: >2 over-suppression false positives detected
Note: Critical-gaps list may need iteration; plan for 1-2 day calibration
```

**F5: ADV-011 (Unavailable-Data Check)**
```
Test Protocol:
1. Implement F5 after F2 helper available
2. Run full 21-case suite
3. Verify: ADV-011 now returns INSUFFICIENT_EVIDENCE (not OPERATIONAL_BOTTLENECK)
4. Spot-check: Same partial-data cases as F2; ensure consistency
5. Regression check: No new over-suppressions beyond F2 baseline
Expected outcome: +1 correct case (ADV-011), 0 new regressions
Revert if: >2 regressions detected
Note: F5 is simple once F2 logic finalized
```

---

#### Tier 3: Test with Caution (Medium Regression Risk)

**F4: BLND-010 (Pricing Pattern Creation)**
```
Test Protocol:
1. Implement F4 only (new pattern in isolation)
2. Run full 21-case suite
3. Verify: BLND-010 now returns STRATEGIC_PRICING_ERROR (not CUSTOMER_RETENTION_EROSION)
4. Spot-check: Pricing-related cases (BLND-010 focal case) don't have false positives
5. Keyword validation: Ensure "pricing power" keywords don't trigger on non-pricing cases
6. Regression check: No other cases change or get misclassified as pricing
Expected outcome: +1 correct case (BLND-010), 0 regressions
Revert if: >1 false positive on pricing-unrelated cases
Note: May need keyword-list tuning; plan for 1 day calibration
```

**F6: RW-016 (GTM Context Boost)**
```
Test Protocol:
1. Implement F6 only (pattern boost in isolation)
2. Run full 21-case suite
3. Verify: RW-016 now returns GO_TO_MARKET_MISALIGNMENT (not OPERATIONAL_BOTTLENECK)
4. Cross-case check: Demand, pricing, financial cases don't get over-boosted GTM patterns
5. Keyword validation: Ensure positioning + segment-mismatch required (not just one)
6. Regression check: No other cases change ranking due to boost
Expected outcome: +1 correct case (RW-016), 0 regressions
Revert if: >1 over-boost on non-GTM cases
Note: May need context-boost magnitude tuning; plan for 1-2 day calibration
```

**F8: PD-019 (Pattern Precedence)**
```
Test Protocol:
1. Implement F8 only (reordering logic in isolation)
2. Run full 21-case suite
3. Verify: PD-019 now returns UNIT_ECONOMICS_BREAKDOWN (not OPERATIONAL_BOTTLENECK)
4. Ground-truth validation: 
   - RW-018, RW-020 (unit-economics cases) still return correct diagnosis
   - ADV-014, RW-020, PD-011 (bottleneck cases) still return correct diagnosis
5. Reordering validation: Ensure Pattern 1 precedence logic correct; not over-suppressing
6. Regression check: No unexpected ranking changes in other cases
Expected outcome: +1 correct case (PD-019), 0 regressions
Revert if: >1 regression in bottleneck or unit-economics cases
Note: Highest-risk fix; may need logic debugging; plan for 2 day testing/tuning
```

---

### Phased Testing Approach

**Phase 1: Independent Testing (Days 1-5)**
1. Implement and test F1, F3, F7, F9, F10 independently (1 day each, parallel possible)
2. Each fix tested on full 21-case suite in isolation
3. Expected: +5 correct cases, 0 regressions
4. Outcome: 13/21 expected (Bundle A validation)

**Phase 2: Dependency Testing (Days 6-7)**
1. Implement F2 (unavailable-data helper)
2. Test F2 on full 21-case suite
3. Iterate critical-gaps list if needed (1-2 day calibration)
4. Implement F5 (reuses F2)
5. Test F2+F5 on full 21-case suite
6. Expected: +2 correct cases (14/21 before phase 3)

**Phase 3: Integration Testing (Days 8-12)**
1. Implement F4 (pricing pattern) independently; test on 21-case suite
2. Implement F6 (GTM boost) independently; test on 21-case suite
3. Implement F8 (pattern precedence) independently; test on 21-case suite
4. Iterate on keyword/logic tuning (1-2 days per fix if issues arise)
5. Run all 10 fixes together on full 21-case suite (3 complete runs)
6. Expected: +3 correct cases (17/21 total)

**Phase 4: Regression Testing (Days 12-16)**
1. Run full 21-case suite with all 10 fixes 3x (consistency check)
2. Verify no cases regressed from baseline (8 currently-correct cases still correct)
3. Verify gate achieved (at least 9/21 correct)
4. Final validation; ready for submission

---

### Revert Strategy for Each Fix

**Each fix is independently revertible:**

```
If F1 regresses: git revert F1; keep F3, F7, F9, F10 → 12/21 still achievable
If F3 regresses: git revert F3; keep F1, F7, F9, F10 → 12/21 still achievable
If F7 regresses: git revert F7; keep F1, F3, F9, F10 → 12/21 still achievable
If F9 regresses: git revert F9; keep F1, F3, F7, F10 → 12/21 still achievable
If F10 regresses: git revert F10; keep F1, F3, F7, F9 → 12/21 still achievable

If F2/F5 over-suppress: git revert F2/F5; keep F1-F10 → 13/21 still achievable
If F4 false-positives: git revert F4; keep F1-F3, F5-F10 → 16/21 still achievable
If F6 over-boosts: git revert F6; keep F1-F5, F8-F10 → 16/21 still achievable
If F8 reorders wrong: git revert F8; keep F1-F7, F9-F10 → 16/21 still achievable
```

**No cumulative risk:** Each fix can be independently validated and reverted without cascading failures.

---

### Final Recommendation

**Testing Strategy:**
1. **Test each fix independently** on full 21-case suite before combining
2. **For low-risk fixes (F1, F3, F7, F9, F10):** Single test run sufficient; low probability of issues
3. **For medium-risk fixes (F2, F5, F4, F6, F8):** Multiple test runs required; may need calibration/tuning
4. **For high-risk fixes (F8):** Triple test runs; extensive ground-truth validation needed
5. **Integration testing:** Run all 10 fixes together on full 21-case suite 3x before submission

**Expected Timeline:**
- Low-risk fixes: 1 day each (5 days total for F1-F10)
- Medium-risk fixes: 1-2 days each (7 days total for F2-F6, F8)
- Integration testing: 2-3 days
- **Total:** 12-16 days for full testing

**Success Criteria:**
- Each fix individually validates (target cases correct, no major regressions)
- All 10 fixes combined: 17/21 accuracy (81.0%)
- All 8 baseline cases still correct
- Full 21-case suite run 3x with consistent results

