# OPSIQ Stage A7.5 — Final Invariant Audit Report

**Audit date:** 2026-07-12  
**Branch:** `claude/phase-a7.5-invariant-hardening`  
**Scope:** Full repository-wide invariant verification across I1–I10

---

## Executive Summary

10 invariants audited across the full codebase using 5 parallel specialist agents. **44 findings identified** (28 FAIL, 16 WARN) across 21 defect classes.

**3 defect classes fixed in this PR.** The remaining 18 are documented, prioritized, and queued for follow-on PRs. No finding required weakening auth, workspace enforcement, or DTO redaction to fix.

---

## Audit Results by Invariant

| Invariant | Description | Result | FAIL | WARN |
|---|---|---|---|---|
| I1 | Workspace Isolation | WARN | 0 | 5 |
| I2 | Idempotency | FAIL | 3 | 3 |
| I3 | Atomic Audit Trail | FAIL | 4 | 2 |
| I4 | CAS / Optimistic Locking | FAIL | 12 | 0 |
| I5 | Capability Enforcement | FAIL | 6 | 0 |
| I6 | Duplicate Logic | FAIL | 1 | 1 |
| I7 | No Placeholder/Stub | FAIL | 6 | 2 |
| I8 | Test Integrity | WARN | 0 | 3 |
| I9 | Dead Code | WARN | 0 | 1 |
| I10 | Dependency Graph | FAIL | 6 | 8 |

---

## Most Critical Findings

### 1. I5-A: 4 Decision Lifecycle Routes Permanently Denied (FIXED)

Permission strings `execute`, `fail_decision`, `verify_outcome`, `record_outcome` were absent from the `hasPermission` map. Every call to these routes returned "Insufficient permissions" for **all users**, including admin. The execute, fail, verify, and record-outcome stages of the decision lifecycle were completely inoperative via API.

**Fixed:** Added to `hasPermission` map with appropriate role mappings.

### 2. I3: Token Lifecycle Without Audit (FIXED for token-lifecycle.service.ts)

`token-lifecycle.service.ts` performed 6 material mutations on `externalOAuthToken` and `externalConnection` — security-sensitive governed entities — with zero audit coverage. OAuth token store, update, revocation, and connection expiry were invisible to the audit trail.

**Fixed:** Added 5 AUDIT_EVENTS constants and emitAuditEvent calls to all 4 material-mutation functions.

**Remaining I3 gaps (deferred):**
- `outcome-modification.service.ts` — 3 operatorItem mutations (embedded JSON `auditTrail` field is NOT a canonical audit event)
- `decision-control/enforcement.service.ts:277` — outcomeDelta write
- `recommendation/attribution.ts:37` — recommendationId link

### 3. I1: Actor Identity Forgery in 4 Learning Routes (FIXED)

Routes `learning-privacy`, `learning-retention`, `learning-consent`, `learning-harm-events` all accepted actor identity (`appliedBy`, `consentBy`, `detectedBy`) from the client request body. Any authenticated user could forge these fields in the audit/compliance record.

**Fixed:** Removed actor field from Zod schema; replaced with `ctx.verifiedActorId` from canonical auth context.

### 4. I4: CAS Locking Missing Across 12 Governed Write Paths (DEFERRED)

12 write paths on governed entities (operatorItem, action, engagement, recommendation, recoveryAction, ownerBusiness) either:
- Use a pre-read version check but don't include version in the WHERE clause (TOCTOU race), or
- Use no version guard at all

The `withVersionCheck` helper exists and is used correctly in 7 other files (`engagement.ts`, `evidence.ts`, `client-account.ts`, `lead.ts`, `intervention-state.ts` (partial)). The 12 affected paths missed it.

**Priority for next PR.** No schema changes required for operatorItem/action/engagement/recommendation (version column exists). 6 OwnerXxxAction tables require schema migration.

### 5. I5-B: Proof/Review Permission From Client Body (DEFERRED)

`src/app/api/proof/review/route.ts:14` reads `body.requiredPermission` and uses it as the authorization gate. A caller can set this to the lowest-tier `GuidedExecutionPermission` value to downgrade the authorization check for the proof review operation.

**Priority 2 in next PR.**

### 6. I10-B: 6 Routes Call Domain Logic Directly (DEFERRED)

5 API routes bypass the service layer and call domain functions directly: `arbitrate/route.ts`, `proof-risk/queue/route.ts`, `config/route.ts`, `guardrails/screen/route.ts`, `guidance/route.ts`. One already has a service wrapper that's not being used (`arbitrate`).

---

## Fixed in This PR — Summary

| DC | Fix | Files |
|---|---|---|
| DC-A7.5-I5A | Added 4 missing permission strings to hasPermission map | `src/middleware/workspace-enforcement.ts` |
| DC-A7.5-I3 | Added emitAuditEvent to token-lifecycle.service.ts; added 5 AUDIT_EVENTS constants | `src/domain/constants/audit-events.ts`, `src/services/external-systems/token-lifecycle.service.ts` |
| DC-A7.5-I1 | Replaced body actor fields with ctx.verifiedActorId in 4 learning routes | 4 route files |

---

## Deliverables

- `docs/audits/2026-07-12-stage-a7.5/EVIDENCE_LEDGER.json` — 44 structured findings
- `docs/audits/2026-07-12-stage-a7.5/DEFECT_CLASS_MATRIX.md` — 21 defect classes, fix status, priority queue
- `docs/audits/2026-07-12-stage-a7.5/DUPLICATE_LOGIC_MATRIX.md` — I6 deep dive
- `docs/audits/2026-07-12-stage-a7.5/PLACEHOLDER_MATRIX.md` — I7 deep dive
- `docs/audits/2026-07-12-stage-a7.5/TEST_INTEGRITY_MATRIX.md` — I8 deep dive
- `docs/audits/2026-07-12-stage-a7.5/DEPENDENCY_GRAPH.md` — I10 layer violations
- `docs/architecture/INVARIANT_LEDGER.md` — ongoing invariant register

---

## Gates

- `npx tsc --noEmit`: verified (no new type errors from fixes)
- `npm run build`: verified
- DB gates: not applicable (no schema changes in this PR)
- Tests: `npx vitest run` — affected test files verified

---

## What Was NOT Changed

- No production DB migration
- No production DB touched
- No secrets altered
- No .github workflows modified
- No auth weakening
- No workspace enforcement weakening
- No DTO redaction weakening
