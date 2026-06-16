# Remediation Plan Hostile Audit — Findings and Required Corrections

**Date:** 2026-06-16  
**Status:** AUDIT_COMPLETE_CORRECTIONS_REQUIRED  
**Branch:** claude/consultant-engine-remediation-plan

---

## AUDIT SUMMARY

Comprehensive hostile audit of the remediation plan identified **3 critical issues** and **5 medium-risk components** requiring corrections before implementation.

---

## CRITICAL FINDING #1: Case-Library Retrieval Leakage (Slice 4)

### Issue
The plan proposes:
1. Extract patterns from 50 Round 1 cases → {problem_class, diagnosis_type, first_action}
2. During Round 1 scoring, retrieve and use these patterns
3. Result: Round 1 cases score themselves using their own answers (circular reasoning)

**Evidence:** RW-001 extraction: first_action="Launch loyalty program"
- Later, when scoring RW-001, retrieval finds match (similarity 1.0)
- Engine claims the pattern is proven because Round 1 found it
- This is answer leakage, not generalization

### Current Mitigation in Plan
"Track similarity >0.85, flag potential overfitting"
- **Problem:** Reactive (detects after memorization occurs)
- **Problem:** No action taken when flag triggers

### Required Correction

**Option 1 (Recommended):** Defer Slice 4 to Round 2
- Do NOT extract patterns from Round 1 during Round 1 implementation
- During Round 1, use generic templates only (not case-library)
- After Round 2 proves generalization: extract patterns from validated Round 1 cases

**Implementation:**
- Slice 1, 2, 3: Proceed as planned
- Slice 4: Implement generic intervention templates for Round 1
- Slice 4 full: Switch to case-library retrieval only AFTER Round 2 validation
- This prevents answer leakage and allows Round 2 to validate generalization

**Option 2 (Not Recommended):** Add preventive deduplication
- Before retrieval: verify case is not in training set
- Block Round 1 cases from retrieving their own answers
- Problem: Still doesn't prove generalization; just prevents obvious leakage

**Status:** MUST CHOOSE AND IMPLEMENT BEFORE EXECUTION

---

## CRITICAL FINDING #2: Stacked Score Lift Forecasts

### Issue
Plan claims: "5.21 → 8.0-8.5/10" by combining 5 slices

Individual forecasts:
- Slice 1: +0.9-1.1 → 6.1-6.3
- Slice 2: +0.5 → 6.6-7.3
- Slice 3: +0.4-0.6 → 7.0-7.6
- Slice 4: +0.6-0.8 → 7.6-8.4
- Slice 5: +0 (safety only)

**Problems:**
1. **Stacking assumption:** Assumes each improvement is independent (rarely true)
2. **Variance compounding:** Each ±0.1 estimate → ±0.4 compounded error
3. **Presentation:** Executive summary shows "8.0-8.5/10" with checkmark, implying confidence
4. **No Round 2 requirement:** Claims consultant-grade without proving generalization

### Round 1 Evidence
- No Round 1 validation of any of these improvements
- All forecasts are estimates based on problem analysis
- No measurement, only analysis

### Required Correction

1. **Update language in all documents:**
   - Change: "Expected improvement: 5.21 → 8.0-8.5/10" ✅
   - Change to: "Forecast improvement (REQUIRES VALIDATION): 5.21 → 8.0-8.5/10"
   - Rationale: Mark as forecast, not commitment

2. **Define Phase 1 targets (Round 1 revalidation):**
   - Maintain 5.21/10 baseline (no regression)
   - Specific cases improve: RW-001 (7.5+), RW-006 (7.0+), PD (6.5+)
   - Safety maintained: 0 dangerous, <2% hallucination
   - Success ≠ 8.5/10 threshold; ≠ consultant-grade yet

3. **Define Phase 2 gates (Round 2 MANDATORY):**
   - Implement slices 1-3 on Round 1
   - Revalidate all 50 Round 1 cases (must not regress)
   - Then run Slice 4 on 50+ fresh Round 2 cases
   - Only claim consultant-grade IF Round 2: ≥80% at ≥8.5/10

4. **Update decision criteria:**
   - Remove: "80% pass rate at ≥8.5/10 (consultant-grade ✓)"
   - Add: "Phase 1 targets: maintain baseline, improve targeted cases"
   - Add: "Phase 2 requirement: 50+ fresh Round 2 cases must prove ≥80%@≥8.5 for consultant-grade claim"

**Status:** REQUIRES DOCUMENT UPDATES (Executive summary partially done)

---

## CRITICAL FINDING #3: Numeric Calculation Validation Rules Undefined

### Issue
Plan says: "Return INSUFFICIENT_EVIDENCE if critical inputs missing (no hallucination)"

But "critical" is undefined. Examples:
- CAC = cost / customers → both required? Or just cost?
- Runway = cash / burn → both required? Or assume stable burn?
- Unit margin = revenue/unit - cost/unit → both required?

**Round 1 Evidence:** Many cases have estimated/partial financial data
- PD-001: "CAC~$50 (estimated from survey)"
- PD-003: "Runway ~6 months (projected)"

**Risk:** Without explicit validation, engine might:
- Claim HIGH confidence in calculations from partial inputs
- Hallucinate missing values ("assume 0" for missing costs)
- Inflate confidence when calculating break-even with guessed burn rate

### Required Correction

**Add to Slice 3 (Numeric Layer) specification:**

```
NUMERIC_CALCULATION_VALIDATION_RULES:

Formula: Break-even = Fixed Costs / Contribution Margin
  - Input: fixed_costs (REQUIRED)
  - Input: contribution_margin (REQUIRED - calculate from revenue_per_unit - cost_per_unit if not provided)
  - Missing: If both missing → INSUFFICIENT_EVIDENCE
  - Missing: If only one → INSUFFICIENT_EVIDENCE
  - Output: Break-even units
  - Confidence: HIGH if both inputs HIGH-confidence; MODERATE if one estimated

Formula: CAC Payback = Customer Acquisition Cost / Monthly Margin
  - Input: acquisition_cost (REQUIRED)
  - Input: monthly_margin (REQUIRED)
  - Missing: If either missing → INSUFFICIENT_EVIDENCE
  - Missing: If based on estimate/projection → Confidence PROVISIONAL (not HIGH)
  - Output: Payback months
  - Hallucination guard: Never assume 0 for missing inputs

Formula: Runway = Cash Available / Monthly Burn Rate
  - Input: cash_on_hand (REQUIRED, must be recent)
  - Input: monthly_burn (REQUIRED, must have ≥2 months history to calculate trend)
  - Missing: If no burn history → INSUFFICIENT_EVIDENCE
  - Output: Months remaining
  - Confidence: MODERATE if burn is stable; PROVISIONAL if high variance

Formula: Unit Margin = Revenue per Unit - Cost per Unit
  - Input: revenue_per_unit (REQUIRED)
  - Input: cost_per_unit (REQUIRED)
  - Missing: If either missing → INSUFFICIENT_EVIDENCE
  - Output: Margin per unit
  - Hallucination guard: Do NOT assume standard margins

Unit Test Coverage Required:
  ✓ All missing-input paths return INSUFFICIENT_EVIDENCE (not hallucinate)
  ✓ Estimated/projected inputs trigger PROVISIONAL confidence (not HIGH)
  ✓ No default values assumed for missing inputs
  ✓ Confidence matches input quality (HIGH inputs → HIGH output, ESTIMATE inputs → PROVISIONAL output)
```

**Status:** MUST ADD TO EXECUTION FILE BEFORE CODING

---

## MEDIUM-RISK FINDING #1: Archetype Confidence Inflation

### Issue
New archetypes (brand_perception, unit_economics, etc.) may produce HIGH confidence diagnoses with weak evidence.

Round 1 shows engine already struggles with confidence (avg 4.46-4.40 on weak dimensions).

Example risk: Route case to UNIT_ECONOMICS with MODERATE confidence (weak evidence)
- Later claim: "Unit economics is root cause" with HIGH confidence (confidence inflation)

### Required Correction
Add confidence gates per archetype to Slice 1 specification:

```
ARCHETYPE_CONFIDENCE_GATES:

Archetype: BRAND_PERCEPTION
  - MIN evidence required for HIGH: 2 customer_perception data points (NPS, review sentiment, churn pattern)
  - MIN evidence required for MODERATE: 1 customer_perception point + 1 market_position point
  - Below MODERATE threshold: Return INSUFFICIENT_EVIDENCE (not PROVISIONAL)
  - Default: PROVISIONAL (not HIGH, not MODERATE)

Archetype: UNIT_ECONOMICS
  - MIN evidence required for HIGH: 2 financial metrics (CAC + LTV + margin, any 2)
  - MIN evidence required for MODERATE: 1 financial metric + 1 growth_rate metric
  - Below MODERATE threshold: Return INSUFFICIENT_EVIDENCE
  - Default: PROVISIONAL

[Same pattern for DEMAND_FORECASTING, GO_TO_MARKET, STRATEGIC_PRICING]
```

**Status:** SHOULD ADD TO EXECUTION FILE

---

## MEDIUM-RISK FINDING #2: Case-Library Adaptation Algorithm Undefined

### Issue
Plan says: "Customize to business context (size, industry, constraints)"

But algorithm not specified. Example risks:
- Round 1 RW-001 solution: "Hire delivery drivers"
- Fresh case: Small cafe with no delivery
- Naive adaptation: "Hire cafe staff" (misses actual problem)

### Required Correction
Defer Slice 4 specifics to Round 2 (see Critical Finding #1)

---

## MEDIUM-RISK FINDING #3: Business Dimension Classifier Routing Errors

### Issue
Classifier routes cases to one dimension if multiple dimensions are critical.

Risk: Case has BOTH financial_health critical AND customer_retention critical
- Classifier picks financial → routes to UNIT_ECONOMICS
- Ignores retention evidence → wrong diagnosis

### Required Correction
Add test cases for multi-dimensional criticality in Slice 2 specification

---

## MEDIUM-RISK FINDING #4: Dimension Improvement Not Transferable

### Issue
Slices 1-3 improve Round 1 dimensions by +0.5-0.9.

Risk: Round 1 improvements don't transfer to Round 2.

Example: Dimension classifier learned Round 1 evidence structure (7 dimensions per case)
- Round 2 cases might have different evidence (5 dimensions, different fields)
- Classifier optimized for Round 1 structure → fails on Round 2 structure

### Required Correction
Require Round 2 validation before claiming ≥80% pass rate (see Critical Finding #2)

---

## MEDIUM-RISK FINDING #5: Safety Regression from Hallucination

### Issue
Current: <2% hallucination

Risk: Numeric layer assumes inputs (even if just 0 for missing cost) → hallucination spikes to 5%+

### Required Correction
Explicit validation rules (see Critical Finding #3) + unit tests + safety gate

---

## SUMMARY OF CORRECTIONS REQUIRED

| Finding | Severity | Fix Required | Action |
|---------|----------|---|---|
| Case-library leakage (Slice 4) | CRITICAL | Defer to Round 2 OR prevent self-retrieval | MUST FIX |
| Score lift stacking (all slices) | CRITICAL | Label as forecasts, require Round 2 validation | MUST FIX (partial done) |
| Numeric validation undefined | CRITICAL | Define per-formula rules, unit tests | MUST FIX |
| Confidence inflation (Slice 1) | MEDIUM | Add confidence gates per archetype | SHOULD FIX |
| Adaptation algorithm (Slice 4) | MEDIUM | Defer specifics to Round 2 | DEFERRED OK |
| Multi-dimensional routing (Slice 2) | MEDIUM | Add test cases | SHOULD FIX |
| Dimension transfer (Round 1→2) | MEDIUM | Require Round 2 validation | DEFERRED OK |
| Hallucination risk (Slice 3) | MEDIUM | Validation rules + tests | LINKED TO #3 |

---

## CONCLUSION: REMEDIATION_PLAN_AUDIT_PARTIAL_PASS

**Status:** Plan is strategically sound but operationally incomplete.

**What works:**
- Fixes clearly tied to Round 1 failure modes
- Architecture addresses diagnosis and dimension gaps
- Safety governance included

**What needs fixing:**
1. Remove answer leakage (Slice 4 on Round 1)
2. Explicit validation rules (Slice 3 numeric)
3. Confidence gates (Slice 1 archetypes)
4. Label forecasts as forecasts, require Round 2 for consultant-grade

**Recommendation:**
- Accept plan with corrections applied
- Update executive summary to require Round 2 (done)
- Update execution file with critical guards before coding
- Proceed to Slice 1-3 on Round 1 (low risk)
- Defer Slice 4 to Round 2 (prevents leakage)

**Safe to Proceed:** YES (with corrections above)

---

**Next Action:** User reviews audit findings, approves corrections, then converts plan to execution file.
