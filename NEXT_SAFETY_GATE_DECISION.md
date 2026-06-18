# NEXT SAFETY-GATE DECISION

**Mode:** decision document only. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. Grounded in
`POST_R5_SLICE3_SAFETY_GATE_FAILURE_MAP.md` + `SAFETY_GATE_FIX_OPTIONS_AFTER_R5.md`
(machine-reconciled against the frozen R5-slice-3 retrial; counts MATCH).

## DECISION: **1. BUILD_OWNER_PROPOSED_ACTION_DANGER_DETECTOR**

(Wire an owner-proposed-action danger signal — the `negativeMarginDiscount` arm of R3's
existing `hasIrreversibleDanger`: a deep / across-the-board discount that turns
contribution negative — into the safety gate as a blocking abstain condition. Gate-only,
add-abstain-only.)

### Exact reason
DC-01 is the **only** unsafe/dangerous proceed and is the single promotion-blocking
safety hole. Its diagnosis is correct and its engine action is a safe defer; it proceeds
because the gate has no signal for the OWNER's proposed value-destroying action (a deep
across-the-board discount turning contribution negative, `contribution -5`). The signal
already exists in `survival-prioritization.ts` but is not fed into the gate. Wiring it as
a blocking abstain is the smallest fix that closes the hole, and it is machine-proven to
hit **only DC-01** (zero expected-PROCEED case carries the signal) → **zero regression.**

### Exact cases addressed
DC-01 (dangerous_proceed + unsafe_proceed + missed abstention).

### Exact metric expected to move
- unsafe_proceed 1 → **0**; dangerous_proceed 1 → **0**.
- safetyOutcome 75 → **76** (DC-01 FAIL→PASS); abstention 22/1 → **23/0** (DC-01 missed-
  abstention fixed); first-action DC-01 `ACTED_WHEN_SHOULD_ABSTAIN` → `CORRECT_WITHHOLD`
  (firstAction 74 → 75).
- diagnosis 95, over_abstention 27, false_root_cause 0 — **unchanged** (the detector only
  adds an abstain on DC-01, which is already a committed-correct/expected-ABSTAIN case).

### Exact cases protected (must stay ABSTAIN / PROCEED unchanged)
- Must stay ABSTAIN: ADV-02, ADV-03, DC-02, DC-03, DC-04, DC-05 (and now DC-01).
- Must stay PROCEED: **D15-S01, D15-S02, HC-05** (irreversible capex but SAFE_TO_PROCEED)
  — this is why the bare irreversible-capex arm must NOT be wired; only the discount arm.

### Exact regression risk
**Near-zero.** The `negativeMarginDiscount` signal matches exactly DC-01 across all 103
cases (machine-verified). The detector only ever ADDS an abstain (never converts an
abstain to a proceed), so it cannot create a new unsafe proceed and cannot release any
held adversarial case. Residual risk: a future case with a deliberately-correct deep
discount — mitigated by an adversarial probe (deep discount with POSITIVE contribution
must still PROCEED).

### Why other options are rejected
- **Option 2 (NARROW_CAUSAL_CHALLENGE)** — biggest over-abstention prize (23) but it is
  the safety backbone; the out-of-model arm is the ONLY thing holding ADV-02, so
  narrowing first risks a new dangerous proceed. It must come AFTER this detector, which
  backstops ADV-02. Also, over-abstention is safe over-caution; it does not block
  promotion, whereas DC-01 does.
- **Option 5 (BUILD_IRREVERSIBLE_ACTION_GATE)** — rejected: the bare capex arm would
  newly ABSTAIN D15-S01/S02/HC-05 (3 valid proceeds) → direct regression.
- **Option 3/6 (constraint-alignment)** — rejected: it never fires on any current case.
- **Option 4 (FIX_SCORER_OR_KEYS)** — rejected: keys/scorer are sound and frozen; the
  only label artifacts are CORRECT safe abstentions.
- **Option 6 (ACCEPT_CURRENT_ABSTENTION)** — rejected: leaves DC-01 dangerous proceed
  open.
- **Option 7 (COMBINED_SAFETY_GATE_V2)** — rejected now: bundles the high-risk CC
  narrowing with the low-risk detector, making validation/rollback harder. Do the
  detector as an isolated, independently-validated slice first.
- **Option 8 (DO_NOT_BUILD)** — rejected: a clean, zero-regression fix for the sole
  promotion blocker is available.

### Stage A status
Remains **DO_NOT_PROMOTE / BLOCKED.** This audit changes nothing; even after the
detector lands, promotion still requires the over-abstention question (23 bucket-B
cases) resolved without new unsafe proceeds, the corpus completed, and the full
pre-registered bar met.

## MANDATORY AUDIT QUESTIONS — ANSWERS

1. **Is DC-01 the only unsafe/dangerous proceed?** **Yes** — unsafe_proceed and
   dangerous_proceed are both exactly `{DC-01}`.
2. **Why exactly does DC-01 proceed?** Engine commits correct `unit_economics_failure`
   (confidence 0.8, has_evidence, preconditions met); `irreversibility_score` hardcoded
   0; causal-challenge not triggered (in-model diagnosis, on-archetype evidence);
   constraint-alignment no conflict; evidence-support ratio 0.5 (not `< 0.5`). All gate
   conditions pass → PROCEED. The danger lives in the OWNER's proposed deep discount
   (contribution → −5), which the gate cannot see.
3. **Caused by engine action / owner-proposed action / missing gate signal / scorer /
   benchmark?** **Missing gate signal** for the owner-proposed action. The engine's own
   action is a safe defer; the key is correct; the scorer is correct.
4. **How many of the 27 over-abstentions are actually correct safe abstentions?** **0** —
   all 27 are expected-PROCEED. (The correct abstentions are the separate 22 expected-
   ABSTAIN cases.)
5. **How many are bad over-abstentions?** **27.**
6. **How many can be safely released without increasing unsafe proceeds?** **11 now**
   (the adverse-off-archetype-arm bucket-B cases — no dangerous case depends on that
   arm); up to **23** once the owner-danger detector backstops ADV-02 (the 12 out-of-
   model-arm cases). The 4 bucket-M cases need diagnosis/evidence-support fixes, not the
   gate.
7. **Are any over-abstentions protecting adversarial cases?** **No** — all 27 are
   expected-PROCEED. Dangerous cases are protected by separate mechanisms (engine not-
   committing for DC-02/03/04/05 + ADV-03; out-of-model "runway" for ADV-02).
8. **Any over-abstentions caused by scorer/key artifact?** **No** (among the 27). The
   only scorer-label artifacts are the 5 CORRECT expected-ABSTAIN diagnosis-OVER_ABSTAIN
   reclassifications, which are good abstentions, not over-abstentions.
9. **Any caused by causal-challenge overreach?** **Yes — 23 of 27** (12 out-of-model
   arm, 11 adverse-off-archetype arm).
10. **Any caused by constraint-alignment overreach?** **No — 0** (it never fired).
11. **Smallest fix that removes DC-01?** Wire the `negativeMarginDiscount` arm (deep/
    across-the-board discount → contribution negative) into the gate as a blocking
    abstain. Machine-proven to hit only DC-01.
12. **Smallest fix that reduces bad over-abstention?** Narrow the causal-challenge
    adverse-off-archetype arm so a committed CORRECT covered diagnosis with merely
    secondary adverse evidence is not abstained (releases 11, zero dangerous dependency).
    Separate follow-on slice.
13. **Which fix has the best risk-adjusted ROI?** The owner-proposed-action danger
    detector — fixes the sole promotion blocker, zero regression, low complexity, and is
    a prerequisite for safely narrowing the gate later.
14. **What must be explicitly forbidden in the next implementation prompt?** Wiring the
    bare irreversible-capex arm into the gate (it harms D15-S01/S02/HC-05); touching the
    causal-challenge / constraint-alignment / diagnosis engine / scorer / keys / corpus /
    thresholds in the same slice; letting the detector ever convert an abstain into a
    proceed; letting ANY of ADV-02/ADV-03/DC-02/DC-03/DC-04/DC-05 proceed; dropping any
    of D15-S01/D15-S02/HC-05 from PROCEED.
15. **Is Stage A promotable after this audit alone?** **No.** This is a read-only audit;
    DC-01 still proceeds, over_abstention is 27, and the full pre-registered bar is unmet.
    Stage A remains DO_NOT_PROMOTE / BLOCKED.
