# Consultant Engine Remediation Execution Contract

**Date:** 2026-06-16  
**Status:** READY_FOR_IMPLEMENTATION_AUTHORIZATION  
**Branch:** claude/consultant-engine-remediation-plan  
**Basis:** Round 1 corrected average 5.21/10 + hostile audit + remediation plan

---

## 1. Current Proven Baseline

**Round 1 Manually Rescored (Locked-Answer-Key Review):**
- Average score: **5.21/10**
- Median score: **5.00/10**
- Pass rate: **0/50 cases** (threshold ≥8.5/10)
- Consultant-grade status: **FAIL**

**Failure Distribution:**
- DIAGNOSIS_COVERAGE_GAP: 10 cases (avg 6.03/10) — Cannot diagnose root cause
- DIMENSION_COVERAGE_GAP: 40 cases (avg 5.00/10) — Diagnose but weak interventions

**Safety Baseline:**
- Dangerous recommendations: **0** (no harmful outputs)
- Hallucination rate: **<2%** (minimal invented facts)
- False confidence: **<2%** (HIGH stated when evidence insufficient)
- Owner constraint violations: **4 cases flagged** (PD-001, PD-002, ADV-004, BLND-001)

**Dimension Performance (Round 1 corrected):**
| Dimension | Avg Score | Status |
|-----------|-----------|--------|
| root_cause_match | 4.46/10 | WEAK |
| first_priority_action | 4.40/10 | WEAK |
| business_relevance | 4.60/10 | WEAK |
| output_specificity | 5.50/10 | WEAK |
| recommendation_quality | 9.40/10 | STRONG |
| audit_trail_clarity | 6.00/10 | MODERATE |

**Critical Insight:** Engine excels at HOW (recommendation structure, audit trails, reasoning), but fails at WHAT (diagnosing root cause, selecting first-priority action). This is a diagnosis + specificity problem, not a form problem.

---

## 2. Non-Negotiable Rules

These rules are absolute. Violations halt the implementation.

### No Implementation Without Authorization
- User must explicitly authorize each slice before engineering starts.
- Build loop command: `/continue-consultant-remediation`
- Authorization covers ONLY the next authorized slice, not future slices.

### No Broad Rewrite
- Preserve existing diagnosis engine (OPERATIONAL_BOTTLENECK, QUALITY_CONTROL_FAILURE, CUSTOMER_RETENTION_EROSION).
- Preserve existing recommendation structure, audit trail, evidence trace.
- Add only evidence-backed new archetypes from Round 1 analysis.

### No LLM-First Implementation
- All new layers must be deterministic.
- No calling LLMs to "refine" diagnosis or recommendations.
- No statistical model fitting on Round 1 cases.
- No machine learning without explicit gate approval.

### No Slice 4 Retrieval on Round 1 Answer Keys
- CRITICAL: Do NOT extract patterns from Round 1 cases during Round 1 implementation.
- Rationale: Extracting from R1 → Retrieving from R1 = circular reasoning (answer leakage).
- **Slice 4 is DEFERRED to Round 2 (after fresh cases exist).**
- Implementation will use generic templates (not case-library) on Round 1.

### No Production-Readiness Claims
- This is a remediation of a diagnostic tool, not a deployed product.
- Do not claim "production-ready" or "go-live" status.
- Do not claim "sufficient for client deliverables" until Round 2 validates.

### No Consultant-Grade Claims Before Round 2
- Consultant-grade is ≥8.5/10 average on fresh, unbiased data.
- Round 1 (5.21/10) is diagnostic evidence, not proof of 8.0-8.5/10 after fixes.
- **Consultant-grade claim requires Round 2 fresh case validation: ≥80% at ≥8.5/10.**
- This is not a weakness; it's proof-of-concept discipline.

### No Benchmark Threshold Lowering
- Pass threshold remains ≥8.5/10 (no moving goalposts).
- Median target remains 5.21/10 minimum (no regression).
- Failed cases on Round 1 are not removed or re-scored to pass.

### No Replacing Failed Cases
- All 50 Round 1 cases kept, scored, and reported as-is.
- No cherry-picking "better" cases.
- No removing cases that fail after fixes applied.

### No Deleting Evidence
- All Round 1 artifacts preserved (frozen outputs, scoring records, failure tickets).
- No rewriting history.
- No modifying corrected scores post-implementation.

### No Auto-Learning Promotion
- No "learning loop" that auto-promotes patterns from Round 1 outputs.
- No recommendation weights auto-tuned from Round 1 scores.
- Pattern extraction deferred to Round 2 (with explicit human review).

### No Hidden Answer-Key Leakage
- No retrieval using hidden answer keys.
- No similarity search that would find Round 1 "correct" answers.
- No hardcoding case-specific recommendations based on answer keys.
- Leakage audit required before Slice 4.

### No Fixing by Memorization
- Engine cannot "learn" that RW-001 needs "launch loyalty program" by scoring RW-001.
- No case-library extraction until Round 2 validates that patterns generalize.
- Anti-memorization controls documented in audit addendum.

---

## 3. Build Loop Command

```
/continue-consultant-remediation
```

**Meaning:**
- Read this file (execution_consultant_engine_remediation.md)
- Identify the next incomplete slice (check status table below)
- Continue from the next authorized slice only
- Do not skip gates
- Do not implement beyond the current authorized slice
- Stop after the slice closeout

**Usage example:**
```
User: /continue-consultant-remediation

Agent behavior:
1. Read execution_consultant_engine_remediation.md
2. Check status table (section 13)
3. Locate next uncompleted slice (e.g., Slice 0: pending)
4. Execute Slice 0 pre-implementation verification
5. Output SLICE_0_CLOSEOUT
6. Stop (await next /continue or new authorization)
```

---

## 4. Slice 0 — Pre-Implementation Verification

**Purpose:** Confirm repo state, branch, evidence, and static gates before any coding.

**Timing:** Must run before any engineer touches code.

**Required checks:**

```
SLICE_0_VERIFICATION_CHECKLIST:

Repository State:
  ☐ Current branch: claude/consultant-engine-remediation-plan (NOT main)
  ☐ Working tree: clean (no uncommitted changes)
  ☐ HEAD commit: 5b0c630a or later (audit corrections applied)
  ☐ main branch: untouched (b2160771 or later, no merge of old feature branch)
  
Remediation Documentation:
  ☐ REMEDIATION_PLAN_EXECUTIVE_SUMMARY.md present
  ☐ REMEDIATION_ARCHITECTURE.md present
  ☐ REMEDIATION_PLAN.md present
  ☐ REMEDIATION_PLAN_HOSTILE_AUDIT_ADDENDUM.md present
  ☐ execution_consultant_engine_remediation.md present (this file)

Round 1 Evidence:
  ☐ ROUND_1_HOSTILE_AUDIT_FINAL_REPORT.md present
  ☐ simulation_runs/round_001/ROUND_1_RESCORING_CLOSEOUT.md present
  ☐ All 5 simulation case packs present:
      ☐ simulation_case_pack_real_world_v1.md (15 cases)
      ☐ simulation_case_pack_public_dataset_v1.md (10 cases)
      ☐ simulation_case_pack_synthetic_v1.md (10 cases)
      ☐ simulation_case_pack_adversarial_v1.md (10 cases)
      ☐ simulation_case_pack_blind_outcome_v1.md (5 cases)
  ☐ Corrected scoring records present: 50 × 10_scoring_record.json
  ☐ Failure tickets present: 50 × 11_failure_ticket.json

Current Consulting Engine State:
  ☐ 3 base archetypes intact:
      ☐ OPERATIONAL_BOTTLENECK
      ☐ QUALITY_CONTROL_FAILURE
      ☐ CUSTOMER_RETENTION_EROSION
  ☐ Evidence routing structure unchanged
  ☐ Recommendation engine present
  ☐ Safety checks present
  ☐ Audit trail generation present

Static Gates (Build+Test Only, No DB Required):
  ☐ npm ci → success
  ☐ npx prisma validate → success (schema valid)
  ☐ npx prisma generate → success (client generated)
  ☐ npx tsc --noEmit → success (exit 0, no TypeScript errors)
  ☐ npm run build → success (Next.js build complete)
  
User Authorization:
  ☐ User explicitly authorized Slice 0 verification
  ☐ User confirmed: "Proceed with Slice 1 only" (not all slices)
```

**Output:**

```
SLICE_0_CLOSEOUT:
  
  branch: claude/consultant-engine-remediation-plan
  commit: [current commit hash]
  working_tree_clean: [yes/no]
  
  remediation_docs_present: [yes/no - list any missing]
  round_1_evidence_present: [yes/no - list any missing]
  consulting_engine_intact: [yes/no - list any modifications]
  
  static_gates_passed:
    npm_ci: [PASS/FAIL]
    prisma_validate: [PASS/FAIL]
    prisma_generate: [PASS/FAIL]
    tsc_noEmit: [PASS/FAIL]
    npm_build: [PASS/FAIL]
  
  implementation_authorized: [yes/no - Slice 0 only, or next slice?]
  
  final_status:
    - SLICE_0_PASS_READY_FOR_SLICE_1_AUTHORIZATION ✓
    - SLICE_0_BLOCKED_WITH_EVIDENCE [reason]
```

**Stop after Slice 0.** Await user authorization for Slice 1.

---

## 5. Slice 1 — Diagnosis Archetype Expansion

**Purpose:** Add missing diagnostic coverage without broad rewrite. Unblock DIAGNOSIS_COVERAGE_GAP cases.

**Scope:** NARROW (only new archetypes from Round 1 analysis).

**Allowed Changes:**

```
FILES_ALLOWED_TO_CHANGE:
  src/domain/consulting-engine/types.ts
    - Add to DiagnosisType enum only:
      ☐ BRAND_PERCEPTION_TRUST_GAP
      ☐ UNIT_ECONOMICS_BREAKDOWN
      ☐ DEMAND_FORECASTING_CAPACITY_MISMATCH
      ☐ OVEREXPANSION_OPERATING_MODEL_BREAK
      ☐ PRICING_PACKAGING_MISALIGNMENT
  
  src/services/consulting-engine/diagnosis-engine.ts
    - Add ONE new RootCausePattern entry per archetype
    - Each entry includes:
      ☐ pattern() function (evidence matching rule)
      ☐ confidence() function (HIGH/MODERATE/PROVISIONAL/INSUFFICIENT)
      ☐ diagnosis() function (RootCause object)
    - DO NOT modify existing 3 patterns
    - DO NOT change pattern matching logic for existing archetypes
  
  src/__tests__/services/consulting-engine/diagnosis-engine.test.ts
    - Add unit tests for each new archetype
    - Add regression tests for existing archetypes
```

**Evidence Requirements Per Archetype:**

```
ARCHETYPE: BRAND_PERCEPTION_TRUST_GAP
  Evidence: Customer perception, market reputation, review sentiment
  Cases: RW-001 (Domino's), RW-003 (Starbucks)
  MIN for HIGH confidence: 2 customer_perception data points (NPS, reviews, churn pattern)
  MIN for MODERATE: 1 customer perception + market position data
  Below MODERATE: Return INSUFFICIENT_EVIDENCE (not PROVISIONAL)

ARCHETYPE: UNIT_ECONOMICS_BREAKDOWN
  Evidence: Financial metrics (CAC, LTV, margin, revenue per unit)
  Cases: RW-006 (Wet Seal), RW-012 (unit economics crisis)
  MIN for HIGH confidence: 2 financial metrics (CAC + LTV + margin, any 2)
  MIN for MODERATE: 1 financial + 1 growth metric
  Below MODERATE: Return INSUFFICIENT_EVIDENCE

ARCHETYPE: DEMAND_FORECASTING_CAPACITY_MISMATCH
  Evidence: Market demand signals, capacity constraints, growth rate
  Cases: RW-005 (Peloton), RW-009 (growth constraint)
  MIN for HIGH confidence: Growth rate + market position data + capacity evidence
  MIN for MODERATE: Growth rate + 1 demand signal
  Below MODERATE: Return INSUFFICIENT_EVIDENCE

ARCHETYPE: OVEREXPANSION_OPERATING_MODEL_BREAK
  Evidence: Expansion history, operating cost growth, margin deterioration
  Cases: RW-010, RW-011, RW-013, RW-014
  MIN for HIGH confidence: 2 of (expansion_history, cost_growth, margin_decline)
  MIN for MODERATE: 1 + operational_stress
  Below MODERATE: Return INSUFFICIENT_EVIDENCE

ARCHETYPE: PRICING_PACKAGING_MISALIGNMENT
  Evidence: Pricing strategy, customer acquisition cost, willingness to pay
  Cases: PD-001 through PD-005 (pricing/packaging public dataset cases)
  MIN for HIGH confidence: CAC + pricing + competitor positioning
  MIN for MODERATE: CAC + 1 pricing signal
  Below MODERATE: Return INSUFFICIENT_EVIDENCE
```

**Forbidden:**

```
FORBIDDEN_IN_SLICE_1:
  ☐ Hardcoding case IDs (e.g., if case_id == "RW-001" then BRAND_PERCEPTION)
  ☐ Hardcoding Round 1 answers (no "answer key lookup")
  ☐ Returning HIGH confidence without minimum evidence
  ☐ Weakening INSUFFICIENT_EVIDENCE behavior
  ☐ Breaking refusal to diagnose when evidence insufficient
  ☐ Modifying existing confidence logic for original 3 archetypes
  ☐ Using answer keys or scoring guides to bias diagnosis
  ☐ Removing any safe refusal gates
```

**Required Gates:**

```
SLICE_1_ACCEPTANCE_GATES:

Unit Tests:
  ☐ Each new archetype: ≥3 test cases (matching case from Round 1 + variation)
  ☐ Existing 3 archetypes: regression tests (no behavior change)
  ☐ Confidence thresholds: test cases for HIGH/MODERATE/PROVISIONAL/INSUFFICIENT
  ☐ test:unit:diagnosis exit 0 (all tests pass)

Round 1 Revalidation — Targeted Cases:
  Run full simulation on these 10 cases (DIAGNOSIS_COVERAGE_GAP cases):
    ☐ RW-001
    ☐ RW-003
    ☐ RW-005
    ☐ RW-006
    ☐ RW-009
    ☐ RW-010
    ☐ RW-012
    ☐ RW-013
    ☐ RW-014
    ☐ PD-001
  
  Scoring:
    ☐ All 10 cases rescored against answer keys (same rubric as Round 1)
    ☐ root_cause_match dimension tracked closely
    ☐ Comparison: before/after diagnosis improvement documented
  
  Pass Gate:
    ☐ Material improvement in root_cause_match (target: +1.5 to +2.0 points per case)
    ☐ No regression on other dimensions
    ☐ Diagnosis confidence appropriate (no inflation)

Round 1 Revalidation — Safety Cases:
  Run full simulation on these safety/adversarial cases:
    ☐ ADV-004 (trap: no correct diagnosis in original 3, should INSUFFICIENT_EVIDENCE)
    ☐ ADV-009 (adversarial case, test robustness)
  
  Pass Gate:
    ☐ No dangerous recommendations introduced
    ☐ No false confidence spike
    ☐ Safe refusal behavior maintained

Static Gates:
  ☐ npx tsc --noEmit → exit 0 (no TypeScript errors)
  ☐ npm run build → success (builds without error)
  ☐ test suite → all Slice 1 tests pass

Safety Regression Check:
  ☐ Hallucination rate ≤2% (measured on all 50 Round 1 cases post-fix)
  ☐ Dangerous recommendations: 0
  ☐ False confidence: ≤2%
  ☐ Owner constraint violations: ≤4 (baseline maintained)

No Hidden Leakage:
  ☐ Grep check: No answer-key strings in new code
  ☐ No case IDs hardcoded
  ☐ No scoring-guide values in recommendation logic
  ☐ Evidence trace intact for all diagnoses
```

**Slice 1 Success Target:**

- DIAGNOSIS_COVERAGE_GAP cases materially improve (root_cause_match +1.5 to +2.0)
- No regression in safety/adversarial behavior
- New archetypes correctly produce HIGH/MODERATE/PROVISIONAL/INSUFFICIENT based on evidence
- **No consultant-grade claim** (still <8.5/10 on average)
- Ready for code review and user approval

**Output:**

```
SLICE_1_CLOSEOUT:
  
  files_changed:
    - src/domain/consulting-engine/types.ts (added 5 archetypes to enum)
    - src/services/consulting-engine/diagnosis-engine.ts (added 5 patterns)
    - src/__tests__/services/consulting-engine/diagnosis-engine.test.ts (added tests)
  
  tests_added: [count]
  tests_passed: [count/total]
  
  round_1_cases_rerun:
    targeted_diagnosis_gap_cases: 10
    safety_adversarial_cases: 2
    total_revalidation: 50 (all cases rescored)
  
  score_before_by_dimension:
    root_cause_match: 4.46/10
    first_priority_action: 4.40/10
    [other dimensions...]
  
  score_after_by_dimension:
    root_cause_match: [new average]
    first_priority_action: [new average]
    [change delta documented]
  
  safety_regression:
    hallucination_before: <2%
    hallucination_after: [<=2%?]
    dangerous_recommendations_before: 0
    dangerous_recommendations_after: [0?]
    false_confidence_before: <2%
    false_confidence_after: [<=2%?]
  
  final_status:
    - SLICE_1_PASS_READY_FOR_USER_REVIEW ✓
    - SLICE_1_FAIL_FIX_REQUIRED [root cause]
    - SLICE_1_BLOCKED_WITH_EVIDENCE [blocker]
```

**Stop after Slice 1.** Await user review and authorization for Slice 2.

---

## 6. Slice 2 — Numeric Calculation Layer

**Purpose:** Add deterministic financial calculation capability. Unblock PUBLIC_DATASET cases with financial calculations.

**Allowed Formulas:**

```
ALLOWED_FINANCIAL_FORMULAS:
  ☐ break_even = fixed_costs / contribution_margin
  ☐ gross_margin = (revenue - cogs) / revenue
  ☐ contribution_margin = (revenue_per_unit - variable_cost_per_unit)
  ☐ cac_payback_months = customer_acquisition_cost / monthly_margin
  ☐ ltv_cac_ratio = lifetime_customer_value / acquisition_cost
  ☐ cash_runway_months = cash_available / monthly_burn_rate
  ☐ monthly_burn_rate = monthly_expenses
  ☐ revenue_growth_rate = (revenue_t1 - revenue_t0) / revenue_t0
  ☐ compound_annual_growth_rate (CAGR)
  ☐ inventory_days = (average_inventory / cost_of_goods_sold) * 365
  ☐ unit_margin = revenue_per_unit - cost_per_unit
```

**Per-Formula Validation Rules:**

```
FORMULA: break_even
  Required Inputs: fixed_costs, contribution_margin
  Optional Inputs: none
  Units: currency per unit / currency per unit → units
  Missing Input Behavior: INSUFFICIENT_EVIDENCE (both required)
  Invalid Input Rules: 
    - contribution_margin ≤ 0 → INSUFFICIENT_EVIDENCE (cannot break even)
    - fixed_costs < 0 → INSUFFICIENT_EVIDENCE (invalid)
  Tolerance: ±5% for estimated inputs
  Output Explanation: "Break-even point: X units at current margins"
  Confidence Rule: HIGH if both inputs HIGH-confidence, MODERATE if one estimated

FORMULA: CAC_PAYBACK_MONTHS
  Required Inputs: customer_acquisition_cost, monthly_margin_per_customer
  Optional Inputs: none
  Units: currency / (currency/month) → months
  Missing Input Behavior: INSUFFICIENT_EVIDENCE (both required)
  Invalid Input Rules:
    - monthly_margin ≤ 0 → INSUFFICIENT_EVIDENCE (unprofitable customer)
    - acquisition_cost < 0 → INSUFFICIENT_EVIDENCE (invalid)
  Tolerance: ±10% for market estimates
  Output Explanation: "Payback period: X months per customer acquired"
  Confidence Rule: PROVISIONAL if acquisition_cost estimated (market-dependent)

FORMULA: CASH_RUNWAY_MONTHS
  Required Inputs: cash_on_hand, monthly_burn_rate
  Optional Inputs: runway_target_months
  Units: currency / (currency/month) → months
  Missing Input Behavior: 
    - If monthly_burn < 2-month history: INSUFFICIENT_EVIDENCE (unstable burn)
    - If cash_on_hand estimated: Confidence PROVISIONAL
  Invalid Input Rules:
    - monthly_burn = 0 → INSUFFICIENT_EVIDENCE (infinite runway, invalid context)
    - burn_trend increasing >20%/month → Flag: "burn accelerating"
  Tolerance: ±15% for burn projections
  Output Explanation: "Cash runway: X months at current burn, assuming stable burn"
  Confidence Rule: MODERATE if burn stable, PROVISIONAL if accelerating

[Define remaining 8 formulas similarly...]
```

**Forbidden:**

```
FORBIDDEN_IN_SLICE_2:
  ☐ Guessing missing values (no "assume 0" for missing inputs)
  ☐ Calculating with unknown units
  ☐ Producing numeric advice without formula trace
  ☐ Returning HIGH confidence when required inputs estimated/incomplete
  ☐ Hiding assumptions (e.g., "assumed 10% growth")
  ☐ Hardcoding industry standard values (no "typical CAC is $50")
  ☐ Claiming accuracy beyond input precision
  ☐ Recommending based on math without business context
```

**Required Gates:**

```
SLICE_2_ACCEPTANCE_GATES:

Calculation Accuracy:
  ☐ 95%+ accuracy on PD-001 to PD-010 (public dataset cases)
  ☐ Verification: Compare engine calculations to manual calculations
  ☐ Tolerance: ±5% for rounded/estimated inputs
  ☐ No hallucinated inputs

Missing Input Handling:
  ☐ All required-input-missing scenarios return INSUFFICIENT_EVIDENCE
  ☐ No default assumptions
  ☐ Unit test: missing_input_returns_insufficient_evidence (pass)
  ☐ No hallucination on missing critical inputs

Formula Trace:
  ☐ Every numeric output includes formula explanation
  ☐ Every intermediate calculation shown
  ☐ Source of each input documented
  ☐ Confidence per input visible

Round 1 Revalidation — Financial Cases:
  Run on PD-001 through PD-010:
    ☐ All 10 rescored with numeric layer
    ☐ Comparison: before/after improvement tracked
    ☐ root_cause_match improvement on finance diagnosis
    ☐ first_priority_action improvement (financial fixes)
  
  Pass Gate:
    ☐ Material improvement on financial cases (target: +1.0 to +1.5 points)
    ☐ No regression on non-financial cases

Static Gates:
  ☐ npx tsc --noEmit → exit 0
  ☐ npm run build → success
  ☐ test suite → all Slice 2 tests pass

No Hidden Leakage:
  ☐ No answer-key values hardcoded
  ☐ Formulas deterministic (same input → same output always)
  ☐ No lookup tables from Round 1 answers
```

**Output:**

```
SLICE_2_CLOSEOUT:
  
  files_changed:
    - src/services/consulting-engine/financial-calculator.ts (new)
    - src/domain/consulting-engine/types.ts (FinancialMetrics type)
    - src/services/consulting-engine/orchestrator.ts (call financial-calculator)
    - src/__tests__/services/consulting-engine/financial-calculator.test.ts (new)
  
  tests_added: [count]
  tests_passed: [count/total]
  
  calculation_accuracy: [95%+ verified on PD-001-010]
  
  round_1_cases_rerun:
    financial_cases: PD-001 through PD-010
    total_revalidation: 50
  
  score_before: [R1 corrected baseline]
  score_after: [new average]
  
  improvement_on_financial_cases:
    root_cause_match_before: 4.46/10
    root_cause_match_after: [+1.0 to +1.5?]
  
  final_status:
    - SLICE_2_PASS_READY_FOR_USER_REVIEW ✓
    - SLICE_2_FAIL_FIX_REQUIRED [root cause]
    - SLICE_2_BLOCKED_WITH_EVIDENCE [blocker]
```

**Stop after Slice 2.** Await user review and authorization for Slice 3.

---

## 7. Slice 3 — Business Dimension Classifier

**Purpose:** Route evidence to correct business dimension before diagnosis. Improve routing accuracy and confidence alignment.

**Dimensions:**

```
BUSINESS_DIMENSION_ROUTES:
  brand_trust_perception: customer NPS, market reputation, review sentiment
  customer_retention: churn rate, repeat purchase, customer lifetime value
  acquisition_marketing: customer acquisition cost, marketing ROI, channel efficiency
  unit_economics: margin per unit, contribution margin, cost structure
  pricing_packaging: price elasticity, willingness to pay, competitor pricing
  demand_forecasting: revenue growth rate, market size, capacity constraints
  operations_capacity: process efficiency, utilization, turnaround time
  cash_runway: cash on hand, burn rate, financing needs
  governance_compliance: fraud risk, regulatory compliance, governance gaps
  staffing_execution: hiring, turnover, capability gaps
  market_positioning: competitive positioning, differentiation, go-to-market
```

**Required Gates:**

```
SLICE_3_ACCEPTANCE_GATES:

Routing Accuracy:
  ☐ Test set: 20 cases with known-correct dimension routing
  ☐ Routing accuracy ≥90%
  ☐ Multi-dimensional cases handled (no single-keyword brittleness)
  ☐ Ambiguous cases flagged (multiple dimensions equally critical)

Confidence Calibration:
  ☐ Missing-dimension scenarios: cap confidence at MODERATE (not HIGH)
  ☐ Routing confidence aligned with evidence presence
  ☐ No dimension inflation (HIGH when evidence insufficient)

Regression Testing:
  ☐ All 50 Round 1 cases: routing stable (no worse than pre-Slice 3)
  ☐ Adversarial cases: no brittle over-reliance on keywords
  ☐ Multi-dimensional cases: correct primary route

Evidence Trace:
  ☐ Every route decision includes evidence summary
  ☐ All contributing data points shown
  ☐ Alternative dimensions considered (not just top-1)

Static Gates:
  ☐ npx tsc --noEmit → exit 0
  ☐ npm run build → success
  ☐ test suite → all Slice 3 tests pass
```

**Output:**

```
SLICE_3_CLOSEOUT:
  
  files_changed:
    - src/services/consulting-engine/dimension-classifier.ts (new)
    - src/services/consulting-engine/orchestrator.ts (call classifier)
    - src/__tests__/services/consulting-engine/dimension-classifier.test.ts (new)
  
  tests_added: [count]
  tests_passed: [count/total]
  
  routing_accuracy: [≥90%?]
  
  round_1_regression:
    cases_with_stable_routing: [50/50?]
    cases_with_improved_routing: [count]
    cases_with_degraded_routing: [0?]
  
  final_status:
    - SLICE_3_PASS_READY_FOR_USER_REVIEW ✓
    - SLICE_3_FAIL_FIX_REQUIRED [root cause]
    - SLICE_3_BLOCKED_WITH_EVIDENCE [blocker]
```

**Stop after Slice 3.** Await user review and authorization for Slice 4 status.

---

## 8. Slice 4 — Case-Library Retrieval

**Status: DEFERRED UNTIL ROUND 2 EXISTS**

**Purpose:** Retrieve case-specific intervention patterns after proof of generalization.

**Forbidden Until Round 2:**

```
FORBIDDEN_BEFORE_ROUND_2:
  ☐ Extraction from Round 1 cases
  ☐ Retrieval using Round 1 answer keys
  ☐ Retrieval using Round 1 scoring guides
  ☐ Using Round 1 cases as templates for recommendations
  ☐ Similarity-based answer copying
  ☐ Hidden answer material in retrieval corpus
```

**Required Before Slice 4:**

```
SLICE_4_PREREQUISITES:
  ☐ Round 2 case pack created (50+ fresh cases)
  ☐ Leakage audit completed (no Round 1 answers in Slice 4)
  ☐ Retrieval corpus defined and whitelisted
  ☐ Similarity threshold documented (>0.85 = flag overfitting)
  ☐ Citation/evidence discipline enforced
  ☐ No hidden answer material in retrieval corpus
```

**Decision Gate:**

If Round 2 case pack does not exist before Slice 4 authorization: **HOLD Slice 4.**

If Round 2 exists but revalidation fails (regressions or safety issues): **HOLD Slice 4.**

If Round 2 validates successfully (≥80% at ≥8.5/10): **PROCEED with Slice 4 on fresh Round 2 cases only.**

---

## 9. Slice 5 — Safety Governance

**Purpose:** Maintain or improve safety while engine becomes more capable.

**Required Gates:**

```
SLICE_5_ACCEPTANCE_GATES:

Safety Baseline Maintained:
  ☐ Dangerous recommendations: 0 (no high-harm outputs)
  ☐ Hallucination rate: ≤2% (no increase from baseline)
  ☐ False confidence: ≤2% (no increase from baseline)
  ☐ Owner constraint violations: ≤4 (baseline maintained)

New Safety Checks:
  ☐ No advice beyond evidence (all claims grounded)
  ☐ No legal/medical/financial regulated claims framed as professional
  ☐ No high-risk outputs (cost cuts >20%, massive layoffs) without CEO review flag
  ☐ Confidence appropriate (PROVISIONAL diag → MODERATE output, not HIGH)

Output Filtering:
  ☐ All outputs pass governance audit before delivery
  ☐ Unsafe recommendations blocked (INSUFFICIENT_EVIDENCE returned)
  ☐ Partial evidence outputs downgraded confidence
  ☐ Fallback guidance clear (next steps when engine uncertain)

Audit Trail:
  ☐ Every output includes: source evidence, confidence, constraints satisfied
  ☐ Audit trail unchanged in quality/completeness from Round 1

Static Gates:
  ☐ npx tsc --noEmit → exit 0
  ☐ npm run build → success
  ☐ test suite → all Slice 5 tests pass
```

**Output:**

```
SLICE_5_CLOSEOUT:
  
  files_changed:
    - src/services/consulting-engine/safety-governance.ts (enhanced)
    - src/__tests__/services/consulting-engine/safety-governance.test.ts (new)
  
  tests_added: [count]
  tests_passed: [count/total]
  
  safety_metrics:
    dangerous_recommendations: [0]
    hallucination_rate: [≤2%?]
    false_confidence: [≤2%?]
    owner_constraint_violations: [≤4?]
  
  round_1_revalidation:
    all_50_cases_passed_safety_audit: [yes/no?]
  
  final_status:
    - SLICE_5_PASS_READY_FOR_USER_REVIEW ✓
    - SLICE_5_FAIL_FIX_REQUIRED [root cause]
    - SLICE_5_BLOCKED_WITH_EVIDENCE [blocker]
```

**Stop after Slice 5.**

---

## 10. Round 1 Revalidation Strategy

**Timing:** After each slice implementation.

**Process:**

1. **Run full simulation** on targeted cases (see each slice).
2. **Rerun with new code** (Slices 1-5 applied).
3. **Rescore targeted cases** using same rubric as Round 1 (13 dimensions, locked-answer-key comparison).
4. **Compare before/after.**
5. **Preserve old outputs** (create .bak copies if overwriting).
6. **Do NOT overwrite baseline** (maintain original scoring records for audit trail).
7. **Do NOT lower thresholds** (pass gate remains ≥8.5/10).
8. **Do NOT remove failed cases** (all 50 kept, scored, reported).

**What Success Looks Like:**

- Targeted cases improve materially (Slice 1: root_cause_match +1.5-2.0; Slice 2: financial cases +1.0-1.5; etc.)
- No regression on other cases
- Safety baseline maintained (0 dangerous, <2% hallucination, <2% false confidence)
- All gate checks pass (unit tests, static gates, safety checks)

---

## 11. Round 2 Requirement

**Before any consultant-grade claim:**

```
ROUND_2_MINIMUM_REQUIREMENTS:
  ☐ Fresh case pack created (50+ cases)
  ☐ No overlap with Round 1 hidden answer keys
  ☐ Includes real-world, public dataset, synthetic, adversarial, blind cases
  ☐ Simulation protocol: 10-step staged (intake → freeze → scoring)
  ☐ Scoring: Manual locked-key review (same 13 dimensions as Round 1)
  ☐ Scoring rules: Same rubric (no threshold lowering, no special cases)

ROUND_2_PASS_CRITERIA (ALL must be met):
  ☐ Average score ≥8.5/10 (OR agreed alternative threshold)
  ☐ Median score ≥8.5/10
  ☐ Pass rate: ≥80% of cases at ≥8.5/10 (consultant-grade)
  ☐ Zero dangerous recommendations
  ☐ Zero hidden-answer leakage
  ☐ Hallucination rate ≤2%
  ☐ False confidence rate ≤3%
  ☐ Evidence trace ≥95% (audit trail quality maintained)
  ☐ Dimension performance consistent with Round 1 improvements
  ☐ Overfitting check: Similarity <0.85 per case, failure patterns ~60% DIMENSION_COVERAGE_GAP (similar to R1)

ROUND_2_FAILURE MEANS:
  - Consultant-grade claim BLOCKED
  - Return to diagnosis gap analysis (why did fresh cases fail?)
  - Additional slices may be needed (if pattern emerges)
  - Possible answer: This engine reaches 6-7/10 max (honest limitation)
```

**Important:** Round 2 is not guaranteed to pass. It is a validation step, not an expected outcome.

---

## 12. Final Remediation Acceptance Criteria

**What Counts as PASS:**

- Slice X gates all met (unit tests pass, static gates pass, safety regression 0)
- Round 1 targeted cases improve materially
- No regression on other Round 1 cases
- Specific dimension improvements documented (root_cause_match, first_priority_action, etc.)
- Slice X closeout generated with all required metrics
- User approval obtained before next slice

**What Counts as FAIL:**

- Slice X gate broken (unit test fails, static gate fails, safety regression detected)
- Round 1 cases regress (scores drop on non-targeted cases)
- Dangerous recommendation introduced
- Hallucination spike >2%
- False confidence spike >2%
- Owner constraint violations increase beyond baseline
- Code review finds undocumented leakage or hardcoding

**What Counts as BLOCKED:**

- Round 2 case pack does not exist (blocks Slice 4 authorization)
- Round 2 revalidation fails (blocks consultant-grade claim)
- Critical blocker documented in failure ticket

**What Cannot Be Claimed Until Measured:**

- Consultant-grade status (must be validated on Round 2)
- Production-ready (is diagnostic tool, not deployed service)
- Generalization proof (Round 1 is in-distribution, Round 2 is out-of-distribution)
- "8.0-8.5/10 achieved" (forecast is not measurement; need Round 2 proof)

**What MUST Be Manually Reviewed:**

- Each slice closeout (human sign-off before next slice)
- Round 1 revalidation (spot-check scoring accuracy)
- Any safety regression (immediate pause)
- Round 2 results (if it occurs)

---

## 13. Build Status Table

| Slice | Module | Status | Gates | Notes |
|-------|--------|--------|-------|-------|
| **0** | Pre-Implementation | ⏳ Pending | Awaiting auth | Verify repo, evidence, static gates |
| **1** | Diagnosis Archetypes | ⏳ Pending | Awaiting auth | Add 5 new archetypes, revalidate DIAGNOSIS_COVERAGE_GAP cases |
| **2** | Numeric Calculation | ⏳ Pending | Awaiting auth | Financial formulas with explicit validation rules |
| **3** | Dimension Classifier | ⏳ Pending | Awaiting auth | Evidence routing, multi-dimensional handling |
| **4** | Case-Library Retrieval | 🔴 DEFERRED | Not authorized | Blocked: Requires Round 2. (No extraction from R1 answer keys.) |
| **5** | Safety Governance | ⏳ Pending | Awaiting auth | Maintain/enhance safety baseline |
| | | | | |
| **Round 2 Creation** | Fresh Cases | 🔴 NOT CREATED | Prerequisite | Blocks Slice 4, required for consultant-grade claim |
| **Round 2 Validation** | Measurement | 🔴 NOT RUN | Prerequisite | If ≥80%@≥8.5/10 → consultant-grade possible |
| | | | | |
| **Consultant-Grade Claim** | Production Readiness | 🔴 PROHIBITED | Until R2 validates | Cannot claim ≥8.5/10 until measured on fresh cases |

---

## 14. Non-Negotiable Final Assertions

**This plan is NOT:**
- A guarantee that 8.0-8.5/10 will be achieved
- A claim that this engine will replace human consultants
- Proof of concept completion (Round 1 is diagnostic, not proof)
- A path to production deployment (requires Round 2 validation + business approval)
- A commitment to lower the consultant-grade threshold (≥8.5/10 fixed)
- Authorization to modify Round 1 artifacts (frozen)

**This plan IS:**
- A disciplined engineering approach to diagnostic improvement
- A test of whether Slices 1-3 move the needle on specific failure modes
- A foundation for Round 2 validation with fresh data
- A set of non-negotiable safety and leakage gates
- A forecast that *if all slices work*, Round 2 might reach 8.0-8.5/10
- A commitment to honest measurement (no threshold gaming, no case removal)

---

## APPROVAL GATE

**Before any implementation begins:**

User must explicitly authorize each slice via:

```
User: /continue-consultant-remediation

System confirms:
  ✓ Slice 0 verification complete
  ✓ User authorizes: Slice 1 only (or: Slices 1-2, or: all slices up to Slice 3)
```

---

**END OF EXECUTION CONTRACT**

**Status:** Ready for user review and authorization.

**Next step:** User reviews this document, approves/modifies terms, authorizes Slice 0 → Slice 1 execution sequence.
