# Blocker 2/3 Fix Report — Admission Service Security Fixes

**Date:** 2026-06-19  
**Files:** `src/services/controlled-learning-admission.service.ts`, `src/app/api/owner/learning-admissions/route.ts`, `src/__tests__/api/owner/learning-admissions.test.ts`  
**Status:** BLOCKER_2_3_FIXED_CODE_VERIFIED

---

## Bugs Fixed

### BLOCKER-2: Admission service never checked for APPROVED review

**Before:** `admitCandidate()` performed no query on `ControlledLearningReview`. A candidate could be admitted without any review having been completed.

**After:** Guard 4 queries `controlledLearningReview.findFirst({ where: { candidateId, workspaceId, decision: "APPROVED" } })`. If no APPROVED review exists, admission is blocked with violation message `"No APPROVED review found for candidate — a review must be completed and approved before admission"`.

---

### BLOCKER-3: `eligibilityStatus` accepted from POST body — domain gate bypassed

**Before:** The route's Zod schema included `eligibilityStatus` as a caller-supplied field. The service accepted it via `AdmitCandidateInput` and wrote it directly to the DB. A caller could supply any eligibility status string and bypass the domain gate.

**After:**
- `eligibilityStatus` removed from `admitSchema` in the route (caller cannot supply it)
- `eligibilityStatus` removed from `AdmitCandidateInput` interface
- Guard 2 fetches the candidate from DB and reads `eligibilityStatus` from the stored record
- Guard 3b checks `ELIGIBILITY_ALLOWS_PROMOTION[dbEligibilityStatus]` using the DB-authoritative value
- The `controlledLearningAdmission.create()` call writes `dbEligibilityStatus` (from DB), never caller input

---

### HIGH-6: Admission never checked for unmitigated CRITICAL harm events

**Before:** No query on `ControlledLearningHarmEvent` before admitting.

**After:** Guard 5 queries `controlledLearningHarmEvent.findFirst({ where: { candidateId, workspaceId, severity: "CRITICAL", mitigated: false } })`. If found, admission is blocked with violation message `"Candidate has an unmitigated CRITICAL harm event — admission blocked until harm is mitigated"`.

---

## Guard Order (final)

| Guard | Description | Blocks |
|-------|-------------|--------|
| 1 | Forbidden evidence origins (pre-DB) | ai_generated, synthetic_benchmark, search_snippet_only, public_source_unverified |
| 2 | Candidate fetch from DB (workspaceId scoped) | candidate not found / wrong workspace |
| 3 | Cross-workspace double-check on DB record | workspaceId mismatch |
| 3b | `ELIGIBILITY_ALLOWS_PROMOTION[dbEligibilityStatus]` | ineligible DB status |
| 4 | APPROVED review must exist (BLOCKER-2) | no approved review |
| 5 | No CRITICAL unmitigated harm event (HIGH-6) | unmitigated critical harm |
| 6 | Duplicate admission guard | already admitted |

---

## Files Changed

### `src/services/controlled-learning-admission.service.ts`
- Added `ADMISSION_FORBIDDEN_ORIGINS` Set extending domain set with `"public_source_unverified"`
- Removed `eligibilityStatus` from `AdmitCandidateInput` interface
- Added Guard 4: `controlledLearningReview.findFirst` with `decision: "APPROVED"`
- Added Guard 5: `controlledLearningHarmEvent.findFirst` with `severity: "CRITICAL", mitigated: false`
- Changed `create()` call to use `dbEligibilityStatus` from DB record, not caller input

### `src/app/api/owner/learning-admissions/route.ts`
- Removed `eligibilityStatus` from `admitSchema` Zod object
- Removed `eligibilityStatus: body.eligibilityStatus` from `admitCandidate()` call
- Added comment: `// eligibilityStatus intentionally excluded — service reads it from DB, caller cannot supply it`

### `src/__tests__/api/owner/learning-admissions.test.ts`
- Fully rewritten: 29 tests across 8 describe blocks
- Uses `vi.importActual` to get real `admitCandidate` for service unit tests (route tests use mocked version)
- Covers: review gate, DB-only eligibility, forbidden origins (4), cross-workspace isolation, CRITICAL harm event guard, duplicate guard, security invariants

---

## Tests Added

| Describe | Tests | Coverage |
|----------|-------|----------|
| Route service contract | 4 | eligibilityStatus not in payload, success/failure shapes |
| GET list contract | 3 | workspaceId scoping, empty/non-empty results |
| Review gate (BLOCKER-2) | 5 | no review→blocked, REJECTED→blocked, DEFERRED→blocked, APPROVED→allowed, query shape |
| Eligibility from DB only (BLOCKER-3) | 4 | 3 ineligible statuses blocked, DB value written to create |
| Forbidden origins | 4 | ai_generated, synthetic_benchmark, search_snippet_only, public_source_unverified — all block before DB |
| Cross-workspace | 3 | DB mismatch blocked, DB null→not found, blank workspaceId throws |
| CRITICAL harm event guard (HIGH-6) | 3 | harm→blocked, no harm→allowed, query shape |
| Duplicate guard | 1 | already admitted→blocked |
| Security invariants | 2 | AdmitCandidateInput has no eligibilityStatus, listAdmissionsForWorkspace receives workspaceId |

**Total: 29/29 PASS**

---

## Gates Run

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS — no errors |
| `npx prisma validate` | PASS — schema valid |
| `npx vitest run learning-admissions.test.ts` | PASS — 29/29 |

---

## DB Schema Changes

None. All guards use existing models:
- `ControlledLearningReview` — `decision` field already exists with values "APPROVED" / "REJECTED" / "DEFERRED"
- `ControlledLearningHarmEvent` — `severity` and `mitigated` fields already exist
- `ControlledLearningCandidate` — `eligibilityStatus` field already exists
- `ControlledLearningAdmission` — `eligibilityStatus` field already exists (now populated from DB, not caller)

---

## Remaining Blockers

| Blocker | Status |
|---------|--------|
| BLOCKER-1: `hasBlockingContradiction` dead branch | **FIXED** (commit 67a1867d) |
| BLOCKER-2: No APPROVED review gate | **FIXED** (this commit) |
| BLOCKER-3: `eligibilityStatus` from caller body | **FIXED** (this commit) |
| HIGH-6: No CRITICAL harm event check | **FIXED** (this commit) |
| HIGH-1: Audit trail missing from 11 controlled learning services | OPEN |
| HIGH-3: `outcomeWindowElapsed` is caller-controlled boolean | DEFERRED |
| HIGH-4: No harm-to-rollout circuit breaker | DEFERRED |
| HIGH-5: Rollout does not require regression result | DEFERRED |

---

## Classification

`BLOCKER_2_3_FIXED_CODE_VERIFIED`

Not `COMPLETE_READY`. HIGH-1 (audit trail) remains open. LANE_B re-run required (admission service now has 3 new DB queries: review, harm event, candidate eligibility from DB).
