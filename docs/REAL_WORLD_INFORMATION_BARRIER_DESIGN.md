# Real-World Blind Replay — Phase 4: Information Barrier Design

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Program:** OWNER_MODE_REAL_WORLD_BLIND_REPLAY_PROGRAM  
**Phase:** 4 — Information Barrier Design  

---

## 1. Purpose

Document the information barrier architecture that ensures blind replay validation is scientifically valid: the engine MUST NOT see the outcome, expert diagnosis, or any post-decision information when producing its recommendation.

---

## 2. Barrier Architecture (Existing — from harness + README.md)

### 2.1 Physical file separation

Each case is stored in three files:

```
simulation_runs/historical_validation/case_<ID>/
├── 01_case_input.json   ← ENGINE-VISIBLE: pre-decision only
├── outcome.json         ← HIDDEN: ground truth, read ONLY by harness scorer
└── source.json          ← HIDDEN: source verification record
```

The naming convention enforces visibility intent:
- `01_case_input.json` — engine input, numbered for lexical ordering
- `outcome.json` — named to contrast with input; never passed to engine
- `source.json` — audit trail only; never passed to engine

### 2.2 TypeScript type-level barrier

The harness defines two separate TypeScript interfaces:

**`HistoricalInput`** — what the engine sees:
```typescript
interface HistoricalInput {
  caseId: string;
  businessProblem: string;       // pre-decision framing, outcome stripped
  evidence: RawEvidence[];       // pre-decision observations only
  clientContext?: { industry, size, revenueImpactUrgency };
  ownerConstraintProfile?: OwnerConstraintProfileLike;
}
```

**`HistoricalOutcome`** — hidden ground truth:
```typescript
interface HistoricalOutcome {
  grounding_class: string;
  expert_diagnosis: string;      // NEVER passed to engine
  expert_first_action: string;   // NEVER passed to engine
  actual_decision: string;       // NEVER passed to engine
  outcome_polarity: "SUCCESS" | "FAILURE" | "MIXED";
  harmful_actions?: string[];    // NEVER passed to engine
  beneficial_actions?: string[]; // NEVER passed to engine
  citation?: string;
}
```

These two types share zero fields (except `caseId` which is used only as an identifier, not as evidence to the engine). The TypeScript compiler prevents accidental use of `HistoricalOutcome` fields in `buildEngineInput()`.

### 2.3 Execution sequence barrier

The harness enforces a strict temporal sequence:

```
Step 1: Load 01_case_input.json → HistoricalInput
Step 2: buildEngineInput(inp)    → ConsultingEngineInput
Step 3: runConsultingEngine(engineInput) → ConsultingEngineOutput   ← engine runs HERE
Step 4: assessConsultingOutput(output, ...) → safety assessment     ← AFTER engine
Step 5: Load outcome.json → HistoricalOutcome                       ← AFTER engine
Step 6: scoreAgainstOutcome(diagnosis, ..., outcome) → CaseResult   ← comparison only
```

The `outcome.json` file is NOT read until Step 5 — after the engine has completed in Step 3. There is no code path where outcome data precedes or influences the engine call.

### 2.4 Integrity gate

Before any case enters the scoring pipeline:

```typescript
if (outcome.grounding_class !== "REAL_SOURCE_BACKED") {
  rejectedUngrounded += 1;
  continue; // Case is silently skipped — not scored
}
```

This gate serves two functions:
1. Prevents synthetic/LLM-recalled cases from producing a fraudulent alignment score
2. Requires explicit positive assertion (`"REAL_SOURCE_BACKED"`) — not just absence of disqualifying flags

---

## 3. Barrier Integrity Rules for Case Authors

When adding cases to `simulation_runs/historical_validation/`:

### 3.1 What MAY appear in `01_case_input.json`

- The business problem statement WITHOUT any mention of what was decided or what happened
- Evidence items reflecting pre-decision observable facts (financial data, operational metrics, market observations)
- Client context (industry, size, urgency level)
- Owner constraint profile (time, budget, capacity, legal, runway constraints)
- Timeline and constraints known BEFORE the decision point

### 3.2 What MUST NOT appear in `01_case_input.json`

- The actual decision made
- The outcome of the decision (revenue recovered, company closed, etc.)
- The expert diagnosis (root cause identification)
- What the business eventually did to resolve the problem
- Any forward-looking language that reveals the outcome ("the company was later acquired", "this decision led to bankruptcy")
- Hindsight framing ("in retrospect", "the real problem turned out to be")

### 3.3 Temporal boundary rule

All evidence in `01_case_input.json` must be knowable at time T₀ (the point at which a consultant would be asked to advise). Nothing that would only be known at T₁ (after decision) or T₂ (after outcome) may appear.

---

## 4. Anti-Contamination Controls

| Risk | Control |
|---|---|
| Author hindsight bias (unconsciously including outcome signals in evidence) | Per-case peer review; each evidence item must be traceable to a pre-decision source document |
| LLM-generated cases masquerading as real | `grounding_class: REAL_SOURCE_BACKED` requires a verifiable citation in `source.json` |
| Outcome-leaking business problem description | Manual review: problem statement must end at decision point, not resolution |
| Beneficial actions being too specific (coaching the engine) | `beneficial_actions[]` entries use general action-class language, not engine-specific terminology |
| Circular scoring (engine trained on same cases) | The engine has no training loop; `runConsultingEngine` is a rules-based/LLM engine, not a fine-tuned ML model trained on this corpus |

---

## 5. Barrier Status

| Barrier component | Designed | Implemented | Tested |
|---|---|---|---|
| File separation (3 files per case) | ✅ | ✅ | N/A — no cases yet |
| TypeScript type separation | ✅ | ✅ | Enforced by compiler |
| Execution sequence barrier | ✅ | ✅ | Code-verified |
| Integrity gate (`REAL_SOURCE_BACKED`) | ✅ | ✅ | Code-verified |
| Author anti-contamination rules | ✅ (documented here) | — (no cases yet) | — (no cases yet) |

**Barrier status: DESIGNED AND IMPLEMENTED (awaiting cases)**

The information barrier is sound. When cases are available, the barrier will function correctly as-is. No code changes are needed to add barrier enforcement.

---

## 6. Validation That Barrier Is Active

When Phase 5 runs with actual cases, the following checks confirm the barrier is active:

1. `_HISTORICAL_VALIDATION_RESULT.json` shows `rejectedUngrounded: N` if any non-REAL_SOURCE_BACKED cases were present and skipped
2. Each `CaseResult` in `cases[]` contains `engineDiagnosis` — the engine's actual output, not a copy of `expert_diagnosis`
3. `diagnosisAgreement` is a boolean comparison, not always true — confirming the engine is not seeing the answer key

---

**Phase 4 complete.**
