# OpsIQ Engine Remediation Plan — Executive Summary

**Date:** 2026-06-16  
**Status:** REMEDIATION_PLAN_READY_FOR_USER_REVIEW  
**Plan Scope:** Evidence-based fixes to bring engine from 5.21/10 → 8.0-8.5/10 (consultant-grade)

---

## CURRENT STATE (Round 1 Corrected)

| Metric | Value |
|--------|-------|
| Average Score | 5.21/10 |
| Median Score | 5.00/10 |
| Pass Rate | 0/50 (threshold ≥8.5) |
| Safety | ✓ PASS (0 dangerous, <2% hallucination) |

---

## DIAGNOSIS

**Two failure modes identified:**

1. **DIAGNOSIS_COVERAGE_GAP (10 cases):** Engine cannot diagnose root cause
   - Current archetypes: 3 (OPERATIONAL_BOTTLENECK, QUALITY_CONTROL_FAILURE, CUSTOMER_RETENTION_EROSION)
   - Missing archetypes: brand_perception, unit_economics, demand_forecasting, go_to_market, strategic_pricing
   - Result: Returns INSUFFICIENT_EVIDENCE
   - Average score: 6.03/10

2. **DIMENSION_COVERAGE_GAP (40 cases):** Engine provides output but fails on substance
   - Weak root_cause_match (4.46/10)
   - Weak first_priority_action (4.40/10)
   - Generic interventions instead of case-specific best actions
   - Average score: 5.00/10

---

## RECOMMENDED FIX

**Hybrid Architecture (4 slices + safety governance):**

```
Option 1: Expand archetypes from 3 → 5+
Option 2: Add numeric calculation layer (financial formulas)
Option 3: Add business dimension classifier (evidence routing)
Option 4: Add case-library retrieval (pattern learning)
Option 5: Enhanced safety governance (harm detection)
```

**Combined Expected Improvement (Forecast):** 5.21 → **8.0-8.5/10** (requires Round 2 validation to confirm)

---

## BUILD PLAN

| Slice | What | Effort | Score Lift |
|---|---|---|---|
| 1 | Expand archetypes | 2-3 days | +0.9-1.1 |
| 2 | Add numeric layer | 3-4 days | +0.4-0.6 |
| 3 | Dimension classifier | 2 days | +0.5 |
| 4 | Case retrieval | 4-5 days | +0.6-0.8 |
| 5 | Safety governance | 2-3 days | +0 (safety only) |

**Total:** 13-18 engineering days (3-4 weeks parallel testing)

---

## WHY THIS PLAN

✅ **Evidence-based:** Directly addresses Round 1 failure patterns (10 DIAGNOSIS_COVERAGE_GAP + 40 DIMENSION_COVERAGE_GAP)  
✅ **Safe:** Maintains 0 dangerous recommendations, <2% hallucination (with proper numeric guards)  
✅ **Deterministic:** No LLM hallucination risk (foundational building first)  
✅ **Testable:** Each slice has clear acceptance tests  
⚠️  **Overfitting guard:** Case-library extraction deferred to Round 2 (avoid Round 1 leakage)  
⚠️  **Forecast-driven:** Score lift claims (+0.9 to +0.8) are estimates, not commitments. Require Round 2 validation.  

---

## DECISION REQUIRED

**Authorize:** Begin Slice 1 (expand archetypes) in production engineering

**Prerequisites:**
- Assign 1 backend engineer + 1 QA
- Confirm Round 2 case pack ready (50+ fresh cases) — MANDATORY before Slice 4
- 3-4 week sprint timeline
- Agree: Score lift forecasts are estimates. Consultant-grade claims require Round 2 ≥80% pass rate.

**Phase 1 Expected Outcome (Round 1 Revalidation):** 5.21/10 baseline maintained, no regression, targeted cases improve (RW-001, RW-006, PD cases)

**Phase 2 Expected Outcome (Round 2 Validation — REQUIRED for consultant-grade):** 50+ fresh cases, ≥80% pass rate at ≥8.5/10 (proves generalization)

---

For detailed technical plan, see: `REMEDIATION_PLAN_FULL.md`
