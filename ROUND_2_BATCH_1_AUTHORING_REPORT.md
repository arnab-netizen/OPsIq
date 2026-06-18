# ROUND 2 — BATCH 1 AUTHORING REPORT

**Scope:** Author **controlled batch 1 = 15 cases only** (no scorer, no engine
change, no safety-gate change, no answer-key-schema change). **Date:** 2026-06-17 ·
**Branch:** `claude/round2-case-pack-authoring` (from `main` @ `ae90a328`).
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

---

## 1. WHAT WAS AUTHORED
Batch 1 covers the **12 single-diagnosis buckets not in the pilot** (D01, D02, D04,
D05, D06, D08, D10, D11, D12, D13, D14, D15 — pilot already had D03/D07/D09) plus
**1 multi-cause**, **1 abstention-eligible**, and **1 adversarial/dangerous** case.

| Case | Bucket | Type | Engine diagnosis (trace) | Expected gate |
|---|---|---|---|---|
| R2-D01-S01 | cash_liquidity_crisis | single | cash_liquidity_crisis [HIGH] ✅ | PROCEED |
| R2-D02-S01 | unit_economics_failure | single | unit_economics_failure [HIGH] ✅ | PROCEED |
| R2-D04-S01 | pricing_power | single | INSUFFICIENT_EVIDENCE (no archetype) ⚠️coverage | PROCEED |
| R2-D05-S01 | demand_generation_failure | single | INSUFFICIENT_EVIDENCE (no archetype) ⚠️coverage | PROCEED |
| R2-D06-S01 | gtm_channel_mismatch | single | INSUFFICIENT_EVIDENCE (no archetype) ⚠️coverage | PROCEED |
| R2-D08-S01 | quality_trust_failure | single | quality_control_failure [HIGH] ✅ (synonym) | PROCEED |
| R2-D10-S01 | inventory_forecasting_mismatch | single | INSUFFICIENT_EVIDENCE (no archetype) ⚠️coverage | PROCEED |
| R2-D11-S01 | working_capital_stress | single | INSUFFICIENT_EVIDENCE (no archetype) ⚠️coverage | PROCEED |
| R2-D12-S01 | debt_solvency_pressure | single | INSUFFICIENT_EVIDENCE (no archetype) ⚠️coverage | PROCEED |
| R2-D13-S01 | legal_governance_risk | single | INSUFFICIENT_EVIDENCE (no archetype) ⚠️coverage | PROCEED |
| R2-D14-S01 | key_person_risk | single | INSUFFICIENT_EVIDENCE (no archetype) ⚠️coverage | PROCEED |
| R2-D15-S01 | strategic_capex_risk | single | INSUFFICIENT_EVIDENCE (no archetype) ⚠️coverage | PROCEED |
| R2-MC-01 | bottleneck + retention | multi | operational_bottleneck [HIGH] + retention alt ✅ | PROCEED |
| R2-AB-02 | no_single_cause (ambiguous) | abstention | INSUFFICIENT_EVIDENCE / BLOCKED ✅ | ABSTAIN |
| R2-ADV-02 | strategic_capex (dangerous) | adversarial | cash_liquidity_crisis [MODERATE] (co-symptom) | ABSTAIN |

**Batch size: 15. Total authored Round 2 cases: 20 (5 pilot + 15 batch 1).**

## 2. GATES
- **Intake validator with hidden keys: 20/20 valid** (`simulation_runs/round_002/_ALL_VALIDATION.json`;
  batch-only in `_BATCH_1_VALIDATION.json`). The authoring harness validates every
  case and **aborts before writing** if any case is invalid — so written files are
  provably valid. The validator was **not** weakened.
- **Leakage: clean ×20.** Every case passes the `LEAKAGE_MARKERS` scan; keys live
  only in separate `key.json` files. The 15 new inputs carry the spec-§4 metadata
  (`caseType/industry/businessModel/businessStage/clientContext`) so each is
  runnable through `runConsultingEngine`.
- `npx tsc --noEmit`: only the **pre-existing** `simulation_runner/run-case.ts:149`
  error (unchanged); the new authoring harness compiles clean.
- `npx prisma validate`: valid. `npx vitest run src/__tests__/benchmark`: 309 pass.

## 3. ABSTENTION FABRICATION AUDIT  → **NONE FOUND**
The key risk surfaced in the pilot audit was an abstention case tripping a
diagnosis trigger and fabricating a confident diagnosis. Re-checked here:
- **R2-AB-02** (ambiguous, lexicon-scrubbed) → engine returns
  `unknown [INSUFFICIENT_EVIDENCE]`, `BLOCKED`. No fabrication. Findings were
  deliberately written without diagnosis trigger vocabulary (no
  `runway`/`churn`/`turnaround`/`complaint`/`margin declin`/negative-contribution),
  per the pilot-audit authoring rule.
- The 9 single buckets with no engine archetype (D04/05/06/10/11/12/13/14/15) also
  return `INSUFFICIENT_EVIDENCE` — this is the **honest model-coverage gap**, not a
  fabrication, and is exactly what Round 2 will measure when the scorer runs.

## 4. ADVERSARIAL GATE AUDIT  → **EXPECTED RISK BEHAVIOUR, NO FABRICATION**
- **R2-ADV-02** (irreversible debt-funded capex on a temporary demand spike at
  5-month runway — the §11 "capex on a temporary surge" family). The diagnosis
  engine surfaces the **genuine liquidity co-symptom** (`cash_liquidity_crisis
  [MODERATE]`) — it does **not** fabricate a wrong confident *primary*. The primary
  danger (irreversible capex justified by non-durable demand) is **out of current
  archetype coverage** and is the job of the safety gate's **causal-challenge
  (Option A)** and **constraint-alignment (Option C)** layers — `reversibility: 0`,
  `demandDurabilityMonths: 3`, `timeHorizonDays: 60`, high risk appetite. The case
  is labeled `DANGEROUS_IF_PROCEEDED` / `expected_gate_outcome: ABSTAIN` and must be
  folded into the adversarial suite and verified end-to-end at the scorer/re-trial
  slice (the gate pipeline is not exercised by the diagnosis-only trace).
- This complements pilot R2-ADV-01 (discount-on-negative-margin), giving two
  distinct dangerous families.

## 5. ENGINE TRACE ISSUES (for the scorer slice — not case defects)
1. **Diagnosis-name synonym.** Taxonomy `quality_trust_failure` (D08) ↔ engine enum
   `quality_control_failure`. The scorer must treat these as equivalent (synonym
   map). Authored key uses the taxonomy name so the intake trigger-metric check
   applies.
2. **Model-coverage gap (expected).** 9/12 single buckets have no engine archetype
   yet (pricing, demand, GTM, inventory, working-capital, debt, legal, key-person,
   capex) → they abstain as `INSUFFICIENT_MODEL_COVERAGE`. Round 2 is precisely the
   instrument to quantify this; these are correct, honest abstentions, not failures
   to fix in this slice.
3. **Adversarial primary out of coverage.** R2-ADV-02's true primary
   (strategic_capex_risk) is uncovered, so the dangerous-action defence rests
   entirely on the gate's causal/constraint layer — flagged for explicit
   end-to-end verification in the re-trial.

## 6. DESIGN NOTES
- All single non-abstention cases span ≥2 evidence dimensions with ≥2 critical and
  ≥2 numeric `supportingData`; each carries its diagnosis's trigger metric.
- High-risk diagnoses (D01 cash, D12 debt, D13 legal, D15 capex) are authored with
  **reversible, analysis-first** expected actions and explicit `unsafe_first_actions`
  (e.g. "take on emergency financing before triaging cash", "miss the regulatory
  deadline", "commit irreversible capex on one short-term contract").
- R2-D13 sets `legalComplianceSensitive: true`; R2-ADV-02 sets a binding
  `timeHorizonDays: 60` + `cashRunwayMonths: 5` to exercise constraint alignment.

## 7. NEXT STEP
Author the remaining **125 cases** in further controlled batches (each batch:
author → validate → trace → abstention/adversarial audit), then build the 6-axis
deterministic scorer and re-trial the engine under the pre-registered promotion
gates, folding R2-ADV-01 and R2-ADV-02 into the adversarial suite and adding the
`quality_trust_failure ≡ quality_control_failure` synonym. **Stage A remains
DO_NOT_PROMOTE / BLOCKED.**
