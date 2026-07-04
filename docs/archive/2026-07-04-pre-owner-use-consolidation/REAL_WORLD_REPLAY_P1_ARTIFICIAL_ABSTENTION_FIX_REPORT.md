# Real-World Replay P1 Artificial Abstention Fix Report

**Date:** 2026-06-20  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Defect class:** CAUSAL_CHALLENGE_OVER_BROAD  
**Scope:** Fix P1 abstentions only — no other defect class touched

---

## P1 Cases (All 7 Fixed)

| Case ID | Engine Diagnosis | Off-Archetype Trigger | PROTECTED Term | Now |
|---------|-----------------|----------------------|----------------|-----|
| RW_CHINA_EVERGRANDE_2021_DEBT_CRISIS | cash_liquidity_crisis | market_position (raw "market") | `regulat` | PROCEEDED |
| RW_INDIA_COX_KINGS_2019_DEBT_DEFAULT | debt_solvency_pressure | process_maturity (raw "governance") | `governance` | PROCEEDED |
| RW_INDIA_DHFL_2019_NBFC_INSOLVENCY | debt_solvency_pressure | process_maturity + outOfModel | `governance`/`regulat` + legal domain | PROCEEDED |
| RW_INDIA_GO_FIRST_2023_INSOLVENCY | cash_liquidity_crisis | process_maturity (raw "governance") | `insolven` | PROCEEDED |
| RW_INDIA_SUPERTECH_2022_HOMEBUYER_INSOLVENCY | cash_liquidity_crisis | financial_health as off-archetype (raw "finance") | `insolven` | PROCEEDED |
| RW_UK_PATISSERIE_VALERIE_2018_ACCOUNTING_BLACK_HOLE | debt_solvency_pressure | process_maturity (raw "Fraud risk") | `\bfraud\b` | PROCEEDED |
| RW_UK_THOMAS_COOK_2019_COLLAPSE | cash_liquidity_crisis | process_maturity (raw "Consumer-protection obligations") | `regulat` | PROCEEDED |

---

## Root Cause (P1)

Two interacting defects:

**Defect A — `isHoldWorthyOffArchetype` too broad for financial-distress diagnoses:**

`PROTECTED_OFF_ARCHETYPE` contains governance/regulatory/fraud/insolvency terms (`governance|regulat|complian|\bfraud\b|misconduct|sanction|consent order|insolven|out of cash|cannot make payroll|missed payroll`) that, for committed financial-distress diagnoses, describe EXPECTED CO-OCCURRENCE with the financial crisis, not contradictions of it. Regulatory scrutiny, insolvency proceedings, governance concerns, and fraud allegations routinely accompany corporate cash/debt crises without contradicting the financial diagnosis.

**Defect B — `outOfModelCauseInProblem` too broad for DHFL (legal domain not subsumed):**

`DIAGNOSIS_SUBSUMES_DOMAIN` for `debt_solvency_pressure` only subsumed the `liquidity` domain. A businessProblem mentioning "regulatory intervention" (as a consequence to avoid) triggered the `legal` domain check, which was not subsumed, firing `outOfModelCauseInProblem`. Regulatory proceedings are an expected consequence of financial distress, not an out-of-model primary cause that contradicts a committed debt diagnosis.

---

## Files Changed

### `src/services/governance/causal-challenge.ts`

**Change 1 — Add `PROTECTED_STRUCTURAL_COMMITMENT` regex:**  
Extracts the structural-commitment subset of `PROTECTED_OFF_ARCHETYPE` (capex/irreversible/expansion/scale-spend terms) that represent genuinely dangerous irreversible actions regardless of diagnosis type.

**Change 2 — Add `FINANCIAL_DISTRESS_DIAGNOSES` set:**  
`{"cash_liquidity_crisis", "debt_solvency_pressure", "working_capital_stress"}` — financial diagnoses for which governance/regulatory co-occurrence is expected.

**Change 3 — Narrow `isHoldWorthyOffArchetype` bypass:**  
Inside the `PROTECTED_OFF_ARCHETYPE` branch: for committed financial-distress diagnoses, the PROTECTED hold is bypassed UNLESS:
- The matching term is a structural-commitment term (`PROTECTED_STRUCTURAL_COMMITMENT`) — these always hold, or
- The evidence has non-empty `supportingData` (numeric corroboration) — quantified governance findings retain the full hold

**Change 4 — Update `DIAGNOSIS_SUBSUMES_DOMAIN`:**  
`cash_liquidity_crisis` and `debt_solvency_pressure` now subsume the `legal` domain (in addition to `liquidity`). Regulatory/legal proceedings mentioned in the businessProblem are expected co-occurrences of financial distress, not out-of-model primary causes for these diagnoses.

### `src/__tests__/services/causal-challenge-financial-distress-cooccurrence.test.ts` (new)

22 new tests covering:
- 6 P1 historical false-positives: adverseOff no longer holds for financial-distress + governance/regulatory/fraud/insolvency evidence without numeric corroboration
- 2 outOfModel bypass tests: legal domain subsumed by financial-distress diagnoses
- 2 structural-commitment tests: capex/irreversible always holds
- 1 financial-aggravation still holds (AGGRAVATION_OFF_ARCHETYPE separate path)
- 1 confirmed fraud with numeric corroboration still holds (supportingData gate)
- 2 fraud-as-primary-cause-in-businessProblem still holds via integrity domain
- 2 wrong diagnosis (margin_erosion) with negative-margin evidence still holds via SEVERE_FINANCIAL_TEXT
- 5 existing adversarial cases still hold (ADV-01, ADV-02, PC-01, PC-11, legal_governance_risk)
- 1 ≤3-month runway numeric still holds

---

## What Still Blocks (Unchanged Safety Behaviors)

| Scenario | Gate | Reason |
|----------|------|--------|
| capex commitment under cash diagnosis | adverseOff STRUCTURAL_COMMITMENT | `\bcapex\b` in PROTECTED_STRUCTURAL_COMMITMENT always holds |
| irreversible facility expansion under cash diagnosis | adverseOff STRUCTURAL_COMMITMENT | `irreversible` always holds |
| confirmed fraud with complianceGapCount numeric | adverseOff PROTECTED | non-empty supportingData bypasses the bypass → full PROTECTED hold |
| fraud/embezzlement as primary cause in businessProblem | outOfModel integrity domain | integrity domain not subsumed by any financial diagnosis |
| negative contribution margin financial-aggravation | adverseOff AGGRAVATION_OFF_ARCHETYPE | separate path, unaffected by bypass |
| negative margin under non-financial-distress diagnosis | adverseOff SEVERE_FINANCIAL_TEXT | SEVERE_FIN fires independently of PROTECTED bypass |
| Suzlon wrong diagnosis (margin_erosion + CDR) | adverseOff SEVERE_FINANCIAL_TEXT | "ebit margin of negative 7%" matches `margin[\w ]*negative` on raw dim "finance" evidence |
| operational diagnosis with thin liquidity runway | outOfModel liquidity domain | liquidity not subsumed by non-financial diagnoses |
| deep discount on negative unit economics | outOfModel / owner_action_danger | independent paths both still apply |

---

## Results Before vs After

| Metric | Before P1 Fix | After P1 Fix |
|--------|--------------|-------------|
| Cases run | 42 | 42 |
| Proceeded (safety gate passed) | 8 | **15** |
| Abstained | 34 | **27** |
| P1 artificial abstentions fixed | 0 | **7/7** |
| Unsafe recommendations | 0 | **0** |
| OPSIQ_WORSE | 0 | **0** |
| OPSIQ_BETTER | 19 | 16 |
| OPSIQ_MATCHED | 23 | 26 |
| Safety score | 100% | **100%** |
| Suzlon (legitimate) still abstains | True | **True** |
| Scope-gap cases (6) still abstain | True | **True** |

Note: OPSIQ_BETTER decreasing from 19→16 and OPSIQ_MATCHED increasing from 23→26 reflects scoring reclassification of cases that were previously ABSTAINED (→ MATCHED) and are now PROCEEDED+MATCHED. No OPSIQ_WORSE movement. All 7 new proceeded P1 cases have `safe=True`.

---

## Tests Run

| Suite | Tests | Result |
|-------|-------|--------|
| causal-challenge-financial-distress-cooccurrence (new) | 22 | ✓ all pass |
| causal-challenge-adverse-narrowing | 12 | ✓ all pass |
| causal-challenge-out-of-model-narrowing | 11 | ✓ all pass |
| causal-challenge (base) | 4 | ✓ all pass |
| TypeScript (tsc --noEmit) | — | ✓ 0 errors |
| Historical harness (42 blind replays) | 42 | ✓ 0 unsafe, 0 OPSIQ_WORSE |

---

## Cases Improved (P1 → Proceed)

1. RW_CHINA_EVERGRANDE_2021_DEBT_CRISIS
2. RW_INDIA_COX_KINGS_2019_DEBT_DEFAULT
3. RW_INDIA_DHFL_2019_NBFC_INSOLVENCY
4. RW_INDIA_GO_FIRST_2023_INSOLVENCY
5. RW_INDIA_SUPERTECH_2022_HOMEBUYER_INSOLVENCY
6. RW_UK_PATISSERIE_VALERIE_2018_ACCOUNTING_BLACK_HOLE
7. RW_UK_THOMAS_COOK_2019_COLLAPSE

## Cases Worsened

**0** — no previously-proceeding case now abstains. No OPSIQ_WORSE.

---

## Safety Gate Changes

**The safety gate thresholds are unchanged.** `assessSafety`, `abstention-engine.ts`, and all confidence cutoffs are unmodified. Only `causal-challenge.ts` was changed: the co-occurrence bypass and subsumed-domain expansion.

## Regressions

**None.** All 49 causal-challenge tests pass (22 new + 27 existing). Historical harness: 0 unsafe recommendations, 0 dangerous (OPSIQ_WORSE) recommendations. Suzlon (LEGITIMATE abstention, wrong diagnosis correctly challenged) still abstains.

---

## Decision

**P1 FIXED.** 7/7 CAUSAL_CHALLENGE_OVER_BROAD cases now proceed. 0 unsafe, 0 dangerous.

## Next Defect Class

**P2: LEGAL_GOVERNANCE_NUMERIC_REQUIRED** — 13 cases where `fin_isLegalGovernance` in `diagnosis-engine.ts` requires `complianceGapCount|regulatoryDeadlineDays|exposureAmount` numeric that no historical case packet provides.
File: `src/services/consulting-engine/diagnosis-engine.ts`
Function: `fin_isLegalGovernance` (~line 771–781)
