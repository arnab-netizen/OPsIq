# Phase 5 — Independent Holdout Validation: First-Run Report

**Date:** 2026-06-23  
**Branch:** `claude/cool-ptolemy-dxrpm7`  
**Run timestamp:** 2026-06-23T06:06:31.354Z  
**Anti-tuning declaration:** Engine and composer were not modified between holdout case authoring and this first run. Results are verbatim.

---

## Summary

| Metric | Value |
|--------|-------|
| Total cases | 10 |
| Pass | **1** |
| Fail | 9 |
| First-run pass rate | **10.0%** |
| Average score | 0.458 |
| Bad rec failures (HOL_TRAP_TAKEN) | 2 |
| HOL_ENGINE_GAP | 7 |
| HOL_SCORING_LIMITATION | 0 |
| Unsafe recommendations | 0 |

---

## Per-Case Results (verbatim)

### HOL-01-001 — Landscaping Contractor — Outstanding Invoices Bridged by Personal Credit
- **Result:** PASS
- **Total score:** 0.850
- **rootCause:** 0.800 — matched: debtors aged by client, slow-paying clients, cash shortfall at payroll, 120 day overdue invoice
- **firstAction:** 0.830
- **missingInputRequests:** 1.000
- **badRecAvoidance:** PASS
- **evidenceDiscipline:** PASS
- **Diagnosed archetype:** working_capital_stress
- **Missing terms:** payment terms misaligned

---

### HOL-02-001 — Artisan Bakery — Ingredient Cost Inflation Compressing Margin
- **Result:** HOL_ENGINE_GAP
- **Total score:** 0.620
- **rootCause:** 0.200 — matched: no per-product cost tracking
- **firstAction:** 0.500
- **missingInputRequests:** 1.000
- **badRecAvoidance:** PASS
- **evidenceDiscipline:** PASS
- **Diagnosed archetype:** margin_erosion
- **Critical failures:** rootCause
- **Missing terms:** ingredient cost increase not passed through, pricing held below cost recovery, gross margin compression, price increase required
- **Classification note:** Engine correctly identifies margin_erosion archetype but the sub-mechanism sentence does not contain the specific cost-inflation vocabulary required by the scoring rubric. rootCause score 0.200 triggers HOL_ENGINE_GAP classification.

---

### HOL-03-001 — Personal Training Studio — Negative Unit Economics at Full Occupancy
- **Result:** HOL_ENGINE_GAP
- **Total score:** 0.620
- **rootCause:** 0.200 — matched: fixed costs exceed revenue at full capacity
- **firstAction:** 0.670
- **missingInputRequests:** 1.000
- **badRecAvoidance:** PASS
- **evidenceDiscipline:** PASS
- **Diagnosed archetype:** margin_erosion
- **Critical failures:** rootCause
- **Missing terms:** breakeven member count not established, owner wage excluded from cost model, price increase required before adding capacity, negative unit economics
- **Classification note:** Engine diagnoses margin_erosion rather than unit_economics_failure. The must_identify terms are unit-economics-specific vocabulary not produced by the margin_erosion sub-mechanism sentences. The case is a genuine engine archetype gap — the unit economics failure scenario at full capacity is not distinguished from margin erosion in the current engine output.

---

### HOL-04-001 — Accounting Practice — Referral Pipeline Collapse
- **Result:** HOL_ENGINE_GAP
- **Total score:** 0.180
- **rootCause:** 0.000 — no terms matched
- **firstAction:** 0.000
- **missingInputRequests:** 0.000
- **badRecAvoidance:** PASS
- **evidenceDiscipline:** FAIL
- **Diagnosed archetype:** unknown
- **Critical failures:** evidenceDiscipline; rootCause
- **Missing terms:** referral sources retired or inactive, no active lead generation, new client volume collapsed, pipeline not tracked, referral dependency without replacement
- **Classification note:** Engine produced no primary diagnosis. The demand_generation_failure detection patterns did not trigger from the sidecar evidence. The evidence items use market_position dimension with `newCustomerRate=4` but the detection pattern may require different numerical triggers or vocabulary. SIM_ENGINE_GAP.

---

### HOL-05-001 — Fine Dining Restaurant — Head Chef Departure Risk
- **Result:** HOL_ENGINE_GAP
- **Total score:** 0.180
- **rootCause:** 0.000 — no terms matched
- **firstAction:** 0.000
- **missingInputRequests:** 0.000
- **badRecAvoidance:** PASS
- **evidenceDiscipline:** FAIL
- **Diagnosed archetype:** unknown
- **Critical failures:** evidenceDiscipline; rootCause
- **Missing terms:** single key person controls delivery, no documented recipes or procedures, departure risk imminent, revenue dependent on one individual, knowledge not transferable without documentation
- **Classification note:** Engine produced no primary diagnosis. The key_person_dependency detection patterns did not trigger from the sidecar evidence. The evidence items use team_capability dimension with `keyPersonCount=1` but the detection pattern did not fire. HOL_ENGINE_GAP.

---

### HOL-06-001 — Wedding Photography Studio — Post-Production Backlog Caps Bookings
- **Result:** HOL_ENGINE_GAP
- **Total score:** 0.500
- **rootCause:** 0.000 — no terms matched
- **firstAction:** 0.500
- **missingInputRequests:** 1.000
- **badRecAvoidance:** PASS
- **evidenceDiscipline:** PASS
- **Diagnosed archetype:** operational_bottleneck
- **Critical failures:** rootCause
- **Missing terms:** owner capacity ceiling, post-production bottleneck, delegation gap in editing, throughput constrained by single person, backlog causing client risk
- **Classification note:** Engine correctly identifies operational_bottleneck archetype. rootCause score is 0.000 because the sub-mechanism sentence produced by the engine does not contain any of the 5 must_identify terms specific to a creative-services post-production scenario. The engine produces generic operational bottleneck text rather than the specific vocabulary in the scoring rubric. HOL_ENGINE_GAP.

---

### HOL-07-001 — Dental Practice — Equipment Loan Repayment Exceeding Operating Capacity
- **Result:** HOL_TRAP_TAKEN
- **Total score:** 0.560
- **rootCause:** 0.600 — matched: debt service exceeds operating cash, operating cash before debt not established, cash deficit structural not temporary
- **firstAction:** 0.500
- **missingInputRequests:** 1.000
- **badRecAvoidance:** FAIL
- **evidenceDiscipline:** PASS
- **Diagnosed archetype:** debt_solvency_pressure
- **Critical failures:** badRecommendationAvoidance
- **Missing terms:** loan proceeds insufficient to cover repayment, personal guarantee at risk
- **Classification note:** Engine correctly identifies debt_solvency_pressure and achieves 0.600 rootCause score. A bad recommendation from the bad_recommendations_to_flag list was triggered in the output, causing HOL_TRAP_TAKEN. This is a vocabulary collision in the DEBT_SYMPTOM_LOAN sub-mechanism sentence or first action.

---

### HOL-08-001 — B2B SaaS — Monthly Net Revenue Churn Destroying Growth
- **Result:** HOL_ENGINE_GAP
- **Total score:** 0.180
- **rootCause:** 0.000 — no terms matched
- **firstAction:** 0.000
- **missingInputRequests:** 0.000
- **badRecAvoidance:** PASS
- **evidenceDiscipline:** FAIL
- **Diagnosed archetype:** unknown
- **Critical failures:** evidenceDiscipline; rootCause
- **Missing terms:** churn rate equals new acquisition rate, net revenue churn unsustainable, onboarding completion not tracked, lifetime value declining, churn cause not diagnosed
- **Classification note:** Engine produced no primary diagnosis. The customer_retention_erosion detection patterns did not trigger. HOL_ENGINE_GAP.

---

### HOL-09-001 — Commercial Cleaning Business — Quality Inconsistency Driving Contract Loss
- **Result:** HOL_ENGINE_GAP
- **Total score:** 0.180
- **rootCause:** 0.000 — no terms matched
- **firstAction:** 0.000
- **missingInputRequests:** 0.000
- **badRecAvoidance:** PASS
- **evidenceDiscipline:** FAIL
- **Diagnosed archetype:** unknown
- **Critical failures:** evidenceDiscipline; rootCause
- **Missing terms:** quality inconsistency between teams, no inspection or checklist process, contract churn driven by quality, complaint pattern not tracked, new wins masking underlying churn
- **Classification note:** Engine produced no primary diagnosis. The quality_control_failure detection patterns did not trigger. HOL_ENGINE_GAP.

---

### HOL-10-001 — IT Managed Services — Labour Cost Scaling Ahead of Revenue
- **Result:** HOL_TRAP_TAKEN
- **Total score:** 0.710
- **rootCause:** 0.800 — matched: fixed price contracts underpriced, labour cost rising faster than revenue, no per-client margin tracking, actual hours exceeding contracted hours
- **firstAction:** 0.830
- **missingInputRequests:** 1.000
- **badRecAvoidance:** FAIL
- **evidenceDiscipline:** PASS
- **Diagnosed archetype:** margin_erosion
- **Critical failures:** badRecommendationAvoidance
- **Missing terms:** repricing required before further growth
- **Classification note:** Strong engine diagnosis with 0.800 rootCause. A bad recommendation was triggered despite 4/5 must_identify terms matched. The margin_erosion sub-mechanism sentence or first action contains vocabulary that collides with the bad_recommendations_to_flag list.

---

## Failure Classification Summary

| Classification | Count | Cases |
|----------------|-------|-------|
| PASS | 1 | HOL-01-001 |
| HOL_TRAP_TAKEN | 2 | HOL-07-001, HOL-10-001 |
| HOL_ENGINE_GAP | 7 | HOL-02-001, HOL-03-001, HOL-04-001, HOL-05-001, HOL-06-001, HOL-08-001, HOL-09-001 |

---

## Failure Root Causes

### Pattern 1: No engine diagnosis (4 cases — HOL-04-001, HOL-05-001, HOL-08-001, HOL-09-001)
The engine produced no primary diagnosis for demand_generation_failure, key_person_dependency, customer_retention_erosion, and quality_control_failure cases. The sidecar evidence items did not trigger the detection patterns for these archetypes. This is consistent with the simulation corpus findings where these archetypes have detection sensitivity gaps.

### Pattern 2: Correct archetype, wrong sub-mechanism vocabulary (3 cases — HOL-02-001, HOL-03-001, HOL-06-001)
The engine correctly identified the archetype but the sub-mechanism sentence produced does not contain the specific vocabulary in the scoring rubric. In HOL-03-001, the engine diagnosed margin_erosion for a case that is semantically unit_economics_failure — a genuine archetype boundary gap.

### Pattern 3: Bad recommendation triggered (2 cases — HOL-07-001, HOL-10-001)
Both are margin or debt cases where the engine output contains vocabulary that collides with the bad_recommendations_to_flag list. This is the same failure class as the TRAP_TAKEN cases in the simulation corpus.

---

## Anti-Tuning Declaration

These results are the unmodified first-run outputs. No engine changes, composer changes, or sidecar changes will be made in response to holdout results. Per Phase 5 rules, holdout results are sealed at this point.

---

## Phase 5 Completion Status

Phase 5 is complete. First-run report committed.  
Next phase: **Phase 6 — Owner Input Module**.
