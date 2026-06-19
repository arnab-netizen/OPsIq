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
**Status:** ✅ FIXED — 2026-06-19 (gap fix commit)  
**Fix:** Guard 0 added as first check in `admitCandidate`. Rejects empty string and whitespace-only `admittedBy` before any DB access. 3 tests added, all pass.  
**Classification:** CLOSED

---

## Deferred HIGH Items (from prior analysis, not new)

These were deferred explicitly before the repeat validation. They are reproduced here for traceability.

### HIGH-3 — `outcomeWindowElapsed` caller-controlled boolean

**Severity:** MEDIUM  
**Status:** ✅ FIXED — 2026-06-19 (gap fix commit)  
**Fix:** `outcomeRecordedAt DateTime?` added to schema and migration. Stored during candidate creation. Two guards added to `admitCandidate`: block if null (`ADMISSION_BLOCKED_NO_OUTCOME_TIMESTAMP`), block if < 30 days elapsed (`ADMISSION_BLOCKED_OUTCOME_WINDOW_NOT_ELAPSED`). 5 tests added, all pass. Domain layer untouched.  
**Classification:** CLOSED

### HIGH-4 — No harm-to-rollout circuit breaker

**Severity:** MEDIUM  
**Status:** ✅ FIXED — 2026-06-19 (gap fix commit)  
**Fix:** Guard added to `setRolloutFlag`: queries `controlledLearningHarmEvent` for unmitigated CRITICAL harm scoped to `{ candidateId, workspaceId, severity: "CRITICAL", mitigated: false }`. Blocks with `ROLLOUT_BLOCKED_CRITICAL_HARM` audit entry. 6 tests added, all pass.  
**Classification:** CLOSED

### HIGH-5 — Rollout does not require regression result

**Severity:** MEDIUM  
**Status:** ✅ FIXED — 2026-06-19 (gap fix commit)  
**Fix:** Guard added to `setRolloutFlag` before HIGH-4 check: queries `controlledLearningRegressionResult` for `{ candidateId, workspaceId, testVerdict: "PASS" }`. Blocks with `ROLLOUT_BLOCKED_NO_PASSING_REGRESSION` audit entry. 5 tests added, all pass.  
**Classification:** CLOSED

---

## Resolved Items (historical)

| Item | Fixed in commit | Verified |
|------|----------------|---------|
| BLOCKER-1: `hasBlockingContradiction()` dead branch | 67a1867d | Unit tests |
| BLOCKER-2: Caller-controlled eligibilityStatus accepted | a81a9656 | LANE_B 27818246204 |
| BLOCKER-3: No review gate before admission | a81a9656 | LANE_B 27818246204 |
| HIGH-6: No critical harm circuit breaker on admission | a81a9656 | LANE_B 27818246204 |
| HIGH-1: No audit trail on 11 controlled-learning services | d11495ad | Unit tests (42 pass) |
| HIGH-3: `outcomeWindowElapsed` caller-controlled | gap-fix commit | Unit tests (5 pass) |
| HIGH-4: No harm-to-rollout circuit breaker | gap-fix commit | Unit tests (6 pass) |
| HIGH-5: Rollout no regression prerequisite | gap-fix commit | Unit tests (5 pass) |
| SCENARIO-29: `admittedBy=""` not validated | gap-fix commit | Unit tests (3 pass) |

---

## Risk Summary

| Category | Count | Notes |
|----------|-------|-------|
| Active blockers | 0 | All blockers resolved |
| Active HIGH items | 0 | HIGH-3/4/5 all fixed 2026-06-19 |
| Active LOW items | 0 | SCENARIO-29 fixed 2026-06-19 |
| Unsafe proceed risk | 0 | Verified — 30-scenario simulation |
| Cross-tenant risk | 0 | Verified — workspace scoping enforced |
