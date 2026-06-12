# Module 5 (Cashflow Intelligence) — Slice 1: Deterministic Engine — Report

Status: **COMPLETE — built and locally verified.** Pure deterministic engine
(no DB / API / UI / LLM). Reuses the Owner Intelligence Spine (`clampScore`).
Module 1 + Module 2 untouched. No Prisma/migration change. No public/SaaS.

## 1. Why this was next

Per execution.md §0 survival-first sequencing (constraint precedence
SURVIVAL > CASHFLOW > GROWTH) and the audit addendum's "Finance → Cashflow
survival cluster", Cashflow (Module 5) is the next survival module after the
deployed-runtime-proven finance loop. M13 real-business validation is a
**release** gate, not a build gate, so building the next module is in scope.
Slice 1 is the pure metrics engine, mirroring Module 2 Slice 2.

## 2. Files created

- `src/domain/owner-cashflow/types.ts` — `CashflowSnapshotInput`,
  `CashflowDerivedMetrics`, `CASHFLOW_STATES`, `CASHFLOW_TIERS`.
- `src/domain/owner-cashflow/thresholds.ts` — generic + industry-template
  thresholds (`resolveCashflowThresholds`), tighter than profit thresholds.
- `src/domain/owner-cashflow/data-confidence.ts` — `calculateDataConfidence`,
  `missingCriticalCashflowInputs`, `isValidCurrency`, staleness.
- `src/domain/owner-cashflow/metrics.ts` — `computeCashflowMetrics` + per-metric
  pure functions + risk signals + composite scores + state.
- `src/domain/owner-cashflow/index.ts` — domain barrel.
- `src/__tests__/owner-cashflow/metrics.test.ts` — 21 tests.

## 3. Derived metrics (all `number | null` when not computable)

`totalCash` (cashInHand + bankBalance), `nearTermObligations`
(emi+rent+salary+vendor+tax+ownerWithdrawal), `cashRunwayDays` (only when net
burning: totalCash ÷ (dailyObligations − dailyCollections)), `collectionGapDays`
(receivables ÷ dailyCollections), `overdueReceivablesPct`,
`payablesPressurePct` (payables ÷ totalCash), `urgentPaymentRiskPct`
(nearTermObligations ÷ totalCash), `ownerWithdrawalPressurePct`. Composite 0..100:
`cashflowDangerScore`, `cashflowHealthScore`, `cashflowOpportunityScore`,
`dataConfidenceScore`. State `SAFE/WATCH/AT_RISK/CRITICAL/INSOLVENT_RISK` + tier.

## 4. Honesty guarantees

- Missing/NaN/Infinity → `null` via `num()`; nothing invented.
- Runway returns `null` when not burning (not a false "infinite runway" number).
- Composite scores fail closed to 0 on non-finite via spine `clampScore`.
- Missing critical inputs (cash / nearTermObligations / dailyCollections) are
  listed and drop confidence 30 each; `< 50` confidence blocks a SAFE assertion
  (→ WATCH).
- Generic for any owner-operated business; industry templates are generic
  CATEGORIES (no hardcoded business). Unknown template → generic defaults.

## 5. Verification (local)

| Command | Result |
|---|---|
| `npx vitest run src/__tests__/owner-cashflow/metrics.test.ts` | 21 passed |
| `npm run build` | Compiled successfully |
| `npx eslint src/domain/owner-cashflow src/__tests__/owner-cashflow` | clean |
| `git diff --check` | clean |
| `npx prisma validate` | valid 🚀 (no schema change) |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed (Module 1 unchanged) |
| `npm test` | 203 files passed, **0 failed**; 5604 passed (+21) |

## 6. Scope / what is NOT in this slice

No detector (`OwnerFinding[]`), planner (`OwnerAction[]`), persistence,
migration, API, UI, or spine `DomainScore` wiring yet — those are Slices 2–8 in
`MODULE5_CASHFLOW_INTELLIGENCE_SPEC.md`. No Module 1 / Module 2 change. No
public/SaaS/billing/marketing.

## 7. Next slice

Slice 2 — cashflow detector: map these metrics + thresholds to risk/opportunity
`OwnerFinding[]` (cash shortage / overdue receivables / salary-rent risk / vendor
cutoff / debt default / owner-withdrawal pressure / missing critical data). Pure,
no DB → continues automatically (no manual gate).
