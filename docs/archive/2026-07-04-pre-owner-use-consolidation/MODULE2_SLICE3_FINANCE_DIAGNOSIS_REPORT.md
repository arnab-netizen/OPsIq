# Module 2 — Slice 3 — Finance Risk/Opportunity Detector — Report

Status: **Slice 3 COMPLETE (pure detector).** No DB/schema/API/UI/migration. Module
1, Spine, and Slice 2 metric formulas unchanged. Public/SaaS frozen.

## 1. Files created / updated

- `src/domain/owner-finance/risk-rules.ts` — deterministic risk `OwnerFinding[]`.
- `src/domain/owner-finance/opportunity-rules.ts` — deterministic opportunity
  `OwnerFinding[]`.
- `src/domain/owner-finance/diagnosis.ts` — `diagnoseFinanceSnapshot`, ranking, and
  finance `DomainScore`.
- `src/domain/owner-finance/index.ts` — re-exports the new modules.
- `src/__tests__/owner-finance/diagnosis.test.ts` — 17 unit tests (pure).
- `MODULE2_SLICE3_FINANCE_DIAGNOSIS_REPORT.md` — this report.

The shared Spine contract (`OwnerFinding`) already carries `findingType:
"risk"|"opportunity"`, so **no spine change was needed**.

## 2. Risk findings implemented

`FIN_INVALID_CURRENCY`, `FIN_MISSING_CRITICAL_DATA`, `FIN_NEGATIVE_GROSS_MARGIN`,
`FIN_NEGATIVE_NET_MARGIN`, `FIN_BELOW_BREAK_EVEN`, `FIN_INSOLVENT_RUNWAY`,
`FIN_LOW_RUNWAY`, `FIN_HIGH_FIXED_COST_BURDEN`, `FIN_HIGH_PAYROLL_BURDEN`,
`FIN_HIGH_DEBT_PRESSURE`, `FIN_HIGH_RECEIVABLES`, `FIN_HIGH_PAYABLES`,
`FIN_DISCOUNT_LEAKAGE`, `FIN_REFUND_REWORK_LEAKAGE`.

A risk emits only when its metric is computable and crosses the resolved threshold
(or, for data/currency findings, when data is missing/invalid). Each finding carries
domain=finance, code, title, summary, sourceMetric, sourceValue (only from a real
metric — `null` otherwise), threshold (when applicable), severity, confidence (0..1,
= data confidence for metric findings; 1 for the certain data/currency findings),
impactScore/urgencyScore (0..100), evidence[], missingData[], verificationMetric,
findingType="risk".

## 3. Opportunity findings implemented

`FIN_OPP_MARGIN_IMPROVEMENT`, `FIN_OPP_BREAK_EVEN_RECOVERY`,
`FIN_OPP_RECEIVABLES_COLLECTION`, `FIN_OPP_DEBT_REDUCTION`,
`FIN_OPP_LEAKAGE_REDUCTION`, `FIN_OPP_REVENUE_QUALITY`, `FIN_OPP_DATA_QUALITY`.

Opportunities are emitted **only when the supporting input exists** (a real computed
metric) — never fabricated when data is absent.

## 4. DomainScore behavior

`diagnoseFinanceSnapshot` returns a finance `DomainScore` mirroring Slice 2 exactly:
`healthScore = financialHealthScore`, `riskScore = financialRiskScore`,
`opportunityScore = financialOpportunityScore`, `dataConfidenceScore =
financialDataConfidenceScore`; `topFindingCodes` = the top-3 ranked risk codes;
`topActionCodes = []` (Slice 4). `domain = "finance"`. Tested to equal the metric
scores.

## 5. Sorting / ranking behavior

`rankFinanceFindings` orders deterministically: **severity desc → impactScore desc →
urgencyScore desc → confidence desc → code asc** (pure, non-mutating). Risk and
opportunity lists are each ranked, and the combined `findings` list is ranked.

## 6. Diagnosis result object

`{ input, metrics, findings (ranked), riskFindings (ranked), opportunityFindings
(ranked), domainScore, missingCriticalData, generatedAt }`. No recommendations/
actions (Slice 4); nothing persisted; `generatedAt` is injectable (`opts.now`) for
deterministic output.

## 7. Test results

| Command | Result |
|---|---|
| `npx vitest run src/__tests__/owner-finance/diagnosis.test.ts` | **17 passed** |
| `npx vitest run src/__tests__/owner-finance/metrics.test.ts` | 21 passed |
| `npx vitest run src/__tests__/owner-spine/contracts.test.ts` | 23 passed |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed (Module 1 unchanged) |
| `npx eslint` (new files) | clean |
| `git diff --check` | clean |
| `npx prisma validate` | valid 🚀 |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npm run build` | Compiled successfully |
| `npm test` | 196 files passed, **0 failed**; 5534 passed (+17) |

Coverage: healthy → no critical risk; negative margin; below break-even (+recovery
opp); insolvent runway escalates to critical; high debt; overdue receivables (risk +
opp); discount leakage (risk + opp); missing critical data (+confidence drop);
invalid currency (sourceValue null); risk/opportunity separation; DomainScore
mirroring; bounded scores; determinism + severity sorting; no invented source
values; input non-mutation; service/inventory/B2B/B2C variants with no Tumbledry
hardcoding.

## 8. No schema/API/UI/migration

Confirmed — pure domain TypeScript only. `prisma/schema.prisma` unchanged (valid);
no migration/routes/pages. Slice 2 metric formulas were read only, not modified.

## 9. Module 1 / public-SaaS

Module 1 green (founder-recovery 38 passed; no recovery files touched). Public/SaaS
remains **frozen**.

## 10. Next single action

Execute **Module 2 Slice 4** (finance recommendation/action planner) under explicit
authorization — pure `recommendations.ts`/`actions.ts` mapping findings →
traceable recommendations → `OwnerAction[]` with prioritization fields; still no
DB/API/UI.
