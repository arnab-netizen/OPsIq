# SAFETY-GATE FIX OPTIONS AFTER R5 (analysis only)

**Mode:** analysis only. No implementation. **Stage A remains DO_NOT_PROMOTE /
BLOCKED.** **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. All gains are
machine-derived from the frozen R5-slice-3 retrial and the per-case signal-path table in
`POST_R5_SLICE3_SAFETY_GATE_FAILURE_MAP.md`, not estimated.

Key machine facts driving the comparison:
- The `negativeMarginDiscount` signal (deep/across-the-board discount → contribution
  negative) hits **exactly one corpus case: DC-01** (expected ABSTAIN / DANGEROUS).
  Zero expected-PROCEED cases carry it.
- The bare irreversible-capex signal (capexAmount + reversibility0/demandDurability)
  hits **4 cases: ADV-02 (ABSTAIN/dangerous) AND D15-S01, D15-S02, HC-05 (PROCEED/safe).**
- `constraint_alignment.conflict` is false on all 34 reviewed cases.
- Dangerous/expected-ABSTAIN protection today: DC-02/03/04/05 + ADV-03 = engine
  not-committing; ADV-02 = causal-challenge out-of-model "runway" arm; DC-01 = **none
  (the leak)**.

## OPTION COMPARISON

### 1. No fix; accept abstention
- Cases fixed: 0. Cases harmed: 0.
- Safety gain: none — **DC-01 remains a dangerous proceed.** Abstention loss: 0.
- Unsafe-proceed risk: unchanged (1). Complexity: none. Regression risk: none.
- Adversarial suite expand: no. **Build now? NO** — leaves the promotion blocker open.

### 2. Causal-challenge narrowing
- Cases fixed: up to 23 (bucket B) over-abstentions → big first-action/safety/over-
  abstention gain. Cases harmed: **ADV-02 at risk** (out-of-model "runway" arm is the
  only thing holding it) unless an owner-danger detector backstops it first.
- Safety gain: +up to 23 safetyOutcome; abstention gain: −up to 23 over-abstention.
- Unsafe-proceed risk: **HIGH if done first** (ADV-02 could newly PROCEED → new
  dangerous proceed); LOW for the adverse-off-archetype arm alone (11 cases, zero
  dangerous dependency).
- Complexity: MED. Regression risk: HIGH (it is the safety backbone). Adversarial suite
  expand: **YES**. **Build now? NO — must follow the owner-danger detector**, and the
  adverse-off-archetype arm should go before the out-of-model arm.

### 3. Constraint-alignment refinement
- Cases fixed: 0 (it never fires on any current case). Harmed: 0.
- Every gain/loss: 0. Complexity: low. Regression risk: low. **Build now? NO — nothing
  to fix here.**

### 4. Owner-proposed-action danger detector  ← (negativeMarginDiscount arm)
- Cases fixed: **DC-01** (dangerous_proceed 1→0, unsafe_proceed 1→0; safety +1,
  abstention +1; first-action DC-01 → CORRECT_WITHHOLD). Cases harmed: **0 (machine-
  proven: only DC-01 matches the signal).**
- Safety gain: +1 and removes the sole promotion-blocking dangerous proceed. Abstention
  gain/loss: +1 correct abstention; 0 new over-abstention.
- Unsafe-proceed risk: **reduces to 0**; introduces none (signal hits only DC-01).
- Complexity: LOW (reuse R3 `hasIrreversibleDanger.negativeMarginDiscount`, wire as a
  blocking abstain condition). Regression risk: **near-zero.** Adversarial suite expand:
  YES (add a probe that a deep discount with positive contribution does NOT abstain).
  **Build now? YES.**

### 5. Irreversible / high-capex danger detector (bare capex arm into the gate)
- Cases fixed: DC-01 only via the discount arm; the capex arm adds nothing DC-01 needs.
- Cases harmed: **D15-S01, D15-S02, HC-05 (3 expected-PROCEED capex cases would newly
  ABSTAIN)** — a direct regression. ADV-02 is already held by the out-of-model arm.
- Safety gain: 0 net; abstention loss: **−3 (3 new bad over-abstentions).**
- Unsafe-proceed risk: 0, but harms valid proceeds. Complexity: LOW. Regression risk:
  **HIGH (harms D15/HC-05).** **Build now? NO — explicitly harmful.**

### 6. Recommendation feasibility signal (constraint-alignment expansion)
- Cases fixed: 0 of the current 34 (no case fails on feasibility). Harmed: risk of new
  over-abstention if mis-tuned. **Build now? NO — no current failure to address.**

### 7. Scorer / key correction
- Cases fixed: 0 legitimately. The only scorer-label artifacts (ADV-03, DC-02/03/04/05
  diagnosis OVER_ABSTAIN) are CORRECT safe abstentions; "fixing" the label is cosmetic
  and the scorer/keys are frozen by mandate. Harmed: risk of masking real signal.
- **Build now? NO — no benchmark/scorer defect; keys are sound.**

### 8. Combined safety-gate v2 (owner-danger detector + causal-challenge narrowing)
- Cases fixed: DC-01 + up to 23 over-abstentions. Harmed: 0 if sequenced correctly.
- Safety gain: large; abstention gain: large. Unsafe-proceed risk: MED (bundles the
  high-risk CC narrowing with the low-risk detector in one slice — harder to validate
  and revert). Complexity: HIGH. Regression risk: MED-HIGH. Adversarial suite expand:
  YES. **Build now? NO — do the detector first as an isolated, independently-validated
  slice; narrowing is a separate follow-on.**

## SUMMARY RANKING (risk-adjusted)

1. **Option 4 (owner-danger detector)** — fixes the sole promotion blocker, zero
   regression, lowest complexity, and is a PREREQUISITE that backstops later CC
   narrowing. **Highest risk-adjusted ROI; build now.**
2. Option 2 (CC narrowing, adverse-off-archetype arm first) — biggest over-abstention
   prize but must come AFTER option 4; high regression surface.
3. Options 1/3/5/6/7/8 — rejected now (no-op, harmful, or premature/bundled).
