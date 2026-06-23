# Real-World Blind Replay — Phase 0 Readiness Audit

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**HEAD commit:** 860ee6e7  
**Program:** OWNER_MODE_REAL_WORLD_BLIND_REPLAY_PROGRAM  
**Phase:** 0 — Readiness Audit  

---

## 1. Repository Inventory

### 1.1 Harness

| Artifact | Path | Status |
|---|---|---|
| Historical validation harness | `simulation_runner/run-historical-validation.ts` | EXISTS — 242 lines; fully implemented |
| Harness tsconfig | `simulation_runner/tsconfig.json` | EXISTS (inferred from run command) |
| Case directory | `simulation_runs/historical_validation/` | EXISTS — empty of cases |
| Result file | `simulation_runs/historical_validation/_HISTORICAL_VALIDATION_RESULT.json` | EXISTS — reports `casesPresent: 0` |
| Case README | `simulation_runs/historical_validation/README.md` | EXISTS — full protocol defined |

**Harness assessment:** FULLY IMPLEMENTED. The harness (`run-historical-validation.ts`) does the following:
- Scans `simulation_runs/historical_validation/` for `case_*/` directories
- Loads `01_case_input.json` (outcome-hidden engine input)
- Loads `outcome.json` (hidden ground truth — NEVER passed to engine)
- Enforces `grounding_class === "REAL_SOURCE_BACKED"` integrity gate; rejects all other cases
- Passes engine-visible input to `runConsultingEngine()`
- Passes output to `assessConsultingOutput()` (safety adapter)
- Scores 5 dimensions: `historical_alignment`, `diagnosis_agreement`, `action_agreement`, `safety`, `counterfactual_review`
- Writes results to `_HISTORICAL_VALIDATION_RESULT.json`
- When 0 scored cases: reports `NO_CASES`, computes no alignment score (does not fabricate)

### 1.2 Source Standard

| Artifact | Path | Status |
|---|---|---|
| Source standard | `ROUND_2_REAL_WORLD_SOURCE_STANDARD.md` | EXISTS (in repo root) |

Source standard defines: `REAL_SOURCE_BACKED` class, citation requirements, source.json schema, reliability tiers A–D.

### 1.3 Benchmark Assets (B15 pre-existing DB layer)

| Artifact | Path | Status |
|---|---|---|
| B15 domain model | `src/domain/benchmark/case-study.ts` | EXISTS — 341 lines; TypeScript interfaces for CaseStudy, CaseBenchmarkResult |
| B15 DB service | `src/services/benchmark/case-library.service.ts` | EXISTS (inferred from LANE_B verification) |
| B15 Prisma migration | `prisma/migrations/20260614230000_b15_case_study_benchmark/` | EXISTS |
| B15 DB tests | `src/services/benchmark/case-library.service.db.test.ts` | 15 DB tests — PASS |

**B15 pre-existing assessment:** The `src/domain/benchmark/case-study.ts` defines a rich domain model (`CaseStudy`, `CaseBenchmarkResult`) with source-transparency fields and a `validateCaseStudyCompliance()` function. This is a separate DB-backed service for benchmarking. It does NOT contain any seeded real-world cases — it provides the schema and validation layer only.

### 1.4 B15-S1 Pure-Function Library

| Artifact | Path | Status |
|---|---|---|
| Contract (Zod schema) | `src/domain/case-studies/contract.ts` | EXISTS — 5 seed cases, pure-function |
| Library (5 seeded cases) | `src/domain/case-studies/library.ts` | EXISTS |
| Index (helpers) | `src/domain/case-studies/index.ts` | EXISTS |
| Tests | `src/__tests__/case-studies/contract.test.ts` | 36 tests — PASS |

**B15-S1 assessment:** 5 seeded cases (CS-001 through CS-005). These are public-domain industry summary cases derived from SCORE/SBA, NRA, AICPA, NIST MEP, Shopify guidance. They are classified `PURE_FUNCTION_VERIFIED`. They are NOT `REAL_SOURCE_BACKED` per `ROUND_2_REAL_WORLD_SOURCE_STANDARD` — they are seed library infrastructure cases, not historical business events with documented pre-decision evidence and hidden outcomes.

### 1.5 Existing Simulation Cases

| Directory | Count | Class | Usable for replay? |
|---|---|---|---|
| `simulation_runs/historical_validation/case_*/` | 0 | — | N/A |
| `simulation_runs/round_002/case_*/` | ~20 | adversarial/synthetic | NO — synthetic/constructed per source inspection |
| `simulation_runs/adversarial_safety_probes_v2/case_*/` | checked | synthetic | NO |

### 1.6 Web Access

| Check | Result |
|---|---|
| WebFetch to external domains | HTTP 403 — blocked |
| Web archive access | Disallowed per environment |
| Search snippets as source verification | Forbidden by ROUND_2_REAL_WORLD_SOURCE_STANDARD (snippets are not verification) |

---

## 2. Six-Condition Stop Test

The program may declare `BLOCKED_NEEDS_REAL_WORLD_CASE_CORPUS` ONLY IF ALL SIX conditions are simultaneously true:

| # | Condition | Evidence | Result |
|---|---|---|---|
| 1 | Repository contains no usable real cases | `simulation_runs/historical_validation/` has 0 `case_*/` directories | **TRUE** |
| 2 | Benchmark assets contain no usable real cases | B15 DB layer has schema/service but 0 seeded real-world historical cases | **TRUE** |
| 3 | B15 contains no usable real cases | B15-S1 has 5 seed cases; none are REAL_SOURCE_BACKED per round_2 source standard | **TRUE** |
| 4 | No additional cases can be sourced | WebFetch HTTP 403; no web access; source verification impossible | **TRUE** |
| 5 | No replay harness path exists | `simulation_runner/run-historical-validation.ts` EXISTS and is fully implemented | **FALSE** |
| 6 | No runtime invocation path exists | `runConsultingEngine` + `assessConsultingOutput` path confirmed in harness | **FALSE** |

**Stop condition result: NOT MET.** Conditions 5 and 6 are FALSE. The program must continue to Phase 12.

---

## 3. Readiness Decision

| Component | Status |
|---|---|
| Harness | READY — fully implemented |
| Source standard | READY — defined |
| Information barrier design | READY — per README.md (`01_case_input.json` outcome-hidden, `outcome.json` hidden) |
| Case corpus | BLOCKED — 0 REAL_SOURCE_BACKED cases |
| Web sourcing | BLOCKED — HTTP 403 environment |

**Overall readiness:** HARNESS_READY / CORPUS_BLOCKED

The harness is ready. The corpus is blocked. Phase 5 (blind replay execution) cannot run. Phases 1–4 and 11–12 proceed as documentation.

---

**Phase 0 complete.**
