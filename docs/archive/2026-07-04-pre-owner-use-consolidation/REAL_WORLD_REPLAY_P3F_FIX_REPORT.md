# Real-World Replay — P3-F Fix Report: Sears Liquidity-Pressure Vocabulary Mismatch

## Summary

Fixed artificial abstention for `RW_US_SEARS_2018_RETAIL_DECLINE`. The engine returned `unknown` because "Debt and liquidity pressure limiting available investment" did not match any existing liquidity trigger:

- `LIQUIDITY_HARD`: no hard term ("out of cash", "cash crunch", etc.)
- `softDistress(t, LIQUIDITY_TOPIC)`: `LIQUIDITY_TOPIC` matched ("liquidity") but `ADVERSE_FRAMING` did not match ("limiting"/"pressure" absent from adverse-framing vocabulary)

Fix: new `fin_isLiquidityPressurePaired` — fires only when a "liquidity pressure / constrained financial flexibility" phrase is **paired with a distinct corroborating evidence item** showing operational/debt decline.

---

## Target Case

**RW_US_SEARS_2018_RETAIL_DECLINE**

Key evidence (dimension `finance` → `financial_health`):
1. "Q1 2018 comparable store sales down 11.9% year-over-year"
2. "Sears Domestic comparable store sales down 13.4%"
3. "Company using **asset sales** and financial transactions **to fund operations**"
4. "**Debt and liquidity pressure** limiting available investment for operational improvement"

Item 4 has `LIQUIDITY_PRESSURE_PHRASE` ("liquidity pressure"). Item 3 has `LIQUIDITY_CORROBORATOR` ("asset sales", "fund operations"). Pair fires → `cash_liquidity_crisis`.

---

## Files Changed

### `src/services/consulting-engine/diagnosis-engine.ts`

Added three new symbols and wired into archetype:

```typescript
// Explicit "liquidity pressure" or "constrained [capital/financial] flexibility"
const LIQUIDITY_PRESSURE_PHRASE =
  /liquidity pressure|liquidity.*constrain\w*|constrain\w*.*liquidity|limited.*(?:capital|financial) flexib\w*|(?:capital|financial) flexib\w*.*limited|constrain\w*.*(?:capital|financial) flexib\w*/;

// Concrete decline/distress signal — must appear in a SEPARATE item from the pressure phrase
const LIQUIDITY_CORROBORATOR =
  /asset (sale|monetiz)|fund(?:ing)? operations|comparable.*(?:store )?sales.*down|comp\w* sales.*down|revenue.*declin|operating.*declin|debt.*limit|leverage.*constrain/;

function fin_isLiquidityPressurePaired(evidence: EvidenceItem[]): boolean {
  const fh = evidence.filter((e) => e.dimension === "financial_health" && e.isCritical);
  const pressureItems = fh.filter((e) => LIQUIDITY_PRESSURE_PHRASE.test(fin_text(e)));
  if (pressureItems.length === 0) return false;
  // Corroborator must be a DISTINCT item — the pressure finding alone is not enough
  const otherItems = fh.filter((e) => !pressureItems.includes(e));
  return otherItems.some((e) => LIQUIDITY_CORROBORATOR.test(fin_text(e)));
}
```

`Cash / Liquidity Crisis` archetype pattern extended:
```typescript
pattern: (evidence) => evidence.some((e) => fin_isLiquidityCrisis(e)) || fin_isLiquidityPressurePaired(evidence),
```

### `src/__tests__/services/diagnosis-p3f-sears-liquidity-pressure.test.ts` (NEW)

17 tests covering:
- Sears-style "liquidity pressure + asset sales to fund operations" fires
- Sears full evidence set fires
- "liquidity pressure + comparable sales down" fires
- "constrained financial flexibility + asset monetization" fires
- "liquidity constrained + revenue declining" fires
- "liquidity pressure" alone → NOT fire (no corroborator)
- "business pressure" alone → NOT fire (no LIQUIDITY_PRESSURE_PHRASE match)
- "financial pressure" alone → NOT fire (no "liquidity" term)
- "constrained flexibility" without capital/financial → NOT fire
- Non-critical corroborator → NOT fire (isCritical gate)
- LIQUIDITY_PRESSURE_PHRASE in wrong dimension → NOT fire
- Corroborator alone without pressure phrase → NOT fire via paired path
- Existing LIQUIDITY_HARD paths unchanged
- Scope-gap cases unchanged (BlackBerry, turnaround)

---

## Key Design Decisions

**Two-item requirement:** The same evidence item cannot satisfy both LIQUIDITY_PRESSURE_PHRASE and LIQUIDITY_CORROBORATOR — they must be distinct items. This prevents "Debt and liquidity pressure limiting..." (which contains "debt" + "limit" = matches LIQUIDITY_CORROBORATOR) from self-corroborating.

**Distinct from ADVERSE_FRAMING:** Rather than adding "limiting"/"pressure" broadly to ADVERSE_FRAMING (which would fire for any topic), a named phrase (`liquidity pressure`) is required. This keeps general-purpose adverse framing narrow.

**isCritical gate:** Both items must be `isCritical=true`. Non-critical commentary does not corroborate.

---

## Test Results

| Test suite | Tests | Status |
|---|---|---|
| `diagnosis-p3f-sears-liquidity-pressure.test.ts` (new) | 17 / 17 | PASS |
| `diagnosis-p3c-p3e-debt-liquidity.test.ts` | 26 / 26 | PASS |
| `diagnosis-p3d-key-person-founder-death.test.ts` | 21 / 21 | PASS |
| `causal-challenge-p3a-p3b.test.ts` | 18 / 18 | PASS |
| `diagnosis-legal-governance-textual.test.ts` | — | PASS |
| `causal-challenge-legal-governance-cooccurrence.test.ts` | — | PASS |
| `r5-slice3-legal-keyperson-capex.test.ts` | — | PASS |
| `causal-challenge-adverse-narrowing.test.ts` | — | PASS |
| **Total** | **133 / 133** | **PASS** |

`tsc --noEmit`: 0 errors | `prisma validate`: valid

---

## Historical Harness Results (42 cases)

| Metric | Before P3-F | After P3-F |
|---|---|---|
| Safety | 100% | 100% |
| OPSIQ_WORSE | 0 | 0 |
| OPSIQ_BETTER | 7 | 6 |
| OPSIQ_MATCHED | 35 | 36 |
| historical_alignment | 47.6% | 45.2% |

**Sears:** BETTER → MATCHED. Previously Sears was OPSIQ_BETTER because abstaining on a negative-outcome case is counted as "aligned" (avoided the harmful path). After fix, Sears commits to `cash_liquidity_crisis` and the intervention recommendation doesn't match the outcome file's "beneficial" action exactly → MATCHED. This is correct behavior: the diagnosis is right, no harmful recommendation, alignment score reflects incomplete action coverage.

**The BETTER→MATCHED transition is NOT a regression:** OPSIQ_WORSE=0 (the dangerous constraint) is satisfied. No case moved from safe to dangerous.

**Cases worsened (OPSIQ_WORSE):** 0

---

## Guards Confirmed

- "business pressure" → NOT cash_liquidity_crisis
- "financial pressure" (without liquidity) → NOT cash_liquidity_crisis
- "constrained flexibility" (without capital/financial) → NOT cash_liquidity_crisis
- "liquidity pressure" alone (single item) → NOT cash_liquidity_crisis
- Non-critical corroborator → NOT cash_liquidity_crisis
- Wrong dimension (process_maturity) → NOT cash_liquidity_crisis
- Corroborator alone → NOT via paired path

---

## Constraints Honored

- P3-G (Enron) — NOT touched
- P3-H (Yes Bank) — NOT touched
- Legitimate scope-gap cases — unchanged
- Safety gates — unchanged
- Scorer — unchanged
- Case files — unchanged
- Outcome files — unchanged
- unsafe = 0 | dangerous = 0
