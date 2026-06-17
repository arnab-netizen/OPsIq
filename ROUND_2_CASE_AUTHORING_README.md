# ROUND 2 CASE AUTHORING — README

How to author a Round 2 case so it **passes the intake validator**
(`src/services/benchmark/round2-intake-validator.ts`). No case enters Round 2
until `validateRound2Case` returns `valid: true`.

## Where things live
- Manifest (the 150 planned cases): `ROUND_2_CASE_PACK_MANIFEST.json`
- Template scaffold (UNFINISHED, validator-rejected): `simulation_runs/round_002_case_pack_template/case_<ID>/`
  - `01_case_input.template.json` — replace with authored `01_case_input.json`
  - `manifest_entry.json` — the bucket/source/required dims/labels for this case
- Schema + manifest builder + template factory: `src/services/benchmark/round2-case-schema.ts`
- Validator: `src/services/benchmark/round2-intake-validator.ts`

## A case = `{ input, key }`
- **`input`** is engine-visible. It must contain NO answer-key fields (leakage = rejection).
- **`key`** is the hidden ground truth. Store it in a SEPARATE file
  (`key.json`), never inside `01_case_input.json`.

## Checklist to pass the validator
**Evidence (`input.evidence`)**
- ≥ 4 items; ≥ 2 with `isCritical: true`.
- Every `finding` ≥ 40 chars, specific, **no boilerplate** (no "TODO", "placeholder",
  "per case definition", "tbd", etc.).
- ≥ 2 items carry a **numeric** value in `supportingData`.
- Span ≥ 2 dimensions (unless the case is `abstention_eligible`).
- Include the **trigger metric** for the case's diagnosis (see `TRIGGER_METRICS`
  in the validator), e.g. `cashRunwayMonths` for `cash_liquidity_crisis`,
  `marginPct`/`profitChangePercent` for `margin_erosion`. Exempt only if
  `abstention_eligible: true` or diagnosis is `no_single_cause`/`truly_insufficient`.

**Owner constraints (`input.ownerConstraintProfile`)** — all of:
`budgetBand`, `timeHorizonDays`, `staffCapacity`, `cashRunwayMonths`,
`legalComplianceSensitive` (+ `ownerIntake.riskAppetite`).

**Hidden key (`key`)** — all of:
`true_primary_diagnosis`, `expected_first_action`, `acceptable_first_actions[]`,
`unsafe_first_actions[]`, `expected_safety_label`
(`SAFE_TO_PROCEED|SHOULD_ABSTAIN|DANGEROUS_IF_PROCEEDED`), `adversarial_type`,
`expected_gate_outcome` (`PROCEED|ABSTAIN`), `abstention_eligible` (boolean).

## Case-type guidance
- **single** — one clear primary diagnosis; trigger metric present.
- **multi** — primary + a real secondary cause in another dimension; set both
  `true_primary_diagnosis` and `true_secondary_diagnosis`.
- **abstention** — genuinely undiagnosable (missing trigger / ambiguous /
  out-of-model); set `abstention_eligible: true`, `expected_gate_outcome: ABSTAIN`.
- **adversarial** — tempting-but-wrong / dangerous; set `adversarial_type` and,
  if applicable, `expected_safety_label: DANGEROUS_IF_PROCEEDED`. Add it to the
  adversarial probe suite.

## Workflow
1. Copy `manifest_entry.json` requirements.
2. Author `01_case_input.json` (engine-visible) + `key.json` (hidden).
3. Run the validator on `{ input, key }`; fix every reported failure code.
4. Second reviewer confirms the key blind; leakage scan; only then admit the case.

## Hard rules
Do not weaken the validator to pass a case. Do not put key fields in the input.
Templates ship UNFINISHED on purpose and MUST fail validation until authored.
