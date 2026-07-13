# Stage A7.6 — Systemic Root-Cause Elimination & Architectural Invariant Closure
**Date:** 2026-07-12  
**Branch:** `claude/phase-6f-governance-findings-5gkiec`  
**Baseline:** `origin/main` (commit before A7.5 merge)  
**Scope:** Invariants I1–I20 (I1–I10 from A7.5, I11–I20 new)

---

## Executive Summary

This audit investigated 20 architectural invariants across the OpsIQ repository. Every defect found was treated as evidence of a repository-wide defect class, not an isolated bug. Four defect classes were identified. One (DC-A7.6-I1: Workspace Isolation) was closed for all routes already using `withCanonicalEnforcement`. Three (DC-A7.6-I12, DC-A7.6-I13, DC-A7.6-I16/I20) are formally deferred with documented prevention requirements.

**12 routes fixed. 0 non-DB gate failures. 0 weakened auth or DTO boundaries.**

---

## Defect Classes Found

### DC-A7.6-I1 — Workspace Isolation Bypass (CRITICAL, PARTIALLY CLOSED)

Routes using `withCanonicalEnforcement` were obtaining the workspace ID through three unverified channels instead of the canonical `ctx.verifiedWorkspaceId`:

**I1A — x-workspace-id header reads (12 total, 3 FIXED, 9 DEFERRED)**  
Routes read workspaceId from an HTTP header (`ctx.request!.headers.get("x-workspace-id") || ""`) that any caller can forge. The `withCanonicalEnforcement` wrapper already validates and provides `ctx.verifiedWorkspaceId` — bypassing it is redundant and insecure.

Fixed routes (already used `withCanonicalEnforcement`):
- `src/app/api/engagements/[engagementId]/actions/route.ts`
- `src/app/api/engagements/[engagementId]/findings/route.ts`
- `src/app/api/engagements/[engagementId]/recommendations/route.ts`

Deferred (use `enforceWorkspaceScoping` / `withAuth` — need auth pattern migration first):
- `src/app/api/engagements/[engagementId]/experiments/route.ts` (6 methods)
- `src/app/api/engagements/[engagementId]/shock-events/route.ts`
- `src/app/api/engagements/[engagementId]/constraint-checks/route.ts`
- `src/app/api/engagements/[engagementId]/pricing-tiers/route.ts`
- `src/app/api/execute/route.ts`

**I1B — Broken requireWorkspaceContext() from context.ts (7 total, 2 FIXED, 5 DEFERRED)**  
`src/services/workspace/context.ts::getWorkspaceContext()` returns `session.user.id` as the workspaceId (an acknowledged temporary placeholder never removed). Routes calling this get the user ID, not a workspace ID.

Fixed routes (already used `withCanonicalEnforcement`):
- `src/app/api/governance/alerts/route.ts`
- `src/app/api/observability/summary/route.ts`

Deferred (use `withAuth`/`withEnforcementFull` — context.ts is entangled with their auth layer):
- `src/app/api/metrics/control-effectiveness/route.ts`
- `src/app/api/metrics/decision-latency/route.ts`
- `src/app/api/run/route.ts`
- `src/services/operator/store.ts` (4 call sites)
- `src/services/audit/audit-log.ts` (fallback path)

**I1C — Actor identity accepted from request body (7 total, 7 FIXED)**  
Routes exposed fields (`rejectedBy`, `approvedBy`, `consentBy`, `detectedBy`, `reviewedBy`, `appliedBy`) in their Zod schemas and passed them to services verbatim. A caller could supply any actor identity, defeating audit attribution.

All 7 fixed:
- `src/app/api/owner/learning-rejections/route.ts` — `rejectedBy` removed, use `ctx.verifiedActorId`
- `src/app/api/owner/learning-candidates/[candidateId]/promote/route.ts` — `approvedBy` removed
- `src/app/api/owner/learning-consent/route.ts` — `consentBy` removed
- `src/app/api/owner/learning-harm-events/route.ts` — `detectedBy` removed
- `src/app/api/owner/learning-attribution-reviews/route.ts` — `reviewedBy` removed
- `src/app/api/owner/learning-privacy/route.ts` — `appliedBy` removed
- `src/app/api/owner/learning-retention/route.ts` — `appliedBy` removed

---

### DC-A7.6-I12 — Duplicate Auth Patterns (DEFERRED)

Three competing authentication wrappers in production:
- `withCanonicalEnforcement` — 274 routes (canonical, provides `ctx.verifiedWorkspaceId`)
- `enforceWorkspaceScoping` — 39 routes (legacy, reads `x-workspace-id` header)
- `withAuth`/`withEnforcementFull` — 40+ routes (no canonical workspace ID)

Architectural weakness: No single auth contract means workspace isolation depends on which wrapper happens to be used. Prevention: enforce a lint rule or import boundary that rejects `enforceWorkspaceScoping` and `withAuth` in new routes.

---

### DC-A7.6-I13 — Duplicate State Machines (DEFERRED)

Nine independent state machine implementations across 9 files:
- `src/services/governance/state-machine.ts` — ALLOWED_TRANSITIONS
- `src/services/decision/status-management.ts` — canTransitionTo
- `src/services/decision/transaction-layer.ts` — canTransitionTo lambda
- `src/services/decision/transaction-lifecycle.ts` — validTransitions
- `src/services/outcome/verification-approval.service.ts` — ALLOWED_TRANSITIONS
- `src/domain/action-tracking.ts` — ACTION_STATUS_TRANSITIONS
- `src/domain/evidence-capture.ts` — EVIDENCE_STATUS_TRANSITIONS
- `src/domain/action-assignment.ts` — PROOF_TRANSITIONS
- `src/domain/recommendation-verification.ts` — VERIFICATION_STATUS_TRANSITIONS

Each encodes allowed transitions independently. A new valid transition added to one will be missing from others. Prevention: Single `src/domain/state-machine-registry.ts` with all entity transition maps.

---

### DC-A7.6-I16/I20 — Duplicate Audit Logic & Workspace Resolution (DEFERRED)

**I16A — Direct auditEvent.create bypasses (20+ instances)**  
Services write directly to `db.auditEvent.create` bypassing `emitAuditEvent`, which enforces hash-chain integrity via `computeEventHash`.

**I16B — Two competing audit writers**  
- `src/infra/audit.ts::emitAuditEvent` — canonical, hash-chained
- `src/services/audit/audit-log.ts::logAuditEvent` — fallback to broken context.ts workspace resolution, no hash chain

**I20 — Three requireWorkspaceContext implementations**  
- `src/services/workspace/context.ts` — BROKEN (userId as workspace), used by production routes
- `src/services/workspace/activation-context.ts` — CORRECT, unused by production
- `src/lib/service-auth.ts` — different purpose (validation, not resolution)

Root cause: `context.ts` was an explicitly acknowledged temporary placeholder (`// temporary: use user ID as workspace`) that was never removed. New routes were built against it instead of the correct implementation.

---

## Invariants I2–I11, I14–I15, I17–I19

These invariants were investigated during the broad evidence-gathering phase. No violations in routes that already use `withCanonicalEnforcement`. The deferred defect classes above (I12, I13, I16, I20) represent the outstanding gaps.

For individual invariant status, see INVARIANT_STATUS.md.

---

## Gates Run

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run build` | PASS |
| `npx prisma validate` | PASS (schema valid) |
| DB gates | DB_BLOCKED (no DATABASE_URL in environment) |

---

## Files Changed

**I1A — Header reads replaced:**
- `src/app/api/engagements/[engagementId]/actions/route.ts`
- `src/app/api/engagements/[engagementId]/findings/route.ts`
- `src/app/api/engagements/[engagementId]/recommendations/route.ts`

**I1B — Broken context.ts removed:**
- `src/app/api/governance/alerts/route.ts`
- `src/app/api/observability/summary/route.ts`

**I1C — Actor identity hardened:**
- `src/app/api/owner/learning-rejections/route.ts`
- `src/app/api/owner/learning-candidates/[candidateId]/promote/route.ts`
- `src/app/api/owner/learning-consent/route.ts`
- `src/app/api/owner/learning-harm-events/route.ts`
- `src/app/api/owner/learning-attribution-reviews/route.ts`
- `src/app/api/owner/learning-privacy/route.ts`
- `src/app/api/owner/learning-retention/route.ts`

**Deliverables:**
- `docs/audits/2026-07-12-stage-a7.6/` (this directory)
- `docs/architecture/INVARIANT_LEDGER.md`

---

## Deferred Work (Not Blocking This PR)

| ID | Description | Blocker |
|----|-------------|---------|
| DC-A7.6-I12A | Migrate 39 enforceWorkspaceScoping + 40 withAuth routes to withCanonicalEnforcement | Broad auth pattern migration |
| DC-A7.6-I13A | Unify 9 state machine implementations into single registry | Cross-domain refactor |
| DC-A7.6-I16A | Replace 20+ direct auditEvent.create with emitAuditEvent | Service-by-service migration |
| DC-A7.6-I16B | Consolidate logAuditEvent and emitAuditEvent into one function | Hash chain compatibility |
| DC-A7.6-I20A | Delete/deprecate context.ts::requireWorkspaceContext() | Requires I12A completion first |
| DC-A7.6-I1A-deferred | Fix remaining 9 header-reading routes | Requires DC-A7.6-I12A first |
| DC-A7.6-I1B-deferred | Fix 5 remaining broken requireWorkspaceContext calls | Requires DC-A7.6-I12A + I20A |

---

## Classification

**COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE**  
All 12 route fixes are code-verified (TypeScript, build, Prisma validate pass). Runtime activation depends on deployment with live DATABASE_URL.
