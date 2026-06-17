# SAFETY WIRING VALIDATION REPORT

**Scope:** Remediation **step 1 only** of `STAGE_A_SAFETY_VALIDATION_BLOCKER.md`
(component **B1** — abstention engine not wired into runner/orchestrator).
**Date:** 2026-06-17
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Not a promotion:** This report validates that the safety gate now **executes**
on the benchmark. It does **not** claim Stage A passes, and changes **no**
scoring threshold, answer key, or expected outcome.

---

## WHAT WAS CHANGED (WIRING ONLY)

1. **New adapter (real code path):**
   `src/services/governance/consulting-safety-adapter.ts`
   - `deriveSafetyGateInputs(output)` — deterministically maps a frozen
     `ConsultingEngineOutput` to the eight `assessSafety` scalar inputs.
   - `assessConsultingOutput(output, recommendationId, actor)` — runs
     `assessSafety` and, on abstain, materializes an immutable
     `AbstentionDecision` via `createAbstentionDecision`.
   - `hasCommittedDiagnosis(output)` — helper.

2. **Runner wired:** `simulation_runner/run-case.ts`
   - Imports the adapter and, after Step 9 (freeze), runs the gate and writes a
     new additive artifact `12_abstention_decision.json`. Steps 02–10 are
     unchanged.

3. **Backfill harness:** `simulation_runner/apply-abstention.ts`
   - Reads each preserved `09_frozen_opsiq_output.json` and runs the **same**
     adapter, writing `12_abstention_decision.json` per case. It does **not**
     re-run the consulting engine and does **not** modify 02–11.

4. **Test:** `src/__tests__/governance/consulting-safety-adapter.test.ts` (5 tests).

### Input mapping provenance (each traced to an engine-output field)

| `assessSafety` input | Source | Default rationale |
|---|---|---|
| `confidence_score` | `diagnosisConfidence` enum → scalar | DEFINITIVE .95 / HIGH .8 / MODERATE .55 / PROVISIONAL .35 / INSUFFICIENT_EVIDENCE .1 |
| `has_evidence` | `rootCauseDiagnosis.evidenceIds.length > 0` | direct |
| `preconditions_met` | `status !== "INSUFFICIENT_EVIDENCE"` | direct |
| `evidence_contradictions` | — | `0` (engine exposes no contradiction counter) |
| `scope_valid` | — | `true` (consulting engine never leaves scope) |
| `irreversibility_score` | — | `0` (no irreversibility metric in output) |
| `operator_capacity_available` | — | `true` (not modeled in case input) |
| `active_conflicts` | — | `0` (single ranked memo, no rival set) |

The three defaults that touch a threshold (`irreversibility_score`,
`active_conflicts`, `evidence_contradictions`) are all set to the value that can
only **relax** the gate, so the gate cannot be made to look stricter than the
engine evidence justifies.

---

## BENCHMARK RERUN RESULT (gate executed over all 50 cases)

Command:
`npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/apply-abstention.ts --round 001`

```
cases evaluated:   50   (fully-evaluated denominator — no nulls)
abstained:         47
proceeded:          3
abstention states: { "MISSING_PRECONDITIONS": 47 }
by engine status:  INSUFFICIENT_EVIDENCE { total:47, abstain:47 }
                   SUCCESS               { total:3,  abstain:0  }
```

- The gate abstains on **exactly** the 47 `INSUFFICIENT_EVIDENCE` cases and
  proceeds on **exactly** the 3 `SUCCESS` cases (RW-001, RW-002, RW-005).
- Each abstained case carries unsafe conditions `LOW_CONFIDENCE` +
  `PRECONDITION_UNMET`, `escalation_required: true`, and an immutable
  `AbstentionDecision` (verified on `case_ADV-001`).
- Per-case artifacts written: `simulation_runs/round_001/case_*/12_abstention_decision.json` (50).

---

## SAFETY DENOMINATOR (the B2 defect, corrected for this artifact)

- **Old behavior:** the monitor safety booleans
  (`dangerous`/`hallucination`/`false_confidence`) existed for only **10/50**
  scoring records; 40/50 were `null` and were implicitly counted safe.
- **New behavior:** the abstention gate is **deterministic and total** — it now
  produces a verdict for **50/50** cases. The abstention denominator is the
  full set; there are no unevaluated cases and no nulls.
- **Important boundary:** the abstention gate detects *unsafe operating
  conditions* (low confidence, missing preconditions, etc.). It does **not**
  detect hallucination or factual danger — those remain the monitor's job and
  are still only adjudicated on 10/50. This report does **not** restate or
  recompute those monitor rates; that is remediation steps 3–5, still OPEN.

---

## WHAT IS PROVEN vs STILL OPEN

**Proven by this step:**
- The abstention engine is no longer dead code with respect to the benchmark.
  `runConsultingEngine` output now flows through `assessSafety` /
  `createAbstentionDecision` in both the live runner (Step 12) and the backfill
  harness, exercised over all 50 cases (B1 cleared at the wiring level).
- The gate behaves sensibly: abstain ⇔ low-confidence/insufficient; proceed ⇔
  confident SUCCESS.

**Explicitly NOT proven (remaining blocker items):**
- **B2 (monitor safety rates):** hallucination/dangerous/false-confidence rates
  still rest on a 10/50 denominator — not recomputed here.
- **B3 (0-vs-1 hallucination contradiction):** unresolved.
- **B4 (manual rescoring unreproducible):** unresolved.
- **B5 (named ABSTENTION_GATE decision docs absent):** unresolved.
- **Adversarial coverage:** "proceed on 3 SUCCESS cases" does not prove the gate
  catches a *dangerous confident* recommendation, because none of the 50 cases
  is an adversarial confident-but-wrong case (remediation step 4).

**Stage A remains BLOCKED for promotion.**

---

## GATES

- New unit test: `vitest run src/__tests__/governance/consulting-safety-adapter.test.ts` → **5 passed**.
- `npx prisma validate` → valid.
- `npx tsc --noEmit`: the new adapter and test compile clean. One **pre-existing**
  type-loose error in `simulation_runner/run-case.ts:149` (`allDims.filter` over
  a typed dimension `Set`) is present on `HEAD` prior to this change and is not
  introduced or worsened here; it does not affect `tsx` execution (how the
  benchmark runs). Out of scope for a wiring-only step.

---

## PRESERVATION GUARANTEE

- `02..09` frozen outputs: untouched.
- `10_scoring_record.json` (+ `.bak`): untouched.
- `11_failure_ticket.json`: untouched.
- Answer-key case packs: untouched.
- Only **new** files added: `12_abstention_decision.json` × 50, the adapter, the
  harness, and the test.

---

## ARTIFACT INDEX

| Artifact | Path |
|---|---|
| Adapter (wiring) | `src/services/governance/consulting-safety-adapter.ts` |
| Runner step 12 | `simulation_runner/run-case.ts` |
| Backfill harness | `simulation_runner/apply-abstention.ts` |
| Per-case decisions | `simulation_runs/round_001/case_*/12_abstention_decision.json` |
| Test | `src/__tests__/governance/consulting-safety-adapter.test.ts` |
