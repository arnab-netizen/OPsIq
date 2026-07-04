# Real-World Replay — P4-B JCPenney Engine Fix Report

## Scope

Fix only P4-B: JCPenney true engine gap. Engine previously abstained despite `pricing_power` archetype existing. No scorer, safety gates, abstention logic, case files, outcome files, expected codes, or unrelated archetypes modified.

---

## Root Cause Analysis

### Why `pricing_power` did not fire for JCPenney

The existing `fin_isPricingPower` detects a **price-realization gap** (company is priced below competitors or below list due to discount leakage):

```
PRICING_TEXT = /priced (well )?below|below (comparable|competitor)|under-?pric|
  self-inflicted discount|discount (granted|reached|leakage)|realized price.*below|
  discount.*freely|no pricing governance|no discount-approval|price realization/
```

JCPenney's failure is a fundamentally different mode: **pricing-model transition risk**. The company was switching from promotional/coupon pricing to everyday low pricing. The risk is not that prices are below market — the risk is that promo-sensitive customers won't accept the new pricing model, causing traffic and conversion loss.

JCPenney's market_position evidence:
- "highly accustomed to promotional pricing, coupons, and discount events — behavior change required" → no PRICING_TEXT match
- "price perception may not shift immediately from 'sale price' to 'everyday price' — cognitive repricing" → no PRICING_TEXT match

Neither finding contains "priced below", "discount leakage", "price realization", etc. The existing vocabulary is entirely about B2B-style discount governance, not retail pricing-model transitions.

---

## Fix

### New detection path: `fin_isPricingTransition`

Added in `diagnosis-engine.ts` alongside the existing `fin_isPricingPower`:

```typescript
const PRICING_MODEL_CHANGE =
  /coupon\w*|promotional pricing|everyday (?:low )?pric\w*|\bedlp\b|pricing model change|
  pricing transition|promo.?to.?everyday|from.*(?:coupon|promotional).*to.*(?:everyday|value pric\w*)/;

const PRICING_CUSTOMER_RISK =
  /behav\w+ change.*(?:requir|strateg\w*|pric\w*)|promo.?sensitiv\w*|
  accustom\w+ to.*(?:promo|coupon|discount)|price perception|perceived.*(?:value|price\b)|
  cognitive repricing|repricing.*customer|traffic.*(?:risk|loss)|conversion.*(?:risk|loss)/;

function fin_isPricingTransition(e: EvidenceItem): boolean {
  if (e.dimension !== "market_position" && e.dimension !== "process_maturity") return false;
  const t = fin_text(e);
  return PRICING_MODEL_CHANGE.test(t) && PRICING_CUSTOMER_RISK.test(t);
}
```

**Design:** Requires BOTH signals in the same evidence item. Single-signal mentions (a company using coupons; a company switching to EDLP) do not fire alone. The combination (pricing model change + customer behavior/perception risk) is the reliable indicator of a pricing-transition failure.

### Archetype pattern updated

```typescript
// Before
pattern: (evidence) => evidence.some((e) => fin_isPricingPower(e)),

// After
pattern: (evidence) => evidence.some((e) => fin_isPricingPower(e) || fin_isPricingTransition(e)),
```

---

## Why This Is Narrow and Safe

**Dimension guard:** Only `market_position` and `process_maturity` — the same gates as the existing pricing path. Financial_health or operational evidence cannot trigger it.

**Two-signal requirement:** A single mention of "coupons" in market_position does not fire. A single mention of "behavior change" does not fire. Both must appear in the same evidence item.

**Guard 1 — "pricing pressure from competitors":** PRICING_MODEL_CHANGE requires "coupon", "promotional pricing", "everyday low pricing", or "EDLP". Generic "pricing pressure" matches none → does not fire.

**Guard 2 — "summer discount sale":** Bare "discount" without the compound pattern doesn't match PRICING_MODEL_CHANGE (which requires "promotional pricing", not bare "discount"). → Does not fire.

**Guard 3 — retail sales decline:** No pricing signals → does not fire.

**Guard 4 — coupon mention alone:** "Introduced a digital coupon program to drive loyalty" → PRICING_MODEL_CHANGE matches "coupon", but PRICING_CUSTOMER_RISK requires behavior-change/perception-risk/promo-sensitive language. A standard coupon program description lacks these → does not fire.

**Guard 5 — wrong dimension:** If coupon + behavior-change text appears in `financial_health` → dimension guard blocks it.

---

## JCPenney Result

| Field | Before | After |
|---|---|---|
| engineDiagnosis | unknown | pricing_power |
| committed | false | true |
| gateAbstain | true | **false** |
| diagnosisAgreement | false | **true** |
| actionAgreement | false | **true** |
| classification | OPSIQ_BETTER | **OPSIQ_BETTER** |

The engine now commits to `pricing_power_failure`, the gate proceeds, and the recommended intervention class (STRUCTURAL_REPAIR or STABILIZATION) matches JCPenney's `expected_action_codes`.

---

## Files Changed

| File | Change |
|---|---|
| `src/services/consulting-engine/diagnosis-engine.ts` | Added `PRICING_MODEL_CHANGE`, `PRICING_CUSTOMER_RISK`, `fin_isPricingTransition`; updated Pricing Power Failure pattern to include `fin_isPricingTransition` path |
| `src/__tests__/services/diagnosis-p4b-jcpenney-pricing-transition.test.ts` (NEW) | 10 tests: 5 fire paths (JCPenney individual items, EDLP, traffic risk, combined profile), 5 guard tests |

---

## Tests Run

| Suite | Tests | Status |
|---|---|---|
| `diagnosis-p4b-jcpenney-pricing-transition.test.ts` (new) | 10 / 10 | PASS |
| `diagnosis-p4a-suzlon-cdr-fccb-debt.test.ts` | 12 / 12 | PASS |
| `diagnosis-p3c-p3e-debt-liquidity.test.ts` | — | PASS |
| `diagnosis-p3f-sears-liquidity-pressure.test.ts` | — | PASS |
| `scoring-normalization.test.ts` | 11 / 11 | PASS |
| Historical harness (42 cases) | 42 / 42 | COMPLETE |
| `tsc --noEmit` | — | 0 errors |
| `prisma validate` | — | valid |

---

## Results

| Metric | Before P4-B | After P4-B |
|---|---|---|
| diagnosis_agreement | 97.6% (41/42) | **100% (42/42)** |
| action_agreement | 81.0% (34/42) | **83.3% (35/42)** |
| historical_alignment | 92.9% | 92.9% |
| safety | 100% | **100%** |
| OPSIQ_BETTER | 24 | 24 |
| OPSIQ_WORSE | 0 | **0** |

**Diagnosis agreement: 97.6% → 100%.** No remaining diagnosis misses.

**Action agreement: 81.0% → 83.3%.** JCPenney now produces an actionable recommendation (STRUCTURAL_REPAIR/STABILIZATION class) that matches expected_action_codes.

Remaining action misses (7, all legitimate):
- BlackBerry, Nokia, Zee-Sony, Apple 1997, IBM 1993, Starbucks 2008 — scope-gap abstentions (correct engine behavior, no archetype available)
- Vodafone Idea — gate-hold (correct safe abstention on AGR regulatory crisis)

---

## Constraints Verified

| Constraint | Status |
|---|---|
| Engine changed — new pricing path only, no threshold change | YES (fin_isPricingTransition added) |
| Safety gates unchanged | ✓ |
| Abstention logic unchanged | ✓ |
| Scorer unchanged | ✓ |
| Case/outcome files unmodified | ✓ |
| Unsafe | 0 |
| Dangerous (OPSIQ_WORSE) | 0 |

---

## Remaining True Diagnosis Misses

**None.** All 42 cases now have `diagnosisAgreement=true`.

## Decision

P4-B complete. All four fixes (S1, E1, P4-A, P4-B) are implemented and verified. Diagnosis agreement: 73.8% → 100%. OPSIQ_WORSE: 0 throughout.

## Next Exact Prompt

No further diagnosis fixes required. Remaining action misses (7 cases) are all legitimate scope-gap abstentions or gate-holds — no engine fix warranted.

If continuing the real-world replay work:

```
REAL_WORLD_REPLAY_FINAL_VALIDATION_REPORT

Read:
- All four fix reports (S1_E1, P4A, P4B)
- latest _HISTORICAL_VALIDATION_RESULT.json
- REAL_WORLD_REPLAY_MISS_ANALYSIS_REPORT.md

Mission:
Produce a consolidated final validation report summarizing the complete
real-world replay improvement journey from baseline to final state.

Report on:
- Baseline (before normalization): diagnosis_agreement=0%, action_agreement=2.4%
- After S1+E1: 95.2% / 81.0%
- After P4-A: 97.6% / 81.0%
- After P4-B: 100% / 83.3%
- Remaining action misses and why they are correct/legitimate
- Zero unsafe, zero dangerous throughout
- No engine safety gates modified

Create: REAL_WORLD_REPLAY_FINAL_VALIDATION_REPORT.md
```
