# Explainability and Traceability Hardening Report

**Program:** OpsIQ Best-in-Class Credibility & Reliability Upgrade — Mission 4  
**Date:** 2026-06-23  
**Scope:** Finance diagnosis explainability controls — evidence surfacing, missing-input labeling, finding sort order, rationale traceability  
**Test baseline at time of report:** TypeScript CLEAN, simulation 335/335, SMB 455/455

---

## Executive Summary

Mission 4 addressed two P1 explainability deficiencies: human-readable display labels for missing-input fields (EX.2/DQ.1), and the correct deterministic finding sort order (ME.3). Four P2 gaps remain as documented acceptable residual risk.

---

## EX.1 — Evidence Used on Every Finding

| Attribute | Detail |
|-----------|--------|
| Status | **PASS** |
| Evidence | `evidence: string[]` field on `OwnerFinding` contract (owner-spine). All risk rules in `src/domain/owner-finance/risk-rules.ts` and opportunity rules in `src/domain/owner-finance/opportunity-rules.ts` populate `evidence` from computed metrics. `evidenceRationale` on recommended action cards was fixed in Mission 3 (OT-005). |
| Notes | Evidence is deterministic — same inputs always produce same evidence strings. |

---

## EX.2 — Missing Input Labels (Human-Readable)

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P1)** |
| File | `src/domain/owner-finance/data-confidence.ts` |
| Evidence | `DB_FIELD_DISPLAY_LABELS` record at line 121. `displayLabelForField(dbFieldName)` function at line 138. `computeMissingInputsWithPriority()` calls `displayLabelForField()` for all critical and important fields before constructing `MissingInput[]`. |
| Before | Raw Prisma field names ("costOfGoods", "payroll") surfaced to owner. |
| After | Human-readable labels ("Cost of Goods Sold", "Payroll / Salary") surfaced to owner. |
| Fallback | Unknown field key returns the raw key string — safe, not silent. |

---

## EX.3 — Rejected Signals

| Attribute | Detail |
|-----------|--------|
| Status | **GAP-P2** |
| Description | Findings are generated when rule conditions are met. There is no "rejected signal" or "suppressed finding" field for rules that evaluated but did not fire (e.g., gross margin was 29%, threshold is 30% — this near-miss is invisible). |
| Residual risk | LOW — near-miss transparency is a best-practice enhancement, not a safety issue. Existing findings are truthful. |
| Planned path | Future enhancement: add suppression audit for findings that evaluated within 10% of threshold. |

---

## EX.4 — Missing Inputs Registry in UI

| Attribute | Detail |
|-----------|--------|
| Status | **GAP-P2** |
| Evidence | `buildMissingInputsRegistry()` in `src/domain/owner-finance/diagnosis.ts` constructs a full structured registry with `field`, `priority`, and `impact` for every missing input. This registry is included in `FinanceDiagnosisResult.missingInputsRegistry`. |
| Gap | The UI on the finance page shows only a count of missing inputs, not the full registry with impact descriptions. The structured registry is computed but not rendered. |
| Residual risk | LOW — missing inputs count is visible; the impact descriptions would improve owner understanding. |
| Planned path | Expand finance page UI to render the registry as an expandable panel. |

---

## EX.5 — Alternatives Considered on Recommendations

| Attribute | Detail |
|-----------|--------|
| Status | **GAP-P2 (documented)** |
| Description | Recommended actions in `src/domain/owner-finance/recommendations.ts` and `src/domain/owner-finance/actions.ts` do not carry an "alternatives considered" or "why not X" field. |
| Residual risk | LOW — this is a transparency enhancement. Current recommendations are evidence-backed and deterministic. |
| Planned path | Document as acknowledged gap. Requires recommendation schema extension and rule-level metadata. |

---

## ME.3 — Finding Sort Order

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P1)** |
| File | `src/domain/owner-finance/diagnosis.ts` |
| Evidence | `rankFinanceFindings()` at line 68. Sort order: severity desc (using `SEVERITY_RANK: critical=4, high=3, medium=2, low=1`) → `impactScore` desc → `urgencyScore` desc → `confidence` desc → `code` asc (tie-break). |
| Before | Findings were sorted by `severity: "asc"` (alphabetical string sort), which placed "critical" before "high" but "low" before "medium" — incorrect. |
| After | Findings sorted by numeric severity rank descending. Critical findings appear first. |
| Pure function | `rankFinanceFindings` is a pure function that returns a new array. Called once for risk findings, once for opportunity findings, and once for the combined set. |

---

## Missing Inputs Registry Impact Map (as implemented)

| Field | Impact Description |
|-------|--------------------|
| revenue | profit margins, cash runway, survival risk score |
| costs | profitability, cost structure, net margin |
| cashOnHand | cash runway, survival risk, days of cash remaining |
| costOfGoodsOrServices | gross margin calculation |
| fixedCosts | structural vs. variable cost separation |
| salaryPayroll | payroll sustainability assessment |
| loanEmiDebtPayments | debt coverage and liquidity risk |
| receivables | days-sales-outstanding, cash conversion |
| payables | supplier payment risk |
| ownerWithdrawals | owner cash drain analysis |
| orderCount | revenue-per-order metric |
| customerCount | revenue-per-customer metric |
| discountAmount | discount impact on margins |
| refundAmount | refund drain on gross margin |

Source: `MISSING_INPUT_IMPACT` constant in `src/domain/owner-finance/diagnosis.ts` lines 23–38.

---

## Control Summary

| Control | Status | Severity |
|---------|--------|----------|
| EX.1 — Evidence fields populated on all findings | PASS | — |
| EX.2 — Missing input display labels human-readable | FIXED | was P1 |
| EX.3 — Rejected signals / suppressed findings | GAP-P2 | P2 |
| EX.4 — Missing inputs registry shown in UI | GAP-P2 | P2 |
| EX.5 — Alternatives considered on recommendations | GAP-P2 | P2 |
| ME.3 — Finding sort order correct (severity desc) | FIXED | was P1 |
