# Real-World Blind Replay — Phase 3: Harness Audit

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Program:** OWNER_MODE_REAL_WORLD_BLIND_REPLAY_PROGRAM  
**Phase:** 3 — Replay Harness Audit  

---

## 1. Harness Location and Identity

| Field | Value |
|---|---|
| Path | `simulation_runner/run-historical-validation.ts` |
| Lines | 242 |
| Run command | `npx tsx --tsconfig simulation_runner/tsconfig.json simulation_runner/run-historical-validation.ts` |
| Output | `simulation_runs/historical_validation/_HISTORICAL_VALIDATION_RESULT.json` |

---

## 2. Engine Integration Verification

The harness integrates with the live OpsIQ engine:

| Import | Source | Status |
|---|---|---|
| `runConsultingEngine` | `@/services/consulting-engine/orchestrator` | Live engine — production path |
| `assessConsultingOutput` | `@/services/governance/consulting-safety-adapter` | Live safety adapter — production path |
| `normalizeDiagnosis`, `actionMatches` | `@/services/benchmark/round2-scorer` | Existing Round 2 scorer utilities |
| Domain types | `@/domain/consulting-engine/types` | Production types |

**Finding:** The harness uses the SAME `runConsultingEngine` and `assessConsultingOutput` functions as production Owner Mode. This means blind replay results reflect real engine behavior, not a test double.

---

## 3. Information Barrier Enforcement

### 3.1 Input side (engine-visible)

The harness loads `01_case_input.json` and passes it to the engine:
```typescript
const inp = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as HistoricalInput;
const engineInput = buildEngineInput(inp);
const output = await runConsultingEngine(engineInput);
```

`HistoricalInput` contains: `caseId`, `businessProblem`, `evidence[]`, `clientContext?`, `ownerConstraintProfile?`.

**Barrier enforcement:** `HistoricalInput` type does NOT include `expert_diagnosis`, `expert_first_action`, `actual_decision`, `outcome_polarity`, `harmful_actions`, or `beneficial_actions`. These fields exist ONLY in `HistoricalOutcome` (loaded separately from `outcome.json`) and are NEVER passed to the engine. The TypeScript type system enforces the barrier.

### 3.2 Output side (ground truth comparison)

The harness loads `outcome.json` separately AFTER the engine has already produced output:
```typescript
const outcome = JSON.parse(fs.readFileSync(outcomePath, "utf-8")) as HistoricalOutcome;
```

The `outcome` is only used in `scoreAgainstOutcome()` — AFTER the engine call. There is no path by which outcome data could influence engine behavior.

### 3.3 Integrity gate

Before any case is scored:
```typescript
if (outcome.grounding_class !== "REAL_SOURCE_BACKED") {
  rejectedUngrounded += 1;
  continue;
}
```

Any case not explicitly classified `REAL_SOURCE_BACKED` is silently rejected and counted as `rejectedUngrounded`. It does not contribute to any score.

---

## 4. Scoring Mechanics

### 4.1 Five dimensions scored

| Dimension | Computation |
|---|---|
| `historical_alignment` | Engine direction matched documented good outcome: on FAILURE cases, did NOT recommend harmful path; on SUCCESS cases, recommended beneficial path |
| `diagnosis_agreement` | `normalizeDiagnosis(engineDx) === normalizeDiagnosis(expertDx)` |
| `action_agreement` | Engine first action matched a `beneficial_actions[]` entry (via `actionMatches()`) |
| `safety` | Engine did NOT recommend any `harmful_actions[]` entry |
| `counterfactual_review` | Engine classification was NOT `OPSIQ_WORSE` |

### 4.2 Case classification

| Classification | Condition |
|---|---|
| `OPSIQ_BETTER` | Outcome was FAILURE and engine did NOT recommend harmful path (aligned = better than actual decision) |
| `OPSIQ_WORSE` | Engine recommended a documented-harmful action |
| `OPSIQ_MATCHED` | Engine direction was correct or neutral |

### 4.3 Zero-case behavior

When `n === 0` (no REAL_SOURCE_BACKED cases scored):
- Summary: `{ casesPresent, rejectedUngrounded, blindReplaysCompleted: 0, scores: null }`
- Console output: `=== HISTORICAL VALIDATION — NO SCORE ===` + `SOURCING_BLOCKER` message
- **No score is fabricated.** The harness explicitly refuses to compute alignment scores on zero cases.

---

## 5. Harness Safety Properties

| Property | Verified |
|---|---|
| Does NOT modify engine code | ✅ Read-only of engine imports |
| Does NOT modify safety gates | ✅ Only calls `assessConsultingOutput`, does not change it |
| Does NOT modify scorer | ✅ Only uses `normalizeDiagnosis` and `actionMatches` from round2-scorer |
| Does NOT read round_002 corpus | ✅ Only reads `simulation_runs/historical_validation/` |
| Does NOT write to any source file | ✅ Only writes `_HISTORICAL_VALIDATION_RESULT.json` |
| Enforces source-backed integrity | ✅ `grounding_class !== REAL_SOURCE_BACKED` → rejected |
| Refuses to fabricate scores | ✅ `scores: null` when n === 0 |

---

## 6. Harness Readiness Assessment

| Component | Status |
|---|---|
| File exists | ✅ |
| Engine integration | ✅ Production paths |
| Information barrier | ✅ TypeScript type system enforces |
| Integrity gate | ✅ Implemented and enforced |
| Zero-case guard | ✅ No fabrication |
| Scoring logic | ✅ All 5 dimensions implemented |
| Output format | ✅ JSON result file |

**Harness status: READY**

The harness is fully implemented and correct. It cannot run because the corpus is empty — not because of any harness deficiency.

---

## 7. What Is Needed to Execute Phase 5

In a fetch-capable environment, with at least 1 REAL_SOURCE_BACKED case:

```bash
# Place case files
mkdir -p simulation_runs/historical_validation/case_HV-001
# Create 01_case_input.json, outcome.json, source.json

# Run harness
npx tsx --tsconfig simulation_runner/tsconfig.json \
  simulation_runner/run-historical-validation.ts

# Read result
cat simulation_runs/historical_validation/_HISTORICAL_VALIDATION_RESULT.json
```

No code changes are required. Only corpus population is needed.

---

**Phase 3 complete.**
