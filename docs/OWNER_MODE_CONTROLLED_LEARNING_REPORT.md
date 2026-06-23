# Owner Mode — Controlled Learning Protection Report

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7
**Commit:** 116f1bd8
**Method:** Direct code verification — no trust in prior reports

---

## 1. Evidence Origin Protections

### Forbidden Set (domain/controlled-learning.ts:47)
```
EVIDENCE_ORIGIN_FORBIDDEN = { "ai_generated", "synthetic_benchmark", "search_snippet_only" }
```

### Service-level extension (admission.service.ts:11)
```
ADMISSION_FORBIDDEN_ORIGINS = EVIDENCE_ORIGIN_FORBIDDEN ∪ { "public_source_unverified" }
```

### Guard 1 (line 61)
Fires BEFORE any DB access. Blocked origins: `ai_generated`, `synthetic_benchmark`, `search_snippet_only`, `public_source_unverified`.

**Allowed origins:** `owner_manual_entry`, `owner_csv`, `owner_pdf`, `owner_file_upload`, `system_computed`

**Verified:** Any submission with a forbidden origin is rejected immediately. No DB query executes.

---

## 2. Eligibility Status Protections

### 12 Eligibility Classes
Only 2 allow admission:
- `LEARNING_ELIGIBLE_VERIFIED_OUTCOME` → true
- `LEARNING_ELIGIBLE_HUMAN_REVIEWED` → true

10 are ineligible (all return false in ELIGIBILITY_ALLOWS_PROMOTION):
- `LEARNING_INELIGIBLE_UNVERIFIED`
- `LEARNING_INELIGIBLE_SYNTHETIC`
- `LEARNING_INELIGIBLE_AI_GENERATED`
- `LEARNING_INELIGIBLE_CROSS_TENANT`
- `LEARNING_INELIGIBLE_NO_OWNER_DECISION`
- `LEARNING_INELIGIBLE_NO_ACTION_TAKEN`
- `LEARNING_INELIGIBLE_NO_OUTCOME_WINDOW`
- `LEARNING_INELIGIBLE_CONFLICTING_EVIDENCE`
- `LEARNING_INELIGIBLE_SAFETY_RELATED`
- `LEARNING_INELIGIBLE_PUBLIC_SOURCE_UNVERIFIED`

### Terminal Classes (cannot be overturned)
`LEARNING_INELIGIBLE_SYNTHETIC`, `LEARNING_INELIGIBLE_AI_GENERATED`, `LEARNING_INELIGIBLE_CROSS_TENANT`, `LEARNING_INELIGIBLE_SAFETY_RELATED` — `ELIGIBILITY_IS_TERMINAL` = true

### Guard 3 Enforcement
- `dbEligibilityStatus` read from DB candidate record (line 135)
- `ELIGIBILITY_ALLOWS_PROMOTION[dbEligibilityStatus] ?? false` — unknown status defaults to false
- Caller cannot inject a different status (field not in Zod schema or service interface)

**Verified: DB status is always authoritative. Caller cannot override.**

---

## 3. Outcome Window Protections (HIGH-3)

### Field: `outcomeRecordedAt DateTime?` (schema.prisma:3974)
Set at candidate creation time. Null = window cannot be verified.

### Guard 2b (admission.service.ts:91-132)
1. If `outcomeRecordedAt === null` → block with `ADMISSION_BLOCKED_NO_OUTCOME_TIMESTAMP`
2. If `(admittedAt - outcomeRecordedAt) / ms_per_day < 30` → block with `ADMISSION_BLOCKED_OUTCOME_WINDOW_NOT_ELAPSED`

**Window constant:** `OUTCOME_WINDOW_MIN_DAYS = 30` (line 18)

**Verified: Caller cannot bypass the 30-day window. No `outcomeWindowElapsed` boolean accepted from caller.**

---

## 4. Cross-Tenant Protections

### At every service entry point
`assertWorkspaceScopedQuery({ workspaceId })` — throws if empty (security-rules.ts:13)

### At every DB query
All `findFirst` and `findMany` calls include `workspaceId` in the where clause.

### Double-check on candidate record
Guard 2 (line 86): `if (candidate.workspaceId !== workspaceId)` — even if findFirst returned an unexpected record, this redundant check fires.

### Attribution harm cross-tenant
`recordAttributionReview` checks both:
- `findFirst({ where: { id: candidateId, workspaceId } })` — candidate in workspace
- `findFirst({ where: { id: harmEventId, workspaceId } })` — harm event in workspace

**Verified: No cross-tenant data can be referenced in any write path.**

---

## 5. Review Gate Protections (BLOCKER-2/3)

### Guard 4 (admission.service.ts:161)
`findFirst({ where: { candidateId, workspaceId, decision: "APPROVED" } })`
- REJECTED review: does not satisfy `decision: "APPROVED"`
- DEFERRED review: does not satisfy `decision: "APPROVED"`
- No review at all: returns null
- APPROVED review: admits

**Verified: No admission without an APPROVED review.**

---

## 6. CRITICAL Harm Protections

### Admission (Guard 5, admission.service.ts:189)
`findFirst({ where: { candidateId, workspaceId, severity: "CRITICAL", mitigated: false } })`
Blocks admission. Emits `ADMISSION_BLOCKED_CRITICAL_HARM`.

### Rollout (HIGH-4, rollout.service.ts:81)
`findFirst({ where: { candidateId, workspaceId, severity: "CRITICAL", mitigated: false } })`
Blocks rollout. Emits `ROLLOUT_BLOCKED_CRITICAL_HARM`.

### Harm cannot be created as mitigated
`recordHarmEvent` always creates with the schema default `mitigated: false`. No route or service accepts `mitigated` in the creation body.

### Harm suppression not possible
No delete route. No update route that removes a harm event. Only `markHarmMitigated` can change a harm event, and it only sets `mitigated=true` with a timestamp.

**Verified: CRITICAL harm blocks both admission and rollout. Harm cannot be suppressed on creation.**

---

## 7. Regression Gate Protections (HIGH-5)

### Rollout guard (rollout.service.ts:55)
`findFirst({ where: { candidateId, workspaceId, testVerdict: "PASS" } })`
- No regression result: null → `ROLLOUT_BLOCKED_NO_PASSING_REGRESSION`
- FAIL result only: null (findFirst for PASS) → blocked
- INCONCLUSIVE result only: null → blocked
- At least one PASS result: proceeds

**Verified: Rollout requires at least one PASS regression result.**

---

## 8. Audit Trail Coverage

Every material write in every service emits an audit entry via `controlledLearningCandidateAuditEntry.create()`.

| Action | Audit Entry |
|--------|-------------|
| Candidate created | CANDIDATE_CREATED |
| Admission blocked (no outcome timestamp) | ADMISSION_BLOCKED_NO_OUTCOME_TIMESTAMP |
| Admission blocked (window not elapsed) | ADMISSION_BLOCKED_OUTCOME_WINDOW_NOT_ELAPSED |
| Admission blocked (ineligible) | ADMISSION_BLOCKED_INELIGIBLE |
| Admission blocked (no review) | ADMISSION_BLOCKED_NO_APPROVED_REVIEW |
| Admission blocked (critical harm) | ADMISSION_BLOCKED_CRITICAL_HARM |
| Admission created | ADMISSION_CREATED |
| Rollout blocked (no regression) | ROLLOUT_BLOCKED_NO_PASSING_REGRESSION |
| Rollout blocked (critical harm) | ROLLOUT_BLOCKED_CRITICAL_HARM |
| Rollout flag set | ROLLOUT_FLAG_SET_{STAGE} |
| Rollback recorded | ROLLBACK_{rollbackCode} |
| Harm event recorded | HARM_EVENT_RECORDED_{SEVERITY} |
| Harm event mitigated | HARM_EVENT_MITIGATED |
| Attribution review recorded | ATTRIBUTION_REVIEW_{VERDICT} |
| Review created | REVIEW_CREATED |
| Rejection created | REJECTION_CREATED |

**Audit entries are best-effort (try/catch): failure to write audit does not block the mutation, but is logged to console.error. This is an acceptable production trade-off for availability but means audit trail is not transactional.**

---

## 9. Input Validation Coverage

| Service | Required Fields Checked | Enum Validated | Range Validated |
|---------|------------------------|----------------|-----------------|
| admission | admittedBy non-empty (Guard 0) | evidenceOrigin, eligibilityStatus (via domain) | outcomeRecordedAt window |
| rollout | workspaceId, candidateId, enabledBy | rolloutStage | rolloutPct 0–100 |
| rollback | workspaceId, candidateId, rolledBackBy, rollbackReason | rollbackCode | — |
| harm | workspaceId, candidateId, detectedBy | harmType, severity | — |
| attribution | workspaceId, candidateId | verdict | confidenceScore 0.0–1.0 |
| regression | workspaceId, candidateId | testVerdict | regressionScore 0.0–1.0 |
| review | workspaceId, candidateId | decision | — |
| rejection | workspaceId, candidateId | rejectionCode | — |
| consent | workspaceId, candidateId | consentScope | — |
| privacy | workspaceId, candidateId | controlType | — |
| retention | workspaceId | — | retentionDays 1–3650 |
| candidate | workspaceId, businessId | eligibilityStatus, evidenceSourceType | — |

---

## 10. Verified Protection Summary

| Protection | Verified | Notes |
|---|---|---|
| AI-generated evidence blocked | ✅ | Guard 1 — before any DB access |
| Synthetic benchmark evidence blocked | ✅ | Guard 1 |
| Public unverified evidence blocked | ✅ | Guard 1 (extended ADMISSION_FORBIDDEN_ORIGINS) |
| Caller cannot set eligibilityStatus | ✅ | Not in schema/interface; DB authoritative |
| 30-day outcome window enforced server-side | ✅ | Guard 2b |
| Review gate enforced | ✅ | Guard 4 — APPROVED only |
| CRITICAL harm blocks admission | ✅ | Guard 5 |
| CRITICAL harm blocks rollout | ✅ | HIGH-4 guard |
| Regression PASS required for rollout | ✅ | HIGH-5 guard |
| Cross-tenant blocked everywhere | ✅ | assertWorkspaceScopedQuery + workspaceId in all queries |
| Harm cannot be created as mitigated | ✅ | Hard-coded false on creation |
| Harm cannot be deleted | ✅ | No delete route/service |
| Duplicate admission blocked | ✅ | Guard 6 + DB unique constraint |
| Audit trail on all material mutations | ✅ | Best-effort (not transactional) |
| promotionLocked enforcement | ❌ | Field stored but not checked in admitCandidate |
