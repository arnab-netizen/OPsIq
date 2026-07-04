# Module 5 (Cashflow Intelligence) — Slice 2: Detector (Diagnosis) — Report

Status: **COMPLETE — built and locally verified.** Pure deterministic detector
(no DB / API / UI / LLM). Maps Slice 1 metrics → Spine `OwnerFinding[]` +
cashflow `DomainScore` (domain `cashflow`). Module 1 + Module 2 untouched. No
Prisma/migration change. No public/SaaS.

## 1. Files created / changed

- `src/domain/owner-cashflow/risk-rules.ts` — `buildCashflowRiskFindings` (new).
- `src/domain/owner-cashflow/opportunity-rules.ts` — `buildCashflowOpportunityFindings` (new).
- `src/domain/owner-cashflow/diagnosis.ts` — `diagnoseCashflowSnapshot`,
  `rankCashflowFindings`, cashflow `DomainScore` (new).
- `src/domain/owner-cashflow/thresholds.ts` — added `highDebtPaymentPressurePct`
  (EMI-vs-cash bar) (changed, additive).
- `src/domain/owner-cashflow/index.ts` — export detector + diagnosis (changed).
- `src/__tests__/owner-cashflow/diagnosis.test.ts` — 11 tests (new).

## 2. Risk findings (execution.md §12.3)

Emit ONLY when the metric is computable and crosses its threshold:

- `CF_INSOLVENT_RUNWAY` / `CF_LOW_RUNWAY` — cash runway bands (burning-only).
- `CF_URGENT_PAYMENT_RISK` — near-term dues (salary/rent/vendor/tax/emi) vs cash;
  **critical** when obligations ≥ cash (salary/rent cannot be met).
- `CF_VENDOR_CUTOFF_RISK` — payables vs cash; critical when payables ≥ cash.
- `CF_DEBT_DEFAULT_RISK` — this period's EMI vs cash (> `highDebtPaymentPressurePct`).
- `CF_HIGH_OVERDUE_RECEIVABLES` — overdue share of receivables.
- `CF_SLOW_COLLECTIONS` — days-of-sales-outstanding over the bar.
- `CF_OWNER_WITHDRAWAL_PRESSURE` — owner draw as a high share of cash.
- `CF_MISSING_CRITICAL_DATA` / `CF_INVALID_CURRENCY` — certain (confidence 1).

## 3. Opportunity findings (execution.md §12 / spec §5)

Emit ONLY when supporting inputs exist:

- `CF_OPP_COLLECT_OVERDUE` — collect overdue receivables → free cash.
- `CF_OPP_DEFER_PAYABLES` — negotiate/stagger non-critical payables.
- `CF_OPP_REDUCE_OWNER_WITHDRAWAL` — trim owner draw **only under actual
  liquidity pressure** (`cashflowDangerScore > 0`).
- `CF_OPP_DATA_QUALITY` — supply missing/stale inputs to raise confidence.

## 4. Honesty guarantees

- Metric-derived findings carry data-confidence as their confidence; missing data
  lowers trust. Data/currency findings are themselves certain (confidence 1).
- No opportunity is fabricated when its supporting input is absent (test-proven).
- Owner-withdrawal-reduction is not suggested for a healthy business (test-proven).
- Every finding validates against the Spine `ownerFindingSchema` with
  `domain: "cashflow"`; the `DomainScore` validates against `domainScoreSchema`
  and mirrors the engine's danger/health/opportunity/confidence scores exactly.
- Deterministic ranking (severity → impact → urgency → confidence → code); pure
  (no input mutation; identical order across runs) — test-proven.

## 5. Verification (local)

| Command | Result |
|---|---|
| `npx vitest run src/__tests__/owner-cashflow/` | 32 passed (21 engine + 11 detector) |
| `npm run build` | Compiled successfully |
| `npx eslint src/domain/owner-cashflow src/__tests__/owner-cashflow` | clean |
| `git diff --check` | clean |
| `npx prisma validate` | valid 🚀 (no schema change) |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npm test` | **0 failed**; 5615 passed (+11), includes Module 1 founder-recovery |

## 6. Scope / next slice

No planner (`OwnerAction[]`), persistence, migration, API, UI, or condition/
command-center wiring yet — those are Slices 3–8. Slice 3 — recommendation/action
planner — turns these findings into ranked `OwnerAction[]` (pure, no DB) and
continues automatically (no manual gate). Persistence + migration (Slice 4) is
the first manual stop.
