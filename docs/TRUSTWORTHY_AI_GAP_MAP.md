# Trustworthy AI Gap Map — Mission 4

**Date:** 2026-06-23  
**Scope:** OpsIQ finance diagnosis domain mapped against NIST AI RMF, data quality standards, decision-support trust practices, and BI governance.

---

## NIST AI RMF — GOVERN

| Control | Current Evidence | Missing | Severity | Required Fix | Test Required |
|---------|-----------------|---------|----------|-------------|---------------|
| G.1 — AI risk policies | `OWNER_MODE_REAL_WORLD_READINESS_RULES.md` exists with hard rules | No machine-enforced policy check at runtime | P2 | Policy enforcement in service layer | Simulation: policy rules honored |
| G.2 — Accountability | `emitAuditEvent` called on all finance mutations | Audit chain hash uses wrong parameters (eventId used as eventName, wall-clock timestamp in verification) | P1 | Fix hash computation and verification | Unit: hash is deterministic and correct |
| G.3 — Risk tolerance | Unsafe-rec = 0, bad-rec = 0 hardcoded as blocking gates | No runtime enforcement gate in finance domain (only enforced via simulation tests) | P1 | Emit `ABSTENTION_INVOKED` when confidence < 30 | Simulation: low-confidence produces abstention flag |
| G.4 — Human oversight | Owner confirmation required for intake | Finance actions go directly to "proposed" status with no owner acknowledgement gate | P2 | Add accept/defer/reject workflow for proposed actions | Integration: owner cannot skip acceptance on critical actions |
| G.5 — Transparency | Source quality tier display (Strong/Moderate/Weak/Assumed) | Finance diagnosis confidence presented as number without tier label (HIGH/MEDIUM/LOW/BLOCKED) | P1 | Add `confidenceTier` to diagnosis result | Unit: tier maps correctly to score ranges |

---

## NIST AI RMF — MAP

| Control | Current Evidence | Missing | Severity | Required Fix | Test Required |
|---------|-----------------|---------|----------|-------------|---------------|
| M.1 — Context classification | Finance domain, Owner Mode context established | No runtime classification of data context (demo/real/synthetic) | P2 | Add `dataContext: "real" | "demo" | "synthetic"` flag | Unit: demo data lowers confidence |
| M.2 — Stakeholder mapping | Owner role confirmed via CAPABILITIES.OWNER_VIEW | No escalation path when confidence dangerously low | P1 | Low-confidence diagnosis triggers escalation banner | UI: banner shown when confidenceScore < 30 |
| M.3 — Impact assessment | survivalState computed and surfaced | survivalState not included in audit event payload | P2 | Add survivalState to OWNER_FINANCE_DIAGNOSIS_RUN payload | Audit: payload verified complete |
| M.4 — Negative impact identification | Evidence discipline hardened (Mission 3) | False positive opportunity findings were eliminated; 3 more remain borderline | P1 FIXED | Verified fixed in Mission 3 Phase E | Regression: 335/335 pass |

---

## NIST AI RMF — MEASURE

| Control | Current Evidence | Missing | Severity | Required Fix | Test Required |
|---------|-----------------|---------|----------|-------------|---------------|
| ME.1 — AI performance metrics | 335 simulation tests, 455 SMB tests | No confidence drift metric (is confidence declining across cycles for a business?) | P1 | Track confidence delta between cycles in audit payload | Service: drift logged in diagnosis audit event |
| ME.2 — Bias and fairness | Industry templates (retail/restaurant/etc.) | No systematic bias check across currency/industry combinations | P2 | Document known threshold variations by template | Testing: template-specific edge cases |
| ME.3 — Explainability metrics | Evidence fields populated on all findings | Findings display order puts critical last (severity: "asc" alphabetical; medium/low inverted) | P1 | Fix finding sort to correct severity order | Unit: sort order verified |
| ME.4 — Data quality metrics | `dataConfidenceScore` computed; staleness check | No structured freshness tier (fresh/aging/stale/critical) beyond binary stale flag | P1 | Add `freshnessTier` to `DataConfidenceResult` | Unit: tier boundaries correct |

---

## NIST AI RMF — MANAGE

| Control | Current Evidence | Missing | Severity | Required Fix | Test Required |
|---------|-----------------|---------|----------|-------------|---------------|
| MA.1 — Risk treatment | BLOCKED state in owner-mode abstention contracts | Finance diagnosis path does not connect to abstention contracts; always produces findings | P1 | Add `diagnosisConfidenceTier` flag; emit `OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE` when score < 30 | Audit: event emitted on low confidence |
| MA.2 — Residual risk monitoring | Simulation regression lock (335 tests) | No per-business confidence history tracking | P2 | Include previous cycle confidence in drift payload | Service: drift delta in audit event |
| MA.3 — Incident response | Error logging in all services | No defined escalation when diagnosis produces zero findings due to missing data vs. no-risk condition | P1 FIXED | Fixed in Mission 3: zero-findings now shows "missing data" caveat | UI: honest zero-finding message |
| MA.4 — Learning governance | `controlled-learning-*.service.ts` with 13 services | Finance outcomes feed learning admission gate | P2 | Verify learning gate checks `ownerConfirmed` on intake | Integration: unconfirmed intake cannot trigger learning |

---

## Explainability

| Control | Current Evidence | Missing | Severity | Required Fix | Test Required |
|---------|-----------------|---------|----------|-------------|---------------|
| EX.1 — Evidence used | `evidence: string[]` on every finding | Finance recommended action card missing `evidenceRationale` on finance page (FIXED Mission 3 OT-005) | FIXED | Added in Mission 3 | Regression |
| EX.2 — Evidence missing | `missingData: string[]` on every finding | `computeMissingInputsWithPriority` uses DB column names as display labels (e.g., "costOfGoods" not "Cost of Goods") | P1 | Fix display labels to human-friendly names | Unit: label format check |
| EX.3 — Rejected signals | | No explicit "rejected signals" field on findings — findings are generated when conditions are met, not documented when suppressed | P2 | Add suppression audit for findings that nearly fired (within 10% of threshold) | Future enhancement |
| EX.4 — Assumptions | `missingInputsRegistry` in diagnosis result | Registry exists but not displayed to owner in the UI (only missing inputs count shown) | P2 | Surface registry in UI | UI: registry visible |
| EX.5 — Why this / not alternatives | `evidenceRationale` on recommended actions | No "alternatives considered" field on recommendations | P2 | Document acknowledged gap |

---

## Auditability

| Control | Current Evidence | Missing | Severity | Required Fix | Test Required |
|---------|-----------------|---------|----------|-------------|---------------|
| AU.1 — Hash chain | `previousHash` stored on every event | `computeEventHash` uses `eventId` in `eventName` slot; `verifyAuditChainIntegrity` uses `new Date()` making it non-deterministic | P0 | Fix hash to use `eventName` and `occurredAt`; fix verification to use stored timestamps | Unit: verification is deterministic and correct |
| AU.2 — Complete record | All finance mutations emit audit events | `dataConfidenceScore` missing from `OWNER_FINANCE_DIAGNOSIS_RUN` payload | P1 | Add confidence score + tier to audit payload | Audit: payload contains confidence |
| AU.3 — Actor trace | `actorId` on all events | | PASS | | |
| AU.4 — Decision record | `OwnerDecision` model exists | No application-layer flow creates `OwnerDecision` records for finance actions | P2 | Document gap; wire in future phase |

---

## Data Quality

| Control | Current Evidence | Missing | Severity | Required Fix | Test Required |
|---------|-----------------|---------|----------|-------------|---------------|
| DQ.1 — Completeness | `calculateDataConfidence` scores completeness | Display labels use DB column names, not human labels | P1 | Fix labels in `computeMissingInputsWithPriority` | Unit |
| DQ.2 — Freshness | `isStaleSnapshot` (45-day threshold) | Binary stale/not-stale; no tiered freshness | P1 | Add `freshnessTier: "fresh" | "aging" | "stale" | "critical"` | Unit |
| DQ.3 — Consistency | Cross-field consistency check exists (`IQ-004` fixed) | No cross-check: revenue > total costs in a non-loss scenario | P2 | Document: `FIN_BELOW_BREAK_EVEN` covers this | Existing |
| DQ.4 — Anomaly detection | Soft-limit warnings on intake (Mission 3 IQ-006) | No anomaly flag when revenue = 0 but costs are present (possible data entry error) | P2 | Add `zero_revenue_with_costs` anomaly code | Intake engine |
| DQ.5 — Duplicates | `@@unique([businessId, periodStart, periodEnd])` on snapshot | Duplicate detection only at DB level; no user-facing warning if duplicate period detected | P2 | Add user-friendly error message | Service |

---

## Confidence Calibration

| Control | Current Evidence | Missing | Severity | Required Fix | Test Required |
|---------|-----------------|---------|----------|-------------|---------------|
| CC.1 — Cannot exceed evidence | `confidence = clampConfidence(dataConfidenceScore / 100)` on findings | No hard gate preventing diagnosis at confidence = 0 | P1 | Add `confidenceTier` and block strong recommendations below `LOW` tier | Unit: strong rec blocked at confidence 0 |
| CC.2 — Missing criticals reduce confidence | -30 per missing critical | 3 missing criticals → score 10 (not 0); diagnosis still runs and produces findings | P1 | Emit `OWNER_FINANCE_DIAGNOSIS_LOW_CONFIDENCE` when score < 30 | Audit: event emitted |
| CC.3 — Stale data reduces confidence | -15 for stale data | Stale penalty only -15; combined effect with missing criticals may still exceed 30 | P2 | Document: acceptable — staleness penalty supplements missing-data penalties |
| CC.4 — Contradictions reduce confidence | N/A | No contradiction detection between snapshots (e.g., revenue halved with no event) | P2 | Future enhancement |

---

## Human Oversight

| Control | Current Evidence | Missing | Severity | Required Fix | Test Required |
|---------|-----------------|---------|----------|-------------|---------------|
| HO.1 — Intake confirmation | `ownerConfirmed` gate on intake; atomic double-confirm guard | | PASS | | |
| HO.2 — Low-confidence escalation | `missingInputsWithPriority` shown on command center | No blocking banner when `dataConfidenceScore < 30` | P1 | Add low-confidence warning banner on finance page | UI: banner visible |
| HO.3 — Recommendation acknowledgement | Finance actions go to "proposed" status | No owner accept/reject/defer gate before actions become "active" | P2 | Document; wire in future work |
| HO.4 — High-impact approval | `unsafe_to_recommend` framework in owner-mode | Finance actions not wired through this framework | P2 | Document; wire in future work |

---

## Safety Controls

| Control | Current Evidence | Missing | Severity | Required Fix | Test Required |
|---------|-----------------|---------|----------|-------------|---------------|
| SC.1 — Unsafe rec = 0 | Enforced by simulation gate | Not enforced in runtime (only in test) | P2 | Document: test gate is the enforcement mechanism |
| SC.2 — Bad rec = 0 | Enforced by simulation gate | Same as SC.1 | P2 | Same |
| SC.3 — Scope gap abstention | Finance diagnosis always runs | No abstention when scope cannot be assessed (missing industry template) | P2 | Default to conservative thresholds when `industryTemplate` is null (already implemented via `resolveFinanceThresholds`) |

---

## Summary of P0/P1/P2 Gaps

| Priority | Count | Action |
|----------|-------|--------|
| P0 | 1 | AU.1: Audit hash chain broken — FIXING this phase |
| P1 | 9 | ME.3 (sort order), ME.4 (freshness tier), MA.1 (confidence tier + event), EX.2 (field labels), DQ.1 (labels), DQ.2 (freshness), CC.1 (gate), CC.2 (event), HO.2 (banner) — ALL FIXING this phase |
| P2 | 10+ | Documented; acceptable residual risk |
