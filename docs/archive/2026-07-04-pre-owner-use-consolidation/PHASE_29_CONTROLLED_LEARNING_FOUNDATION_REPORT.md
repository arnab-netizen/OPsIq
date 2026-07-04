# Phase 29: Controlled Learning System Foundation Report

**Generated:** 2026-06-19
**Phase:** 29 — Controlled Learning Candidate Store (Eligibility Gate Only)
**Branch:** `claude/cool-ptolemy-dxrpm7`
**Classification:** COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE
**Supersedes:** N/A (first implementation)

---

## 1. What Was Implemented

### A. Domain Module

**`src/domain/owner-mode/controlled-learning.ts`**

A deterministic, pure TypeScript eligibility classifier for controlled learning candidates. Implements:

| Component | Detail |
|---|---|
| `CandidateSourceLabel` | 3 source labels: SYNTHETIC_ONLY_CANDIDATE, HUMAN_VERIFIED_CANDIDATE, REAL_SOURCE_BACKED_CANDIDATE |
| `EvidenceOrigin` | 7 origins (4 allowed, 3 forbidden) |
| `ControlledLearningEligibilityStatus` | 12 eligibility statuses |
| `LearningCandidateRecord` | SEC-005 four deterministic records (ownerDecision, action, outcome, humanReview) |
| `classifyLearningCandidate()` | 15-rule eligibility gate with workspace scoping |
| `validateCandidatePromotion()` | SEC-005 promotion gate (human approvedBy + approvedAt required) |
| `buildCandidateAuditEntry()` | Append-only audit entry builder |
| `assertCandidateImmutable()` | Append-only invariant enforcer (throws on promoted record mutation) |

### B. Eligibility Rules Implemented (15 rules)

| Rule | Enforcement |
|---|---|
| CL-RULE-1 | All four SEC-005 record workspaceIds must match submission workspaceId |
| CL-RULE-2 | Cross-tenant origin rejected (terminal) |
| CL-RULE-3 | AI-generated evidence rejected (terminal) |
| CL-RULE-4 | Synthetic benchmark evidence rejected (terminal) |
| CL-RULE-5 | Search-snippet-only evidence rejected (non-terminal, needs full-text) |
| CL-RULE-6 | REAL_SOURCE_BACKED_CANDIDATE requires publicSourceFullTextVerified=true |
| CL-RULE-7 | Safety-related failure rejected (terminal) |
| CL-RULE-8 | Owner decision must be present and verdict must be "approved" |
| CL-RULE-9 | Action must have been taken |
| CL-RULE-10 | Outcome window must have elapsed |
| CL-RULE-11 | Conflicting evidence requires human review before promotion |
| CL-RULE-12 | Human approvedBy required for promotion (SEC-005) |
| CL-RULE-13 | Non-owner-supplied evidence without human approval is UNVERIFIED |
| CL-RULE-14 | REAL_SOURCE_BACKED_CANDIDATE with human approval → LEARNING_ELIGIBLE_VERIFIED_OUTCOME |
| CL-RULE-15 | Any candidate with human approval → LEARNING_ELIGIBLE_HUMAN_REVIEWED |

### C. Terminal Rejection Statuses (cannot be overturned by adding evidence)

- `LEARNING_INELIGIBLE_SYNTHETIC` — synthetic benchmark data
- `LEARNING_INELIGIBLE_AI_GENERATED` — AI-generated evidence
- `LEARNING_INELIGIBLE_CROSS_TENANT` — cross-workspace origin
- `LEARNING_INELIGIBLE_SAFETY_RELATED` — safety-related failure involvement

### D. Promotion-Allowed Statuses (2 statuses)

- `LEARNING_ELIGIBLE_VERIFIED_OUTCOME` — real-world source with full-text verification + human approval
- `LEARNING_ELIGIBLE_HUMAN_REVIEWED` — human-approved candidate (may be synthetic)

### E. Test Suite

**`src/__tests__/domain/owner-mode/controlled-learning.test.ts`**

60+ tests covering:
- Workspace scoping enforcement (empty, whitespace)
- All 12 eligibility statuses
- All 15 rules (positive and negative paths)
- Append-only invariant
- Promotion gate (SEC-005)
- Audit entry builder
- No engine mutation (deterministic, idempotent)
- Constant table coverage

---

## 2. What Is Explicitly NOT Implemented

| Not Implemented | Reason |
|---|---|
| Database persistence of candidates | Blocked: NEON_DB_PENDING_MIGRATIONS (L-002) |
| Candidate store API routes | Phase 29 scope: eligibility gate only |
| Learning round activation | Absolute stop condition — no automatic learning |
| Engine modification | Absolute stop condition — diagnosis/safety unchanged |
| Benchmark modification | Absolute stop condition |
| Public/SaaS promotion | Blocked pending historical validation (L-001) |
| Real-world-validated candidate promotion | Blocked: 0 REAL_SOURCE_BACKED cases (F-006/F-007) |
| Cross-tenant learning aggregation | Prohibited by CL-RULE-2 |
| Model fine-tuning | Out of scope; no automatic self-improvement |
| UI/UX for candidate store | Deferred to Phase 30+ |

---

## 3. Why Engine Behavior Is Unchanged

This module is a pure classification function. It:
- Makes no calls to the diagnosis engine, scorer, or recommendation engine
- Reads no persisted AI state
- Emits no learning signals
- Has no side effects (domain module only; DB writes must be performed by callers)
- Does not alter any engine weights, thresholds, or benchmarks

Engine behavior (PC-01 survival dominance, commit e97c798) is identical before and after this commit.

---

## 4. What Data Is Eligible vs. Forbidden

### Eligible (may be ingested as candidates)

| Data Type | Label | Condition |
|---|---|---|
| Owner-supplied operational data | HUMAN_VERIFIED_CANDIDATE or SYNTHETIC_ONLY_CANDIDATE | Human approvedBy required for promotion |
| Full-text verified real-world case | REAL_SOURCE_BACKED_CANDIDATE | Full-text verification + human approvedBy |
| System-computed outcomes | HUMAN_VERIFIED_CANDIDATE | Human approvedBy required |

### Forbidden (terminal rejections)

| Data Type | Status |
|---|---|
| Synthetic benchmark corpus (round_002, adversarial probes) | LEARNING_INELIGIBLE_SYNTHETIC |
| AI-generated evidence (engine outputs as training signal) | LEARNING_INELIGIBLE_AI_GENERATED |
| Search-snippet-only source candidates (108 current candidates) | LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED |
| Cross-workspace data | LEARNING_INELIGIBLE_CROSS_TENANT |
| Safety-related failure cases | LEARNING_INELIGIBLE_SAFETY_RELATED |

---

## 5. Why Public/SaaS Remains Blocked

Phase 29 implementation does not change public/SaaS readiness. Public/SaaS is blocked by:

1. **No historical validation score** (F-006, F-007) — 0 REAL_SOURCE_BACKED cases; WebFetch HTTP 403 blocks all source verification
2. **NEON_DB_PENDING_MIGRATIONS** — 22 pending migrations + 1 ghost migration; LANE_A unverified
3. **1553 pre-existing lint errors** in non-owner-mode codebase
4. **No GDPR export endpoint, no SSO/SAML, no audit trail export API**

Phase 29 eligibility gate code is implementation-ready. Activation against live DB requires LANE_A Neon verification first.

---

## 6. Requirements Before Phase 29 Candidate Store Goes Live

1. **DB runtime verification** — Resolve ghost migration, run `prisma migrate deploy`, confirm LANE_A passes
2. **Schema creation** — `controlled_learning_candidates` table (deferred to Phase 29 DB slice once LANE_A verified)
3. **At least 1 REAL_SOURCE_BACKED case** — Required before any candidate can claim `LEARNING_ELIGIBLE_VERIFIED_OUTCOME`

---

## 7. Classification

| Gate | Status |
|---|---|
| `npx tsc --noEmit` | ✅ PASS |
| `npx prisma validate` | ✅ PASS |
| Controlled-learning tests | ✅ 60+ tests pass |
| Engine mutation | ✅ NONE |
| DB dependency | ⏭ DB_BLOCKED (schema deferred to LANE_A verification) |
| **Overall** | **COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE** |

---

## 8. Wiring Proof

This module is a domain-layer eligibility classifier. It is not yet wired to an API route or service — that requires the `controlled_learning_candidates` DB table to exist (LANE_A verified).

- **Caller:** Not yet wired (WIRED_NOT_CALLED pending DB + API slice)
- **Input:** `ControlledLearningCandidateInput` (workspace-scoped)
- **Output:** `ControlledLearningEligibilityResult` (plain data, no DB writes)
- **Workspace Enforcement:** `assertWorkspaceScopedQuery` enforced at all entry points
- **Auth Enforcement:** Deferred to API route slice (CAPABILITY.LEARNING_CANDIDATE_SUBMIT)
- **DTO Boundary:** No DB-persisted records in this module
- **Audit Events:** `buildCandidateAuditEntry()` produces audit entries; callers must persist
- **Test Coverage:** 60+ tests in `src/__tests__/domain/owner-mode/controlled-learning.test.ts`
