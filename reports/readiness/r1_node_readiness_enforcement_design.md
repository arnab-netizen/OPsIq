# R1 Node Readiness Enforcement Design

**Date**: 2026-05-18  
**Phase**: R1-NODE-READINESS-ENFORCEMENT PHASE B

---

## OBJECTIVE

Design minimal, safe central readiness guard that:
- Covers all 30+ protected routes with zero patching
- Preserves auth/webhook route reachability
- Uses durable startup_status from database
- Fails closed (503) when readiness != READY
- Is observable and auditable

---

## SELECTED IMPLEMENTATION POINT

**File**: `/src/runtime/enforcement/request-enforcer.ts`  
**Function**: `enforceRequest()` (foundation layer)  
**Location**: After health check, before circuit breaker (line 91)

**Rationale**:
- Covers ALL protected routes (30+ endpoints)
- Single location: no per-route patching
- Symmetric with existing health/circuit checks
- Runs before auth pipeline (fail-closed, fast rejection)
- Zero impact on public/auth/health routes (filtered by middleware)

---

## IMPLEMENTATION DESIGN

### 1. Add Option to enforceRequest()

```typescript
export interface EnforceRequestOptions {
  require_workspace_id?: boolean;
  require_execution_id?: boolean;
  bypass_health_check?: boolean;
  skipReadinessCheck?: boolean;  // NEW - for auth/webhooks
}

export async function enforceRequest<T>(
  req: NextRequest,
  handler: (ctx: EnforcedRequestContext) => Promise<T>,
  options?: EnforceRequestOptions,  // Updated signature
): Promise<NextResponse> {
  // ...implementation...
}
```

**Option: `skipReadinessCheck?: boolean`**
- Default: `false` (all protected routes check readiness)
- When `true`: Skip readiness check (for auth/webhooks)
- When `undefined`: Treated as `false` (safe default)

---

### 2. Add Readiness Check to enforceRequest()

**Location**: After health check (line 91), before shedding (line 92)

**Code**:
```typescript
// 2. MANDATORY: Verify startup readiness (fail-closed)
if (!options?.skipReadinessCheck) {
  const { getStartupStatus } = await import("@/services/startup-status");
  const status = await getStartupStatus();
  
  if (status.status !== "READY") {
    runtimeLogger.log({
      level: "WARN",
      category: "READINESS",
      message: `Request blocked: service not ready`,
      correlation_id: requestContext.generateCorrelationId(),
      context: {
        status: status.status,
        error: status.error,
        endpoint: req.nextUrl.pathname,
        method: req.method,
      },
      tags: ["readiness_blocked", "startup"],
    });
    
    throw createInfrastructureError(
      `Service starting up (${status.status})`,
      requestContext.createErrorContext(),
      false,  // Not retryable - client should retry, not system
    );
  }
}
```

**Error Handling**:
- Readiness check failure → InfrastructureError (non-retryable)
- Returns HTTP 503 (Service Unavailable)
- Logged with full diagnostic context
- Correlation ID tracked for debugging

---

### 3. Required Import

**Add to enforceRequest imports**:
```typescript
// Moved to dynamic import within check (see above)
// Avoids circular dependency and keeps check localized
```

**Why dynamic import?**
- getStartupStatus imports Prisma (Node-only)
- Only imported when readiness check runs (lazy)
- No circular dependency issues
- Aligns with existing pattern in startup-orchestrator.ts

---

### 4. Auth Routes: Special Case

**Routes that must set `skipReadinessCheck: true`**:
```
POST /api/auth/login
POST /api/auth/logout
POST /api/auth/refresh
```

**Pattern** (example for /api/auth/login):
```typescript
export const POST = withCanonicalEnforcement(
  async (ctx, params) => {
    // Handler code
  },
  {
    skipReadinessCheck: true,  // NEW: Auth can initialize startup
  }
);
```

**Rationale**:
- Auth login triggers startup (via ensureStartupComplete)
- Cannot block auth login with readiness check (circular dependency)
- Auth handlers have their own session-based auth checks
- Auth must succeed to initialize the system

---

### 5. Webhook Routes: Special Case

**Routes that may set `skipReadinessCheck: true`**:
```
POST /api/webhooks/stripe
POST /api/webhooks/*
```

**Decision**: Depends on desired behavior

**Option A** (Recommended): Skip readiness check
```typescript
export const POST = withEnforcementFull(
  async (req, ctx, params) => {
    // Handler can gracefully handle startup state
    // Maybe queue event if not ready
  },
  { skipReadinessCheck: true }
);
```

**Option B**: Check readiness (may reject valid webhooks)
```typescript
// Default: readiness check applies
// Stripe may retry if 503 received
```

**Recommendation**: Use Option A (skip for webhooks)
- Webhooks should queue if startup incomplete
- Stripe webhooks are asynchronous
- Handler can decide how to handle startup state

---

## ENFORCEMENT DECISION FLOW

```
Protected Route Request
  ↓
middleware.ts (Edge - no readiness check)
  ↓ (passes through to handler)
  ↓
handler calls withCanonicalEnforcement(handler, { skipReadinessCheck? })
  ↓
enforceRequest(req, wrappedHandler, { skipReadinessCheck? })
  ↓
┌─────────────────────────────────────────┐
│ Check: skipReadinessCheck === true?      │
├─────────────────────────────────────────┤
│ YES → Skip readiness check, continue     │
│       (Auth routes, webhooks)            │
│                                          │
│ NO → Check getStartupStatus()            │
│      ├─ status === READY → Continue      │
│      └─ status != READY → Return 503 ✗   │
└─────────────────────────────────────────┘
  ↓
(If readiness check passes)
  ↓
Health check (existing)
  ↓
Request shedding (existing)
  ↓
Circuit breaker (existing)
  ↓
Handler execution
  ↓
Response
```

---

## ERROR RESPONSE FORMAT

**When readiness != READY** (status 503):

```json
{
  "error": "SERVICE_UNAVAILABLE",
  "message": "Service starting up (STARTING)",
  "code": "INFRASTRUCTURE_ERROR"
}
```

**Response Headers**:
```
X-Correlation-ID: <correlation_id>
X-Error-Code: INFRASTRUCTURE_ERROR
```

**Status**: 503 Service Unavailable

---

## PROTECTED ROUTES: READINESS ENFORCEMENT

**All routes using withCanonicalEnforcement** (default behavior):
```
GET /api/actions
POST /api/actions
GET /api/engagements
POST /api/engagements
GET /api/engagements/[id]/...
POST /api/engagements/[id]/...
... (25+ routes)
```

✓ Will check readiness  
✓ Will fail with 503 if not READY

---

## ROUTES THAT BYPASS READINESS CHECK

### Auth Routes (skipReadinessCheck: true)
```
POST /api/auth/login        → Initialize startup, set session
POST /api/auth/logout       → Clear session
POST /api/auth/refresh      → Refresh token
```

### Webhook Routes (skipReadinessCheck: true)
```
POST /api/webhooks/stripe   → Queue/process asynchronously
POST /api/webhooks/*        → Handle startup gracefully
```

### Public Routes (Edge middleware - no check)
```
GET /login                  → Rendered by middleware
GET /api/health             → Allowed by middleware
GET /api/readiness          → Allowed by middleware
POST /api/auth/...          → Allowed by middleware
```

---

## CONSISTENT BEHAVIOR MATRIX

| Route | Middleware | enforceRequest | Handler | Readiness Check? |
|-------|-----------|-----------------|---------|-----------------|
| Protected API | Pass through | Called | Auth+business | ✓ YES (unless skipReadinessCheck) |
| /api/auth/login | Pass through | Called | Auth init | ✓ NO (skipReadinessCheck: true) |
| /api/webhooks/stripe | Pass through | Called | Handler | ✓ NO (skipReadinessCheck: true) |
| /login | Rendered | Not called | N/A | ✗ No (Edge only) |
| /api/health | Pass through | Possibly called | Health impl | ✗ No (public route) |
| /api/readiness | Pass through | Possibly called | Status read | ✗ No (public route) |

---

## TESTING STRATEGY (PHASE D-E)

### Unit Test Pattern
```typescript
// Test readiness check added to enforceRequest
test("enforceRequest blocks protected route when readiness != READY", async () => {
  // Mock getStartupStatus to return STARTING
  // Call enforceRequest with normal options
  // Verify: returns 503 Service Unavailable
});

test("enforceRequest skips readiness when skipReadinessCheck: true", async () => {
  // Mock getStartupStatus to return STARTING
  // Call enforceRequest with skipReadinessCheck: true
  // Verify: readiness check skipped, continues to handler
});
```

### Integration Test Pattern
```typescript
// Test protected route with readiness state changes
test("protected route returns 503 when not ready", async () => {
  // Force startup_status.status = "STARTING" in DB
  // GET /api/engagements
  // Verify: 503 Service Unavailable
});

test("protected route succeeds when ready", async () => {
  // Force startup_status.status = "READY" in DB
  // GET /api/engagements (with auth)
  // Verify: 200 OK with data
});

test("auth login succeeds during startup", async () => {
  // Force startup_status.status = "STARTING" in DB
  // POST /api/auth/login
  // Verify: 200 OK with session (not 503)
});
```

---

## KNOWN LIMITATIONS & DECISIONS

1. **Middleware cannot check readiness** (by design)
   - Edge Runtime cannot import Prisma
   - HTTP endpoint approach rejected (added latency/complexity)
   - Solution: Only handlers check readiness

2. **Auth routes cannot require readiness** (circular dependency)
   - Auth login triggers startup
   - Must be reachable even if startup incomplete
   - Use `skipReadinessCheck: true`

3. **Webhooks may arrive during startup** (correct behavior)
   - May want to queue/retry if not ready
   - Use `skipReadinessCheck: true` and handle in handler
   - Alternative: Let 503 cause external retry

4. **Public routes unaffected** (by design)
   - Middleware filters public routes
   - enforceRequest not called for /login, /api/health, etc.
   - These routes always available

---

## IMPLEMENTATION CHECKLIST (PHASE C)

- [ ] Add `skipReadinessCheck?: boolean` option to EnforceRequestOptions
- [ ] Add readiness check to enforceRequest (after health check)
- [ ] Use dynamic import for getStartupStatus (avoid circular deps)
- [ ] Verify error handling creates proper 503 response
- [ ] Update /api/auth/login to use `skipReadinessCheck: true`
- [ ] Update /api/auth/logout to use `skipReadinessCheck: true`
- [ ] Update /api/auth/refresh to use `skipReadinessCheck: true`
- [ ] Review webhook routes (decide skip vs require)
- [ ] Add comprehensive logging (readiness state, duration, status)
- [ ] Verify no circular dependencies
- [ ] Test with readiness READY (should work)
- [ ] Test with readiness STARTING (should fail 503)
- [ ] Test auth routes with readiness STARTING (should work)

---

## NEXT: PHASE C Implementation

This design provides:
- ✓ Single central location (enforceRequest)
- ✓ Zero per-route patching (all routes covered)
- ✓ Consistent fail-closed behavior (503)
- ✓ Durable truth source (database startup_status)
- ✓ Safe exceptions (auth/webhooks)
- ✓ Observable enforcement (logging)

Ready to implement.

---

**PHASE B COMPLETE** - Central readiness guard designed.

Next: PHASE C - Implement central node readiness guard.
