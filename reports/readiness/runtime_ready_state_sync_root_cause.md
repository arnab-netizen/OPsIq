# Runtime Ready State Sync Root Cause Analysis

## Issue Summary
- `/api/readiness` succeeds with `is_ready: true`
- Middleware still blocks routes with 503 "Startup checks in progress"
- `/login` returns 503
- Concurrent requests cause startupPromise to reset after timeout

## Code Path Analysis

### 1. Middleware State Check
**File:** `middleware.ts` (Edge Runtime)
```typescript
if (allowedBeforeStartup.includes(pathname)) return NextResponse.next();
if (!isStartupComplete()) return 503;
return NextResponse.next();
```
**Problem:** Reads `isStartupComplete()` from `startup-state.ts`

### 2. Startup State Module
**File:** `src/infra/startup-state.ts`
```typescript
export let startupComplete = false;
export function isStartupComplete(): boolean { return startupComplete; }
export function setStartupComplete(value: boolean): void { startupComplete = value; }
```
**Problem:** Module-level mutable variable. No import-time initialization. Edge middleware reads the export before Node orchestrator sets it.

### 3. Orchestrator Promise Management
**File:** `src/infra/startup-orchestrator.ts`
```typescript
let startupPromise: Promise<boolean> | null = null;

export async function ensureStartupComplete(): Promise<void> {
  if (startupPromise) {
    await Promise.race([startupPromise, timeout]);
    return;
  }
  startupPromise = performStartupChecks();
  try {
    await Promise.race([startupPromise, timeout]);
  } catch (error) {
    startupPromise = null;  // RESET ON TIMEOUT
    throw error;
  }
}
```
**Problems:**
1. Promise.race times out on concurrent calls (race flips coin)
2. Timeout resets startupPromise = null
3. Each new call retries orchestration
4. Multiple in-flight orchestrations possible
5. setStartupComplete() called only once per successful orchestration
6. Middleware never knows if orchestration succeeded or is retrying

### 4. Readiness Endpoint State
**File:** `src/app/api/readiness/route.ts`
```typescript
export const GET = async () => {
  try {
    await ensureStartupComplete();  // Explicitly triggers orchestrator
  } catch (error) {
    logger.error("Startup checks failed", { error });
  }
  const monitoringService = getMonitoringServiceInstance();
  const readinessCheck = await monitoringService.checkReadiness();
  return readinessCheck.is_ready;
};
```
**Truth:** Readiness endpoint ALWAYS calls orchestrator, so it ALWAYS gets fresh state.

### 5. Middleware vs Readiness Endpoint Timing
```
Request 1: GET /my-day
  → middleware.ts: isStartupComplete() = false (still uninitialized)
  → BLOCKS with 503

Request 2: GET /api/readiness
  → readiness route: calls ensureStartupComplete()
  → orchestrator runs, sets setStartupComplete(true)
  → readiness returns is_ready: true

Request 3: GET /my-day  
  → middleware.ts: isStartupComplete() = true NOW
  → should allow through
  → BUT STILL RETURNS 503 ?
```

## Root Causes (Ranked)

### 1. PRIMARY: Orchestrator Promise Race + Reset
**Severity:** CRITICAL

Multiple concurrent requests trigger multiple `ensureStartupComplete()` calls. Each Promise.race can timeout independently. When one times out and resets `startupPromise = null`, it allows the next request to retry from scratch.

**Timeline:**
1. Request A calls ensureStartupComplete() → startupPromise = performStartupChecks()
2. Request B calls ensureStartupComplete() → finds startupPromise, awaits it with timeout
3. Promise.race times out on Request B → throws error → resets startupPromise = null
4. Request A never completes orchestration (hung in Promise.race)
5. performStartupChecks() may still be running but nobody is awaiting it
6. setStartupComplete() never gets called

### 2. SECONDARY: Middleware Cannot Observe Node-Only State
**Severity:** CRITICAL

Middleware is Edge Runtime. It cannot:
- Wait for Node async operations
- Reliably observe module state set asynchronously by Node runtime
- Execute startup checks itself

When middleware reads `isStartupComplete()` on first request, the module variable is still `false` because Node orchestrator hasn't run yet.

### 3. TERTIARY: npm start ENV Loading
**Severity:** HIGH

Production build (`npm start`) does not load `.env.local`. 
- Dev: `npm run dev` loads .env.local via Next.js dev server
- Prod: `npm start` uses built .next/ and only loads `.env` (not `.env.local`)
- Result: DATABASE_URL not available in production

## Consequences

1. **First request to any route:** Returns 503 because startup hasn't run yet
2. **Readiness endpoint:** Explicitly triggers orchestrator, so eventually succeeds
3. **Other routes:** Middleware blocks them if it checks before readiness endpoint ran
4. **Promise resets:** Infinite retries possible if orchestration keeps timing out
5. **Production mode:** Fails immediately because DATABASE_URL is missing

## Verification Checklist

- [x] Middleware imports startup-state (Edge-safe)
- [x] startup-state is module-level variable initialized to false
- [x] orchestrator can reset startupPromise on timeout
- [x] concurrent calls can race and timeout independently
- [x] readiness endpoint always calls ensureStartupComplete explicitly
- [x] npm start missing DATABASE_URL in logs
- [x] no synchronization mechanism between middleware and orchestrator

