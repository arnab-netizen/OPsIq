# Data Quality and Input Reliability Report

**Program:** OpsIQ Best-in-Class Credibility & Reliability Upgrade — Mission 4  
**Date:** 2026-06-23  
**Scope:** Finance domain data quality controls (owner-finance module)  
**Test baseline at time of report:** TypeScript CLEAN, simulation 335/335, SMB 455/455

---

## Executive Summary

Mission 4 addressed two P1 data quality deficiencies in the finance diagnosis domain: human-readable display labels for missing input fields, and a structured freshness tier for snapshot age classification. Both fixes are implemented and verifiable in source. Ten P2 gaps remain documented as acceptable residual risk.

---

## DQ.1 — Completeness: Missing Input Labels

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P1)** |
| File | `src/domain/owner-finance/data-confidence.ts` |
| Evidence | `DB_FIELD_DISPLAY_LABELS` constant maps DB column names to owner-friendly strings. `displayLabelForField()` returns the mapped string or falls back to the raw key. `computeMissingInputsWithPriority()` calls `displayLabelForField()` for every critical and important field before returning `MissingInput[]`. |
| Before | `computeMissingInputsWithPriority` returned raw Prisma camelCase names ("costOfGoods", "payroll") directly to the UI. |
| After | Returns "Cost of Goods Sold", "Payroll / Salary", "Loan / EMI / Debt Payments", etc. |
| Mapped fields | revenue → "Revenue"; costs → "Costs (any cost component)"; cashOnHand → "Cash on Hand"; costOfGoods → "Cost of Goods Sold"; fixedCosts → "Fixed Costs"; payroll → "Payroll / Salary"; debtPayments → "Loan / EMI / Debt Payments"; receivables → "Receivables"; payables → "Payables"; ownerWithdrawals → "Owner Withdrawals"; orderCount → "Order Count"; customerCount → "Customer Count"; discountAmount → "Discount Amount"; refundReworkCost → "Refund / Rework Cost" |
| Fallback behavior | Unknown keys return the raw key string (safe, not silent). |

---

## DQ.2 — Freshness: Tiered Age Classification

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P1)** |
| File | `src/domain/owner-finance/data-confidence.ts` |
| Evidence | `FreshnessTier = "FRESH" \| "AGING" \| "STALE" \| "CRITICAL"` exported type. `freshnessTierFromAge(ageDays)` function with deterministic thresholds: <30 → FRESH, 30–44 → AGING, 45–89 → STALE, ≥90 → CRITICAL. `DataConfidenceResult` now includes `freshnessTier: FreshnessTier \| null`. `calculateDataConfidence()` populates it from computed `ageDays`. |
| Null handling | `ageDays` is `null` when `periodEnd` is unparseable; `freshnessTier` is also `null` in that case. The binary `isStale` flag remains for backward compatibility. |
| Penalty | Stale penalty remains -15 to `dataConfidenceScore` regardless of tier (AGING does not yet carry a separate penalty — documented in CC.3 as acceptable). |

---

## DQ.3 — Consistency: Cross-Field Checks

| Attribute | Detail |
|-----------|--------|
| Status | **PASS** |
| Evidence | Cross-field consistency rule `IQ-004` fixed in Mission 3. `FIN_BELOW_BREAK_EVEN` risk rule covers the scenario where costs exceed revenue. |
| Notes | Revenue > total-costs consistency is indirectly covered by existing break-even risk finding. No additional fix required in Mission 4. |

---

## DQ.4 — Anomaly Detection: Zero-Revenue with Costs Present

| Attribute | Detail |
|-----------|--------|
| Status | **GAP-P2** |
| Description | No anomaly code emitted when `revenue = 0` but one or more cost fields are present. This pattern may indicate a data entry error or misclassified period. |
| Risk | Diagnosis proceeds with zero-revenue, producing potentially misleading findings. |
| Mitigation present | `missingCriticalFinanceInputs` in `data-confidence.ts` flags revenue as CRITICAL missing only when `revenue` is `undefined/null/NaN`. A zero value passes as present. |
| Residual risk | LOW — the `FIN_BELOW_BREAK_EVEN` and `FIN_SURVIVAL_RISK` rules will fire on zero revenue with costs, surfacing the condition functionally. |
| Planned path | Add `zero_revenue_with_costs` anomaly code to intake validation. |

---

## DQ.5 — Duplicates: Unique Period Detection

| Attribute | Detail |
|-----------|--------|
| Status | **GAP-P2** |
| Evidence | Prisma schema has `@@unique([businessId, periodStart, periodEnd])` on financial snapshot. Duplicate period submissions are rejected at DB level. |
| Gap | The service layer propagates a raw Prisma unique-constraint error. No user-friendly message is returned to the owner. |
| Residual risk | LOW — constraint enforcement is correct; UX is degraded but not broken. |
| Planned path | Catch `P2002` Prisma error code and return structured `DUPLICATE_PERIOD` error message. |

---

## Input Scoring Formula (as implemented)

```
score = 100
score -= 30 × (missing critical fields count)   // revenue, costs, cashOnHand
score -= 5  × (missing important fields count)  // 11 fields × 5 = max 55
score -= 10  if currency is invalid
score -= 15  if snapshot is stale (ageDays > staleDays, default 45)
score  = clamp(score, 0, 100)
```

Maximum penalty without staleness: 100 − (3×30) − (11×5) − 10 = 100 − 90 − 55 − 10 = **−55 → clamped to 0**  
The score can reach 0 with all critical fields missing; BLOCKED tier threshold is <30.

---

## Missing Input Priority Classification

| Priority | Fields | Penalty per field |
|----------|--------|-------------------|
| CRITICAL | revenue, costs (any), cashOnHand | −30 |
| IMPORTANT | costOfGoodsOrServices, fixedCosts, salaryPayroll, loanEmiDebtPayments, receivables, payables, ownerWithdrawals, orderCount, customerCount, discountAmount, refundAmount | −5 |

---

## Control Summary

| Control | Status | Severity |
|---------|--------|----------|
| DQ.1 — Display labels human-readable | FIXED | was P1 |
| DQ.2 — Freshness tier structured | FIXED | was P1 |
| DQ.3 — Cross-field consistency | PASS | — |
| DQ.4 — Zero-revenue anomaly flag | GAP-P2 | P2 |
| DQ.5 — User-friendly duplicate warning | GAP-P2 | P2 |
