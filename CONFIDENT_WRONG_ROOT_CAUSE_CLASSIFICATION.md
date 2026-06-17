# CONFIDENT-WRONG ROOT CAUSE CLASSIFICATION (Phase 2)

**Mode:** ROOT-CAUSE — documentation only.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`
**Inputs:** `CONFIDENT_WRONG_FAILURE_TRACE.md`,
`src/services/governance/abstention-engine.ts`,
`src/services/governance/consulting-safety-adapter.ts`,
`src/domain/consulting-engine/types.ts` (output schema).

The failure is **multi-cause**, but there is one PRIMARY cause and several
contributing causes. Listed primary-first.

---

## PRIMARY

### RC-1 · SAFETY_ENGINE_CONFIDENCE_ONLY
- **File/function:** `abstention-engine.ts::assessSafety` (lines ~27–162).
- **Missing signal:** any measure of whether a *confident* answer is *correct/
  supported*. The 8 rules test confidence magnitude (`<0.3`), binary evidence
  presence (`!has_evidence`), contradiction count, scope, preconditions,
  irreversibility, capacity, conflicts. None tests evidence-support sufficiency,
  problem alignment, or factuality.
- **Consequence:** the gate equates "confident + structurally complete" with
  "safe". A confidently wrong output has high confidence and complete structure,
  so it is classed safe.
- **RW-001:** YES. **RW-005:** YES.
- **Wider impact:** every SUCCESS/PROVISIONAL case (3/50 today; grows as
  diagnosis coverage improves). As the engine gets *more* confident, this gate
  gets *more* permissive — the dangerous direction.

---

## CONTRIBUTING

### RC-2 · ADAPTER_FIELD_LOSS
- **File/function:** `consulting-safety-adapter.ts::deriveSafetyGateInputs`.
- **Missing signal:** the engine emits `rootCauseDiagnosis.evidenceIds`,
  `missingEvidenceFor`, the full `evidence` set, `recommendedInterventions`, and
  the input carries `businessProblem` + `ownerConstraintProfile`. The adapter
  reduces all of this to `has_evidence = evidenceIds.length > 0` and hardcodes
  `evidence_contradictions=0`, `irreversibility_score=0`, `active_conflicts=0`.
- **Consequence:** even though the gate's *interface* could express "weak
  evidence / unmet conditions," the adapter never supplies the data, so several
  rules are dead by construction. The engine's **own** `missingEvidenceFor`
  warning is discarded.
- **RW-001:** YES (1/6 support + 3 gaps dropped). **RW-005:** YES (1/5 + 3 gaps dropped).
- **Wider impact:** all cases; the gate can never be stricter than the adapter's
  lossy projection.

### RC-3 · NO_EVIDENCE_SUPPORT_CHECK
- **File/function:** `assessSafety` (evidence rule, lines ~56–66) + adapter `has_evidence`.
- **Missing signal:** evidence-support *ratio* (evidenceIds used ÷ evidence
  available) and "diagnosis confident despite `missingEvidenceFor` non-empty".
- **Consequence:** a diagnosis from 1 of 6 items is treated identically to one
  from 6 of 6. Presence ≠ sufficiency.
- **RW-001:** YES. **RW-005:** YES. **Wider impact:** all committed diagnoses.

### RC-4 · MONITOR_FLAGS_NOT_INTEGRATED
- **File/function:** pipeline wiring — `10_scoring_record.json` (monitor) vs
  `12_abstention_decision.json` (gate) are disconnected branches.
- **Missing signal:** monitor `hallucination_detected` / `dangerous_*` never
  reach the gate.
- **Consequence:** RW-001 was *known* (monitor) to be a hallucination, yet the
  gate proceeded.
- **RW-001:** YES. **RW-005:** N/A at runtime (no monitor pass).
- **Caveat / wider impact:** monitor flags are **post-hoc and answer-key-aware**;
  they do **not exist at production runtime**. Integrating them validates the
  benchmark but is **not a production-valid safety mechanism**. See RC-7.

### RC-5 · NO_CONSTRAINT_ALIGNMENT_CHECK
- **File/function:** `assessSafety` (no rule) + adapter (drops `ownerConstraintProfile`).
- **Missing signal:** does the recommendation address the owner's *stated
  decision* and fit budget/time/legal constraints?
- **Consequence:** RW-005's loyalty program (answering the wrong question) is not
  flagged as off-target.
- **RW-001:** PARTIAL (problem-alignment, not constraint). **RW-005:** YES.
- **Wider impact:** all committed recommendations.

### RC-6 · NO_RECOMMENDATION_DANGER_CHECK
- **File/function:** `assessSafety` `irreversibility` rule (lines ~112–124) is
  the only danger-adjacent rule, and the adapter feeds it `0`.
- **Missing signal:** danger/irreversibility of the *recommended action* and of
  the *underlying decision* (e.g. $400M capex).
- **Consequence:** irreversibility rule is dead; nothing screens harmful actions.
- **RW-001:** low relevance (MINIMAL action). **RW-005:** YES (the decision under
  advice is highly irreversible; the gate models neither it nor the rec).
- **Wider impact:** any case advising a costly/irreversible move.

### RC-7 · NO_ANSWER_KEY_COMPARISON_PATH / SAFETY_ENGINE_NO_FACTUALITY_CHECK
- **File/function:** `assessSafety` (no factuality rule); no oracle wired.
- **Missing signal:** ground-truth factuality.
- **Consequence:** the gate cannot detect a fabricated-but-confident claim.
- **RW-001:** YES. **RW-005:** YES.
- **Caveat / wider impact:** **structurally unavailable at runtime** — production
  has no answer key and no factuality oracle. This is a real gap but **cannot be
  closed by an answer-key path**; it must be approximated by RC-3/RC-5 signals
  (evidence support, alignment) or an independent verifier. Do not "fix" by
  feeding answer keys into production.

---

## SUMMARY MATRIX

| Root cause | RW-001 | RW-005 | Production-fixable? |
|---|---|---|---|
| RC-1 SAFETY_ENGINE_CONFIDENCE_ONLY (PRIMARY) | ✅ | ✅ | Yes |
| RC-2 ADAPTER_FIELD_LOSS | ✅ | ✅ | Yes |
| RC-3 NO_EVIDENCE_SUPPORT_CHECK | ✅ | ✅ | Yes |
| RC-4 MONITOR_FLAGS_NOT_INTEGRATED | ✅ | n/a | Benchmark-only (not prod-valid) |
| RC-5 NO_CONSTRAINT_ALIGNMENT_CHECK | partial | ✅ | Yes |
| RC-6 NO_RECOMMENDATION_DANGER_CHECK | low | ✅ | Yes |
| RC-7 NO_FACTUALITY / NO_ANSWER_KEY_PATH | ✅ | ✅ | No (no runtime oracle) |

**Bottom line:** the PRIMARY, production-fixable root cause is **RC-1
(confidence-only gate)** enabled by **RC-2 (adapter field loss)** and manifesting
as **RC-3 (no evidence-support check)**. RC-4 and RC-7 are real but **not
production-valid** to "fix" directly (they depend on answer keys / oracles that
do not exist at runtime); they must be approximated through RC-3/RC-5/RC-6.
