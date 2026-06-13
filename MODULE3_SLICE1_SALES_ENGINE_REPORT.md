# Module 3 (Sales & Customer Intelligence) — Slice 1: Deterministic Engine — Report

Status: **COMPLETE — built and locally verified.** Pure deterministic engine
(no DB / API / UI / LLM). Reuses the Owner Intelligence Spine (`clampScore`).
Module 1 + Module 2 + Module 5 untouched. No Prisma/migration change. No
public/SaaS.

## 1. Why this is the correct next slice

Module 5 Cashflow is STAGING_PROVEN + AUDITED (complete). The next incomplete
module per execution.md §22 is **Phase 4 — Sales & Customer Intelligence
(Module 3)** — skipped earlier when Cashflow was built survival-first.
(execution.md ↔ repo-reality note: §22 orders Sales (Phase 4) before Operations
(Phase 5); both were deferred for the survival cluster. Using the newest proven
repo state, recovery+finance+cashflow are proven; Sales is the next incomplete
module.) Slice 1 is the pure metrics engine, mirroring the proven Module 2/5
Slice-1 pattern.

## 2. Files created

- `MODULE3_SALES_INTELLIGENCE_SPEC.md` — spec + slice plan (execution.md §10).
- `src/domain/owner-sales/types.ts` — `SalesSnapshotInput`,
  `SalesDerivedMetrics`, `SALES_STATES`, `SALES_TIERS`.
- `src/domain/owner-sales/thresholds.ts` — generic + industry-template thresholds
  (`resolveSalesThresholds`); laundry/local-service raise the repeat-rate bar.
- `src/domain/owner-sales/data-confidence.ts` — `calculateDataConfidence`,
  `missingCriticalSalesInputs`, `isValidCurrency`, staleness.
- `src/domain/owner-sales/metrics.ts` — `computeSalesMetrics` + per-metric pure
  functions + risk signals + composite scores + state.
- `src/domain/owner-sales/index.ts` — domain barrel.
- `src/__tests__/owner-sales/metrics.test.ts` — 17 tests.

## 3. Derived metrics (execution.md §10.2; all `number | null` when not computable)

`leadToSaleConversionPct`, `qualifiedConversionPct`, `repeatRatePct`,
`newCustomerSharePct`, `lostCustomerRatePct`, `acquisitionPerDay`,
`averageOrderValue` (revenue÷orders or direct), `salesPerDay`, `ordersPerDay`,
`salesPerStaff`, `b2bSharePct`/`b2cSharePct`, `b2bPipelineCoveragePct`,
`complaintToSaleRatioPct`, `discountDependencePct`, `refundRatePct`. Composite
0..100: `salesHealthScore`, `salesRiskScore`, `salesOpportunityScore`,
`dataConfidenceScore`. State `STRONG/STEADY/SOFT/WEAK/CRITICAL` + tier.

## 4. Honesty guarantees

- Missing/NaN/Infinity → `null` via `num()`; nothing invented.
- Composite scores fail closed to 0 on non-finite via spine `clampScore`.
- Missing critical inputs (orders / customers / leadsOrRevenue) listed and drop
  confidence 30 each; `< 50` confidence blocks a STRONG/STEADY assertion (→ SOFT).
- Generic for any owner-operated business; industry templates are generic
  CATEGORIES (no hardcoded business). Unknown template → generic defaults.
- Sales is a GROWTH domain (not in `SURVIVAL_DOMAINS`), so its risk will feed the
  growth/execution rollup, not survival risk.

## 5. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-sales/metrics.test.ts` | 17 passed |
| `npm run build` | Compiled successfully |
| `npx eslint src/domain/owner-sales src/__tests__/owner-sales` | clean |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npx vitest run src/__tests__/founder-recovery/` | green (Module 1 unchanged) |
| `npm test` | full suite — see status (0 failed) |

## 6. Scope / next slice

No detector, planner, persistence, migration, API, UI, or spine `DomainScore`
wiring yet — those are Slices 2–8 in `MODULE3_SALES_INTELLIGENCE_SPEC.md`. No
Module 1/2/5 change. No public/SaaS. **No gate reached** (pure engine); the next
slice is Slice 2 — the sales detector (risk/opportunity `OwnerFinding[]`).
