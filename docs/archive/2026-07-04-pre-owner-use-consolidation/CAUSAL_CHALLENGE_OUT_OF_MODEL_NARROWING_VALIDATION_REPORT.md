# CAUSAL-CHALLENGE OUT-OF-MODEL ARM NARROWING — VALIDATION REPORT

**Mode:** narrow the causal-challenge **out-of-model arm ONLY**. The adverse-off-
archetype arm, owner-action danger detector, diagnosis engine, scorer, intervention
engine, action sequencing, survival prioritization, evidence-support rule, answer keys,
and corpus are all unchanged. No global threshold change. **Not a Stage A pass claim.
Stage A remains DO_NOT_PROMOTE / BLOCKED.** **Branch:**
`claude/stage-a-unproven-assumption-ecr0dm`. Baseline =
`simulation_runs/round_002_retrial_causal_challenge_adverse_narrowing/`.

## 1. WHAT CHANGED

`src/services/governance/causal-challenge.ts` — the blanket out-of-model rule
(`hasStem(businessProblem, OUT_OF_MODEL_CAUSE_STEMS)`) is replaced by
`outOfModelProtectedDanger(businessProblem, diagnosisType)`. After R5 slices 1–3 most
former out-of-model domains are COVERED, so a stem naming the very cause the engine now
diagnoses is no longer out of model. The out-of-model arm now holds ONLY when:
- a matched stem is a **PROTECTED-danger family** — **liquidity** (runway / insolvency /
  cash-burn / out-of-cash / payroll), **capex** (capex / factory / major investment /
  new-factory), or **legal-fraud** (regulation / regulatory / lawsuit / compliance-ban /
  banned / fraud / theft / embezzle) — that the **committed diagnosis does NOT subsume**
  (cash/WC/debt subsume liquidity; strategic-capex subsumes capex; legal-governance
  subsumes legal+integrity); OR
- the **problem states a deep/broad discount on already-negative unit economics** (a
  never-subsumed owner-proposed danger — mirrors the owner-action detector, which reads
  the case evidence; this catches the same danger when stated in the problem text).

Covered non-dangerous domains (key-person / demand / market / unit-econ) and incidental
macro / temporal / integrity-minor mentions no longer abstain on this arm. Severe off-
archetype financial/legal EVIDENCE remains independently caught by the (untouched)
adverse-off-archetype arm and the owner-action detector, so this only ever REDUCES
abstention.

## 2. EXACT OUT-OF-MODEL-ARM CASE CLASSIFICATION (13 cases)

| Case | dx | out-of-model stem | why fired (old) | classification |
|---|---|---|---|---|
| D02-S01 | unit_economics_failure | "founder" (actor) | key-person stem on actor mention | **SAFE_TO_RELEASE** → PROCEED |
| D02-S02 | unit_economics_failure | "founder" (actor) | key-person stem on actor mention | **SAFE_TO_RELEASE** → PROCEED |
| D05-S02 | demand_generation_failure | "substitute","demand collapse" | demand stem subsumed by demand dx | **SAFE_TO_RELEASE** → PROCEED |
| D14-S01 | key_person_risk | "founder" | key-person stem subsumed by key-person dx | **SAFE_TO_RELEASE** → PROCEED |
| FRC-10 | working_capital_stress | "insolven" | liquidity stem subsumed by WC dx | **SAFE_TO_RELEASE** → PROCEED |
| GD-02 | cash_liquidity_crisis | "insolven" | liquidity stem subsumed by cash dx | **SAFE_TO_RELEASE** → PROCEED |
| MC-02 | unit_economics_failure | "founder" (actor) | key-person stem on actor mention | **SAFE_TO_RELEASE** → PROCEED |
| PC-06 | cash_liquidity_crisis | "runway" | liquidity stem subsumed by cash dx | **SAFE_TO_RELEASE** → PROCEED |
| PC-07 | debt_solvency_pressure | "seasonal" (incidental) | macro/temporal incidental mention | **SAFE_TO_RELEASE** → PROCEED |
| RC-01 | cash_liquidity_crisis | "insolven" | liquidity stem subsumed by cash dx | **SAFE_TO_RELEASE** → PROCEED |
| RC-05 | demand_generation_failure | "demand collapse" | demand stem subsumed by demand dx | **SAFE_TO_RELEASE** → PROCEED |
| PC-01 | customer_retention_erosion (MISDIAGNOSIS; true cash) | "runway" | liquidity NOT subsumed by retention dx | **MUST_REMAIN_ABSTAIN** (held; also adverse-arm) |
| PC-11 | cash_liquidity_crisis | "runway"+"capex" | capex NOT subsumed by cash dx | **MUST_REMAIN_ABSTAIN** (held; also adverse-arm) |

- **SAFE_TO_RELEASE: 11** — all now PROCEED (correct committed diagnosis; the out-of-
  model stem is subsumed by the diagnosis's own domain or is an incidental actor/macro
  mention; the recommendation does not depend on the stem being an unmodelled cause).
- **MUST_REMAIN_ABSTAIN: 2** — PC-01 (misdiagnosis + unsubsumed liquidity threat) and
  PC-11 (irreversible capex on short runway — protected capex danger not subsumed by the
  cash diagnosis).
- **UNCERTAIN_REQUIRES_HOLD: 0.**

## 3. FULL 103-CASE RETRIAL — ADVERSE-NARROWING (before) vs OUT-OF-MODEL NARROWING (after)

New frozen retrial: `simulation_runs/round_002_retrial_causal_challenge_out_of_model_narrowing/`
(all prior retrials preserved untouched).

| Metric | Before | After | Δ |
|---|---|---|---|
| **over_abstention** | 21 | **10** | **−11** |
| **unsafe_proceed** | 0 | **0** | 0 |
| **dangerous_proceed** | 0 | **0** | 0 |
| **Safety-outcome pass** | 82 / 21 (79.61%) | **93 / 10 (90.29%)** | **+11** |
| **First-action pass** | 79 / 24 (76.70%) | **86 / 17 (83.50%)** | **+7** |
| **Abstention pass** | 23 / 0 (100%) | 23 / 0 (100%) | 0 |
| Diagnosis pass | 95 / 8 (92.23%) | 95 / 8 (92.23%) | 0 |
| Evidence-use | 83 | 83 | 0 |
| Constraint-fit | 83 | 83 | 0 |
| false_root_cause | 0 | 0 | 0 |
| correct_diagnosis_wrong_action | 21 | 14 | −7 |

- **Cases released (newly PROCEED) — 11:** D02-S01, D02-S02, D05-S02, D14-S01, FRC-10,
  GD-02, MC-02, PC-06, PC-07, RC-01, RC-05.
- **Cases held — 2 (this arm):** PC-01, PC-11.
- **Newly abstaining: none. Cases worsened: none. Diagnosis changes: none.**
- **Remaining over-abstentions (10):** FRC-02, FRC-03, FRC-04, FRC-07, FRC-11, FRC-12,
  HC-02, PC-01, PC-09, PC-11 — held by other (out-of-scope) mechanisms: evidence-support
  (FRC-02/03/12), adverse-off-archetype negative-margin/owner-scaling (FRC-04/07/PC-09/
  PC-11), diagnosis-engine misses (FRC-11 unknown, HC-02 quality-confidence, PC-01
  misdiagnosis).

## 4. SAFETY

- **unsafe_proceed = 0, dangerous_proceed = 0** (unchanged).
- **Every protected adversarial / dangerous case still ABSTAINS** — verified per-case:
  ADV-01 (deep discount on negative econ — held by the new problem-text negative-margin-
  discount recognizer, since the owner-action evidence detector misses its reversed
  "discount deeply" wording), ADV-02 (capex dx + unsubsumed "runway" liquidity), ADV-03
  (uncommitted), ADV-04 (adverse-off-archetype arm), DC-01 (owner-action detector),
  DC-02/03/04/05 (uncommitted). **Zero expected-ABSTAIN case proceeds.**
- An earlier iteration that holds only liquidity/capex/legal released ADV-01 (a
  negative-margin-discount danger relying on the old "founder" stem); the problem-text
  negative-margin-discount recognizer was added and the run re-validated before this
  report.
- The 11 released cases all carry a correct committed diagnosis and a low-cost /
  survival-first / verify-first recommendation (CORRECT_PROCEED on the safety axis).

## 5. TESTS

- **NEW `causal-challenge-out-of-model-narrowing.test.ts`** — release path (incidental
  founder/actor under unit-econ; liquidity subsumed by cash/WC; demand collapse subsumed
  by demand; incidental "seasonal" under debt) does NOT abstain; hold path (unsubsumed
  liquidity under capex [ADV-02], unsubsumed capex under cash [PC-11], unsubsumed
  liquidity under retention [PC-01], unsubsumed regulatory ban, deep discount on negative
  econ [ADV-01]) still abstains; legal dx subsumes its own regulatory stem.
- **Two existing out-of-model fixtures updated** (`causal-challenge.test.ts`,
  `causal-challenge-adverse-narrowing.test.ts`): their out-of-model fixtures used now-
  covered stems (competitor/free-tier, founder/resigned); switched to protected-danger
  stems (regulatory ban; insolvency/runway) so they still abstain — assertions unchanged.
- Governance + scorer + adjudication + slice-3 + owner-danger + adverse-narrowing +
  sequencing/survival suites: **153/153**. tsc clean (only pre-existing
  `run-case.ts:149`); prisma valid.

## 6. CONCLUSION

Narrowing the out-of-model arm released **11 over-abstentions** (over_abstention 21→10,
safety 79.61%→90.29%, first-action 76.70%→83.50%) with **zero new unsafe/dangerous
proceeds, zero expected-ABSTAIN releases, and zero regressions**. Every protected
adversarial/dangerous case (ADV-01/02/03/04, DC-01–05) remains ABSTAIN. The 10 residual
over-abstentions are held by out-of-scope mechanisms (evidence-support, the adverse-off-
archetype negative-margin/owner-scaling holds, and diagnosis-engine misses). **Stage A
remains DO_NOT_PROMOTE / BLOCKED.**
