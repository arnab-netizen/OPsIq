# R1-SPECIAL-2E: Lane E Implementation Strategy

**Date:** 2026-05-17  
**Phase:** R1-SPECIAL-2E Implementation Strategy Definition  
**Status:** IMPLEMENTATION STRATEGY DEFINED

---

## A. Group 1: Simple Session (E1 Safe)

**Handlers:** auth/logout (POST)

**Modernization Pattern:**
```
withEnforcementFull → withCanonicalEnforcement
```

**Implementation Steps:**
1. Replace wrapper: `withEnforcementFull(async (request) => ...)`
2. Change signature: `(ctx: CanonicalAuthContext)`
3. Replace `session.user.id` with `ctx.verifiedActorId`
4. Use `ctx.verifiedWorkspaceId` for workspace scoping
5. Preserve invalidation logic exactly

**Auth Pattern:**
- Wrapper enforces: Basic authentication
- Route-local: Session verification (already implicit)
- Verified context: actor ID, workspace ID

**Idempotency:** Implicit (session invalidation idempotent)

**Transaction Model:** Single atomic operation (session update)

**Rollback:** Not needed (session invalidation final)

**Audit:** Preserve logout event logging

**Validation Gates:**
- Session must exist
- Actor must own session
- Workspace scoping maintained

---

## B. Group 2: Auth Session (E2 Moderate)

**Handlers:** auth/login (POST)

**Modernization Pattern:**
```
withEnforcementFull → withCanonicalEnforcement
+ Preserve idempotency key handling
```

**Implementation Steps:**
1. Replace wrapper: `withEnforcementFull(async (request) => ...)`
2. Change signature: `(ctx: CanonicalAuthContext)`
3. Extract idempotency key: `ctx.request?.headers.get("idempotency-key")`
4. Preserve checkIdempotencyKey() call exactly
5. Replace session creation with `ctx.verifiedActorId`
6. Use `ctx.verifiedWorkspaceId` for workspace binding

**Auth Pattern:**
- Wrapper enforces: Basic (pre-auth required)
- Route-local: Credential validation
- Verified context: Not used (auth endpoint)

**Idempotency:** Explicit (idempotency key required)

**Transaction Model:** Session creation atomic

**Rollback:** Session deletion (explicit revert)

**Audit:** Login success/failure events

**Validation Gates:**
- Credentials valid
- Account active
- No session exists (prevent double-creation)
- Idempotency key present

---

## C. Group 3: Webhooks (E2 Moderate)

**Handlers:** webhooks/stripe (POST), webhooks/subscribe (POST)

**Modernization Pattern:**
```
withEnforcementFull → withCanonicalEnforcement
+ Preserve webhook signature verification
+ Preserve idempotency tracking
```

**Implementation Steps:**
1. Replace wrapper: `withEnforcementFull(async (request) => ...)`
2. Change signature: `(ctx: CanonicalAuthContext)`
3. Preserve webhook signature verification (external, not auth)
4. Extract raw body for signature: `await ctx.request?.text()`
5. Preserve idempotency tracking via webhook ID
6. Replace session references with `ctx.verifiedActorId` (if needed)

**Auth Pattern:**
- Wrapper enforces: Basic (webhook origin verification)
- Route-local: Webhook signature verification
- Verified context: Minimal (webhooks external)

**Idempotency:** Explicit (Stripe retryId)

**Transaction Model:** Payment mutation atomic

**Rollback:** Refund/reversal semantics preserved

**Audit:** Payment transaction events

**Validation Gates:**
- Webhook signature valid
- Webhook ID unique (idempotency)
- Payment data valid
- Recipient account exists

---

## D. Group 4: Growth Metrics (E2 Moderate)

**Handlers:** growth/unit-economics, growth/acquisition-metrics, growth/sales-pipeline (POST)

**Modernization Pattern:**
```
withEnforcementFull → withCanonicalEnforcement
+ Add idempotency key support
```

**Implementation Steps:**
1. Replace wrapper: `withEnforcementFull(async (request) => ...)`
2. Change signature: `(ctx: CanonicalAuthContext)`
3. Add idempotency key extraction: `ctx.request?.headers.get("idempotency-key")`
4. Add checkIdempotencyKey() call
5. Preserve metrics calculation logic
6. Replace `session.user.id` with `ctx.verifiedActorId`
7. Use `ctx.verifiedWorkspaceId` for workspace scoping

**Auth Pattern:**
- Wrapper enforces: Capability (METRICS_CREATE)
- Route-local: Domain auth (growth-team)
- Verified context: actor ID, workspace ID, capabilities

**Idempotency:** Explicit (idempotency key added)

**Transaction Model:** Metrics update atomic

**Rollback:** Metrics recalculation (explicit recompute)

**Audit:** Metrics calculation events

**Validation Gates:**
- Capability required (METRICS_CREATE)
- Domain auth (growth-team)
- Idempotency key present
- Metrics data valid

---

## E. Group 5: Optimistic Lock State Transitions (E3 Complex)

**Handlers:** intervention PATCH, engagements PATCH, clients PATCH, decisions PATCH, leads PATCH

**Modernization Pattern:**
```
withEnforcementFull → withCanonicalEnforcement
+ Preserve version field validation
+ Implement retry on version conflict
```

**Implementation Steps:**
1. Replace wrapper: `withEnforcementFull(async (request) => ...)`
2. Change signature: `(ctx: CanonicalAuthContext, params)`
3. Extract version field from body: `body.version`
4. Preserve version validation: Check current version
5. Throw version conflict error if mismatch
6. Preserve state transition validation
7. Replace `session.user.id` with `ctx.verifiedActorId`
8. Use `ctx.verifiedWorkspaceId` for workspace scoping

**Auth Pattern:**
- Wrapper enforces: Capability (ENGAGEMENT_UPDATE, etc.)
- Route-local: Ownership/access check
- Verified context: actor ID, workspace ID, capabilities

**Idempotency:** Implicit (version field prevents double-application)

**Transaction Model:** Multi-step but version-gated

**Rollback:** Not needed (version prevents conflicting updates)

**Audit:** State transition events

**Concurrency Safeguard:** Version field
- Client sends current version
- Server validates version matches before update
- If mismatch: return 409 Conflict
- Client retries with fresh data

**Validation Gates:**
- Capability required
- Ownership verified
- Version matches current
- State transition valid
- Workspace scoping maintained

---

## F. General Safeguards for All Groups

**Error Handling:**
- Preserve all error types and status codes
- Maintain error logging (audit trail)
- Keep error messages (user feedback)

**Audit Events:**
- Preserve all audit event logging
- Maintain audit metadata
- Keep event timestamps

**Response Shapes:**
- Preserve JSON response structure
- Maintain status codes (200, 201, 400, 401, 409, etc.)
- Keep response headers

**Workspace Isolation:**
- All mutations scoped to `ctx.verifiedWorkspaceId`
- Cross-workspace access prevented
- Verified at wrapper + route-local

**Actor Identification:**
- All mutations attributed to `ctx.verifiedActorId`
- No session spoofing possible
- Audit trail accurate

---

**Status: ✓ IMPLEMENTATION STRATEGY DEFINED - READY FOR BATCH SELECTION**
