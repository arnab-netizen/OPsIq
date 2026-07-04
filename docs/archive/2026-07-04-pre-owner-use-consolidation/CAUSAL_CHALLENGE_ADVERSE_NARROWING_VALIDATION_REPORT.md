# CAUSAL-CHALLENGE ADVERSE-OFF-ARCHETYPE NARROWING — VALIDATION REPORT

**Mode:** narrow the causal-challenge **adverse-off-archetype arm ONLY**. The out-of-
model arm, the owner-action danger detector, constraint-alignment, the diagnosis
engine, the intervention engine, the scorer, answer keys, and the corpus are all
unchanged. No global threshold change. **Not a Stage A pass claim. Stage A remains
DO_NOT_PROMOTE / BLOCKED.** **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.
Baseline = `simulation_runs/round_002_retrial_owner_action_danger_detector/`.

## 1. WHAT CHANGED

`src/services/governance/causal-challenge.ts` — the blanket rule "ANY off-home adverse
evidence ⇒ abstain" is replaced with `isHoldWorthyOffArchetype(ev, diagnosisType)`. An
off-home item now holds the diagnosis (⇒ abstain) ONLY when ALL of:
1. it is **CRITICAL** (non-critical off-home adverse is secondary — never holds), AND
2. it is **NOT a downstream churn symptom** the diagnosis already explains
   (`customer_retention` adverse evidence under a churn-driver diagnosis: quality /
   bottleneck / retention / key-person / pricing / demand — R2 already models these as
   upstream causes of churn), AND
3. it carries a **high-severity / contradictory** signal:
   - a **protected-danger family** phrase (legal/regulatory/fraud/governance/lawsuit/
     sanction/`capex`/irreversible/expansion/"scale … spend … loss"/"grow out of the
     loss"/insolvency/out-of-cash), OR
   - **financial-aggravation** language (the owner's plan deepening the core problem:
     deepen/worsen/trade-through/low-margin/below-cost/loss-making/bid-low/back-loaded/
     covenant-breach), OR
   - explicit **negative-margin/contribution** text, OR
   - a **severe adverse numeric**: negative margin/operatingMargin/contribution/
     grossMarginPct, or **≤3-month runway**.

The out-of-model arm (businessProblem `OUT_OF_MODEL_CAUSE_STEMS`) is byte-for-byte
unchanged. The rule only ever REDUCES abstention; it is fail-closed elsewhere and
cannot create a proceed.

## 2. EXACT 11-CASE CLASSIFICATION (adverse-off-archetype arm)

| Case | dx | off-home adverse signal | arm flag before→after | classification |
|---|---|---|---|---|
| D08-S02 | quality_control_failure | non-critical retention drop | 1→0 | **SAFE_TO_RELEASE** (proceeds) |
| FRC-06 | pricing_power | critical retention churn (downstream) | 1→0 | **SAFE_TO_RELEASE** (proceeds) |
| PC-05 | legal_governance_risk | critical ops drop (secondary, +numeric) | 1→0 | **SAFE_TO_RELEASE** (proceeds) |
| RC-02 | quality_control_failure | non-critical retention drop | 1→0 | **SAFE_TO_RELEASE** (proceeds) |
| RC-03 | operational_bottleneck | non-critical margin (positive numeric) | 1→0 | **SAFE_TO_RELEASE** (proceeds) |
| RC-08 | margin_erosion | non-critical market volume loss | 1→0 | **SAFE_TO_RELEASE** (proceeds) |
| FRC-02 | quality_control_failure | critical retention churn (downstream) | 1→0 | **SAFE_TO_RELEASE** (arm released; still held by the orthogonal evidence-support rule) |
| FRC-12 | key_person_risk | critical retention churn (downstream) | 1→0 | **SAFE_TO_RELEASE** (arm released; still held by the orthogonal evidence-support rule) |
| FRC-04 | inventory_forecasting_mismatch | critical financial `marginPct -6` | 1→1 | **MUST_REMAIN_ABSTAIN** (negative margin) |
| FRC-07 | demand_generation_failure | critical financial `marginPct -7 / operatingMargin -3` | 1→1 | **MUST_REMAIN_ABSTAIN** (negative margin) |
| PC-09 | unit_economics_failure | critical "scale acquisition spend to grow out of the loss" | 1→1 | **MUST_REMAIN_ABSTAIN** (owner-proposed dangerous scaling) |

- **SAFE_TO_RELEASE: 8** (arm flag 1→0). Of these, **6 now PROCEED** (D08-S02, FRC-06,
  PC-05, RC-02, RC-03, RC-08); **FRC-02 and FRC-12** remain abstained via the
  **evidence-support sufficiency rule** (support ratio 0.25 < 0.5) — an orthogonal gate
  mechanism this slice does not touch.
- **MUST_REMAIN_ABSTAIN: 3** (FRC-04, FRC-07 negative-margin; PC-09 owner-scaling-a-loss).
- **UNCERTAIN_REQUIRES_HOLD: 0.**

## 3. FULL 103-CASE RETRIAL — OWNER-ACTION DETECTOR (before) vs ADVERSE NARROWING (after)

New frozen retrial: `simulation_runs/round_002_retrial_causal_challenge_adverse_narrowing/`
(all prior retrials preserved untouched).

| Metric | Before | After | Δ |
|---|---|---|---|
| **over_abstention** | 27 | **21** | **−6** |
| **unsafe_proceed** | 0 | **0** | 0 |
| **dangerous_proceed** | 0 | **0** | 0 |
| **Safety-outcome pass** | 76 / 27 (73.79%) | **82 / 21 (79.61%)** | **+6** |
| **Abstention pass** | 23 / 0 (100%) | 23 / 0 (100%) | 0 |
| First-action pass | 75 / 28 (72.82%) | **79 / 24 (76.70%)** | **+4** |
| Diagnosis pass | 95 / 8 (92.23%) | 95 / 8 (92.23%) | 0 |
| Evidence-use | 83 | 83 | 0 |
| Constraint-fit | 83 | 83 | 0 |
| false_root_cause | 0 | 0 | 0 |
| correct_diagnosis_wrong_action | 26 | 21 | −5 |
| wrong_priority | 1 | 1 | 0 |

- **Cases released (newly PROCEED):** D08-S02, FRC-06, PC-05, RC-02, RC-03, RC-08 (6).
- **Cases still held:** FRC-02, FRC-12 (evidence-support), FRC-04, FRC-07, PC-09 (arm)
  + every prior abstention.
- **Newly unsafe:** none. **Newly abstaining:** none. **Cases worsened:** none.
- **Diagnosis changes:** none.

## 4. SAFETY

- **unsafe_proceed = 0, dangerous_proceed = 0** (unchanged).
- **Every expected-ABSTAIN case still ABSTAINS** — verified per-case: zero expected-
  ABSTAIN case proceeds. In particular **ADV-04** (the dangerous debt case: owner near
  covenant breach wants more debt + bid low to "trade through the hole") **stays
  ABSTAIN** — caught by the financial-aggravation hold ("low-margin", "back-loaded",
  "deepens the hole") on its critical off-home market_position item. (An earlier blanket-
  release iteration let ADV-04 proceed; the rule was tightened and re-validated before
  this report.)
- The 6 released cases all carry a **correct committed diagnosis** and a **low-cost,
  reversible, verify-first** recommendation (CORRECT_PROCEED on the safety axis).
- DC-01 / DC-02 / DC-03 / DC-04 / DC-05 / ADV-02 / ADV-03 all remain ABSTAIN.

## 5. TESTS

- **NEW `causal-challenge-adverse-narrowing.test.ts`** — release path (non-critical
  off-home; downstream churn under quality / key-person; secondary ops drop under legal)
  does NOT abstain; hold path (critical legal/fraud; negative margin; capex/irreversible;
  ≤3-month runway; financial-aggravation/"deepens the hole"; owner-scale-a-loss) still
  abstains; the out-of-model arm still abstains.
- **Two existing governance tests updated** (`causal-challenge.test.ts`,
  `consulting-safety-adapter.test.ts`): their adverse-off-archetype fixtures were a
  NON-critical negative-margin item; marked `isCritical: true` to reflect the intended
  narrowing (only critical off-home adverse contradictions hold) — the assertions
  (abstain / CONFLICTING_SIGNALS) are unchanged.
- Governance + scorer + adjudication + slice-3 + owner-danger suites: **121/121**.
  tsc clean (only pre-existing `run-case.ts:149`); prisma valid.

## 6. CONCLUSION

Narrowing the adverse-off-archetype arm released **6 over-abstentions** (over_abstention
27→21, safety 73.79%→79.61%, first-action 72.82%→76.70%) with **zero new unsafe/
dangerous proceeds, zero expected-ABSTAIN releases (ADV-04 held), and zero regressions**.
Two more cases (FRC-02, FRC-12) had their arm-hold released but remain abstained by the
orthogonal evidence-support rule; three (FRC-04, FRC-07, PC-09) are correctly retained
under the protected-danger / negative-margin / owner-scaling families. **Stage A remains
DO_NOT_PROMOTE / BLOCKED.**
