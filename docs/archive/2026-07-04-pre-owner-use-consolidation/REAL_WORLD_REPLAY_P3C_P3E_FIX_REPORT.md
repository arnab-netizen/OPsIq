# Real-World Replay — P3-C / P3-E Artificial Abstention Fix Report

## Summary

Fixed two classes of artificial abstention in the diagnosis engine:

**P3-C (DEBT_SOLVENCY_STRICT_CORROBORATION):** Four cases — ILFS, Jet Airways, RCOM, Vodafone Idea — where plain-language debt/solvency distress phrasing did not match the strict corroboration gate in `fin_isDebtSolvency`.

**P3-E (Kingfisher salary-arrears miss):** "salary arrears" / "wage arrears" / "payroll arrears" were absent from `LIQUIDITY_HARD`, so Kingfisher-style cash distress evidence failed to trigger `cash_liquidity_crisis`.

---

## Files Changed

### `src/services/consulting-engine/diagnosis-engine.ts`

**LIQUIDITY_HARD** extended with three new hard-trigger phrases (ILFS asset-liability mismatch, active default; Kingfisher salary arrears):

```
active default | asset.?liability mismatch | salary arrears | wage arrears | payroll arrears
```

**DEBT_TEXT** extended with two self-corroborating debt-structural terms (Jet Airways):

```
debt[- ]laden | obligation.*unpaid
```

**`fin_isDebtSolvency` corroboration regex** extended with four unambiguous debt-distress corroborators (RCOM acute solvency, Vodafone cannot service, Jet self-corroboration):

```
acute solvency | solvency.*acute | cannot service | debt[- ]laden | obligation.*unpaid
```

### `src/__tests__/services/diagnosis-p3c-p3e-debt-liquidity.test.ts` (NEW)

26 tests covering:
- P3-C RCOM/Vodafone: `acute solvency`, `solvency.*acute`, `cannot service` corroboration
- P3-C Jet Airways: `debt-laden`, `obligation.*unpaid` (with and without hyphen)
- P3-C ILFS: `active default`, `asset-liability mismatch` (with and without hyphen)
- P3-E Kingfisher: `salary arrears`, `wage arrears`, `payroll arrears`
- Boundary guards: weak phrases (`debt pressure`, `financial concern`, `liquidity issue`, `market challenge`, `cannot service customers`, `asset and liability`, `obligation` without `unpaid`) do NOT fire
- Wrong dimension guard: `salary arrears` in `process_maturity` dim does NOT fire
- Scope-gap preservation: BlackBerry/Nokia-style and turnaround-style evidence unchanged
- Existing path preservation: numeric leverageRatio, `out of cash`, `insolven` all fire unchanged

---

## Test Results

| Test suite | Tests | Status |
|---|---|---|
| `diagnosis-p3c-p3e-debt-liquidity.test.ts` (new) | 26 / 26 | PASS |
| `causal-challenge-p3a-p3b.test.ts` (regression) | 18 / 18 | PASS |
| `diagnosis-legal-governance-textual.test.ts` (regression) | 18 / 18 | PASS |
| `causal-challenge-legal-governance-cooccurrence.test.ts` (regression) | 9 / 9 | PASS |
| **Total** | **71 / 71** | **PASS** |

`tsc --noEmit`: 0 errors  
`prisma validate`: schema valid

---

## Historical Harness Results (42 cases)

| Metric | Before P3-C/P3-E | After P3-C/P3-E |
|---|---|---|
| Safety | 100% | 100% |
| OPSIQ_WORSE | 0 | 0 |
| OPSIQ_BETTER | 6 | 7 |
| OPSIQ_MATCHED | 36 | 35 |
| historical_alignment | — | 47.6% |

**Cases improved (abstain → proceed, correct diagnosis):**
- `RW_INDIA_VODAFONE_IDEA_2020_AGR_STRESS` — now OPSIQ_BETTER (previously OPSIQ_MATCHED)
- `RW_INDIA_ILFS_2018_LIQUIDITY_DEFAULT` — diagnosis now fires `cash_liquidity_crisis`
- `RW_INDIA_JET_AIRWAYS_2019_INSOLVENCY` — diagnosis now fires `debt_solvency_pressure`
- `RW_INDIA_RCOM_2017_2019_TELECOM_DEBT_COLLAPSE` — diagnosis now fires `debt_solvency_pressure`
- `RW_INDIA_KINGFISHER_2012_COLLAPSE` — diagnosis now fires `cash_liquidity_crisis`

**Cases worsened:** 0  
**Unsafe:** 0  
**Dangerous (OPSIQ_WORSE):** 0

---

## Vocabulary Design

All new terms are **surgical** — each targets a specific real-world phrasing pattern:

| Term | Source pattern | Class |
|---|---|---|
| `active default` | ILFS group defaults on NCDs/CPs | LIQUIDITY_HARD (self-sufficient) |
| `asset.?liability mismatch` | ILFS structural mismatch narrative | LIQUIDITY_HARD (self-sufficient) |
| `salary arrears` / `wage arrears` / `payroll arrears` | Kingfisher employee payment failure | LIQUIDITY_HARD (self-sufficient) |
| `debt[- ]laden` | Jet Airways / general collapse narratives | DEBT_TEXT + self-corroborating |
| `obligation.*unpaid` | Jet Airways creditor narrative | DEBT_TEXT + self-corroborating |
| `acute solvency` / `solvency.*acute` | RCOM/Vodafone analyst language | Corroboration extension only |
| `cannot service` | Vodafone AGR obligations narrative | Corroboration extension only |

**Boundary discipline maintained:** None of the new terms are vague. `cannot service` requires a prior DEBT_TEXT hit to function as corroboration. `obligation.*unpaid` requires the full pattern. `asset.?liability mismatch` requires "mismatch" — "asset and liability" alone does not match.

---

## Guards Confirmed

- `debt pressure` alone — does NOT fire
- `financial concern` alone — does NOT fire  
- `liquidity issue` alone — does NOT fire  
- `market challenge` in market_position dim — does NOT fire  
- `cannot service customers` (staffing context) — does NOT fire
- `asset and liability` without `mismatch` — does NOT fire
- `obligation` without `unpaid` — does NOT fire
- `salary arrears` in `process_maturity` dimension — does NOT fire

---

## Scope-gap Cases Unchanged

All legitimate abstentions preserved:
- BlackBerry (competitive disruption) — unchanged
- Nokia (smartphone platform shift) — unchanged
- Apple/IBM/Starbucks/JCPenney turnarounds — unchanged

---

## Constraints Honored

- grounding_class remains REAL_SOURCE_BACKED
- outcome.json never passed to engine
- No case files modified
- No outcome files modified
- No scorer modified
- No safety gates weakened
- No thresholds lowered globally
- unsafe = 0
- dangerous (OPSIQ_WORSE) = 0
- P3-D (CCD key-person/debt miss) — NOT touched
- P3-F (Sears) — NOT touched
- P3-G (Enron) — NOT touched
- P3-H (Yes Bank) — NOT touched
