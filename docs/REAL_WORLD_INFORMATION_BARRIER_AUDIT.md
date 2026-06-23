# Real-World Information Barrier Audit

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Mission:** REAL_WORLD_CASE_CORPUS_ACQUISITION_AND_REPLAY_PREPARATION  
**Phase:** 4 — Information Barrier Validation  

---

## 1. Audit Scope

This document audits the existing information barrier design (from `docs/REAL_WORLD_INFORMATION_BARRIER_DESIGN.md` and `simulation_runner/run-historical-validation.ts`) for potential leakage vectors. Each vector is examined in isolation. Any finding of leakage potential is classified as:

- **LEAKAGE_CONFIRMED** — the barrier is structurally broken; code fix required
- **LEAKAGE_RISK** — the barrier has a gap that could be exploited by improperly authored cases; process control required
- **MITIGATED** — potential leakage vector exists but is addressed by existing controls
- **NOT_APPLICABLE** — the vector does not apply to this architecture

---

## 2. Leakage Vector Analysis

---

### 2.1 Hindsight Leakage

**Definition:** Evidence items in `01_case_input.json` include facts that were only knowable after the decision point T₀, because the case author knew the outcome while writing the input.

**Audit of harness code:**  
The harness has no automated check for hindsight language. It loads `01_case_input.json` as-is and passes it to the engine without any pre-processing scan for temporal or linguistic markers.

```typescript
const inp = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as HistoricalInput;
const engineInput = buildEngineInput(inp);
const output = await runConsultingEngine(engineInput);
```

**Finding:** LEAKAGE_RISK  
The harness does not scan evidence items for temporal validity. A case author with hindsight bias could write:
```json
{ "finding": "Management had already begun evaluating bankruptcy options in Q2" }
```
...and this would pass through to the engine, contaminating the test.

**Required control (process):** Author A / Author C dual-review process (per `REAL_WORLD_CASE_TRANSFORMATION_SPEC.md`). Each evidence item must be temporally verified before the case is admitted.

**Code fix available?** Yes, but optional enhancement (not a current harness defect): A future `case-validator.ts` script could scan evidence `finding` fields for prohibited strings and T₀ violation patterns. Not required for the harness to function correctly — this is a corpus-governance control.

---

### 2.2 Outcome Leakage

**Definition:** The actual outcome (FAILURE / SUCCESS / MIXED), expert diagnosis, or actual decision appears in `01_case_input.json` and is seen by the engine.

**Audit of harness code:**  
The harness loads `01_case_input.json` into `HistoricalInput` and `outcome.json` into `HistoricalOutcome`. These are separate type definitions with zero shared fields except `caseId`.

```typescript
interface HistoricalInput {
  caseId: string;
  businessProblem: string;
  evidence: RawEvidence[];
  clientContext?: { industry; size; revenueImpactUrgency };
  ownerConstraintProfile?: OwnerConstraintProfileLike;
}

interface HistoricalOutcome {
  grounding_class: string;
  expert_diagnosis: string;
  expert_first_action: string;
  actual_decision: string;
  outcome_polarity: "SUCCESS" | "FAILURE" | "MIXED";
  harmful_actions?: string[];
  beneficial_actions?: string[];
  citation?: string;
}
```

`HistoricalInput` has no `expert_diagnosis`, `actual_decision`, `outcome_polarity`, `harmful_actions`, or `beneficial_actions` fields. The TypeScript type system prevents these fields from flowing into `buildEngineInput()`.

**Finding:** MITIGATED at the harness code level.  
The TypeScript type enforces the barrier for structurally correct files. However, JSON parsing is untyped at runtime — if a case author places `"expert_diagnosis": "..."` inside `01_case_input.json`, TypeScript will ignore it (the field is not in the type), but the raw JSON will exist in the file. The engine would not receive it (since `buildEngineInput` only maps typed fields), but it represents a governance gap.

**Required control (process):** Author C leakage review includes checking that `01_case_input.json` does NOT contain any of these keys: `expert_diagnosis`, `expert_first_action`, `actual_decision`, `outcome_polarity`, `harmful_actions`, `beneficial_actions`, `grounding_class`.

**Code fix available?** Yes — a case validator script could `JSON.parse` the input and explicitly check for prohibited keys. Low priority but worth adding to the case validation checklist.

---

### 2.3 Timeline Leakage

**Definition:** The order of events (decision made → outcome observed) is implied by the structure of the evidence, allowing the engine to infer the outcome by chronological reasoning.

**Example of timeline leakage:**
```json
[
  { "finding": "Revenue declined 15% in Q1" },
  { "finding": "CEO launched cost-reduction program in Q2" },
  { "finding": "Cost-reduction program failed to arrest revenue decline by Q3" }
]
```
The third item reveals that the cost-reduction program (the decision) was already taken and failed.

**Audit of harness code:**  
The harness does no temporal ordering validation. Evidence items are passed as an array to the engine without chronological validation.

**Finding:** LEAKAGE_RISK  
Timeline leakage is purely a corpus-authoring failure mode, not a harness failure. The harness cannot prevent it because it has no concept of T₀.

**Required control (process):** Author A must explicitly establish T₀ during evidence extraction and reject any evidence item that post-dates T₀. Author C must verify the decision timeline is consistent.

---

### 2.4 Implicit Leakage

**Definition:** The evidence does not explicitly state the outcome, but the combination of evidence items makes the outcome obvious to a capable inference engine.

**Example:**
```json
{ "finding": "Company announced store closures of 30% of locations in Q2" },
{ "finding": "Company entered into discussions with creditors regarding debt restructuring" },
{ "finding": "Company disclosed going concern uncertainty in Q3 10-K" }
```
These three items together strongly imply Chapter 11, even without explicitly stating it.

**Audit of harness code:**  
The harness cannot detect implicit leakage — it simply passes evidence to the engine. The engine reasoning on strongly-implying evidence is not leakage from the harness's perspective; it is the engine performing legitimate inference.

**Finding:** NOT_APPLICABLE (by design)  
The distinction between "the engine correctly diagnosed bankruptcy from pre-bankruptcy evidence" and "the engine was told it was going to go bankrupt" is foundational to what the validation measures. The engine SHOULD be able to infer from pre-decision evidence. The information barrier only prohibits giving the engine the ANSWER — not evidence that is diagnostic.

**The test is: can the engine produce the correct diagnosis from pre-decision evidence?** Implicit signals in evidence are legitimate. The barrier is about not providing the ground truth answer key.

---

### 2.5 Scoring Contamination

**Definition:** The scoring function uses information from the engine's output to alter what the engine would have done, or vice versa.

**Audit of harness code:**  
```typescript
const output = await runConsultingEngine(engineInput);           // engine runs
const safety = assessConsultingOutput(output, ...);             // safety check
const committed = output.status !== "INSUFFICIENT_EVIDENCE" ... // gate check
const r = scoreAgainstOutcome(diagnosis, committed, safety.assessment.abstain, recText, outcome); // scoring
```

The engine runs first. The scoring function runs after, using the engine output. The engine output is never fed back into the engine. There is no feedback loop.

**Finding:** MITIGATED  
The temporal sequence is strictly one-way: engine → scorer. No feedback path exists.

---

### 2.6 `caseId` as Signal Leakage

**Definition:** The `caseId` field (e.g., `HV-042`) could be used by an LLM-based engine to look up the case from training data if the case IDs are published alongside the case corpus.

**Audit:**  
Case IDs are assigned sequentially (HV-001, HV-002, ...). They carry no semantic information about the case. However, if the repository is public and the harness corpus is visible, an LLM engine might correlate `HV-001` with case content it has seen in training.

**Finding:** LEAKAGE_RISK (LOW)  
Risk is low because (a) `caseId` is opaque, and (b) the corpus is private to the repository. If the repository is ever made public, this risk increases.

**Required control:** Keep `simulation_runs/historical_validation/` private. Do not publish case IDs or case content externally. If the repo becomes public, consider de-correlating case IDs from any external publications.

---

### 2.7 Company Identity Inference

**Definition:** Even with company name removed, the combination of `clientContext.industry` + approximate size + period + specific metrics uniquely identifies the company to an LLM engine with training data on that company.

**Example:** "A specialty toy retailer with ~$6B in revenue experiencing 18 months of comparable-store declines" uniquely identifies Toys R Us.

**Finding:** LEAKAGE_RISK (MEDIUM-HIGH for famous cases)  
This is the most significant leakage risk in the architecture. For well-known bankruptcies and turnarounds, the LLM engine may "recognize" the case regardless of de-identification.

**Required control:** Avoid famous cases. If famous cases are used (for historical richness), test the engine's response on those cases separately from the main corpus and flag `contamination_risk: HIGH` in `source.json`. Do not count high-contamination-risk cases toward the final validation score without a contamination-control study.

---

## 3. Summary of Findings

| Vector | Classification | Severity | Fix Required |
|---|---|---|---|
| Hindsight leakage | LEAKAGE_RISK | MEDIUM | Process control (Author A/C dual review) |
| Outcome leakage | MITIGATED (code) + LEAKAGE_RISK (process) | LOW | Process control (Author C key check) |
| Timeline leakage | LEAKAGE_RISK | MEDIUM | Process control (T₀ date validation) |
| Implicit leakage | NOT_APPLICABLE | — | By design; engine inference is valid |
| Scoring contamination | MITIGATED | — | No fix needed |
| caseId as signal | LEAKAGE_RISK | LOW | Keep corpus private |
| Company identity inference | LEAKAGE_RISK | MEDIUM-HIGH | Avoid famous cases; tag contamination risk |

**No LEAKAGE_CONFIRMED findings.** The harness code is structurally sound. All remaining risks are process risks (corpus authoring governance), not code defects.

---

## 4. Required Controls Before Phase 5

| Control | Type | Implemented? |
|---|---|---|
| Author A / Author B / Author C dual-extraction process | Process | Defined in REAL_WORLD_CASE_TRANSFORMATION_SPEC.md |
| Hindsight language prohibited-string scan | Process | Defined in REAL_WORLD_CASE_TRANSFORMATION_SPEC.md |
| T₀ temporal verification per evidence item | Process | Defined in REAL_WORLD_CASE_TRANSFORMATION_SPEC.md |
| Key-field prohibition check for 01_case_input.json | Process | Defined in REAL_WORLD_CASE_TRANSFORMATION_SPEC.md |
| Famous-case contamination tagging | Process | Source.json `contamination_risk` field |
| Keep corpus private | Governance | Current state (private repo) |

All required controls are process controls. No code changes to the harness are required before Phase 5.

---

## 5. Optional Code Enhancements (post-corpus build)

These are not required for Phase 5 but would add automated governance:

1. **`simulation_runner/validate-historical-case.ts`** — a script that validates a single case directory for:
   - Required files present (`01_case_input.json`, `outcome.json`, `source.json`)
   - Prohibited keys absent from `01_case_input.json`
   - `grounding_class: REAL_SOURCE_BACKED` present in `outcome.json`
   - `reliability_tier` ∈ {A, B} in `source.json`
   - Prohibited string scan on `01_case_input.json` fields

2. **`simulation_runner/audit-corpus.ts`** — runs `validate-historical-case.ts` across all cases; produces a corpus audit report.

These would be zero-runtime-impact additions; they run only as tools, not in production.

---

**Phase 4 complete. Barrier status: SOUND. No code defects. Process controls are required and defined.**
