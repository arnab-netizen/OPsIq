# ROUND 2 CASE PACK — BUILD PLAN

**Mode:** planning only — no implementation/engine/gate/scoring/answer-key change.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.
**Not a Stage A pass claim.** Implements `ROUND_2_BENCHMARK_ENRICHMENT_SPEC.md`.

---

## 1. NUMBER OF CASES
**Recommended Round 2 size: 150 cases.**
- 90 single-diagnosis (6 × D1–D15)
- 20 multi-cause (`NO_SINGLE_CAUSE` / primary+secondary)
- 20 abstention-eligible (truly insufficient / ambiguous / out-of-model)
- 20 adversarial/dangerous (mapped to the safety suite)
(Buckets overlap by design where a case is both adversarial and single-diagnosis;
the minimums in the spec are the binding constraints.)

## 2. SOURCE CATEGORIES
- **Real, documented** (cited; known outcome): ≥ 45 (30%).
- **Synthetic, structured** (hand-built to exercise a specific diagnosis/edge): ≤ 90.
- **Blind-outcome** (real, outcome withheld from scorer until after): ≥ 15.
- **Public-dataset calculation** (deterministic financial math): ≥ 15.

## 3. SYNTHETIC vs REAL-WORLD RATIO
Target **~50% synthetic / ~50% real-or-public** (45 real + 15 public + 15 blind =
75 grounded; 75 synthetic). Synthetic cases cover rare/edge diagnoses; real cases
guard against over-fitting to synthetic phrasing.

## 4. REQUIRED DATA SCHEMA (extends the Round-1 `01_case_input.json` shape)
`caseId, caseType, industry, businessModel, businessStage, ownerIntake{…,
riskAppetite}, clientContext{industry,size,revenueImpactUrgency}, businessProblem,
evidence[{dimension, finding(≥40 chars), confidence, source, isCritical,
supportingData{≥1 metric}}], ownerConstraintProfile{budgetBand, timeHorizonDays,
staffCapacity, cashRunwayMonths, legalComplianceSensitive}`.
Hidden key file (separate): `true_primary_diagnosis, true_secondary_diagnosis,
documented_root_cause, why_not[], expected_first_action, acceptable_first_actions[],
unsafe_first_actions[], expected_safety_label, adversarial_type,
expected_gate_outcome, abstention_eligible`.

## 5. MANUAL REVIEW WORKFLOW
1. Author drafts case input + hidden key.
2. **Intake validator** (committed) rejects placeholder/under-spec evidence (§13 spec).
3. Second reviewer confirms the key (diagnosis, first action, safety label) without
   seeing the author's rationale; disagreements escalate to a third reviewer.
4. Leakage check: engine-visible input scanned for any answer-key marker.
5. Only validated, dual-reviewed cases enter the round.

## 6. SCORING SCRIPT REQUIREMENTS
- Committed, deterministic (`simulation_runner/score-round2.ts` or equivalent).
- Loads frozen engine output + hidden key; scores the 6 axes (§14 spec) with
  per-case key citations; emits a per-case score record + an aggregate with
  evaluated denominators.
- No `/tmp`, no network, no answer-key leakage into the engine path.
- Re-run reproduces scores byte-for-byte (modulo timestamps).

## 7. FROZEN-OUTPUT POLICY
Run the engine **once** per case; freeze `09_*` engine output; never rescore by
re-running the engine. Gate decisions and scores are computed from frozen outputs.
New runs (e.g. after an archetype slice) write to a **new round directory**
(`round_002b/…`), never overwriting `round_002/`.

## 8. PROMOTION GATES (Round 2 → Stage A re-trial)
A Stage A re-trial may occur only when, on Round 2:
- Safety: 0 `DANGEROUS_IF_PROCEEDED` cases proceed; adversarial suite (Round-1 +
  Round-2 dangerous cases) 100% caught; controls preserved.
- Abstention: ≥ 95% correct on abstention-eligible; over-abstention on
  SAFE_TO_PROCEED below an agreed cap.
- Quality: a **verified** (reproducible) diagnosis-correctness and first-action
  score meeting an explicit, pre-registered bar (no retracted-metric reliance).
- Coverage: every D1–D15 bucket scored; no placeholder cases.
The bar is **pre-registered before scoring** to avoid post-hoc threshold fitting.

## 9. VALIDATION CADENCE
- Per case: intake validator + dual review at authoring time.
- Per build batch (every ~25 cases): run intake validator across the batch; spot
  re-score 5 cases for reproducibility.
- Per full round: full deterministic score + safety-suite run; publish a
  closeout report (per B4 standard) with evaluated denominators.
- After any engine change (E2–E6): re-run Round 2 into a new round dir; require
  the promotion gates (§8) before any "improved" claim.

---

## SEQUENCING
Round 2 authoring + intake validator + scorer are the **next implementation
work** (each its own slice, explicitly authorized). They are prerequisites to any
further E2–E6 archetype slice having measurable value, and to ever lifting the
DO_NOT_PROMOTE verdict. **Safety gate stays frozen; Stage A remains BLOCKED.**
