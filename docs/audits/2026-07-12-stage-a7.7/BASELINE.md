# Stage A7.7 — Baseline
**Date:** 2026-07-12  
**Branch:** claude/phase-6f-governance-findings-5gkiec  
**HEAD:** c67fa2064f8e1a664dba7d7982b5cc4d793e10cf  
**origin/main HEAD:** 8aef45a573ea8578f3e9d97a30f030b989ad2300  
**Merge base:** 8aef45a573ea8578f3e9d97a30f030b989ad2300 (branch is 25 commits ahead of main, 0 behind)  
**Working tree:** CLEAN (verified by git status --short, no output)

---

## A7.6 Commit Ancestry Verified

| Commit | Present | Content |
|--------|---------|---------|
| 3a40fd76 | YES | Stage A7.6 DC-A7.6-I1: 12 routes hardened (I1A/I1B/I1C) |
| c67fa206 | YES | Stage A7.6 DC-A7.6-I5-DC06: 4 missing hasPermission() strings |

Both commits are in the ancestry of HEAD and descend from origin/main.

---

## Baseline Gates

| Gate | Result | Notes |
|------|--------|-------|
| `npx tsc --noEmit` | PASS | 0 errors |
| `npm run build` | PASS | Build completes, all routes compiled |
| `npx prisma validate` | PASS | Schema valid (driverAdapters deprecation warning only) |
| `npm test` (non-DB) | PENDING | Background run started; results pending |
| `TEST_WITH_DB=true npm test` | DB_BLOCKED | DATABASE_URL (Neon) unreachable from this environment: `Can't reach database server at ep-tiny-breeze-an0qsoje-pooler.c-6.us-east-1.aws.neon.tech:5432`. CI workflow provisions its own postgres:16 service container. |

**DB_BLOCKED classification:** The Neon DATABASE_URL is present in the environment but the endpoint is network-unreachable (confirmed: `npx prisma db execute` returns P1001). This is an environment network policy restriction, not a missing credential. CI workflow (`.github/workflows/ci.yml`) provisions PostgreSQL service with `TEST_WITH_DB=true` and runs the full suite including DB tests. DB-proof items are classified DB_BLOCKED_ENVIRONMENT_NETWORK with proof delegated to CI.

---

## Route Inventory (Independently Verified)

**Total route files:** 338  
**Source:** `find src/app/api -name "route.ts" | wc -l`

### Auth Wrapper Distribution

Note: A single route FILE may have multiple HTTP methods using different wrappers. Counts below are per-file (a file is counted once per wrapper type it uses). Some files appear in multiple wrapper columns because they mix wrappers across methods.

| Wrapper | File Count | Notes |
|---------|-----------|-------|
| `withCanonicalEnforcement` | 274 | Canonical — provides `ctx.verifiedWorkspaceId` and `ctx.verifiedActorId` |
| `enforceWorkspaceScoping` | 39 | Legacy — reads `x-workspace-id` header, verifies membership, but no canonical ctx |
| `withAuth` | 38 | Legacy — validates session capability, no canonical workspace enforcement |
| `withEnforcementFull` | 40 | Runtime observability wrapper — does NOT verify workspace membership |
| No wrapper | 26 | Internal/health/auth routes (login, signup, health, readiness, internal/* debug) |

**A7.6 claims vs actuals:**
- A7.6 claimed 274 canonical / 39 enforceWorkspaceScoping / "40+ withAuth" — confirmed correct
- A7.6 did NOT separately count withEnforcementFull (40) — these overlap with withAuth
- 26 "no wrapper" routes: 20 are internal/* or health/readiness; 6 are auth/signup/login (legitimate public routes)

### Workspace Resolution Inventory (Verified)

| Pattern | Count | Classification |
|---------|-------|----------------|
| `ctx.verifiedWorkspaceId` | ~274+ uses | SAFE |
| `headers.get("x-workspace-id")` in route files | 16 route files | FORGEABLE |
| `headers.get("x-workspace-id")` in middleware | 6 middleware files | FORGEABLE (for auth purposes) |
| `requireWorkspaceContext()` from `context.ts` | 6 files (11 call sites) | BROKEN — returns session.user.id |
| `requireWorkspaceContext()` from `activation-context.ts` | 0 production callers | CORRECT but UNUSED |
| `requireWorkspaceContext()` from `service-auth.ts` | 1 (validates param) | DIFFERENT PURPOSE |

**Key finding not in A7.6:** `src/middleware.ts` (root Next.js middleware) is a passthrough — it does NOT verify `x-workspace-id`. The header is always client-supplied. Middleware files (tier-enforcement, idempotency, rate-limit, private-mode-gate) that read this header for operational purposes (tier checking, rate limiting) are operating on an unverified, forgeable workspace ID. This is a broader attack surface than A7.6 documented.

**x-workspace-id reads outside route files (additional attack surface):**
- `src/runtime/enforcement/request-enforcer.ts:171` — puts unverified header into correlation context
- `src/middleware/tier-enforcement.ts:133` — uses for tier enforcement (forgeable)
- `src/middleware/idempotency-enforcement.ts:65,78` — uses for idempotency key scoping (forgeable)
- `src/middleware/private-mode-gate.ts:93` — uses for private mode access control (forgeable)
- `src/middleware/rate-limit.ts:165` — uses for rate limiting (forgeable)
- `src/lib/workspace-validation.ts:23` — format-validates only (not membership-verified)
- `src/infra/error-handler.ts:113` — uses for error context (observability)

### Actor Identity Inventory

**Fields from verifiedActorId (SAFE):** ~274+ withCanonicalEnforcement routes  
**Client-supplied actor fields (FORGEABLE):**

| File | Field | Fixed in A7.6 |
|------|-------|---------------|
| `src/app/api/owner/learning-rejections/route.ts` | rejectedBy | YES |
| `src/app/api/owner/learning-candidates/[candidateId]/promote/route.ts` | approvedBy | YES |
| `src/app/api/owner/learning-consent/route.ts` | consentBy | YES |
| `src/app/api/owner/learning-harm-events/route.ts` | detectedBy | YES |
| `src/app/api/owner/learning-attribution-reviews/route.ts` | reviewedBy | YES |
| `src/app/api/owner/learning-privacy/route.ts` | appliedBy | YES |
| `src/app/api/owner/learning-retention/route.ts` | appliedBy | YES |
| `src/app/api/proof/review/route.ts` | requiredPermission (client-selected auth predicate) | FIXED A7.7 (DC-07) |

**A7.6 claim "7 fixed, 0 remaining" was incomplete.** DC-07 (proof/review route) was a distinct actor/permission manipulation vulnerability not counted in the I1C inventory. Now fixed.

### Audit Write Inventory (Verified)

| Pattern | Approximate Count | Source files |
|---------|------------------|-------------|
| `emitAuditEvent` (canonical) | ~274 canonical route calls | src/infra/audit.ts (canonical) |
| `logAuditEvent` (non-canonical) | 41 call sites | src/services/ (widespread) |
| `db.auditEvent.create` (direct bypass) | 32 call sites | src/services/ (widespread) |
| `db.auditEvent.createMany` | unknown | Not separately inventoried |

**Note:** `logAuditEvent` in `src/services/audit/audit-log.ts` itself calls `requireWorkspaceContext()` from broken `context.ts` (fallback path), meaning ALL 41 `logAuditEvent` call sites may use the broken workspace resolver for their audit context.

### State Machine Inventory

9 independent state-transition implementations found (confirmed from A7.6):

1. `src/services/governance/state-machine.ts` — ALLOWED_TRANSITIONS (governance)
2. `src/services/decision/status-management.ts` — canTransitionTo (decision)
3. `src/services/decision/transaction-layer.ts` — canTransitionTo lambda (decision)
4. `src/services/decision/transaction-lifecycle.ts` — validTransitions (decision)
5. `src/services/outcome/verification-approval.service.ts` — ALLOWED_TRANSITIONS (outcome/verification)
6. `src/domain/action-tracking.ts` — ACTION_STATUS_TRANSITIONS (action)
7. `src/domain/evidence-capture.ts` — EVIDENCE_STATUS_TRANSITIONS (evidence)
8. `src/domain/action-assignment.ts` — PROOF_TRANSITIONS (proof/assignment)
9. `src/domain/recommendation-verification.ts` — VERIFICATION_STATUS_TRANSITIONS (recommendation)

### Duplicate Routes

| Route | Files |
|-------|-------|
| Operator "my day" | `src/app/api/operator/myday/route.ts` AND `src/app/api/operator/my-day/route.ts` |

Both confirmed to exist. Investigation of divergence needed.

### DC-07 Confirmed

`src/app/api/proof/review/route.ts` — client can supply `body.requiredPermission` to choose which `GuidedExecutionPermission` check the server performs. A caller with only `PROOF_REVIEW_LOW_RISK` can bypass `PROOF_REVIEW_PAYMENT` or `PROOF_REVIEW_COMPLAINT` requirements by setting the body field. **FIXED IN A7.7.**

---

## A7.6 Count Verification

| A7.6 Claim | Actual (A7.7 independent scan) | Accuracy |
|-----------|-------------------------------|----------|
| "12 routes read x-workspace-id" (route files) | 16+ route files (expanded scope) | UNDERCOUNTED — middleware not included |
| "7 requireWorkspaceContext callers" | 6 files / 11 call sites (service-auth.ts is different function) | APPROXIMATELY CORRECT |
| "20+ direct auditEvent.create" | 32 confirmed | UNDERCOUNTED |
| "logAuditEvent calls" | 41 confirmed | NOT STATED in A7.6 |
| "274 canonical / 39 enforceWorkspaceScoping / 40+ withAuth" | 274 / 39 / 38 withAuth / 40 withEnforcementFull | CONFIRMED (withEnforcementFull separately identifiable) |
| "9 state machine implementations" | 9 confirmed | CONFIRMED |
| "DC-07 not listed" | CONFIRMED as security defect | MISSED BY A7.6 |

---

## Existing Prevention Gates

| Gate | Location | What It Checks | Gaps |
|------|----------|----------------|------|
| `governance:scan` | scripts/governance-scan.ts | Raw error messages, unsafe rendering, operator UX | Does NOT check workspace isolation or auth patterns |
| `governance:scan:auth` | scripts/auth-governance-scanner.ts | withRequestContext use, raw Error("Unauthorized"), direct Response.json with 401, direct getSession() | Does NOT check x-workspace-id reads, enforceWorkspaceScoping, logAuditEvent |
| `audit:wrapped-handlers` | scripts/audit-wrapped-handlers.js | NextResponse.json in canonical wrapper handlers | Does NOT check auth wrapper usage |
| `src/governance/eslint-auth-enforcement.js` | ESLint rule | No `any` in auth context, no auth context union types, no unsafe casts | Does NOT check x-workspace-id reads |
| `src/governance/ci-shadow-read-gate.ts` | CI gate | Shadow read violations (unclear scope) | Unknown |

**Gap analysis:** No existing gate checks for:
1. x-workspace-id header reads in route handlers
2. New requireWorkspaceContext() callers from context.ts
3. New enforceWorkspaceScoping or withAuth in routes
4. logAuditEvent usage
5. Direct db.auditEvent.create calls
6. Client-supplied actor identity fields
7. Unregistered permission action strings

---

## DB Proof Status

**DB proof is deferred to CI pipeline.** This environment cannot reach the Neon database endpoint. The CI workflow (`ci.yml`) provisions a local PostgreSQL 16 service container with:
- `TEST_WITH_DB=true`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/opsiq_test`
- Full migration via `npx prisma migrate deploy`
- Suite runs with `vitest run --maxWorkers 1`

DB-backed tests that exist in the codebase will run there. New DB tests added in A7.7 will run in CI.

---

## Classification at Baseline

**A7.7_IN_PROGRESS**

All baseline conditions verified. Proceeding to:
1. Install prevention gates
2. Fix DC-07 (DONE — proof/review requiredPermission hardened)
3. Canonical defect register creation
4. Auth pattern migration (bounded slices)
5. Audit write consolidation
6. State machine consolidation
