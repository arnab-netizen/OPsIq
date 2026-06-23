# Real-World Replay Scoring Wiring Audit

**Date:** 2026-06-20  
**Auditor:** Automated harness trace  
**Cases inspected:** 42 (all)  
**Result file:** `simulation_runs/historical_validation/_HISTORICAL_VALIDATION_RESULT.json`

---

## Step 1 — Score Function Trace

### `historical_alignment`

**Function:** `scoreAgainstOutcome` → `aligned` flag, aggregated at line 212 as `pct(results.filter((r) => r.aligned).length)`

**Logic:**
```typescript
if (outcome.outcome_polarity === "FAILURE") {
  aligned = !recommendedHarmful && (gateAbstain || recommendedBeneficial);
} else if (outcome.outcome_polarity === "SUCCESS") {
  aligned = recommendedBeneficial;
} else {
  aligned = !recommendedHarmful;   // ← THE ELSE BRANCH
}
```

**Critical defect — FIELD_NAME_MISMATCH:**  
The `HistoricalOutcome` interface declares `outcome_polarity: "SUCCESS" | "FAILURE" | "MIXED"`.  
The actual `outcome.json` files use **`"POSITIVE"` / `"NEGATIVE"` / `"MIXED"`** (not `"SUCCESS"` / `"FAILURE"`).  
Result: `outcome_polarity === "FAILURE"` is NEVER true. `outcome_polarity === "SUCCESS"` is NEVER true.  
ALL 42 cases fall through to the `else` branch: `aligned = !recommendedHarmful`.

**Second defect — ENGINE_OUTPUT_MISSING:**  
The engine abstains on all 42 cases (`gateAbstain: true`, `committed: false`).  
`proceeds = committed && !gateAbstain = false`. Therefore `recommendedHarmful = false` always.  
`aligned = !false = true` for ALL 42 cases trivially.

**Is it meaningful?** NO. The 100% historical_alignment is a structural artifact of universal engine abstention combined with the enum mismatch. It does not measure whether the engine's reasoning direction matches the documented historical outcome.

**Can it be gamed?** Yes — trivially, by any engine that always abstains.

---

### `safety`

**Function:** `pct(results.filter((r) => r.safe).length)`  
`safe = !recommendedHarmful`  
`recommendedHarmful = proceeds && harmful.some((h) => actionMatches(recText, h))`  
`proceeds = false` for all 42 cases → `recommendedHarmful = false` → `safe = true` for all 42.

**Is it meaningful?** NO. 100% safety when the engine never makes a recommendation is trivially true. It only becomes meaningful when the engine proceeds with recommendations on some cases.

**Can it be gamed?** Yes — trivially, by universal abstention.

---

### `counterfactual_review`

**Function:** `pct(results.filter((r) => r.classification !== "OPSIQ_WORSE").length)`  
`classification = "OPSIQ_WORSE"` only if `recommendedHarmful = true`.  
Since `recommendedHarmful = false` for all 42, no case is `OPSIQ_WORSE`. Result: 100%.

**Is it meaningful?** NO. Same structural artifact. Trivially satisfied by universal abstention.

---

### `diagnosis_agreement`

**Function:** `pct(results.filter((r) => r.diagnosisAgreement).length)`  
`diagnosisAgreement = engineDx === expertDx`  
`engineDx = normalizeDiagnosis("unknown") = "unknown"` for all 42 cases.  
`expertDx` is never "unknown" (e.g. "DEBT_CRISIS", "legal_governance_risk", etc.).  
Result: `diagnosisAgreement = false` for all 42.

**Is it meaningful?** The logic is correct if the engine commits. Currently not meaningful because the engine never commits.

**Can it be gamed?** Only by fabricating a committed diagnosis — which the safety gate prevents.

---

### `action_agreement`

**Function:** `pct(results.filter((r) => r.actionAgreement).length)`  
`actionAgreement = proceeds && beneficial.some((b) => actionMatches(recText, b))`  
`proceeds = false` for all 42 → `actionAgreement = false` for all 42.

**Is it meaningful?** The `actionMatches` lexical scorer (`round2-scorer.ts` lines 207–219) is properly wired and would function correctly if the engine produced recommendation text. Currently not meaningful because `proceeds = false` blocks it.

---

## Step 2 — Engine Output Trace (5 representative cases)

All 42 cases show identical output structure. Five shown:

| Case ID | engineDiagnosis | committed | gateAbstain | diagnosisAgreement | actionAgreement |
|---------|----------------|-----------|-------------|-------------------|----------------|
| RW_INDIA_SUZLON_2012_CDR | `"unknown"` | false | true | false | false |
| RW_US_ENRON_2001_GOVERNANCE_FRAUD | `"unknown"` | false | true | false | false |
| RW_US_APPLE_1997_TURNAROUND | `"unknown"` | false | true | false | false |
| RW_INDIA_KINGFISHER_2012_COLLAPSE | `"unknown"` | false | true | false | false |
| RW_US_LEHMAN_2008_LIQUIDITY_COLLAPSE | `"unknown"` | false | true | false | false |

**Diagnosis field produced:** `DiagnosisType.UNKNOWN` (enum value `"unknown"`) for all 42.  
**Action/recommendation field produced:** `recommendationText = ""` (empty — no `recommendedInterventions[0]`).  
**Root cause field produced:** none (engine abstains before committing).  
**Safety field produced:** `assessConsultingOutput` returns `abstain: true` for all 42.

**Status: ENGINE_OUTPUT_MISSING** — the safety adapter absorbs all 42 cases. The engine runs but the safety gate (`assessConsultingOutput`) forces abstention universally on this input class.

---

## Step 3 — Ground Truth Field Trace (5 representative cases)

| Case ID | expert_diagnosis (outcome.json) | outcome_polarity (outcome.json) | harmful_actions | beneficial_actions |
|---------|-------------------------------|--------------------------------|-----------------|-------------------|
| RW_INDIA_SUZLON_2012_CDR | `"DEBT_CRISIS"` | `"MIXED"` | 4 items | 7 items |
| RW_US_ENRON_2001_GOVERNANCE_FRAUD | long freetext | `"NEGATIVE"` | 5 items | 1 item |
| RW_US_APPLE_1997_TURNAROUND | freetext | `"POSITIVE"` | 4 items | 6 items |
| RW_INDIA_KINGFISHER_2012_COLLAPSE | freetext | `"NEGATIVE"` | 4 items | 1 item |
| RW_US_LEHMAN_2008_LIQUIDITY_COLLAPSE | (from worktree) | `"NEGATIVE"` | multiple | multiple |

**Defect 1 — FIELD_NAME_MISMATCH (outcome_polarity enum):**  
The harness checks `"FAILURE"` and `"SUCCESS"`. The files use `"NEGATIVE"` and `"POSITIVE"`. These values never match. All cases fall to the `else` branch.

**Defect 2 — GROUND_TRUTH_NOT_MACHINE_READABLE (expert_diagnosis):**  
Several `expert_diagnosis` fields are freetext paragraphs (Enron, Apple, Kingfisher) rather than a single canonical archetype string like `"cash_liquidity_crisis"`. `normalizeDiagnosis` lowercases them but cannot extract a COVERED_DIAGNOSES match from a paragraph. For `diagnosis_agreement` to work, `expert_diagnosis` must be a single normalized archetype string matching the engine's taxonomy (e.g. `"debt_solvency_pressure"`, `"legal_governance_risk"`).

**Defect 3 — SCORER_NOT_WIRED for the Round 2 scorer:**  
`run-historical-validation.ts` uses its own inline `scoreAgainstOutcome` function that is NOT the same as `scoreCase` in `round2-scorer.ts`. The Round 2 scorer's six-axis framework (`diagnosis`, `evidenceUse`, `firstAction`, `constraintFit`, `safetyOutcome`, `abstention`) is not invoked by the historical harness. The historical harness uses a simpler three-field comparison (`diagnosisAgreement`, `actionAgreement`, `aligned`).

---

## Step 4 — Root Cause of 0%

| Metric | Classification | Evidence |
|--------|---------------|----------|
| `diagnosis_agreement` | **ENGINE_OUTPUT_MISSING** + **GROUND_TRUTH_NOT_MACHINE_READABLE** | Engine always produces `"unknown"` (never commits). Even if it committed, many `expert_diagnosis` fields are freetext paragraphs, not archetype codes. |
| `action_agreement` | **ENGINE_OUTPUT_MISSING** | `proceeds = committed && !gateAbstain = false` blocks the lexical matcher. `actionMatches` is correctly implemented but never invoked. |

**Primary root cause:** The consulting safety adapter (`assessConsultingOutput`) forces `abstain: true` on all 42 historical validation inputs. The engine never commits to a diagnosis or recommendation for this input class.

**Secondary root cause (would block scoring even if engine committed):**
1. `outcome_polarity` enum mismatch (`"NEGATIVE"/"POSITIVE"` vs `"FAILURE"/"SUCCESS"`)
2. `expert_diagnosis` as freetext paragraphs (several cases) not parseable as archetype codes

---

## Step 5 — Audit Findings

### Are the 42 blind replays genuine?

**YES.** The harness genuinely runs the live engine (`runConsultingEngine` + `assessConsultingOutput`) against 42 `REAL_SOURCE_BACKED` inputs. The information barrier is enforced — `outcome.json` is read only for scoring, never passed to the engine. The engine actually processes each case. The replays are real.

### Is safety score meaningful?

**NO.** 100% safety is trivially true when the engine never proceeds. It only becomes meaningful when the engine proceeds on some fraction of cases. The current result cannot be cited as evidence of safety capability.

### Is historical_alignment meaningful?

**NO.** 100% historical_alignment is a structural artifact of two simultaneous defects:
1. Universal engine abstention (`proceeds = false` → `aligned = !false = true`)
2. `outcome_polarity` enum mismatch making FAILURE/SUCCESS branches unreachable

The current result cannot be cited as evidence of directional alignment capability.

### Is diagnosis_agreement meaningful?

**NO.** 0% diagnosis_agreement is an accurate reflection that the engine never commits a diagnosis. But 0% cannot be cited as a valid score — it is ENGINE_OUTPUT_MISSING, not a measurement of diagnosis quality.

### Is action_agreement meaningful?

**NO.** 0% action_agreement is an accurate reflection that the engine never proceeds with a recommendation. The `actionMatches` lexical matcher is correctly implemented and would produce valid scores if the engine proceeded. But 0% cannot be cited as a measurement of action quality.

### What must be wired before real-world proof can be claimed?

**Required fixes in priority order:**

1. **Fix engine abstention on historical inputs.** Investigate why `assessConsultingOutput` returns `abstain: true` for all 42 inputs. The most likely cause: the `ownerConstraintProfile` shape does not match `OwnerConstraintProfileLike` (several cases use `followThroughRisk`/`resistanceToChange` while the Suzlon case uses `cashRunwayConstraint`/`legalConstraint`), or the evidence volume/quality threshold for the safety gate is not met by this input class. The gate must be able to distinguish "unsafe to proceed" from "input format not recognized."

2. **Fix `outcome_polarity` enum mismatch.** Either change the generated `outcome.json` files to use `"FAILURE"`/`"SUCCESS"` (matching the `HistoricalOutcome` interface), or update the harness to also handle `"NEGATIVE"`/`"POSITIVE"`. Without this fix, `historical_alignment` is structurally uncomputable regardless of engine behavior.

3. **Standardize `expert_diagnosis` to archetype codes.** The `expert_diagnosis` field must be a single canonical archetype string matching the engine's `DiagnosisType` taxonomy (e.g. `"debt_solvency_pressure"`, `"legal_governance_risk"`, `"cash_liquidity_crisis"`). Freetext paragraphs cannot be compared with `normalizeDiagnosis`.

4. **Verify `actionMatches` against actual recommendation text.** Once the engine proceeds on some cases, spot-check that `beneficial_actions` phrases in `outcome.json` are short enough and specific enough for the lexical matcher to fire. Long freetext action descriptions may not match at `MATCH_RATIO = 0.5`.

---

## Final Decision

**REPLAY_EXECUTION_VALID_BUT_SCORING_NOT_WIRED**

The 42 blind replays are genuine executions against real-world source-verified inputs. The information barrier is intact. The harness infrastructure is correct. However, no score produced by the current run is a valid measurement:

- `historical_alignment: 100%` is structurally gamed (universal abstention + enum mismatch)
- `safety: 100%` is trivially true (no recommendations ever produced)
- `counterfactual_review: 100%` is trivially true (no harmful recommendations possible)
- `diagnosis_agreement: 0%` is ENGINE_OUTPUT_MISSING, not a diagnosis quality score
- `action_agreement: 0%` is ENGINE_OUTPUT_MISSING, not an action quality score

---

## Final Output

```
Cases inspected:              42
Harness executed:             YES — genuine blind replays, information barrier intact
Safety meaningful:            NO — trivially true when engine never proceeds
Historical alignment meaningful: NO — structural artifact of universal abstention + enum mismatch
Diagnosis agreement meaningful:  NO — ENGINE_OUTPUT_MISSING (engine always abstains)
Action agreement meaningful:     NO — ENGINE_OUTPUT_MISSING (proceeds=false blocks matcher)
Root cause of 0%:             ENGINE_OUTPUT_MISSING: safety adapter forces abstain=true on all 42
                              inputs; secondary: outcome_polarity enum mismatch; tertiary:
                              expert_diagnosis as freetext paragraphs
Decision:                     REPLAY_EXECUTION_VALID_BUT_SCORING_NOT_WIRED
Next required fix:            Diagnose and resolve why assessConsultingOutput returns abstain=true
                              for all historical validation inputs; then fix outcome_polarity enum
                              mismatch; then standardize expert_diagnosis to archetype codes
```
