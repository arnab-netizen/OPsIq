# R5 SLICE 1 — FINANCIAL ARCHETYPES (debt / working-capital / pricing) VALIDATION REPORT

**Mode:** R5 slice 1 only — adds exactly three diagnosis archetypes
(`debt_solvency_pressure`, `working_capital_stress`, `pricing_power`). No other
archetypes (no legal/key-person/capex/demand/GTM/inventory). No answer-key change,
no scorer-axis/threshold change, no safety-gate logic/threshold change. The new
triggers use ONLY runtime evidence (no case ids, benchmark labels, hidden keys, or
answer-key text). **Not a Stage A pass claim. Stage A remains DO_NOT_PROMOTE /
BLOCKED.** **Branch:** `claude/stage-a-unproven-assumption-ecr0dm`.

## 1. WHAT CHANGED

- **`DiagnosisType`** (`types.ts`): +3 enum values (`debt_solvency_pressure`,
  `working_capital_stress`, `pricing_power`).
- **`diagnosis-engine.ts`**: +3 `rootCausePatterns` with strict trigger helpers:
  - **debt** fires only on debt-structural vocab (covenant/leverage/interest-cover/
    refinancing/maturity/debt-service) **with** a structural numeric or covenant/
    maturity phrase — generic cash pressure does NOT fire.
  - **working-capital** fires only on AR/AP/CCC vocab **with** a DSO / cash-conversion
    / (receivables+payables) numeric — generic "collections slowed" / inventory-only
    does NOT fire.
  - **pricing** fires only on adverse pricing vocab (priced-below-competitors /
    self-inflicted discounting / discount leakage / price-realization gap) in
    market_position|process_maturity — generic revenue/margin decline and pricing-
    "headroom" opportunity framing do NOT fire.
- **`causal-adjudication.ts`**: the debt/WC/pricing drivers' `covered` field now
  points to the new archetypes, so the R2 adjudicator **re-ranks** a surface symptom
  to the real covered driver (instead of abstaining) when that archetype is a
  candidate — preserving R2 (it still abstains when the driver did not independently
  match, e.g. on still-uncovered causes).
- **`intervention-design-engine.ts`**: +3 verify-first, low-cost, reversible,
  owner-safe templates (covenant/debt-service model + lender plan; cash-conversion-
  cycle map + collections plan; price-realization/discount-leakage analysis).
- **Metadata-only registrations (NOT logic/threshold changes):**
  - `causal-challenge.ts` `ARCHETYPE_DIMENSIONS`: +3 home-dimension entries. The file
    itself documents this table as "archetype metadata — NOT a gate threshold or
    rule change"; E1 registered its three financial archetypes the same way. Without
    it the gate would treat a new archetype as having no home dimension and always
    challenge it. No abstention rule, threshold, or scalar mapping changed.
  - `round2-scorer.ts` `COVERED_DIAGNOSES`: +3 entries so the scorer recognizes
    archetypes the engine can now emit. Without it the scorer would mis-score a
    now-correct diagnosis as a false root cause. No scoring axis, denominator, or
    threshold changed.

## 2. TESTS

- **R5 slice-1 unit tests** `src/__tests__/services/r5-financial-archetypes.test.ts`
  — 14/14 (via the real `diagnoseRootCause`): covenant-breach → debt; leverage +
  maturity wall → debt; generic cash runway does NOT become debt; DSO + CCC → WC;
  inventory-only does NOT trigger WC; inventory + DSO/CCC → WC; under-pricing/discount
  → pricing; generic margin decline does NOT trigger pricing; generic revenue decline
  does NOT trigger pricing; pricing-headroom framing does NOT trigger pricing; valid
  cash/margin still pass; FRC-01 re-attributes to debt.
- Two pre-existing tests that asserted the OLD "debt is uncovered → abstain/false-
  root-cause" behavior were updated to the new correct behavior (debt re-ranks to
  `debt_solvency_pressure`) / to a still-uncovered example (`key_person_risk`). The
  scorer and adjudicator LOGIC are unchanged — only the example fixtures.
- **Full regression sweep green:** 242 tests across 19 files (R0–R4 suites,
  governance + adversarial + scenario-engine + diagnosis consumers). Intake
  validator 103/103. tsc clean (only pre-existing run-case.ts:149); prisma valid.

## 3. FULL 103-CASE RETRIAL — R3 vs R5 SLICE 1

New frozen retrial: `simulation_runs/round_002_retrial_r5_slice1_financial_archetypes/`
(R0/R1/R2/R3/R4 retrials preserved untouched).

| Metric | R3 (before) | R5 slice 1 (after) | Δ |
|---|---|---|---|
| **over_abstention** | 53 | **39** | **−14** |
| Diagnosis pass rate | 96.1% (99) | 96.1% (99) | 0 (composition: 18 honest-abstains → correct diagnoses) |
| First-action pass rate | 46.6% (48) | **52.4% (54)** | **+6** |
| Safety-outcome pass rate | 47.6% (49) | **61.2% (63)** | **+14** |
| correct_diagnosis_wrong_action | 15 | 26 | +11 (newly-proceeding cases, see §4) |
| unsafe_proceed | 1 | 1 | 0 |
| dangerous_proceed | 1 | 1 | 0 |
| false_root_cause | 0 | 0 | 0 |
| wrong_priority | 1 | 1 | 0 |
| Evidence-use (committed) | 44 | 62 | +18 committed |
| Coverage class split | 47 / 43 / 13 | **65 / 25 / 13** (COMMIT_COVERED / UNCOVERED / ABSTAIN) | +18 covered |

### New archetype diagnoses emitted
`debt_solvency_pressure` ×7, `working_capital_stress` ×6, `pricing_power` ×5 (18).

## 4. CASES — IMPROVED, NEW PROCEEDS, REGRESSIONS

- **18 cases newly commit a diagnosis, ALL with the CORRECT diagnosis (18/18):**
  debt — ADV-04, D12-S01/S02, FRC-01, MK-03, PC-04, PC-07; working-capital —
  D11-S01/S02, FRC-10, MK-04, MK-06, MK-09; pricing — D04-S01/S02, FRC-05/06/13.
- **New proceeds (15):** D04-S01/S02, D11-S01/S02, D12-S01/S02, FRC-01, FRC-05,
  FRC-13, MK-03, MK-04, MK-06, MK-09, PC-04 — each now PROCEEDS with the correct
  diagnosis and a low-cost diagnostic first action (this is the −14 over-abstention).
- **Correctly NOT newly proceeding (3 diagnose correctly but stay gate-abstained):**
  - **ADV-04** (adversarial, expected ABSTAIN) → diagnoses debt but the gate
    correctly **abstains** (its off-archetype "worsens" operational evidence held it).
    **No unsafe proceed created.**
  - **FRC-10** ("insolven" in the problem) and **PC-07** ("seasonal") → the frozen
    gate's out-of-model check abstains on the problem text. They now diagnose
    correctly but stay over-abstained (a residual the gate, not this slice, owns).
- **Regressions: 0** — verified per-case across all six axes: NO case went PASS→FAIL
  on diagnosis, evidence-use, first-action, constraint-fit, safety, or abstention.
  No diagnosis flips among already-committed cases. All prior valid archetypes
  (cash/margin/unit-econ/retention/quality/bottleneck) unchanged.
- **New unsafe proceeds: NONE.** `unsafe_proceed` and `dangerous_proceed` remain
  exactly `{DC-01}` — the new archetypes introduced zero new unsafe/dangerous proceeds.
- **correct_diagnosis_wrong_action +11** is NOT a regression: these are newly-
  proceeding cases (previously gave NO action) whose correct diagnosis now ships a
  reasonable low-cost diagnostic first action that does not lexically match every
  documented acceptable phrasing. Net first-action still improved (+6); the residual
  is later first-action polish, not a regression.

## 5. SAFETY & SCOPE CONFIRMATION

- R2 causal adjudication preserved: the new archetypes do NOT become decoys — they
  re-rank only when their strict trigger fires, and still abstain on still-uncovered
  causes (false_root_cause stays 0).
- Only the three authorized archetypes were added; no legal/key-person/capex/demand/
  GTM/inventory.
- The safety gate's abstention logic and thresholds are unchanged; the adversarial
  case (ADV-04) is still correctly held; no new unsafe proceeds.

**Conclusion:** R5 slice 1 cut safe over-abstention **53 → 39** and lifted safety
**47.6% → 61.2%** and first-action **46.6% → 52.4%** by adding three strictly-triggered
financial archetypes that diagnose 18 previously-abstained cases correctly — with
**zero regressions and zero new unsafe proceeds.** Stage A remains DO_NOT_PROMOTE /
BLOCKED.
