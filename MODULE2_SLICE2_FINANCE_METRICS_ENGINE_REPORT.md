# Module 2 — Slice 2 — Finance Metrics Engine — Report

Status: **Slice 2 COMPLETE (pure deterministic engine).** No DB/schema/API/UI/
migration. Module 1 unchanged. Public/SaaS frozen.

## 1. Files created

- `src/domain/owner-finance/types.ts` — inputs, derived metrics, survival
  state/tier, business-model enums.
- `src/domain/owner-finance/thresholds.ts` — generic thresholds + per-industry-
  template overrides + `resolveFinanceThresholds`.
- `src/domain/owner-finance/data-confidence.ts` — currency validation, missing-
  critical-input detection, data-confidence scoring, staleness.
- `src/domain/owner-finance/metrics.ts` — all deterministic metric functions,
  composite scores, survival-state logic, `computeFinancialMetrics` orchestrator.
- `src/domain/owner-finance/index.ts` — public surface.
- `src/__tests__/owner-finance/metrics.test.ts` — 21 unit tests (pure, no DB).
- `MODULE2_SLICE2_FINANCE_METRICS_ENGINE_REPORT.md` — this report.

## 2. Metrics implemented

Ratio/per-unit (each `number | null`, `null` = not computable): grossMarginPct,
netMarginPct, contributionMarginPct, fixedCostBurdenPct, payrollBurdenPct,
breakEvenRevenue, dailyBreakEvenRevenue, cashRunwayDays, debtServicePressurePct,
receivablesPressurePct, payablesPressurePct, costLeakageRatioPct, discountLeakagePct,
refundReworkLeakagePct, revenueQualityScore, profitPerOrder, profitPerCustomer,
ownerWithdrawalPressurePct, netProfit.

Composite (always 0..100): financialHealthScore, financialRiskScore,
financialOpportunityScore, dataConfidenceScore.

Cost model (documented, deterministic, no double-count): `fixedCostsTotal =
fixedCosts ?? sum(rent, salaryPayroll, utilities)`; `variableCostsTotal =
variableCosts ?? sum(costOfGoodsOrServices, deliveryFulfilmentCost)`; `totalCosts =
fixedCostsTotal + variableCostsTotal + marketingSpend`. Break-even =
`fixedCostsTotal / contributionMarginRatio`. Cash runway is computed only when the
business is burning cash (net loss); a profitable period returns `null` (not at
risk), never a fabricated number.

## 3. Survival state logic

States escalate `SAFE → WATCH → AT_RISK → CRITICAL → INSOLVENT_RISK`, computed from
deterministic risk signals against resolved thresholds:
- **INSOLVENT_RISK:** runway < insolvent bar (7d), or critical debt pressure with a
  net loss.
- **CRITICAL:** net loss with critical runway (<30d) or below break-even.
- **AT_RISK:** negative gross/net margin, below break-even, low runway (<45d), high
  debt, or high fixed-cost burden.
- **WATCH:** insufficient data confidence (<50) to assert SAFE, thin net margin, or
  high receivables/payables/leakage.
- **SAFE:** none of the above and data confidence ≥ 50.

Survival **tier** (priority hierarchy): existential (INSOLVENT_RISK/CRITICAL) →
recovery (AT_RISK) → growth (WATCH) → optimization (SAFE).

## 4. Data-confidence behavior

Starts at 100; −30 per missing critical input (revenue, costs, cashOnHand), −5 per
missing important field, −10 invalid currency, −15 stale snapshot; clamped 0..100.
Missing critical inputs are listed in `missingRequiredInputs` — never invented. Low
confidence caps the engine from asserting SAFE.

## 5. Test results

| Command | Result |
|---|---|
| `npx vitest run src/__tests__/owner-finance/metrics.test.ts` | **21 passed** |
| `npx eslint` (new files) | clean |
| `git diff --check` | clean |
| `npx prisma validate` | valid 🚀 |
| `npm run lint:ratchet` | PASS (1500 — no increase) |
| `npx vitest run src/__tests__/owner-spine/contracts.test.ts` | 23 passed |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed (Module 1 unchanged) |
| `npm run build` | Compiled successfully |
| `npm test` | 195 files passed, **0 failed**; 5517 passed (+21) |

Coverage: profitable business (exact margins/break-even/SAFE); zero revenue; negative
profit; missing costs (null + listed); high fixed-cost burden; high debt/EMI; low
runway (→CRITICAL) and insolvent runway (→INSOLVENT_RISK); overdue receivables;
payables pressure; break-even not reached; invalid currency; service vs inventory +
industry-template threshold adaptability; B2B-heavy vs B2C-heavy revenue quality;
data-confidence drop on missing inputs; monotonic survival escalation; all scores
0..100; all non-computable metrics null; input non-mutation; `num()` fail-closed.

## 6. Generic, no Tumbledry hardcoding

All logic is generic. `laundry_local_service` is an industry **category template**
(threshold pack), not a named business. No business identity is hardcoded.

## 7. Whether Slice 3 can start

**Yes** — Slice 3 (finance risk/opportunity **detector** producing `OwnerFinding[]`
via the Spine contract) may begin under explicit authorization. Not started here.

## 8. Public/SaaS

Remains **frozen**. No public/SaaS/billing/marketing files touched.
