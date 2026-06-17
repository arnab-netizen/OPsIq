# ABSTENTION GATE — ROOT CAUSE REVIEW

**Purpose:** consolidate the root causes found and their resolution status.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Replaces:** absent `ABSTENTION_GATE_ROOT_CAUSE_REVIEW.md` (B5). No code/scoring/
threshold/answer-key/benchmark-output change. **Not a Stage A pass claim.**

## Root causes (committed evidence) and status

| ID | Root cause | Source | Status |
|---|---|---|---|
| B1 | Abstention engine never wired into runner/orchestrator (only a unit test called it) | `STAGE_A_SAFETY_VALIDATION_BLOCKER.md`, `SAFETY_WIRING_VALIDATION_REPORT.md` | **CLOSED** — wired; 50/50 evaluated |
| B2 | Safety rates counted 40/50 unscored cases as safe | `SAFETY_DENOMINATOR_RECOMPUTATION_REPORT.md` | **CLOSED** — recomputed on evaluated denominator |
| B3 | 0-vs-1 hallucination contradiction across closeouts | `SAFETY_DENOMINATOR_RECOMPUTATION_REPORT.md` §4 | **CLOSED** — ground truth = 1 (RW-001) |
| B4 | "Manual" rescoring unreproducible (no script, `/tmp` gone, templated) | `B4_RESCORING_REPRODUCIBILITY_DECISION.md` | **CLOSED by retraction** + replacement standard |
| B5 | Named decision docs absent | this set | **CLOSED** — 7 docs created |
| RC-1 | Gate was confidence-only (no correctness check) | `CONFIDENT_WRONG_ROOT_CAUSE_CLASSIFICATION.md` | **MITIGATED** by RC-3/A/C fixes |
| RC-2 | Adapter field loss (rich engine output → binary `has_evidence`) | same | **CLOSED** — adapter surfaces support ratio, evidence, owner profile |
| RC-3 | No evidence-support sufficiency check | `EVIDENCE_SUPPORT_GATE_VALIDATION_REPORT.md` | **CLOSED** — Option B |
| RC-7 | No runtime factuality/causal verification | `RC7_*` reports | **MITIGATED** — Option A (causal) + C (constraint); semantic residue remains OPEN |
| RC-5 | No recommendation→constraint alignment | `RC7_OPTION_C_VALIDATION_REPORT.md` | **CLOSED** — Option C |
| RC-6 | No recommendation danger/irreversibility check | `RC7_OPTION_C_VALIDATION_REPORT.md` §4 | **MITIGATED via A/C**; standalone Option D deferred (advisory) |

## Proven vs open
- **Proven:** the load-bearing wiring/denominator/contradiction/reproducibility
  defects (B1–B5) are resolved; the gate now catches all designed unsafe probes.
- **Open:** RC-7's irreducible semantic core (cue-free wrong outputs), RW-005
  adjudication, UNVERIFIED quality, and the engine's intrinsic weakness (47/50
  INSUFFICIENT_EVIDENCE — `SAFETY_WIRING_VALIDATION_REPORT.md`).

**Stage A remains BLOCKED.** The *safety-gate* root causes are addressed; the
*engine-capability* root cause (it rarely produces usable committed output) is not.
