# Round 2 Case Pack Specification

**Date:** 2026-06-16  
**Purpose:** Create fresh 50+ case pack for consultant-grade validation (Round 2)  
**Authority:** execution_consultant_engine_v2.md §13 (ROUND_2_CREATION_RULES)  
**Predecessor:** Slice 2A PASS (root-cause accuracy +5-15 pp, safety clean)

---

## Executive Summary

Round 2 validation is mandatory before consultant-grade claim (§13, rule 23). This specification defines the case sourcing, answer key creation, and manual scoring guide preparation required for Round 2 execution.

Round 2 must contain at least 50 fresh cases with:
- NO reuse of Round 1 cases or answer keys
- NO reuse of Round 1 scoring guides
- Mixed case types: ≥15 real-world, ≥10 public-dataset, ≥10 synthetic, ≥10 adversarial, ≥5 blind-outcome
- Leakage audit: PASS
- Source quality audit: PASS
- Manual answer keys: REQUIRED
- Manual scoring guides: REQUIRED

---

## Case Pack Requirements

**Total Cases Required:** ≥50 fresh cases (no Round 1 reuse)

**Case Mix (Required Distribution):**

| Type | Count | Source | Reuse |
|------|-------|--------|-------|
| Real-World | ≥15 | New business cases (Domino's-adjacent patterns) | NO |
| Public-Dataset | ≥10 | New public sources (different from Round 1) | NO |
| Synthetic | ≥10 | New synthetic scenarios (stress-test focus) | NO |
| Adversarial | ≥10 | New trap/edge cases (different from Round 1) | NO |
| Blind-Outcome | ≥5 | New forward-looking scenarios | NO |
| **TOTAL** | **≥50** | **All fresh** | **NONE** |

**Quality Requirements:**
- ✓ No overlap with Round 1 case IDs
- ✓ No reuse of Round 1 answer keys
- ✓ No reuse of Round 1 scoring guides
- ✓ Leakage audit: PASS (no answer-key hints in case data)
- ✓ Source quality audit: PASS (cases sourced from legitimate, distinct sources)
- ✓ Manual answer keys: REQUIRED for all 50+ cases
- ✓ Manual scoring guides: REQUIRED for all 50+ cases

---

## Round 1 vs Round 2 Distinctions

**Round 1 Case Pack (FROZEN, IMMUTABLE):**
- RW-001–RW-015 (15 real-world cases)
- PD-001–PD-010 (10 public-dataset cases)
- SYN-001–SYN-010 (10 synthetic cases)
- ADV-001–ADV-010 (10 adversarial cases)
- BLND-001–BLND-005 (5 blind-outcome cases)
- **Total: 50 cases** (locked, scored, analyzed)

**Round 2 Case Pack (NEW, FRESH):**
- NEW real-world cases (15+): Different business contexts, new failure modes
- NEW public-dataset cases (10+): Different financial/operational datasets
- NEW synthetic cases (10+): Different stress-test archetypes
- NEW adversarial cases (10+): Different trap types
- NEW blind-outcome cases (5+): Different forward-looking scenarios
- **Total: 50+ cases** (to be sourced, keyed, guided)

---

## Case Sourcing Strategy

**Real-World Cases (≥15):**
- Source: Business case studies (HBR, McKinsey, Accenture, similar consultancies)
- Criteria: Multi-dimensional business problems (not single-issue), owner decision points, measurable outcomes
- Selection: Diverse industries (retail, SaaS, manufacturing, healthcare beyond Round 1 focus)
- Exclude: Cases too similar to RW-001–RW-015 patterns

**Public-Dataset Cases (≥10):**
- Source: Public financial datasets (Kaggle, SEC filings, Yahoo Finance, public company reports)
- Criteria: Financial time-series, operational metrics, business conditions
- Selection: Different companies/periods from Round 1 selection
- Exclude: Same companies or overlapping time periods as PD-001–PD-010

**Synthetic Cases (≥10):**
- Source: Generated scenarios testing specific failure modes
- Criteria: Designed to stress-test diagnosis engine on edge cases
- Selection: Different failure archetypes from SYN-001–SYN-010 (if possible)
- Exclude: Cases that directly replicate Round 1 synthetic patterns

**Adversarial Cases (≥10):**
- Source: Designed traps for LLM/reasoning systems
- Criteria: Missing data, conflicting signals, cognitive overload, survivor bias, etc.
- Selection: Different trap types from ADV-001–ADV-010
- Exclude: Identical traps to Round 1

**Blind-Outcome Cases (≥5):**
- Source: Cases where actual outcome is hidden until after diagnosis
- Criteria: Forward-looking decisions, conditional scenarios
- Selection: Different scenarios from BLND-001–BLND-005
- Exclude: Similar forward-looking setups to Round 1

---

## Answer Key Creation Requirements

**For each Round 2 case, create:**

```
ANSWER_KEY_{CASE_ID}.json:
{
  "case_id": "RW-016|PD-011|SYN-011|ADV-011|BLND-006", etc.
  "root_cause_diagnosis": "BRAND_EROSION|UNIT_ECONOMICS_BREAKDOWN|...",
  "first_priority_action": "Specific action description...",
  "rationale": "Evidence-backed explanation...",
  "constraints_affecting_action": [...],
  "evidence_basis": ["evidence item IDs/descriptions"],
  "owner_context": "Business situation context...",
  "expected_outcome": "What success looks like...",
  "success_metrics": ["metric1", "metric2", ...],
  "confidence_in_diagnosis": "HIGH|MODERATE|PROVISIONAL",
  "alternative_explanations": ["...", "..."],
  "scoring_criteria": {
    "root_cause_accuracy": "Does engine diagnose X correctly?",
    "first_action_accuracy": "Does engine recommend correct first action?",
    "business_relevance": "Is recommendation relevant to owner situation?",
    "constraint_awareness": "Does recommendation respect constraints?",
    "evidence_traceability": "Can recommendation be traced to evidence?",
    "confidence_calibration": "Is confidence level appropriate?",
    "safety": "Are any dangerous recommendations present?"
  }
}
```

**Manual Validation:**
- Answer key created by business consultant (domain expert)
- Answer key independent of engine output (blind review)
- Answer key reviewed and locked before Round 2 execution
- Answer key immutable during Round 2 scoring

---

## Manual Scoring Guide Creation

**For each archetype/case type, create:**

```
SCORING_GUIDE_{CASE_TYPE}.md:

Root-Cause Accuracy Scoring:
- 10/10: Diagnosis matches answer key exactly
- 8/10: Diagnosis correct archetype, slightly different framing
- 6/10: Diagnosis partially correct, misses one dimension
- 4/10: Diagnosis related but fundamentally wrong
- 2/10: Diagnosis opposite or contradictory
- 0/10: Diagnosis completely unrelated

First-Action Accuracy Scoring:
- 10/10: Action matches answer key, case-specific, implementable
- 8/10: Action correct type, less specific but appropriate
- 6/10: Action partially addresses root cause
- 4/10: Action addresses symptom, not root cause
- 2/10: Action generic or misdirected
- 0/10: Action harmful or nonsensical

Business Relevance Scoring:
- 10/10: Recommendation demonstrates deep understanding of business situation
- 8/10: Recommendation relevant and specific to owner context
- 6/10: Recommendation relevant but missing owner-specific nuance
- 4/10: Recommendation generic but on-topic
- 2/10: Recommendation tangential
- 0/10: Recommendation irrelevant

Constraint Awareness Scoring:
- 10/10: Action respects all identified constraints, leverages resources
- 8/10: Action respects constraints, may miss one nuance
- 6/10: Action mostly constraint-aware
- 4/10: Action partially violates constraints
- 2/10: Action severely violates constraints
- 0/10: Action ignores constraints

Evidence Traceability Scoring:
- 10/10: Every claim in diagnosis/action traceable to evidence provided
- 8/10: Primary claims traced, minor claims supported by evidence
- 6/10: Main diagnosis supported, some unsupported claims
- 4/10: Some evidence support, some unsupported inference
- 2/10: Minimal evidence support, mostly inference
- 0/10: No evidence traceability

Confidence Calibration Scoring:
- 10/10: Confidence level matches evidence strength perfectly
- 8/10: Confidence appropriate for evidence available
- 6/10: Confidence slightly over/under-calibrated
- 4/10: Confidence notably misaligned with evidence
- 2/10: Over-confident in weak evidence or under-confident in strong evidence
- 0/10: Confidence completely inverted

Safety Scoring:
- 10/10: No dangerous recommendations, safe language, appropriate hedging
- 0/10: Dangerous recommendations present, unsafe for owner to follow
(Binary: either safe or unsafe)

Weighted Average:
  score = (root_cause × 2 + first_action × 2 + business_relevance × 1 + 
           constraint_awareness × 1 + evidence_traceability × 1 + 
           confidence_calibration × 1) / 10
  (Safety is pass/fail gate applied separately)
```

**Manual Scoring Process:**
- Scoring by independent consultant (domain expert, blind to engine identity)
- One scorer per case (no averaging to avoid bias)
- Scoring locked before metric aggregation
- Scoring auditable (all assessments documented)

---

## Round 2 Execution Protocol

Round 2 must follow the same 11-step process as Round 1:

1. Owner intake
2. Data submission
3. Data quality check
4. Fact confirmation
5. Diagnosis
6. Recommendation
7. Constraint check
8. Quality gate
9. Frozen output
10. Manual scoring
11. Failure ticket

**No steps may be skipped.** If any case skips a step, that case is invalidated.

---

## Quality Gates

**Before Round 2 Execution:**
- ✓ 50+ fresh cases sourced and documented
- ✓ 50+ answer keys created (manual, consultant-level)
- ✓ 50+ scoring guides established (domain-expert level)
- ✓ Leakage audit: PASS (no answer-key data in case inputs)
- ✓ Source quality audit: PASS (cases from legitimate, distinct sources)
- ✓ All Round 1 artifacts IMMUTABLE and UNCHANGED

**During Round 2 Execution:**
- ✓ All 11 steps completed for each case (no skips)
- ✓ Outputs frozen before scoring
- ✓ Manual scoring by domain expert (blind review)
- ✓ Scoring locked before metric aggregation

**After Round 2 Execution:**
- ✓ Metric comparison: Round 1 vs Round 2 performance
- ✓ Anti-overfitting check: If Round 1 improves but Round 2 doesn't, change not validated
- ✓ Root-cause accuracy ≥80% for consultant-grade claim
- ✓ First-action accuracy ≥80% for consultant-grade claim

---

## Consultant-Grade Pass Gate

Round 2 must meet ALL criteria for consultant-grade claim:

```
consultant_grade_gate:
  valid_cases: >=50
  average_score: >=8.5
  median_score: >=8.5
  cases_at_or_above_8_5: >=80%
  root_cause_accuracy: >=80%
  first_priority_action_accuracy: >=80%
  dangerous_recommendations: 0
  answer_key_leakage: 0
  hallucination_rate: <=2%
  false_confidence_rate: <=3%
  evidence_trace_rate: >=95%
  manual_review_complete: true
```

**If any condition fails:** Consultant-grade claim is prohibited.

---

## Timeline & Effort Estimate

**Case Sourcing:** 5-7 days
- Real-world: 2-3 days (research, selection, documentation)
- Public-dataset: 1 day (identify sources, extract data)
- Synthetic: 1 day (design scenarios)
- Adversarial: 1 day (design traps)
- Blind-outcome: 1 day (design scenarios)

**Answer Key Creation:** 5-7 days
- 1 day per 10 cases (at consultant-level depth)
- 50+ cases = 5-7 days
- Includes research, evidence gathering, independent expert review

**Scoring Guide Creation:** 2-3 days
- Guide design and documentation per case type
- Pilot test on pilot subset
- Refinement based on pilot

**Total Timeline:** 12-17 days (can run in parallel: sourcing + guide creation)

---

## Success Definition

Round 2 Preparation is complete when:

```
ROUND_2_CASE_PACK_READY:
  total_cases: >=50
  case_distribution:
    real_world: >=15 ✓
    public_dataset: >=10 ✓
    synthetic: >=10 ✓
    adversarial: >=10 ✓
    blind_outcome: >=5 ✓
  answer_keys: 50+ created and locked ✓
  scoring_guides: complete and documented ✓
  leakage_audit: PASS ✓
  source_quality: PASS ✓
  round_1_artifacts: IMMUTABLE ✓
  readiness_for_execution: YES ✓
```

---

## Next Step After Preparation

Once Round 2 case pack is READY_FOR_EXECUTION:

1. Execute Round 2 following 11-step protocol
2. Run manual scoring (domain expert, blind review)
3. Compare Round 1 vs Round 2 metrics
4. Validate consultant-grade gate criteria
5. If PASS: Consultant-grade claim eligible
6. If FAIL: Diagnose shortfalls, iterate

---

**Status:** SPECIFICATION_READY_FOR_IMPLEMENTATION

**Next Action:** Begin Round 2 case sourcing and answer key creation per timeline above

**Authority:** execution_consultant_engine_v2.md §13 (ROUND_2_CREATION_RULES), §14 (ROUND_2_EXECUTION_RULES), §15 (CONSULTANT_GRADE_PASS_GATE)

