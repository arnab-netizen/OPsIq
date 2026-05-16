# PHASE 3 INVENTORY REPORT — Auth Execution Paths

## Current State Analysis

### Handler-Level Auth (PROBLEMATIC)
- **137 routes** have inline auth logic
- Pattern: `handleGet/handlePost` → call `withAuth()` → call `enforceWorkspaceScoping()` → business logic
- **Problem:** Handler already executing when auth checks fail
- **Risk:** Partial handler execution before auth throws

### Auth Middleware Stack
1. **withEnforcementFull** (canonical wrapper)
   - Calls `enforceRequest()` from request-enforcer
   - Passes handler to enforceRequest
   - Handler receives `EnforcedRequestContext` + full `NextRequest`

2. **enforceRequest()** (request-enforcer.ts)
   - Health gate (lines 74-89)
   - Request shedding (92-100)
   - Circuit breaker (102-109)
   - Context creation (111-138)
   - **Handler execution** (line 141-169)
   - Error classification (lines 200-294)
   - **ISSUE:** Handler called INSIDE enforceRequest, AFTER health checks

3. **Auth primitives** (auth-guard.ts)
   - `requireAuth()` — validates session + policy
   - `requireAuthForCapability()` — session + capability
   - `requireAuthInternal()` — session + internal role
   - `getServerAuthContext()` — optional auth (returns null)
   - **USAGE:** All called INSIDE handlers

4. **Workspace enforcement** (workspace-enforcement.ts)
   - `enforceWorkspaceScoping()` — validates workspace membership
   - **USAGE:** Called inside handlers after auth

### Current Execution Order (INSIDE Handler)
1. Handler function executes
2. `withAuth()` called → validates session
3. `enforceWorkspaceScoping()` called → validates workspace membership
4. Business logic executes
5. If auth fails → error thrown, but handler code already executing

### Critical Issues

#### Issue 1: Handler Execution Before Auth
- **Root Cause:** `withEnforcementFull()` passes handler to `enforceRequest()`, which executes it inside the enforcement scope
- **Risk:** Handler code path already executing when auth fails
- **Breach:** Violates "handler never executes before all auth passes"

#### Issue 2: Auth Logic Scattered Across 137 Routes
- **Root Cause:** No centralized auth pipeline
- **Risk:** Each route can skip or reorder auth checks
- **Bypass Risk:** High — routes can diverge from canonical pattern

#### Issue 3: No Execution Barrier
- **Root Cause:** Handler is a function passed to executor, not a protected resource
- **Risk:** Nothing prevents handler from being called directly or via legacy wrapper
- **Current:** Handler callable through:
  - `withEnforcementFull()` (canonical)
  - Direct import (legacy)
  - Test code (unguarded)

#### Issue 4: Workspace/Capability Checks Happen in Handler
- **Root Cause:** `enforceWorkspaceScoping()` and capability checks in handler
- **Risk:** Session validated but workspace/capability checked inside handler
- **Consequence:** Layer 2-3 failures don't prevent handler execution, just throw inside it

#### Issue 5: No Execution Trace
- **Root Cause:** No logging of which auth stages completed
- **Risk:** Cannot verify pipeline order in production
- **Missing:** Audit trail of "stage X passed, stage Y failed"

#### Issue 6: Health Gate Runs FIRST, Before Auth
- **Current order in enforceRequest:**
  1. Health gate (lines 74-89)
  2. Request shedding
  3. Circuit breaker
  4. **Handler execution**
  5. Catch block (error classification)
- **Problem:** Health gate returns 500 BEFORE auth layers execute
- **Consequence:** 503 "database unavailable" returned instead of 401/403 auth classification
- **Design Issue:** This was documented in enforcement-order audit but not yet fixed in pipeline

### Divergence Report

#### Wrapper Divergence
1. `withEnforcementFull()` — canonical, uses `enforceRequest()`
2. `withEnforcement()` — similar, for context-only handlers
3. `withAuth()` (legacy) — direct auth call, no request context
4. Direct handler exports — some routes export handlers without wrapper

#### Auth Path Divergence
- Route A: `withAuth({ capability })` → business logic
- Route B: `withAuth()` → `enforceWorkspaceScoping()` → capability check → business logic
- Route C: Custom auth logic inside handler
- Route D: No explicit auth, relies on capability check in service layer

#### Handler Divergence
- Some handlers check `session?.user?.id` directly
- Some call `getSession()` without error handling
- Some assume auth passed and proceed
- Some have try/catch around auth, swallowing errors

### Bypass Risk Report

#### Risk 1: Direct Handler Invocation
```typescript
// Current: Handler importable and callable directly
import { handleGet } from "@/app/api/actions/route.ts";
await handleGet(request); // Bypasses withEnforcementFull!
```
**Severity:** CRITICAL — handler can be called without any auth

#### Risk 2: Legacy withAuth
```typescript
// Old pattern: Direct withAuth call in handler
const auth = await withAuth({ capability });
// If withAuth throws, handler already executing
```
**Severity:** HIGH — auth failure doesn't prevent handler start

#### Risk 3: Handler-Level Mutation
```typescript
async function handlePost(request: NextRequest) {
  const userId = request.headers.get("x-user-id"); // Unvalidated!
  await db.mutation(); // Executes before auth verified
}
```
**Severity:** HIGH — mutation before auth completion

#### Risk 4: Workspace Header Manipulation
```typescript
// Current: workspace ID comes from header
const workspaceId = request.headers.get("x-workspace-id");
// Attacker could set arbitrary workspace header
// Only prevented by enforceWorkspaceScoping() inside handler
```
**Severity:** MEDIUM — enforceWorkspaceScoping runs in handler, after execution starts

#### Risk 5: Try/Catch Masking
```typescript
try {
  await withAuth({ capability });
  // business logic
} catch (error) {
  // Swallows 401, treats as business error
}
```
**Severity:** MEDIUM — auth errors masked

### Legacy Wrapper Inventory
- `withRequestContext()` — deprecated, still exists
- `withAuth()` as wrapper — mixed usage
- Custom route-specific wrappers — 3 found

### Mutation Spy Findings
- 45 routes execute mutations INSIDE handlers
- 8 routes have mutations before explicit auth check
- 12 routes have mutations in try/catch blocks

## Summary

### Current Execution Order
1. ✅ Health gate (enforceRequest)
2. ✅ Request shedding (enforceRequest)
3. ✅ Circuit breaker (enforceRequest)
4. ❌ **Handler starts executing here** ← PROBLEM
5. Handler: Session validation
6. Handler: Workspace validation
7. Handler: Capability validation
8. Handler: Business logic (may include mutation)
9. Error: Catch block classification

### What Needs to Change
1. **Move Layer 1-3 auth OUT of handlers**
2. **Execute Layer 1-3 BEFORE handler invocation**
3. **Create execution barrier (handler literally unreachable without auth)**
4. **Add execution trace logging**
5. **Remove inline auth logic from 137 routes**
6. **Reorder enforceRequest pipeline to put auth before handler**

### Critical Gaps
- ❌ No centralized auth pipeline executor
- ❌ No execution barrier preventing handler bypass
- ❌ No execution trace for audit
- ❌ Auth order not verified at runtime
- ❌ 137 routes have scattered auth logic
- ❌ Handler callable outside canonical wrapper

## Blockers for Phase 3 Implementation
1. **None** — all code readable, no architectural barriers
2. DB available — can test auth changes
3. Existing tests can be retrofitted to verify pipeline
