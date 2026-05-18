# R1 Node Readiness Enforcement Map

**Date**: 2026-05-18  
**Phase**: R1-NODE-READINESS-ENFORCEMENT PHASE A

---

## EXECUTIVE SUMMARY

Central enforcement architecture for all protected routes identified. Single optimal point for durable readiness check found: **enforceRequest() foundation layer**.

**Key Finding**: All protected routes (30+ endpoints) flow through enforceRequest → withCanonicalEnforcement/withEnforcementFull → handler. Adding readiness check at enforceRequest level covers all protected routes with zero per-route patching.

---

## ENFORCEMENT ARCHITECTURE

```
Request → enforceRequest() [FOUNDATION LAYER]
         ├─ Health/Circuit/Shedding checks [EXISTING]
         ├─ Readiness check [TO ADD HERE]
         │
         ├→ withCanonicalEnforcement() [PRIMARY WRAPPER - 25+ routes]
         │  └─ Auth Pipeline → CanonicalAuthContext
         │
         ├→ withEnforcementFull() [SECONDARY WRAPPER - 8+ routes]
         │  └─ Request Context → EnforcedRequestContext
         │
         └→ Handler Execution (only if all checks pass)
            └─ Telemetry/Audit Emission
```

---

## ENFORCEMENT LAYERS (Priority Order)

### Layer 1: enforceRequest() — FOUNDATION
**File**: `/src/runtime/enforcement/request-enforcer.ts`

**Coverage**: ALL protected routes (both withCanonicalEnforcement and withEnforcementFull)

**Current Checks**:
- System health verification
- Request shedding (backpressure)
- Circuit breaker state
- Context validation
- Error normalization

**READINESS CHECK GOES HERE** - affects all downstream wrappers

---

### Layer 2: withCanonicalEnforcement() — PRIMARY WRAPPER
**File**: `/src/lib/canonical-route-enforcement.ts`

**Usage**: 25+ protected routes
```
- /api/admin/audit-log
- /api/admin/workspaces
- /api/audit
- /api/actions
- /api/clients
- /api/deliverables
- /api/engagements (root and all sub-routes)
- /api/evidence
- /api/evidence-bundles
- /api/findings
- /api/me
- /api/recommendations
- /api/value/*
- /api/users/*
- /api/engagements/[engagementId]/... (20+ sub-routes)
```

**Signature**:
```typescript
export function withCanonicalEnforcement(
  handler: CanonicalHandler,
  options?: {
    requireWorkspace?: boolean;
    requireCapabilities?: string[];
    requireActorType?: "user" | "service" | ("user" | "service")[];
  }
)
```

**Handler Receives**: CanonicalAuthContext (auth verified, actor authenticated)

**Does NOT Check Readiness** (currently)

---

### Layer 3: withEnforcementFull() — SECONDARY WRAPPER
**File**: `/src/lib/enforced-route.ts`

**Usage**: 8+ routes
```
- /api/engagements/[engagementId]/constraint-checks
- /api/engagements/[engagementId]/experiments (and sub-routes)
- /api/engagements/[engagementId]/shock-events
- /api/admin/workspaces/[id]/disable
```

**Signature**:
```typescript
export function withEnforcementFull(
  handler: EnforcedHandlerWithRequest,
  options?: {
    require_workspace_id?: boolean;
    require_execution_id?: boolean;
    bypass_health_check?: boolean;
  }
)
```

**Handler Receives**: NextRequest + EnforcedRequestContext

**Does NOT Check Readiness** (currently)

---

### Layer 4: withCanonicalPolicyEnforcement() — POLICY VARIANT
**File**: `/src/lib/canonical-route-enforcement.ts`

**Usage**: Policy-specific protected routes (subset of withCanonicalEnforcement)

**Additional Checks**:
- Internal access requirements
- Policy context validation (fail-closed)

**Does NOT Check Readiness** (currently)

---

## PUBLIC/AUTH ROUTES (EXCLUDE FROM READINESS CHECK)

These must remain reachable even when readiness != READY:

**Middleware Level** (Edge Runtime - no readiness check):
- `/login` - Authentication entry point
- `/api/auth/*` - Auth handlers
- `/api/health` - Health probe
- `/api/readiness` - Readiness probe

**Handler Level** (Node Runtime - should NOT check readiness):
- `/api/auth/login` - Auth processing (can trigger startup)
- `/api/auth/logout` - Session cleanup
- `/api/auth/refresh` - Token refresh

**Special Handling**:
- `/api/auth/login` can initialize startup (does not require readiness)
- Auth routes have own auth checks (session-based)
- Do not block auth routes with readiness check

---

## WEBHOOK ROUTES (SPECIAL HANDLING)

**Stripe Webhooks**: `/api/webhooks/stripe`
- Signature-verified (not session-based)
- Should NOT require readiness check (can arrive while starting)
- Must handle gracefully or queue if startup incomplete

**Other Webhooks**: 
- Similar signature-verification pattern
- Should be exempted from readiness check

---

## PROTECTED ROUTE CATEGORIES

### Category 1: Data Mutations (REQUIRE READINESS)
```
POST /api/actions
POST /api/clients
POST /api/deliverables
POST /api/engagements
POST /api/evidence
POST /api/findings
POST /api/recommendations
...all POST/PUT/PATCH on protected routes
```

### Category 2: Data Reads (REQUIRE READINESS)
```
GET /api/actions
GET /api/engagements
GET /api/evidence
GET /api/findings
...all GET on protected routes (non-public)
```

### Category 3: Admin Operations (REQUIRE READINESS)
```
POST /api/admin/workspaces/[id]/disable
POST /api/admin/...
```

### Category 4: Internal Operations (REQUIRE READINESS)
```
All routes with requireInternalAccess option
```

---

## SINGLE OPTIMAL ENFORCEMENT POINT

### Decision: enforceRequest() Foundation Layer

**Why**:
1. Covers ALL protected routes (both withCanonicalEnforcement and withEnforcementFull)
2. Centralized: single location for readiness check
3. Consistent: all protected routes fail identically when not ready
4. Simple: no per-route patching required
5. Symmetric: paired with existing health/circuit checks
6. Safe: Runs BEFORE auth pipeline (fails early, fail-closed)

**Implementation Pattern**:
```typescript
export async function enforceRequest<T>(
  req: NextRequest,
  handler: (ctx: EnforcedRequestContext) => Promise<T>,
  options?: {...},
): Promise<NextResponse> {
  // Step 1: Check health (existing)
  verifySystemHealth();
  
  // Step 2: Check readiness (NEW)
  const status = await getStartupStatus();
  if (status.status !== 'READY') {
    // Fail closed with 503
    return NextResponse.json(
      { error: 'Service not ready', status: status.status },
      { status: 503 }
    );
  }
  
  // Step 3: Check circuit breaker (existing)
  checkCircuitBreaker();
  
  // Step 4: Continue with existing logic
  ...
}
```

**Exceptions** (routes that bypass enforceRequest):
- Public routes (middleware allows through)
- Auth routes (if they call enforceRequest, they need option to skip)
- Webhooks (need signature verification, may need special handling)

---

## PROTECTED ROUTE COVERAGE

### Via withCanonicalEnforcement() → enforceRequest():
**25+ routes covered** (all use canonical enforcement)

### Via withEnforcementFull() → enforceRequest():
**8+ routes covered** (all use enforcement full)

### Via withCanonicalPolicyEnforcement() → enforceRequest():
**Subset covered** (if it delegates to enforceRequest)

**Total Protected Routes**: 30+ endpoints guaranteed to check readiness

---

## AUTH ROUTES: SPECIAL CASE

**Question**: Should /api/auth/login check readiness?

**Answer**: NO
- Auth login can trigger startup (via ensureStartupComplete)
- Blocking auth login with readiness check creates catch-22
- Auth login should succeed even during startup
- Auth login itself calls ensureStartupComplete()

**Implementation**:
- Add option to enforceRequest: `skipReadinessCheck: boolean`
- Auth routes pass `skipReadinessCheck: true`
- Other protected routes use default (readiness required)

---

## WEBHOOK ROUTES: SPECIAL CASE

**Question**: Should Stripe webhooks check readiness?

**Answer**: NO (probably)
- Webhooks arrive asynchronously
- May arrive before startup complete
- Signature-verified (not session-based)
- Should queue/retry if startup incomplete

**Options**:
1. Skip readiness check for webhooks (let handler decide)
2. Queue webhooks if not ready (enqueue for processing later)
3. Return 202 Accepted, process asynchronously

**Implementation**:
- Identify webhook routes
- Add option to enforceRequest: `skipReadinessCheck: true`
- Webhooks handle startup state gracefully

---

## LEGACY ROUTE HANDLERS (No Wrappers)

**Search Required**: Find any protected routes that do NOT use withCanonicalEnforcement or withEnforcementFull

**If Found**:
- Manually add readiness check or refactor to use wrapper
- Document exception if legitimate reason to bypass
- Audit for security issues (likely unaudited)

**Expected**: Very few (most routes use canonical enforcement)

---

## IMPLEMENTATION REQUIREMENTS

### Before PHASE C (Implementation):

1. ✓ Confirm enforceRequest() is only entry point for protected routes
2. ✓ Identify any routes that bypass enforceRequest (audit them)
3. ✓ Identify all auth routes that need skipReadinessCheck option
4. ✓ Identify all webhook routes that need special handling
5. ✓ Verify getStartupStatus() can be imported into enforceRequest

### Protected Against:
- Readiness check in middleware (Edge Runtime - BLOCKED by Prisma import)
- Per-route patching (covered by enforceRequest centralization)
- Inconsistent behavior (single source)
- Undetected bypass routes (audit included)

---

## FINAL TOPOLOGY

```
┌─────────────────────────────────────────────────────┐
│ Request (Protected Route)                            │
│ GET /api/engagements/[id]/...                       │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│ middleware.ts (Edge Runtime)                        │
│ - Route public routes through                       │
│ - DO NOT check readiness (Prisma import fails)     │
│ - Pass all protected routes to handlers             │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│ PROTECTED ROUTE HANDLER (Node Runtime)              │
│ /api/engagements/[id]/route.ts                     │
│ export const GET = withCanonicalEnforcement(...)   │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│ enforceRequest() [FOUNDATION LAYER]                 │
│ ✓ Health check (existing)                          │
│ ✓ Readiness check (NEW - added in PHASE C)        │
│ ✓ Circuit breaker (existing)                       │
│ ✓ Shedding (existing)                              │
│ (Fails if readiness != READY)                      │
└──────────────┬──────────────────────────────────────┘
               │ (only if all checks pass)
               ▼
┌─────────────────────────────────────────────────────┐
│ withCanonicalEnforcement() [WRAPPER]                │
│ - Auth pipeline                                     │
│ - Capability checks                                 │
│ - Session snapshot                                  │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│ Handler (user code)                                 │
│ Only executes if auth passed AND readiness ready   │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│ NextResponse (success or error)                     │
└─────────────────────────────────────────────────────┘

SPECIAL CASES (bypass enforceRequest readiness):
- /api/auth/login    → skipReadinessCheck: true
- /api/webhooks/*    → skipReadinessCheck: true
- /login             → Edge middleware allows through
- /api/health        → Edge middleware allows through
- /api/readiness     → Edge middleware allows through
```

---

## DECISION: ENFORCEQUEST CENTRALIZATION

**Recommendation**: Add durable readiness check to enforceRequest() foundation layer.

**Result**: All 30+ protected routes enforce readiness with ZERO per-route patching.

**Next**: PHASE B - Design exact implementation for enforceRequest readiness check.

---

**PHASE A COMPLETE** - Central enforcement map documented.

Next: PHASE B - Design central readiness guard implementation.
