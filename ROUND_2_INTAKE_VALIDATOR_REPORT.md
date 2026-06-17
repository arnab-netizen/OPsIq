# ROUND 2 INTAKE VALIDATOR — REPORT

**Scope:** Implement the Round 2 intake validator **only** (no case authoring, no
scorer, no engine/gate/answer-key change). **Date:** 2026-06-17 ·
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. **Not a Stage A pass claim.**
Implements `ROUND_2_BENCHMARK_ENRICHMENT_SPEC.md` §1–§3, §13.

---

## 1. WHAT WAS BUILT

| File | Role |
|---|---|
| `src/services/benchmark/round2-intake-validator.ts` | Reusable, pure validator: `validateRound2Case({ input, key })` → `{ valid, failures[], content_valid }`. |
| `simulation_runner/validate-intake.ts` | CLI: validates every Round 1 case, writes `ROUND_1_INTAKE_VALIDATION_RESULTS.json`. |
| `src/__tests__/benchmark/round2-intake-validator.test.ts` | 9 tests. |

### Rejection rules (all enforced, non-short-circuit)
`PLACEHOLDER_FINDING` (boilerplate denylist) · `FINDING_TOO_SHORT` (<40 chars) ·
`TOO_FEW_EVIDENCE` (<4) · `TOO_FEW_CRITICAL` (<2) · `TOO_FEW_NUMERIC_SUPPORT` (<2) ·
`MISSING_OWNER_CONSTRAINTS` · `MISSING_GROUND_TRUTH_DIAGNOSIS` ·
`MISSING_FIRST_ACTION_KEY` · `MISSING_SAFETY_LABELS` · `MISSING_ABSTENTION_LABEL` ·
`TRIGGER_METRIC_ABSENT` (per-diagnosis required `supportingData` metric, exempt if
abstention-eligible / no-single-cause) · `UNBALANCED_EVIDENCE_DIMENSIONS`
(all evidence in one dimension on a non-abstention case) · `ANSWER_KEY_LEAKAGE`
(answer-key marker in engine-visible input).

The validator carries a `TRIGGER_METRICS` map for all 15 taxonomy diagnoses
(D1–D15) so a committable case must contain the diagnosis's triggering metric.

---

## 2. ROUND 1 VALIDATION RESULTS (`ROUND_1_INTAKE_VALIDATION_RESULTS.json`)

| Metric | Value |
|---|---|
| Total cases | 50 |
| **Round-2 valid** | **0** |
| **Round-2 invalid** | **50** |
| Content-valid only (evidence checks pass, key still missing) | 2 |

### Failure-code counts
| Code | Count |
|---|---|
| MISSING_GROUND_TRUTH_DIAGNOSIS | 50 |
| MISSING_FIRST_ACTION_KEY | 50 |
| MISSING_SAFETY_LABELS | 50 |
| MISSING_ABSTENTION_LABEL | 50 |
| TOO_FEW_NUMERIC_SUPPORT | 47 |
| TOO_FEW_EVIDENCE | 45 |
| TOO_FEW_CRITICAL | 43 |
| **PLACEHOLDER_FINDING** | **41** |
| FINDING_TOO_SHORT | 1 |

### Reading
- **All 50 Round 1 cases are Round-2-invalid** — as expected, since Round 1 ships
  no hidden key (all 50 fail the four MISSING_*_KEY/LABEL checks).
- **41 placeholder + 45 too-few-evidence + 47 too-few-numeric** quantitatively
  confirm the capability-analysis finding: Round 1 evidence is overwhelmingly
  generic and under-specified. **Only 2 cases pass even the evidence-content
  checks** (and they still lack keys).
- This is the objective justification for building Round 2: the current benchmark
  cannot exercise owner-mode diagnosis.

---

## 3. TESTS (9, all pass)
placeholder rejected · valid enriched accepted · missing numeric support rejected ·
missing owner constraints rejected · missing answer key rejected · abstention-
eligible exception works (relaxes trigger-metric + dimension-balance) · trigger-
metric-absent rejected · answer-key leakage rejected · too-short/too-few rejected.

## 4. GATES
- `vitest` validator suite: **9 passed**. (Full governance/engine suites unaffected
  — no engine/gate code touched.)
- `npx tsc --noEmit`: new validator/CLI/test files **clean** (pre-existing unrelated
  `run-case.ts:149` persists). `npx prisma validate`: valid.

## 5. SCOPE GUARDS HONORED
No Round 2 cases authored; no scorer; no engine/safety-gate/answer-key change. The
validator is additive tooling. Old artifacts untouched.

---

## 6. NEXT STEP
With the intake gate in place, the next implementation slices (each explicitly
authorized) are: **(a) author the 150-case Round 2 pack** (every case must pass
this validator before entry), then **(b) build the 6-axis deterministic scorer**,
then **(c) re-trial the engine** under the pre-registered promotion gates. **Stage
A remains BLOCKED.**
