# Simulation Case Batch 5 Report

**Version:** 1.0  
**Date:** 2026-06-23  
**Phase:** OPTION-A Phase D  
**Batch:** 5 (SIM-14-001 to SIM-14-011)

---

## 1. Batch Overview

Batch 5 adds 11 new simulation cases to the real-world simulation corpus, expanding coverage from 38 to 49 cases across the following root cause categories:

| Case ID | Title | Root Cause | Industry |
|---------|-------|-----------|----------|
| SIM-14-001 | Hardware Retailer Pricing Frozen While Costs Rose | pricing_frozen_while_input_costs_inflated_compressing_margin_to_unviable_level | Retail hardware |
| SIM-14-002 | Cafe Franchise Royalty and Levy Consuming All Operating Profit | franchise_fee_structure_consuming_operating_margin_leaving_no_owner_return_at_current_revenue_level | Hospitality / cafe franchise |
| SIM-14-003 | Courier Business Owner Delivering Due to Driver Turnover | owner_capacity_consumed_by_operations_due_to_driver_retention_failure_blocking_business_development | Courier and logistics |
| SIM-14-004 | Landscaping Seasonal Revenue Gap Not Managed With Fixed Costs | seasonal_revenue_gap_not_matched_to_cost_structure_creating_structural_annual_cash_deficit | Landscaping |
| SIM-14-005 | Two-Owner Restaurant Partnership Dispute Creating Paralysis | partnership_governance_failure_causing_operational_paralysis_and_talent_departure | Hospitality / restaurant |
| SIM-14-006 | Residential Electrician Systematic Labour Hour Underestimation | labour_hour_underestimation_in_quoting_causing_systematic_margin_erosion_on_every_job | Electrical trades |
| SIM-14-007 | HVAC Company Negative Review Spiral Suppressing Enquiries | reputation_damage_from_unresolved_negative_review_cluster_suppressing_new_enquiry_volume | HVAC services |
| SIM-14-008 | Coffee Roaster Equipment Overinvestment Before Revenue Justified | capital_equipment_overinvestment_relative_to_revenue_base_creating_debt_service_burden_that_eliminates_operating_profit | Specialty food manufacturing |
| SIM-14-009 | B2B Cleaning Long-Term Clients Charged at Eight-Year-Old Rates | legacy_client_pricing_below_market_rate_dragging_blended_margin_without_owner_awareness_of_cross_subsidy | Commercial cleaning |
| SIM-14-010 | Fashion Retailer Inventory Write-Offs Not in Reported Margins | inventory_write_off_costs_excluded_from_cogs_calculation_producing_overstated_reported_margin_and_unexplained_cash_deficit | Retail fashion |
| SIM-14-011 | Retail Strip Anchor Tenant Loss Collapsing Foot Traffic | anchor_tenant_vacancy_causing_foot_traffic_collapse_that_threatens_viability_of_remaining_tenant_base | Retail property |

---

## 2. New Root Cause Coverage

All 11 cases introduce primary root causes not previously represented in the corpus (SIM-01 through SIM-13). No existing root cause was duplicated.

New business condition categories covered:
- GOVERNANCE_FAILURE (SIM-14-005)
- DEMAND_FAILURE / reputational (SIM-14-007, SIM-14-011)
- COST_STRUCTURE_MISMATCH / franchise (SIM-14-002)
- COST_STRUCTURE_MISMATCH / equipment overinvestment (SIM-14-008)
- CASH_STRESS / seasonal mismatch (SIM-14-004)
- MARGIN_EROSION / pricing freeze (SIM-14-001, SIM-14-009, SIM-14-010)
- MARGIN_EROSION / quoting error (SIM-14-006)
- CAPACITY_CONSTRAINT / owner-ops bottleneck due to retention failure (SIM-14-003)

---

## 3. Anti-Tuning Compliance

- Cases were authored independently of engine source code
- Cases were authored independently of existing `must_identify` vocabulary
- `leakage_check_passed: false` on all cases (pending automated check)
- No scoring weights or thresholds were modified to accommodate new cases
- Pass threshold remains 0.70
- Scoring dimensions unchanged

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

## 5. Corpus State After Batch 5

| Metric | Value |
|--------|-------|
| Total cases | 49 |
| Batches | SIM-01 through SIM-14 |
| Industries covered | 26+ distinct industries |
| Root cause categories | 26+ distinct primary root causes |

---

*This report documents OPTION-A Phase D Batch 5 corpus expansion.*
