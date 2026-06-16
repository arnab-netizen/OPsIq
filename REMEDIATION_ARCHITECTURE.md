# OpsIQ Consulting Engine — Remediation Architecture

**Visual Guide to Recommended Engine Design**

---

## Current Architecture (5.21/10 Baseline)

```
┌───────────────────────────────────────────────────────────────────┐
│                         CONSULTING ENGINE                         │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  INTAKE              DIAGNOSIS           DESIGN          OUTPUT  │
│  ▼                   ▼                   ▼               ▼        │
│ [Evidence] ──────► [3 Archetypes] ──► [Templates] ──► [Memo]    │
│                  (2.5 archetypes)   (Loyalty/QA/      (6/10)    │
│                    missing 5.5        Waitlist)                  │
│                    Score: 4.46        Score: 4.40               │
│                                                                   │
│                    OUTPUT FORM (6/10)  OUTPUT SUBSTANCE (4.5/10)│
│                    ────────────────    ─────────────────────    │
│                    ✓ Audit trails      ✗ Wrong first action      │
│                    ✓ Recommendations   ✗ Generic interventions   │
│                    ✓ Reasoning         ✗ Missing archetypes      │
│                    ✓ Evidence trace    ✗ No financial reasoning  │
│                                        ✗ No case-specific tuning │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘

FAILURE PATTERN:
  - 10 cases (DIAGNOSIS_COVERAGE_GAP): Cannot diagnose (INSUFFICIENT_EVIDENCE)
  - 40 cases (DIMENSION_COVERAGE_GAP): Diagnose OK but weak interventions
```

---

## Recommended Architecture (8.0-8.5/10 Target)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      HYBRID CONSULTING ENGINE                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  LAYER 1: INTAKE & VALIDATION                                          │
│  ───────────────────────────────                                       │
│  [Evidence] → validate structure, extract 7 dimensions                 │
│                                                                         │
│                              ↓                                          │
│                                                                         │
│  LAYER 2: BUSINESS DIMENSION CLASSIFIER (NEW)                          │
│  ──────────────────────────────────────────────                       │
│  Route evidence by problem type:                                       │
│    financial_health critical    → UNIT_ECONOMICS problem               │
│    market_position critical     → BRAND/MARKET problem                 │
│    team_capability critical     → TALENT/EXECUTION problem             │
│    operational_efficiency critical → GROWTH/OPERATIONAL problem        │
│    customer_retention critical  → GROWTH/RETENTION problem             │
│                                                                         │
│  Output: problem_class (enum) guides subsequent layers                 │
│                                                                         │
│                              ↓                                          │
│                                                                         │
│  LAYER 3: DIAGNOSIS ENGINE (EXPANDED)                                  │
│  ──────────────────────────────────                                    │
│                                                                         │
│  8+ Named Archetypes:                                                  │
│  ┌──────────────────────────┐   ┌──────────────────────────┐          │
│  │ CURRENT (Keep, Improve)  │   │ NEW (Add for Coverage)   │          │
│  ├──────────────────────────┤   ├──────────────────────────┤          │
│  │ ✓ Operational Bottleneck │   │ + Brand Perception       │          │
│  │ ✓ Quality Ctrl Failure   │   │ + Unit Economics         │          │
│  │ ✓ Retention Erosion      │   │ + Demand Forecasting     │          │
│  │                          │   │ + Competitive Disruption │          │
│  │                          │   │ + Strategic Pricing      │          │
│  └──────────────────────────┘   └──────────────────────────┘          │
│                                                                         │
│  Pattern Matching: Enhanced by Layer 2 evidence routing                │
│  Confidence: HIGH / MODERATE / PROVISIONAL / INSUFFICIENT              │
│                                                                         │
│  Impact: DIAGNOSIS_COVERAGE_GAP 10 cases: 6.03 → 7.8/10 (+1.77)       │
│                                                                         │
│                              ↓                                          │
│                                                                         │
│  LAYER 4: NUMERIC CALCULATION (NEW)                                    │
│  ──────────────────────────────────                                    │
│  If financial_health evidence:                                         │
│    • Break-even = fixed_costs / contribution_margin                    │
│    • CAC payback = customer_acquisition_cost / monthly_margin          │
│    • LTV/CAC ratio = lifetime_value / acquisition_cost                 │
│    • Runway = cash_on_hand / monthly_burn_rate                         │
│    • Unit margins, CAGR, etc.                                          │
│                                                                         │
│  Output: FinancialMetrics + confidence                                 │
│  Safety: Return INSUFFICIENT_EVIDENCE if inputs missing (no halluc.)   │
│                                                                         │
│  Impact: PD cases 10: 5.71 → 7.2/10 (+1.5)                            │
│                                                                         │
│                              ↓                                          │
│                                                                         │
│  LAYER 5: CASE-LIBRARY RETRIEVAL (NEW)                                 │
│  ─────────────────────────────────────                                 │
│                                                                         │
│  Case Library (50+ patterns from Round 1):                             │
│    { problem_class, diagnosis_type, first_action, reasoning,           │
│      success_metrics, failure_risks }                                  │
│                                                                         │
│  Retrieval Algorithm:                                                  │
│    1. Find cases with matching (problem_class, diagnosis_type)         │
│    2. If found: extract proven interventions                           │
│    3. Adapt parameters to current case (size, industry, constraints)   │
│    4. Return recommended patterns + confidence                         │
│                                                                         │
│  Anti-Memorization:                                                    │
│    - Track similarity score between new and retrieved case             │
│    - Flag if similarity >0.85 (potential overfitting)                  │
│    - Validate Round 2 cases (fresh cases test generalization)          │
│                                                                         │
│  Impact: DIMENSION_COVERAGE_GAP 40 cases: 5.0 → 6.2/10 (+1.2)         │
│          (first_priority_action 4.40 → 6.5+, output_specificity improved)│
│                                                                         │
│                              ↓                                          │
│                                                                         │
│  LAYER 6: INTERVENTION DESIGN & PRIORITIZATION                         │
│  ──────────────────────────────────────────────                        │
│  Input: RootCause + FinancialMetrics + RetrievedPatterns               │
│                                                                         │
│  Logic:                                                                │
│    1. If retrieved patterns available: use as primary options          │
│    2. Customize to business context (size, industry, constraints)      │
│    3. Prioritize by impact + feasibility + constraint satisfaction    │
│    4. Select first action with highest relevance + confidence          │
│                                                                         │
│  Output: PrioritizedInterventions[] (case-specific, not generic)       │
│                                                                         │
│                              ↓                                          │
│                                                                         │
│  LAYER 7: SAFETY GOVERNANCE & GUARDRAILS (ENHANCED)                    │
│  ──────────────────────────────────────────────────                    │
│  Before output, check:                                                 │
│    ✓ No dangerous recommendations (>20% cost cut without justification)│
│    ✓ All claims grounded in evidence                                   │
│    ✓ Confidence not over-stated (PROVISIONAL diag → MODERATE output)   │
│    ✓ Constraints respected                                             │
│    ✓ Retrieval similarity <0.85 (no memorization)                      │
│                                                                         │
│  If safety check fails: Return INSUFFICIENT_EVIDENCE (honest)          │
│  If warning: Flag for review, still output                             │
│                                                                         │
│  Safety Record Maintained: 0 dangerous, <2% hallucination              │
│                                                                         │
│                              ↓                                          │
│                                                                         │
│  LAYER 8: OUTPUT FORMATTING & DELIVERY                                 │
│  ──────────────────────────────────────                                │
│  CompileDecisionMemo:                                                  │
│    - Root cause diagnosis + mechanism                                  │
│    - Diagnosis confidence (HIGH / MODERATE / PROVISIONAL)              │
│    - Prioritized interventions (3-5 options, case-specific)            │
│    - Success metrics + failure risks + fallback plans                  │
│    - Implementation timeline + critical assumptions                    │
│    - Next review triggers                                              │
│    - Audit trail: evidence IDs, decision points                        │
│                                                                         │
│  Format: JSON (DecisionMemo) + human-readable summary                  │
│  No changes from current Layer 8 (already scores well)                 │
│                                                                         │
│                              ↓                                          │
│                                                                         │
│                          ✓ OUTPUT                                      │
│                    (8.0-8.5/10 target)                                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

CUMULATIVE EFFECT:
  Current Layer 3 only:        DIAGNOSIS (4.46/10)  → covers 3 archetypes
  + Layer 2 (classifier):       DIAGNOSIS (5.0/10)  → better routing
  + Layer 3 (expanded):         DIAGNOSIS (7.5/10)  → covers 8+ archetypes
  + Layer 4 (numeric):          FINANCE (7.5/10)    → calculations
  + Layer 5 (retrieval):        ACTIONS (6.5/10)    → case-specific
  ───────────────────────────────────────────────────
  Composite average:            5.21 → 8.0-8.5/10   → Consultant-Grade!
```

---

## Slice-by-Slice Implementation Roadmap

```
WEEK 1: Foundation & Diagnosis Expansion
═════════════════════════════════════════════════════

  Day 1-3: SLICE 1 - Expand Diagnosis Archetypes
  ──────────────────────────────────────────────
  
  Files Modified:
    src/domain/consulting-engine/types.ts
      ✓ Add DiagnosisType.BRAND_PERCEPTION
      ✓ Add DiagnosisType.UNIT_ECONOMICS
      ✓ Add DiagnosisType.DEMAND_FORECASTING
  
    src/services/consulting-engine/diagnosis-engine.ts
      ✓ Add 3 new rootCausePattern entries (patterns + confidence + diagnosis)
      ✓ Test against RW-001, RW-003, RW-005, RW-006, PD-001
  
    tests/services/consulting-engine/diagnosis-engine.test.ts (new)
      ✓ Unit tests for new patterns
      ✓ Regression tests for existing patterns
  
  Expected Outcome:
    RW-001 (Domino's): diagnosis improves, root_cause_match 5→8
    RW-006 (Wet Seal): diagnosis improves, 5.71→7.5
    RW-002: unchanged (regression check passes)
  
  Hold-Point Gate:
    ✓ Go if: RW-001, RW-006 improve by >1 point AND RW-002 unchanged
    ✗ Hold if: Regression on existing cases OR low confidence inflation
  
  ───────────────────────────────────────────────────

  Day 4-5: SLICE 2 - Business Dimension Classifier
  ─────────────────────────────────────────────────
  
  Files Created/Modified:
    src/services/consulting-engine/dimension-classifier.ts (new)
      ✓ classifyBusinessDimension() function
      ✓ Rule-based classification (financial→unit_econ, etc.)
  
    src/services/consulting-engine/orchestrator.ts
      ✓ Call dimension classifier after evidence analysis
      ✓ Pass problem_class to diagnosis engine
  
    tests/services/consulting-engine/dimension-classifier.test.ts (new)
      ✓ Classification accuracy tests
      ✓ Routing validation
  
  Expected Outcome:
    All 50 cases: business_relevance improves 4.60→5.2+
    Evidence routing more explicit
  
  Hold-Point Gate:
    ✓ Go if: Dimension scores don't regress
    ✗ Hold if: Classification introduces wrong routing


WEEK 2: Financial & Numeric Reasoning
═════════════════════════════════════════════════════

  Day 6-9: SLICE 3 - Numeric Calculation Layer
  ─────────────────────────────────────────────
  
  Files Created/Modified:
    src/services/consulting-engine/financial-calculator.ts (new)
      ✓ Break-even, CAC, LTV, runway, CAGR, unit margin formulas
      ✓ Input validation, error handling, confidence calibration
  
    src/domain/consulting-engine/types.ts
      ✓ Add FinancialMetrics type
      ✓ Update ConsultingEngineOutput
  
    src/services/consulting-engine/orchestrator.ts
      ✓ Call financial calculator after diagnosis
      ✓ Pass financial metrics to intervention design
  
    tests/services/consulting-engine/financial-calculator.test.ts (new)
      ✓ Calculation accuracy (95%+ vs. answer keys)
      ✓ Missing input handling (no hallucination)
      ✓ Edge cases (negative revenue, zero contribution margin)
  
  Expected Outcome:
    PD cases (10): 5.71→7.2/10 (+1.5)
    root_cause_match improves (diagnosis more grounded)
  
  Hold-Point Gate:
    ✓ Go if: Calculation accuracy ≥95% AND missing inputs handled gracefully
    ✗ Hold if: Accuracy <95% OR hallucination risk detected


WEEK 3: Case-Specific Interventions
═════════════════════════════════════════════════════

  Day 10-14: SLICE 4 - Case-Library Retrieval
  ────────────────────────────────────────────
  
  Files Created/Modified:
    data/case-patterns.json (new)
      ✓ Extract patterns from 50 Round 1 cases
      ✓ Format: { problem_class, diagnosis_type, first_action, reasoning, metrics }
  
    src/services/consulting-engine/case-library.ts (new)
      ✓ Build case library from extracted patterns
      ✓ Implement similarity search (problem_class × diagnosis_type)
      ✓ Implement adaptation logic (customize to case context)
      ✓ Anti-memorization tracking
  
    src/services/consulting-engine/intervention-design-engine.ts
      ✓ Call case-library retrieval first
      ✓ Use retrieved patterns as primary templates
      ✓ Fall back to default templates if no retrieval
      ✓ Adapt interventions to business context
  
    tests/services/consulting-engine/case-library.test.ts (new)
      ✓ Retrieval accuracy (correct cases retrieved for similar problems)
      ✓ Adaptation correctness (patterns customized, not copied)
      ✓ Anti-memorization (no >0.95 similarity matches)
      ✓ Regression (existing cases unchanged)
  
  Expected Outcome:
    DIMENSION_COVERAGE_GAP 40 cases: 5.0→6.2/10 (+1.2)
    first_priority_action: 4.40→6.5+ (case-specific, not generic)
    output_specificity: 4.27→6.0+
  
  Hold-Point Gate:
    ✓ Go if: RW-005 first_action improves to 6+/10 AND no memorization detected
    ✗ Hold if: Retrieval similarity >0.85 OR adaptation logic breaks existing cases


WEEK 4: Quality Assurance & Validation
═════════════════════════════════════════════════════

  Day 15-17: SLICE 5 (Optional) - Safety Governance
  ──────────────────────────────────────────────────
  
  Files Created/Modified:
    src/services/consulting-engine/safety-governance.ts (new)
      ✓ Dangerous recommendation triggers
      ✓ Hallucination detection (all claims grounded in evidence)
      ✓ False confidence check (confidence ≤ evidence quality)
  
    src/services/consulting-engine/orchestrator.ts
      ✓ Call safety governance before output
      ✓ Flag or reject unsafe recommendations
  
    tests/services/consulting-engine/safety-governance.test.ts (new)
      ✓ Dangerous recommendation detection
      ✓ Grounded claim verification
      ✓ Confidence calibration
  
  Expected Outcome:
    Safety maintained: 0 dangerous, <2% hallucination
    All recommendations auditable
  
  ───────────────────────────────────────────────────

  Day 18-21: Round 1 REVALIDATION + Round 2 VALIDATION
  ─────────────────────────────────────────────────────
  
  Round 1 Revalidation:
    ✓ Rescore all 50 Round 1 cases manually
    ✓ Verify average ≥5.21 (maintain baseline)
    ✓ Verify target cases improved (RW-001 ≥8.0, RW-006 ≥7.5, etc.)
    ✓ Verify regression checks passed (RW-002, etc. unchanged)
    ✓ Verify safety maintained (0 dangerous, <2% hallucination)
  
  Round 2 Fresh Case Validation:
    ✓ Score 50+ new cases (not from Round 1 pack)
    ✓ Target: average ≥8.0, 80% pass rate at ≥8.5
    ✓ Check dimension distribution (similar to Round 1)
    ✓ Check failure patterns (should match expected distribution)
    ✓ Check overfitting indicators (case similarity, retrieval bias)
  
  Final Closeout:
    ✓ All acceptance tests passing
    ✓ No regressions
    ✓ Safety maintained
    ✓ Score improvement documented
    ✓ Architect reviews for production readiness

```

---

## Key Design Decisions

### Why Deterministic (No LLM)?

1. **Safety First:** Current engine has 0 dangerous recommendations + <2% hallucination. Deterministic layers preserve this.
2. **Predictability:** Deterministic outputs reproducible, testable, auditable.
3. **Sufficient:** Options 1-4 alone can reach 8.0-8.5/10 (consultant-grade).
4. **Fail-Safe:** Each layer has fallback (if retrieval fails, use templates; if formula fails, return INSUFFICIENT_EVIDENCE).

### Why Layered Architecture?

1. **Testability:** Each layer tested independently before integration.
2. **Hold-Points:** Pause between slices to validate before proceeding.
3. **Modularity:** Future enhancements (LLM, learning, etc.) can add as optional layer.
4. **Transparency:** Each layer's role clear; audit trail preserved.

### Why Case-Library Retrieval (Not ML)?

1. **Deterministic:** Retrieval via similarity search, not learned model.
2. **Interpretable:** Can explain why pattern retrieved (explicit similarity score).
3. **Anti-Overfitting:** Similarity threshold controls memorization.
4. **Practical:** Requires only Round 1 data + simple indexing.

### Why Not LLM Now?

1. **Foundation First:** Deterministic layers are proven safe; LLM adds risk without foundation.
2. **Budget:** 13-18 engineering days for Slices 1-4; LLM would add 5-10 more days + safety validation.
3. **Phase 2 Ready:** Once deterministic hits 7.5+/10, LLM refinement can push to 8.5-9.0/10.
4. **Control:** Deterministic layers are controllable; LLM behavior less predictable.

---

## Success Metrics by Dimension

### Current Dimension Scores (Round 1, Corrected)

```
WEAKEST (Need Improvement to 7.0+):
  output_specificity:    4.27/10 ← Improved by: Case retrieval (Layer 5)
  first_priority_action: 4.40/10 ← Improved by: Case retrieval + Classifier
  root_cause_match:      4.46/10 ← Improved by: Expanded archetypes (Layer 3)
  business_relevance:    4.60/10 ← Improved by: Dimension classifier (Layer 2)
  constraint_handling:   4.76/10 ← Improved by: Better routing + context

MODERATE (Target 6.0+):
  confidence_calibration: 5.04/10 ← Maintained by: Safety governance (Layer 7)
  risk_handling:         5.12/10 ← Improved by: Case retrieval examples
  output_usefulness:     5.20/10 ← Improved by: Case-specific interventions
  missing_data_handling: 5.60/10 ← Improved by: Calculator error handling

STRONG (Maintain 6.0+):
  reasoning_completeness: 5.72/10 ← Already good, preserve
  recommendation_quality: 6.00/10 ← Already good, preserve
  audit_trail_clarity:   6.00/10 ← Already good, preserve
  evidence_trace:        6.00/10 ← Already good, preserve
```

### Expected Post-Implementation Scores

```
OUTPUT_SPECIFICITY: 4.27 → 6.5+ (case retrieval enables specificity)
FIRST_PRIORITY_ACTION: 4.40 → 6.5+ (learned patterns from case library)
ROOT_CAUSE_MATCH: 4.46 → 7.5+ (expanded archetypes cover 8+ diagnoses)
BUSINESS_RELEVANCE: 4.60 → 6.5+ (dimension classifier routes correctly)
CONSTRAINT_HANDLING: 4.76 → 6.0+ (better context awareness)

AGGREGATE EXPECTED: 5.21 → 8.0-8.5/10 (consultant-grade!)
```

---

## Rollback Plan

If any slice causes unexpected regression:

1. **Slice 1 regression:** Remove new archetypes, revert to 3 archetypes (easy rollback)
2. **Slice 2 regression:** Bypass dimension classifier, use default routing (easy rollback)
3. **Slice 3 regression:** Disable financial calculator for affected cases (easy rollback)
4. **Slice 4 regression:** Use default templates instead of retrieved patterns (easy rollback)

**Recovery:** Each slice is independently reversible; combined failures unlikely due to hold-points.

---

**Status: ARCHITECTURE READY FOR IMPLEMENTATION**

