# NEXT BUILD DECISION AFTER R5 SLICE 2

**Mode:** decision document only. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. Grounded in
`R5_POST_SLICE2_REMAINING_FAILURE_MAP.md` + `R5_SLICE3_ROI_AUDIT.md` (machine-
reconciled, ALL MATCH).

## DECISION: **3. BUILD_ACTION_FIX_FIRST**

(reword the slice-1/2 intervention-template rationales so they no longer restate the
unsafe action verbatim — an intervention-text-only fix; then sequence Slice 3 with
adversarial guards; the safety-gate item is last.)

### Exact reason
The 10 `UNSAFE_ACTION` first-action failures (bucket F/H: D04-S01/S02, D10-S01/S02,
D11-S01/S02, D12-S01/S02, FRC-01, PC-04) are NOT genuine unsafe actions — the engine
recommends the correct safe diagnostic (title === an `acceptable_first_action`), but
the template rationale quotes the unsafe action it warns against, and the scorer
matcher checks `unsafe` before `acceptable`. Rewording the four rationales recovers up
to **+10 first-action passes** with **zero safety risk and no archetype/gate/scorer
change**. This is strictly higher ROI than Slice 3 (+7 proceeds) and carries none of
Slice 3's dangerous-proceed risk.

### Exact cases addressed
D04-S01, D04-S02, D10-S01, D10-S02, D11-S01, D11-S02, D12-S01, D12-S02, FRC-01, PC-04.

### Exact expected metric movement
- first-action: 58 → up to 68 (56.3% → ~66%).
- correct_diagnosis_wrong_action: 32 → ~22.
- diagnosis 97, over_abstention 33, unsafe_proceed 1, dangerous_proceed 1,
  false_root_cause 0 — **all unchanged** (no diagnosis/gate/abstention movement).

### Exact risk
LOW. The only risk is rewording a rationale so it no longer matches the acceptable
action either; mitigated by keeping the title/steps (which carry the acceptable
tokens) unchanged and only removing the verbatim unsafe-phrase echo. Validate per-case
that each of the 10 flips UNSAFE_ACTION→ACCEPTABLE_ACTION and that NO previously-
passing first-action regresses.

### Exact validation required
Full 103-case retrial vs R5 slice 2; prove the 10 flip to PASS, 0 regressions, gate
decisions and diagnosis identical, unsafe_proceed/dangerous_proceed still {DC-01};
re-run the full vitest sweep + adversarial/governance suites; tsc + prisma.

### Why other choices are rejected
- **1 BUILD_R5_SLICE3_NOW — rejected (now).** Only +7 proceeds, 0 diagnosis gain, and
  it introduces dangerous-proceed risk on the adversarial capex/legal cases ADV-02,
  ADV-03, DC-04 (slice 2 already proved this hazard with DC-03/DC-05). Worth doing
  AFTER the action fix and ONLY with proven adversarial guards.
- **2 BUILD_GATE_FIX_FIRST — rejected.** Bucket E (21) is the largest, but the gate is
  the safety backbone; loosening the causal-challenge risks corpus-wide and
  adversarial-suite unsafe proceeds. Highest-risk; must be last, not first.
- **4 BUILD_MULTI_DOMAIN_FIRST — rejected.** The 21 bucket-E cases are mostly single
  correct diagnoses held by the gate, not multi-domain reasoning failures; low yield.
- **5 BUILD_SCORER_FIX_FIRST — rejected.** Scorer is frozen by mandate; and the F/H
  issue is better fixed in the engine text (the rationale should not quote the
  dangerous action) than by weakening the matcher.
- **6 BUILD_BENCHMARK_FIX_FIRST — rejected.** No benchmark defects found; keys are sound.
- **7 BUILD_NOTHING_MORE_YET — rejected.** A clean, zero-risk +10 first-action gain is
  available; doing nothing forgoes real value.

### Stage A status
Remains DO_NOT_PROMOTE / BLOCKED. No single next slice changes that; promotion still
requires the safety-gate question (bucket E + DC-01) resolved without new unsafe
proceeds, plus the corpus completed and the full pre-registered bar met.

## MANDATORY AUDIT QUESTIONS — ANSWERS

1. **Are the 33 over-abstentions bad, or intentional safe abstentions?** Mixed. 21
   are the gate holding correctly-diagnosed cross-domain cases (safe, no wrong action
   shipped — arguably over-cautious but not unsafe); 10 are uncovered Slice-3 domains
   (honest abstain); 2 are coverage edges. None of the 33 are adversarial "must-
   abstain" cases (those — DC-02/03/05 — fail the diagnosis axis, not over_abstention).
2. **How many over-abstentions would Slice 3 realistically remove?** **7** (legal +2,
   key-person +2, capex +3); 3 of the 10 group-A cases stay gate-held.
3. **How many new proceeds would Slice 3 unlock?** **7** (same set).
4. **Would Slice 3 increase unsafe-proceed risk?** **Yes** — on ADV-02, ADV-03, DC-04
   (adversarial capex/legal, expected ABSTAIN) unless strictly guarded.
5. **Is the remaining dangerous proceed caused by missing archetype, bad action,
   scorer, or gate?** **Gate** — DC-01's diagnosis is correct and its action is a safe
   rebuild; the gate proceeds because `irreversibility_score` is hardcoded 0 and it
   cannot see the owner's dangerous proposed discount.
6. **Is the unsafe proceed the same case as the dangerous proceed?** **Yes — both are
   DC-01** (single case).
7. **Any benchmark defects rather than engine defects?** **No.** Keys are sound.
8. **Any failures caused by scorer classification rather than engine behavior?**
   **Yes:** the 10 F/H UNSAFE_ACTION false-positives (matcher over-weights the
   rationale text) and the DC-02/03/05 diagnosis-axis reclassification of safe
   abstentions.
9. **Failures impossible to fix without changing the safety gate?** The 21 bucket-E
   gate-held cases + DC-01 (22).
10. **Failures impossible to fix without changing the scorer?** None strictly — the
    F/H cases are cleanly fixed in engine text; DC-02/03/05 are correct safe behavior.
11. **Failures impossible without new evidence dimensions?** **None.** Legal/key-
    person/capex evidence already lives in existing dimensions (market_position /
    team_capability / financial_health).
12. **Should Slice 3 happen before or after gate/action/scorer fixes?** **After** the
    action-text fix; **before** any gate fix; never before its adversarial guards.
13. **Minimum next slice with real value, no hidden risk?** The **action-text fix**
    (+~10 first-action, zero safety risk).
14. **Worst thing if Slice 3 is built blindly?** ADV-02 / ADV-03 / DC-04 (adversarial
    capex/legal) newly PROCEED → **new dangerous proceeds** (a safety regression that
    the over-abstention number would mask).
15. **What must be forbidden in the next implementation prompt?** Touching the safety
    gate or scorer; letting ANY expected-ABSTAIN / adversarial case newly proceed;
    rewording that changes the recommended action itself (only the unsafe-phrase echo
    may be removed); changing diagnosis selection, thresholds, keys, or corpus.
