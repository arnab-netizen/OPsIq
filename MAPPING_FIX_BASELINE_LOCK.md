# MAPPING FIX — PHASE 0 BASELINE LOCK

**Date:** 2026-06-17  
**Mode:** Read-only deep validation (no production code changes)

---

## VERSION LOCK

| Item | Value |
|---|---|
| Branch | claude/execution-consultant-engine-v2-kobwgj |
| Latest commit (at lock) | cc7363e7 ("Add mapping fix benchmark outputs and forensic traces") |
| Fix commit | 632e2452 ("PRIORITY 1: Diagnosis-to-pattern mapping redesign") |
| Working tree | CLEAN (verified `git status --short` empty before validation) |
| Benchmark output dir | simulation_runs/round_002/stage_a_diagnosis_mapping_fix_outputs/ — EXISTS |

## CODE UNDER VALIDATION

- `src/services/stage-a/evidence-synthesis-engine.ts` — modified by fix (3 new validators, 3 new patterns: Pattern 9 pricing, Pattern 10 demand+financial, Pattern 11 operational bottleneck)
- `src/services/stage-a/hypothesis-generator.ts` — UNCHANGED by fix (scoring/ranking untouched)
- `src/services/stage-a/hypothesis-ranker.ts` — UNCHANGED
- `src/services/stage-a/causal-diagnosis-adjudicator.ts` — UNCHANGED

**Confirmed:** The mapping fix touched ONLY pattern generation in evidence-synthesis-engine.ts. No scoring formula, threshold, keyword, or confidence-cap changes.

## PROTECTED ARTIFACT STATUS

| Artifact | Changed by fix? |
|---|---|
| Round 2 answer keys (`simulation_runs/round_002/cases/*/ANSWER_KEY_*.json`) | NO |
| Frozen Stage A outputs (`stage_a_outputs/`) | NO |
| Benchmark harness scoring rules (`slice-8-benchmark.test.ts`) | NO |
| Confidence cap (65) | NO |

## CLAIMED RESULT TO BE VALIDATED

- Baseline (SLICE_7): 8/21 = 38.1%
- Mapping fix (SLICE_8): 10/21 = 47.6%
- Net gain: +2 cases
- Regressions: 0

## INTEGRITY NOTE DISCOVERED DURING LOCK

The committed `FORENSIC_SCORE_TRACE_LOGS.json` (in commit cc7363e7) was **stale** — it was generated from an intermediate code state (before the final tightening of `validateStrategicPricingError`), and showed RW-016 → strategic_pricing_error. The final committed code predicts RW-016 → unit_economics_breakdown. This file was regenerated read-only during PHASE 1 to reflect the final code; the corrected version reconciles with the benchmark JSON. This does not affect the 10/21 correctness claim (see PHASE 1) but is recorded here as a baseline-lock observation.

## VALIDATION METHOD

Three independent reproductions of the prediction set were obtained from the final committed code:
1. `slice-8-benchmark.test.ts` (committed benchmark harness) → 10/21
2. `forensic-score-trace.test.ts` (read-only, regenerated) → failing-case set consistent
3. `mapping-fix-all21-trace.test.ts` (new read-only diagnostic, all 21 cases) → 10/21

All three use the identical production path: `EvidenceSynthesisEngine.synthesizeEvidence()` → `HypothesisGenerator.generateHypotheses()` → `hypotheses[0]`.
