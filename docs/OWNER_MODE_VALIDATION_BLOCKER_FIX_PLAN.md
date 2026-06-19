# Owner Mode Validation Blocker Fix Plan

**Date:** 2026-06-19  
**Based on:** OWNER_MODE_FINAL_VALIDATION_DECISION.md + CRITICAL_FAILURE_REPORT.md + OWNER_MODE_ADVERSARIAL_REPORT.md + OWNER_MODE_WORKFLOW_CHAIN_REPORT.md + CONTROLLED_LEARNING_VALIDATION.md + DB_RUNTIME_VALIDATION.md  
**Status:** PLANNING ONLY — no code has been modified

---

## CORRECTION TO VALIDATION REPORT: HIGH-2 Is a False Positive

Before the fix sequence, one validation finding must be corrected:

**HIGH-2 (Rejected Owner Decision Accepted as Learning Source — ADV-013)** was reported as a gap in CL-RULE-8. Direct source inspection disproves this:

```
# src/domain/owner-mode/controlled-learning.ts:255–261
// CL-RULE-8: Owner decision must be present and approved (not rejected/deferred)
if (!rec.ownerDecisionId || rec.ownerDecisionId.trim() === "") {
  violations.push("CL-RULE-8: ownerDecisionId is required");
}
if (rec.ownerDecisionVerdict !== "approved") {
  violations.push(...);
}
```

The `ownerDecisionVerdict !== "approved"` check IS present and enforced. The validation report's grep searched only for ID presence; it missed the verdict check on the next line. HIGH-2 is **VOID** — CL-RULE-8 correctly blocks rejected/deferred decisions.

This reduces the blocker count to 3 + HIGH-1 + HIGH-3 through HIGH-6.

---

## BLOCKER-1 — Contradiction Gate Is a Dead Branch

**Severity:** CRITICAL  
**Order:** FIX_FIRST  
**File:** `src/domain/business-facts/contradiction-resolver.ts`  
**Lines:** 214–224

### Exact Defect

```typescript
export function hasBlockingContradiction(contract: BusinessFactsContract): boolean {
  for (const contradiction of contract.contradictions) {
    if (
      contradiction.status === "unresolved" &&                                  // ← CHECK A
      ["material_conflict", "critical_conflict"].includes(contradiction.status) // ← CHECK B
    ) {
      return true;
    }
  }
  return false;
}
```

`contradiction.status` cannot simultaneously satisfy CHECK A (`=== "unresolved"`) and CHECK B (`includes(["material_conflict", "critical_conflict"])`). These are mutually exclusive values. The AND condition is impossible at runtime. The function **always returns false**.

### Failed Invariant

The function is the sole implementation of the contradiction blocking gate. Its stated contract (JSDoc above it) is: "Material or critical unresolved conflicts block high-confidence [recommendations]." That contract is violated completely — no contradiction of any severity is ever blocked.

### Runtime Risk (Current)

**Reduced but real.** Direct grep confirms `hasBlockingContradiction` has zero runtime callers outside tests — it is exported but not wired into any active service or route. Its current broken state does not actively corrupt running recommendations.

However:
1. The test at `contradiction-resolver.test.ts:568` asserts its behavior — the test is almost certainly incorrect (it passes because the function always returns false, not because the gate is working).
2. Any future caller of `canPresentDiagnosis` or a recommendation gate that imports `hasBlockingContradiction` will silently receive `false` regardless of contradiction severity.
3. The gate being dead means ADV-006 (revenue contradiction 66% variance) correctly marked "SAFE" was actually non-functional — the block would not have fired if the gate were called.

### Minimum Fix

Remove the impossible AND condition. The correct logic per the JSDoc is:

```typescript
export function hasBlockingContradiction(contract: BusinessFactsContract): boolean {
  for (const contradiction of contract.contradictions) {
    if (
      ["material_conflict", "critical_conflict"].includes(contradiction.status)
    ) {
      return true;
    }
  }
  return false;
}
```

The concept of "unresolved" is already baked into the status values — `material_conflict` and `critical_conflict` represent severity of an unresolved contradiction. Checking `status === "unresolved"` was the bug: it compared against a status string that is not in the contradiction status enum.

### Required Tests

- Existing test at `contradiction-resolver.test.ts:568` must be reviewed: if it passes now with the broken function it will likely fail after the fix unless the test itself was also testing the wrong behavior. Tests must NOT be changed to hide the fix — if tests fail they must be evaluated.
- Add test: `hasBlockingContradiction` returns `true` for a contract with a `material_conflict` contradiction.
- Add test: `hasBlockingContradiction` returns `true` for a contract with a `critical_conflict` contradiction.
- Add test: `hasBlockingContradiction` returns `false` for a contract with only `low_conflict` or `minor_discrepancy` contradictions.

### DB Verification Required?

No. This is a pure domain logic function with no DB access.

---

## BLOCKER-2 — Admission Service Does Not Verify Review Approval

**Severity:** CRITICAL  
**Order:** FIX_SECOND  
**File:** `src/services/controlled-learning-admission.service.ts`  
**Lines:** 22–85

### Exact Defect

The `admitCandidate` function performs these checks in order:
1. Line 26: `assertWorkspaceScopedQuery` — workspace scoping
2. Lines 39–44: `EVIDENCE_ORIGIN_FORBIDDEN.has(evidenceOrigin)` — origin check
3. Lines 47–53: `controlledLearningCandidate.findFirst({ where: { id: candidateId, workspaceId } })` — candidate existence
4. Lines 56–61: `eligibilityStatus.startsWith("LEARNING_ELIGIBLE_")` — eligibility prefix
5. Lines 64–70: `controlledLearningAdmission.findFirst(...)` — duplicate guard

**Missing: no query for `ControlledLearningReview` with `decision: "APPROVED"` at any point.**

A caller with `OWNER_MANAGE` capability can POST to `/api/owner/learning-admissions` with a valid `candidateId` and `eligibilityStatus: "LEARNING_ELIGIBLE_HIGH_CONFIDENCE"` without any `ControlledLearningReview` record existing. The review step — the primary human oversight gate in the learning pipeline — is skippable.

### Failed Invariant

CLAUDE.md hard rule: human review cannot be bypassed before a governed state change. The `FINAL_VALIDATION_DECISION` criterion #22: "Learning eligibility gate exists and cannot be bypassed."

### Runtime Risk

Any `OWNER_MANAGE` user can short-circuit the Review → Admission transition and directly create an `OWNER_MANAGE`-gated admission with no review record. This means a candidate classified as eligible during intake (from candidate service) can be admitted without the separate deliberate review step that the pipeline requires.

### Minimum Fix

After confirming candidate exists (line 53), add a query for an approved review:

```typescript
// Verify an APPROVED review exists for this candidate before admitting
const approvedReview = await (prisma as any).controlledLearningReview.findFirst({
  where: { candidateId, workspaceId, decision: "APPROVED" },
});
if (!approvedReview) {
  return {
    admitted: false,
    violations: ["No approved review found for candidate — review must be completed before admission"],
  };
}
```

This is a single `findFirst` query. No schema changes required.

### Required Tests

- Add test: admission fails with no review record present.
- Add test: admission fails with a `REJECTED` review present.
- Add test: admission fails with a `DEFERRED` review present.
- Add test: admission succeeds with an `APPROVED` review present (all other conditions met).
- Existing tests at `learning-admissions.test.ts` must be reviewed — any test that successfully admits without creating a review record first will now fail and must be updated to create the review record.

### DB Verification Required?

Yes. The new `findFirst` on `ControlledLearningReview` requires LANE_B re-run to confirm FK integrity and query behavior under real PostgreSQL.

---

## BLOCKER-3 — Eligibility Status Is Caller-Controlled

**Severity:** CRITICAL  
**Order:** FIX_SECOND (same session as BLOCKER-2 — both are in the admission service)  
**Files:**
- `src/app/api/owner/learning-admissions/route.ts` line 21
- `src/services/controlled-learning-admission.service.ts` lines 12, 56–61

### Exact Defect

**Route (route.ts:21):**
```typescript
const admitSchema = z.object({
  ...
  eligibilityStatus: z.string().min(1),  // any string accepted from POST body
});
```

**Service (service.ts:56–61):**
```typescript
// Check is against caller-provided value, not DB record
if (!eligibilityStatus.startsWith("LEARNING_ELIGIBLE_")) {
  return {
    admitted: false,
    violations: [`Candidate eligibility status does not allow admission: ${eligibilityStatus}`],
  };
}
```

**DB read (service.ts:47–53):** The candidate record is fetched from DB, but only to assert it exists — its `eligibilityStatus` field is never read.

Result: any `OWNER_MANAGE` caller can POST `eligibilityStatus: "LEARNING_ELIGIBLE_HIGH_CONFIDENCE"` regardless of the candidate's actual stored status in the DB.

### Failed Invariant

The domain-layer eligibility classification (`classifyLearningCandidate`) evaluates 15 rules and stores a result on the candidate record. That stored result is the authoritative eligibility decision. The service must read it from the DB, not accept it from the caller.

### Runtime Risk

A candidate classified as `LEARNING_INELIGIBLE_UNVERIFIED` at intake can be admitted by passing any valid-prefix string in the POST body. The domain safety rules (CL-RULE-3 through CL-RULE-7) enforced during classification are bypassed entirely.

### Minimum Fix

**In route.ts:** Remove `eligibilityStatus` from the Zod schema entirely. It is not caller data — it is DB state.

```typescript
const admitSchema = z.object({
  candidateId: z.string().min(1),
  admittedBy: z.string().min(1),
  admittedAt: z.string().min(1).transform((s) => new Date(s)),
  sourceLabel: z.string().min(1),
  evidenceOrigin: z.string().min(1),
  // eligibilityStatus removed — must be read from DB record
  admissionNotes: z.string(),
});
```

**In service `AdmitCandidateInput` interface:** Remove `eligibilityStatus: string`.

**In service `admitCandidate` body:** After fetching candidate, read `eligibilityStatus` from the DB record:

```typescript
const candidate = await (prisma as any).controlledLearningCandidate.findFirst({
  where: { id: candidateId, workspaceId },
  select: { id: true, workspaceId: true, eligibilityStatus: true },
});
if (!candidate) {
  return { admitted: false, violations: ["Candidate not found or wrong workspace"] };
}

// Read eligibilityStatus from DB record, not from caller input
const eligibilityStatus: string = candidate.eligibilityStatus;
if (!eligibilityStatus.startsWith("LEARNING_ELIGIBLE_")) {
  return {
    admitted: false,
    violations: [`Candidate eligibility status does not allow admission: ${eligibilityStatus}`],
  };
}
```

**In service `controlledLearningAdmission.create` data block:** `eligibilityStatus` is already set correctly since it now comes from the DB record, not input. The `admission.eligibilityStatus` column will receive the authoritative value.

### Required Tests

- Add test: admission fails when candidate's stored `eligibilityStatus` is `LEARNING_INELIGIBLE_UNVERIFIED`, even when POST body attempts to pass a valid-prefix string (remove `eligibilityStatus` from schema so it can't be passed).
- Add test: admission succeeds when candidate's stored `eligibilityStatus` is `LEARNING_ELIGIBLE_VERIFIED_OUTCOME`.
- Existing tests that pass `eligibilityStatus` in the POST body must have it removed from the request payload.

### DB Verification Required?

Yes — `select: { eligibilityStatus: true }` on the candidate query requires LANE_B verification.

---

## HIGH-1 — Audit Trail Missing From 11 Controlled Learning Services

**Severity:** HIGH  
**Order:** FIX_THIRD  
**Files:** All 11 controlled learning service files (admission, rejection, review, rollback, rollout, harm, retention, consent, privacy, attribution, regression)

### Exact Defect

`controlled-learning-candidate.service.ts` writes `controlledLearningCandidateAuditEntry` rows on create, promote, and reject. All other 11 services perform DB mutations with no audit trail.

CLAUDE.md hard rule: "All meaningful mutations must emit audit events." Every service in this list performs governed state mutations (admission, rejection, review decision, rollout stage change, rollback, harm record, consent change, retention policy, privacy control, attribution verdict) with zero audit accountability.

### Failed Invariant

CLAUDE.md: "All meaningful mutations must emit audit events."

### Runtime Risk

No audit trail means:
- Admissions cannot be attributed to an actor after the fact.
- Rollbacks cannot be traced to who triggered them.
- Harm events have no chain of custody.
- Consent changes cannot be audited for compliance.
- If `admittedBy` is falsified in a request, there is no audit-layer cross-check.

### Minimum Fix

Add a `controlledLearningCandidateAuditEntry.create` call (or functionally equivalent governed audit write) in each service's state-mutation function. Follow the exact same pattern as `controlled-learning-candidate.service.ts` lines 99–107.

For services that don't involve a `candidateId` (retention, consent, privacy) the audit model may need a separate audit table or a generic workspace-level audit entry. This should NOT introduce new schema unless no existing audit mechanism covers these. If a workspace-level audit event mechanism exists, use it.

**Scope note:** This is 11 files but the pattern is identical in each. The candidate service shows the exact method — no new infrastructure is required.

### Required Tests

Each service test file should assert that a mutation creates a corresponding audit entry. Given CLAUDE.md rules, these are mandatory acceptance tests.

### DB Verification Required?

Yes — audit entry writes require LANE_B verification.

---

## HIGH-3 — Outcome Window Is Caller-Controlled Boolean

**Severity:** HIGH  
**Order:** DEFER (after BLOCKER-1/2/3 and HIGH-1)  
**File:** `src/domain/owner-mode/controlled-learning.ts` line 278  
**Service:** `src/services/controlled-learning-candidate.service.ts`

### Exact Defect

CL-RULE-10 checks `rec.outcomeWindowElapsed` (a boolean), but this boolean is provided by the caller in the `LearningCandidateRecord` interface — it is not computed from `outcomeCreatedAt` and `actionTakenAt` timestamps. A caller can pass `outcomeWindowElapsed: true` for a 7-day pricing outcome and be admitted.

### Minimum Fix (Deferred)

Compute `outcomeWindowElapsed` in the service layer from actual timestamp fields rather than accepting it from the caller. Requires defining a minimum window (e.g., 30 days) and comparing `outcomeCreatedAt - actionTakenAt >= MIN_OUTCOME_WINDOW_DAYS`. No schema change required if `outcomeCreatedAt` is already stored.

**Do not implement until BLOCKER-1/2/3 + HIGH-1 are fixed and LANE_B passes.**

---

## HIGH-4 — No Harm-to-Rollout Circuit Breaker

**Severity:** HIGH  
**Order:** DEFER  
**File:** `src/services/controlled-learning-rollout.service.ts`

### Exact Defect

Rollout service does not query `ControlledLearningHarmEvent` before accepting a new rollout stage. A candidate can be advanced to FULL rollout with an active CRITICAL harm event.

### Minimum Fix (Deferred)

In `setRolloutFlag`, before writing the new stage, query `ControlledLearningHarmEvent` for unmitigated harm events with `severity: "CRITICAL"` on the candidate. If any exist, return a violation and block the rollout stage change (except to PAUSED or rollback).

---

## HIGH-5 — Rollout Does Not Require Regression Result

**Severity:** HIGH  
**Order:** DEFER  
**File:** `src/services/controlled-learning-rollout.service.ts`

### Exact Defect

Rollout service does not query `ControlledLearningRegressionResult` before setting stage. FULL rollout with no regression test is accepted.

### Minimum Fix (Deferred)

For stage >= PARTIAL, require a `ControlledLearningRegressionResult` with `testVerdict: "PASS"` to exist for the candidate in the workspace. Return a violation otherwise.

---

## HIGH-6 — Admission Does Not Check for Existing Harm Events

**Severity:** HIGH  
**Order:** FIX_SECOND (add to same admission service fix pass as BLOCKER-2/3)  
**File:** `src/services/controlled-learning-admission.service.ts`

### Exact Defect

Admission service does not query `ControlledLearningHarmEvent` before admitting. A candidate with a CRITICAL harm event can be admitted.

### Minimum Fix

After confirming candidate exists, add:

```typescript
const criticalHarm = await (prisma as any).controlledLearningHarmEvent.findFirst({
  where: { candidateId, workspaceId, severity: "CRITICAL", mitigated: false },
});
if (criticalHarm) {
  return {
    admitted: false,
    violations: ["Candidate has an unmitigated CRITICAL harm event — admission blocked until harm is mitigated"],
  };
}
```

This is one additional `findFirst` in the same admission service function, same fix pass as BLOCKER-2.

---

## MEDIUM Findings (Deferred)

| ID | Finding | File | Defer Reason |
|----|---------|------|-------------|
| M-1 | Rollback: empty workspaceId throws before clean error path | `controlled-learning-rollback.service.ts:31-37` | Non-exploitable — `assertWorkspaceScopedQuery` would reject empty string; clean error path is defensive only |
| M-2 | `[reviewId]/route.ts` has only 2 `withCanonicalEnforcement` uses | `learning-reviews/[reviewId]/route.ts` | Confirmed GET-only route — 2 uses (import + GET handler) is correct; not a vulnerability |
| M-3 | Attribution: `confidenceScore: 0.15` with `verdict: "ATTRIBUTED"` | `controlled-learning-attribution.service.ts` | No active exploits — defer to a separate validation rule addition |
| M-4 | No conflict-of-interest check: owner self-verifies evidence | `evidence-verification.ts` | Mitigated by CL-RULE-12 requiring separate human approver; defer |
| M-5 | No minimum confidence threshold for ATTRIBUTED verdict | `controlled-learning-attribution.service.ts` | Defer with M-3 |

**M-2 is VOID as a finding** — direct source inspection confirms `[reviewId]/route.ts` is GET-only by design. 2 uses is correct.

---

## DB Runtime Blocker (Infrastructure Only)

**Not a code defect.** `DATABASE_URL` in `.env.local` contains `channel_binding=require` which Prisma's native driver rejects with P1013. This blocks all runtime execution in the local container.

**Fix:** Remove `channel_binding=require` from the DATABASE_URL connection string. This is a deployment environment configuration change, not a source code change. CI (LANE_B with postgres:16) is unaffected and has been passing.

---

## Fix Sequence Summary

| Order | ID | Severity | File(s) | DB Verification Required |
|-------|-----|---------|---------|------------------------|
| FIX_FIRST | BLOCKER-1 | CRITICAL | `contradiction-resolver.ts:215-222` | NO |
| FIX_SECOND | BLOCKER-2 | CRITICAL | `controlled-learning-admission.service.ts` | YES |
| FIX_SECOND | BLOCKER-3 | CRITICAL | `learning-admissions/route.ts:21` + `controlled-learning-admission.service.ts:12,56-61` | YES |
| FIX_SECOND | HIGH-6 | HIGH | `controlled-learning-admission.service.ts` | YES |
| FIX_THIRD | HIGH-1 | HIGH | 11 controlled learning service files | YES |
| DEFER | HIGH-3 | HIGH | `controlled-learning.ts:278` + candidate service | YES |
| DEFER | HIGH-4 | HIGH | `controlled-learning-rollout.service.ts` | YES |
| DEFER | HIGH-5 | HIGH | `controlled-learning-rollout.service.ts` | YES |
| VOID | HIGH-2 | — | Already enforced at `controlled-learning.ts:260` | — |
| VOID | M-2 | — | GET-only route by design | — |

**FIX_SECOND rationale:** BLOCKER-2, BLOCKER-3, and HIGH-6 are all in the same function (`admitCandidate` in `controlled-learning-admission.service.ts`). They must be fixed in one cohesive pass to avoid partial states where one gate is fixed but the function is still unsafe.

---

## Decision

**FIX_CONTRADICTION_GATE_FIRST**

`hasBlockingContradiction` is fixed in isolation (no DB, no schema, no cascade). It is the simplest, most contained fix and eliminates a permanently broken exported gate before touching the admission service. After BLOCKER-1 is committed and tests green, the admission service (BLOCKER-2 + BLOCKER-3 + HIGH-6) is one cohesive fix pass. Then HIGH-1 (audit trail across 11 services). LANE_B re-run after each of FIX_SECOND and FIX_THIRD.

---

## Final Output

**Branch:** `claude/cool-ptolemy-dxrpm7`  
**Commit:** `b3190ca4` (validation documents, no code changes)  
**Blockers found:** 9 (3 CRITICAL + 6 HIGH as reported). Corrected after direct source verification: 3 CRITICAL + 5 HIGH (HIGH-2 is void — check exists at controlled-learning.ts:260).  
**Critical blockers:** 3 (BLOCKER-1: contradiction gate dead branch; BLOCKER-2: missing review prerequisite; BLOCKER-3: caller-controlled eligibility status)  
**Recommended first fix:** FIX_CONTRADICTION_GATE_FIRST — isolated domain logic, no DB, no schema change, zero cascade risk  
**Rejected first fixes:**
- FIX_DB_RUNTIME_FIRST — the `.env.local` P1013 error is infrastructure-only; CI LANE_B is already green; fixing env config before code fixes has no safety value
- FIX_ALL_IN_ONE_BATCH — mixing isolated domain fix (BLOCKER-1) with multi-check service rewrite (BLOCKER-2/3/HIGH-6) and 11-file audit addition (HIGH-1) in one commit makes LANE_B failure diagnosis impossible
- FIX_WORKFLOW_CHAIN_FIRST — the "BROKEN" upstream chain steps in the workflow chain report are NOT broken; they exist under `/api/diagnosis/`, `/api/decisions/`, etc.; the workflow chain agent searched under `/api/owner/` only; no fix is needed
- FIX_API_SURFACE_FIRST — API surface is structurally complete; the gaps are in the service logic beneath it

**Fix sequence:**
1. Fix BLOCKER-1 (`contradiction-resolver.ts`) — commit, run tests
2. Fix BLOCKER-2 + BLOCKER-3 + HIGH-6 (`controlled-learning-admission.service.ts` + `learning-admissions/route.ts`) — commit, LANE_B
3. Fix HIGH-1 (audit trail in 11 services) — commit, LANE_B
4. Defer HIGH-3/4/5 to next planning cycle

**Next prompt:** `OWNER_MODE_FIX_BLOCKER_1_CONTRADICTION_GATE`
