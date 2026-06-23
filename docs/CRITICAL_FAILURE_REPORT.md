# Critical Failure Report — OpsIQ Owner Mode Controlled Learning

**Generated:** 2026-06-19  
**Scope:** Phase 29–35 controlled learning system (candidates, reviews, admissions, rejections, privacy, regression, rollout, rollback, harm, consent, retention, attribution)

---

## Finding 1 — DB Connection Failure (Runtime Blocker)

**Severity: CRITICAL**

The `DATABASE_URL` environment variable contains `channel_binding=require` which Prisma's native PostgreSQL driver does not accept. The error `P1013: The provided database string is invalid` is thrown at connection time, meaning **every API route in the controlled learning system will fail at runtime** — not just on schema operations.

**File:** `.env.local` (injected)  
**Fix required:** Remove `channel_binding=require` from the DATABASE_URL or configure `@prisma/adapter-neon` to use the Neon HTTP driver.

---

## Finding 2 — Admission Service Does Not Check Existing Review Approval Status (Learning Bypass Path)

**Severity: HIGH**

`admitCandidate()` in `/home/user/OPsIq/src/services/controlled-learning-admission.service.ts` checks:
- Workspace scope (line 26 — PASS)
- Forbidden evidence origin (lines 40–46 — PASS)
- Candidate exists in workspace (lines 49–55 — PASS)
- Eligibility status prefix `LEARNING_ELIGIBLE_*` (lines 58–63 — PASS)
- Duplicate admission guard (lines 65–70 — PASS)

**Missing:** The service does NOT verify that a `ControlledLearningReview` record exists with an `APPROVED` status before admitting the candidate. A caller with `OWNER_MANAGE` capability could admit a candidate directly via `POST /api/owner/learning-admissions` without any review having been completed or approved. The eligibility status check (`LEARNING_ELIGIBLE_*`) can be satisfied from candidate intake alone — it does not require a review record.

**File:** `/home/user/OPsIq/src/services/controlled-learning-admission.service.ts` (lines 22–84)  
**Route:** `/home/user/OPsIq/src/app/api/owner/learning-admissions/route.ts`

---

## Finding 3 — Audit Trail Missing from 11 of 12 Controlled Learning Services

**Severity: HIGH**

Only `controlled-learning-candidate.service.ts` writes audit entries (via `controlledLearningCandidateAuditEntry`). All other controlled learning services — admission, rejection, review, rollback, rollout, harm, retention, consent, privacy, attribution, regression — perform state mutations with **no audit trail**.

Affected services:

| Service | File |
|---------|------|
| Admission | `/home/user/OPsIq/src/services/controlled-learning-admission.service.ts` |
| Rejection | `/home/user/OPsIq/src/services/controlled-learning-rejection.service.ts` |
| Review | `/home/user/OPsIq/src/services/controlled-learning-review.service.ts` |
| Rollback | `/home/user/OPsIq/src/services/controlled-learning-rollback.service.ts` |
| Rollout | `/home/user/OPsIq/src/services/controlled-learning-rollout.service.ts` |
| Harm | `/home/user/OPsIq/src/services/controlled-learning-harm.service.ts` |
| Retention | `/home/user/OPsIq/src/services/controlled-learning-retention.service.ts` |
| Consent | `/home/user/OPsIq/src/services/controlled-learning-consent.service.ts` |
| Privacy | `/home/user/OPsIq/src/services/controlled-learning-privacy.service.ts` |
| Attribution | `/home/user/OPsIq/src/services/controlled-learning-attribution.service.ts` |
| Regression | `/home/user/OPsIq/src/services/controlled-learning-regression.service.ts` |

Per CLAUDE.md hard rules: *"All meaningful mutations must emit audit events."* Admissions, rejections, rollbacks, harm events, and consent changes are all governed records. This is a systematic violation across the phase 29–35 implementation.

---

## Finding 4 — Rollback Service Validates Code After Calling `assertWorkspaceScopedQuery` (Logic Order Issue)

**Severity: MEDIUM**

In `/home/user/OPsIq/src/services/controlled-learning-rollback.service.ts`, `assertWorkspaceScopedQuery` is called at line 31 before `workspaceId` emptiness is validated (line 37: `if (!input.workspaceId) violations.push(...)`). If `workspaceId` is an empty string, `assertWorkspaceScopedQuery` may throw or pass through depending on its implementation, while the violation accumulator path (which would return a clean error) is never reached — the exception propagates unhandled instead of returning `{ recorded: false, violations: [...] }`.

**File:** `/home/user/OPsIq/src/services/controlled-learning-rollback.service.ts` (lines 31–37)

---

## Finding 5 — `[reviewId]/route.ts` Uses `withCanonicalEnforcement` Import Count of 2 (Not 3)

**Severity: MEDIUM**

All other learning route files show 3 occurrences of `withCanonicalEnforcement` (import + GET handler + POST handler, or equivalent). `/home/user/OPsIq/src/app/api/owner/learning-reviews/[reviewId]/route.ts` shows only 2. This suggests the route has one handler that is either missing the enforcement wrapper or is only a GET (read-only). This needs inspection to confirm whether a write path is exposed without enforcement.

**File:** `/home/user/OPsIq/src/app/api/owner/learning-reviews/[reviewId]/route.ts`

---

## Finding 6 — Cross-Tenant Risk: `admitCandidate` Accepts `eligibilityStatus` from User Input Without Enum Validation

**Severity: MEDIUM**

The `admitSchema` in `/home/user/OPsIq/src/app/api/owner/learning-admissions/route.ts` (line 21) accepts `eligibilityStatus: z.string().min(1)` — a free-form string. The service checks `eligibilityStatus.startsWith("LEARNING_ELIGIBLE_")` but does not validate against a closed enum. An attacker with `OWNER_MANAGE` capability could pass `eligibilityStatus: "LEARNING_ELIGIBLE_SYNTHETIC"` (or any crafted prefix) to force admission of a candidate whose actual stored `eligibilityStatus` does not match — the check is against the user-supplied string, not the candidate's stored status.

**File:** `/home/user/OPsIq/src/app/api/owner/learning-admissions/route.ts` (line 21)  
**Service:** `/home/user/OPsIq/src/services/controlled-learning-admission.service.ts` (lines 58–63)  
**Fix:** The service should read `eligibilityStatus` from the candidate DB record and validate it there, not accept it as caller input.

---

## Finding 7 — Dead Routes / Orphan Services

**Severity: NOT_A_BUG**

All 12 controlled learning services are imported by their corresponding route files:

- `controlled-learning-candidate.service.ts` → `learning-candidates/route.ts`, `[candidateId]/promote/route.ts`, `[candidateId]/reject/route.ts`
- `controlled-learning-admission.service.ts` → `learning-admissions/route.ts`
- `controlled-learning-rejection.service.ts` → `learning-rejections/route.ts`
- `controlled-learning-review.service.ts` → `learning-reviews/route.ts`, `learning-reviews/[reviewId]/route.ts`
- `controlled-learning-rollback.service.ts` → `learning-rollback-events/route.ts`
- `controlled-learning-rollout.service.ts` → `learning-rollout-flags/route.ts`
- `controlled-learning-harm.service.ts` → `learning-harm-events/route.ts`
- `controlled-learning-retention.service.ts` → `learning-retention/route.ts`
- `controlled-learning-consent.service.ts` → `learning-consent/route.ts`
- `controlled-learning-privacy.service.ts` → `learning-privacy/route.ts`
- `controlled-learning-attribution.service.ts` → `learning-attribution-reviews/route.ts`
- `controlled-learning-regression.service.ts` → `learning-regression-results/route.ts`

No dead routes or orphan services detected.

---

## Finding 8 — Auth Guards Present on All Learning Routes

**Severity: NOT_A_BUG**

All 12 top-level learning route files use `withCanonicalEnforcement` with `requireCapabilities` and `requireWorkspace: true`. The promote and reject subroutes (`[candidateId]/promote/route.ts`, `[candidateId]/reject/route.ts`) also use `withCanonicalEnforcement` with `OWNER_MANAGE` capability enforcement. No unguarded write paths were found.

---

## Finding 9 — Workspace Enforcement Present in All Services

**Severity: NOT_A_BUG**

All 12 controlled learning services call `assertWorkspaceScopedQuery({ workspaceId })` at function entry. Cross-tenant DB queries are structurally prevented at the service layer. Routes pass `ctx.verifiedWorkspaceId` (not user-supplied workspace) to services.

---

## Finding 10 — Zod Validation Present on All Write Routes

**Severity: NOT_A_BUG**

All write routes use `zod` schemas and `parseRequestBody()` for input validation. No unvalidated write paths were detected in the controlled learning route set.

---

## Summary Table

| # | Finding | Severity | File(s) |
|---|---------|----------|---------|
| 1 | DB connection failure (P1013 — channel_binding) | CRITICAL | `.env.local` |
| 2 | Admission bypasses review approval status check | HIGH | `controlled-learning-admission.service.ts` |
| 3 | Audit trail missing from 11/12 services | HIGH | All controlled-learning-*.service.ts except candidate |
| 4 | Rollback: empty workspaceId throws before clean error path | MEDIUM | `controlled-learning-rollback.service.ts:31-37` |
| 5 | `[reviewId]/route.ts` may have unguarded handler | MEDIUM | `learning-reviews/[reviewId]/route.ts` |
| 6 | `eligibilityStatus` accepted from user input, not read from DB | MEDIUM | `learning-admissions/route.ts:21`, `controlled-learning-admission.service.ts:58-63` |
| 7 | Dead routes / orphan services | NOT_A_BUG | — |
| 8 | Missing auth guards | NOT_A_BUG | — |
| 9 | Missing workspace enforcement | NOT_A_BUG | — |
| 10 | Missing input validation | NOT_A_BUG | — |
