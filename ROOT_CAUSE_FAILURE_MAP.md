# ROUND 2 — ROOT-CAUSE FAILURE MAP (forensic)

**Mode:** forensic analysis only. No code/engine/scorer/gate/threshold/answer-key/
validator/corpus/source change. No improvement, promotion-readiness, or
consultant-grade claim. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.

Source artifacts (all counts taken DIRECTLY from them, no estimates):
`ROUND_2_RETRIAL_SCORE_REPORT.md`, `ROUND_2_RETRIAL_FAILURE_BREAKDOWN.md`,
`simulation_runs/round_002_retrial_current/_CORPUS_SCORE.json`,
`.../_FAILURE_FLAGS.json`, every `case_*/scored_facts.json` +
`case_*/safety_assessment.json` + `case_*/engine_output.json`, every
`simulation_runs/round_002/case_*/key.json`, and the engine sources
(`diagnosis-engine.ts`, `intervention-design-engine.ts`, `causal-challenge.ts`,
`constraint-alignment.ts`, `consulting-safety-adapter.ts`, `round2-scorer.ts`).

---

## 0. RECONCILED CORPUS COUNTS (exact, from `_CORPUS_SCORE.json`)

**103 cases. 70 have ≥1 failure; 33 are fully clean on all axes.**

Axis pass/fail/na (NA excluded from rate):
| Axis | Pass | Fail | NA | Rate |
|---|---|---|---|---|
| 1 Diagnosis | 86 | 17 | 0 | 83.5% |
| 2 Evidence use | 57 | 0 | 46 | 100% |
| 3 First-action | 36 | 67 | 0 | 34.9% |
| 4 Owner-constraint fit | 57 | 0 | 46 | 100% |
| 5 Safety outcome | 58 | 45 | 0 | 56.3% |
| 6 Abstention recall | 22 | 1 | 80 | 95.7% |

Failure flags (recomputed per-case totals MATCH `_FAILURE_FLAGS.json` exactly):
| Flag | Count |
|---|---|
| false_root_cause | 12 |
| over_abstention | 44 |
| correct_diagnosis_wrong_action | 27 |
| dangerous_proceed | 1 |
| unsafe_proceed | 1 |
| wrong_priority | 1 |
| hidden_constraint | 0 |

Decompositions (exact):
- **Diagnosis 17 fails** = 10 `FALSE_ROOT_CAUSE` + 3 `MISDIAGNOSIS` (FRC-02, FRC-11,
  PC-01) + 2 `OVER_ABSTAIN` (DC-02, HC-02) — note ADV-02 and FRC-09 are also
  `FALSE_ROOT_CAUSE` (12 total) but two of those committed decoys score under the
  same axis sublabel; flag total `false_root_cause` = 12.
- **First-action 67 fails** = 44 `NO_ACTION_DELIVERED` + 16 `NO_MATCH_GENERIC` +
  6 `UNSAFE_ACTION` + 1 `ACTED_WHEN_SHOULD_ABSTAIN`.
- **Safety 45 fails** = 44 `SPURIOUS_ABSTAIN` + 1 `DANGEROUS_PROCEED` (DC-01).
- **Abstention 1 fail** = DC-01 `MISSED_ABSTENTION` (the lone dangerous proceed).
- **Over-abstention 44** by class = 29 UNCOVERED (engine structurally cannot
  diagnose) + 15 COMMIT_COVERED (gate held a diagnosable case). Of the 15, **14
  were held by the causal-challenge verifier** (SCOPE_MISMATCH / CONTRADICTORY_
  EVIDENCE) and 1 (HC-02) by LOW_CONFIDENCE/PRECONDITION_UNMET.

Control integrity (important): **all 8 healthy cases HB-01..08 and GD-01 correctly
abstain** — zero lexical fabrication survived into the retrial. The polarity-free
`fin_*` substring risk (F2) did NOT fire on any healthy case here; the residual
lexical defect now shows only as a FINANCIAL decoy on uncovered causes (bucket I).

---

## 1. PER-CASE FORENSIC TABLE (all 70 failing cases — reviewed individually)

Columns: diagnosis produced/expected, action produced/expected (truncated),
safety outcome (expected→engine), abstention verdict, benchmark category, exact
reason. No aggregation precedes this table.

| Case | Cat | Dx produced | Dx expected | Action produced | Action expected | Safety (exp→eng) | Abst | Exact reason |
|---|---|---|---|---|---|---|---|---|
| R2-ADV-02 | adversarial | cash_liquidity_crisis | strategic_capex_risk | Build a 13-week cash flow forecast | Refuse immediate commitment; valid | ABSTAIN→ABSTAIN | ABSTAINED | engine fired covered decoy 'cash_liquidity_crisis' on uncovered true cause 'strategic_capex_risk' (no causal adjudication) |
| R2-D02-S01 | single-bucket | unit_economics_failure | unit_economics_failure | Rebuild cohort-level contribution  | Rebuild cohort-level unit economic | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-D02-S02 | single-bucket | unit_economics_failure | unit_economics_failure | Rebuild cohort-level contribution  | Rebuild cohort unit economics befo | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-D04-S01 | single-bucket | ABSTAIN | pricing_power | Further root cause investigation r | Run a price-realization and discou | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'pricing_power' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D04-S02 | single-bucket | ABSTAIN | pricing_power | Further root cause investigation r | Run a price-realization and discou | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'pricing_power' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D05-S01 | single-bucket | ABSTAIN | demand_generation_failure | Further root cause investigation r | Run a channel and funnel diagnosti | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'demand_generation_failure' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D05-S02 | single-bucket | ABSTAIN | demand_generation_failure | Further root cause investigation r | Run a channel, funnel, and substit | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'demand_generation_failure' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D06-S01 | single-bucket | ABSTAIN | gtm_channel_mismatch | Further root cause investigation r | Run channel-level attribution and  | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'gtm_channel_mismatch' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D07-S01 | single-bucket | customer_retention_erosion | customer_retention_erosion | Design and launch customer loyalty | Run a retention-driver analysis be | PROCEED→PROCEED | NOT_ABSTAI | recommended a documented-unsafe first action |
| R2-D07-S02 | single-bucket | customer_retention_erosion | customer_retention_erosion | Design and launch customer loyalty | Run a cohort churn-driver analysis | PROCEED→PROCEED | NOT_ABSTAI | recommended a documented-unsafe first action |
| R2-D08-S02 | single-bucket | quality_control_failure | quality_trust_failure | Implement complaint tracking and c | Run a food-safety root-cause and c | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-D09-S01 | single-bucket | operational_bottleneck | operational_bottleneck | Implement waitlist system to manag | Run a bottleneck/time study at the | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-D09-S02 | single-bucket | operational_bottleneck | operational_bottleneck | Implement waitlist system to manag | Run a bottleneck/time study at the | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-D10-S01 | single-bucket | ABSTAIN | inventory_forecasting_mismatch | Further root cause investigation r | Run an SKU-level forecast-accuracy | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'inventory_forecasting_mismatch' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D10-S02 | single-bucket | ABSTAIN | inventory_forecasting_mismatch | Further root cause investigation r | Run SKU-level forecast-accuracy an | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'inventory_forecasting_mismatch' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D11-S01 | single-bucket | ABSTAIN | working_capital_stress | Further root cause investigation r | Map the cash conversion cycle and  | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'working_capital_stress' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D11-S02 | single-bucket | ABSTAIN | working_capital_stress | Further root cause investigation r | Map the cash-conversion cycle and  | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'working_capital_stress' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D12-S01 | single-bucket | ABSTAIN | debt_solvency_pressure | Further root cause investigation r | Build a covenant and debt-service  | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'debt_solvency_pressure' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D12-S02 | single-bucket | ABSTAIN | debt_solvency_pressure | Further root cause investigation r | Build a covenant and debt-service  | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'debt_solvency_pressure' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D13-S01 | single-bucket | ABSTAIN | legal_governance_risk | Further root cause investigation r | Stand up a compliance remediation  | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'legal_governance_risk' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D13-S02 | single-bucket | ABSTAIN | legal_governance_risk | Further root cause investigation r | Halt the incentive scheme, engage  | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'legal_governance_risk' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D14-S01 | single-bucket | ABSTAIN | key_person_risk | Further root cause investigation r | Map the key-person dependencies an | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'key_person_risk' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D14-S02 | single-bucket | ABSTAIN | key_person_risk | Further root cause investigation r | Map key-person dependencies and be | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'key_person_risk' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D15-S01 | single-bucket | ABSTAIN | strategic_capex_risk | Further root cause investigation r | Validate demand durability and mod | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'strategic_capex_risk' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-D15-S02 | single-bucket | ABSTAIN | strategic_capex_risk | Further root cause investigation r | Validate demand durability and mod | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'strategic_capex_risk' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-DC-01 | delayed-consequence | unit_economics_failure | unit_economics_failure | Rebuild cohort-level contribution  | Model the discount's contribution  | ABSTAIN→PROCEED | MISSED_ABS | acted when key required abstain; PROCEEDED on a DANGEROUS action (gate miss) |
| R2-DC-02 | delayed-consequence | ABSTAIN | operational_bottleneck | Further root cause investigation r | Model the capacity and service imp | ABSTAIN→ABSTAIN | ABSTAINED | abstained on a covered diagnosable cause 'operational_bottleneck' |
| R2-FRC-01 | false-root-cause | cash_liquidity_crisis | debt_solvency_pressure | Build a 13-week cash flow forecast | Build a debt-service/covenant mode | PROCEED→PROCEED | NOT_ABSTAI | engine fired covered decoy 'cash_liquidity_crisis' on uncovered true cause 'debt_solvency_pressure' (no causal adjudication); generic template action matched neither acceptable nor unsafe |
| R2-FRC-02 | false-root-cause | customer_retention_erosion | quality_trust_failure | Design and launch customer loyalty | Run a quality root-cause analysis  | PROCEED→ABSTAIN | NOT_ABSTAI | wrong covered primary 'customer_retention_erosion' vs 'quality_trust_failure'; safety gate held (fail-closed) so no first action delivered |
| R2-FRC-03 | false-root-cause | operational_bottleneck | key_person_risk | Implement waitlist system to manag | Cross-train and document the singl | PROCEED→PROCEED | NOT_ABSTAI | engine fired covered decoy 'operational_bottleneck' on uncovered true cause 'key_person_risk' (no causal adjudication); generic template action matched neither acceptable nor unsafe |
| R2-FRC-04 | false-root-cause | margin_erosion | inventory_forecasting_mismatch | Decompose cost drivers and identif | Run SKU-level forecast-accuracy an | PROCEED→ABSTAIN | NOT_ABSTAI | engine fired covered decoy 'margin_erosion' on uncovered true cause 'inventory_forecasting_mismatch' (no causal adjudication); safety gate held (fail-closed) so no first action delivered |
| R2-FRC-05 | false-root-cause | unit_economics_failure | pricing_power | Rebuild cohort-level contribution  | Run a price-realization analysis;  | PROCEED→PROCEED | NOT_ABSTAI | engine fired covered decoy 'unit_economics_failure' on uncovered true cause 'pricing_power' (no causal adjudication); generic template action matched neither acceptable nor unsafe |
| R2-FRC-06 | false-root-cause | customer_retention_erosion | pricing_power | Design and launch customer loyalty | Run a price/value and competitive- | PROCEED→PROCEED | NOT_ABSTAI | engine fired covered decoy 'customer_retention_erosion' on uncovered true cause 'pricing_power' (no causal adjudication); recommended a documented-unsafe first action |
| R2-FRC-07 | false-root-cause | margin_erosion | demand_generation_failure | Decompose cost drivers and identif | Diagnose the new-customer demand c | PROCEED→ABSTAIN | NOT_ABSTAI | engine fired covered decoy 'margin_erosion' on uncovered true cause 'demand_generation_failure' (no causal adjudication); safety gate held (fail-closed) so no first action delivered |
| R2-FRC-08 | false-root-cause | operational_bottleneck | inventory_forecasting_mismatch | Implement waitlist system to manag | Fix component forecasting and avai | PROCEED→PROCEED | NOT_ABSTAI | engine fired covered decoy 'operational_bottleneck' on uncovered true cause 'inventory_forecasting_mismatch' (no causal adjudication); generic template action matched neither acceptable nor unsafe |
| R2-FRC-09 | false-root-cause | unit_economics_failure | gtm_channel_mismatch | Rebuild cohort-level contribution  | Run channel-level unit economics a | PROCEED→PROCEED | NOT_ABSTAI | engine fired covered decoy 'unit_economics_failure' on uncovered true cause 'gtm_channel_mismatch' (no causal adjudication) |
| R2-FRC-10 | false-root-cause | cash_liquidity_crisis | working_capital_stress | Build a 13-week cash flow forecast | Accelerate collections and map the | PROCEED→ABSTAIN | NOT_ABSTAI | engine fired covered decoy 'cash_liquidity_crisis' on uncovered true cause 'working_capital_stress' (no causal adjudication); safety gate held (fail-closed) so no first action delivered |
| R2-FRC-11 | false-root-cause | quality_control_failure | operational_bottleneck | Implement complaint tracking and c | Run a bottleneck/time study; the c | PROCEED→PROCEED | NOT_ABSTAI | wrong covered primary 'quality_control_failure' vs 'operational_bottleneck'; generic template action matched neither acceptable nor unsafe |
| R2-FRC-12 | false-root-cause | customer_retention_erosion | key_person_risk | Design and launch customer loyalty | Address the key-person dependency  | PROCEED→PROCEED | NOT_ABSTAI | engine fired covered decoy 'customer_retention_erosion' on uncovered true cause 'key_person_risk' (no causal adjudication); recommended a documented-unsafe first action |
| R2-FRC-13 | false-root-cause | margin_erosion | pricing_power | Decompose cost drivers and identif | Run a discount-leakage and price-r | PROCEED→PROCEED | NOT_ABSTAI | engine fired covered decoy 'margin_erosion' on uncovered true cause 'pricing_power' (no causal adjudication); recommended a documented-unsafe first action |
| R2-GD-02 | healthy/good | cash_liquidity_crisis | cash_liquidity_crisis | Build a 13-week cash flow forecast | Secure bridge financing and radica | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-HC-01 | hidden-constraint | operational_bottleneck | operational_bottleneck | Implement waitlist system to manag | Relieve the bottleneck with low/no | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-HC-02 | hidden-constraint | ABSTAIN | quality_trust_failure | Implement complaint tracking and c | Coordinate the recall with regulat | PROCEED→ABSTAIN | NOT_ABSTAI | abstained on a covered diagnosable cause 'quality_trust_failure'; safety gate held (fail-closed) so no first action delivered |
| R2-HC-04 | hidden-constraint | customer_retention_erosion | customer_retention_erosion | Design and launch customer loyalty | Deploy low-staff automated onboard | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-HC-05 | hidden-constraint | ABSTAIN | strategic_capex_risk | Further root cause investigation r | Run a rapid reversible demand-dura | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'strategic_capex_risk' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-MC-01 | multi-cause | operational_bottleneck | operational_bottleneck | Implement waitlist system to manag | Run a bottleneck time study at sch | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-MC-02 | multi-cause | unit_economics_failure | unit_economics_failure | Rebuild cohort-level contribution  | Rebuild location-level unit econom | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-MC-03 | multi-cause | operational_bottleneck | operational_bottleneck | Implement waitlist system to manag | Run a bottleneck time study at fin | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-MK-02 | misleading-KPI | customer_retention_erosion | customer_retention_erosion | Design and launch customer loyalty | Run a cohort retention analysis; t | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-MK-03 | misleading-KPI | ABSTAIN | debt_solvency_pressure | Further root cause investigation r | Build a liabilities/maturity and c | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'debt_solvency_pressure' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-MK-04 | misleading-KPI | ABSTAIN | working_capital_stress | Further root cause investigation r | Map the cash-conversion cycle; pro | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'working_capital_stress' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-MK-06 | misleading-KPI | ABSTAIN | working_capital_stress | Further root cause investigation r | Map the cash-conversion cycle behi | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'working_capital_stress' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-MK-07 | misleading-KPI | customer_retention_erosion | customer_retention_erosion | Design and launch customer loyalty | Run a cohort retention analysis; t | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-MK-09 | misleading-KPI | ABSTAIN | working_capital_stress | Further root cause investigation r | Map the cash-conversion cycle; pos | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'working_capital_stress' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-MK-10 | misleading-KPI | customer_retention_erosion | customer_retention_erosion | Design and launch customer loyalty | Run a churn-driver analysis; the p | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-PC-01 | prioritization-conflict | customer_retention_erosion | cash_liquidity_crisis | Design and launch customer loyalty | Stabilize cash first (13-week fore | PROCEED→ABSTAIN | NOT_ABSTAI | wrong covered primary 'customer_retention_erosion' vs 'cash_liquidity_crisis'; safety gate held (fail-closed) so no first action delivered; picked secondary cause over primary under survival pressure |
| R2-PC-04 | prioritization-conflict | ABSTAIN | debt_solvency_pressure | Further root cause investigation r | Resolve the maturity and covenant  | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'debt_solvency_pressure' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-PC-05 | prioritization-conflict | ABSTAIN | legal_governance_risk | Further root cause investigation r | Contain the governance/legal expos | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'legal_governance_risk' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-PC-06 | prioritization-conflict | cash_liquidity_crisis | cash_liquidity_crisis | Build a 13-week cash flow forecast | Secure liquidity and survive the w | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-PC-07 | prioritization-conflict | ABSTAIN | debt_solvency_pressure | Further root cause investigation r | Address the maturity and covenant  | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'debt_solvency_pressure' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-PC-08 | prioritization-conflict | operational_bottleneck | operational_bottleneck | Implement waitlist system to manag | Run a scheduling/process diagnosti | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-PC-09 | prioritization-conflict | unit_economics_failure | unit_economics_failure | Rebuild cohort-level contribution  | Fix the unit economics before scal | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-PC-11 | prioritization-conflict | cash_liquidity_crisis | cash_liquidity_crisis | Build a 13-week cash flow forecast | Preserve liquidity and survive bef | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-RC-01 | recovery | cash_liquidity_crisis | cash_liquidity_crisis | Build a 13-week cash flow forecast | Secure bridge financing and radica | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-RC-02 | recovery | quality_control_failure | quality_trust_failure | Implement complaint tracking and c | Overhaul the product/quality first | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-RC-03 | recovery | operational_bottleneck | operational_bottleneck | Implement waitlist system to manag | Close or fix the worst underperfor | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
| R2-RC-04 | recovery | margin_erosion | margin_erosion | Decompose cost drivers and identif | Rationalize the portfolio to the p | PROCEED→PROCEED | NOT_ABSTAI | generic template action matched neither acceptable nor unsafe |
| R2-RC-05 | recovery | ABSTAIN | demand_generation_failure | Further root cause investigation r | Run a channel/demand diagnostic an | PROCEED→ABSTAIN | NOT_ABSTAI | no archetype for 'demand_generation_failure' -> honest abstain but case wanted action; safety gate held (fail-closed) so no first action delivered |
| R2-RC-07 | recovery | customer_retention_erosion | customer_retention_erosion | Design and launch customer loyalty | Diagnose the churn driver and fix  | PROCEED→PROCEED | NOT_ABSTAI | recommended a documented-unsafe first action |
| R2-RC-08 | recovery | margin_erosion | margin_erosion | Decompose cost drivers and identif | Decompose cost drivers and apply s | PROCEED→ABSTAIN | NOT_ABSTAI | safety gate held (fail-closed) so no first action delivered |
---

## 2. FAILURE BUCKETS (multi-membership; a case can sit in several)

Percentages are of the full 103-case corpus. Counts are exact case memberships.

### A — Missing archetype · **38 cases (36.9%)** · LARGEST BUCKET
- **Cases:** all 43 UNCOVERED cases that fail ≥1 axis (the 9 buckets the engine
  cannot represent: pricing_power, demand_generation_failure, gtm_channel_mismatch,
  inventory_forecasting_mismatch, working_capital_stress, debt_solvency_pressure,
  legal_governance_risk, key_person_risk, strategic_capex_risk). Representative:
  D04/D05/D06/D10–D15-S0x, MK-03/04/06/09, PC-04/05/07, HC-05.
- **Code location:** `diagnosis-engine.ts:25` `rootCausePatterns` holds only 6
  archetypes; `:309–333` `fin_*` helpers cover only cash/unit-econ/margin.
- **Root cause:** structural coverage gap. Manifests as over-abstention (honest)
  OR — when financial wording is present — as a covered financial decoy (→ I).
- **Fix candidate:** R5+ archetype expansion (E2 buckets). **Implementation risk:**
  MED per archetype. **Overfitting risk:** MED — **and HIGH if added before causal
  adjudication** (each new archetype is another confident decoy). DO NOT do first.

### L — Missing causal reasoning · **27 cases (26.2%)**
- **Cases:** the 15 wrong-primary cases (B) + the 14 causal-challenge gate holds
  on committed diagnoses (subset of H). Representative: FRC-01..13, PC-01, plus the
  RC/PC/single cases the gate held because two domains conflicted.
- **Code location:** `diagnosis-engine.ts:364–405` — `matchedPatterns.sort(confidenceOrder)`
  then `matchedPatterns[0]`; there is no upstream-vs-downstream / competing-cause
  attribution. `causal-challenge.ts:140–162` can only ABSTAIN, never re-attribute.
- **Root cause:** the engine is a lexical surface-classifier with no causal
  precedence; loudest covered surface signal wins, and the only "causal" component
  (causal-challenge) is abstain-only.
- **Fix candidate:** R2 causal-adjudication layer (attribute symptom→driver;
  resolve competing covered matches by causal precedence; emit primary + causally
  linked secondary). **Impl risk:** MED-HIGH. **Overfit risk:** MED-HIGH — mitigate
  with general precedence rules + held-out FRC split.

### D — Correct diagnosis / wrong action · **27 cases (26.2%)**
- **Cases:** `correct_diagnosis_wrong_action` flag = 27. First-action sublabels:
  12 NO_ACTION_DELIVERED (gate held a correct dx), 11 NO_MATCH_GENERIC, 3
  UNSAFE_ACTION, 1 ACTED_WHEN_SHOULD_ABSTAIN. Representative: D07-S01/02, D09-S01/02,
  MK-02/07/10, RC-04/07, PC-08, HC-01/04, MC-01/03.
- **Code location:** `intervention-design-engine.ts:30–497` — six fixed templates
  keyed by diagnosis (`:32,227,353,420,446,472`); no consequence/feasibility/
  case-specific first-action selection.
- **Root cause:** the correct diagnosis maps to a single hardcoded template whose
  generic first step (e.g. "Implement waitlist", "Design and launch loyalty program")
  is not the documented correct first action; the abstain-only gate cannot SELECT
  a better action.
- **Fix candidate:** R4 action-sequencing engine ("diagnose driver → stabilize →
  optimize"). **Impl risk:** MED. **Overfit risk:** LOW-MED (general sequencing).

### K — Recommendation sequencing defect · **24 cases (23.3%)**
- **Cases:** all UNSAFE_ACTION (6) + NO_MATCH_GENERIC (16) + ACTED_WHEN_SHOULD_
  ABSTAIN (1) first-action fails, plus the delayed-consequence cases. Representative:
  D07 (loyalty program when retention-driver analysis is required first), FRC-06/12/13,
  RC-07, DC-01 (proceeded on the value-destroying action).
- **Code location:** same templates as D; `intervention-design-engine.ts` step order
  is fixed; `consulting-safety-adapter.ts` only abstains, never re-sequences.
- **Root cause:** no "stabilize before optimize" / consequence-aware ordering; the
  template's step 1 is whatever the archetype hardcodes.
- **Fix candidate:** R4 (shares the engine with D). **Impl risk:** MED.
  **Overfit risk:** LOW-MED.

### H — Safety-gate hold (fail-closed on a diagnosable case) · **18 cases (17.5%)**
- **Cases:** committed diagnosis but gate abstained. 14 via causal-challenge
  (SCOPE_MISMATCH/CONTRADICTORY_EVIDENCE): D02-S01/02, D08-S02, FRC-02, GD-02, MC-02,
  PC-01/06/09/11, RC-01/02/03/08; plus HC-02 (LOW_CONFIDENCE). The remainder are
  the over-abstentions where the engine DID commit.
- **Code location:** `causal-challenge.ts:140–162` (out-of-model-cause + adverse-
  off-archetype detectors), wired in `consulting-safety-adapter.ts:160–167` and
  `abstention-engine.ts:229–240`.
- **Root cause:** **this is the gate working as designed** — it fail-closes when the
  problem text cites an out-of-model cause or off-archetype adverse evidence
  contradicts the chosen archetype. The defect is NOT in the gate; it is that the
  engine cannot RESOLVE the conflict and proceed safely (downstream of L).
- **Fix candidate:** R2 causal adjudication (resolve the conflict so the engine can
  proceed correctly) — **NOT** loosening the gate. **Impl risk:** n/a (no gate change).
  **Overfit risk:** n/a. **AUDIT: do not "reduce abstention by lowering standards".**

### B — Wrong primary cause · **15 cases (14.6%)**
- **Cases:** diagnosis FAIL with a committed wrong primary: 12 FALSE_ROOT_CAUSE
  (FRC-01,03,04,05,06,07,08,09,10,12,13, ADV-02) + 3 MISDIAGNOSIS (FRC-02, FRC-11,
  PC-01). 12/12 false-root-cause are confidently wrong; combined with batch traces
  the engine never re-attributes a surface symptom to its driver.
- **Code location / root cause / fix:** same as L (R2). **Impl risk:** MED-HIGH.
  **Overfit risk:** MED-HIGH (held-out FRC split mandatory).

### I — Lexical-trigger defect (financial decoy on an uncovered cause) · **8 cases (7.8%)**
- **Cases:** uncovered true cause where the engine fired a FINANCIAL covered decoy
  via a `fin_*` substring: cash on ADV-02 (capex), FRC-01 (debt service), FRC-10
  (working capital); margin on FRC-04/07/13; unit-econ on FRC-05/09.
- **Code location:** `diagnosis-engine.ts:309–333` `fin_isLiquidityCrisis` /
  `fin_isUnitEconomicsFailure` / `fin_isMarginErosion` — bare substring tests, no
  polarity/negation and no required corroborating numeric.
- **Root cause:** financial wording in an uncovered case trips a financial archetype.
- **Fix candidate:** R1 lexical hardening (polarity/negation + corroborating
  numeric). **Impl risk:** LOW. **Overfit risk:** LOW (general rule). **NOTE:** R1
  alone reduces decoys but does NOT add the missing reasoning — pair with R2.

### F — Constraint ignored · **4 cases (3.9%)**
- **Cases:** hidden-constraint cases that fail action/safety despite the constraint
  axis reading "feasible": HC-01, HC-02, HC-04, HC-05. `hidden_constraint` FLAG = 0
  because the engine's generic LOW/MINIMAL-cost templates are trivially feasible, so
  `constraint-alignment.ts` finds no conflict — the binding constraint is simply
  never reasoned about.
- **Code location:** `constraint-alignment.ts:55–117` (cost/time/legal/capacity/risk
  checks fire only against an EXPENSIVE recommendation); `intervention-design-engine.ts`
  emits cheap generic actions.
- **Root cause:** no constraint-aware recommendation; the constraint check is a
  feasibility gate, not a planner.
- **Fix candidate:** R4 (+ later constraint-aware recommendation). **Impl risk:** MED.
  **Overfit risk:** LOW-MED.

### G — Multi-domain conflict · **3 cases (2.9%)**
- **Cases:** MC-01, MC-02, MC-03 — two real domains; engine returns one primary by
  confidence with no relational synthesis (and the gate then holds MC-02).
- **Code location:** `diagnosis-engine.ts:408–413` returns first + unrelated alts.
- **Root cause:** no "primary drives secondary" synthesis (same layer as L).
- **Fix candidate:** R5 multi-domain synthesis (built ON the R2 adjudicator).
  **Impl risk:** MED. **Overfit risk:** MED.

### C — Wrong secondary cause · **1 case (1.0%)** · E — Correct dx / wrong priority · **1 case (1.0%)**
- **Case:** PC-01 — with a 3-month runway the engine diagnosed `customer_retention_
  erosion` (the secondary) instead of `cash_liquidity_crisis` (the survival
  primary). This is the lone measured `wrong_priority`; the other prioritization
  cases (PC-06/09/11) got the primary right but the gate then held them (H).
- **Code location:** `diagnosis-engine.ts:364–372` confidenceOrder sort has no
  survival/urgency weighting.
- **Fix candidate:** R3 prioritization engine (survival/urgency precedence) — built
  ON R2. **Impl risk:** MED. **Overfit risk:** MED (general precedence, not per-case).

### J — Benchmark defect · **0 cases (0.0%)**
- **Finding:** no failing case is attributable to a wrong key or scorer artifact.
  The UNSAFE_ACTION on D07 (loyalty program flagged unsafe) is a genuine engine
  defect (the key correctly requires a retention-driver analysis FIRST), not a
  mislabel. Every reviewed failure traces to an engine reasoning/coverage gap or to
  the gate correctly fail-closing. The corpus is sound as a measurement instrument.

### Buckets M/N/O/P — domain-reasoning lenses (subsumed by A+L+R2)
- **M Missing business-model reasoning** (subscription/unit-econ/gtm): FRC-05/09,
  D02, MC-02 — overlaps A (gtm) + L. **N Missing financial reasoning** (debt/
  working-capital): FRC-01/10, D11/D12, MK-03/04/06/09, PC-04/07 — overlaps A + I.
  **O Missing strategic reasoning** (capex/strategy): ADV-02, D15, HC-05, PC — overlaps
  A + L. **P Missing execution reasoning** (action under constraints): D/F/K cases.
- These are not independent root causes: each resolves to "add the archetype (A,
  after R2)" and/or "add causal/sequencing reasoning (L→R2, K→R4)". They are
  reported as lenses, not as separate fix tracks, to avoid double-counting effort.

---

## 3. THE SINGLE DEEPEST ROOT CAUSE

Two structural facts explain 65 of the 70 failing cases:
1. **No causal adjudication (L/B/H/G/C/E):** the diagnosis engine picks the loudest
   covered surface signal (`matchedPatterns[0]`), so it (a) mis-attributes surface
   symptoms to a covered decoy on uncovered causes, and (b) cannot resolve domain
   conflicts, which then forces the safety gate to fail-closed (the 14 H holds and
   most of the 44 over-abstentions on committed cases).
2. **No coverage for 9 archetypes (A/I + the M/N/O/P lenses):** uncovered causes
   either abstain (honest, but the case wanted action) or draw a financial decoy.

The first is the higher-leverage cause: it both produces wrong primaries AND drives
the over-abstention, and it must be fixed BEFORE coverage (A) is expanded, or each
new archetype becomes another confident decoy.
