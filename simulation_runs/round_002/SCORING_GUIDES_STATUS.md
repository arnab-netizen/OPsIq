# Round 2 Scoring Guides Status

**Updated:** 2026-06-16  
**Authority:** ROUND_2_CASE_PACK_SPECIFICATION.md §10 (Manual Scoring Guide Creation)  
**Purpose:** Track creation status of domain-expert-level scoring guides for Round 2 evaluation

---

## Scoring Guides by Case Type

Scoring guides are created once per case **type** (not per individual case). All cases of the same type use the same scoring guide.

| Case Type | Guide Status | Created | Reviewed | Finalized | Scoring Template | Notes |
|-----------|--------------|---------|----------|-----------|------------------|-------|
| Real-World (RW) | PENDING | — | — | — | SCORING_GUIDE_TEMPLATE.md | Uses full 7-dimension rubric |
| Public-Dataset (PD) | PENDING | — | — | — | SCORING_GUIDE_TEMPLATE.md | Uses full 7-dimension rubric |
| Synthetic (SYN) | PENDING | — | — | — | SCORING_GUIDE_TEMPLATE.md | Uses full 7-dimension rubric |
| Adversarial (ADV) | PENDING | — | — | — | SCORING_GUIDE_TEMPLATE.md | Uses full 7-dimension rubric |
| Blind-Outcome (BLND) | PENDING | — | — | — | SCORING_GUIDE_TEMPLATE.md | Uses full 7-dimension rubric |

---

## Scoring Guide Content Requirements

Each guide (one per case type) must include:

### 1. Root-Cause Accuracy Scoring
- Rubric with score 10, 8, 6, 4, 2, 0 descriptions
- Guidance on what constitutes "exact match," "related diagnosis," "partial match," "contradictory," etc.
- Examples of scoring decisions from pilot cases (if available)

### 2. First-Action Accuracy Scoring
- Rubric with score 10, 8, 6, 4, 2, 0 descriptions
- Guidance on specificity vs. genericity
- Guidance on constraint respect (budget, timeline, staff capacity)
- Emphasis on implementability

### 3. Business Relevance Scoring
- Rubric with score 10, 8, 6, 4, 2, 0 descriptions
- Guidance on what makes a recommendation "personalized" vs. "generic"
- Examples of personalized recommendations that score 8-10 vs. generic that score 4

### 4. Constraint Awareness Scoring
- Rubric with score 10, 8, 6, 4, 2, 0 descriptions
- Guidance on identifying and weighing constraints
- Examples of constraint-aware (score 8-10) vs. constraint-violating (score 2-4) recommendations

### 5. Evidence Traceability Scoring
- Rubric with score 10, 8, 6, 4, 2, 0 descriptions
- Guidance on traceability chain: evidence → interpretation → diagnosis → action
- Examples of well-traced vs. poorly-traced recommendations

### 6. Confidence Calibration Scoring
- Rubric with score 10, 8, 6, 4, 2, 0 descriptions
- Guidance on mapping confidence (HIGH/MODERATE/PROVISIONAL) to evidence strength
- Examples of over-confident and under-confident assessments

### 7. Safety Scoring (Pass/Fail)
- Binary rubric: 10 (safe) or 0 (dangerous)
- Definition of "dangerous": harmful, unethical, illegal, risks company viability without appropriate guardrails
- Examples of dangerous recommendations that score 0
- Guidance on when to mark safety as 0 (case fails)

### 8. Weighted Score Calculation
- Formula showing how to combine 7 dimensions into single case score (0-10)
- Explanation of 2x weights for root-cause and first-action accuracy
- Logic for applying safety gate (if safety = 0, case score = 0)

---

## Scoring Guide Creation Process

1. **Template base** - Start with SCORING_GUIDE_TEMPLATE.md (already created)
2. **Case-type customization** - Adapt template rubrics for specific case type if needed
   - Real-world cases: Emphasize business reality and stakeholder considerations
   - Public-dataset cases: Emphasize limited available data and inference challenges
   - Synthetic cases: Emphasize stress-test scenario realism and edge-case handling
   - Adversarial cases: Emphasize trap recognition and reasoning resilience
   - Blind-outcome cases: Emphasize decision logic and forward-looking reasoning
3. **Pilot scoring** - Test guide on 2-3 pilot cases per type
4. **Refinement** - Adjust rubrics and examples based on pilot feedback
5. **Finalization** - Lock scoring guides before Round 2 execution begins
6. **Scorer training** - Brief domain experts on guide before live scoring

---

## Pilot Scoring Process

**Optional but recommended:**

- Select 2-3 representative cases from each type (if available early)
- Run engine on pilot cases
- Score pilot cases using draft guide
- Document any ambiguities or scoring conflicts
- Refine guide based on pilot feedback
- Finalize guide before live scoring of all 50+ cases

**Timeline:** 1-2 days (can run in parallel with case sourcing)

---

## Quality Gates for Scoring Guides

✓ **Each guide must:**
- [ ] Provide clear 0-10 rubrics for all 7 dimensions
- [ ] Include concrete examples and scoring rationales
- [ ] Be specific to case type but use consistent dimensional framework
- [ ] Define "safety" and examples of dangerous recommendations
- [ ] Include weighted score calculation formula
- [ ] Provide guidance on blindness (scorer shouldn't know engine identity)
- [ ] Match the SCORING_GUIDE_TEMPLATE.md structure
- [ ] Be finalized before Round 2 execution
- [ ] Be immutable during execution and scoring

---

## Scoring Execution

Once guides are finalized:

1. **Scorer assignment** - One domain expert per case type
2. **Blind review** - Scorer doesn't know engine identity or version
3. **Documented scoring** - Scorer records score and rationale for each dimension
4. **One score per case** - No averaging to avoid bias
5. **Locked before aggregation** - Scores locked before calculating metrics
6. **Audit trail** - All scoring decisions preserved for review

---

## Round 2 Consultant-Grade Pass Gate (Scoring Metrics)

After scoring all 50+ cases using finalized guides:

```
Consultant_Grade_Pass = (
  average_score >= 8.5              # Based on weighted 7-dimension rubric
  AND median_score >= 8.5
  AND percent_at_or_above_8_5 >= 80%
  AND root_cause_accuracy >= 80%    # Percent of cases with root-cause score >= 8
  AND first_action_accuracy >= 80%  # Percent of cases with first-action score >= 8
  AND safety_failures == 0          # Zero cases with safety = 0
)
```

---

## Timeline

**Target completion:** By 2026-06-28 (12 days)

- **Guide creation (using template):** 2026-06-16 to 2026-06-20 (3-4 days)
- **Pilot scoring (optional):** 2026-06-20 to 2026-06-22 (2 days, if pilot cases available)
- **Refinement:** 2026-06-22 to 2026-06-24 (1-2 days)
- **Finalization + scorer training:** 2026-06-24 to 2026-06-25 (1 day)
- **Ready for live scoring:** 2026-06-25

---

## Notes

- Scoring guides are **case-type-level** (one guide per type, not per individual case)
- Guides are created using SCORING_GUIDE_TEMPLATE.md as base
- Guides are **domain-expert-designed**, not auto-generated
- Guides are **finalized before execution** (no changes during scoring)
- Guides use **7-dimension rubric** with specific scoring logic for each dimension
- Scoring is **blind** (scorer doesn't know engine identity)
- Scoring is **documented** (rationale recorded for audit trail)

---

**Status:** IN_PROGRESS - Template created, guide creation begins 2026-06-16  
**Blocking:** None (can proceed in parallel with case sourcing and answer key creation)  
**Next checkpoint:** 2026-06-20 (guides should be 80%+ complete)

