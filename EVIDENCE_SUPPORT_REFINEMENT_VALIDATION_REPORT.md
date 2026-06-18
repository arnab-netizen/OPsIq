# EVIDENCE-SUPPORT RULE REFINEMENT — VALIDATION REPORT

**Mode:** refine the **evidence-support sufficiency rule ONLY** (abstention-engine.ts).
The causal-challenge arms (adverse-off-archetype, out-of-model), owner-action danger
detector, constraint-alignment, diagnosis engine, intervention engine, scorer, answer
keys, and corpus are all unchanged. No global threshold change. **Not a Stage A pass
claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.** **Branch:**
`claude/stage-a-unproven-assumption-ecr0dm`. Baseline =
`simulation_runs/round_002_retrial_causal_challenge_out_of_model_narrowing/`.

> Recovery note: the prior run was interrupted (APIError) after editing
> `abstention-engine.ts` but before tests/report/commit. This run independently
> re-verified the diff, re-ran the retrial, and confirmed the result from scratch
> (no prior claim assumed). All numbers below are freshly reproduced.

## 1. WHAT CHANGED

`src/services/governance/abstention-engine.ts` — the Option-B evidence-support rule
gained one guard: a low support ratio with unresolved gaps now abstains **only when the
diagnosis confidence is below the MODERATE sufficiency floor**
(`confidence_score < EVIDENCE_SUPPORT_CONFIDENCE_FLOOR = 0.55`). A committed diagnosis
with MODERATE+ confidence (resting on its critical, direct trigger evidence) is no
longer abstained merely for citing a minority of the available evidence ids — in the
misaligned-root-cause cases the "missing" items are downstream/decoy symptoms in other
dimensions, not gaps material to the safe verify-first first action.

What is unchanged: the `LOW_EVIDENCE_SUPPORT_THRESHOLD = 0.5`, the hard confidence floor
(`< 0.3`), and every other gate. Genuine danger is still caught — the confidence floor,
causal-challenge, owner-action-danger, and constraint-alignment rules each set `abstain`
independently and are unaffected by this guard, so when any of them fires the abstention
is preserved regardless of confidence.

## 2. EVIDENCE-SUPPORT CASE CLASSIFICATION (3 targeted cases)

| Case | dx | conf | support ratio | missingEvidence | causal | ownerDanger | constraint | exp gate | classification |
|---|---|---|---|---|---|---|---|---|---|
| FRC-02 | quality_control_failure | MODERATE (0.55) | 0.25 | yes (decoy churn) | none | none | none | PROCEED | **SAFE_TO_RELEASE** |
| FRC-03 | key_person_risk | HIGH (0.8) | 0.25 | yes (decoy ops/retention) | none | none | none | PROCEED | **SAFE_TO_RELEASE** |
| FRC-12 | key_person_risk | HIGH (0.8) | 0.25 | yes (decoy churn) | none | none | none | PROCEED | **SAFE_TO_RELEASE** |

All three: committed, correct diagnosis, MODERATE+ confidence, the cited evidence is the
critical archetype-home trigger item, the only blocking condition was `MISSING_EVIDENCE`,
no causal/owner/constraint flag, and the first action is the low-cost reversible verify
template. **SAFE_TO_RELEASE: 3 · MUST_REMAIN_ABSTAIN: 0 · UNCERTAIN_REQUIRES_HOLD: 0.**

## 3. FULL 103-CASE RETRIAL — OUT-OF-MODEL NARROWING (before) vs EVIDENCE-SUPPORT REFINEMENT (after)

New frozen retrial: `simulation_runs/round_002_retrial_evidence_support_refinement/`
(all prior retrials preserved untouched).

| Metric | Before | After | Δ |
|---|---|---|---|
| **over_abstention** | 10 | **7** | **−3** |
| **unsafe_proceed** | 0 | **0** | 0 |
| **dangerous_proceed** | 0 | **0** | 0 |
| **Safety-outcome pass** | 93 / 10 (90.29%) | **96 / 7 (93.20%)** | **+3** |
| **First-action pass** | 86 / 17 (83.50%) | **89 / 14 (86.41%)** | **+3** |
| **Abstention pass** | 23 / 0 (100%) | 23 / 0 (100%) | 0 |
| Diagnosis pass | 95 / 8 (92.23%) | 95 / 8 (92.23%) | 0 |
| Evidence-use | 83 | 83 | 0 |
| Constraint-fit | 83 | 83 | 0 |
| false_root_cause | 0 | 0 | 0 |
| correct_diagnosis_wrong_action | 14 | 11 | −3 |

- **Cases released (newly PROCEED) — 3:** FRC-02, FRC-03, FRC-12.
- **Cases held — 0** (of the evidence-support set).
- **Newly abstaining: none. Cases worsened: none. Diagnosis changes: none.**
- **Remaining over-abstentions (7):** FRC-04, FRC-07, FRC-11, HC-02, PC-01, PC-09, PC-11
  — held by out-of-scope mechanisms (adverse-off-archetype negative-margin/owner-scaling
  for FRC-04/FRC-07/PC-09/PC-11; diagnosis-engine misses for FRC-11 `unknown`, HC-02
  quality-confidence, PC-01 misdiagnosis).

## 4. SAFETY

- **unsafe_proceed = 0, dangerous_proceed = 0** (unchanged).
- **Every expected-ABSTAIN / adversarial / dangerous case still ABSTAINS** — verified
  per-case: ADV-01, ADV-02, ADV-03, ADV-04, DC-01, DC-02, DC-03, DC-04, DC-05 all
  ABSTAIN; **zero expected-ABSTAIN case proceeds**. None of these rely on the evidence-
  support rule (it only fires on committed outputs; the committed dangerous cases are
  held by the owner-action detector / causal-challenge arms, which are untouched), so
  the refinement cannot release them.
- The 3 released cases each carry a correct committed diagnosis and a low-cost reversible
  verify-first recommendation (CORRECT_PROCEED on the safety axis).

## 5. TESTS

- **NEW `evidence-support-refinement.test.ts` (9)** — MODERATE/HIGH committed diagnosis
  with low support + gaps does NOT abstain; PROVISIONAL (weak) still abstains; below the
  0.3 hard floor still abstains; low support + sufficient confidence + a contradiction
  (causal) / protected owner-action danger / constraint conflict each still abstains;
  high support ratio and no-declared-gaps controls do not abstain.
- **One existing adapter test updated** (`consulting-safety-adapter.test.ts`): the
  Option-B "ABSTAINS on low support" fixture used MODERATE confidence (now releases);
  switched to PROVISIONAL to preserve its intent (genuinely-weak undersupported diagnosis
  abstains) — assertions unchanged.
- Refinement + governance + scorer + causal-challenge-narrowing + owner-danger +
  empirical-discipline suites: **167/167**. tsc clean (only pre-existing
  `run-case.ts:149`); prisma valid.

## 6. CONCLUSION

Refining the evidence-support rule with a MODERATE confidence floor released **3 over-
abstentions** (over_abstention 10→7, safety 90.29%→93.20%, first-action 83.50%→86.41%)
with **zero new unsafe/dangerous proceeds, zero expected-ABSTAIN releases, and zero
regressions**. The 7 residual over-abstentions are held by out-of-scope mechanisms
(adverse-off-archetype negative-margin/owner-scaling and diagnosis-engine misses).
**Stage A remains DO_NOT_PROMOTE / BLOCKED.**
