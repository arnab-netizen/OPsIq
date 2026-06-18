# PC-01 SURVIVAL-DOMINANCE DIAGNOSIS SELECTION — VALIDATION REPORT

**Mode:** diagnosis-**selection** only (one narrow reorder rule in `diagnosis-engine.ts`).
No new archetype, no trigger-threshold change, no causal-adjudication/safety-gate/
abstention/scorer/intervention/answer-key/corpus change. FRC-11 and HC-02 NOT
implemented; protected holds (FRC-04, FRC-07, PC-09, PC-11) untouched. **Not a Stage A
pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.** **Branch:**
`claude/stage-a-unproven-assumption-ecr0dm`. Baseline =
`simulation_runs/round_002_retrial_evidence_support_refinement/`.

## 1. WHAT CHANGED

`src/services/consulting-engine/diagnosis-engine.ts` — added a **survival-dominance**
reorder applied AFTER pattern matching and BEFORE R2 causal adjudication. When ALL hold:
1. there is **more than one** matched candidate;
2. `fin_hasCriticalSurvivalPressure(evidence)` — a `financial_health` item with a
   **≤3-month (~90-day) runway** OR an inherently-acute liquidity phrase (payroll /
   insolvency / cash-shortfall / "cannot meet obligations" / supplier-shutdown /
   liquidity-emergency);
3. the current PRIMARY is an **optimization diagnosis** (`OPTIMIZATION_DIAGNOSES` =
   customer_retention_erosion, demand_generation_failure, gtm_channel_mismatch,
   pricing_power, margin_erosion);
4. `cash_liquidity_crisis` is **already a matched candidate** at HIGH/MODERATE confidence;

then `cash_liquidity_crisis` is moved to PRIMARY (survival precedes optimization).

**Guarantees:** it never creates a cash match from unmatched evidence (it only reorders
already-matched candidates); it does not change the cash/retention trigger thresholds,
the global confidence sort, or any gate; debt/capex/unit-economics/legal/key-person/
inventory are NOT in `OPTIMIZATION_DIAGNOSES`, so survival never demotes them.

## 2. PRE-IMPLEMENTATION CASE ANALYSIS (cash / retention / cash-adversarial)

- **PC-01** (true cash primary / retention secondary, runway 3): engine misdiagnosed
  retention → **target to flip to cash**.
- **Cash-correct cases** (D01-S01/S02, GD-02, PC-06, PC-11, RC-01, RC-06): cash already
  primary → reorder is a no-op.
- **Retention-correct cases** (D07-S01/S02, HC-04, MK-02/07/10, RC-07): no critical
  runway/survival signal → rule does not fire → retention stays.
- **Cash-adversarial expected-ABSTAIN** (ADV-01 unit-econ, ADV-02 capex, ADV-04 debt,
  ADV-05 unit-econ; DC-01..05): their committed primary is unit-econ/capex/debt or
  `unknown` — **none is an optimization diagnosis**, so the rule cannot reorder them →
  they stay ABSTAIN. No expected-ABSTAIN case can newly proceed under this rule.

## 3. FULL 103-CASE RETRIAL — EVIDENCE-SUPPORT REFINEMENT (before) vs PC-01 SURVIVAL DOMINANCE (after)

New frozen retrial: `simulation_runs/round_002_retrial_pc01_survival_dominance/`
(all prior retrials preserved untouched).

| Metric | Before | After | Δ |
|---|---|---|---|
| **over_abstention** | 7 | **6** | **−1** |
| **Diagnosis pass** | 95 / 8 (92.23%) | **96 / 7 (93.20%)** | **+1** (PC-01 MISDIAGNOSIS→CORRECT) |
| **First-action pass** | 89 / 14 (86.41%) | **90 / 13 (87.38%)** | **+1** |
| **Safety-outcome pass** | 96 / 7 (93.20%) | **97 / 6 (94.17%)** | **+1** |
| **wrong_priority** | 1 | **0** | **−1** (PC-01 cleared) |
| Abstention pass | 23 / 0 (100%) | 23 / 0 (100%) | 0 |
| Evidence-use | 83 | 83 | 0 |
| Constraint-fit | 83 | 83 | 0 |
| **unsafe_proceed** | 0 | **0** | 0 |
| **dangerous_proceed** | 0 | **0** | 0 |
| **false_root_cause** | 0 | **0** | 0 |
| correct_diagnosis_wrong_action | 11 | 11 | 0 |

## 4. PER-CASE PROOF (machine-verified vs baseline)

- **PC-01:** diagnosis `customer_retention_erosion` → **`cash_liquidity_crisis`**;
  outcome `ABSTAIN` → **`PROCEED`**; diagnosis axis MISDIAGNOSIS → **CORRECT**;
  first-action → **ACCEPTABLE_ACTION** (the cash-stabilization survival-first action);
  `wrong_priority` cleared. **PC-01 is FIXED.**
- **Diagnosis changes:** exactly **{PC-01}** — no other case changed diagnosis.
- **Newly proceeding:** exactly **{PC-01}**. **Newly abstaining:** none.
- **No expected-ABSTAIN case proceeds.** Cash-adversarial cases all hold:
  ADV-01, ADV-02, ADV-04, ADV-05, DC-01, DC-02, DC-03, DC-04, DC-05 = **ABSTAIN**.
- **Protected holds untouched:** FRC-04, FRC-07, PC-09, PC-11 = **ABSTAIN**.
- **Cases improved: 1 (PC-01). Cases worsened: 0.** No regressions.

## 5. TESTS

- **NEW `pc01-survival-dominance.test.ts` (6):** cash survival beats retention; cash
  survival beats demand-generation (growth/marketing); a normal retention issue without
  survival pressure stays retention; no cash diagnosis is created when the cash pattern
  is not matched (comfortable runway); a healthy long reserve does not trigger
  dominance; a non-optimization diagnosis (debt) is NOT demoted even with a short runway.
- Diagnosis consumers + governance + scorer suites: **157/157**. tsc clean (only
  pre-existing `run-case.ts:149`); prisma valid.

## 6. CONCLUSION

The survival-dominance selection rule fixed **PC-01** (diagnosis 95→96 MISDIAGNOSIS→
CORRECT, over_abstention 7→6, safety 93.20%→94.17%, first-action 86.41%→87.38%,
wrong_priority 1→0) with **zero new unsafe/dangerous proceeds, zero expected-ABSTAIN
releases, and zero regressions** — exactly one case changed. The remaining 6 over-
abstentions are FRC-04/FRC-07/PC-09/PC-11 (protected safety holds), HC-02 (held —
multi-mechanism), and FRC-11 (deferred — bottleneck pattern, MEDIUM regression risk).
**Stage A remains DO_NOT_PROMOTE / BLOCKED.**
