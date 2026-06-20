# Owner Mode — Safety Attack Report

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Commit:** 116f1bd8
**Method:** Attempted break of each safety boundary — code trace from attack vector to defense

---

## Attack Surface 1: Workspace Isolation

### ATTACK-1: Cross-workspace candidate admission
**Attempt:** Submit POST /api/owner/learning-admissions with candidateId from workspace B while authenticated to workspace A.
**Defense chain:**
1. `withCanonicalEnforcement`: session workspace = A, workspaceId from body = A (if different, route rejects)
2. `assertWorkspaceScopedQuery({ workspaceId: A })` — throws if empty
3. Guard 2: `findFirst({ where: { id: candidateId, workspaceId: A } })` — returns null because candidate belongs to B
4. Returns: `{ admitted: false, violations: ["Candidate not found or wrong workspace"] }`
**Result: BLOCKED at Guard 2** ✅

### ATTACK-2: Cross-workspace via DB candidate workspaceId mismatch
**Attempt:** Somehow find a candidateId that exists in workspace A's DB but with workspaceId=B.
**Defense:** Guard 2 fetches the candidate with `where: { id, workspaceId }`. The query includes workspaceId in the where clause. The record won't be returned if workspaceId doesn't match.
Additionally, the redundant check at line 86-88: `if (candidate.workspaceId !== workspaceId)` — even if the query somehow returned a wrong record, this check would catch it.
**Result: BLOCKED by dual guard** ✅

### ATTACK-3: Cross-workspace harm event attribution
**Attempt:** Reference harmEventId from workspace B in an attribution review while authenticated to workspace A.
**Defense:** `recordAttributionReview()` calls `findFirst({ where: { id: harmEventId, workspaceId: A } })` — returns null.
**Result: BLOCKED** ✅

### ATTACK-4: Tamper with harmEventId in rollout service
**Attempt:** Hope that `setRolloutFlag` uses a global harm query rather than workspace-scoped.
**Defense:** HIGH-4 guard at line 81: `findFirst({ where: { candidateId, workspaceId: input.workspaceId, severity: "CRITICAL", mitigated: false } })` — all 4 fields in where clause.
**Result: BLOCKED** ✅

---

## Attack Surface 2: Learning Admission Safety Gates

### ATTACK-5: Inject eligibilityStatus via POST body
**Attempt:** Include `{ eligibilityStatus: "LEARNING_ELIGIBLE_VERIFIED_OUTCOME" }` in POST body for a candidate that has `LEARNING_INELIGIBLE_AI_GENERATED` in DB.
**Defense chain:**
1. Route Zod schema does not include `eligibilityStatus` field — it's stripped at parsing
2. Service `AdmitCandidateInput` interface has no `eligibilityStatus` field
3. Guard 3 reads `candidate.eligibilityStatus` directly from DB
4. `ELIGIBILITY_ALLOWS_PROMOTION["LEARNING_INELIGIBLE_AI_GENERATED"]` = false
5. Returns blocked
**Result: BLOCKED at schema layer + Guard 3** ✅

### ATTACK-6: Bypass outcomeRecordedAt check by omitting it
**Attempt:** Candidate created without `outcomeRecordedAt` (null) — hope the check is absent.
**Defense:** Guard 2b: `if (!outcomeRecordedAt)` → returns `ADMISSION_BLOCKED_NO_OUTCOME_TIMESTAMP`.
**Result: BLOCKED** ✅

### ATTACK-7: Bypass outcome window by submitting early admittedAt
**Attempt:** Submit admittedAt = outcomeRecordedAt + 25 days (< 30 day window).
**Defense:** Guard 2b: `daysSinceOutcome = (admittedAt - outcomeRecordedAt) / ms_per_day = 25 < 30` → blocked.
**Result: BLOCKED** ✅

### ATTACK-8: Skip review gate
**Attempt:** Attempt admission with no review at all.
**Defense:** Guard 4: `findFirst({ where: { candidateId, workspaceId, decision: "APPROVED" } })` returns null → blocked.
**Result: BLOCKED** ✅

### ATTACK-9: Submit REJECTED or DEFERRED review and attempt admission
**Attempt:** Create a review with decision=REJECTED, then attempt admission.
**Defense:** Guard 4 queries specifically for `decision: "APPROVED"`. A REJECTED or DEFERRED review does not satisfy this.
**Result: BLOCKED** ✅

### ATTACK-10: Bypass CRITICAL harm check
**Attempt:** Attempt admission with an unmitigated CRITICAL harm event.
**Defense:** Guard 5: `findFirst({ where: { candidateId, workspaceId, severity: "CRITICAL", mitigated: false } })` returns event → blocked.
**Result: BLOCKED** ✅

### ATTACK-11: Race condition on duplicate admission
**Attempt:** Submit two simultaneous admission requests before either creates the DB record.
**Defense:** `@@unique([workspaceId, candidateId])` on `ControlledLearningAdmission`. The second write will fail with a unique constraint error at the DB layer. Guard 6 prevents sequential duplicates; the DB unique constraint prevents concurrent duplicates.
**Result: BLOCKED by DB constraint** ✅

---

## Attack Surface 3: Rollout Safety Gates

### ATTACK-12: Roll out without regression result
**Attempt:** POST /api/owner/learning-rollout-flags for a candidate with no regression results.
**Defense:** HIGH-5 guard at line 55: `findFirst({ where: { candidateId, workspaceId, testVerdict: "PASS" } })` returns null → `ROLLOUT_BLOCKED_NO_PASSING_REGRESSION`.
**Result: BLOCKED** ✅

### ATTACK-13: Roll out with only FAIL regression
**Attempt:** Submit a FAIL regression result, then attempt rollout.
**Defense:** HIGH-5 guard queries specifically for `testVerdict: "PASS"`. FAIL does not satisfy this.
**Result: BLOCKED** ✅

### ATTACK-14: Roll out with unmitigated CRITICAL harm
**Attempt:** Record CRITICAL harm event (mitigated=false), then attempt rollout.
**Defense:** HIGH-4 guard at line 81: `findFirst({ where: { candidateId, workspaceId, severity: "CRITICAL", mitigated: false } })` returns event → `ROLLOUT_BLOCKED_CRITICAL_HARM`.
**Result: BLOCKED** ✅

### ATTACK-15: Set invalid rollout stage string
**Attempt:** `rolloutStage: "PROD"` or any non-enumerated string.
**Defense:** `VALID_ROLLOUT_STAGES = ["SHADOW","CANARY","PARTIAL","FULL","PAUSED"]`; check at line 30 → violations.push().
**Result: BLOCKED** ✅

---

## Attack Surface 4: Harm Suppression

### ATTACK-16: Create harm event with mitigated=true from request
**Attempt:** Include `{ mitigated: true }` in POST body to mark harm as mitigated on creation.
**Defense:** `recordHarmEvent()` creates with hard-coded `mitigated: false` (Prisma schema default). The route Zod schema does not accept `mitigated` as a body field.
**Result: BLOCKED** ✅

### ATTACK-17: Mitigate harm from another workspace
**Attempt:** Call markHarmMitigated with a harmEventId from workspace B while authenticated to workspace A.
**Defense:** `findFirst({ where: { id: harmEventId, workspaceId: A } })` returns null → `{ mitigated: false, violations: ["Harm event not found in workspace"] }`.
**Result: BLOCKED** ✅

### ATTACK-18: Delete harm event to unblock rollout
**Attempt:** There is no `DELETE /api/owner/learning-harm-events` route.
**Defense:** No delete route exists. Harm events are append-only in the DB. No service function for deletion of harm events.
**Result: BLOCKED — no delete path exists** ✅

---

## Attack Surface 5: Attribution Review Integrity

### ATTACK-19: Attribution with invalid verdict
**Attempt:** `verdict: "CLEARED"` (not in VALID_VERDICTS).
**Defense:** Validation: `VALID_VERDICTS = ["ATTRIBUTED","NOT_ATTRIBUTED","PARTIAL","INCONCLUSIVE"]`; check fires first.
**Result: BLOCKED** ✅

### ATTACK-20: Attribution with out-of-range confidenceScore
**Attempt:** `confidenceScore: 1.5` or negative value.
**Defense:** `if (confidenceScore < 0.0 || confidenceScore > 1.0) violations.push(...)`.
**Result: BLOCKED** ✅

### ATTACK-21: Attribution without matching harm event
**Attempt:** Reference a fabricated harmEventId.
**Defense:** `findFirst({ where: { id: harmEventId, workspaceId } })` returns null → violation.
**Result: BLOCKED** ✅

---

## Attack Surface 6: Auth and Session

### ATTACK-22: Unauthenticated request
**Attempt:** POST without session cookie/token.
**Defense:** `withCanonicalEnforcement` checks session → `translateAuthDecisionToResponse` returns 401.
**Result: 401 returned** ✅

### ATTACK-23: Valid session but wrong workspace capability
**Attempt:** Session has workspace but without OWNER_MANAGE capability.
**Defense:** `withCanonicalEnforcement({ requireCapabilities: [CAPABILITIES.OWNER_MANAGE] })` → 403.
**Result: 403 returned** ✅

### ATTACK-24: Empty workspaceId in request
**Attempt:** Authenticated session but `workspaceId: ""` or missing.
**Defense:** `assertWorkspaceScopedQuery({ workspaceId: "" })` throws before any DB access. Route middleware also validates requireWorkspace=true.
**Result: Error thrown / 422** ✅

---

## Summary

| Attack Surface | Attacks Attempted | Blocked | Partially Blocked | Bypassed |
|---|---|---|---|---|
| Workspace Isolation | 4 | 4 | 0 | 0 |
| Learning Admission | 7 | 7 | 0 | 0 |
| Rollout | 4 | 4 | 0 | 0 |
| Harm Suppression | 3 | 3 | 0 | 0 |
| Attribution Integrity | 3 | 3 | 0 | 0 |
| Auth/Session | 3 | 3 | 0 | 0 |
| **Total** | **24** | **24** | **0** | **0** |

**No successful attacks found.**

### Known Non-Attack Gaps (From Simulation Report)

These are not security breaches but governance completeness gaps:
1. **promotionLocked not checked** in `admitCandidate` (E17) — LOW
2. **No future-date validation** on `reviewedAt` (#30) — LOW
3. **NaN rolloutPct** passes service guard (blocked by Zod route layer) — LOW
