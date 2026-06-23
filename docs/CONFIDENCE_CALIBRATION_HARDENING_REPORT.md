# Confidence Calibration Hardening Report

**Program:** OpsIQ Best-in-Class Credibility & Reliability Upgrade — Mission 4  
**Date:** 2026-06-23  
**Scope:** Finance diagnosis confidence scoring and calibration controls  
**Test baseline at time of report:** TypeScript CLEAN, simulation 335/335, SMB 455/455

---

## Executive Summary

Mission 4 fixed four P1 confidence calibration deficiencies: the addition of a `ConfidenceTier` type with correct thresholds, a `FreshnessTier` type, the `OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE` audit event when score < 30, and the UI warning banner on the finance page. Three P2 gaps remain documented as acceptable residual risk.

---

## CC.1 — Recommendations Cannot Exceed Evidence

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P1)** |
| Evidence | `ConfidenceTier` enum added to `src/domain/owner-finance/data-confidence.ts`. Thresholds: HIGH ≥85, MEDIUM ≥60, LOW ≥30, BLOCKED <30. `confidenceTierFromScore(score)` is pure and deterministic. `DataConfidenceResult.confidenceTier` is populated by `calculateDataConfidence()`. The `BLOCKED` tier signals that diagnosis output should not be acted upon. |
| Gate mechanism | When `confidenceTier === "BLOCKED"`, the `OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE` audit event is emitted (see MA.1). The UI shows a blocking banner (see HO.2). |
| Finding-level confidence | Each `OwnerFinding` has a `confidence` field set to `clampConfidence(dataConfidenceScore / 100)`. This propagates data confidence into individual finding confidence. |
| Limitation | No hard runtime gate preventing the service from returning findings when tier is BLOCKED — diagnosis runs and returns findings, but they are flagged via tier and banner. This is the documented P1→FIXED state: the gate exists as an audit event + UI warning, not as a service-layer throw. |

---

## CC.2 — Missing Criticals Reduce Confidence

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P1)** |
| Evidence | `missingCriticalFinanceInputs()` returns the list of missing critical fields. Each missing critical reduces score by 30. Three missing criticals → score ≤ 10 (plus other penalties). `OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE` event is emitted by the finance diagnosis service when `dataConfidenceScore < 30`. |
| Audit payload | Event includes `dataConfidenceScore`, `confidenceTier`, `missingCritical`, `confidenceDelta`. |
| Score math | 3 missing criticals = −90. With all criticals missing and no staleness/currency penalty: score = 10. With stale data: score = max(0, 10−15) = 0 → BLOCKED. |

---

## CC.3 — Stale Data Reduces Confidence

| Attribute | Detail |
|-----------|--------|
| Status | **PASS (documented)** |
| Evidence | `isStaleSnapshot()` in `data-confidence.ts`. Stale penalty = −15. Combined with missing criticals, the cumulative effect pushes score into BLOCKED range. |
| Known limitation | Stale penalty is flat at −15 regardless of freshness tier (AGING/STALE/CRITICAL apply same −15). AGING data technically warrants a smaller penalty. |
| Residual risk | LOW — documented acceptable trade-off. The staleness penalty supplements missing-data penalties; the combined effect is conservative (fail-closed). |

---

## CC.4 — Contradictions Between Snapshots

| Attribute | Detail |
|-----------|--------|
| Status | **GAP-P2** |
| Description | No detection of contradictory data between successive snapshots (e.g., revenue halving with no associated shock event, receivables increasing while order count drops). |
| Residual risk | MEDIUM — contradiction detection would improve diagnosis fidelity. Absence means the system accepts implausible data patterns without warning. |
| Mitigation present | The `MANDATORY_ADAPTIVE_RULE` in CLAUDE.md requires re-evaluation on shock events. Owners must actively log shock events; there is no automated cross-snapshot contradiction check. |
| Planned path | Future enhancement: cross-snapshot delta anomaly detection layer. |

---

## Confidence Tier Thresholds (as implemented)

| Tier | Score Range | Meaning |
|------|-------------|---------|
| HIGH | 85–100 | Strong evidence; diagnosis reliable |
| MEDIUM | 60–84 | Usable evidence; minor gaps |
| LOW | 30–59 | Significant gaps; diagnosis directional only |
| BLOCKED | 0–29 | Insufficient evidence; do not act on diagnosis |

Source: `confidenceTierFromScore()` in `src/domain/owner-finance/data-confidence.ts` lines 73–78.

---

## Confidence Delta Tracking

| Attribute | Detail |
|-----------|--------|
| Status | **FIXED (was P1 ME.1)** |
| Evidence | `confidenceDelta` included in `OWNER_FINANCE_DIAGNOSIS_RUN` and `OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE` audit event payloads. Delta is computed as current score minus previous cycle score. |
| Gap | No per-business confidence history chart in the UI (MA.2 GAP-P2). Delta is recorded in the audit log but not visualized. |

---

## Control Summary

| Control | Status | Severity |
|---------|--------|----------|
| CC.1 — Confidence tier gate (HIGH/MEDIUM/LOW/BLOCKED) | FIXED | was P1 |
| CC.2 — Missing criticals emit low-confidence event | FIXED | was P1 |
| CC.3 — Stale data penalty documented and acceptable | PASS | — |
| CC.4 — Contradiction detection across snapshots | GAP-P2 | P2 |
