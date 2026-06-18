# ROUND 2 — FAILURE MODE SYNTHESIS

**Mode:** analysis only — no cases authored, no scorer, no engine/gate/answer-key
change. **Date:** 2026-06-17 · **Branch:** `claude/round2-case-pack-authoring`.
**Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE / BLOCKED.**

Synthesizes the reasoning failures the 103-case Round 2 corpus has exposed (batches
3–4 diagnosis traces + case keys) into precise, code-grounded failure classes. Source
evidence: `_BATCH_3_VALIDATION.json`, `_BATCH_4_VALIDATION.json`,
`ROUND_2_CASE_LIBRARY_BUILD_STATUS.md` (batch 3/4 updates), the `trace-round2-diagnosis`
outputs, and `diagnosis-engine.ts` / `intervention-design-engine.ts` /
`causal-challenge.ts` / `constraint-alignment.ts`.

---

## 0. MEASUREMENT CAVEAT (itself a finding — F9)
`trace-round2-diagnosis.ts` runs ONLY `diagnoseRootCause()`. It does NOT run
`intervention-design-engine`, `runCausalChallenge`, `assessConstraintAlignment`, or the
safety adapter. So **diagnosis** failures are directly measured, but **prioritization,
recommendation, action-sequencing, hidden-constraint, and safety** behavior on ~35
purpose-built cases (HC/DC/PC/some MK) is currently **UNMEASURED**. The 6-axis scorer +
full-pipeline re-trial is the prerequisite to score half the corpus (see roadmap R0).

## 1. EXPOSED FAILURE CLASSES

### F1 — CAUSAL ROOT-CAUSE BLINDNESS (surface symptom over true cause)
- **# cases exposing:** 13 (decisive).
- **Representative IDs:** FRC-01 (cash≠debt), FRC-02 (churn≠quality), FRC-03
  (bottleneck≠key-person), FRC-04 (margin≠inventory), FRC-05 (unit-econ≠pricing),
  FRC-06 (churn≠pricing), FRC-07 (margin≠demand), FRC-08 (bottleneck≠inventory),
  FRC-09 (unit-econ≠gtm), FRC-10 (cash≠working-capital), FRC-11 (quality≠bottleneck),
  FRC-12 (churn≠key-person), FRC-13 (margin≠pricing).
- **Exact engine behavior:** returns the loud covered-archetype surface diagnosis with
  HIGH/MODERATE confidence; **13/13 confidently wrong** vs the hidden true cause.
- **Root cause in code:** `diagnosis-engine.ts` `rootCausePatterns` are independent
  lexical (regex on `finding`) + numeric-threshold matchers; `diagnoseRootCause` collects
  all matches and `matchedPatterns.sort(...confidenceOrder)` then takes
  `matchedPatterns[0]` (lines 364–405). There is **no upstream-vs-downstream / competing-
  cause adjudication and no evidence attribution** — whichever surface pattern fires
  loudest wins.
- **Category:** DIAGNOSIS.
- **Severity:** CRITICAL (wrong root cause → wrong intervention; the core consulting job).
- **Likely fix:** a causal/competing-cause adjudication layer (attribute the symptom to
  its driver; downstream-symptom suppression). **NOT** "more archetypes."
- **More cases before fixing?** NO — 13/13 is conclusive.
- **Fix before all 150?** YES.

### F2 — LEXICAL-TRIGGER FALSE POSITIVES (keyword without polarity)
- **# cases exposing:** 2 caught (pilot AB-01, batch-4 HB-08); the mechanism threatens
  every healthy/abstention/off-topic case.
- **Representative IDs:** HB-08 (healthy SaaS → fabricated `cash_liquidity_crisis` from
  "a long reserve **runway**"); AB-01 (pilot, same class).
- **Exact engine behavior:** fabricates a confident diagnosis from a single keyword
  regardless of polarity — "long/healthy runway" trips the liquidity trigger exactly like
  "short runway."
- **Root cause in code:** `fin_isLiquidityCrisis` and sibling `fin_*` helpers in
  `diagnosis-engine.ts` test **bare substrings** (`/runway|liquidity|.../`) with no
  negation/polarity/context check and no required corroborating numeric.
- **Category:** DIAGNOSIS / ABSTENTION (false positive; breaks no-action behavior).
- **Severity:** HIGH (invents crises; also keeps contaminating the benchmark's own
  authoring — we have tripped it twice).
- **Likely fix:** polarity/negation-aware triggers + require a corroborating numeric (or
  replace regex with structured signals).
- **More cases before fixing?** NO.
- **Fix before all 150?** YES (cheap, high-value, and it pollutes authoring).

### F3 — NO PRIORITIZATION UNDER SURVIVAL PRESSURE
- **# cases exposing:** 1 measured (PC-01) + 11 targeted (PC-01..05, PC-06..11) mostly
  UNMEASURED.
- **Representative IDs:** PC-01 (engine diagnosed **retention** at a **3-month runway**,
  not cash), PC-06/PC-11 (survival-vs-growth/capex).
- **Exact engine behavior:** on competing surfaces the pick is heuristic confidence order;
  retention (pattern index 2) outranks cash (index 3), so at a 3-month runway it diagnoses
  retention over a liquidity emergency.
- **Root cause in code:** `diagnoseRootCause` `confidenceOrder` sort has **no survival/
  urgency weighting**; `intervention-design-engine` has **no first-action sequencing**
  (templates carry `priorityScore: 0` and fixed step order).
- **Category:** PRIORITIZATION + RECOMMENDATION.
- **Severity:** CRITICAL (advising retention work while cash runs out is fatal advice).
- **Likely fix:** survival/urgency-aware ranking (cash/solvency/safety/legal gate before
  optimization) in diagnosis selection AND action sequencing.
- **More cases before fixing?** NO.
- **Fix before all 150?** YES.

### F4 — ACTION-SEQUENCING / DIAGNOSIS-CORRECT-ACTION-WRONG
- **# cases exposing:** 8 tagged `diagnosis_correct_action_wrong` + 5 delayed-consequence
  (DC-01..05) — UNMEASURED by the diagnosis trace.
- **Representative IDs:** PC-08 (right: bottleneck; wrong action: hire 5 at 80%
  utilization), PC-09 (right: unit-econ; wrong: scale), DC-01..05 (tempting action damages).
- **Exact engine behavior:** unknown/untested — `intervention-design-engine` emits fixed
  per-diagnosis templates with no consequence- or constraint-aware first-action choice.
- **Root cause in code:** hardcoded intervention templates; the abstain-only gates can
  block but cannot **select** a better first action.
- **Category:** RECOMMENDATION + SAFETY.
- **Severity:** HIGH.
- **Likely fix:** consequence/feasibility-aware action-sequencing layer; wire the safety
  gate into scoring.
- **More cases before fixing?** NO — but build the SCORER first to make these measurable.
- **Fix before all 150?** YES (measure first via R0, then fix).

### F5 — HIDDEN CONSTRAINT HANDLED ONLY BY ABSTENTION
- **# cases exposing:** 5 (HC-01..05) — UNMEASURED.
- **Representative IDs:** HC-01 (capex blocked by budget), HC-04 (retention fix blocked by
  staffing), HC-05 (capex vs 30-day window).
- **Exact engine behavior:** `assessConstraintAlignment` can force ABSTAIN when an action
  exceeds horizon/budget/capacity/legal/risk (constraint-alignment.ts lines 65–101), but
  the engine cannot **produce a constraint-respecting alternative**.
- **Root cause in code:** `constraint-alignment.ts` is abstain-only; `intervention-design`
  is not constraint-aware.
- **Category:** RECOMMENDATION / SAFETY.
- **Severity:** MEDIUM-HIGH.
- **Likely fix:** constraint-aware recommendation (feasible-action selection), not just a
  block.
- **More cases before fixing?** NO.
- **Fix before all 150?** After R0/F3.

### F6 — MODEL-COVERAGE GAP (9 uncovered buckets)
- **# cases exposing:** dozens (every pricing/demand/gtm/inventory/working-capital/debt/
  legal/key-person/capex case).
- **Representative IDs:** D04/05/06/10/11/12/13/14/15-S0x, MK-03/04/06/09, PC-04/05/07.
- **Exact engine behavior:** `INSUFFICIENT_EVIDENCE` / abstain — **honest** (does not
  fabricate), except where a covered decoy steals the diagnosis (that is F1).
- **Root cause in code:** only 6 covered archetypes in `rootCausePatterns`.
- **Category:** DIAGNOSIS (coverage).
- **Severity:** HIGH but HONEST.
- **Likely fix:** add archetypes (E2+) — **but only valuable AFTER F1**, else each new
  archetype just adds another confident decoy.
- **More cases before fixing?** NO.
- **Fix before all 150?** NO — sequence AFTER F1/F2/F3 + scorer.

### F7 — MISLEADING-KPI: accidental control + latent regression risk
- **# cases exposing:** 6 not-fooled (MK-01/02/05/07/08/10) + 4 abstain-on-uncovered
  (MK-03/04/06/09).
- **Exact engine behavior:** the lexical engine is **ironically not fooled** by "revenue
  up" headlines — it has no concept of revenue and keys on the negative margin/churn
  numeric.
- **Root cause in code:** absence of a revenue/headline concept (accidental robustness).
- **Category:** DIAGNOSIS (latent).
- **Severity:** LOW now / MEDIUM after any model-based upgrade.
- **Likely fix:** keep a "read the deteriorating metric, not the headline" guard when the
  engine is upgraded.
- **More cases before fixing?** NO.
- **Fix before all 150?** NO (monitor; guard during the model upgrade).

### F8 — MULTI-DOMAIN SYNTHESIS WEAKNESS
- **# cases exposing:** MC-01..03 + the 13 FRC (true cause sits in a second domain).
- **Exact engine behavior:** returns one primary by confidence and lists alternatives with
  **no relational synthesis** ("primary drives secondary").
- **Root cause in code:** `diagnoseRootCause` returns first + unrelated alternatives.
- **Category:** DIAGNOSIS.
- **Severity:** MEDIUM-HIGH.
- **Likely fix:** multi-cause relational synthesis — same layer as F1.
- **More cases before fixing?** NO.
- **Fix before all 150?** With F1.

### F9 — RECOMMENDATION/SAFETY/PRIORITIZATION UNMEASURED (meta-failure)
- **# cases exposing:** ~35 (HC/DC/PC/some MK) are invisible to the current trace.
- **Root cause:** no full-pipeline scorer; `trace-round2-diagnosis` stops at diagnosis.
- **Category:** PROGRAM / SAFETY measurement.
- **Severity:** CRITICAL for the program (can't grade half the corpus).
- **Likely fix:** build the 6-axis scorer + run `runConsultingEngine`→safety adapter over
  the corpus (the re-trial). This is the dependency unlock for F3/F4/F5.

## 2. SUMMARY TABLE
| ID | Failure | #cases | Category | Severity | Measured? | Fix before 150 |
|---|---|---|---|---|---|---|
| F1 | Causal root-cause blindness | 13 | Diagnosis | CRITICAL | YES | YES |
| F2 | Lexical-trigger false positive | 2+ | Diagnosis/Abstention | HIGH | YES | YES |
| F3 | No survival prioritization | 1+11 | Prioritization | CRITICAL | partial | YES |
| F4 | Action-sequencing wrong | 13 | Recommendation/Safety | HIGH | NO | YES (after R0) |
| F5 | Hidden constraint abstain-only | 5 | Recommendation/Safety | MED-HIGH | NO | after R0 |
| F6 | Model-coverage gap | dozens | Diagnosis | HIGH(honest) | YES | NO (after F1) |
| F7 | Misleading-KPI latent | 10 | Diagnosis | LOW→MED | YES | NO (monitor) |
| F8 | Multi-domain synthesis | 16 | Diagnosis | MED-HIGH | YES | with F1 |
| F9 | Recommendation/safety unmeasured | ~35 | Program | CRITICAL | — | YES (R0) |

**Top failure mode:** F1 causal root-cause blindness (13/13 confident-wrong). See
`ROUND_2_REMEDIATION_ROADMAP.md`. **Stage A remains DO_NOT_PROMOTE / BLOCKED.**
