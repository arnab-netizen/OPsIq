# Monitoring and Drift Readiness Report

**Program:** OpsIQ Best-in-Class Credibility & Reliability Upgrade — Mission 4  
**Date:** 2026-06-23  
**Scope:** Confidence drift tracking, bias monitoring, anomaly detection readiness, per-business monitoring  
**Test baseline at time of report:** TypeScript CLEAN, simulation 335/335, SMB 455/455

---

## Executive Summary

Mission 4 fixes the ME.1 drift tracking gap by including `confidenceDelta` in audit event payloads, enabling post-hoc drift analysis from the audit log. ME.2 (bias across currency/industry), MA.2 (per-business confidence history), and M.1 (data context classification) remain as P2 documented gaps. The simulation regression lock (335/335) acts as the primary monitoring gate for diagnostic correctness.

---

## ME.1 — Confidence Drift Tracking

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P1)** |
| Evidence | `confidenceDelta` field included in `OWNER_FINANCE_DIAGNOSIS_RUN` and `OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE` audit event payloads. Delta is computed as current `dataConfidenceScore` minus the previous cycle's score for the same business. |
| Storage | Stored in the audit event `payload` (JSONB). Queryable via `queryAuditEvents` with `eventName` filter. |
| Gap | No UI visualization of confidence history or drift trend. Delta is recorded but not surfaced to the owner or to the consulting team. |
| Residual risk | LOW — the data is captured; the absence of visualization reduces the value but does not compromise correctness. |

---

## ME.2 — Bias and Fairness Across Templates

| Attribute | Detail |
|-----------|--------|
| Status | **GAP-P2** |
| Description | Finance thresholds are resolved per `industryTemplate` via `resolveFinanceThresholds()`. Different templates apply different gross margin thresholds (e.g., retail vs. restaurant vs. SaaS). No systematic test coverage verifies that threshold variations across currency/industry combinations do not produce systematically biased recommendations. |
| Existing coverage | SMB test suite (455 tests) covers multiple industry templates. Individual template edge cases are tested. Cross-template fairness analysis has not been run. |
| Residual risk | MEDIUM — without a cross-template bias audit, industry-specific thresholds could favor or disadvantage specific templates. |
| Planned path | Document known threshold variations by template. Add template-specific edge case battery to the SMB test suite. |

---

## MA.2 — Per-Business Confidence History

| Attribute | Detail |
|-----------|--------|
| Status | **GAP-P2** |
| Description | The audit log captures `confidenceDelta` per diagnosis event. However, there is no dedicated per-business confidence history table or query. Reconstructing confidence history requires scanning the audit log filtered by `entityId` (businessId) and extracting payload fields. |
| Residual risk | LOW — the data exists in the audit log. Absence of a dedicated table makes trend queries more expensive but not impossible. |
| Planned path | Add a `BusinessConfidenceHistory` table or materialized view for efficient per-business trend queries. |

---

## MA.1 / ME.1 — Abstention and Low-Confidence Events

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P1)** |
| Evidence | `OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE` event emitted when `dataConfidenceScore < 30`. This event is the operational signal for monitoring: any spike in this event for a workspace or business indicates deteriorating data quality or missing inputs. |
| Monitoring readiness | A monitoring system could subscribe to this event name to alert consulting staff when a business enters BLOCKED confidence territory. No automated alert is wired in Mission 4. |

---

## M.1 — Data Context Classification

| Attribute | Detail |
|-----------|--------|
| Status | **GAP-P2** |
| Description | No `dataContext: "real" | "demo" | "synthetic"` flag on financial snapshots or diagnosis outputs. In production, real owner data and demo/onboarding data are processed through the same diagnosis pipeline. |
| Residual risk | MEDIUM — demo data should lower confidence or be excluded from monitoring metrics. Without classification, demo diagnoses pollute confidence drift signals. |
| Planned path | Add `dataContext` field to `FinancialSnapshotInput` and propagate through diagnosis pipeline. Demo/synthetic data should set confidence tier floor to LOW or lower. |

---

## M.3 — SurvivalState in Audit Payload

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P2 in gap map, included in Mission 4 payload fix)** |
| Evidence | `survivalState` now included in `OWNER_FINANCE_DIAGNOSIS_RUN` payload. |
| Notes | `survivalState` is a high-signal field: a business entering CRITICAL survival state should trigger an alert. With it in the audit payload, a monitoring system can filter for `survivalState: "CRITICAL"` events. |

---

## Simulation Regression Lock

| Attribute | Detail |
|-----------|--------|
| Status | **PASS** |
| Test count | 335 simulation tests + 455 SMB tests = 790 total |
| Function | Acts as the primary monitoring gate for diagnostic correctness. Any regression in finance diagnosis logic (wrong findings, wrong sort order, wrong confidence calculation) breaks the simulation gate. |
| Limitation | Regression tests run at commit/CI time, not in production runtime. Production diagnostic drift (e.g., from data anomalies) is not caught by simulation tests. |

---

## Monitoring Readiness Assessment

| Signal | Capturable from Current System | Production Alert Wired |
|--------|-------------------------------|----------------------|
| Low-confidence diagnosis (score < 30) | Yes — `OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE` event | No |
| Survival state CRITICAL | Yes — `survivalState` in diagnosis payload | No |
| Confidence delta negative trend | Yes — `confidenceDelta` in diagnosis payload | No |
| Zero-findings diagnosis (data gap vs. no-risk) | Yes — `missingCriticalData` in diagnosis payload | No |
| Stale snapshot detected | Yes — `isStale` + `freshnessTier` in `DataConfidenceResult` | No |
| Hash chain integrity failure | Yes — `verifyAuditChainIntegrity()` returns `isValid: false` | No |

No production alerting is wired. All signals are capturable from the audit log or by calling existing service functions. This is a documented operational readiness gap.

---

## Control Summary

| Control | Status | Severity |
|---------|--------|----------|
| ME.1 — Confidence delta in audit payload | FIXED | was P1 |
| ME.2 — Bias check across templates/currencies | GAP-P2 | P2 |
| MA.2 — Per-business confidence history table | GAP-P2 | P2 |
| M.1 — Data context classification flag | GAP-P2 | P2 |
| M.3 — survivalState in audit payload | FIXED | was P2 |
| Simulation regression lock (335+455 tests) | PASS | — |
| Production monitoring alerts | NOT WIRED | operational gap |
