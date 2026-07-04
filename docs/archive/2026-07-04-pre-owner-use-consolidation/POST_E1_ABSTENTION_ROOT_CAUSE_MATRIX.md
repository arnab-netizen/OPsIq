# POST-E1 ABSTENTION ROOT-CAUSE MATRIX

**Mode:** capability bottleneck analysis — documentation only. No code/safety-gate/
threshold/answer-key change. **Date:** 2026-06-17 ·
**Branch:** `claude/stage-a-unproven-assumption-ecr0dm`. **Not a Stage A pass claim.**
Source: `18_abstention_decision_e1.json` ×50, `01_case_input.json`, causal/constraint
signals, `diagnosis-engine.ts`, E1 report.

---

## 1. CLASSIFICATION OF THE 49 ABSTAINED CASES (post-E1)

| Cause | Count |
|---|---|
| `INSUFFICIENT_MODEL_COVERAGE` | **44** |
| `FINANCIAL_COMMIT_HELD_BY_OFF_ARCHETYPE_EVIDENCE` | 2 (RW-003, RW-006) |
| `COMMITTED_BUT_CAUSAL_CHALLENGE_FAILED` | 2 (RW-001, RW-005) |
| `TRUE_INSUFFICIENT_EVIDENCE` | 1 (RW-004) |
| `COMMITTED_BUT_CONSTRAINT_UNSAFE` | 0 |
| `OTHER` | 0 |

(The 1 proceed is RW-002.)

## 2. THE DOMINANT CAUSE IS A BENCHMARK-DATA LIMIT, NOT ARCHETYPE COVERAGE

Of the **44 `INSUFFICIENT_MODEL_COVERAGE`** cases:
- **41 are fully-generic placeholders** — every evidence finding is literally
  "Business facing performance challenge per case definition" (ADV-*, PD-002..010,
  SYN-*, RW-007..015, BLND-002..005). **No archetype (E2–E6) can diagnose these** —
  there is no real evidence content. They are a **benchmark evidence-quality
  defect**, not a model gap.
- **3 have real evidence content** an archetype could engage:
  - **ADV-004** — financial + market + "Founder is the main rainmaker" → **key-person (E5)**.
  - **BLND-001** — contribution +$36 (healthy), flat growth, peak-capacity → unit
    economics is **positive** (correctly should not commit a *distress* diagnosis;
    needs a calculation/advisory, not an archetype).
  - **PD-001** — fixed $20k, price $12, var $7 → breakeven calc, **positive**
    contribution (advisory, not distress).

## 3. THE 4 COMMITTED-BUT-HELD CASES — THE HOLD IS CORRECT

| Case | Diagnosis | Hold reason | Off-archetype/out-of-model driver | Resolving archetype | Should it proceed? |
|---|---|---|---|---|---|
| RW-001 (Domino's) | quality_control_failure | CONFLICTING_SIGNALS (adverse off-archetype) | market_position (brand/marketing) | market/GTM (E4) | **No** — monitor flagged hallucination; multi-cause |
| RW-003 (Starbucks) | margin_erosion | CONFLICTING_SIGNALS | operational/over-expansion | strategic/capex (E5) | **No** — true cause is strategic over-expansion; margin is a symptom |
| RW-005 (Peloton) | customer_retention_erosion | OUTSIDE_VALID_SCOPE (out-of-model cause) | strategic capex in problem text | strategic-capex (E5) | **Only with a safe stage-gate action**; danger rules must still guard |
| RW-006 | margin_erosion | CONFLICTING_SIGNALS | operational/retail decline | operational + multi-domain | **No** — multi-cause; margin alone is partial |

**Key insight:** all 4 holds are driven by **genuine multi-domain evidence** — the
case has a real cause in a dimension *other than* the one diagnosed. The gate is
correctly refusing a single-archetype answer to a multi-cause problem. Converting
these to *safe proceeds* requires **multi-domain synthesis** (rank a primary cause
and treat others as secondary), not merely one more archetype — and doing it by
relaxing the gate is forbidden.

## 4. DIMENSIONS THAT TRIGGERED THE SAFETY HOLD
- RW-001: `market_position` adverse, ignored by quality archetype.
- RW-003 / RW-006: operational/retail decline adverse, ignored by margin archetype.
- RW-005: capital-allocation cause cited in `businessProblem` (out-of-model).

## 5. WHICH CASES COULD PROCEED SAFELY IF AN ARCHETYPE EXISTED
- **RW-005** → with a **strategic-capex archetype (E5)** producing a *reversible
  stage-gate* first action, it could become a correct, safely-actioned diagnosis
  (still subject to danger/irreversibility checks). **Best single candidate (~1).**
- **ADV-004** → with **key-person (E5)**, could commit a key-person diagnosis; but
  its other dimensions (valuation/market) may still trigger a hold.
- RW-001, RW-003, RW-006 → would need **multi-domain synthesis**, not a single
  archetype, to proceed safely; otherwise they should remain held.

## 6. WHICH CASES SHOULD CONTINUE TO ABSTAIN EVEN AFTER MORE ARCHETYPES
- **41 placeholder cases** — undiagnosable until the benchmark carries real
  evidence. No archetype helps.
- **RW-004** — true insufficient evidence.
- **RW-001, RW-003, RW-006** — multi-cause; abstaining (escalate to human) is the
  safe and arguably correct outcome until multi-domain synthesis exists.
- **BLND-001, PD-001** — positive economics; should get an advisory/calculation,
  not a distress diagnosis (and must not be forced into a "failure" archetype).

---

## 7. BOTTOM LINE
The post-E1 proceed rate (1/50) is **not** primarily limited by missing
archetypes. It is limited by: (a) **41/49 placeholder cases** (benchmark
evidence-quality defect — no archetype can help), and (b) **4 legitimately-held
multi-domain commits** (the hold is correct; safe conversion needs multi-domain
synthesis, not a single new archetype). **No single E2–E6 slice yields a material
safe-proceed gain on Round 1.** See `POST_E1_NEXT_SLICE_DECISION.md`.
