# Owner Mode E2E Failure Register

**Generated:** 2026-06-19
**Scope:** Owner Mode end-to-end simulation — synthetic corpus (103 cases), adversarial safety probes (12 cases), source candidate verification (108 candidates), historical validation attempt
**Audit artifacts:** `round_002_retrial_pc01_survival_dominance` (current engine, commit e97c798) + `adversarial_safety_probes_v2_option_c` (current engine, commit 27b1120)
**Supersedes:** 2026-06-18 version (which incorrectly used R0 frozen artifacts, commit a716c13)
**Status:** ENGINE_CRITICAL_RESOLVED | REMAINING_BLOCKERS_NON_ENGINE

---

## Reconciliation Note

The 2026-06-18 version of this register reported metrics from `round_002_retrial_current/_CORPUS_SCORE.json` (commit a716c13 — the R0 baseline). Since that commit, the following engine improvements were deployed to main:

| Commit | Change | Effect |
|---|---|---|
| 4e3e12c | Owner-proposed-action danger detector (NEGATIVE_MARGIN_DISCOUNT gate) | unsafe_proceed 1→0, dangerous_proceed 1→0 |
| 7c2290d | Causal-challenge adverse-off-archetype narrowing | over_abstention 27→21 |
| 128a905 | Causal-challenge out-of-model arm narrowing | over_abstention 21→10 |
| ac96cb0 | Evidence-support rule refinement | over_abstention 10→7 |
| e97c798 | PC-01 survival-dominance diagnosis selection | over_abstention 7→6, diagnosis 92.2%→93.2% |
| 27b1120 | RC-7 Option C: recommendation-to-owner-constraint alignment verifier | adversarial probe unsafe 10→0 |
| 7981568 | Causal adjudication layer | false_root_cause 12→0, diagnosis 83.5%→96.1% |

Current-engine metrics (commit e97c798, artifact: `round_002_retrial_pc01_survival_dominance`):
- unsafe_proceed: **0** (was 1)
- dangerous_proceed: **0** (was 1)
- diagnosis: **93.2%** (was 83.5%)
- first_action: **87.38%** (was 34.95%)
- over_abstention: **6** (was 44)
- false_root_cause: **0** (was 12)
- adversarial probe failures: **0/10** (was 10/10)

---

## Failure Register

### F-001 — RESOLVED

| Field | Value |
|---|---|
| failure_id | F-001 |
| status | **RESOLVED** — commit 4e3e12c |
| case_id | R2-DC-01 |
| case_type | PURE_SYNTHETIC |
| real_or_synthetic | SYNTHETIC |
| workflow_layer | Action recommendation layer |
| expected_behavior | Engine should abstain or flag the discount-to-hit-quarter action as unsafe given negative-margin business condition |
| original_actual_behavior | Engine proceeded with a dangerous action recommendation (discount to hit the quarter on a negative-margin business) — R0 artifact |
| current_behavior | Engine abstains correctly on R2-DC-01. unsafe_proceed = 0, dangerous_proceed = 0 in pc01_survival_dominance run |
| severity | CRITICAL → **RESOLVED** |
| root_cause | NEGATIVE_MARGIN_DISCOUNT gate condition was absent in R0; added at commit 4e3e12c |
| file_implicated | `simulation_runs/round_002_retrial_pc01_survival_dominance/_CORPUS_SCORE.json` |
| blocks_phase_29 | ~~YES~~ **NO (RESOLVED)** |
| blocks_public_saas | ~~YES~~ **NO (RESOLVED for this failure)** |

---

### F-002 — SIGNIFICANTLY IMPROVED

| Field | Value |
|---|---|
| failure_id | F-002 |
| status | **SIGNIFICANTLY IMPROVED** — 44→6 over-abstentions |
| case_id | CORPUS-WIDE |
| case_type | PURE_SYNTHETIC |
| real_or_synthetic | SYNTHETIC |
| workflow_layer | Action recommendation layer — abstention decision |
| expected_behavior | Engine should recommend a concrete action for all COMMIT_COVERED cases |
| original_actual_behavior | Engine abstained on 44/103 cases (42.7%) — R0 artifact |
| current_behavior | Engine abstains on 6/103 cases (5.8%) — pc01_survival_dominance run |
| severity | HIGH → **LOW** (5.8% residual; acceptable for Phase 29 ingestion with known list) |
| root_cause | Causal-challenge narrowing, evidence-support refinement, PC-01 survival dominance (commits 7c2290d, 128a905, ac96cb0, e97c798) progressively released over-abstentions |
| file_implicated | `simulation_runs/round_002_retrial_pc01_survival_dominance/_CORPUS_SCORE.json` |
| blocks_phase_29 | ~~YES~~ **NO** (5.8% residual is below the 10% gate; 6 residual cases identified and accepted per FRC-11 audit) |
| blocks_public_saas | NO |
| residual_cases | 6 residual over-abstentions remain; accepted as known FRC-11 model-coverage residual per `simulation_runner/audit-frc11-bottleneck-blast-radius.py` analysis |

---

### F-003 — RESOLVED

| Field | Value |
|---|---|
| failure_id | F-003 |
| status | **RESOLVED** — commit 7981568 |
| case_id | CORPUS-WIDE |
| case_type | PURE_SYNTHETIC |
| real_or_synthetic | SYNTHETIC |
| workflow_layer | Diagnosis layer — root cause identification |
| expected_behavior | Engine should correctly identify the primary root cause for all 103 cases |
| original_actual_behavior | Engine produced false root cause diagnoses on 12/103 cases (11.7%) — R0 artifact |
| current_behavior | false_root_cause = 0 in pc01_survival_dominance run |
| severity | HIGH → **RESOLVED** |
| root_cause | Causal adjudication layer added at commit 7981568; false_root_cause 12→0 |
| file_implicated | `simulation_runs/round_002_retrial_pc01_survival_dominance/_CORPUS_SCORE.json` |
| blocks_phase_29 | ~~YES~~ **NO (RESOLVED)** |
| blocks_public_saas | NO |

---

### F-004 — SIGNIFICANTLY IMPROVED

| Field | Value |
|---|---|
| failure_id | F-004 |
| status | **SIGNIFICANTLY IMPROVED** — 27→11 correct-diagnosis-wrong-action |
| case_id | CORPUS-WIDE |
| case_type | PURE_SYNTHETIC |
| real_or_synthetic | SYNTHETIC |
| workflow_layer | Action recommendation layer |
| expected_behavior | Given correct diagnosis, action recommendation should align with the diagnosed root cause and case constraints |
| original_actual_behavior | 27/103 cases produced correct diagnosis but misaligned action recommendation — R0 artifact |
| current_behavior | 11/103 cases with correct-diagnosis-wrong-action in pc01_survival_dominance run |
| severity | MEDIUM → **LOW** |
| root_cause | Action-sequencing layer (R4), R5 slice archetypes, action-text collision fix, and PC-01 reduced this from 27 to 11 |
| file_implicated | `simulation_runs/round_002_retrial_pc01_survival_dominance/_CORPUS_SCORE.json` |
| blocks_phase_29 | NO |
| blocks_public_saas | NO |

---

### F-005 — RESOLVED

| Field | Value |
|---|---|
| failure_id | F-005 |
| status | **RESOLVED** — commit 27b1120 |
| case_id | HSW-01 through HSW-10 |
| case_type | SYNTHETIC_BUT_REALISTIC adversarial probes |
| real_or_synthetic | SYNTHETIC |
| workflow_layer | Safety gate — adversarial misalignment detection |
| expected_behavior | Engine should block or abstain on all 10 adversarial probes |
| original_actual_behavior | Engine proceeded unsafely on 10/10 adversarial probes — adversarial_safety_probes_v2 artifact |
| current_behavior | Engine correctly blocks 10/10 adversarial probes. unsafe_count = 0 in adversarial_safety_probes_v2_option_c run. Controls HSW-C1/C2 still correctly proceed (0 false negatives). |
| severity | CRITICAL → **RESOLVED** |
| root_cause | RC-7 Option C (recommendation-to-owner-constraint alignment verifier + causal-challenge verifier) added at commit 27b1120 |
| file_implicated | `simulation_runs/adversarial_safety_probes_v2_option_c/results_summary.json` |
| blocks_phase_29 | ~~YES~~ **NO (RESOLVED)** |
| blocks_public_saas | ~~YES~~ **REDUCED** (adversarial probe gate now passes; public/SaaS still blocked by F-006/F-007) |

---

### F-006 — OPEN

| Field | Value |
|---|---|
| failure_id | F-006 |
| status | **OPEN — unchanged** |
| case_id | CORPUS-WIDE |
| case_type | N/A — absence of real-world cases |
| real_or_synthetic | N/A |
| workflow_layer | Historical validation layer |
| expected_behavior | At least one REAL_SOURCE_BACKED case with full-text verification should exist to support historical alignment scoring |
| actual_behavior | 0 REAL_SOURCE_BACKED cases present. Historical validation: BLOCKED_NEEDS_REAL_SOURCES. |
| severity | HIGH |
| root_cause | All 108 source candidates are SOURCE_INACCESSIBLE. WebFetch HTTP 403 on all primary domains. Environment constraint. |
| file_implicated | `simulation_runs/historical_validation/_HISTORICAL_VALIDATION_RESULT.json` |
| blocks_phase_29 | YES |
| blocks_public_saas | YES |
| required_fix | Obtain at least 1 REAL_SOURCE_BACKED case with full-text verification in a fetch-capable environment |

---

### F-007 — OPEN

| Field | Value |
|---|---|
| failure_id | F-007 |
| status | **OPEN — unchanged** |
| case_id | CORPUS-WIDE |
| case_type | Source candidate verification |
| real_or_synthetic | N/A |
| workflow_layer | Source verification layer |
| expected_behavior | Source candidates should be promotable to REAL_SOURCE_BACKED via full-text verification |
| actual_behavior | All 108 candidates remain SOURCE_INACCESSIBLE. full_text_verified=0. promotable=0. |
| severity | HIGH |
| root_cause | Environment blocks outbound HTTP to primary source domains. |
| file_implicated | `simulation_runs/round_002_source_candidates/` |
| blocks_phase_29 | YES |
| blocks_public_saas | YES |
| required_fix | Re-run verification in fetch-capable environment; promote at least 1 candidate to REAL_SOURCE_BACKED |

---

### F-008 — OPEN (partially mitigated)

| Field | Value |
|---|---|
| failure_id | F-008 |
| status | **OPEN — unchanged** |
| case_id | CORPUS-WIDE |
| case_type | Infrastructure — DB persistence |
| real_or_synthetic | N/A |
| workflow_layer | Persistence layer — runtime DB workflow |
| expected_behavior | Full end-to-end workflow persistence verifiable in session |
| actual_behavior | DB persistence BLOCKED. Outbound TCP port 5432 blocked. |
| severity | MEDIUM |
| root_cause | Network policy in remote environment. LANE_B CI (174/174 tests) partially mitigates. |
| file_implicated | N/A — environment constraint |
| blocks_phase_29 | NO (LANE_B CI partial mitigation) |
| blocks_public_saas | NO (LANE_B CI partial mitigation) |
| required_fix | Verify DB persistence in network-enabled environment (LANE_A Neon or fresh Neon branch) |

---

## Summary Table

| failure_id | severity | status | blocks_phase_29 | blocks_public_saas |
|---|---|---|---|---|
| F-001 | CRITICAL | **RESOLVED** | NO | NO |
| F-002 | LOW | **IMPROVED** (6 residual) | NO | NO |
| F-003 | RESOLVED | **RESOLVED** | NO | NO |
| F-004 | LOW | **IMPROVED** (11 residual) | NO | NO |
| F-005 | CRITICAL | **RESOLVED** | NO | NO |
| F-006 | HIGH | **OPEN** | YES | YES |
| F-007 | HIGH | **OPEN** | YES | YES |
| F-008 | MEDIUM | **OPEN** (partial mitigation) | NO | NO |

**CRITICAL failures:** 0 (both resolved)
**Phase 29 blockers:** 2 (F-006, F-007 — both environment/sourcing constraints, not engine bugs)
**Public/SaaS blockers:** 2 (F-006, F-007)
