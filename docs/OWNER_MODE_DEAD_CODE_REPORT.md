# Owner Mode — Dead Code Report

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Commit:** 116f1bd8
**Method:** Code inspection, route listing, service function cross-reference

---

## 1. Controlled-Learning Services: Function Usage

Each service file exports read + write functions. All are called by corresponding routes.

| Service | Functions Exported | Route Caller | Status |
|---------|--------------------|-------------|--------|
| controlled-learning-admission.service.ts | admitCandidate, getAdmission, listAdmissionsForWorkspace | /api/owner/learning-admissions | ALL USED |
| controlled-learning-rollout.service.ts | setRolloutFlag, getRolloutFlag, listRolloutFlagsForWorkspace | /api/owner/learning-rollout-flags | ALL USED |
| controlled-learning-rollback.service.ts | recordRollbackEvent, listRollbackEventsForCandidate, listRollbackEventsForWorkspace, hasBeenRolledBack | /api/owner/learning-rollback-events | ALL USED |
| controlled-learning-harm.service.ts | recordHarmEvent, markHarmMitigated, listHarmEventsForCandidate, listHarmEventsForWorkspace, hasCriticalHarm | /api/owner/learning-harm-events | ALL USED |
| controlled-learning-attribution.service.ts | recordAttributionReview, listAttributionReviewsForHarmEvent, listAttributionReviewsForCandidate | /api/owner/learning-attribution-reviews | ALL USED |
| controlled-learning-candidate.service.ts | createLearningCandidate, getLearningCandidate, listLearningCandidatesForWorkspace | /api/owner/learning-candidates | ALL USED |
| controlled-learning-review.service.ts | createReview, listReviewsForCandidate, listReviewsForWorkspace | /api/owner/learning-reviews | ALL USED |
| controlled-learning-regression.service.ts | recordRegressionResult, listRegressionResultsForCandidate | /api/owner/learning-regression-results | ALL USED |
| controlled-learning-rejection.service.ts | rejectCandidate, getRejection, listRejectionsForWorkspace | /api/owner/learning-rejections | ALL USED |
| controlled-learning-consent.service.ts | recordConsent, listConsentForCandidate | /api/owner/learning-consent | ALL USED |
| controlled-learning-privacy.service.ts | applyPrivacyControl, listPrivacyControlsForCandidate | /api/owner/learning-privacy | ALL USED |
| controlled-learning-retention.service.ts | setRetentionPolicy, getRetentionPolicy | /api/owner/learning-retention | ALL USED |

---

## 2. Unreachable Branches

### admission.service.ts — Cross-workspace double check (line 86)
```typescript
if (candidate.workspaceId !== workspaceId) {
  return { admitted: false, violations: ["Cross-workspace admission attempt blocked"] };
}
```
This branch is technically unreachable because the preceding `findFirst({ where: { id, workspaceId } })` already enforces the workspace match. If the query returns a record, it is already confirmed to have `workspaceId = workspaceId`.

**Classification:** REDUNDANT_DEFENSE_IN_DEPTH — not dead code, intentional double-check. No removal recommended.

### security-rules.ts — `hasCriticalHarm` in service
In `controlled-learning-harm.service.ts`, `hasCriticalHarm()` is exported but its usage is in the service layer only. Admission and rollout services each directly query `controlledLearningHarmEvent.findFirst()` rather than calling `hasCriticalHarm()`. This duplication exists because the service needs full DB access, and the helper was written before the admission service was finalized.

**Classification:** HELPER_NOT_USED_BY_SERVICES — `hasCriticalHarm` could be used by admission/rollout but each service duplicates the query inline. Low priority.

---

## 3. Domain File Audit

### controlled-learning.ts
- `CANDIDATE_SOURCE_REQUIRES_REAL_WORLD` — defined, checked in classifyLearningCandidate(). Used.
- `ELIGIBILITY_IS_TERMINAL` — defined, exported. The terminal map is documented but not currently enforced in admission (i.e., terminal ineligible candidates could theoretically be re-attempted if their DB status were somehow overwritten). However, since candidates are append-only and their eligibilityStatus can only be set on creation, this is not a functional gap.
- `classifyLearningCandidate()` — used by candidate service.
- `LearningCandidateRecord` interface — used in classification.

**No dead code found in domain files.**

---

## 4. Migration Audit

All 8 CL migrations are applied in the correct sort order and all tables are in active use. No orphan migrations found.

---

## 5. Unused DB Fields

### `promotionLocked` (controlled_learning_candidates)
Field exists and is selected in admission Guard 2 (`select: { ..., promotionLocked: true }`), but the admission service does not check its value before proceeding. The field is stored but not enforced.

**Classification:** STORED_NOT_ENFORCED — LOW severity. Field is populated but doesn't influence admission behavior.

### `humanReviewed` and `reviewerId` (controlled_learning_candidates)
Fields exist on the candidate model. These appear to be legacy fields from before the `ControlledLearningReview` relation was introduced. The review relation (Phase 30) is what the admission Guard 4 checks. The fields on the candidate record itself are not checked in admission.

**Classification:** SUPERSEDED — `ControlledLearningReview` table is the authoritative review record. `humanReviewed`/`reviewerId` on the candidate may be vestigial. They are populated on candidate creation but not used in any safety gate.

---

## 6. Summary

| Category | Count | Notes |
|----------|-------|-------|
| Dead service functions | 0 | All functions have route callers |
| Unreachable safety branches | 1 | Redundant workspace double-check (intentional) |
| Orphan migrations | 0 | All applied and used |
| Unused DB tables | 0 | All 13 models in active use |
| Stored-not-enforced fields | 2 | promotionLocked, humanReviewed/reviewerId |
| Unused exports | 1 | hasCriticalHarm() helper not used by services (they inline the query) |

**No dead code found that creates a security risk. Three LOW-severity governance gaps identified (promotionLocked, humanReviewed, hasCriticalHarm helper).**
