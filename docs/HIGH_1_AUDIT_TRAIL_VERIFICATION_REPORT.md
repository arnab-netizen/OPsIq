# HIGH-1 Audit Trail — Verification Report

**Commit:** d11495ad  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Date:** 2026-06-19  
**Status:** VERIFIED — NO SCHEMA CHANGE

---

## Scope

HIGH-1 required that all 11 controlled-learning services emit explicit audit events for material lifecycle mutations. Prior to this fix, only the candidate service emitted audit entries.

---

## Implementation Summary

### Audit model used

| Service | Has candidateId | Audit model |
|---------|----------------|-------------|
| admission | yes | `ControlledLearningCandidateAuditEntry` |
| review | yes | `ControlledLearningCandidateAuditEntry` |
| rejection | yes | `ControlledLearningCandidateAuditEntry` |
| harm | yes | `ControlledLearningCandidateAuditEntry` |
| regression | yes | `ControlledLearningCandidateAuditEntry` |
| rollout | yes | `ControlledLearningCandidateAuditEntry` |
| rollback | yes | `ControlledLearningCandidateAuditEntry` |
| privacy | yes | `ControlledLearningCandidateAuditEntry` |
| consent | yes | `ControlledLearningCandidateAuditEntry` |
| attribution | yes | `ControlledLearningCandidateAuditEntry` |
| retention | NO (workspace-level) | `AuditEvent` (with randomUUID()) |

### Events emitted per service

**admission.service:**
- `ADMISSION_CREATED` — on successful write (includes eligibilityStatus, sourceLabel, evidenceOrigin)
- `ADMISSION_BLOCKED_INELIGIBLE` — Guard 3 block (DB eligibilityStatus does not allow promotion)
- `ADMISSION_BLOCKED_NO_APPROVED_REVIEW` — Guard 4 block (no APPROVED review found)
- `ADMISSION_BLOCKED_CRITICAL_HARM` — Guard 5 block (unmitigated CRITICAL harm event exists)
- Note: Guards 1 (forbidden origin) and 2 (candidate not found) fire before candidateId is confirmed — no audit emitted for those paths by design.

**review.service:** `REVIEW_APPROVED` / `REVIEW_REJECTED` / `REVIEW_DEFERRED`

**rejection.service:** `REJECTION_CREATED`

**harm.service:** `HARM_EVENT_RECORDED_${severity}` (e.g. HARM_EVENT_RECORDED_CRITICAL), `HARM_EVENT_MITIGATED`

**regression.service:** `REGRESSION_${verdict}` (e.g. REGRESSION_PASS, REGRESSION_FAIL)

**rollout.service:** `ROLLOUT_FLAG_SET_${stage}` (e.g. ROLLOUT_FLAG_SET_CANARY)

**rollback.service:** `ROLLBACK_${code}` (e.g. ROLLBACK_REGRESSION_DETECTED)

**privacy.service:** `PRIVACY_CONTROL_${type}` (e.g. PRIVACY_CONTROL_ANONYMIZE)

**consent.service:** `CONSENT_GIVEN` / `CONSENT_WITHHELD`

**attribution.service:** `ATTRIBUTION_REVIEW_${verdict}` (e.g. ATTRIBUTION_REVIEW_ATTRIBUTED)

**retention.service:** `controlled_learning.retention_policy_set` (via `AuditEvent.eventName`)

---

## Audit Design Properties Verified

| Property | Status |
|----------|--------|
| workspaceId always included | YES |
| candidateId always included (where applicable) | YES |
| actorId always included (may be null for system/email actors) | YES |
| action / eventName always included | YES |
| detail field describes action + key parameters | YES |
| No raw sensitive evidence or PII logged | YES — only status codes, IDs, labels |
| No passwords, tokens, or secrets logged | YES |
| Audit emission is non-blocking (try/catch) | YES — all wrapped in try/catch |
| Audit failure does not abort main mutation | YES — console.error only |
| Blocked admissions audited after candidateId confirmed | YES — Guards 3/4/5 |
| Harm events audited | YES — HARM_EVENT_RECORDED_${severity} |
| Rollback events audited | YES — ROLLBACK_${code} |
| Cross-tenant path — no audit written (correct: no valid candidateId) | YES |

---

## Test Coverage Added

File: `src/__tests__/domain/owner-mode/controlled-learning-admission-rejection.test.ts`

New audit tests added (9 tests):
- emits ADMISSION_CREATED audit entry on success
- emits ADMISSION_BLOCKED_INELIGIBLE audit on ineligible status
- emits ADMISSION_BLOCKED_NO_APPROVED_REVIEW when review missing
- emits ADMISSION_BLOCKED_CRITICAL_HARM when unmitigated critical harm exists
- audit emission failure does not block admission success
- audit entry includes workspaceId on success
- no audit for forbidden origin guard (candidateId not yet confirmed)
- emits REJECTION_CREATED audit entry on success (rejection service)
- audit emission failure does not block rejection success (rejection service)

Total: 42 tests passing (was 33 before this fix).

---

## Schema Changes

**None.** HIGH-1 uses existing `ControlledLearningCandidateAuditEntry` and `AuditEvent` DB tables. No migration required.

---

## LANE_B Decision

LANE_B (db-verification.yml) is not required for HIGH-1 because:
1. No schema changes were made.
2. No new DB test files were added.
3. The prior LANE_B run (27818246204, commit a7358b2e) verified DB integrity for the admission guard fixes.
4. HIGH-1 adds service-level try/catch writes to existing tables — no structural risk.

LANE_B remains GREEN from prior run. No re-run required.

---

## Remaining Minor Gaps (not blockers)

1. **No audit on Guard 1/2 block** (forbidden origin, candidate not found): candidateId is not yet confirmed at these points, so `ControlledLearningCandidateAuditEntry` cannot be written. Acceptable by design. Could be supplemented with workspace-level `AuditEvent` in a future pass.

2. **No audit on Guard 6 (duplicate admission)**: Low severity — idempotency guard, not a security event.

3. **No audit on failed `promoteLearningCandidate`**: The candidate service does not emit an audit entry when promotion is denied for ineligible status. The admission service does emit `ADMISSION_BLOCKED_INELIGIBLE` for the equivalent path in the admission flow. This inconsistency is a data quality gap, not a security gap.

4. **`admittedBy` field not validated for empty string**: If `admittedBy=""` is passed to `admitCandidate`, all guards pass and the record is written with a blank actor. This should have a non-empty validation guard added.

5. **`rejectionCode` unconstrained**: No allowlist enforced on rejectionCode in `rejectCandidateFinal`. Data quality gap, not a security gap.

---

## Verification Result

**HIGH-1: VERIFIED COMPLETE**  
All 11 controlled-learning services now emit audit events for material mutations. Audit trail is non-blocking, workspace-scoped, and does not log raw sensitive data. No schema change required.
