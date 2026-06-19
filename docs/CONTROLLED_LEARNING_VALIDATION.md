# Controlled Learning Validation Report

**Date:** 2026-06-19
**Scope:** Phase 29 — Controlled Learning Candidate Store and Full Lifecycle
**Validation type:** Read-only code audit. No code was modified.

---

## 1. Domain Model: src/domain/owner-mode/controlled-learning.ts

### 1.1 Eligibility Status Classes (12 defined)

| # | Status | Allows Promotion | Terminal |
|---|--------|-----------------|---------|
| 1 | LEARNING_ELIGIBLE_VERIFIED_OUTCOME | YES | NO |
| 2 | LEARNING_ELIGIBLE_HUMAN_REVIEWED | YES | NO |
| 3 | LEARNING_INELIGIBLE_UNVERIFIED | NO | NO |
| 4 | LEARNING_INELIGIBLE_SYNTHETIC | NO | YES |
| 5 | LEARNING_INELIGIBLE_AI_GENERATED | NO | YES |
| 6 | LEARNING_INELIGIBLE_CROSS_TENANT | NO | YES |
| 7 | LEARNING_INELIGIBLE_NO_OWNER_DECISION | NO | NO |
| 8 | LEARNING_INELIGIBLE_NO_ACTION_TAKEN | NO | NO |
| 9 | LEARNING_INELIGIBLE_NO_OUTCOME_WINDOW | NO | NO |
| 10 | LEARNING_INELIGIBLE_CONFLICTING_EVIDENCE | NO | NO |
| 11 | LEARNING_INELIGIBLE_SAFETY_RELATED | NO | YES |
| 12 | LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED | NO | NO |

Verified: all 12 statuses present. Count matches spec.

### 1.2 SEC-005: Four Deterministic Records

The `LearningCandidateRecord` interface requires all four records:
- Record 1: `ownerDecisionId` / `ownerDecisionVerdict` / `ownerDecisionWorkspaceId`
- Record 2: `actionId` / `actionWasTaken` / `actionWorkspaceId`
- Record 3: `outcomeId` / `outcomeWindowElapsed` / `outcomeWorkspaceId`
- Record 4: `humanApprovedBy` / `humanApprovedAt` / `humanReviewWorkspaceId`

All four workspaceIds must match the submission `workspaceId` (enforced in CL-RULE-1).

### 1.3 Promotion Rule

`validateCandidatePromotion()` requires non-empty `approvedBy` (human identity) and `approvedAt` (ISO timestamp). Violation returns `approved: false` with explicit violation strings. No path exists to return `approved: true` without both fields.

---

## 2. Security Gate Verification

### Gate: NO_AUTOMATIC_LEARNING

**Status: PASS**

Evidence:
- `classifyLearningCandidate()` evaluates rules and sets `allowsPromotion: true` only when `eligible === true` (zero violations AND zero rejection reasons AND status in `ELIGIBILITY_ALLOWS_PROMOTION`).
- CL-RULE-12 requires `humanApprovedBy !== null && humanApprovedBy.trim() !== "" && humanApprovedAt !== null` before any eligible status is assigned for promotion.
- `promoteLearningCandidate()` in the candidate service calls `validateCandidatePromotion()` which enforces `approvedBy` and `approvedAt`. No auto-promotion path exists: the function always returns `{ promoted: false, violations: [...] }` if the promotion input is missing or fails.
- `assertCandidateImmutable()` throws if a promoted record is proposed to change status, making post-promotion tampering impossible.

No code path promotes a candidate without explicit human action.

### Gate: NO_BENCHMARK_MUTATION

**Status: PASS**

Evidence:
- `evidenceOrigin: "synthetic_benchmark"` is listed in `EVIDENCE_ORIGIN_FORBIDDEN` (a frozen `ReadonlySet`).
- CL-RULE-4 returns `LEARNING_INELIGIBLE_SYNTHETIC` (terminal) immediately when `evidenceOrigin === "synthetic_benchmark"`.
- The admission service re-checks `EVIDENCE_ORIGIN_FORBIDDEN.has(evidenceOrigin)` independently before any DB write.
- No service in the lifecycle writes to benchmark or scoring tables. The regression service writes only to `controlledLearningRegressionResult`, which is a lifecycle record, not a benchmark corpus.

No service mutates benchmark or scoring tables.

### Gate: NO_CROSS_TENANT_LEARNING

**Status: PASS**

Evidence:
- Every service entry point calls `assertWorkspaceScopedQuery({ workspaceId })` as the first statement. This is enforced in all 10 services audited: candidate, review, admission, rejection, regression, rollout, rollback, harm, attribution, privacy, consent, retention.
- CL-RULE-2 short-circuits with `LEARNING_INELIGIBLE_CROSS_TENANT` (terminal) when `originatingWorkspaceId !== workspaceId`.
- All DB queries include `workspaceId` in the `where` clause: `{ id: candidateId, workspaceId }`. No query omits the workspace filter.
- The candidate service explicitly throws `"Cross-tenant violation: classificationInput.workspaceId does not match input.workspaceId"` before classification.

Cross-tenant data access is impossible at both domain and service layers.

### Gate: NO_SYNTHETIC_ADMISSION

**Status: PASS**

Evidence:
- `admitCandidate()` checks `EVIDENCE_ORIGIN_FORBIDDEN.has(evidenceOrigin)` before any other DB access. If the origin is `ai_generated`, `synthetic_benchmark`, or `search_snippet_only`, it returns `{ admitted: false, violations: [...] }` immediately.
- `admitCandidate()` also checks `eligibilityStatus.startsWith("LEARNING_ELIGIBLE_")`. Only two statuses pass this gate: `LEARNING_ELIGIBLE_VERIFIED_OUTCOME` and `LEARNING_ELIGIBLE_HUMAN_REVIEWED`. Both require human approval in the domain (CL-RULE-12/14/15).
- There is no code path to `controlledLearningAdmission.create()` that bypasses these two guards.

No path exists to admit without passing human-reviewed eligibility.

### Gate: NO_AI_GENERATED_ADMISSION

**Status: PASS**

Evidence:
- `evidenceOrigin: "ai_generated"` is in `EVIDENCE_ORIGIN_FORBIDDEN` and is commented as "forbidden — engine output as learning signal".
- CL-RULE-3 returns terminal status `LEARNING_INELIGIBLE_AI_GENERATED` immediately.
- This status has `ELIGIBILITY_ALLOWS_PROMOTION: false`, so the candidate can never reach promotion.
- The admission service independently re-checks the forbidden set.
- No API route or service bypasses this check: the only admission entry point is `admitCandidate()`.

AI-generated evidence cannot trigger admission under any code path.

---

## 3. Per-Service Audit

### 3.1 controlled-learning-candidate.service.ts

- `createLearningCandidate`: Calls `assertWorkspaceScopedQuery`, cross-tenant check, then `classifyLearningCandidate`. Writes to `controlledLearningCandidate` and emits a `controlledLearningCandidateAuditEntry`. No promotion on creation.
- `promoteLearningCandidate`: Checks `promotionLocked`, verifies `eligibilityStatus` is in `[LEARNING_ELIGIBLE_VERIFIED_OUTCOME, LEARNING_ELIGIBLE_HUMAN_REVIEWED]`, calls `validateCandidatePromotion` requiring non-empty `approvedBy` and `approvedAt`. Only sets `promotionLocked: true` after all checks pass.
- `rejectLearningCandidate`: Cannot reject a `promotionLocked` candidate. Emits audit entry.
- `assertCandidateImmutableInDB`: Calls domain `assertCandidateImmutable`; throws on any attempt to change a promoted record's status.

### 3.2 controlled-learning-review.service.ts

- Validates decision is one of `APPROVED | REJECTED | DEFERRED`.
- Verifies candidate exists in workspace before creating review.
- All reads filtered by `workspaceId`.
- Does NOT automatically update candidate eligibility status. Review is a separate record; promotion remains a separate step.

### 3.3 controlled-learning-admission.service.ts

- Double-checks `EVIDENCE_ORIGIN_FORBIDDEN` independently.
- Enforces `eligibilityStatus.startsWith("LEARNING_ELIGIBLE_")`.
- Prevents double-admission via existing record check.
- Requires `admittedBy` (human actor) in the input interface.

### 3.4 controlled-learning-rejection.service.ts

- Prevents rejection of admitted candidates.
- Prevents double-rejection.
- Requires `rejectedBy` and `rejectionCode`.
- All DB queries scoped by `workspaceId`.

### 3.5 controlled-learning-regression.service.ts

- Records test verdicts: `PASS | FAIL | INCONCLUSIVE`.
- Validates `regressionScore` in [0.0, 1.0].
- Writes only to `controlledLearningRegressionResult`. Does NOT write to any benchmark or scoring table.
- `hasRegression()` checks for `FAIL` verdict — used as a signal by callers; does not auto-rollback.

### 3.6 controlled-learning-rollout.service.ts

- Valid stages: `SHADOW | CANARY | PARTIAL | FULL | PAUSED`.
- Validates `rolloutPct` in [0, 100].
- Requires `enabledBy` (human actor).
- Uses upsert: does not create duplicates but can update stage.

### 3.7 controlled-learning-rollback.service.ts

- Valid codes: `REGRESSION_DETECTED | HARM_DETECTED | MANUAL_OVERRIDE | POLICY_VIOLATION`.
- Requires `rolledBackBy` and `rollbackReason`.
- `hasBeenRolledBack()` returns boolean; does not auto-cascade.

### 3.8 controlled-learning-harm.service.ts

- Valid harm types: `FINANCIAL_LOSS | DECISION_ERROR | DATA_CORRUPTION | COMPLIANCE_VIOLATION | SAFETY_RISK`.
- Valid severities: `LOW | MEDIUM | HIGH | CRITICAL`.
- `markHarmMitigated()` sets `mitigated: true` and `mitigatedAt`. Scoped by `workspaceId`.
- `hasCriticalHarm()` returns boolean signal; does not auto-rollback.

### 3.9 controlled-learning-attribution.service.ts

- Valid verdicts: `ATTRIBUTED | NOT_ATTRIBUTED | PARTIAL | INCONCLUSIVE`.
- Validates `confidenceScore` in [0.0, 1.0].
- Verifies both candidate and harm event exist in workspace before creating review.
- All queries filtered by `workspaceId`.

### 3.10 controlled-learning-privacy.service.ts

- Valid control types: `ANONYMIZE | REDACT | EXCLUDE | QUARANTINE`.
- Requires `appliedBy` and non-empty `reason`.
- Workspace scoping enforced on all entry points.

### 3.11 controlled-learning-consent.service.ts

- Valid consent scopes: `WORKSPACE_ONLY | ANONYMIZED_AGGREGATE | NONE`.
- Requires `consentBy` and boolean `consentGiven`.
- Workspace scoping enforced.

### 3.12 controlled-learning-retention.service.ts

- `retentionDays` must be a positive integer, max 3650 (10 years).
- Uses upsert per workspace. Requires `appliedBy`.
- Workspace scoping enforced.

---

## 4. Schema Verification: ControlledLearning Models

13 models found in `prisma/schema.prisma` (verified by grep on `^model ControlledLearning`):

| # | Model Name |
|---|-----------|
| 1 | ControlledLearningCandidate |
| 2 | ControlledLearningCandidateAuditEntry |
| 3 | ControlledLearningReview |
| 4 | ControlledLearningAdmission |
| 5 | ControlledLearningRejection |
| 6 | ControlledLearningPrivacyControl |
| 7 | ControlledLearningConsentRecord |
| 8 | ControlledLearningRetentionPolicy |
| 9 | ControlledLearningRegressionResult |
| 10 | ControlledLearningRolloutFlag |
| 11 | ControlledLearningRollbackEvent |
| 12 | ControlledLearningHarmEvent |
| 13 | ControlledLearningAttributionReview |

All 13 models confirmed present in schema.

---

## 5. Lifecycle Coverage Summary

| Stage | Service File | Enforces workspaceId | Requires Human Actor | Audit Trail |
|-------|-------------|---------------------|---------------------|-------------|
| Candidate | controlled-learning-candidate.service.ts | YES | YES (promotedBy) | YES (CandidateAuditEntry) |
| Review | controlled-learning-review.service.ts | YES | YES (reviewerId) | Implicit via ReviewRecord |
| Admission | controlled-learning-admission.service.ts | YES | YES (admittedBy) | Admission record |
| Rejection | controlled-learning-rejection.service.ts | YES | YES (rejectedBy) | Rejection record |
| Regression | controlled-learning-regression.service.ts | YES | YES (testedBy) | RegressionResult record |
| Rollout | controlled-learning-rollout.service.ts | YES | YES (enabledBy) | RolloutFlag record |
| Rollback | controlled-learning-rollback.service.ts | YES | YES (rolledBackBy) | RollbackEvent record |
| Harm | controlled-learning-harm.service.ts | YES | YES (detectedBy) | HarmEvent record |
| Attribution | controlled-learning-attribution.service.ts | YES | YES (reviewedBy) | AttributionReview record |
| Privacy | controlled-learning-privacy.service.ts | YES | YES (appliedBy) | PrivacyControl record |
| Consent | controlled-learning-consent.service.ts | YES | YES (consentBy) | ConsentRecord |
| Retention | controlled-learning-retention.service.ts | YES | YES (appliedBy) | RetentionPolicy record |

---

## 6. Overall Verdict

| Gate | Result |
|------|--------|
| NO_AUTOMATIC_LEARNING | PASS |
| NO_BENCHMARK_MUTATION | PASS |
| NO_CROSS_TENANT_LEARNING | PASS |
| NO_SYNTHETIC_ADMISSION | PASS |
| NO_AI_GENERATED_ADMISSION | PASS |
| 12 eligibility statuses present | PASS |
| 13 schema models present | PASS |
| Full lifecycle covered (Candidate → Attribution) | PASS |

No violations found. All five security gates pass on static code analysis.
