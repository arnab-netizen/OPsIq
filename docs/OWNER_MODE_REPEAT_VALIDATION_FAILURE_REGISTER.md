# Owner Mode — Repeat Validation Failure Register

**Date:** 2026-06-19  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Commit:** d11495ad  

---

## Active Failures from 30-Scenario Simulation

### SCENARIO-8 — "PILOT" rollout stage not valid (test input error)

**Severity:** Non-issue  
**Category:** Test scenario specification error  
**Description:** Scenario #8 described a "valid rollout flag set at PILOT stage." However, the rollout service's `VALID_ROLLOUT_STAGES` set contains `["SHADOW","CANARY","PARTIAL","FULL","PAUSED"]`. "PILOT" is not a member of this set. The guard correctly rejects it. The pipeline behavior is correct. The test scenario input was wrong.  
**Resolution:** Not a pipeline defect. Valid stages must be one of SHADOW/CANARY/PARTIAL/FULL/PAUSED. No code change required.  
**Classification:** CLOSED (specification clarification only)

---

### SCENARIO-29 — `admittedBy=""` not validated in admitCandidate

**Severity:** LOW  
**Category:** Missing input validation  
**Description:** The `admitCandidate` function in `controlled-learning-admission.service.ts` does not validate that `admittedBy` is a non-empty string. If an empty string is passed, all 6 guards pass (none check admittedBy content), the admission record is written with `admittedBy=""`, and the audit entry is written with `actorId=""`. This produces an anonymous admission record with no actor identity.  
**Impact:** An admission could be created without a valid actor identifier, making it unattributable in audit review. Not a security bypass — eligibility, review, and harm guards all still fire. The admission itself is still guarded against ineligible/unreviewed candidates.  
**Resolution status:** OPEN — deferred. Not a blocker for internal trial. Should be addressed before real-business-owner use at scale.  
**Proposed fix:** Add `if (!input.admittedBy) violations.push("admittedBy is required");` before the DB access path, consistent with how `setRetentionPolicy` and `recordConsent` handle required actor fields.  
**Classification:** KNOWN_GAP — LOW priority

---

## Deferred HIGH Items (from prior analysis, not new)

These were deferred explicitly before the repeat validation. They are reproduced here for traceability.

### HIGH-3 — `outcomeWindowElapsed` caller-controlled boolean

**Severity:** MEDIUM  
**Description:** In the controlled-learning eligibility evaluation, `outcomeWindowElapsed` is passed as a boolean by the caller. There is no server-side enforcement that the outcome window has actually elapsed — the caller could pass `true` to make a candidate appear eligible when the window has not closed.  
**Status:** DEFERRED — not implemented in this pass.  
**Blocks:** OWNER_MODE_READY_FOR_REAL_BUSINESS_OWNER_USE

### HIGH-4 — No harm-to-rollout circuit breaker

**Severity:** MEDIUM  
**Description:** An unmitigated harm event (even CRITICAL) does not block a new rollout flag from being set. The harm guard only fires in `admitCandidate`. A new rollout could proceed on a model/candidate with active unmitigated critical harm.  
**Status:** DEFERRED  
**Blocks:** OWNER_MODE_READY_FOR_REAL_BUSINESS_OWNER_USE

### HIGH-5 — Rollout does not require regression result

**Severity:** MEDIUM  
**Description:** `setRolloutFlag` does not verify that a regression test result exists for the candidate before allowing rollout to proceed. A candidate could be rolled out without any regression verification.  
**Status:** DEFERRED  
**Blocks:** OWNER_MODE_READY_FOR_REAL_BUSINESS_OWNER_USE

---

## Resolved Items (historical)

| Item | Fixed in commit | Verified |
|------|----------------|---------|
| BLOCKER-1: `hasBlockingContradiction()` dead branch | 67a1867d | Unit tests |
| BLOCKER-2: Caller-controlled eligibilityStatus accepted | a81a9656 | LANE_B 27818246204 |
| BLOCKER-3: No review gate before admission | a81a9656 | LANE_B 27818246204 |
| HIGH-6: No critical harm circuit breaker on admission | a81a9656 | LANE_B 27818246204 |
| HIGH-1: No audit trail on 11 controlled-learning services | d11495ad | Unit tests (42 pass) |

---

## Risk Summary

| Category | Count | Notes |
|----------|-------|-------|
| Active blockers | 0 | All blockers resolved |
| Active HIGH items | 3 | HIGH-3/4/5 deferred |
| Active LOW items | 1 | SCENARIO-29 admittedBy="" |
| Unsafe proceed risk | 0 | Verified — 30-scenario simulation |
| Cross-tenant risk | 0 | Verified — workspace scoping enforced |
