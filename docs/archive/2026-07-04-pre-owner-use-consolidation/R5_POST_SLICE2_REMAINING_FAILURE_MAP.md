# R5 POST-SLICE-2 — REMAINING FAILURE MAP (forensic, machine-reconciled)

**Mode:** forensic audit only. No engine/adjudication/intervention/gate/scorer/
threshold/key/corpus/validator change. No improvement or promotion claim.
**Stage A remains DO_NOT_PROMOTE / BLOCKED.** **Branch:**
`claude/stage-a-unproven-assumption-ecr0dm`.

All counts taken directly from
`simulation_runs/round_002_retrial_r5_slice2_demand_gtm_inventory/` machine
artifacts and **reconciled** against `_CORPUS_SCORE.json` (per-case recompute = ALL
MATCH; 103 cases). No inference from report prose.

## 1. EXACT CURRENT METRICS (from `_CORPUS_SCORE.json`)

| Axis | pass | fail | na | rate |
|---|---|---|---|---|
| diagnosis | 97 | 6 | 0 | 94.2% |
| evidence-use | 72 | 0 | 31 | 100% |
| first-action | 58 | 45 | 0 | 56.3% |
| owner-constraint fit | 72 | 0 | 31 | 100% |
| safety-outcome | 69 | 34 | 0 | 67.0% |
| abstention recall | 22 | 1 | 80 | 95.7% |

Flags: over_abstention **33**, correct_diagnosis_wrong_action **32**,
unsafe_proceed **1**, dangerous_proceed **1**, wrong_priority **1**,
hidden_constraint **0**, false_root_cause **0**.
Coverage class split: COMMIT_COVERED 77 / UNCOVERED 13 / ABSTAIN_EXPECTED 13.

## 2. EXACT FAILURE COUNTS

**48 distinct cases** carry ≥1 axis-fail or flag. The 13 UNCOVERED cases
(authoritative scorer field) are exactly the three deferred Slice-3 domains:
strategic_capex_risk ×5 (ADV-02, D15-S01/S02, DC-04, HC-05), legal_governance_risk
×4 (ADV-03, D13-S01/S02, PC-05), key_person_risk ×4 (D14-S01/S02, FRC-03, FRC-12).

### The 33 over-abstentions partition (machine-verified)
- **A_uncovered_honest_abstain (10):** D13-S01/S02, D14-S01/S02, D15-S01/S02,
  FRC-03, FRC-12, HC-05, PC-05 — Slice-3 domains; engine honestly abstains
  (diagnosis PASS as HONEST_ABSTAIN). **Only these 10 are addressable by archetypes.**
- **B_covered_correct_GATE_HELD (21):** D02-S01/S02, D05-S02, D08-S02, FRC-02/04/06/
  07/10, GD-02, MC-02, PC-06/07/09/11, RC-01/02/03/05/08, PC-01 — the engine
  **diagnoses correctly** but the FROZEN safety gate's causal-challenge abstains
  (off-archetype adverse evidence or out-of-model problem text). **Archetypes cannot
  fix these.**
- **C_covered_over_abstain (2):** FRC-11, HC-02 — the engine pattern did not fire
  (missing corroboration), so it abstains on a coverable cause.

## 3. CASE-LEVEL TABLE (all 48 remaining failures)

| Case | true dx | engine dx | gate exp→act | dx | first-action | flags | bucket | layer |
|---|---|---|---|---|---|---|---|---|
| R2-D02-S01 | unit_economics_failure | unit_economics_failure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-D02-S02 | unit_economics_failure | unit_economics_failure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-D04-S01 | pricing_power | pricing_power | PROCEED→PROCEED | CORRECT | UNSAFE_ACTION | correct_diagnosis_wrong_action | F/H | ACTION/SCORER |
| R2-D04-S02 | pricing_power | pricing_power | PROCEED→PROCEED | CORRECT | UNSAFE_ACTION | correct_diagnosis_wrong_action | F/H | ACTION/SCORER |
| R2-D05-S02 | demand_generation_failure | demand_generation_failure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-D08-S02 | quality_trust_failure | quality_control_failure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-D10-S01 | inventory_forecasting_mismatch | inventory_forecasting_mismatch | PROCEED→PROCEED | CORRECT | UNSAFE_ACTION | correct_diagnosis_wrong_action | F/H | ACTION/SCORER |
| R2-D10-S02 | inventory_forecasting_mismatch | inventory_forecasting_mismatch | PROCEED→PROCEED | CORRECT | UNSAFE_ACTION | correct_diagnosis_wrong_action | F/H | ACTION/SCORER |
| R2-D11-S01 | working_capital_stress | working_capital_stress | PROCEED→PROCEED | CORRECT | UNSAFE_ACTION | correct_diagnosis_wrong_action | F/H | ACTION/SCORER |
| R2-D11-S02 | working_capital_stress | working_capital_stress | PROCEED→PROCEED | CORRECT | UNSAFE_ACTION | correct_diagnosis_wrong_action | F/H | ACTION/SCORER |
| R2-D12-S01 | debt_solvency_pressure | debt_solvency_pressure | PROCEED→PROCEED | CORRECT | UNSAFE_ACTION | correct_diagnosis_wrong_action | F/H | ACTION/SCORER |
| R2-D12-S02 | debt_solvency_pressure | debt_solvency_pressure | PROCEED→PROCEED | CORRECT | UNSAFE_ACTION | correct_diagnosis_wrong_action | F/H | ACTION/SCORER |
| R2-D13-S01 | legal_governance_risk | unknown | PROCEED→ABSTAIN | HONEST_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | A | MODEL_COVERAGE |
| R2-D13-S02 | legal_governance_risk | unknown | PROCEED→ABSTAIN | HONEST_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | A | MODEL_COVERAGE |
| R2-D14-S01 | key_person_risk | unknown | PROCEED→ABSTAIN | HONEST_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | B | MODEL_COVERAGE |
| R2-D14-S02 | key_person_risk | unknown | PROCEED→ABSTAIN | HONEST_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | B | MODEL_COVERAGE |
| R2-D15-S01 | strategic_capex_risk | unknown | PROCEED→ABSTAIN | HONEST_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | C | MODEL_COVERAGE |
| R2-D15-S02 | strategic_capex_risk | unknown | PROCEED→ABSTAIN | HONEST_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | C | MODEL_COVERAGE |
| R2-DC-01 | unit_economics_failure | unit_economics_failure | ABSTAIN→PROCEED | CORRECT | ACTED_WHEN_SHOULD_ABSTAIN | unsafe_proceed;dangerous_proceed;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-DC-02 | operational_bottleneck | unknown | ABSTAIN→ABSTAIN | OVER_ABSTAIN | CORRECT_WITHHOLD | - | J | ABSTENTION(safe) |
| R2-DC-03 | inventory_forecasting_mismatch | unknown | ABSTAIN→ABSTAIN | OVER_ABSTAIN | CORRECT_WITHHOLD | - | J | ABSTENTION(safe) |
| R2-DC-05 | demand_generation_failure | unknown | ABSTAIN→ABSTAIN | OVER_ABSTAIN | CORRECT_WITHHOLD | - | J | ABSTENTION(safe) |
| R2-FRC-01 | debt_solvency_pressure | debt_solvency_pressure | PROCEED→PROCEED | CORRECT | UNSAFE_ACTION | correct_diagnosis_wrong_action | F/H | ACTION/SCORER |
| R2-FRC-02 | quality_trust_failure | quality_control_failure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-FRC-03 | key_person_risk | unknown | PROCEED→ABSTAIN | HONEST_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | B | MODEL_COVERAGE |
| R2-FRC-04 | inventory_forecasting_mismatch | inventory_forecasting_mismatch | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-FRC-06 | pricing_power | pricing_power | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-FRC-07 | demand_generation_failure | demand_generation_failure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-FRC-10 | working_capital_stress | working_capital_stress | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-FRC-11 | operational_bottleneck | unknown | PROCEED→ABSTAIN | OVER_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | D | MODEL_COVERAGE |
| R2-FRC-12 | key_person_risk | unknown | PROCEED→ABSTAIN | HONEST_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | B | MODEL_COVERAGE |
| R2-GD-02 | cash_liquidity_crisis | cash_liquidity_crisis | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-HC-02 | quality_trust_failure | quality_control_failure | PROCEED→ABSTAIN | OVER_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | D | MODEL_COVERAGE |
| R2-HC-05 | strategic_capex_risk | unknown | PROCEED→ABSTAIN | HONEST_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | C | MODEL_COVERAGE |
| R2-MC-02 | unit_economics_failure | unit_economics_failure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-PC-01 | cash_liquidity_crisis | customer_retention_erosion | PROCEED→ABSTAIN | MISDIAGNOSIS | NO_ACTION_DELIVERED | over_abstention;wrong_priority | G | DIAGNOSIS/PRIORITY |
| R2-PC-04 | debt_solvency_pressure | debt_solvency_pressure | PROCEED→PROCEED | CORRECT | UNSAFE_ACTION | correct_diagnosis_wrong_action | F/H | ACTION/SCORER |
| R2-PC-05 | legal_governance_risk | unknown | PROCEED→ABSTAIN | HONEST_ABSTAIN | NO_ACTION_DELIVERED | over_abstention | A | MODEL_COVERAGE |
| R2-PC-06 | cash_liquidity_crisis | cash_liquidity_crisis | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-PC-07 | debt_solvency_pressure | debt_solvency_pressure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-PC-09 | unit_economics_failure | unit_economics_failure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-PC-11 | cash_liquidity_crisis | cash_liquidity_crisis | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-RC-01 | cash_liquidity_crisis | cash_liquidity_crisis | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-RC-02 | quality_trust_failure | quality_control_failure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-RC-03 | operational_bottleneck | operational_bottleneck | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-RC-04 | margin_erosion | margin_erosion | PROCEED→PROCEED | CORRECT | NO_MATCH_GENERIC | correct_diagnosis_wrong_action | F | ACTION |
| R2-RC-05 | demand_generation_failure | demand_generation_failure | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
| R2-RC-08 | margin_erosion | margin_erosion | PROCEED→ABSTAIN | CORRECT | NO_ACTION_DELIVERED | over_abstention;correct_diagnosis_wrong_action | E | SAFETY_GATE |
## 4–6. BUCKET ASSIGNMENT, COUNTS, REPRESENTATIVES

| Bucket | Name | Count | Representative cases |
|---|---|---|---|
| **E** | Safety-gate gap (correct dx held + dangerous-proceed blind spot) | **21** | D02-S01/S02, FRC-04/06/07/10, GD-02, MC-02, PC-06/07/09/11, RC-01/02/03/05/08, D05-S02, D08-S02, FRC-02, **DC-01** |
| **F/H** | Action-text / scorer-matcher lexical collision | **10** | D04-S01/S02, D10-S01/S02, D11-S01/S02, D12-S01/S02, FRC-01, PC-04 |
| **B** | Key-person archetype missing | **4** | D14-S01/S02, FRC-03, FRC-12 |
| **A** | Legal/governance archetype missing | **3** | D13-S01/S02, PC-05 |
| **C** | Strategic-capex archetype missing | **3** | D15-S01/S02, HC-05 |
| **J** | Intentional safe abstention (adversarial) — MUST NOT FIX | **3** | DC-02, DC-03, DC-05 |
| **D** | Coverage edge: pattern did not fire | **2** | FRC-11 (bottleneck needs retention corroboration), HC-02 |
| **F** | Action no-match generic | **1** | RC-04 (wants "portfolio rationalization") |
| **G** | Diagnosis-priority gap | **1** | PC-01 (picked secondary retention over survival cash) |

(48 total. No bucket I/K/L needed; no new bucket required.)

## 7–10. PER-BUCKET ROOT CAUSE / FIX / RISK

### E — Safety-gate gap (21) — LARGEST
- **Root cause (code):** `causal-challenge.ts` `runCausalChallenge` abstains when
  (a) the businessProblem contains an `OUT_OF_MODEL_CAUSE_STEMS` token, or (b) any
  adverse finding sits outside the chosen archetype's `ARCHETYPE_DIMENSIONS` home.
  These 21 are correctly diagnosed (dx CORRECT) but carry a cross-domain adverse
  signal (e.g. PC-06 cash + growth-opportunity market_position) or a flagged problem
  text, so the abstain-only gate holds them. Plus **DC-01**: the gate has
  `irreversibility_score` hardcoded to 0 in `consulting-safety-adapter.ts`, so it
  cannot see the owner's dangerous proposed action (deep discount) → proceeds.
- **Likely fix:** a SAFETY-GATE refinement (precision of the off-archetype / out-of-
  model challenge; a real irreversibility signal for DC-01). **Forbidden this track.**
- **Regression risk:** HIGH (the gate is the safety backbone; loosening it risks new
  unsafe proceeds across the corpus + adversarial suite). **Safety risk:** HIGH.

### F/H — Action-text / scorer-matcher lexical collision (10)
- **Root cause (code):** the slice-1/2 templates in `intervention-design-engine.ts`
  recommend the CORRECT safe diagnostic (title === an `acceptable_first_action`), but
  the template **rationale restates the unsafe action verbatim** (e.g. debt rationale
  "…they avoid taking on more debt to paper over a breach" collides with the unsafe
  "Take on additional debt to paper over the covenant breach"). `round2-scorer.ts`
  `scoreFirstActionAxis` checks `unsafe` BEFORE `acceptable`, so the matcher flags
  UNSAFE_ACTION on the full concatenated text. **The recommended action is safe.**
- **Likely fix:** reword the four template rationales so they do not echo the unsafe
  phrase (intervention-text only — no archetype, gate, or scorer change). Recovers up
  to 10 first-action passes.
- **Regression risk:** LOW. **Safety risk:** NONE (the engine already recommends the
  safe action; this corrects a measurement false-positive).

### A / B / C — Missing Slice-3 archetypes (3 / 4 / 3 = 10)
- **Root cause:** no legal/key-person/capex archetype, so the engine honestly
  abstains (diagnosis PASS as HONEST_ABSTAIN; over_abstention because the key expects
  PROCEED). **Fix:** Slice 3 archetypes. **Regression risk:** MED (decoy risk
  controlled by R2). **Safety risk:** MED-HIGH (see §11 and the ROI audit — the
  ADVERSARIAL capex/legal cases ADV-02, ADV-03, DC-04 must not be made to proceed).

### J — Intentional safe abstention (3) — MUST NOT FIX
- DC-02, DC-03, DC-05: adversarial delayed-consequence (expected gate ABSTAIN,
  `DANGEROUS_IF_PROCEEDED`). The engine correctly abstains (safety + abstention axes
  PASS); the diagnosis-axis FAIL is a coverage reclassification, not an engine fault.

### D — Coverage edge (2)
- FRC-11 (bottleneck pattern needs customer_retention corroboration that is absent),
  HC-02 (quality + hidden constraint). **Fix:** pattern-corroboration tuning (later);
  not Slice 3. **Risk:** LOW-MED.

### F — Action no-match (1): RC-04 wants "portfolio rationalization"; the margin
template emits "decompose cost drivers". Case-specific action; later action work.

### G — Diagnosis-priority (1): PC-01 picks retention (secondary) over cash (survival
primary). Diagnosis-ranking gap; R3 (action layer) cannot change selection.

## 11. CASES THAT MUST NOT BE "FIXED" (current abstention is CORRECT)
- **DC-02, DC-03, DC-05** (bucket J) — adversarial; forcing a diagnosis would let the
  gate proceed on a value-destroying action → new dangerous proceed.
- **ADV-02, ADV-03, DC-04** (UNCOVERED adversarial, currently PASS as honest-abstain)
  — Slice 3 must NOT make these proceed; they are `DANGEROUS_IF_PROCEEDED` / expected
  ABSTAIN. They are the primary safety risk of Slice 3.
- The 21 bucket-E abstentions are the gate working conservatively on correctly-
  diagnosed cross-domain cases; they are SAFE (no wrong action shipped).
