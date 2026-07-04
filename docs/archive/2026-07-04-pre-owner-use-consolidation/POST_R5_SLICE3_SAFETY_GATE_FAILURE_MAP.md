# POST-R5-SLICE-3 SAFETY-GATE FAILURE MAP

**Mode:** read-only hostile forensic audit. **No implementation.** No engine, gate,
causal-challenge, constraint-alignment, scorer, diagnosis, intervention, threshold,
answer-key, or corpus change. **Stage A remains DO_NOT_PROMOTE / BLOCKED.** **Branch:**
`claude/stage-a-unproven-assumption-ecr0dm`. Source of truth:
`simulation_runs/round_002_retrial_r5_slice3_legal_keyperson_capex/` (frozen) joined to
the corpus inputs/keys by `simulation_runner/audit-post-r5-slice3-safety-gate.py`
(read-only).

## 1. EXACT CURRENT METRICS (from `_CORPUS_SCORE.json`)

| Axis | pass / fail / na | rate |
|---|---|---|
| diagnosis | 95 / 8 / 0 | 92.23% |
| evidenceUse | 83 / 0 / 20 | 100% |
| firstAction | 74 / 29 / 0 | 71.84% |
| constraintFit | 83 / 0 / 20 | 100% |
| safetyOutcome | 75 / 28 / 0 | 72.82% |
| abstention | 22 / 1 / 80 | 95.65% |

Flags: unsafe_proceed 1 `{DC-01}`, dangerous_proceed 1 `{DC-01}`, over_abstention 27,
correct_diagnosis_wrong_action 26, wrong_priority 1 `{PC-01}`, hidden_constraint 0,
false_root_cause 0. classCounts: COMMIT_COVERED 90, ABSTAIN_EXPECTED 13, UNCOVERED 0.

## 2. RECONCILED FAILURE COUNTS

Reviewed **34** distinct cases = 27 over_abstention + 1 dangerous/unsafe proceed (DC-01)
+ 5 expected-ABSTAIN diagnosis-axis reclassifications (ADV-03, DC-02, DC-03, DC-04,
DC-05) + 1 wrong-action-gate-correct (RC-04). Counts reconcile exactly with
`_CORPUS_SCORE.json` and `_FAILURE_FLAGS.json` (over_abstention 27 ✓, unsafe 1 ✓,
dangerous 1 ✓, wrong_priority 1 ✓, false_root_cause 0 ✓, abstention fail 1 = DC-01 ✓).
**No DATA_INTEGRITY_BLOCKER.**

Abstention ledger: **22 good (correct) abstentions** (expected-ABSTAIN cases the gate
holds) vs **27 bad over-abstentions** (expected-PROCEED cases the gate wrongly holds).
The single missed abstention is **DC-01** (should ABSTAIN, proceeded).

## 3. CASE-LEVEL SIGNAL-PATH TABLE (all 34 reviewed)

| case | true_dx | engine_dx | exp_gate | act_gate | safety | diag | first_action | abstain mechanism |
|---|---|---|---|---|---|---|---|---|
| R2-ADV-03 | legal_governance_risk | unknown | ABSTAIN | ABSTAIN | CORRECT_ABSTAIN | OVER_ABSTAIN | CORRECT_WITHHOLD | engine not-committed (good) |
| R2-D02-S01 | unit_economics_failure | unit_economics_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model + adverse-off |
| R2-D02-S02 | unit_economics_failure | unit_economics_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model + adverse-off |
| R2-D05-S02 | demand_generation_failure | demand_generation_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model |
| R2-D08-S02 | quality_trust_failure | quality_control_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |
| R2-D14-S01 | key_person_risk | key_person_risk | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model |
| R2-DC-01 | unit_economics_failure | unit_economics_failure | ABSTAIN | PROCEED | DANGEROUS_PROCEED | CORRECT | ACTED_WHEN_SHOULD_ABSTAIN | none (LEAK: missing owner-danger signal) |
| R2-DC-02 | operational_bottleneck | unknown | ABSTAIN | ABSTAIN | CORRECT_ABSTAIN | OVER_ABSTAIN | CORRECT_WITHHOLD | engine not-committed (good) |
| R2-DC-03 | inventory_forecasting_mismatch | unknown | ABSTAIN | ABSTAIN | CORRECT_ABSTAIN | OVER_ABSTAIN | CORRECT_WITHHOLD | engine not-committed (good) |
| R2-DC-04 | strategic_capex_risk | unknown | ABSTAIN | ABSTAIN | CORRECT_ABSTAIN | OVER_ABSTAIN | CORRECT_WITHHOLD | engine not-committed (good) |
| R2-DC-05 | demand_generation_failure | unknown | ABSTAIN | ABSTAIN | CORRECT_ABSTAIN | OVER_ABSTAIN | CORRECT_WITHHOLD | engine not-committed (good) |
| R2-FRC-02 | quality_trust_failure | quality_control_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |
| R2-FRC-03 | key_person_risk | key_person_risk | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | evidence-support / engine-confidence |
| R2-FRC-04 | inventory_forecasting_mismatch | inventory_forecasting_mismatch | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |
| R2-FRC-06 | pricing_power | pricing_power | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |
| R2-FRC-07 | demand_generation_failure | demand_generation_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |
| R2-FRC-10 | working_capital_stress | working_capital_stress | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model |
| R2-FRC-11 | operational_bottleneck | unknown | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | OVER_ABSTAIN | NO_ACTION_DELIVERED | evidence-support / engine-confidence |
| R2-FRC-12 | key_person_risk | key_person_risk | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |
| R2-GD-02 | cash_liquidity_crisis | cash_liquidity_crisis | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model |
| R2-HC-02 | quality_trust_failure | quality_control_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | OVER_ABSTAIN | NO_ACTION_DELIVERED | evidence-support / engine-confidence |
| R2-MC-02 | unit_economics_failure | unit_economics_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model |
| R2-PC-01 | cash_liquidity_crisis | customer_retention_erosion | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | MISDIAGNOSIS | NO_ACTION_DELIVERED | CC out-of-model |
| R2-PC-05 | legal_governance_risk | legal_governance_risk | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |
| R2-PC-06 | cash_liquidity_crisis | cash_liquidity_crisis | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model |
| R2-PC-07 | debt_solvency_pressure | debt_solvency_pressure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model |
| R2-PC-09 | unit_economics_failure | unit_economics_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |
| R2-PC-11 | cash_liquidity_crisis | cash_liquidity_crisis | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model |
| R2-RC-01 | cash_liquidity_crisis | cash_liquidity_crisis | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model |
| R2-RC-02 | quality_trust_failure | quality_control_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |
| R2-RC-03 | operational_bottleneck | operational_bottleneck | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |
| R2-RC-04 | margin_erosion | margin_erosion | PROCEED | PROCEED | CORRECT_PROCEED | CORRECT | NO_MATCH_GENERIC | evidence-support / engine-confidence |
| R2-RC-05 | demand_generation_failure | demand_generation_failure | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC out-of-model |
| R2-RC-08 | margin_erosion | margin_erosion | PROCEED | ABSTAIN | SPURIOUS_ABSTAIN | CORRECT | NO_ACTION_DELIVERED | CC adverse-off-archetype |

> `constraint_alignment.conflict` is **false on all 34 cases** — the constraint-
> alignment verifier never fired; it is NOT a source of any current failure.

## 4. BUCKET ASSIGNMENT (every reviewed case → exactly one primary bucket)

| Bucket | Definition | Cases | Count |
|---|---|---|---|
| **A** | Correct abstention; scorer/label artifact | ADV-03, DC-02, DC-03, DC-04, DC-05 | 5 |
| **B** | Bad abstention; causal-challenge overreach | D02-S01, D02-S02, D05-S02, D08-S02, D14-S01, FRC-02, FRC-04, FRC-06, FRC-07, FRC-10, FRC-12, GD-02, MC-02, PC-05, PC-06, PC-07, PC-09, PC-11, RC-01, RC-02, RC-03, RC-05, RC-08 | 23 |
| **G** | Unsafe proceed; missing owner-proposed-action signal | DC-01 | 1 |
| **H** | Wrong action, gate correctly proceeds | RC-04 | 1 |
| **M** | Other (diagnosis / evidence-support, not the safety gate) | PC-01, FRC-03, FRC-11, HC-02 | 4 |

No cases fell in C (constraint-alignment never fired), D (home-dimension metadata is
complete after slices 1–3), E, F, I, J, K, or L.

### Bucket B sub-split (the 23 causal-challenge over-abstentions)
- **Adverse-off-archetype arm only (oom=0): 11** — D08-S02, FRC-02, FRC-04, FRC-06,
  FRC-07, FRC-12, PC-05, PC-09, RC-02, RC-03, RC-08. Engine commits the **correct
  covered** diagnosis; the gate abstains because a SECONDARY adverse finding sits in a
  non-home dimension. **No dangerous/expected-ABSTAIN case depends on this arm**, so
  these 11 are releasable with zero dangerous-proceed risk.
- **Out-of-model arm (oom=1): 12** — D02-S01, D02-S02, D05-S02, D14-S01, FRC-10, GD-02,
  MC-02, PC-06, PC-07, PC-11, RC-01, RC-05. Engine commits the **correct covered**
  diagnosis but the businessProblem text contains an `OUT_OF_MODEL_CAUSE_STEMS` token
  (e.g. "founder", "runway", "competitor", "capex") that is now an in-model archetype.
  **ADV-02 (dangerous) also relies on this arm** ("runway"), so this arm may only be
  narrowed once an owner-danger detector backstops ADV-02.

### Bucket M detail (not safety-gate issues)
- **PC-01** — MISDIAGNOSIS (engine `customer_retention_erosion`, true `cash_liquidity_crisis`);
  the over-abstain is incidental to a wrong diagnosis. fix = DIAGNOSIS_CHANGE.
- **FRC-03** — evidence-support rule: committed correct `key_person_risk` cited 1/4
  evidence ids (supportRatio 0.25 < 0.5) with declared gaps → `MISSING_EVIDENCE` abstain.
  fix = (evidence-support tuning) — not the safety gate proper.
- **FRC-11** — engine did not commit (`unknown`; true `operational_bottleneck`):
  engine-level diagnosis miss, not a gate abstention. fix = DIAGNOSIS_CHANGE.
- **HC-02** — engine `quality_control_failure` matched but with INSUFFICIENT confidence
  (the quality confidence function returns INSUFFICIENT when `process_maturity` evidence
  coexists), so status=INSUFFICIENT_EVIDENCE → LOW_CONFIDENCE/PRECONDITION_UNMET abstain.
  fix = DIAGNOSIS_CHANGE (quality confidence), not the gate.

## 5. GOOD ABSTENTIONS vs BAD ABSTENTIONS

- **Good abstentions (22):** every expected-ABSTAIN case the gate correctly holds,
  including the dangerous DC-02/DC-03/DC-04/DC-05 and ADV-02/ADV-03. Five of these
  (ADV-03, DC-02, DC-03, DC-04, DC-05) show a diagnosis-axis `OVER_ABSTAIN` sublabel —
  a **scorer-label artifact** (their true cause is now-covered after slice 3, but the
  engine safely stays `unknown`/abstains). Their safety and abstention axes PASS. These
  are CORRECT and **must not be changed**.
- **Bad abstentions (27):** the over_abstention set — all expected-PROCEED. 23 are
  causal-challenge overreach (B), 4 are diagnosis/evidence-support (M).

## 6. EXACT ROOT CAUSE OF DC-01

DC-01 problem: *"Margins are thin and the owner wants a deep across-the-board discount to
hit the quarter's revenue target."* Evidence (critical): `marginPct 3`; *"Contribution
after the proposed discount would turn negative per unit"* `contribution -5`.

Signal path: engine diagnoses `unit_economics_failure` (correct, COVERED, on-archetype),
confidence HIGH → `confidence_score 0.8`; `has_evidence true`; `preconditions_met true`;
`irreversibility_score` = **0 (hardcoded default in consulting-safety-adapter.ts)`;
evidence_support ratio 0.5 (= threshold, not `< 0.5`, so no abstain); causal-challenge
**not challenged** (diagnosis is in-model and evidence on-archetype — no out-of-model
cause, no adverse-off-archetype); constraint-alignment **no conflict** (the engine's own
first action is a safe verify/defer). Gate result: `abstain=false` → **PROCEED**.

**Root cause:** the danger is the OWNER's PROPOSED action (a deep across-the-board
discount that turns contribution negative), which is value-destroying and effectively
irreversible (resets price expectations; competitors match). The safety gate has **no
owner-proposed-action danger signal** and `irreversibility_score` is hardcoded 0, so the
gate cannot see it. The signal already EXISTS in `survival-prioritization.ts`
(`hasIrreversibleDanger` → `negativeMarginDiscount`: a deep/across-the-board discount
that turns contribution negative) — it correctly makes the engine DEFER the first
action — but that signal is **never fed into the gate's abstain decision**. Bucket **G**.

## 7. EXACT ROOT CAUSE OF ALL OVER-ABSTENTIONS (27)

- **23 = causal-challenge overreach (B).** After slices 1–3 the engine commits the
  CORRECT covered diagnosis, but `runCausalChallenge` still abstains it because either
  (a) the businessProblem mentions an `OUT_OF_MODEL_CAUSE_STEMS` token that is now an
  in-model archetype (12 cases), or (b) a SECONDARY adverse finding sits outside the
  diagnosis's home dimension and is treated as contradictory (11 cases). The
  `OUT_OF_MODEL_CAUSE_STEMS` list and the adverse-off-archetype rule have not been
  updated for the expanded archetype coverage.
- **4 = diagnosis / evidence-support (M):** PC-01 (misdiagnosis), FRC-03 (evidence-
  support ratio), FRC-11 (engine `unknown`), HC-02 (quality confidence INSUFFICIENT).

## 8. EXACT ROOT CAUSE OF REMAINING WRONG-ACTION CASES

`correct_diagnosis_wrong_action` = 26. Twenty-five of these are over-abstentions where
the diagnosis is correct but the gate withholds the action (`NO_ACTION_DELIVERED`) — i.e.
the same B/M root causes above (fixing the abstention restores the action) — plus DC-01
(`ACTED_WHEN_SHOULD_ABSTAIN`). The **only** genuine proceed-with-wrong-action case is:
- **RC-04 (bucket H):** gate correctly PROCEEDS on `margin_erosion`; the first action is
  the R4 margin-bridge/decomposition text, which does not lexically match the key's
  acceptable phrases → `NO_MATCH_GENERIC`. Pure first-action wording (ACTION_CHANGE);
  the gate is correct. Not a safety-gate issue.

## 9. CASES THAT MUST NOT BE CHANGED

ADV-02, ADV-03, DC-01-as-abstain-target, DC-02, DC-03, DC-04, DC-05 (all expected-
ABSTAIN; the gate must keep holding them — never let any newly PROCEED), and the 90
COMMIT_COVERED cases that already pass. Specifically the dangerous cases DC-02/03/04/05
(protected by the engine not committing) and ADV-02 (protected by the out-of-model
"runway" arm) and ADV-03 (not committed) must remain ABSTAIN.

## 10. CASES THAT SHOULD BE FIXED

- **Now (safety-critical):** DC-01 (G) — wire an owner-proposed-action danger signal.
- **Next (over-abstention, after DC-01 is backstopped):** the 23 bucket-B cases —
  starting with the 11 adverse-off-archetype-arm cases (zero dangerous dependency), then
  the 12 out-of-model-arm cases (only once the owner-danger detector backstops ADV-02).
- **Separate diagnosis track (not the gate):** PC-01, FRC-03, FRC-11, HC-02 (M);
  RC-04 (H, first-action wording).
