# Module 3 (Sales & Customer Intelligence) — Slice 2: Detector (Diagnosis) — Report

Status: **COMPLETE — built and locally verified.** Pure deterministic detector
(no DB / API / UI / LLM). Maps Slice 1 metrics → Spine `OwnerFinding[]` + a sales
`DomainScore` (domain `sales`). Module 1 + Module 2 + Module 5 untouched. No
Prisma/migration change. No public/SaaS.

## 1. Files created / changed

- `src/domain/owner-sales/risk-rules.ts` — `buildSalesRiskFindings` (new).
- `src/domain/owner-sales/opportunity-rules.ts` — `buildSalesOpportunityFindings` (new).
- `src/domain/owner-sales/diagnosis.ts` — `diagnoseSalesSnapshot`,
  `rankSalesFindings`, sales `DomainScore` (new).
- `src/domain/owner-sales/thresholds.ts` — added `lowQualifiedConversionPct`
  (follow-up bar) (changed, additive).
- `src/domain/owner-sales/index.ts` — export detector + diagnosis (changed).
- `src/__tests__/owner-sales/diagnosis.test.ts` — 9 tests (new).

## 2. Risk findings (execution.md §10.3)

Emit ONLY when the metric is computable and crosses its threshold:

- `SALES_LOW_CONVERSION` — lead→sale conversion bands (critical/low).
- `SALES_POOR_FOLLOW_UP` — qualified-lead conversion below the follow-up bar.
- `SALES_WEAK_REPEAT` — repeat-purchase rate bands (critical/weak).
- `SALES_LOST_CUSTOMER_LEAKAGE` — churn bands (critical/high).
- `SALES_HIGH_COMPLAINT_RATIO` — complaints relative to orders.
- `SALES_DISCOUNT_DEPENDENCE` — discount share of revenue too high.
- `SALES_HIGH_REFUND_RATE` — refunds eroding sales.
- `SALES_WEAK_B2B_PIPELINE` — pipeline coverage of revenue too thin.
- `SALES_MISSING_CRITICAL_DATA` / `SALES_INVALID_CURRENCY` — certain (confidence 1).

(execution.md §10.3 also lists "sales below break-even" — that is the *finance*
domain's break-even metric, out of scope for the sales engine; covered by Module 2.)

## 3. Opportunity findings (execution.md §10.4 / spec §5)

Emit ONLY when supporting inputs exist: `SALES_OPP_RAISE_CONVERSION`,
`SALES_OPP_IMPROVE_RETENTION`, `SALES_OPP_WINBACK`, `SALES_OPP_TIGHTEN_DISCOUNT`,
`SALES_OPP_CONVERT_PIPELINE`, `SALES_OPP_DATA_QUALITY`.

## 4. Honesty guarantees

- Metric-derived findings carry data-confidence as their confidence; missing data
  lowers trust. Data/currency findings are themselves certain.
- No opportunity is fabricated when its supporting input is absent (test-proven).
- Every finding validates against the Spine `ownerFindingSchema` with
  `domain: "sales"`; the `DomainScore` validates against `domainScoreSchema` and
  mirrors the engine's health/risk/opportunity/confidence scores exactly.
- Deterministic ranking (severity → impact → urgency → confidence → code); pure
  (no input mutation; identical order across runs) — test-proven.
- Sales is a GROWTH domain — its `riskScore` will feed the growth/execution
  rollup, not survival risk.

## 5. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-sales/` | 26 passed (17 engine + 9 detector) |
| `npm run build` | Compiled successfully |
| `npx eslint src/domain/owner-sales src/__tests__/owner-sales` | clean |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npm test` | full suite — see status (0 failed) |

## 6. Scope / next slice

No planner (`OwnerAction[]`), persistence, migration, API, UI, or condition/
command-center wiring yet — those are Slices 3–8. **No gate reached** (pure
detector); the next slice is Slice 3 — the sales recommendation/action planner.
Persistence + migration (Slice 4) is the first manual stop.
