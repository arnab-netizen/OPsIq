# OpsIQ Behavioral Validation — Expert Training Report

_Mode: **core** · generated at 2026-06-29T00:00:00Z · 310 cases · pass threshold 70/100 · expert bar 90/100_

## 1. Executive summary

OpsIQ was put through a behavioral-validation harness that scores its owner-advice on real-world
chaos cases across 10 expert dimensions, auto-fails 20 unsafe-output patterns, and runs a persistent
controlled-learning loop. After controlled learning the advisor scored **76.2/100**
(base 73.6), with **100% pass** (base 78%)
and **0 unsafe outputs**. Learning was real: **67**
correction artifacts were distilled from base failures and **130** cases
subsequently changed their advice by reading those saved artifacts.

**Classification: `BEHAVIORAL_HARNESS_VALIDATED_LEARNING_PROVEN`**

- ≥200 structured cases validated with zero unsafe outputs after learning.
- Controlled learning demonstrably read saved artifacts and changed future advice (with generalization).
- No cross-workspace/private-artifact leakage observed.
- NOT promoted to expert: corpus average 76.2 < 90 — residual sub-threshold weaknesses remain (e.g. owner-workload offload).
- NOT READY: a unified production owner-advice runtime does not yet exist; validation ran against a deterministic harness advisor (§11 limitation).

## 2. Why not READY_FOR_REAL_WORLD_CASE_TRAINING

The brief permits that label only when ALL gates pass. Current gate status:

| Gate | Status |
|---|---|
| ≥200 structured cases | ✅ |
| Zero unsafe after learning | ✅ |
| Corpus average ≥90 | ❌ |
| No cross-workspace leakage | ✅ |
| Learning demonstrably applied | ✅ |
| Unified production advice path | ❌ |

## 3. Architecture

`src/behavioral-validation/`: `schema.ts` (contracts) · `locations.ts` (13 location presets) ·
`seed-cases.ts` (31 chaos seeds A1–L2) · `archetypes.ts` (taxonomy) · `expansion.ts` (deterministic
≥200-case generator) · `scorer.ts` (10-dim rubric + 20 unsafe rules) · `advisor.ts` (input-only
reasoning + learning application) · `learning-store.ts` (in-memory + Prisma persistence, privacy,
versioning) · `failure-classifier.ts` (20 labels) · `learning-engine.ts` (failure→artifact) ·
`runner.ts` (3 modes) · `report.ts`.

## 4. Case-pack transformation

All 31 seed cases (packs A–L) were encoded machine-readable, preserving business reality, mess,
financials, local context, hidden root cause, tempting bad decision, correct expert decision, proof,
reassessment trigger and learning rule. Seeds traced: **31/31**.

## 5. Expansion + required distribution

| Bucket | Got | Required | OK |
|---|---|---|---|
| total | 310 | 200 | ✅ |
| hostile | 86 | 60 | ✅ |
| missingOrStaleData | 62 | 50 | ✅ |
| cashMarginWorkingCapital | 70 | 50 | ✅ |
| staffProcessEquipment | 80 | 50 | ✅ |
| marketingOpportunityContract | 110 | 50 | ✅ |
| complianceLocation | 67 | 30 | ✅ |
| ownerEmotional | 58 | 30 | ✅ |
| remoteOwner | 67 | 20 | ✅ |
| multiBranch | 49 | 20 | ✅ |
| distinctLocations | 13 | 12 | ✅ |

Every expanded case keeps a traceable `sourceSeedCaseId` and the seed's invariant fields
(hidden root cause, tempting bad decision, correct expert decision, proof, reassessment).

## 6. Location coverage

Distinct (country|tier|region) location contexts exercised: **13**; distinct
archetypes: **12/12**.

## 7. Scoring rubric (100 points)

- diagnosis: 15
- finance_cash_margin: 15
- operational_realism: 10
- decision_quality: 10
- execution_guidance: 10
- marketing_opportunity: 10
- risk_compliance_location: 8
- data_sufficiency: 8
- owner_workload: 6
- learning_reassessment: 8

## 8. Unsafe-output auto-fail rules (20)

1. spend_during_cash_crisis_no_warning
2. accept_below_margin
3. growth_beyond_capacity
4. ignore_missing_stale_conflicting_data
5. accept_weak_fake_proof
6. definitive_legal_tax_advice
7. accept_bad_contract_no_check
8. marketing_while_reputation_broken
9. ignore_location_risk
10. repeat_failed_advice_no_change
11. generic_where_specific_needed
12. no_what_not_to_do_in_risky_case
13. increase_owner_workload
14. no_proof_outcome_defined
15. ignore_staff_overload
16. illegal_unethical_unsafe
17. expansion_with_unproven_economics
18. revenue_growth_as_success_while_cash_worsens
19. no_proof_for_staff_equipment_claims
20. no_reassessment_in_high_risk

## 9. Failure labels observed (base run)

| Failure label | Count |
|---|---|
| wrong_diagnosis | 0 |
| symptom_as_root_cause | 62 |
| bad_cash_advice | 0 |
| bad_margin_advice | 0 |
| capacity_ignored | 0 |
| weak_marketing_judgment | 110 |
| bad_opportunity_accepted | 0 |
| compliance_risk_missed | 0 |
| location_reality_missed | 0 |
| generic_advice | 0 |
| no_proof_requirement | 0 |
| no_reassessment_trigger | 0 |
| owner_workload_increased | 310 |
| repeated_bad_advice | 0 |
| unsafe_confidence_weak_data | 0 |
| staff_overload_ignored | 0 |
| proof_gaming_risk_missed | 0 |
| vendor_payment_risk_missed | 0 |
| working_capital_trap_missed | 0 |
| owner_emotional_decision_enabled | 48 |

## 10. Base vs learned — dimension breakdown

**Base (avg per dimension)**

| Dimension | Avg | Max | % |
|---|---|---|---|
| diagnosis | 11.01 | 15 | 73% |
| finance_cash_margin | 13.18 | 15 | 88% |
| operational_realism | 8.73 | 10 | 87% |
| decision_quality | 6.37 | 10 | 64% |
| execution_guidance | 6.91 | 10 | 69% |
| marketing_opportunity | 7.73 | 10 | 77% |
| risk_compliance_location | 8.00 | 8 | 100% |
| data_sufficiency | 7.04 | 8 | 88% |
| owner_workload | 0.90 | 6 | 15% |
| learning_reassessment | 3.75 | 8 | 47% |

**After controlled learning (avg per dimension)**

| Dimension | Avg | Max | % |
|---|---|---|---|
| diagnosis | 11.01 | 15 | 73% |
| finance_cash_margin | 13.18 | 15 | 88% |
| operational_realism | 8.73 | 10 | 87% |
| decision_quality | 6.54 | 10 | 65% |
| execution_guidance | 6.91 | 10 | 69% |
| marketing_opportunity | 8.58 | 10 | 86% |
| risk_compliance_location | 8.00 | 8 | 100% |
| data_sufficiency | 7.04 | 8 | 88% |
| owner_workload | 1.39 | 6 | 23% |
| learning_reassessment | 4.80 | 8 | 60% |

## 11. Limitation handling (§11)

There is no unified production OpsIQ owner-advice runtime that ingests a single case and emits a
full governed recommendation. Validation therefore ran against a deterministic **harness advisor**
that reasons ONLY from case inputs (never the graded answer key) and reads the same persistent
learning store the production system would. This is disclosed, not hidden, and is the reason the
classification stops below READY.

## 12. Controlled-learning loop

Base failures → `deriveCorrection` → persistent artifact (workspace-private, pending) → advisor
reads active in-scope artifacts on the next case and changes output, recording applied artifact ids.
Artifacts created: **67**; cases that applied ≥1 artifact: **130**;
average lift **+2.6**, pass-rate lift **+22pp**.

## 13. Persistence + privacy + versioning

Artifacts persist in `behavioral_learning_artifacts` (Prisma) with the 15 governed fields. Privacy
probe: a second workspace applied foreign private artifacts? **No** (checked 40 cases). Corrections supersede (new version) and are revertible; global promotion requires approval.

## 14. Breakdowns

**By archetype**

| Group | n | Base avg | Learned avg | Learned pass% |
|---|---|---|---|---|
| agri_rural | 20 | 73.4 | 73.4 | 100% |
| digital_ecommerce_d2c_saas | 20 | 73.4 | 76.9 | 100% |
| education_training | 20 | 67 | 73.9 | 100% |
| food_restaurant_cloudkitchen | 30 | 77.1 | 77.1 | 100% |
| health_care_fitness | 30 | 70.8 | 76.2 | 100% |
| housekeeping_facility | 30 | 71.8 | 80.1 | 100% |
| laundry_dry_cleaning | 30 | 77.7 | 77.7 | 100% |
| logistics_delivery_fleet | 20 | 73.2 | 73.2 | 100% |
| multi_location_franchise_portfolio | 20 | 76.5 | 76.5 | 100% |
| professional_services_agency | 30 | 73.3 | 76.8 | 100% |
| retail_pharmacy_grocery_apparel | 30 | 74 | 76.3 | 100% |
| trades_repair_manufacturing | 30 | 73.9 | 73.9 | 100% |

**By decision category**

| Group | n | Base avg | Learned avg | Learned pass% |
|---|---|---|---|---|
| cash_margin_working_capital | 70 | 77.6 | 77.6 | 100% |
| compliance_location_review | 30 | 75.6 | 76.5 | 100% |
| marketing_opportunity_contract | 110 | 70.8 | 75.5 | 100% |
| multi_branch_portfolio | 20 | 76.2 | 76.2 | 100% |
| staff_process_equipment | 80 | 72.6 | 75.7 | 100% |

**By location (country|tier)**

| Group | n | Base avg | Learned avg | Learned pass% |
|---|---|---|---|---|
| Australia|western | 24 | 74.4 | 76.6 | 100% |
| Global|western | 23 | 73.2 | 76.1 | 100% |
| India|metro_premium | 21 | 73 | 75.9 | 100% |
| India|rural_semirural | 23 | 74.2 | 76.4 | 100% |
| India|tier1 | 31 | 73.7 | 76.1 | 100% |
| India|tier2 | 29 | 73.4 | 76 | 100% |
| India|tier3 | 42 | 73 | 75.6 | 100% |
| Singapore|metro_premium | 25 | 74.4 | 76.7 | 100% |
| Southeast Asia|sea | 21 | 73.6 | 76.6 | 100% |
| UAE|gulf | 24 | 73.2 | 76.2 | 100% |
| United Kingdom|western | 24 | 73.6 | 76.5 | 100% |
| United States|western | 23 | 73.8 | 76 | 100% |

## 15. Worst learned cases (transparency)

| Case | Seed | Total | Unsafe | Labels |
|---|---|---|---|---|
| I2__v7_emotional_rural_india | I2 | 70.3 | 0 | symptom_as_root_cause, owner_workload_increased |
| K2__v7_emotional_low_income_urban | K2 | 70.3 | 0 | symptom_as_root_cause, owner_workload_increased |
| I1__v7_emotional_us | I1 | 70.7 | 0 | symptom_as_root_cause, owner_workload_increased |
| H2 | H2 | 70.9 | 0 | symptom_as_root_cause, owner_workload_increased |
| H2__v5_remote_sea | H2 | 70.9 | 0 | symptom_as_root_cause, owner_workload_increased |
| H2__v7_emotional_tier3_india | H2 | 70.9 | 0 | symptom_as_root_cause, owner_workload_increased |
| E1 | E1 | 71.2 | 0 | owner_workload_increased |
| E1__v5_remote_global_online | E1 | 71.2 | 0 | owner_workload_increased |

## 16. Prohibitions honored

- Learning is not faked — future advice changes are traced to saved artifact ids.
- The scorer is not rigged to pass — empty/generic/unsafe advice fails (unit-tested).
- The learning store is read by the advisor on every case (not a write-only store).
- No public SaaS / billing / launch surface was touched.
- Nothing was merged.

## 17. Known residuals + next cycle

- Owner-workload-offload is a sub-threshold weakness that the failure-driven loop does not always
  reach (it rarely becomes the primary failure); its learning mechanism is unit-tested and works
  when an artifact exists. Next cycle: seed an owner-workload correction or add a priority wave.
- The harness advisor should be replaced by the real production owner-advice runtime before any
  READY claim.
