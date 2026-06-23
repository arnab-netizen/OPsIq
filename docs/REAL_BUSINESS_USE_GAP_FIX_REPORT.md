# Real Business Use Gap Fix Report

**Date:** 2026-06-19  
**Branch:** `claude/cool-ptolemy-dxrpm7`  
**Trigger:** `OWNER_MODE_FIX_REAL_BUSINESS_USE_GAPS`  
**Prior state:** `OWNER_MODE_READY_FOR_INTERNAL_TRIAL_ONLY`  
**Target state after re-validation:** `OWNER_MODE_READY_FOR_REAL_BUSINESS_OWNER_USE`

---

## Gaps Fixed

### SCENARIO-29 — Empty `admittedBy` bypassed all admission guards

**Severity:** Critical (security / data integrity)  
**Root cause:** `admitCandidate` in `controlled-learning-admission.service.ts` began at the forbidden-origin check, never validating the actor identity. Passing `admittedBy: ""` produced an audit entry with a null-equivalent actor, making admission events untraceable.

**Fix:** Guard 0 added as the very first check in `admitCandidate`:
- Rejects if `admittedBy` is falsy or whitespace-only
- Returns `violations: ["admittedBy is required and must be a non-empty actor identifier"]`
- No DB call made; cheap early exit
- Does not touch any other guard or service

**Files changed:**
- `src/services/controlled-learning-admission.service.ts` — Guard 0 added

---

### HIGH-3 — `outcomeWindowElapsed` was a caller-controlled boolean

**Severity:** High (gate bypass vector)  
**Root cause:** `LearningCandidateRecord.outcomeWindowElapsed: boolean` was supplied by the caller and used directly in domain classification (CL-RULE-10). A malicious or buggy caller could pass `outcomeWindowElapsed: true` for a candidate with no meaningful outcome history, bypassing the 30-day stabilisation requirement.

**Fix (two parts):**

1. **Schema:** Added `outcomeRecordedAt DateTime?` to `ControlledLearningCandidate` model. Nullable so existing rows remain valid; null means "window cannot be verified."

2. **Service:** `CreateLearningCandidateInput` gained `outcomeRecordedAt?: Date`. Value is stored during candidate creation; caller can supply it but the server enforces the window independently.

3. **Admission service:** Two new guards in `admitCandidate` (after cross-workspace check):
   - If `outcomeRecordedAt` is null → block with `ADMISSION_BLOCKED_NO_OUTCOME_TIMESTAMP`
   - If `(admittedAt - outcomeRecordedAt) < 30 days` → block with `ADMISSION_BLOCKED_OUTCOME_WINDOW_NOT_ELAPSED`
   - Both write best-effort audit entries before returning

**Domain layer untouched:** `LearningCandidateRecord.outcomeWindowElapsed` and `classifyLearningCandidate` are not modified. The domain classification still runs; the server-side enforcement is additive.

**Files changed:**
- `prisma/schema.prisma` — `outcomeRecordedAt DateTime?` added to `ControlledLearningCandidate`
- `prisma/migrations/20260619_high3_high4_high5_scenario29_rollout_outcome_window/migration.sql` — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS "outcomeRecordedAt"`
- `src/services/controlled-learning-candidate.service.ts` — `outcomeRecordedAt` stored during `create`
- `src/services/controlled-learning-admission.service.ts` — Guards 2b added

---

### HIGH-5 — `setRolloutFlag` did not require a passing regression result

**Severity:** High (safety gate bypass)  
**Root cause:** A candidate could be rolled out to real users without any regression testing result, let alone a passing one.

**Fix:** In `setRolloutFlag`, before the upsert, query `controlledLearningRegressionResult` for a record with `testVerdict: "PASS"` scoped to `{ candidateId, workspaceId }`. If none found:
- Write best-effort `ROLLOUT_BLOCKED_NO_PASSING_REGRESSION` audit entry
- Return `{ set: false, violations: ["Rollout requires a passing regression result — none found for this candidate"] }`
- Upsert never reached

**Files changed:**
- `src/services/controlled-learning-rollout.service.ts` — HIGH-5 guard added

---

### HIGH-4 — No harm-to-rollout circuit breaker

**Severity:** High (safety)  
**Root cause:** An unmitigated CRITICAL harm event did not block rollout. A candidate responsible for measurable harm could continue being rolled out.

**Fix:** In `setRolloutFlag`, after the HIGH-5 regression guard, query `controlledLearningHarmEvent` for `{ candidateId, workspaceId, severity: "CRITICAL", mitigated: false }`. If found:
- Write best-effort `ROLLOUT_BLOCKED_CRITICAL_HARM` audit entry
- Return `{ set: false, violations: ["Rollout blocked: candidate has an unmitigated CRITICAL harm event — mitigate before rolling out"] }`

Guard order: HIGH-5 (regression) checked before HIGH-4 (harm). Rationale: regression is a prerequisite of correctness; harm is a safety gate. Both must pass to proceed.

**Files changed:**
- `src/services/controlled-learning-rollout.service.ts` — HIGH-4 guard added

---

## Tests Added

### `controlled-learning-admission-rejection.test.ts`

New describe blocks:
- **SCENARIO-29 — admittedBy validation** (3 tests)
  - Empty string rejected before any DB call
  - Whitespace-only rejected before any DB call
  - Valid non-empty accepted
- **HIGH-3 — outcome window** (5 tests)
  - `outcomeRecordedAt: null` blocks admission + emits audit
  - Outcome < 30 days blocks + emits `ADMISSION_BLOCKED_OUTCOME_WINDOW_NOT_ELAPSED`
  - Outcome ≥ 30 days allows admission
  - Exactly 29 days is blocked (boundary test)
  - Null from DB blocks even if caller would have tried to bypass

`makeCandidate` updated to include `outcomeRecordedAt: new Date("2026-04-01")` as default so all existing 35 tests continue to pass unmodified.

**Total:** 50 tests, 50 pass

### `controlled-learning-rollout-rollback.test.ts`

New describe blocks:
- **HIGH-5 — regression prerequisite** (5 tests)
  - No regression result blocks rollout
  - FAIL-only regression (no PASS) blocks rollout
  - Audit entry `ROLLOUT_BLOCKED_NO_PASSING_REGRESSION` written
  - PASS regression allows rollout
  - Query scoped to `{ candidateId, workspaceId, testVerdict: "PASS" }`
- **HIGH-4 — harm circuit breaker** (6 tests)
  - Unmitigated CRITICAL harm blocks rollout
  - Audit entry `ROLLOUT_BLOCKED_CRITICAL_HARM` written
  - Mitigated CRITICAL (findFirst returns null) allows rollout
  - HIGH/MEDIUM harm does not block (query filters severity=CRITICAL)
  - Query scoped to `{ candidateId, workspaceId, severity: "CRITICAL", mitigated: false }`
  - Cross-workspace harm does not block unrelated workspace

`beforeEach` defaults: `regressionResult.findFirst → { id: "reg-1" }`, `harmEvent.findFirst → null` — all existing 38 tests continue to pass.

**Total:** 49 tests, 49 pass

---

## Schema Migration

**File:** `prisma/migrations/20260619_high3_high4_high5_scenario29_rollout_outcome_window/migration.sql`

```sql
ALTER TABLE "controlled_learning_candidates"
  ADD COLUMN IF NOT EXISTS "outcomeRecordedAt" TIMESTAMP(3);
```

Nullable, idempotent (`IF NOT EXISTS`). Existing rows remain valid with `null`; admission service blocks null until caller populates the field.

**LANE_B required:** Yes — schema changed, `db-verification.yml` must be triggered.

---

## Validation Gates

| Check | Result |
|---|---|
| `npx tsc --noEmit` | CLEAN |
| `npx prisma validate` | VALID |
| admission-rejection tests | 50/50 PASS |
| rollout-rollback tests | 49/49 PASS |
| Domain layer modified | NO |
| Safety gate modified | NO |
| Scorer modified | NO |
| Learning made automatic | NO |
| Gates weakened | NO |

---

## Audit Actions Emitted

New audit action codes:

| Code | Trigger |
|---|---|
| `ADMISSION_BLOCKED_NO_OUTCOME_TIMESTAMP` | `outcomeRecordedAt` is null at admission time |
| `ADMISSION_BLOCKED_OUTCOME_WINDOW_NOT_ELAPSED` | < 30 days since `outcomeRecordedAt` |
| `ROLLOUT_BLOCKED_NO_PASSING_REGRESSION` | No PASS regression result found |
| `ROLLOUT_BLOCKED_CRITICAL_HARM` | Unmitigated CRITICAL harm event exists |

All use best-effort pattern (try/catch) — audit failure does not abort the main result.

---

## Remaining Prerequisite Before Claiming `REAL_BUSINESS_OWNER_USE`

1. Full 30+ scenario re-validation must pass
2. LANE_B (db-verification.yml) must pass with the migration applied
3. `OWNER_MODE_REPEAT_VALIDATION_REPORT.md` must be updated with re-validation results
4. `OWNER_MODE_LONG_TERM_PARTNERSHIP_READINESS_DECISION.md` must confirm upgrade

**Do NOT claim `REAL_BUSINESS_OWNER_USE` until all four conditions above are confirmed.**
