# Owner Mode — Wiring Proof

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Commit:** 116f1bd8
**Method:** Direct route/service/domain code trace — no assumptions from prior reports

---

## End-to-End Runtime Trace

### Phase 29: Candidate Creation

**Route:** `POST /api/owner/learning-candidates`
**Auth middleware:** `withCanonicalEnforcement({ requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true })`
**Body schema (Zod):** workspaceId, businessId, sourceOwnerDecisionId, sourceActionId, sourceOutcomeId, eligibilityStatus, evidenceSourceType, evidenceSummary, rejectionReasons, humanReviewed, reviewerId
**Service:** `controlled-learning-candidate.service.ts` → `createLearningCandidate()`
**DB write:** `controlledLearningCandidate.create()` with workspaceId, auditFingerprint
**DB unique:** `@@unique([workspaceId, auditFingerprint])` — duplicate fingerprint blocked
**Audit emitted:** `CANDIDATE_CREATED`
**`assertWorkspaceScopedQuery` called:** ✅ first line of service function

---

### Phase 30: Review Creation

**Route:** `POST /api/owner/learning-reviews`
**Auth middleware:** `withCanonicalEnforcement({ requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true })`
**Body schema (Zod):** workspaceId, candidateId, reviewerId, decision (APPROVED|REJECTED|DEFERRED), reviewNotes, reviewedAt
**Service:** `controlled-learning-review.service.ts` → `createReview()`
**DB read:** `controlledLearningCandidate.findFirst({ where: { id: candidateId, workspaceId } })` — cross-tenant guard
**DB write:** `controlledLearningReview.create()`
**Audit emitted:** `REVIEW_CREATED`
**`assertWorkspaceScopedQuery` called:** ✅

---

### Phase 31: Admission (7-Guard Chain)

**Route:** `POST /api/owner/learning-admissions`
**Auth middleware:** `withCanonicalEnforcement({ requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true })`
**Body schema (Zod):** workspaceId, candidateId, admittedBy, admittedAt, sourceLabel, evidenceOrigin, admissionNotes
**NOTE:** `eligibilityStatus` is NOT in the Zod schema — BLOCKER-3 protection enforced at route layer
**Service:** `controlled-learning-admission.service.ts` → `admitCandidate()`

| Guard | Line | Condition | DB Access | Audit on Block |
|-------|------|-----------|-----------|----------------|
| 0 | 53 | admittedBy non-empty (SCENARIO-29) | None | None |
| 1 | 61 | evidenceOrigin not in ADMISSION_FORBIDDEN_ORIGINS | None | None |
| 2 | 69 | candidateId+workspaceId exists in DB | findFirst candidates | None |
| 2b | 91 | outcomeRecordedAt not null + ≥30 days (HIGH-3) | From Guard 2 select | ADMISSION_BLOCKED_NO_OUTCOME_TIMESTAMP / _OUTCOME_WINDOW_NOT_ELAPSED |
| 3 | 135 | ELIGIBILITY_ALLOWS_PROMOTION[dbEligibilityStatus] | From Guard 2 select | ADMISSION_BLOCKED_INELIGIBLE |
| 4 | 161 | APPROVED review exists | findFirst reviews | ADMISSION_BLOCKED_NO_APPROVED_REVIEW |
| 5 | 189 | No unmitigated CRITICAL harm | findFirst harmEvents | ADMISSION_BLOCKED_CRITICAL_HARM |
| 6 | 217 | Not already admitted | findFirst admissions | None |
| Write | 226 | All guards passed | create admission | ADMISSION_CREATED |

**`eligibilityStatus` written to DB:** taken from `candidate.eligibilityStatus` (DB record), not from caller — line 234

---

### Phase 31: Rejection

**Route:** `POST /api/owner/learning-rejections`
**Service:** `controlled-learning-rejection.service.ts` → `rejectCandidate()`
**Guards:** workspaceId scoped, candidate exists in workspace, rejectionCode enum validated
**DB unique:** `@@unique([workspaceId, candidateId])` — duplicate rejection blocked
**Audit emitted:** `REJECTION_CREATED`

---

### Phase 32: Privacy / Consent / Retention

**Route:** `POST /api/owner/learning-privacy`
**Service:** `controlled-learning-privacy.service.ts` → `applyPrivacyControl()`
**Guards:** workspaceId scoped, controlType enum (ANONYMIZE|REDACT|EXCLUDE|QUARANTINE)
**Audit emitted:** `PRIVACY_CONTROL_APPLIED`

**Route:** `POST /api/owner/learning-consent`
**Service:** `controlled-learning-consent.service.ts` → `recordConsent()`
**Guards:** workspaceId scoped, consentScope enum (WORKSPACE_ONLY|ANONYMIZED_AGGREGATE|NONE)
**Audit emitted:** `CONSENT_RECORDED`

**Route:** `POST /api/owner/learning-retention`
**Service:** `controlled-learning-retention.service.ts` → `setRetentionPolicy()`
**Guards:** workspaceId scoped, retentionDays 1–3650
**DB unique:** `@@unique([workspaceId])` — one policy per workspace
**Audit emitted:** `RETENTION_POLICY_SET`

---

### Phase 33: Regression Result

**Route:** `POST /api/owner/learning-regression-results`
**Service:** `controlled-learning-regression.service.ts` → `recordRegressionResult()`
**Guards:** workspaceId scoped, testVerdict enum (PASS|FAIL|INCONCLUSIVE), regressionScore 0.0–1.0
**DB write:** `controlledLearningRegressionResult.create()`
**Audit emitted:** `REGRESSION_RESULT_RECORDED`
**Used by rollout:** `setRolloutFlag()` queries this table at line 55 for testVerdict=PASS (HIGH-5)

---

### Phase 34: Rollout

**Route:** `POST /api/owner/learning-rollout-flags`
**Service:** `controlled-learning-rollout.service.ts` → `setRolloutFlag()`

| Guard | Line | Condition | DB Access | Audit on Block |
|-------|------|-----------|-----------|----------------|
| Input | 30 | rolloutStage in VALID_ROLLOUT_STAGES | None | None |
| Input | 34 | rolloutPct 0.0–100.0 | None | None |
| Candidate | 46 | candidateId+workspaceId exists | findFirst candidates | None |
| HIGH-5 | 55 | PASS regression result exists | findFirst regressionResults | ROLLOUT_BLOCKED_NO_PASSING_REGRESSION |
| HIGH-4 | 81 | No unmitigated CRITICAL harm | findFirst harmEvents | ROLLOUT_BLOCKED_CRITICAL_HARM |
| Write | 106 | All guards passed | upsert rolloutFlag | ROLLOUT_FLAG_SET_{STAGE} |

**DB unique:** `@@unique([workspaceId, candidateId])` — upsert replaces existing flag per candidate

---

### Phase 34: Rollback

**Route:** `POST /api/owner/learning-rollback-events`
**Service:** `controlled-learning-rollback.service.ts` → `recordRollbackEvent()`
**Guards:** workspaceId scoped, rollbackCode enum (REGRESSION_DETECTED|HARM_DETECTED|MANUAL_OVERRIDE|POLICY_VIOLATION), candidate exists
**Audit emitted:** `ROLLBACK_{rollbackCode}`

---

### Phase 35: Harm Event

**Route:** `POST /api/owner/learning-harm-events`
**Service:** `controlled-learning-harm.service.ts` → `recordHarmEvent()`
**Guards:** workspaceId scoped, harmType enum (FINANCIAL_LOSS|DECISION_ERROR|DATA_CORRUPTION|COMPLIANCE_VIOLATION|SAFETY_RISK), severity enum (LOW|MEDIUM|HIGH|CRITICAL), candidate exists in workspace
**DB write:** `mitigated: false` (default)
**Audit emitted:** `HARM_EVENT_RECORDED_{SEVERITY}`
**Mitigation:** `markHarmMitigated()` — updates `mitigated=true, mitigatedAt=now`, emits `HARM_EVENT_MITIGATED`

---

### Phase 35: Attribution Review

**Route:** `POST /api/owner/learning-attribution-reviews`
**Service:** `controlled-learning-attribution.service.ts` → `recordAttributionReview()`
**Guards:** workspaceId scoped, verdict enum, confidenceScore 0.0–1.0, candidate exists in workspace, harmEvent exists in workspace
**Audit emitted:** `ATTRIBUTION_REVIEW_{VERDICT}`

---

## Auth Enforcement Trace

**`withCanonicalEnforcement` location:** `src/lib/canonical-route-enforcement.ts`

1. Session extracted from request
2. If no valid session → `translateAuthDecisionToResponse` returns 401
3. Workspace capability checked → if missing `OWNER_MANAGE` → 403
4. workspaceId validated → if empty → 422
5. Handler called with `{ session, workspaceId, db }`

**`assertWorkspaceScopedQuery` location:** `src/domain/owner-mode/security-rules.ts` line 13
- Throws `Error("assertWorkspaceScopedQuery: workspaceId is required")` if empty
- Called at the first line of every service function
- This is defense-in-depth: even if the route layer failed to validate, the service throws before any DB access

---

## Cross-Tenant Protection Summary

Every DB query in every service always includes `workspaceId` in the `where` clause:
- Admission: `findFirst({ where: { id: candidateId, workspaceId } })` — Guard 2
- Attribution: `findFirst({ where: { id: harmEventId, workspaceId } })` — harm event cross-workspace guard
- Harm: `findFirst({ where: { id: harmEventId, workspaceId } })` — mitigation cross-workspace guard
- Rollout: `findFirst({ where: { id: candidateId, workspaceId } })` — candidate existence check

No query fetches by id alone without workspaceId.
