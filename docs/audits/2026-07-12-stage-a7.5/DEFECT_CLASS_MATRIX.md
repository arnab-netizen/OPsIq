# Defect Class Matrix — Stage A7.5 Invariant Audit

Audit date: 2026-07-12  
Branch: `claude/phase-a7.5-invariant-hardening`  
Total findings: 44 (28 FAIL, 16 WARN)

## Defect Class Register

| DC ID | Invariant | Sev | Count | Root Cause | Fix Status | Blocker |
|---|---|---|---|---|---|---|
| DC-A7.5-I1 | I1 | WARN | 4 | Actor identity (appliedBy/consentBy/detectedBy) taken from request body instead of auth context | **FIXED in this PR** | — |
| DC-A7.5-I1B | I1 | WARN | 1 | Idempotency key lookup not scoped to workspaceId in WHERE clause | DEFERRED | Requires schema migration (no workspaceId column on IdempotencyRecord) |
| DC-A7.5-I2A | I2 | FAIL | 1 | Non-transactional 5-step signup with no idempotency key | DEFERRED | Requires atomic transaction + schema analysis |
| DC-A7.5-I2B | I2 | FAIL | 2 | `externalSyncJob.create` called with random ID on every invocation — no deduplication | DEFERRED | Requires upsert or unique-key strategy decision |
| DC-A7.5-I2C | I2 | WARN | 3 | Check-then-act races on user/billingAccount/sequenceNumber creation | DEFERRED | Requires transaction wrappers + unique constraint handling |
| DC-A7.5-I3 | I3 | FAIL | 6 | Material mutations on governed entities without `emitAuditEvent` or `tx.auditEvent.create` | **FIXED (token-lifecycle) in this PR**; 3 others deferred |
| DC-A7.5-I4A | I4 | FAIL | 5 | Pre-read version check not reflected in DB WHERE clause (TOCTOU race) | DEFERRED | High-risk refactor touching 5 service files, needs version validation suite |
| DC-A7.5-I4B | I4 | FAIL | 7 | No version guard at all on governed entity updates | DEFERRED | Requires `withVersionCheck` helper to be applied to 7 call sites |
| DC-A7.5-I4C | I4 | FAIL | 1 | 6 OwnerXxxAction tables missing version column — CAS architecturally impossible | DEFERRED | Requires schema migration for 6 tables |
| DC-A7.5-I5A | I5 | FAIL | 4 | Permission strings ('execute', 'fail_decision', 'verify_outcome', 'record_outcome') absent from `hasPermission` map — routes permanently deny all users | **FIXED in this PR** | — |
| DC-A7.5-I5B | I5 | FAIL | 1 | Required permission level for proof review taken from client request body | DEFERRED | Requires analysis of GuidedExecutionPermission flow |
| DC-A7.5-I5C | I5 | FAIL | 1 | Intake route creates governed decision without DECISION_CREATE capability check | DEFERRED | Requires capability assertion integration |
| DC-A7.5-I6 | I6 | FAIL/WARN | 2 | Margin floor in percent (margin-safety-gate.ts) vs 0..1 fraction (opportunity-contract-guardrails.ts) with ad-hoc /100 conversion at call site | DEFERRED | Needs unit canonicalization across 3 files |
| DC-A7.5-I7A | I7 | FAIL | 5 | `throw new Error('not implemented')` stubs in production routes and services | DEFERRED | Google Sheets OAuth: external-service blocked; review-cycles/constraint-checks: DB schema missing |
| DC-A7.5-I7B | I7 | FAIL | 1 | `cleanupOldSnapshots` is a no-op (silent, unbounded snapshot growth) | DEFERRED | Design decision required for retention policy |
| DC-A7.5-I7C | I7 | WARN | 2 | Redis cache silently falls back to in-memory; error monitoring TODO | DEFERRED | Infrastructure configuration |
| DC-A7.5-I8 | I8 | WARN | 3 | Tests mock the domain functions their service-under-test calls | DEFERRED | Low risk; test refactor only |
| DC-A7.5-I9 | I9 | WARN | 1 | Two functions exported from `business-wisdom.ts` with zero external callers | DEFERRED | Trivial cleanup |
| DC-A7.5-I10A | I10 | FAIL | 1 | `input-catalog.ts` imports runtime value `CRITICAL_INGESTION_DOMAINS` from service layer | DEFERRED | Move constant to domain |
| DC-A7.5-I10B | I10 | FAIL/WARN | 7 | API routes call domain functions directly, bypassing service layer | DEFERRED | Requires service wrappers for 5 routes |
| DC-A7.5-I10C | I10 | WARN | 6 | Domain files use `import type` from service layer | DEFERRED | Move types to shared domain module |

## Fixed in This PR

### DC-A7.5-I1 — Actor Identity Forgery
**Files changed:** 4 learning routes  
**Root cause:** Routes accepted `appliedBy`, `consentBy`, `detectedBy` from request body; any authenticated caller could forge these fields.  
**Fix:** Removed actor identity field from Zod schema; replaced `body.appliedBy` / `body.consentBy` / `body.detectedBy` with `ctx.verifiedActorId` (derived from verified session).  
**Files:**
- `src/app/api/owner/learning-privacy/route.ts`
- `src/app/api/owner/learning-retention/route.ts`
- `src/app/api/owner/learning-consent/route.ts`
- `src/app/api/owner/learning-harm-events/route.ts`

### DC-A7.5-I3 (token-lifecycle) — Missing Audit on Token Mutations
**Files changed:** 2 files  
**Root cause:** `token-lifecycle.service.ts` performs 6 material mutations on security-sensitive entities (`externalOAuthToken`, `externalConnection`) with zero audit coverage.  
**Fix:** Added 5 new AUDIT_EVENTS constants; added `emitAuditEvent` calls after `storeOAuthToken`, `disconnectOAuthConnection`, `markConnectionExpired`, and both paths of `updateSyncJobStatus`.  
**Files:**
- `src/domain/constants/audit-events.ts` (5 new constants)
- `src/services/external-systems/token-lifecycle.service.ts`

### DC-A7.5-I5A — Broken Permission Strings
**Files changed:** 1 file  
**Root cause:** `hasPermission` in `workspace-enforcement.ts` had no entry for 'execute', 'fail_decision', 'verify_outcome', 'record_outcome'. All 4 routes that used these strings permanently denied every user, making the execute/fail/verify/record-outcome decision lifecycle paths completely inoperative.  
**Fix:** Added 4 strings to appropriate role allowlists.  
**File:** `src/middleware/workspace-enforcement.ts`

## Deferred — Priority Order for Next PRs

1. **DC-A7.5-I4A + I4B** (TOCTOU + missing version guards) — highest data-integrity risk; 12 affected sites
2. **DC-A7.5-I5B** (permission from body) — active security vulnerability in proof/review route
3. **DC-A7.5-I5C** (intake capability bypass) — governance bypass
4. **DC-A7.5-I3** (outcome-modification, enforcement, attribution) — 3 remaining audit gaps
5. **DC-A7.5-I2A** (signup non-transactional) — data consistency risk
6. **DC-A7.5-I10A + I10B** (layer violations) — architectural debt
7. **DC-A7.5-I2B + I2C** (idempotency races) — reliability
8. **DC-A7.5-I6** (margin unit inconsistency) — silent correctness risk
9. **DC-A7.5-I4C** (missing version columns) — schema migration required
10. **DC-A7.5-I7A** (stubs) — awaiting external service availability
