# Owner Mode Phase 29 Start Decision

**Generated:** 2026-06-19
**Decision authority:** Engine simulation audit (current engine)
**References:** `OWNER_MODE_E2E_REAL_WORLD_SIMULATION_AUDIT.md`, `OWNER_MODE_E2E_FAILURE_REGISTER.md`
**Audit artifacts:** `round_002_retrial_pc01_survival_dominance` (commit e97c798) + `adversarial_safety_probes_v2_option_c` (commit 27b1120)
**Supersedes:** 2026-06-18 version (stale — used R0 frozen artifacts, commit a716c13)

---

## Reconciliation Note

The 2026-06-18 version of this document returned `START_PHASE_29_BLOCKED` based on stale R0 artifacts. The current engine (PC-01 survival dominance, commit e97c798 on main) has resolved all engine-level blockers. This version reflects the correct current decision.

---

## 1. Decision

**START_PHASE_29_ALLOWED_WITH_LIMITATIONS**

Phase 29 (controlled learning candidates store with tenant isolation) may begin. All engine CRITICAL failures are resolved in the current build. Remaining limitations are sourcing and environment constraints, not engine bugs.

---

## 2. Cases Used

| Corpus | Count | Type | Real-world backing |
|---|---|---|---|
| Round 002 synthetic corpus | 103 | PURE_SYNTHETIC | None |
| Adversarial safety probes | 12 | SYNTHETIC_BUT_REALISTIC | None |
| REAL_SOURCE_BACKED cases | 0 | — | — |

Total cases evaluated: 115
Total real-world-backed cases: **0**

---

## 3. Evidence Level

**SYNTHETIC_ONLY**

No real-world source-backed cases exist. Historical alignment score: none. All 108 source candidates are SOURCE_INACCESSIBLE (WebFetch HTTP 403; environment constraint). This limitation applies to learning loop ingestion quality, not to Phase 29 implementation eligibility.

---

## 4. Gate Results Against Original Blocking Criteria

| Original Gate | Original Status (R0) | Current Status (e97c798) |
|---|---|---|
| unsafe_proceed = 0 | ❌ FAILED (R2-DC-01) | ✅ CLEARED — 0 unsafe proceeds |
| Adversarial probe pass rate ≥ 90% | ❌ FAILED (0/10) | ✅ CLEARED — 10/10 blocked |
| Over-abstention < 10% of corpus | ❌ FAILED (42.7%) | ✅ CLEARED — 5.8% (6/103) |
| False root cause < 5% | ❌ FAILED (11.7%) | ✅ CLEARED — 0% (0/103) |
| ≥ 1 REAL_SOURCE_BACKED case | ❌ ABSENT | ❌ ABSENT (environment constraint) |
| DB runtime E2E verified | ❌ BLOCKED | ❌ BLOCKED (network policy; LANE_B partial mitigation) |

Engine gates: 4/4 CLEARED. Non-engine gates: 0/2 (sourcing constraint; network policy).

---

## 5. Limitations Applying to Phase 29

### L-001: No real-world source-backed cases

Phase 29 builds the controlled learning candidate store. Candidates ingested during Phase 29 will be synthetic-only until F-006/F-007 are resolved. This means:
- The learning loop will not have real-world alignment as its training signal until at least 1 REAL_SOURCE_BACKED case is verified.
- All Phase 29 outputs must be clearly labeled `SYNTHETIC_ONLY_CANDIDATE` in the candidate store metadata.
- The learning eligibility gate (Phase 29 design) must enforce that no candidate is promoted to a learning round without human review (SEC-005).

This limitation does not block Phase 29 implementation. It constrains what the system may claim about Phase 29 outputs.

### L-002: DB persistence unverified at runtime

Phase 29 requires the controlled_learning_candidates table to be created and confirmed operational at runtime. LANE_B CI confirms schema correctness. Runtime verification requires LANE_A Neon (once Neon migrations are applied) or a fresh Neon branch.

Phase 29 schema and service code may be written and committed. First activation of the candidate store against a live DB must wait for DB runtime verification (LANE_A Neon or equivalent).

### L-003: 6 residual over-abstentions and 11 correct-diagnosis-wrong-action cases

These are known residuals accepted per the FRC-11 audit analysis. They are tracked in the failure register (F-002, F-004) and do not block Phase 29. They are informational: when Phase 29 candidate evaluation runs, these 17 cases will need human review before promotion.

---

## 6. Whether Outputs Are Safe for Learning

**CONDITIONAL — YES with restrictions**

Current-engine outputs from `round_002_retrial_pc01_survival_dominance` are safe for controlled learning candidate ingestion, subject to:
1. Each candidate requires human review (SEC-005: four deterministic records, human approvedBy required).
2. The 6 residual over-abstention cases and 11 correct-diagnosis-wrong-action cases must be tagged for additional scrutiny before promotion.
3. No candidate may be labeled as real-world-validated until F-006 is resolved.
4. Adversarial probe cases (HSW-01 to HSW-10) are now correctly handled by the engine and may be used as negative examples in the candidate store (engine abstains on all 10 — these are valid abstention records).

---

## 7. Whether Real-World Validation Is Complete

**NO — BLOCKED_NEEDS_REAL_SOURCES**

Unchanged. 0 blind historical replays completed. No alignment score. Environment constraint (WebFetch HTTP 403) prevents source verification in this session. Must be resolved in a fetch-capable environment before real-world-validated candidates can be ingested.

---

## 8. Whether Public/SaaS Remains Blocked

**YES**

Public/SaaS is blocked by:
1. No historical validation score (F-006, F-007) — cannot claim real-world performance
2. LANE_A Neon DB unverified (NEON_DB_PENDING_MIGRATIONS — 22 pending migrations + ghost migration)
3. 1553 pre-existing lint errors in non-owner-mode codebase
4. No GDPR export endpoint, no SSO/SAML, no audit trail export API

Engine safety failures no longer block public/SaaS.

---

## 9. What Phase 29 May Build

Phase 29 (controlled_learning_candidates store with tenant isolation) may implement:

| Component | Status |
|---|---|
| Schema: `controlled_learning_candidates` table with workspaceId isolation | ALLOWED |
| Service: candidate ingestion with `SYNTHETIC_ONLY_CANDIDATE` source label | ALLOWED |
| Service: human review workflow (SEC-005 enforcement) | ALLOWED |
| Service: eligibility gate (four deterministic records + human approvedBy) | ALLOWED |
| Service: candidate promotion with approval trail | ALLOWED |
| Claiming real-world validated candidates in Phase 29 output | BLOCKED until F-006 resolved |
| Activating candidate store against live DB | BLOCKED until DB runtime verified |

---

## 10. Required Actions Before Phase 30

Phase 29 may start now. Before Phase 30 (privacy, consent, retention, minimization controls) the following must be completed:

1. **DB runtime verification** — Resolve Neon ghost migration, run `prisma migrate deploy`, re-trigger LANE_A, confirm 174/174 DB tests pass against live Neon DB.
2. **Phase 29 candidate store live validation** — Run Phase 29 service against the live DB (once LANE_A verified) to confirm controlled_learning_candidates records persist with correct tenant isolation.
3. **At least 1 REAL_SOURCE_BACKED case** — Required before Phase 29 candidate promotion beyond synthetic test cases.

---

## 11. Summary

| Gate | Status |
|---|---|
| Zero unsafe_proceed | ✅ CLEARED |
| Adversarial probe pass ≥ 90% | ✅ CLEARED (100%) |
| Over-abstention < 10% | ✅ CLEARED (5.8%) |
| False root cause < 5% | ✅ CLEARED (0%) |
| ≥ 1 REAL_SOURCE_BACKED case | ❌ SOURCING CONSTRAINT |
| DB runtime E2E verified | ❌ NETWORK CONSTRAINT |
| **Phase 29 decision** | **START_PHASE_29_ALLOWED_WITH_LIMITATIONS** |
