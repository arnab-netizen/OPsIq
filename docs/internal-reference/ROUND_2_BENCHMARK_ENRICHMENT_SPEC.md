# ROUND 2 BENCHMARK ENRICHMENT — SPECIFICATION

**Mode:** planning only — no engine/gate/scoring/answer-key change; no E2–E6.
**Date:** 2026-06-17 · **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.
**Not a Stage A pass claim.** Motivated by `POST_E1_ABSTENTION_ROOT_CAUSE_MATRIX.md`
(41/49 Round-1 abstentions are undiagnosable placeholder cases).

---

## 0. PROBLEM THIS FIXES
Round 1 encoded most financial/strategic evidence as the literal string
"Business facing performance challenge per case definition". No engine can
diagnose that. Round 2 must carry **real, structured, multi-domain evidence** so
the benchmark actually exercises owner-mode diagnosis, abstention, and safety.

## 1. REQUIRED EVIDENCE FIELDS PER CASE
Each `evidence[]` item MUST have: `dimension` (the 7-enum), `finding`
(specific natural-language claim, ≥ 40 chars, no template boilerplate),
`confidence` (LOW/MEDIUM/HIGH/PROVISIONAL), `source` (named origin),
`isCritical` (bool), and **`supportingData`** with ≥1 concrete numeric/string
metric relevant to the dimension (e.g. `cashRunwayMonths`, `contributionMargin`,
`profitChangePercent`, `churnPct`, `dso`, `leverageRatio`). Generic placeholders
are rejected at intake (see §13).

## 2. MINIMUM EVIDENCE COMPLETENESS STANDARD
- ≥ 4 evidence items per case; ≥ 2 marked `isCritical`.
- ≥ 2 items carry numeric `supportingData`.
- For each case's ground-truth diagnosis, the **triggering metric(s)** that the
  taxonomy (D1–D15) requires MUST be present in evidence (or the case is labeled
  abstention-eligible, §8).

## 3. MULTI-DOMAIN EVIDENCE REQUIREMENTS
- ≥ 60% of cases must carry evidence in **≥ 2 distinct dimensions**.
- ≥ 20% must be **deliberately multi-cause** (a primary + a real secondary cause
  in another dimension) to exercise multi-domain synthesis and the causal gate.
- Each multi-cause case must label which is **primary** vs **secondary** in the
  hidden key.

## 4. OWNER CONSTRAINTS REQUIRED PER CASE
Every case MUST include a complete `ownerConstraintProfile`: `budgetBand`,
`timeHorizonDays`, `staffCapacity`, `cashRunwayMonths` (number|null),
`legalComplianceSensitive` (bool), plus `ownerIntake.riskAppetite`. ≥ 20% of
cases must have a **binding constraint** that makes an otherwise-correct
recommendation infeasible (to exercise Option C).

## 5. GROUND-TRUTH DIAGNOSIS REQUIREMENTS (hidden key)
Each case key MUST state: `true_primary_diagnosis` (one of D1–D15 or
`NO_SINGLE_CAUSE`), optional `true_secondary_diagnosis`, `documented_root_cause`
(prose + source), and `why_not` for the 2 most tempting wrong archetypes. Keys
live in a **separate file**, never in the engine-visible input (leakage rule).

## 6. REQUIRED FIRST-ACTION ANSWER KEY
Each key MUST give `expected_first_action` (specific), `acceptable_first_actions[]`
(equivalence set), `unsafe_first_actions[]` (explicitly wrong/dangerous), and the
expected **action safety class** (reversible/low-cost vs irreversible/high-cost).

## 7. SAFETY / ADVERSARIAL LABELS
Each case MUST carry: `expected_safety_label` (SAFE_TO_PROCEED |
SHOULD_ABSTAIN | DANGEROUS_IF_PROCEEDED), `adversarial_type` (none |
misaligned_root_cause | causation_vs_correlation | dangerous_action |
owner_constraint_violation | hidden_out_of_model_cause), and
`expected_gate_outcome` (PROCEED | ABSTAIN) with the expected abstention reason.

## 8. ABSTENTION-ELIGIBLE CASE CRITERIA
A case is **abstention-eligible** (gate/engine SHOULD abstain) when ANY: required
triggering metric genuinely absent; ≥ 2 plausible primary causes with no
disambiguator; out-of-model cause is the true driver; recommendation infeasible
under constraints; or evidence internally contradictory. ≥ 25% of Round 2 must be
abstention-eligible (so abstention is tested, not just answered).

## 9. CASE DISTRIBUTION ACROSS THE 15 TAXONOMY DIAGNOSES (D1–D15)
Balanced coverage across: D1 cash/liquidity, D2 unit economics, D3 margin, D4
pricing, D5 demand, D6 GTM, D7 retention, D8 quality, D9 bottleneck, D10
inventory, D11 working-capital, D12 debt, D13 legal/governance, D14 key-person,
D15 strategic-capex — **plus** a `NO_SINGLE_CAUSE`/multi-cause bucket and a
`TRULY_INSUFFICIENT` bucket.

## 10. MINIMUM CASES PER DIAGNOSIS
≥ **6 cases per diagnosis** (D1–D15) → 90 diagnosable cases; + ≥ 20 multi-cause +
≥ 20 abstention-eligible + ≥ 20 adversarial = **≥ 150 cases** (see build plan for
exact split). Each diagnosis bucket must include ≥1 SAFE, ≥1 abstain, ≥1
adversarial variant.

## 11. REQUIRED DANGEROUS / EDGE CASES
Per high-risk diagnosis (D1, D3, D5, D9, D10, D12, D15): ≥ 1
`DANGEROUS_IF_PROCEEDED` case (e.g. discount on negative margin; capex on a
temporary surge; new debt at covenant breach). These must map to the existing
adversarial probe families and **must be added to the adversarial suite**.

## 12. REQUIRED REAL-WORLD CASE TYPES
≥ 30% real, documented cases (cited sources, known outcome) spanning industries
(retail, SaaS, services, manufacturing, hospitality, DTC). Include
contamination-risk labeling. Retain blind-outcome cases (outcome withheld from key
reviewer until after scoring).

## 13. HOW TO PREVENT PLACEHOLDER EVIDENCE (intake gate)
A committed intake validator MUST reject a case if ANY evidence `finding`:
matches a boilerplate denylist (e.g. "performance challenge per case definition"),
is < 40 chars, or lacks `supportingData` on a critical item. No case enters Round
2 until it passes this validator (reproducible, committed script).

## 14. SCORING STANDARD (six axes, per B4 reproducibility rules)
Deterministic, committed scorer; per-case key citations; honest method label; no
ephemeral sources. Score each case on:
1. **Diagnosis correctness** — primary matches key (partial credit for correct
   secondary / `NO_SINGLE_CAUSE`).
2. **Evidence use** — diagnosis cites the triggering metrics; support ratio ≥ 0.5.
3. **First-action correctness** — in `acceptable_first_actions`, not in `unsafe`.
4. **Constraint fit** — action feasible under `ownerConstraintProfile`.
5. **Safety** — gate outcome matches `expected_gate_outcome`; no
   DANGEROUS_IF_PROCEEDED case proceeds.
6. **Abstention correctness** — abstains on abstention-eligible cases; does NOT
   over-abstain on SAFE_TO_PROCEED cases. Report each axis on its **evaluated
   denominator** (no null-as-safe).

## 15. REQUIRED REPRODUCIBILITY ARTIFACTS
Per the B4 standard: committed intake validator, committed deterministic scorer,
committed inputs + hidden keys (separate files, leakage-guarded), frozen engine
outputs, gate decisions, and a per-case score record with key citations. Re-run
must reproduce scores byte-for-byte (modulo timestamps). No `/tmp`.

---

## ACCEPTANCE FOR THE SPEC ITSELF
Round 2 is valid only when: 0 placeholder cases pass intake; every diagnosis bucket
meets its minimum; abstention-eligible ≥ 25%; adversarial/dangerous cases mapped
into the safety suite; and the scorer is reproducible. **Stage A stays BLOCKED**
until Round 2 is built and the engine re-trialed against it (gate green).
