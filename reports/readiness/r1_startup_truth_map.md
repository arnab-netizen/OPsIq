# R1 Startup Truth Map — PHASE A

**Date**: 2026-05-18  
**Purpose**: Identify all startup/readiness truth sources, ownership, mutations, caches, and races

---

## TRUTH SOURCES INVENTORY

### 1. startup-state.ts (GLOBAL STATE OWNER)
**Location**: `src/infra/startup-state.ts`  
**Ownership**: Owns global `startupComplete` and `startupError` flags  
**Type**: Edge-safe module (zero Node.js dependencies)

**Mutable State**:
- `startupComplete: boolean` (initial: false)
- `startupError: Error | null` (initial: null)

**Accessors**:
- `isStartupComplete()` → reads startupComplete
- `getStartupError()` → reads startupError
- `setStartupComplete(value)` → mutates startupComplete
- `setStartupError(error)` → mutates startupError

**Who Reads**:
- middleware.ts (every request)
- health endpoint
- login handler

**Who Mutates**:
- startup-orchestrator.ts (ONLY)

---

### 2. startup-orchestrator.ts (ORCHESTRATION LOGIC)
**Location**: `src/infra/startup-orchestrator.ts`  
**Responsibility**: Perform startup checks and mutate global state  
**Type**: Node-runtime-only module

**Mutable Local State**:
- `startupPromise: Promise<boolean> | null`
- `startupResult: { success: boolean; error?: Error } | null`
- `STARTUP_TIMEOUT_MS = 30000`

**Key Logic**:
```
ensureStartupComplete():
  1. Check if startupResult exists
     ✓ If success: return (cached)
     ✗ If failure: throw cached error
  2. Check if startupPromise exists
     ✓ If yes: await Promise.race([promise, timeout])
  3. Start new startupPromise = performStartupChecks()
  4. On success: startupResult = { success: true }; CALL setStartupComplete(true)
  5. On failure: startupResult = { success: false, error }; CALL setStartupError(error)
```

**CRITICAL**: Calls `setStartupComplete(true)` at line 94 upon success

**Who Calls**:
- readiness endpoint (tries to set state before checking DB)
- login handler (before accessing DB)

---

### 3. middleware.ts (STARTUP GATE)
**Location**: `middleware.ts`  
**Responsibility**: Block routes until startup complete  
**Type**: Edge runtime (reads only, no writes)

**Decision Logic**:
```
For EACH request:
  1. Check if route in allowedProbes: [/api/health, /api/readiness, ...]
     ✓ ALLOW (no startup check needed)
  2. Check if route in allowedPublic: [/login, /auth, /api/auth, ...]
     ✓ ALLOW (no startup check needed)
  3. Check isStartupComplete()
     ✓ ALLOW
     ✗ BLOCK 503 SERVICE_UNAVAILABLE
```

**Truth Read**: `isStartupComplete()` from startup-state.ts  
**Race Condition**: Checks flag on EVERY request, but flag only set once during startup

---

### 4. readiness endpoint (GET /api/readiness)
**Location**: `src/app/api/readiness/route.ts`  
**Responsibility**: Report system readiness

**Sequence**:
```
1. CALL ensureStartupComplete()
   - This MUTATES startupComplete global
   - If DB unavailable here, startupError is set
2. GET MonitoringService instance
3. CALL monitoringService.checkReadiness()
   - Independently checks DATABASE_HEALTHY assertion
   - Independently checks QUEUE_HEALTHY assertion
4. Return { is_ready: dbHealthy && queueHealthy, ... }
```

**INCONSISTENCY**: Calls ensureStartupComplete() (sets global flag) but then does INDEPENDENT DB checks

---

### 5. health endpoint (GET /api/health)
**Location**: `src/app/api/health/route.ts`  
**Responsibility**: Report system health

**Sequence**:
```
1. CALL getDbInstance() (initialize DB)
   - Does NOT call ensureStartupComplete()
   - Separate DB initialization path
2. GATE retention cleanup on isStartupComplete()
   - Checks global flag but doesn't set it
3. Do independent DB check: SELECT 1
4. Return health status
```

**INCONSISTENCY**: Does own DB check, independent of startup orchestrator or monitoring service

---

### 6. MonitoringService (READINESS LOGIC)
**Location**: `src/services/monitoring/monitoring.service.ts`  
**Responsibility**: Check database and queue health

**checkReadiness()**:
```
1. Check DATABASE_HEALTHY assertion
   - Runs: SELECT 1 (simple connectivity)
   - Returns: { healthy: boolean, latency_ms: number }
2. Check QUEUE_HEALTHY assertion
   - Runs: SELECT COUNT(*) FROM webhook_events WHERE status IN ('pending', 'retrying')
   - Returns: { healthy: depth < 10000, depth: number }
3. Return: is_ready = database_healthy AND queue_healthy
```

**TRUTH DISCONNECT**: This is a SEPARATE DB check, not synchronized with startup-orchestrator

---

### 7. startup-orchestrator performStartupChecks()
**Location**: `src/infra/startup-orchestrator.ts` lines 56-119

**Checks Performed**:
```
1. checkDatabase(): 
   - Runs: SELECT 1
   - Same as MonitoringService.DATABASE_HEALTHY
2. checkDatabaseSchema():
   - Runs: Check for required tables (workspaces, users, actions, audit_events, webhook_events)
   - More thorough than monitoring service
3. checkConfiguration():
   - Checks env vars: DATABASE_URL, STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET
```

**CRITICAL ISSUE**: Different from readiness checks!
- Startup checks for SCHEMA VALIDITY
- Readiness checks for QUEUE HEALTH
- Neither checks both

---

### 8. login handler (POST /api/auth/login)
**Location**: `src/app/api/auth/login/route.ts`

**Sequence**:
```
1. CALL await ensureStartupComplete()
   - Waits for startup orchestrator to set global flag
   - Throws if startup failed
2. Parse request
3. Rate limit check
4. DB access: await db.user.findUnique()
5. Password verify
6. Create session
7. Emit audit event
8. Set session cookie
```

**TRUTH DEPENDENCY**: Depends on startupComplete flag being set

**RACE CONDITION**: If readiness says not ready, but middleware says startup complete, login tries to access DB and may fail

---

## TRUTH DIVERGENCES IDENTIFIED

| System | Path | DB Check | Schema Check | Queue Check | Sets Flag | Reads Flag |
|--------|------|----------|--------------|-------------|-----------|-----------|
| middleware | /api/readiness request → startup gate | N/A | N/A | N/A | No | Yes (before allowing request) |
| startup-orch | ensureStartupComplete() | SELECT 1 | Checks tables | No | YES | No |
| monitoring | checkReadiness() | SELECT 1 | No | SELECT COUNT() | No | No |
| health endpoint | GET /api/health | SELECT 1 | No | No | No | Yes (for cleanup gate) |
| login handler | POST /api/auth/login | N/A | N/A | N/A | No | Depends on startupComplete |

---

## RACE CONDITIONS IDENTIFIED

### Race 1: Flag Set vs Flag Read
```
Thread A: readiness endpoint calls ensureStartupComplete()
  → Sets startupComplete = true
Thread B: middleware checks isStartupComplete() on concurrent request
  → May see stale value if threads interleave
```
**Status**: Unlikely in single-threaded Node but Promise timing is non-deterministic

### Race 2: Startup Complete But DB Fails
```
Thread A: ensureStartupComplete() succeeds, sets startupComplete = true
Thread B: readiness endpoint then calls checkReadiness(), which fails on queue check
→ startupComplete = true but is_ready = false
→ Middleware allows request but readiness says not ready
```
**Status**: CONFIRMED - Currently happening (readiness_endpoint calls both)

### Race 3: Promise Cache vs Fresh Check
```
Request 1: ensureStartupComplete() runs, creates startupPromise
Request 2: ensureStartupComplete() called while Request 1 still running
  → Returns existing promise (correct)
Request 3: startupPromise completes, sets startupResult
Request 4: ensureStartupComplete() called after completion
  → Returns cached result (correct)
```
**Status**: Cache logic appears correct, but initial failures might not retry properly

### Race 4: Health Endpoint vs Startup Orchestrator
```
GET /api/health calls db.SELECT 1 independently
GET /api/readiness calls ensureStartupComplete() which calls db.SELECT 1
→ Two different DB checks at same time
→ One might succeed, one might fail
→ Inconsistent responses
```
**Status**: CONFIRMED - Different DB check paths

---

## CONSISTENCY VIOLATIONS

### Violation 1: Dual Source of Truth for Readiness
- **startup-orchestrator** owns startupComplete flag
- **monitoringService** owns readiness logic
- **middleware** depends on flag
- **login handler** depends on flag
- **readiness endpoint** depends on BOTH

**Problem**: startupComplete ≠ is_ready (they measure different things)

### Violation 2: Schema vs Queue Checks Diverge
- **Startup checks**: DATABASE_HEALTHY (SELECT 1) + schema validation + env vars
- **Readiness checks**: DATABASE_HEALTHY (SELECT 1) + queue depth
- **They never check the same thing**

### Violation 3: Three Independent DB Checks
1. startup-orchestrator.checkDatabase()
2. monitoringService.DATABASE_HEALTHY
3. health.endpoint SELECT 1
**All three might give different results**

### Violation 4: Startup State Can Be Stale
- Middleware reads startupComplete once at startup
- But DB might fail later
- Middleware never refreshes check
- Requests continue even if DB is now down

---

## TRUTH OWNERSHIP CURRENT STATE

| Component | Owns | Reads | Writes | Syncs With |
|-----------|------|-------|--------|-----------|
| startup-state.ts | startupComplete, startupError | - | No one else | - |
| startup-orchestrator.ts | startupPromise, startupResult | startup-state | YES (setters) | readiness (calls it) |
| middleware.ts | - | startup-state | - | Nothing (one-time check) |
| readiness endpoint | - | monitoring | - | startup-orchestrator (calls it) |
| monitoring service | - | nothing | - | readiness (called by it) |
| health endpoint | - | startup-state (for cleanup) | - | monitoring (separate path) |
| login handler | - | startup-orchestrator | - | middleware (pre-filtered) |

---

## UNIFICATION REQUIRED

**Current State**: 5 different truth sources, 3 independent DB checks, 2 readiness definitions

**Required State**: 1 canonical startup state machine, synchronized readiness, unified DB lifecycle

**Single Source of Truth Must Be**: startup-orchestrator owns startup-state, no other system mutates it

**Readiness Must Be**: Direct reflection of startupComplete flag OR separate state machine, not independent check

**DB Checks Must Be**: Unified in startup-orchestrator, referenced everywhere else

---

## NEXT PHASE: IMPLEMENT STATE MACHINE

See r1_startup_state_machine.md
