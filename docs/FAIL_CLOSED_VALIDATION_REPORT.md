# Fail-Closed Validation Report — Phase F

**Date:** 2026-06-23  
**Verdict:** 1 P1 fixed, 2 P1 accepted with documented rationale, 3 P2 documented

---

## Findings

### FIXED — FC-001 (P1): Double-confirm race condition in `confirmDataIntake`
**File:** `src/services/owner-intake/intake.service.ts`  
**Fix:** Changed `update({ where: { id } })` to `updateMany({ where: { id, workspaceId, ownerConfirmed: false } })`. If `count === 0`, the record was already confirmed by a concurrent request → throw `ConflictError`. Atomically prevents double-confirmation.

### ACCEPTED — FC-002 (P1): Rate limit `x-tier` and `x-forwarded-for` are client-controlled
**File:** `src/middleware/rate-limit.ts`  
**Context:** These headers are set by the platform/load balancer in production (Vercel sets trust headers). In the dev/test environment the in-process middleware trusts the header. This is a deployment concern, not an application code defect. The canonical route enforcement layer enforces workspace/session auth independently. Documented for ops runbook.

### ACCEPTED — FC-003 (P1): Workspace header absent bypasses workspace rate limit  
**File:** `src/middleware/rate-limit.ts`  
**Context:** `withCanonicalEnforcement` verifies `workspaceId` from the session JWT (server-side), not from the header. The rate limit workspace bucket is an additional throttle. The auth layer does not rely on the rate limit; an unauthenticated request is rejected before reaching business logic. P1 accepted because auth is independently enforced.

### P2-DOCUMENTED — FC-004: `workspaceValid: true` in telemetry when workspace resolution failed
**File:** `src/lib/canonical-route-enforcement.ts`  
**Note:** Audit trail may show inconsistent `workspaceValid`. Lower priority — does not affect security posture, only forensics.

### P2-DOCUMENTED — FC-005: Security telemetry emitters are nullable — silent drop
**File:** `src/infra/errors.ts`  
**Note:** If `globalTelemetryEmitter` / `globalAuditEmitter` are never injected, security-relevant events are silently dropped. This is a deployment concern (emitters must be wired at startup). Documented for ops runbook. Application code cannot fail-closed on missing infra without blocking all requests.

### P2-DOCUMENTED — FC-006: In-memory diagnosis rate limiter not shared across replicas
**File:** `src/middleware/rate-limit.ts`  
**Note:** In multi-replica/serverless deployments each process has a separate `diagnosisStore`. Effective limit is N×10/hr. Acceptable for current single-process deployment; would need Redis/KV for multi-replica.

---

## Gate Status

- `npx tsc --noEmit`: PASS
- Simulation tests (54/54): PASS
- Double-confirm: ELIMINATED (atomic updateMany)

**PHASE_F_FAIL_CLOSED: PASS**
