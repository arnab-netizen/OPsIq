# Slice 1 Verification Artifacts

**Date:** 2026-06-16
**Purpose:** Verification-only re-run of 12 targeted cases through the Slice 1
diagnosis-archetype-expansion engine (commit 3210415b). These are NOT Round 1
baseline artifacts and must not be treated as such.

## Contents

Per case (`case_<ID>/`):
- `01_case_input.json` — copy of the unchanged Round 1 input (for scorer use)
- `05_diagnosis_output.json` — Slice 1 engine diagnosis step
- `09_frozen_opsiq_output.json` — Slice 1 frozen engine output

Cases: RW-001, RW-003, RW-005, RW-006, RW-009, RW-010, RW-011, RW-012, RW-013,
RW-014, ADV-004, ADV-009.

## Verdict: SLICE_1_NO_EFFECT

- Diagnosis changed in only 1 of 12 cases: RW-006
  (`unknown/INSUFFICIENT_EVIDENCE` -> `unit_economics_breakdown/MODERATE`),
  which is directionally correct (matches Wet Seal documented root cause
  "Unit Economics Deterioration").
- 11 of 12 cases unchanged — new archetype trigger conditions did not match
  the real case evidence.
- No measurable benchmark score improvement under the exact Round 1 scoring
  methodology (net delta -0.233 on scorer-valid cases, driven entirely by a
  scorer artifact on RW-006).
- Safety preserved: 0 dangerous outputs, 0 hallucinations, ADV-004 safe-refusal
  intact, ADV-009 no false positive.

## Round 1 scoring-methodology defects discovered during verification

1. 8 of 12 stored baseline scores (RW-005, RW-009..RW-014, ADV-009) are
   default `5.0` placeholders from the v3 batch scorer, never scored against
   answer keys.
2. The deterministic scorer is degenerate on RW-009..RW-014: their scoring
   guides use inline (non-bullet) format, so the parser returns empty criteria
   lists and the comparison `0 >= 0` yields an artificial 10.0.
3. Loose token matching rewards verbose "unknown/insufficient evidence"
   boilerplate over a focused correct diagnosis (proven by RW-006 scoring
   LOWER after a correct diagnosis change).

Both the engine trigger conditions and the scoring harness must be addressed
before Slice 1's value can be measured. The scoring harness is currently unfit
to validate any slice.

Round 1 baseline (`simulation_runs/round_001/`) was preserved unchanged
throughout this verification.
