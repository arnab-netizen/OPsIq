# IMPLEMENTATION PRIORITIZATION MATRIX
## Stage A EvidenceSynthesisEngine: ROI-Based Ranking of 10 Fixes

**Analysis Date:** 2026-06-17  
**Prioritization Metric:** ROI = Expected Gain ÷ Implementation Risk  
**Implementation Risk = (Complexity + Regression Risk) / 2**

---

## ROI CALCULATION METHODOLOGY

**Expected Gain:** Number of failing cases fixed by this implementation (typically +1 case per fix, except dependent fixes)

**Complexity Weighting:**
- LOW = 1 point
- MEDIUM = 2 points
- HIGH = 3 points

**Regression Risk Weighting:**
- LOW = 1 point
- MEDIUM = 2 points
- HIGH = 3 points

**Implementation Risk = (Complexity + Regression Risk) / 2**

**ROI Score = Expected Gain / Implementation Risk**

Higher ROI = faster return on investment; priority for implementation.

---

## PRIORITIZATION TABLE: RANKED BY ROI

| Rank | Fix ID | Expected Gain | Complexity | Regression Risk | Implementation Risk | ROI Score | Recommended? | Notes |
|------|--------|---------------|-----------|-----------------|-------------------|-----------|--------------|-------|
| **1** | **F1: BLND-006** | +1 | LOW (1) | LOW (1) | 1.0 | **4.00** | **YES** | Contradiction-suppression: lowest-risk pattern fix; well-scoped guard clause |
| **2** | **F3: BLND-009** | +1 | LOW (1) | LOW (1) | 1.0 | **4.00** | **YES** | Organizational bottleneck: pattern strength boost; minimal side effects |
| **3** | **F7: RW-022** | +1 | LOW (1) | LOW (1) | 1.0 | **4.00** | **YES** | Cost-vs-bottleneck: narrow guard clause; validates cost signals first |
| **4** | **F9: SYN-013** | +1 | LOW (1) | LOW (1) | 1.0 | **4.00** | **YES** | Pattern 8 mapping: extends existing logic; low side-effect risk |
| **5** | **F10: RW-024** | +1 | LOW (1) | LOW (1) | 1.0 | **4.00** | **YES** | Uncertainty-aware diagnosis: threshold calibration; doesn't suppress |
| **6** | **F2: BLND-008** | +1 | LOW (1) | MEDIUM (2) | 1.5 | **0.67** | **YES** | Unavailable-data detection: must define critical-gaps list carefully |
| **7** | **F5: ADV-011** | +1 | LOW (1) | MEDIUM (2) | 1.5 | **0.67** | **YES** | Unavailable-data check: reuses F2 logic; same regression risk |
| **8** | **F4: BLND-010** | +1 | MEDIUM (2) | MEDIUM (2) | 2.0 | **0.50** | **YES** | Pricing pattern creation: new pattern; requires testing vs pricing cases |
| **9** | **F6: RW-016** | +1 | MEDIUM (2) | MEDIUM (2) | 2.0 | **0.50** | **YES** | GTM context boost: interacts with other diagnoses; cross-case testing needed |
| **10** | **F8: PD-019** | +1 | MEDIUM (2) | MEDIUM (2) | 2.0 | **0.50** | **YES** | Pattern precedence: changes logic order; testing for reordering side effects needed |

---

## INTERPRETATION

### ROI > 3.0 (HIGHEST PRIORITY)
**Fixes F1, F3, F7, F9, F10** — Expected Gain / Risk ≥ 4.0

- Each fix gains +1 correct case
- Each costs LOW-to-LOW implementation effort and regression risk
- Effort: ~100 LOC total
- Time: 3-4 days
- Probability of success: >85%
- **Recommendation:** Implement all 5 first; nearly zero risk of gate-blocking regressions

### ROI 0.50–0.75 (MEDIUM PRIORITY)
**Fixes F2, F5, F4, F6, F8** — Expected Gain / Risk 0.50–0.67

- Each fix gains +1 correct case
- Each costs MEDIUM implementation effort or MEDIUM regression risk
- Effort: ~120 LOC total
- Time: 4-5 days (includes regression testing)
- Probability of success: >75% with focused testing
- **Recommendation:** Implement after Phase 1; stagger or batch by risk level

---

## PRIORITIZATION BUNDLES

### BUNDLE A: Minimum Viable (Gate Achievement Focus)
**Goal:** Reach 9/21 minimum with highest confidence

**Fixes:** F1, F3, F7, F9, F10 (all ROI 4.0)

**Expected Outcome:**
- New Accuracy: 13/21 (61.9%)
- Gate Achievement: YES (+4 above 9/21)
- Effort: ~100 LOC, 3-4 days
- Risk: LOW (all LOW-complexity, LOW-regression-risk fixes)
- Success Probability: >90%

**Implementation Order:**
1. F1 (BLND-006): 20 LOC, 1 day
2. F3 (BLND-009): 15 LOC, 1 day
3. F7 (RW-022): 20 LOC, 1 day
4. F9 (SYN-013): 20 LOC, 1 day
5. F10 (RW-024): 25 LOC, 1 day

**Testing:** Each fix tested individually against its target case + spot-check 2-3 related cases

---

### BUNDLE B: Data Validation (Add Confidence)
**Goal:** Add unavailable-data detection for stronger safety net

**Fixes:** F2, F5 (unavailable-data detection, ROI 0.67)

**Expected Outcome (cumulative with Bundle A):**
- New Accuracy: 15/21 (71.4%)
- Gate Achievement: YES (+6 above 9/21, strong margin)
- Effort: +35 LOC, +2-3 days
- Risk: MEDIUM (must calibrate critical-gaps list)
- Success Probability: >80%

**Implementation Order:**
6. F2 (BLND-008): 30 LOC, 1-2 days
   - Define critical-gaps list (offer structure, forecast, NRR durability, cohort data, win-loss)
   - Test against BLND-008, spot-check other cases for over-suppression
7. F5 (ADV-011): 5 LOC, <1 day
   - Reuse F2 logic
   - Test against ADV-011

**Testing:** Focus on false-positive prevention (ensure patterns still created when data is partial but sufficient)

---

### BUNDLE C: Pattern Enhancements (Maximize Accuracy)
**Goal:** Add advanced pattern logic for best possible accuracy

**Fixes:** F4, F6, F8 (pattern creation/precedence/boosting, ROI 0.50)

**Expected Outcome (cumulative with Bundles A+B):**
- New Accuracy: 17/21 (81.0%)
- Gate Achievement: YES (+8 above 9/21, excellent margin)
- Effort: +85 LOC, +4-5 days
- Risk: MEDIUM (pattern reordering, context boosting can interact)
- Success Probability: >75%

**Implementation Order:**
8. F4 (BLND-010): 30 LOC, 1-2 days
   - Create Pattern 9 for pricing opportunities
   - Test vs BLND-010 + pricing-related cases (ensure no false positives on pricing failures)
9. F6 (RW-016): 25 LOC, 1-2 days
   - Add context boost for positioning-market-fit gaps
   - Test vs RW-016 + GTM/demand/pricing cases (ensure boosts don't compound)
10. F8 (PD-019): 30 LOC, 1-2 days
    - Implement pattern precedence (Pattern 1 before Pattern 4)
    - Test vs PD-019 + UNIT_ECONOMICS_BREAKDOWN and OPERATIONAL_BOTTLENECK ground-truth cases

**Testing:** Comprehensive regression testing across all 21 cases before final submission

---

## DEPENDENCY ANALYSIS

### Zero Dependencies (Can Be Implemented Independently)
- F1, F3, F7, F9, F10 — Each is isolated to one pattern or dimension check
- F2, F5 — Both use same unavailable-data detection logic; implement F2 first, then F5

### Soft Dependencies (Can Be Tested Independently but Context Helps)
- F4 (pricing pattern) — Independent but benefits from understanding F2 (data validation)
- F6 (GTM boost) — Independent but benefits from understanding F1, F3 (contradiction and bottleneck detection)
- F8 (pattern precedence) — Independent but benefits from understanding F7 (cost signals)

### Recommended Implementation Order (No Blocking Dependencies)
1. **Phase 1 (Days 1-4):** F1 → F3 → F7 → F9 → F10 (in parallel or sequential)
2. **Phase 2 (Days 5-7):** F2 → F5 (sequential; F5 depends on F2 helper)
3. **Phase 3 (Days 8-12):** F4 → F6 → F8 (in parallel after Phase 2 complete)

---

## EFFORT ESTIMATION AND TIMELINE

### Bundle A: Quick Wins
- **Total LOC:** ~100
- **Days:** 3-4
- **Person-Days:** 4-5
- **Testing:** 1 day (isolated case testing)
- **Total Timeline:** 4-5 days
- **Parallel Potential:** Can implement all 5 in parallel (independent); test sequentially

### Bundle B: Data Validation
- **Total LOC:** ~35 (additional)
- **Days:** 2-3
- **Person-Days:** 3-4
- **Testing:** 1 day (false-positive prevention)
- **Total Timeline:** 3-4 days (add to Bundle A)

### Bundle C: Pattern Enhancements
- **Total LOC:** ~85 (additional)
- **Days:** 4-5
- **Person-Days:** 5-7
- **Testing:** 2-3 days (comprehensive regression testing)
- **Total Timeline:** 6-8 days (add to Bundles A+B)

### Full Implementation (All 10 Fixes)
- **Total LOC:** ~220
- **Days:** 9-12
- **Person-Days:** 12-16
- **Testing:** 3-4 days (full 21-case regression suite)
- **Total Timeline:** 12-16 days (2-3 weeks)

---

## RISK ASSESSMENT BY BUNDLE

### Bundle A Risk Profile
**Risk Level:** LOW

| Risk Factor | Impact | Probability | Mitigation |
|------------|--------|-------------|-----------|
| Contradiction-suppression too aggressive | Could suppress valid quality patterns | 10% | Test against TRUST_QUALITY_CRISIS ground-truth cases |
| Organizational bottleneck detection over-triggers | Could boost unrelated team patterns | 5% | Spot-check other team-related cases |
| Cost detection prevents valid bottleneck diagnosis | Could suppress operational cases | 10% | Test against OPERATIONAL_BOTTLENECK ground-truth cases |
| Pattern 8 mapping creates false quality patterns | Could incorrectly diagnose quality issues | 5% | Spot-check retention and financial cases |
| Uncertainty diagnosis too permissive | Could diagnose when should be UNKNOWN | 10% | Calibrate confidence threshold (25-35%) |

**Overall Bundle A Risk:** <15% chance of any regression affecting gate achievement

---

### Bundle B Risk Profile
**Risk Level:** MEDIUM

| Risk Factor | Impact | Probability | Mitigation |
|------------|--------|-------------|-----------|
| Critical-gaps definition too broad | Over-suppression of patterns; many INSUFFICIENT_EVIDENCE | 20% | Define gaps conservatively (only explicit unavailableData fields) |
| Critical-gaps definition too narrow | Miss cases that should return INSUFFICIENT_EVIDENCE | 15% | Review against BLND-008, ADV-011 evidence to validate list |
| Over-suppression affects other cases | Other cases incorrectly suppressed | 15% | Spot-check 5-6 cases with partial data (ensure patterns still created) |

**Overall Bundle B Risk:** 20-25% chance of over-suppression requiring calibration; <10% chance of gate-blocking regression

---

### Bundle C Risk Profile
**Risk Level:** MEDIUM-HIGH

| Risk Factor | Impact | Probability | Mitigation |
|------------|--------|-------------|-----------|
| Pricing pattern creates false positives | Could incorrectly diagnose pricing in non-pricing cases | 20% | Test vs pricing-related failures and successes; limit to specific keyword patterns |
| GTM context boost interacts with other diagnoses | Could over-boost GTM in demand/financial cases | 25% | Test cross-case consistency; ensure boost only applies to positioning-market-fit gap |
| Pattern precedence reorders diagnoses unexpectedly | Could change ranking in unintended cases | 25% | Test vs both UNIT_ECONOMICS_BREAKDOWN and OPERATIONAL_BOTTLENECK ground-truth cases; validate both before and after |

**Overall Bundle C Risk:** 20-25% chance of unintended interaction; requires comprehensive regression testing; <15% chance of gate-blocking regression

---

## DECISION RECOMMENDATIONS

### For Quick Gate Achievement
**Choose Bundle A + Bundle B (Phase 1-2)**
- **Expected Accuracy:** 15/21 (71.4%)
- **Gate Achievement:** YES (marginal +6)
- **Effort:** 5-7 days
- **Risk:** LOW-MEDIUM
- **Recommendation:** If timeline tight or risk-averse, this is sufficient

### For Strong Gate Margin (RECOMMENDED)
**Choose Bundles A + B + C (All 10 Fixes)**
- **Expected Accuracy:** 17/21 (81.0%)
- **Gate Achievement:** YES (strong +8)
- **Effort:** 12-16 days (2-3 weeks)
- **Risk:** MEDIUM (manageable with focused testing)
- **Recommendation:** Optimal balance of accuracy and effort; sustainable foundation

### For Maximum Accuracy
**Choose All 10 Fixes + Full Regression Suite**
- **Expected Accuracy:** 18/21 (85.7%)
- **Gate Achievement:** YES (excellent +9)
- **Effort:** 16-20 days (3 weeks + 1-2 week testing)
- **Risk:** MEDIUM (all regressions mitigated)
- **Recommendation:** If timeline permits and long-term stability prioritized

---

## FINAL PRIORITIZATION SUMMARY

| Phase | Fixes | Expected Gain | Cumulative Accuracy | Effort | Timeline | Risk | Go/No-Go |
|-------|-------|--------------|-------------------|--------|----------|------|----------|
| **Phase 1: Quick Wins** | F1, F3, F7, F9, F10 | +5 cases | 13/21 (61.9%) | 100 LOC, 4-5 days | 4-5 days | LOW | **GO** |
| **Phase 2: Data Validation** | F2, F5 | +2 cases | 15/21 (71.4%) | 35 LOC, 3-4 days | 3-4 days | MEDIUM | **GO** |
| **Phase 3: Pattern Enhancement** | F4, F6, F8 | +2 cases | 17/21 (81.0%) | 85 LOC, 6-8 days | 6-8 days | MEDIUM | **GO** (if time permits) |

**Minimum viable path:** Phase 1 (4-5 days, 13/21 accuracy, gate achieved)  
**Recommended path:** Phases 1-2 (7-9 days, 15/21 accuracy, gate achieved with margin)  
**Optimal path:** Phases 1-3 (12-16 days, 17/21 accuracy, strong gate margin)

**Authorization:** All three bundles are low-to-medium risk and recommended for pursuit based on timeline constraints.

