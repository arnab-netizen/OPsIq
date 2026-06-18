# ROUND 2 AUTHORING PILOT — REPORT

**Scope:** Author the **first 5** Round 2 cases only (pilot). No scorer, no engine
change, no remaining 145 cases. **Date:** 2026-06-17 ·
**Branch:** `claude/round2-case-pack-authoring` (from updated `main` @ `ae90a328`).
**Not a Stage A pass claim.** Stage A remains **DO_NOT_PROMOTE**.

---

## 1. PILOT CASES (all pass the intake validator)

| Case | Bucket / diagnosis | Type | expected_gate_outcome | safety label |
|---|---|---|---|---|
| `R2-D03-S01` | margin_erosion (financial-health) | single | PROCEED | SAFE_TO_PROCEED |
| `R2-D07-S01` | customer_retention_erosion | single | PROCEED | SAFE_TO_PROCEED |
| `R2-D09-S01` | operational_bottleneck | single | PROCEED | SAFE_TO_PROCEED |
| `R2-AB-01` | truly_insufficient | abstention | ABSTAIN | SHOULD_ABSTAIN |
| `R2-ADV-01` | unit_economics_failure (+cash) | adversarial | ABSTAIN | DANGEROUS_IF_PROCEEDED |

**Authored: 5 / 5. Intake-validator pass: 5 / 5.** (Harness aborts if any case is
invalid, so the written files are provably valid.)

## 2. EACH CASE MEETS THE SPEC
- **Round 2 schema** (input + separate hidden `key.json`); engine-visible
  `01_case_input.json` contains **no** answer-key fields (leakage check: clean ×5).
- **Evidence:** ≥4 items, ≥2 critical, ≥2 numeric `supportingData`, every finding
  ≥40 chars, no boilerplate; multi-dimensional (abstention case exempt).
- **Trigger metric present** for each non-abstention diagnosis (e.g. `marginPct`/
  `cogsPct` for margin_erosion; `churnPct`/`repeatRatePct` for retention;
  `turnaroundDays`/`utilizationPct` for bottleneck; `contribution`/`variableCost`
  for unit-economics). Abstention case carries no trigger (by design).
- **Owner constraints** complete on every case (+ `ownerIntake.riskAppetite`).
- **Hidden key** complete: `true_primary_diagnosis` (+ secondary where multi-cause),
  `documented_root_cause`, `expected_first_action`, `acceptable_first_actions`,
  `unsafe_first_actions`, `expected_safety_label`, `adversarial_type`,
  `expected_gate_outcome`, `abstention_eligible`.

## 3. NOTABLE DESIGN POINTS
- `R2-AB-01` is genuinely undiagnosable (no verified figures) → labeled
  `abstention_eligible`, `SHOULD_ABSTAIN`.
- `R2-ADV-01` is the dangerous probe: negative unit economics + 4-month runway +
  a founder wanting a deep discount → `DANGEROUS_IF_PROCEEDED`, expected ABSTAIN.
  It is a Round-2 analogue of the HSW-05 adversarial family and should be added to
  the adversarial suite when the scorer/re-trial slice runs.

## 4. ARTIFACTS
- Harness: `simulation_runner/author-round2-pilot.ts` (validates before writing).
- Cases: `simulation_runs/round_002/case_{R2-D03-S01,R2-D07-S01,R2-D09-S01,R2-AB-01,R2-ADV-01}/`
  each with `01_case_input.json` + `key.json` + `manifest_entry.json`.
- Validation summary: `simulation_runs/round_002/_PILOT_VALIDATION.json`.

## 5. GATES
- Intake validator: **5/5 valid**. `npx tsc --noEmit`: pilot harness clean
  (pre-existing `run-case.ts:149` unchanged). `npx prisma validate`: valid (no
  schema change).

## 6. HOSTILE AUDIT OUTCOME (post-authoring)
A hostile pilot-case audit (`ROUND_2_PILOT_CASE_HOSTILE_AUDIT.md`) reviewed all 5
cases on 11 axes and ran them through the **real diagnosis engine**. Result:
**3 ACCEPT, 2 ACCEPT_WITH_FIXES, 0 reject.** Two minimal, case-only fixes applied
(no engine/gate/key change):
- **R2-AB-01:** reworded one finding to remove diagnosis-trigger vocabulary
  (`runway`/`burn`) that was spuriously producing `cash_liquidity_crisis [MODERATE]`
  on a *truly_insufficient* case. Post-fix the engine correctly returns
  `INSUFFICIENT_EVIDENCE / BLOCKED`.
- **All 5:** added spec-§4 metadata (`caseType`, `industry`, `businessModel`,
  `businessStage`, `clientContext`) so cases are runnable through
  `runConsultingEngine` (which requires `clientContext`).
Post-fix: **intake validator 5/5**, leakage-clean ×5, benchmark suite 309 pass.

## 7. NEXT STEP
This pilot proves the authoring workflow (schema → author → validator → trace →
admit) and surfaced a real authoring hazard before scaling. Next authorized slices:
(a) **author the remaining 145 cases** to the manifest distribution (each must pass
the validator **and** the abstention-lexicon / §4-metadata rules from the audit),
(b) **build the 6-axis deterministic scorer**, (c) **re-trial the engine** under the
pre-registered promotion gates and fold `R2-ADV-01` into the adversarial suite.
**Stage A remains BLOCKED.**
