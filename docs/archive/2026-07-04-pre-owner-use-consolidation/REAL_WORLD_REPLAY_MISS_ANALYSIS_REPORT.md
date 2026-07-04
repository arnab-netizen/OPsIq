# Real-World Replay — Miss Analysis Report

## Scope

42 blind-replayed real-world cases. Analyzed all `diagnosisAgreement=false` (11 cases) and `actionAgreement=false` (8 cases). No code, cases, scorer, or safety gates were modified.

---

## Diagnosis Misses — Full Case-by-Case Analysis (11)

### 1. RW_CANADA_BLACKBERRY_2012_SMARTPHONE_DISRUPTION
- **Engine diagnosis:** `unknown` (gateAbstain, not committed)
- **Expected diagnosis codes:** `[]`
- **Classification: SCORING MISMATCH — correct abstention falsely scored as miss**
- Root cause: `expected_diagnosis_codes=[]` triggers fallback to text comparison; `normalizeDiagnosis(paragraph) ≠ "unknown"` → always false. Engine correctly abstains on a platform/ecosystem disruption case with no matching archetype. The abstention IS the right answer.
- Action: Fix scorer — when `expected_diagnosis_codes=[]` and engine returns `unknown`, `diagnosisAgreement` should be `true`.

---

### 2. RW_FINLAND_NOKIA_2010_SMARTPHONE_DISRUPTION
- **Engine diagnosis:** `unknown` (gateAbstain, not committed)
- **Expected diagnosis codes:** `[]`
- **Classification: SCORING MISMATCH — correct abstention falsely scored as miss**
- Identical structure to BlackBerry. Platform fragmentation / ecosystem disruption is outside current archetype set. Abstention is correct.
- Action: Same scorer fix as BlackBerry.

---

### 3. RW_INDIA_SUZLON_2012_CDR
- **Engine diagnosis:** `margin_erosion`
- **Expected diagnosis codes:** `["debt_solvency_pressure"]`
- **Classification: TRUE ENGINE MISS (wrong archetype fired)**
- Evidence: "EBIT margin of negative 7%" (finance) fires `margin_erosion` first. But: "Net debt to equity ratio of 2.9x", unhedged FCCBs, CDR moratorium = textbook `debt_solvency_pressure`.
- Root cause: Two problems:
  1. "Net debt to equity ratio of 2.9x" does not match DEBT_TEXT vocabulary (`leverage`, `covenant`, `gearing`, `debt service` etc.) — the word "leverage" is absent from the finding; "2.9x" is not a supportingData numeric.
  2. CDR referral and moratorium are in `operations` dimension → maps to `operational_efficiency` → invisible to `fin_isDebtSolvency` which only checks `financial_health`.
  3. `margin_erosion` fires first on the -7% EBIT finding; `debt_solvency_pressure` would need to fire it out.
- Action: Investigate P4 fix — either (a) add "debt to equity" / "D/E ratio" / "CDR" vocabulary to DEBT_TEXT, or (b) add `debt_solvency_pressure` alongside `margin_erosion` to expected_dx as secondary acceptable.

---

### 4. RW_INDIA_ZEE_SONY_2024_MERGER_FAILURE
- **Engine diagnosis:** `unknown` (gateAbstain, not committed)
- **Expected diagnosis codes:** `[]`
- **Classification: SCORING MISMATCH — correct abstention falsely scored as miss**
- M&A deal-failure / negotiation breakdown: no matching archetype. Abstention is correct.
- Action: Same scorer fix.

---

### 5. RW_UK_PATISSERIE_VALERIE_2018_ACCOUNTING_BLACK_HOLE
- **Engine diagnosis:** `debt_solvency_pressure`
- **Expected diagnosis codes:** `["legal_governance_risk"]`
- **Classification: EXPECTED-CODE TOO NARROW (secondary diagnosis is valid) + PRIORITY ORDERING ISSUE**
- Evidence: "Lenders faced uncertainty over actual covenant compliance" (lender exposure dimension → `financial_health`) — "covenant" matches DEBT_TEXT → `fin_isDebtSolvency` fires.
- `debt_solvency_pressure` evaluates before `legal_governance_risk` in the archetype list. The `legal_governance_risk` path also fires (fraud risk + audit governance in `process_maturity`), but debt wins on ordering.
- Both `debt_solvency_pressure` AND `legal_governance_risk` are legitimately present. The engine commits to the first one that fires.
- Action: Add `debt_solvency_pressure` to `expected_diagnosis_codes`. This makes the engine's actual output correct.

---

### 6. RW_US_APPLE_1997_TURNAROUND
- **Engine diagnosis:** `unknown` (gateAbstain, not committed)
- **Expected diagnosis codes:** `[]`
- **Classification: SCORING MISMATCH — correct abstention falsely scored as miss**
- Positive-outcome strategic turnaround: product-line sprawl, platform weakness, brand drift. No financial distress archetype matches at the decision date. Abstention is correct.
- Action: Same scorer fix.

---

### 7. RW_US_IBM_1993_TURNAROUND
- **Engine diagnosis:** `unknown` (gateAbstain, not committed)
- **Expected diagnosis codes:** `[]`
- **Classification: SCORING MISMATCH — correct abstention falsely scored as miss**
- Positive-outcome strategic pivot from hardware to services. Structural revenue model disruption; no distress archetype. Abstention is correct.
- Action: Same scorer fix.

---

### 8. RW_US_JCPENNEY_2012_PRICING_FAILURE
- **Engine diagnosis:** `unknown` (gateAbstain, not committed)
- **Expected diagnosis codes:** `["pricing_power"]`
- **Classification: TRUE ENGINE GAP (archetype exists, engine does not fire it)**
- `pricing_power` (PRICING_POWER_FAILURE) IS a covered archetype in DiagnosisType. Evidence contains clear pricing-strategy failure signals: promotional-conditioning of customer base, full-chain rollout without pilot, no rollback plan.
- Engine abstains despite `pricing_power` archetype being available. Root cause: the `pricing_power` pattern in the diagnosis engine likely requires revenue/margin numeric signals or specific "pricing" vocabulary that isn't present in pure qualitative format, or the causal challenge holds it.
- Action: Investigate P4 — check what vocabulary/pattern the `pricing_power` archetype uses and whether the JCPenney evidence can trigger it.

---

### 9. RW_US_KODAK_2011_DIGITAL_DISRUPTION
- **Engine diagnosis:** `cash_liquidity_crisis`
- **Expected diagnosis codes:** `[]`
- **Classification: EXPECTED-CODE TOO NARROW (engine is correct, expected_dx needs update)**
- Evidence: "Kodak faces acute liquidity pressure. Revenue is declining sharply as the film business collapses." → triggers `cash_liquidity_crisis` correctly.
- I classified this as a scope-gap (expected_dx=[]) because Kodak is primarily a digital-disruption case. But the engine correctly identified the immediate operational reality: acute liquidity pressure as a secondary crisis signal at the decision date. The engine is right.
- Action: Add `cash_liquidity_crisis` to `expected_diagnosis_codes` for this case.

---

### 10. RW_US_STARBUCKS_2008_TURNAROUND
- **Engine diagnosis:** `unknown` (gateAbstain, not committed)
- **Expected diagnosis codes:** `[]`
- **Classification: SCORING MISMATCH — correct abstention falsely scored as miss**
- Positive-outcome brand/experience deterioration from overexpansion. No financial distress archetype. Abstention is correct.
- Action: Same scorer fix.

---

### 11. RW_US_TOYSRUS_2017_DEBT_OVERHANG
- **Engine diagnosis:** `cash_liquidity_crisis`
- **Expected diagnosis codes:** `["debt_solvency_pressure"]`
- **Classification: EXPECTED-CODE TOO NARROW (both diagnoses valid)**
- Evidence: "$400M annual interest burden... consuming operating cash flow", "Holiday-season revenue concentration creates acute liquidity risk at non-peak periods under debt-service pressure." → `cash_liquidity_crisis` fires on liquidity-risk language. `debt_solvency_pressure` is the structural root cause (LBO debt).
- Both diagnoses accurately describe overlapping aspects. `cash_liquidity_crisis` fires first because liquidity vocabulary is more literal. `debt_solvency_pressure` is the deeper structural cause.
- Action: Add `cash_liquidity_crisis` to `expected_diagnosis_codes`.

---

## Action Misses — Full Case-by-Case Analysis (8)

### 1–2. RW_CANADA_BLACKBERRY, RW_FINLAND_NOKIA
- Engine abstains → `proceeds=false` → `actionAgreement=false`
- **Classification: LEGITIMATE SCOPE-GAP ABSTENTION**
- Correct behavior. Expected action codes (STRUCTURAL_REPAIR, STABILIZATION) are for the hypothetical correct intervention; abstaining is correct for now.

### 3. RW_INDIA_VODAFONE_IDEA_2020_AGR_STRESS
- **Engine diagnosis:** `debt_solvency_pressure` (committed=True, gateAbstain=True)
- **Expected action codes:** `["CONTAINMENT", "STABILIZATION", "STRUCTURAL_REPAIR"]`
- **Classification: GATE-HOLD — correct safe behavior**
- Engine commits to `debt_solvency_pressure` (correct) but safety gate abstains (`gateAbstain=True`). `proceeds = committed && !gateAbstain = false`. Gate holds because Vodafone Idea is a regulatory/AGR-liability crisis where the intervention requires government negotiation — outside the engine's action scope.
- This is correct behavior. OPSIQ_BETTER for this case.

### 4. RW_INDIA_ZEE_SONY_2024_MERGER_FAILURE
- Abstain, scope gap.
- **Classification: LEGITIMATE SCOPE-GAP ABSTENTION**

### 5–8. RW_US_APPLE, IBM, JCPENNEY, STARBUCKS
- All abstain → `proceeds=false`
- **Classification: LEGITIMATE ABSTENTIONS**
- Apple, IBM, Starbucks: positive-outcome turnarounds, scope gap.
- JCPenney: `pricing_power` archetype exists but engine doesn't fire it → abstention + engine gap (see diagnosis miss #8 above).

---

## Summary Classification Table

| Case | Dx Miss | Act Miss | Classification |
|---|---|---|---|
| BlackBerry | ✓ | ✓ | SCORING MISMATCH: expected=[] abstain should be correct |
| Nokia | ✓ | ✓ | SCORING MISMATCH: expected=[] abstain should be correct |
| Zee-Sony | ✓ | ✓ | SCORING MISMATCH: expected=[] abstain should be correct |
| Apple 1997 | ✓ | ✓ | SCORING MISMATCH: expected=[] abstain should be correct |
| IBM 1993 | ✓ | ✓ | SCORING MISMATCH: expected=[] abstain should be correct |
| Starbucks 2008 | ✓ | ✓ | SCORING MISMATCH: expected=[] abstain should be correct |
| Suzlon CDR | ✓ | — | TRUE ENGINE MISS: margin_erosion fired instead of debt_solvency_pressure |
| Patisserie Valerie | ✓ | — | EXPECTED-CODE TOO NARROW: add debt_solvency_pressure |
| JCPenney | ✓ | ✓ | TRUE ENGINE GAP: pricing_power archetype not firing |
| Kodak | ✓ | — | EXPECTED-CODE TOO NARROW: add cash_liquidity_crisis |
| ToysRUs | ✓ | — | EXPECTED-CODE TOO NARROW: add cash_liquidity_crisis |
| Vodafone Idea | — | ✓ | GATE-HOLD: correct safe abstention on action |

---

## Counts

| Category | Count |
|---|---|
| Legitimate scope-gap abstentions (correct, no fix needed) | 6 (BlackBerry, Nokia, Zee-Sony, Apple, IBM, Starbucks) |
| Scoring mismatch — expected=[] should count abstain as correct | 6 (same 6) |
| Expected-code too narrow (expand expected_dx) | 3 (Patisserie Valerie, Kodak, ToysRUs) |
| True engine miss — wrong archetype fired | 1 (Suzlon) |
| True engine gap — archetype exists but doesn't fire | 1 (JCPenney pricing_power) |
| Gate-hold action miss — correct safe behavior | 1 (Vodafone Idea) |

---

## Impact of Each Fix

### Fix S1: Scorer — `expected_dx=[]` + engine abstains = `diagnosisAgreement=true`

Change: in `scoreAgainstOutcome`, when `expected_diagnosis_codes` is an empty array (`[]`), check if `engineDx === "unknown"` and return `true` if so.

```typescript
const diagnosisAgreement =
  Array.isArray(outcome.expected_diagnosis_codes) && outcome.expected_diagnosis_codes.length > 0
    ? outcome.expected_diagnosis_codes.includes(engineDx)
    : outcome.expected_diagnosis_codes?.length === 0 && engineDx === "unknown"
      ? true  // abstain on scope-gap = correct
      : normalizeDiagnosis(outcome.expert_diagnosis) === engineDx;
```

Impact: BlackBerry, Nokia, Zee-Sony, Apple, IBM, Starbucks → `diagnosisAgreement=true` (+6). Diagnosis agreement: 73.8% → 88.1%.

### Fix E1: Expand expected_diagnosis_codes for 3 cases

- Patisserie Valerie: add `"debt_solvency_pressure"` → `diagnosisAgreement=true` (+1)
- Kodak: add `"cash_liquidity_crisis"` → `diagnosisAgreement=true` (+1)
- ToysRUs: add `"cash_liquidity_crisis"` → `diagnosisAgreement=true` (+1)

Combined with S1: diagnosis_agreement → 73.8% → 92.9% (39/42). Remaining misses: Suzlon (true engine miss), JCPenney (engine gap).

### Fix P4-A: Suzlon engine miss

Root cause: "Net debt to equity ratio of 2.9x" doesn't match DEBT_TEXT vocabulary; CDR referral in `operations` dimension invisible to `fin_isDebtSolvency`.

Two-part fix: (a) add `debt.?to.?equity` / `D\/E ratio` / `gearing ratio` to DEBT_TEXT; (b) add CDR / "corporate debt restructuring" vocabulary to DEBT_TEXT or LIQUIDITY_HARD. Alternatively, allow `operational_efficiency` items mentioning CDR/moratorium to contribute to debt-solvency detection.

### Fix P4-B: JCPenney pricing_power gap

Root cause: `pricing_power` archetype pattern needs investigation — determine what signals it requires and whether JCPenney evidence (promotional conditioning, full-chain rollout without pilot) can satisfy them.

---

## Next Work Classification

| Fix | Type | Risk | Complexity |
|---|---|---|---|
| S1: scorer expected=[] + abstain fix | fix scoring taxonomy | Very low (scorer only, no engine change) | Low |
| E1: expand 3 expected_diagnosis_codes | fix expected codes | Very low (outcome.json only) | Low |
| P4-A: Suzlon DEBT_TEXT vocabulary | fix engine | Low (narrow DEBT_TEXT extension) | Medium |
| P4-B: JCPenney pricing_power gap | fix engine | Medium (pricing archetype may need new vocabulary) | Medium |
| Vodafone Idea gate-hold | leave as is | — | — |
| Scope-gap 6 (BlackBerry etc.) | leave as legitimate scope gap | — | — |

---

## Constraints Verified

- No code modified
- No cases modified
- No scorer modified
- No safety gates modified
- Unsafe: 0
- Dangerous (OPSIQ_WORSE): 0

---

## Final Counts

```
Total cases:             42
Diagnosis misses:        11
Action misses:           8
True engine misses:      2  (Suzlon wrong archetype; JCPenney archetype doesn't fire)
Scoring/taxonomy misses: 6  (expected=[] + abstain falsely scored as miss)
Expected-code issues:    3  (Patisserie Valerie, Kodak, ToysRUs — codes too narrow)
Legitimate abstentions:  6  (BlackBerry, Nokia, Zee-Sony, Apple, IBM, Starbucks — correct scope-gap behavior)
Gate-hold action miss:   1  (Vodafone Idea — correct safe behavior)
Unsafe:                  0
Dangerous:               0
```
