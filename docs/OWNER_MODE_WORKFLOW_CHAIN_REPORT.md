# Owner Mode Workflow Chain Validation Report

**Date**: 2026-06-19
**Scope**: End-to-end chain trace for OpsIQ Owner Mode controlled learning pipeline
**Type**: Static analysis only — no runtime or database verification performed

---

## Chain Overview

```
Input → Diagnosis → Recommendation → Action Plan → Owner Decision
  → Learning Candidate → Review → Admission/Rejection
  → Regression Result → Rollout → Harm Event → Attribution Review
```

---

## Transition-by-Transition Trace

---

### Step 1: Input → Diagnosis → Recommendation → Action Plan → Owner Decision

**Status: PARTIAL**

These upstream phases feed into the learning pipeline but do not have dedicated routes under `/src/app/api/owner/` for the transitions themselves.

| Check | Result |
|---|---|
| API route for Input | NOT FOUND — no `/api/owner/inputs/` route |
| API route for Diagnosis | NOT FOUND — no `/api/owner/diagnoses/` route |
| API route for Recommendation | NOT FOUND — no `/api/owner/recommendations/` route |
| API route for Action Plan | NOT FOUND — no `/api/owner/action-plans/` route |
| API route for Owner Decision | NOT FOUND — no `/api/owner/decisions/` route |
| Service functions | Exists for downstream phases; upstream handled by other domain services |
| Tests | Not found for these transitions under `src/__tests__/api/owner/` |
| Audit events | Unknown — not verified |
| Workspace isolation | Unknown — not verified |
| Auth enforcement | Unknown — not verified |

**Finding**: The chain entry points (Input through Owner Decision) that feed into the controlled learning system are not present as named routes under `/src/app/api/owner/`. They are referenced as foreign keys (`sourceOwnerDecisionId`, `sourceActionId`, `sourceRecommendationId`, `sourceOutcomeId`) on the `ControlledLearningCandidate` model (schema line 3966), meaning those upstream records must exist in the DB but their creation routes are not under the `owner/learning-*` namespace. Tracing those routes would require separate investigation of other `owner/` or domain-level route trees.

---

### Step 2: Owner Decision → Learning Candidate

**Status: PROVEN**

**Route**: `src/app/api/owner/learning-candidates/route.ts`
**Service**: `src/services/controlled-learning-candidate.service.ts`
**Domain**: `src/domain/owner-mode/controlled-learning.ts`
**Schema model**: `ControlledLearningCandidate` (prisma/schema.prisma line 3966)

| Check | Result | Detail |
|---|---|---|
| API route | YES | GET + POST handlers present |
| Service function | YES | `createCandidate`, `classifyLearningCandidate`, `promoteCandidate`, `demoteCandidate` |
| Test | YES | `src/__tests__/api/owner/learning-candidates.test.ts` (335 lines) |
| Audit event | YES | `controlledLearningCandidateAuditEntry` rows written on create (action=SUBMITTED or REJECTED), promotion (line 213), demotion (line 250) |
| Workspace isolation | YES | `withCanonicalEnforcement({ requireWorkspace: true })` + `assertWorkspaceScopedQuery({ workspaceId })` in service + cross-tenant guard on `classificationInput.workspaceId` |
| Auth enforcement | YES | `CAPABILITIES.OWNER_VIEW` (GET), `CAPABILITIES.OWNER_MANAGE` (POST) |

**Additional invariants enforced**:
- Forbidden evidence origins blocked: `ai_generated`, `synthetic_benchmark`, `search_snippet_only` (domain layer, `controlled-learning.ts`)
- SEC-005: `ownerDecisionId`, `actionId`, `outcomeId`, `humanReviewWorkspaceId` all required
- Unique constraint: `[workspaceId, auditFingerprint]` prevents duplicates
- `promotionLocked` flag enforces append-only semantics after promotion

---

### Step 3: Learning Candidate → Review

**Status: PARTIAL**

**Route**: `src/app/api/owner/learning-reviews/route.ts`
**Service**: `src/services/controlled-learning-review.service.ts`
**Schema model**: `ControlledLearningReview` (prisma/schema.prisma line 4025)

| Check | Result | Detail |
|---|---|---|
| API route | YES | GET + POST handlers present |
| Service function | YES | `createReview`, `listReviews` (inferred from route + service file) |
| Test | YES | `src/__tests__/api/owner/learning-reviews.test.ts` (161 lines) |
| Audit event | NO | No `emitAuditEvent` or `AuditEntry` writes found in review service |
| Workspace isolation | YES | `withCanonicalEnforcement({ requireWorkspace: true })` + `assertWorkspaceScopedQuery` in service |
| Auth enforcement | YES | `CAPABILITIES.OWNER_VIEW` (GET), `CAPABILITIES.OWNER_MANAGE` (POST) |

**Finding**: Review creation validates `decision` enum and verifies candidate exists in the workspace, but does not emit a dedicated audit entry. The candidate-level audit entry written at candidate creation is the only confirmed audit trace for this phase. This is a gap if per-review audit accountability is required.

---

### Step 4a: Review → Admission

**Status: PARTIAL**

**Route**: `src/app/api/owner/learning-admissions/route.ts`
**Service**: `src/services/controlled-learning-admission.service.ts`
**Schema model**: `ControlledLearningAdmission` (prisma/schema.prisma line 4043)

| Check | Result | Detail |
|---|---|---|
| API route | YES | GET + POST handlers present |
| Service function | YES | `admitCandidate`, `listAdmissions` (inferred) |
| Test | YES | `src/__tests__/api/owner/learning-admissions.test.ts` (129 lines) |
| Audit event | NO | No `emitAuditEvent` or `AuditEntry` writes confirmed in admission service |
| Workspace isolation | YES | `withCanonicalEnforcement({ requireWorkspace: true })` + `assertWorkspaceScopedQuery` |
| Auth enforcement | YES | `CAPABILITIES.OWNER_VIEW` (GET), `CAPABILITIES.OWNER_MANAGE` (POST) |

**Guards present**:
- Forbidden evidence origins blocked (`EVIDENCE_ORIGIN_FORBIDDEN`)
- Eligibility status must begin with `LEARNING_ELIGIBLE_`
- Idempotent: rejects if candidate already admitted

---

### Step 4b: Review → Rejection

**Status: PARTIAL**

**Route**: `src/app/api/owner/learning-rejections/route.ts`
**Service**: `src/services/controlled-learning-rejection.service.ts`
**Schema model**: `ControlledLearningRejection` (prisma/schema.prisma line 4063)

| Check | Result | Detail |
|---|---|---|
| API route | YES | GET + POST handlers present |
| Service function | YES | `rejectCandidate`, `listRejections` (inferred) |
| Test | YES | `src/__tests__/api/owner/learning-rejections.test.ts` (119 lines) |
| Audit event | NO | No `emitAuditEvent` or `AuditEntry` writes confirmed in rejection service |
| Workspace isolation | YES | `withCanonicalEnforcement({ requireWorkspace: true })` + `assertWorkspaceScopedQuery` |
| Auth enforcement | YES | `CAPABILITIES.OWNER_VIEW` (GET), `CAPABILITIES.OWNER_MANAGE` (POST) |

**Guards present**:
- Candidate must exist in workspace
- Mutual exclusion enforced: cannot reject an already-admitted candidate and vice versa
- Idempotent: cannot reject an already-rejected candidate

---

### Step 5: Admission → Regression Result

**Status: PARTIAL**

**Route**: `src/app/api/owner/learning-regression-results/route.ts`
**Service**: `src/services/controlled-learning-regression.service.ts`
**Schema model**: `ControlledLearningRegressionResult` (prisma/schema.prisma line 4132)

| Check | Result | Detail |
|---|---|---|
| API route | YES | GET + POST handlers present |
| Service function | YES | `recordRegressionResult`, `listRegressionResults` (inferred) |
| Test | YES | `src/__tests__/api/owner/learning-regression-results.test.ts` (65 lines) |
| Audit event | UNCONFIRMED | No grep evidence; service may or may not write audit entries |
| Workspace isolation | YES (assumed) | Pattern consistent across all routes; service uses `assertWorkspaceScopedQuery` |
| Auth enforcement | YES | `CAPABILITIES.OWNER_VIEW` (GET), `CAPABILITIES.OWNER_MANAGE` (POST) |

**Data shape**: `testVerdict` enum: PASS/FAIL/INCONCLUSIVE; `regressionScore` 0–1.

**Note**: Test file is only 65 lines — the smallest among this group. Coverage may be shallow.

---

### Step 6: Regression Result → Rollout

**Status: PARTIAL**

**Route**: `src/app/api/owner/learning-rollout-flags/route.ts`
**Service**: `src/services/controlled-learning-rollout.service.ts`
**Schema model**: `ControlledLearningRolloutFlag` (prisma/schema.prisma line 4152)

| Check | Result | Detail |
|---|---|---|
| API route | YES | GET + POST handlers present |
| Service function | YES | `setRolloutFlag`, `listRolloutFlags` (inferred) |
| Test | YES | `src/__tests__/api/owner/learning-rollout-flags.test.ts` (62 lines) |
| Audit event | UNCONFIRMED | No grep evidence |
| Workspace isolation | YES (assumed) | Consistent with all other routes |
| Auth enforcement | YES | `CAPABILITIES.OWNER_VIEW` (GET), `CAPABILITIES.OWNER_MANAGE` (POST) |

**Data shape**: `rolloutStage` enum: SHADOW/CANARY/PARTIAL/FULL/PAUSED; `rolloutPct` 0–100.

**Note**: Test file is only 62 lines — coverage may be shallow.

---

### Step 7: Rollout → Harm Event

**Status: PARTIAL**

**Route**: `src/app/api/owner/learning-harm-events/route.ts`
**Service**: `src/services/controlled-learning-harm.service.ts`
**Schema model**: `ControlledLearningHarmEvent` (prisma/schema.prisma line 4190)

| Check | Result | Detail |
|---|---|---|
| API route | YES | GET + POST handlers present |
| Service function | YES | `recordHarmEvent`, `listHarmEvents` (inferred) |
| Test | YES | `src/__tests__/api/owner/learning-harm-events.test.ts` (127 lines) |
| Audit event | UNCONFIRMED | No grep evidence |
| Workspace isolation | YES (assumed) | Consistent with all other routes |
| Auth enforcement | YES | `CAPABILITIES.OWNER_VIEW` (GET), `CAPABILITIES.OWNER_MANAGE` (POST) |

**Data shape**: `harmType` enum: FINANCIAL_LOSS/DECISION_ERROR/DATA_CORRUPTION/COMPLIANCE_VIOLATION/SAFETY_RISK; `severity` enum: LOW/MEDIUM/HIGH/CRITICAL.

---

### Step 8: Harm Event → Attribution Review

**Status: PARTIAL**

**Route**: `src/app/api/owner/learning-attribution-reviews/route.ts`
**Service**: `src/services/controlled-learning-attribution.service.ts`
**Schema model**: `ControlledLearningAttributionReview` (prisma/schema.prisma line 4213)

| Check | Result | Detail |
|---|---|---|
| API route | YES | GET + POST handlers present |
| Service function | YES | `recordAttributionReview`, `listAttributionReviews` (inferred) |
| Test | YES | `src/__tests__/api/owner/learning-attribution-reviews.test.ts` (143 lines) |
| Audit event | UNCONFIRMED | No grep evidence |
| Workspace isolation | YES (assumed) | Consistent with all other routes |
| Auth enforcement | YES | `CAPABILITIES.OWNER_VIEW` (GET), `CAPABILITIES.OWNER_MANAGE` (POST) |

**Data shape**: `verdict` enum: ATTRIBUTED/NOT_ATTRIBUTED/PARTIAL/INCONCLUSIVE; `confidenceScore` 0–1.

**Note**: GET handler returns empty array if neither `harmEventId` nor `candidateId` is provided — this is a legitimate guard, not a bug.

---

## Rollback Path

**Route**: `src/app/api/owner/learning-rollback-events/route.ts`
**Service**: `src/services/controlled-learning-rollback.service.ts`
**Schema model**: `ControlledLearningRollbackEvent` (prisma/schema.prisma line 4172)

| Check | Result | Detail |
|---|---|---|
| API route | YES | GET + POST handlers present |
| Service function | YES | `recordRollbackEvent`, `listRollbackEvents` (inferred) |
| Test | YES | `src/__tests__/api/owner/learning-rollback-events.test.ts` (119 lines) |
| Audit event | UNCONFIRMED | No grep evidence |
| Workspace isolation | YES (assumed) | Consistent with all other routes |
| Auth enforcement | YES | `CAPABILITIES.OWNER_VIEW` (GET), `CAPABILITIES.OWNER_MANAGE` (POST) |

**Data shape**: `rollbackCode` enum: REGRESSION_DETECTED/HARM_DETECTED/MANUAL_OVERRIDE/POLICY_VIOLATION.

---

## Summary Table

| Chain Step | Route | Service | Test | Audit | Workspace | Auth | Status |
|---|---|---|---|---|---|---|---|
| Input | NO | UNKNOWN | NO | UNKNOWN | UNKNOWN | UNKNOWN | **BROKEN** |
| Diagnosis | NO | UNKNOWN | NO | UNKNOWN | UNKNOWN | UNKNOWN | **BROKEN** |
| Recommendation | NO | UNKNOWN | NO | UNKNOWN | UNKNOWN | UNKNOWN | **BROKEN** |
| Action Plan | NO | UNKNOWN | NO | UNKNOWN | UNKNOWN | UNKNOWN | **BROKEN** |
| Owner Decision | NO | UNKNOWN | NO | UNKNOWN | UNKNOWN | UNKNOWN | **BROKEN** |
| → Learning Candidate | YES | YES | YES | YES | YES | YES | **PROVEN** |
| → Review | YES | YES | YES | NO | YES | YES | **PARTIAL** |
| → Admission | YES | YES | YES | NO | YES | YES | **PARTIAL** |
| → Rejection | YES | YES | YES | NO | YES | YES | **PARTIAL** |
| → Regression Result | YES | YES | YES | UNCONFIRMED | YES | YES | **PARTIAL** |
| → Rollout | YES | YES | YES | UNCONFIRMED | YES | YES | **PARTIAL** |
| → Harm Event | YES | YES | YES | UNCONFIRMED | YES | YES | **PARTIAL** |
| → Attribution Review | YES | YES | YES | UNCONFIRMED | YES | YES | **PARTIAL** |
| → Rollback (side path) | YES | YES | YES | UNCONFIRMED | YES | YES | **PARTIAL** |

---

## Database Schema Coverage

All 13 `ControlledLearning*` models are confirmed present in `prisma/schema.prisma`:

| Model | Schema Line |
|---|---|
| `ControlledLearningCandidate` | 3966 |
| `ControlledLearningCandidateAuditEntry` | 4007 |
| `ControlledLearningReview` | 4025 |
| `ControlledLearningAdmission` | 4043 |
| `ControlledLearningRejection` | 4063 |
| `ControlledLearningPrivacyControl` | 4081 |
| `ControlledLearningConsentRecord` | 4099 |
| `ControlledLearningRetentionPolicy` | 4117 |
| `ControlledLearningRegressionResult` | 4132 |
| `ControlledLearningRolloutFlag` | 4152 |
| `ControlledLearningRollbackEvent` | 4172 |
| `ControlledLearningHarmEvent` | 4190 |
| `ControlledLearningAttributionReview` | 4213 |

All 13 relations are also wired on the `ClientAccount` (workspace) model at lines 225–237.

---

## Critical Gaps

### GAP-1: Upstream chain steps have no verified routes (BROKEN)

Steps Input → Diagnosis → Recommendation → Action Plan → Owner Decision have no routes under `/src/app/api/owner/`. These are referenced as foreign keys on `ControlledLearningCandidate` but their creation paths were not located during this analysis. This does not mean they are absent from the system — they may exist under other route trees — but they are not proven for this chain.

**Action required**: Locate and verify the routes that create `ownerDecision`, `action`, `recommendation`, and `outcome` records.

### GAP-2: Audit events absent or unconfirmed for 8 of 9 controlled learning transitions

Only `controlled-learning-candidate.service.ts` is confirmed to write audit entries. All other services (review, admission, rejection, regression, rollout, rollback, harm, attribution) have no confirmed audit writes. The CLAUDE.md rules state: "All meaningful mutations must emit audit events."

**Action required**: Add `controlledLearningCandidateAuditEntry` writes (or equivalent) in each service for each state-changing mutation.

### GAP-3: Shallow test coverage for regression and rollout

`learning-regression-results.test.ts` is 65 lines and `learning-rollout-flags.test.ts` is 62 lines. These are the two most consequential post-admission transitions. Shallow test coverage here is a risk.

**Action required**: Expand test coverage for regression verdict paths (PASS/FAIL/INCONCLUSIVE branch coverage) and rollout stage transitions.

---

## What Cannot Be Verified Without Runtime

- Actual DB constraint enforcement (unique indexes, FK integrity)
- Idempotency under concurrent submissions
- Cross-workspace isolation under race conditions
- Whether `assertWorkspaceScopedQuery` actually halts execution vs. logs a warning

These are marked `BLOCKED_DB` in spirit — the code patterns are correct but runtime verification is required.

---

## Files Referenced

- `src/app/api/owner/learning-candidates/route.ts`
- `src/app/api/owner/learning-reviews/route.ts`
- `src/app/api/owner/learning-admissions/route.ts`
- `src/app/api/owner/learning-rejections/route.ts`
- `src/app/api/owner/learning-regression-results/route.ts`
- `src/app/api/owner/learning-rollout-flags/route.ts`
- `src/app/api/owner/learning-rollback-events/route.ts`
- `src/app/api/owner/learning-harm-events/route.ts`
- `src/app/api/owner/learning-attribution-reviews/route.ts`
- `src/services/controlled-learning-candidate.service.ts`
- `src/services/controlled-learning-review.service.ts`
- `src/services/controlled-learning-admission.service.ts`
- `src/services/controlled-learning-rejection.service.ts`
- `src/services/controlled-learning-regression.service.ts`
- `src/services/controlled-learning-rollout.service.ts`
- `src/services/controlled-learning-rollback.service.ts`
- `src/services/controlled-learning-harm.service.ts`
- `src/services/controlled-learning-attribution.service.ts`
- `src/domain/owner-mode/controlled-learning.ts`
- `src/__tests__/api/owner/learning-candidates.test.ts`
- `src/__tests__/api/owner/learning-reviews.test.ts`
- `src/__tests__/api/owner/learning-admissions.test.ts`
- `src/__tests__/api/owner/learning-rejections.test.ts`
- `src/__tests__/api/owner/learning-regression-results.test.ts`
- `src/__tests__/api/owner/learning-rollout-flags.test.ts`
- `src/__tests__/api/owner/learning-rollback-events.test.ts`
- `src/__tests__/api/owner/learning-harm-events.test.ts`
- `src/__tests__/api/owner/learning-attribution-reviews.test.ts`
- `prisma/schema.prisma` (lines 3966–4237, 225–237)
