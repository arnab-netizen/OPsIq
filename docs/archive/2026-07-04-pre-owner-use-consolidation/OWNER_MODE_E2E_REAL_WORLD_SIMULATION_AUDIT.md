# Owner Mode E2E Real-World Simulation Audit

**Generated:** 2026-06-19
**Scope:** Owner Mode end-to-end simulation — historical validation attempt, source candidate verification, synthetic workflow simulation, adversarial safety probes, DB persistence, owner decision gate, outcome tracking, reassessment, safety
**Audit artifacts:** `round_002_retrial_pc01_survival_dominance` (commit e97c798) + `adversarial_safety_probes_v2_option_c` (commit 27b1120)
**Supersedes:** 2026-06-18 version (stale — used R0 frozen artifacts, commit a716c13, not current engine)
**Overall status:** PHASE_29_ALLOWED_WITH_LIMITATIONS | PUBLIC_SAAS_BLOCKED

---

## Reconciliation Note

The 2026-06-18 audit was **STALE / INVALID_FOR_PHASE_29_DECISION**. It read `simulation_runs/round_002_retrial_current/_CORPUS_SCORE.json` which is the frozen R0 baseline (commit a716c13, 2026-06-18 00:35:37). Between R0 and the current engine (commit e97c798, PC-01 survival dominance), 10 engine improvement commits shipped to main, resolving all CRITICAL failures. This document reflects the correct current-engine metrics.

---

## 1. Executive Summary

This audit reflects the current engine state (PC-01 survival dominance, commit e97c798 on main).

**Key findings:**

- Historical validation is BLOCKED. Zero REAL_SOURCE_BACKED cases exist. All 108 source candidates are SOURCE_INACCESSIBLE. This is an environment and sourcing constraint, not an engine failure.
- Synthetic workflow simulation (103 cases, current engine): diagnosis 93.2%, first action 87.38%, unsafe_proceed 0, dangerous_proceed 0, over_abstention 6 (5.8%).
- Adversarial safety probes (current engine): 0/10 proceeded_unsafe. All 10 adversarial probes correctly blocked. Controls HSW-C1/C2 correctly proceed.
- DB persistence is blocked by network policy. LANE_B CI provides partial mitigation (174/174 tests).
- Owner decision gate passes at 100% for applicable cases (83/83 on evidence use and constraint fit).
- Engine CRITICAL failures (F-001 unsafe_proceed, F-005 adversarial probes) are both RESOLVED in the current build.
- Phase 29 is ALLOWED_WITH_LIMITATIONS. Remaining blockers are sourcing/environment constraints (F-006, F-007), not engine bugs.
- Public/SaaS remains blocked pending real-world historical validation.

---

## 2. Real-World Case Discovery Counts

| Source | Cases Found | Status |
|---|---|---|
| `simulation_runs/historical_validation/` | 0 | casesPresent: 0, blindReplaysCompleted: 0, scores: null |
| `simulation_runs/round_002_source_candidates/` | 108 source candidates | All SOURCE_INACCESSIBLE; 0 full_text_verified; 0 promotable |
| `simulation_runs/round_002/` | 103 cases | All PURE_SYNTHETIC; all valid: true |
| `simulation_runs/adversarial_safety_probes_v2*/` | 12 cases (5 run variants) | All SYNTHETIC_BUT_REALISTIC; no real-world source backing |

**Total REAL_SOURCE_BACKED cases: 0**

---

## 3. REAL_SOURCE_BACKED Case Count and Why Historical Validation Is BLOCKED

REAL_SOURCE_BACKED cases: **0** (unchanged)

Historical validation requires at least one case with confirmed full-text source verification from a primary domain. The historical validation README states: "0 source-verified cases present. The environment cannot perform full-text source verification (WebFetch returns HTTP 403 on primary domains; web archive disallowed; search snippets are explicitly not verification per the source standard)."

This is an environment and sourcing constraint. It does not reflect engine quality; the engine metrics have improved substantially. Historical validation status: **BLOCKED_NEEDS_REAL_SOURCES**.

---

## 4. Source Candidate Classification Table

| Metric | Value |
|---|---|
| Total source candidates authored | 108 |
| Slices covered | slice_1, slice_2, slice_3 |
| Classification for all 108 | SEARCH_SNIPPET_ONLY |
| verification_status for all sampled | SOURCE_INACCESSIBLE |
| full_text_verified (all 108) | 0 |
| promotable (all 108) | 0 |
| Cause of SOURCE_INACCESSIBLE | WebFetch HTTP 403 on all primary domains; web archive access disallowed |

No candidate qualifies for promotion. The 108 candidates remain as unverified search-snippet records only.

---

## 5. Blind Historical Replay Result

**Result: BLOCKED_NEEDS_REAL_SOURCES** (unchanged)

- Blind replays completed: 0
- Historical alignment score: none
- Reason: 0 REAL_SOURCE_BACKED cases; environment constraint blocks full-text verification

---

## 6. Synthetic Workflow Simulation Results

> **Label: NON_HISTORICAL_WORKFLOW_SIMULATION**
> All results below are from synthetic benchmark cases. None are backed by real-world sources.

### 6a. 103-Case Synthetic Corpus — Current Engine

| | R0 Baseline (a716c13) | **Current Engine (e97c798)** | Delta |
|---|---|---|---|
| Artifact | `round_002_retrial_current` | `round_002_retrial_pc01_survival_dominance` | — |
| Diagnosis pass | 86/103 = 83.5% | **96/103 = 93.2%** | +9.7 pp |
| Evidence use pass | 57/57 = 100% | **83/83 = 100%** | 0 |
| First action pass | 36/103 = 34.95% | **90/103 = 87.38%** | +52.4 pp |
| Constraint fit pass | 57/57 = 100% | **83/83 = 100%** | 0 |
| Safety outcome pass | 58/103 = 56.31% | **97/103 = 94.17%** | +37.9 pp |
| Abstention pass | 22/23 = 95.65% | **23/23 = 100%** | +4.3 pp |
| unsafe_proceed | **1** | **0** | −1 |
| dangerous_proceed | **1** | **0** | −1 |
| over_abstention | **44** | **6** | −38 |
| false_root_cause | **12** | **0** | −12 |
| correct_diagnosis_wrong_action | **27** | **11** | −16 |
| wrong_priority | **1** | **0** | −1 |

**Class counts (current engine):**

| Class | Count |
|---|---|
| COMMIT_COVERED | 77 |
| ABSTAIN_EXPECTED | 13 |
| UNCOVERED | 13 |

### 6b. Adversarial Safety Probes — Current Engine

| | Original (8cc10fe) | **Current Engine (27b1120)** | Delta |
|---|---|---|---|
| Artifact | `adversarial_safety_probes_v2` | `adversarial_safety_probes_v2_option_c` | — |
| Adversarial probes (HSW-01–10) proceeded_unsafe | **10/10** | **0/10** | −10 |
| Controls (HSW-C1, HSW-C2) proceeded_unsafe | 0/2 | **0/2** | 0 |
| Correctly blocked | 0/10 | **10/10** | +10 |

The engine now blocks all 10 adversarial misalignment subtypes (MISALIGNED_ROOT_CAUSE, OWNER_CONSTRAINT_VIOLATION, CAUSATION_VS_CORRELATION, DANGEROUS_ACTION) while correctly proceeding on the two control cases.

---

## 7. DB Persistence Result

**Result: DB_BLOCKED** (unchanged)

Outbound TCP port 5432 blocked by network policy. LANE_B CI partial mitigation: 174/174 tests against postgres:16 throwaway container.

---

## 8. Owner Decision Gate Result

**Result: PASS for all applicable cases**

| Metric | R0 | Current |
|---|---|---|
| Evidence use pass | 57/57 = 100% | 83/83 = 100% |
| Constraint fit pass | 57/57 = 100% | 83/83 = 100% |
| Over-abstention depriving gate | 44 cases | **6 cases** |

Gate enforcement is 100% for all cases that reach it. Over-abstention now affects only 6 cases (down from 44).

---

## 9. Outcome Tracking Result

**Result: UNTESTABLE in this session** (unchanged)

DB persistence blocked. Domain layer outcome-tracking tests pass in LANE_B CI.

---

## 10. Reassessment Result

**Result: UNTESTABLE end-to-end in this session** (unchanged)

DB persistence blocked. Domain layer reassessment logic confirmed correct.

---

## 11. Safety Result

**Result: PASS on all engine-testable safety checks**

| Safety check | R0 | Current |
|---|---|---|
| Evidence use enforcement | PASS 100% | PASS 100% |
| Constraint fit enforcement | PASS 100% | PASS 100% |
| unsafe_proceed in corpus | FAIL (1 case) | **PASS (0)** |
| dangerous_proceed in corpus | FAIL (1 case) | **PASS (0)** |
| Adversarial probe blocking (10 probes) | FAIL (10/10) | **PASS (0/10)** |
| Adversarial control handling (2 controls) | PASS | PASS |

All CRITICAL safety failures are resolved in the current engine.

---

## 12. Failure Register Summary

Full failure register: `OWNER_MODE_E2E_FAILURE_REGISTER.md`

| failure_id | severity | status | blocks_phase_29 | blocks_public_saas |
|---|---|---|---|---|
| F-001 | CRITICAL | **RESOLVED** | NO | NO |
| F-002 | LOW | **IMPROVED** (6 residual) | NO | NO |
| F-003 | — | **RESOLVED** | NO | NO |
| F-004 | LOW | **IMPROVED** (11 residual) | NO | NO |
| F-005 | CRITICAL | **RESOLVED** | NO | NO |
| F-006 | HIGH | **OPEN** | YES | YES |
| F-007 | HIGH | **OPEN** | YES | YES |
| F-008 | MEDIUM | **OPEN** (partial mitigation) | NO | NO |

---

## 13. Whether Phase 29 May Start

**YES — with limitations**

See `OWNER_MODE_PHASE_29_START_DECISION.md`. Engine CRITICAL failures are resolved. Remaining blockers (F-006, F-007) are sourcing/environment constraints that do not block Phase 29 implementation — they block the learning loop from ingesting real-world-validated cases (which Phase 29 explicitly defers).

---

## 14. Whether Learning Loop May Ingest Any Outputs

**CONDITIONAL**

Synthetic outputs from the current engine may be ingested as controlled learning candidates under Phase 29, subject to the four eligibility gates in the learning eligibility domain (SEC-005: four deterministic records, human approvedBy required). unsafe_proceed = 0 clears the primary disqualification condition.

Restriction: No historical-alignment-scored real-world outputs may be ingested because no REAL_SOURCE_BACKED cases exist.

---

## 15. Whether Public/SaaS Remains Blocked

**YES**

Public/SaaS remains blocked by:
- No historical validation (F-006, F-007): no external alignment score exists
- LANE_A Neon DB unverified (NEON_DB_PENDING_MIGRATIONS)
- 1553 pre-existing lint errors in non-owner-mode codebase
- No GDPR export endpoint, no SSO/SAML, no audit trail export API (per final-improvement-report.md)

Engine safety failures no longer block public/SaaS; the remaining blockers are sourcing, infrastructure, and compliance gaps.
