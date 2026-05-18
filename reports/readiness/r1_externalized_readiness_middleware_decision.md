# R1 Middleware Decision — Edge-Safe Implementation

**Date**: 2026-05-18  
**Decision**: Option 1 - Middleware Does NOT Check Readiness

---

## DECISION: OPTION 1

Middleware removes all readiness checks and focuses solely on routing.

```typescript
// middleware.ts (Edge Runtime - Zero Node Dependencies)

export function middleware(request: NextRequest) {
  const pathname = new URL(request.url).pathname;
  
  // ALWAYS allow these (no readiness checks)
  const alwaysAllow = [
    "/login",
    "/auth",
    "/api/auth",
    "/api/health",
    "/api/readiness",
    "/_next",
    "/public"
  ];
  
  if (alwaysAllow.some(p => pathname.startsWith(p))) {
    return NextResponse.next();  // Pass through
  }
  
  // For everything else, pass through to handlers
  // Handlers will enforce readiness/auth as needed
  return NextResponse.next();
}
```

**Benefits**:
- ✓ Zero Node.js module imports
- ✓ Edge Runtime safe
- ✓ Super lightweight
- ✓ No context isolation issues
- ✓ No HTTP calls
- ✓ No latency penalty
- ✓ Readiness enforced in Node layer (where it belongs)

---

## WHY NOT OTHER OPTIONS

### Option 2: HTTP Readiness Endpoint
**Why rejected**:
- Adds internal HTTP call to every protected request
- Latency penalty (N ms per request)
- Recursion risk (if endpoint fails, middleware fails)
- Deadlock risk (if startup hangs, endpoint hangs, middleware hangs)
- More complex, more failure modes
- Violates "keep middleware lightweight"

### Option 3: Signed Readiness Cookie
**Why rejected**:
- Cookie must be refreshed by Node handler
- But handler doesn't know when to refresh
- Would need to refresh on every request
- Adds overhead to every handler
- Still requires handler-side enforcement

---

## PROPER SEPARATION OF CONCERNS

### Middleware Layer (Edge Runtime)
**Responsibility**: Routing and basic filtering
**Can do**: 
- Route public vs protected
- Authentication (session cookie validation)
- Basic security checks

**Cannot do**:
- DB access (no Prisma)
- Startup state checks
- Business logic validation

**Does NOT do**:
- Readiness checks

### Node Handler Layer
**Responsibility**: Business logic enforcement
**Can do**:
- Readiness verification
- DB access
- Startup checks
- Complex validation

**Does**:
- Check readiness before protected operations
- Return 503 if not ready
- Enforce business rules

---

## READINESS ENFORCEMENT IN HANDLERS

Protected route handlers MUST check readiness:

```typescript
// Example: Protected API handler
export const GET = async (request: NextRequest) => {
  // Step 1: Check readiness
  const status = await getStartupStatus();
  if (status.status !== 'READY') {
    return NextResponse.json(
      { error: 'Service starting up' },
      { status: 503 }
    );
  }
  
  // Step 2: Check authentication
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  // Step 3: Do the work
  // ...
};
```

---

## SPECIAL CASE: AUTH LOGIN

Auth login endpoint doesn't require readiness because:
- It CAN trigger startup
- It writes session to DB
- It doesn't access business data
- It's the gate to ready state

```typescript
export const POST = async (request: NextRequest) => {
  // DON'T check readiness here
  // This endpoint can initialize startup if needed
  
  // Step 1: Ensure startup (may trigger it)
  await ensureStartupComplete();
  
  // Step 2: Process login
  // ...
};
```

---

## RECOMMENDED IMPLEMENTATION

1. **middleware.ts**: Remove ALL readiness/DB imports
   - Just route public routes
   - Pass everything else to handlers

2. **Protected handlers**: Check readiness at top
   - Before any protected operation
   - Return 503 if not ready

3. **Public handlers**: Don't check readiness
   - /api/health, /api/readiness, /login work anytime

4. **DB cleanup**: Remove middleware's startup-status import

---

## FINAL DECISION

**Implement Option 1**: Middleware stays Edge-safe and lightweight.

Readiness enforcement belongs in Node handlers, not Edge middleware.

This is simpler, cleaner, and production-correct.
