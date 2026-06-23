# Simulation Case Batch 6 Report

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase D  
**Batch:** 6 (SIM-15-001 to SIM-15-011)

---

## 1. Batch Overview

Batch 6 adds 11 new simulation cases to the real-world simulation corpus, expanding from 49 to 60 cases.

| Case ID | Title | Root Cause | Industry |
|---------|-------|-----------|----------|
| SIM-15-001 | Hospitality Group Undisclosed Wage Underpayment Liability | undisclosed_wage_underpayment_liability_representing_unquantified_financial_and_regulatory_risk | Hospitality group |
| SIM-15-002 | Industrial Supplier Single-Source Dependency Delivery Failure | single_source_supply_dependency_creating_concentration_risk_that_materialized_as_delivery_failure | Industrial supply |
| SIM-15-003 | Consulting Firm Professional Indemnity Gap After Client Dispute | professional_indemnity_coverage_gap_and_exclusion_creating_uninsured_personal_liability_exposure_in_excess_of_policy_limit | Management consulting |
| SIM-15-004 | Plumbing Business Owner Deferring Tax and Superannuation | accumulated_tax_and_superannuation_deferral_creating_compounding_statutory_debt_exceeding_operational_cash_flow_capacity | Plumbing trades |
| SIM-15-005 | SaaS Startup Misaligned Founder Incentives Underdelivery | post_vesting_co_founder_disengagement_creating_single_point_of_technical_capability_failure_with_no_contractual_enforcement_mechanism | B2B SaaS |
| SIM-15-006 | Mortgage Broker Referral Network Aged Out No Pipeline Replacement | referral_network_attrition_without_replacement_causing_structural_pipeline_decline_misattributed_to_market_conditions | Financial services |
| SIM-15-007 | B2B Software Product-Market Fit Failure After Two Years | product_built_for_real_but_low_prevalence_problem_in_target_segment_creating_addressable_market_smaller_than_viable | B2B software |
| SIM-15-008 | Specialty Foods Distributor Cash Tied Up in Slow-Moving Stock | slow_moving_inventory_tying_up_working_capital_at_carrying_cost_exceeding_margin_contribution_of_low_velocity_skus | Specialty food distribution |
| SIM-15-009 | Construction Subcontractor Incorrect Job Costing Underestimation | job_costing_error_applying_markup_to_materials_only_while_recovering_labour_and_subcontractor_costs_at_cost_producing_understated_blended_margin | Construction subcontracting |
| SIM-15-010 | Food Manufacturer Supplier Price Rise Absorbed Without Repricing | input_cost_inflation_absorbed_without_client_repricing_due_to_retailer_relationship_fear_compressing_gross_margin_to_below_viable_level | Food manufacturing |
| SIM-15-011 | IT Project Firm Scope Creep Accepted Without Variation Orders | scope_creep_absorbed_without_variation_orders_converting_fixed_price_project_margin_into_time_and_materials_delivery_without_equivalent_billing | IT consulting |

---

## 2. New Root Cause Coverage

All 11 cases introduce primary root causes not previously represented in the corpus (SIM-01 through SIM-14). New categories:

- Regulatory and compliance liability (SIM-15-001, SIM-15-003, SIM-15-004)
- Supply chain concentration risk (SIM-15-002)
- Founder governance failure (SIM-15-005)
- Channel concentration / pipeline attrition (SIM-15-006)
- Product-market fit failure post-launch (SIM-15-007)
- Inventory working capital trap (SIM-15-008)
- Job costing methodology error (SIM-15-009)
- Input cost absorption without repricing (SIM-15-010)
- Scope creep without commercial recovery (SIM-15-011)

---

## 3. Anti-Tuning Compliance

- Cases authored independently of engine source code
- Cases authored independently of existing `must_identify` vocabulary
- `leakage_check_passed: false` on all cases (pending automated check)
- No scoring weights or thresholds were modified
- Pass threshold remains 0.70

---

## 4. Schema Validation

All 11 cases passed JSONL schema validation:
- Valid JSON on each line
- No duplicate `case_id` values
- All required fields present
- `must_identify` lists have ≥ 3 items
- `bad_recommendations_to_flag` lists have ≥ 3 items
- `missing_inputs_opsiq_should_request` lists have ≥ 3 items

---

## 5. Corpus State After Batch 6

| Metric | Value |
|--------|-------|
| Total cases | 60 |
| Batches | SIM-01 through SIM-15 |
| Target (Phase D) | 60+ ✓ |
| Industries covered | 35+ distinct industries |
| Root cause categories | 35+ distinct primary root causes |

**Phase D target of 60+ cases: ACHIEVED.**

---

*This report documents OPTION-A Phase D Batch 6 corpus expansion.*
