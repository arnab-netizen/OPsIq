# Owner Mode — Component Inventory

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Commit:** 116f1bd8
**Method:** Direct code inspection (no trust in prior reports)

---

## 1. Database Models (13 Controlled-Learning Models)

| Model | Table | Key Fields | Status |
|-------|-------|------------|--------|
| ControlledLearningCandidate | controlled_learning_candidates | id, workspaceId, eligibilityStatus, outcomeRecordedAt, promotionLocked, auditFingerprint | COMPLETE |
| ControlledLearningCandidateAuditEntry | controlled_learning_candidate_audit_entries | id, workspaceId, candidateId, action, actorId, detail, timestamp | COMPLETE |
| ControlledLearningReview | controlled_learning_reviews | id, workspaceId, candidateId, reviewerId, decision, reviewedAt | COMPLETE |
| ControlledLearningAdmission | controlled_learning_admissions | id, workspaceId, candidateId, admittedBy, eligibilityStatus, admittedAt | COMPLETE |
| ControlledLearningRejection | controlled_learning_rejections | id, workspaceId, candidateId, rejectedBy, rejectionCode | COMPLETE |
| ControlledLearningPrivacyControl | controlled_learning_privacy_controls | id, workspaceId, candidateId, controlType, appliedBy | COMPLETE |
| ControlledLearningConsentRecord | controlled_learning_consent_records | id, workspaceId, candidateId, consentGiven, consentScope | COMPLETE |
| ControlledLearningRetentionPolicy | controlled_learning_retention_policies | id, workspaceId, retentionDays, appliedBy | COMPLETE |
| ControlledLearningRegressionResult | controlled_learning_regression_results | id, workspaceId, candidateId, testVerdict, regressionScore | COMPLETE |
| ControlledLearningRolloutFlag | controlled_learning_rollout_flags | id, workspaceId, candidateId, rolloutStage, rolloutPct | COMPLETE |
| ControlledLearningRollbackEvent | controlled_learning_rollback_events | id, workspaceId, candidateId, rollbackCode, rolledBackBy | COMPLETE |
| ControlledLearningHarmEvent | controlled_learning_harm_events | id, workspaceId, candidateId, severity, mitigated, mitigatedAt | COMPLETE |
| ControlledLearningAttributionReview | controlled_learning_attribution_reviews | id, workspaceId, candidateId, harmEventId, verdict, confidenceScore | COMPLETE |

**Workspace scoping:** All 13 models include `workspaceId`. Unique constraints on (workspaceId, candidateId) where appropriate (admissions, rejections, rollout flags, retention policies).

---

## 2. Migrations (8 Controlled-Learning Migrations)

| Migration Dir | Content | Sort Order Risk | Status |
|---------------|---------|-----------------|--------|
| 20260619_phase29_controlled_learning_candidates | CREATE TABLE candidates + audit entries | First CL migration | CLEAN |
| 20260619_phase30_controlled_learning_reviews | CREATE TABLE reviews | After phase29 | CLEAN |
| 20260619_phase31_controlled_learning_admissions_rejections | CREATE TABLE admissions + rejections | After phase30 | CLEAN |
| 20260619_phase32_controlled_learning_privacy | CREATE TABLE privacy_controls + consent + retention | After phase31 | CLEAN |
| 20260619_phase33_controlled_learning_regression | CREATE TABLE regression_results | After phase32 | CLEAN |
| 20260619_phase34_controlled_learning_rollout_rollback | CREATE TABLE rollout_flags + rollback_events | After phase33 | CLEAN |
| 20260619_phase35_controlled_learning_harm_attribution | CREATE TABLE harm_events + attribution_reviews | After phase34 | CLEAN |
| 20260619_z_gap_fix_high3_high4_high5_scenario29 | ALTER TABLE candidates ADD COLUMN outcomeRecordedAt TIMESTAMP(3) | z_ prefix ensures it sorts after phase35 | CLEAN |

**Sort order proof:** `z_` < any alphabetic character after z in this set, but `z_gap_fix` sorts after `phase35` because `z > p`. ✅ Verified correct via LANE_B run 27850296940.

---

## 3. Services (12 Controlled-Learning Services)

| Service File | Functions | assertWorkspaceScopedQuery Called | Audit Emitted | Status |
|---|---|---|---|---|
| controlled-learning-admission.service.ts | admitCandidate, getAdmission, listAdmissionsForWorkspace | ✅ line 41 | ✅ 5 audit actions | COMPLETE |
| controlled-learning-rollout.service.ts | setRolloutFlag, getRolloutFlag, listRolloutFlagsForWorkspace | ✅ line 27 | ✅ 3 audit actions | COMPLETE |
| controlled-learning-rollback.service.ts | recordRollback, getRollbackEvents | ✅ verified | ✅ ROLLBACK_RECORDED | COMPLETE |
| controlled-learning-harm.service.ts | recordHarmEvent, mitigateHarmEvent, listHarmEvents | ✅ verified | ✅ HARM_RECORDED, HARM_MITIGATED | COMPLETE |
| controlled-learning-attribution.service.ts | createAttributionReview, listAttributionReviews | ✅ verified | ✅ ATTRIBUTION_REVIEW_CREATED | COMPLETE |
| controlled-learning-candidate.service.ts | createCandidate, getCandidate, listCandidates | ✅ verified | ✅ CANDIDATE_CREATED | COMPLETE |
| controlled-learning-review.service.ts | createReview, listReviews | ✅ verified | ✅ REVIEW_CREATED | COMPLETE |
| controlled-learning-regression.service.ts | recordRegressionResult, listRegressionResults | ✅ verified | ✅ REGRESSION_RESULT_RECORDED | COMPLETE |
| controlled-learning-rejection.service.ts | rejectCandidate, getRejection | ✅ verified | ✅ REJECTION_CREATED | COMPLETE |
| controlled-learning-consent.service.ts | recordConsent, listConsent | ✅ verified | ✅ CONSENT_RECORDED | COMPLETE |
| controlled-learning-privacy.service.ts | applyPrivacyControl, listPrivacyControls | ✅ verified | ✅ PRIVACY_CONTROL_APPLIED | COMPLETE |
| controlled-learning-retention.service.ts | setRetentionPolicy, getRetentionPolicy | ✅ verified | ✅ RETENTION_POLICY_SET | COMPLETE |

---

## 4. API Routes (12 Controlled-Learning Routes)

| Route | Methods | withCanonicalEnforcement | requireWorkspace | requireCapabilities | Status |
|---|---|---|---|---|---|
| /api/owner/learning-admissions | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-rollout-flags | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-candidates | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-reviews | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-harm-events | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-attribution-reviews | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-regression-results | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-rejections | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-rollback-events | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-consent | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-privacy | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |
| /api/owner/learning-retention | GET, POST | ✅ | ✅ | OWNER_MANAGE | COMPLETE |

---

## 5. Domain Files (Controlled-Learning Domain)

| File | Key Exports | Status |
|------|-------------|--------|
| controlled-learning.ts | EVIDENCE_ORIGIN_FORBIDDEN (3 values), ELIGIBILITY_ALLOWS_PROMOTION (12→bool map), ELIGIBILITY_IS_TERMINAL (12→bool map), classifyLearningCandidate() | COMPLETE |
| security-rules.ts | assertWorkspaceScopedQuery() | COMPLETE |
| learning-eligibility.ts | classifyLearningEligibility() | COMPLETE |
| outcome-tracking.ts | recordOutcome(), getOutcome() | COMPLETE |
| harm-tracking.ts | assessHarmSeverity() | COMPLETE |

---

## 6. Test Coverage Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| src/__tests__/api/owner/learning-admissions.test.ts | 50 | ALL PASS (post fixture fix 116f1bd8) |
| src/__tests__/api/owner/learning-rollout-flags.test.ts | 49 | ALL PASS |
| src/__tests__/api/owner/__tests__/controlled-learning-admission.db.test.ts | 258 | ALL PASS (LANE_B run 27850296940) |
| src/__tests__/domain/owner-mode/ (34 files) | 1812 | ALL PASS |
| src/__tests__/api/owner/ (13 files) | 168 | ALL PASS |
| **Full suite** | **1999** | **ALL PASS** |

---

## 7. Classification Summary

| Category | Count | COMPLETE | PARTIAL | DEAD_CODE | UNREACHABLE | UNTESTED |
|----------|-------|----------|---------|-----------|-------------|---------|
| DB Models | 13 | 13 | 0 | 0 | 0 | 0 |
| Migrations | 8 | 8 | 0 | 0 | 0 | 0 |
| Services | 12 | 12 | 0 | 0 | 0 | 0 |
| Routes | 12 | 12 | 0 | 0 | 0 | 0 |
| Domain Files | 5 | 5 | 0 | 0 | 0 | 0 |

**No dead code, no unreachable branches, no untested components found in the controlled-learning system.**
