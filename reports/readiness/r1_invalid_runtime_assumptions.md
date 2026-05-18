# R1 Invalid Runtime Assumptions — PHASE A

**Date**: 2026-05-18  
**Purpose**: Document assumptions that DO NOT HOLD in production

---

## ASSUMPTION 1: globalThis is Shared Across Runtime Contexts

**Assumption**: Setting `globalThis.__opsiq_startup_state = READY` makes it visible to all code

**Reality**: ✗ INVALID
- Next.js bundles middleware separately from route handlers
- Separate bundles → separate module instances → separate globalThis objects
- Middleware's globalThis ≠ Route Handler's globalThis
- Even within same process, isolation can occur

**Evidence**:
```
[STARTUP-STATE] First initialization             (middleware loads)
[STARTUP-STATE] setStartupState: → READY         (instrumentation sets)
[STARTUP-STATE] Reloaded, preserving: READY      (middleware sees READY)
[STARTUP-STATE] First initialization AGAIN       (route bundle loads independently)
[STARTUP-STATE] isStartupComplete: NOT_STARTED   (middleware now sees false!)
```

**Production Risk**: CRITICAL
- Horizontal scaling: Each process has separate globalThis
- Worker threads: Each worker has separate globalThis
- Load balancers: Different instances don't share memory at all

---

## ASSUMPTION 2: Module Singletons are Authoritative

**Assumption**: `export let startupComplete = false` creates a global singleton

**Reality**: ✗ INVALID
- Module imports are per-bundle, not per-process
- Next.js can bundle the same module multiple times in different contexts
- "Singleton" only means one instance per import chain, not globally

**Evidence**:
- startup-state.ts loaded 3+ times in single process
- Each load gets fresh variable initialization
- globalThis check prevented reset, but state sharing still failed

**Production Risk**: HIGH
- Bundler variations between dev and production
- Different build toolchains may bundle differently
- No guarantee of singleton behavior

---

## ASSUMPTION 3: Middleware Shares Memory with Route Handlers

**Assumption**: If middleware sets a flag, handlers can read it

**Reality**: ✗ INVALID
- Middleware runs in isolated context (Next.js Edge Runtime or separate Node context)
- Route handlers run in different context
- Contexts don't share memory
- Even async promises across contexts can't guarantee state visibility

**Evidence**:
- Middleware checks `isStartupComplete()`
- Route instrumentation sets state to READY
- Middleware still sees false on next call
- This is a CONTEXT isolation issue, not a code issue

**Production Risk**: CRITICAL
- Core architectural limitation of Next.js
- No fix possible without removing middleware startup gate entirely
- Affects any middleware-to-handler state coordination

---

## ASSUMPTION 4: Edge Runtime and Node Runtime Share Startup State

**Assumption**: Middleware (Edge) and handlers (Node) can coordinate startup via globals

**Reality**: ✗ INVALID
- Edge Runtime runs in V8 isolates with NO access to Node.js APIs
- Node Runtime runs with full Node.js access
- They are fundamentally isolated environments
- Even if on same process, they don't share state safely

**Evidence**:
- Middleware can't use Prisma (Node module)
- Middleware can't use getDbInstance() (requires Node)
- Startup-state must be Edge-safe (no Node dependencies)
- Any state shared with Edge Runtime must work in isolate

**Production Risk**: HIGH
- Edge Runtime expansion in Next.js future versions
- Middleware running in true edge locations (CDN) won't share memory with origin

---

## ASSUMPTION 5: Startup Promises are Globally Synchronized

**Assumption**: `let startupPromise = performStartupChecks()` coordinates all callers

**Reality**: ✗ INVALID
- Promise coordination only works within same execution context
- Different bundled contexts have different promise objects
- Promise resolution in one context doesn't notify another
- Race conditions between startup completion and context isolation

**Evidence**:
- ensureStartupComplete() in instrumentation sets READY
- ensureStartupComplete() in login handler sees NOT_STARTED
- Same code, different contexts, different promises

**Production Risk**: HIGH
- First request in handler might retry startup unnecessarily
- Multiple handlers might each start their own startup sequence
- No guarantee of single-flight startup across all code

---

## ASSUMPTION 6: Timeout Protection Works Across Boundaries

**Assumption**: 30s timeout in startup-orchestrator prevents infinite hangs

**Reality**: PARTIAL
- Timeout works within single context
- If context isolation occurs, timeout doesn't apply to other contexts
- Partial startup (some contexts ready, others not) is possible
- Handler might timeout differently than middleware

**Evidence**:
- Startup succeeds in instrumentation (sets READY)
- But handler sees fresh initialization → might retry/timeout
- Each context has independent timeout

**Production Risk**: MEDIUM
- Cascading timeouts across multiple contexts
- Uneven startup completion across instances

---

## ASSUMPTION 7: Module-Load Order is Deterministic

**Assumption**: Code executes in predictable initialization order

**Reality**: ✗ INVALID
- Next.js bundler can reorder module loads
- Development vs production builds load modules differently
- Turbopack vs Webpack behave differently
- Dynamic imports don't guarantee order

**Evidence**:
- Module initializes, then resets, then initializes again
- Order was not predictable before globalThis fix
- Order not guaranteed going forward

**Production Risk**: MEDIUM
- Different module loads in different environments
- Initialization side effects can execute in unexpected order

---

## ASSUMPTION 8: Process-Local State Survives Restart

**Assumption**: Once startup is complete, it stays complete until next restart

**Reality**: ✗ PARTIAL
- State survives until process crashes or reload
- In distributed systems (Kubernetes, Lambda), process restart is frequent
- On restart, state resets to NOT_STARTED
- Multiple instances have no coordinated startup

**Evidence**:
- globalThis state exists only in memory
- On `npm start` restart, all state is lost
- Multiple processes running simultaneously have independent state
- No durable record of startup completion

**Production Risk**: CRITICAL
- Horizontal scaling: N processes, N independent startup states
- Kubernetes: Pods restart frequently, state lost each time
- Load balancer: Different backends at different startup states
- Inconsistent responses to /api/readiness

---

## ASSUMPTION 9: In-Memory Startup State is Production-Safe

**Assumption**: Keeping startup state in memory is acceptable for production

**Reality**: ✗ INVALID for distributed systems, VALID only for single-instance dev

**Problems**:
1. No durability → lost on restart
2. No sharing → multiple instances disagree
3. No auditability → no record of startup attempts
4. No rollback → can't invalidate startup without code change
5. No inspection → can't debug startup state in production

**Production Risk**: CRITICAL
- Production deployments are rarely single-instance
- Kubernetes native deployments scale horizontally
- Stateless architecture is architectural requirement
- In-memory state violates stateless design principle

**Evidence**:
- OPSIQ currently requires single-instance or hack to sync
- Horizontal scaling would create 503s on half the instances
- Restart causes all instances to think they're starting up
- Load balancer gets inconsistent ready responses

---

## SUMMARY: ALL ASSUMPTIONS INVALID

| Assumption | Valid? | Risk | Impact |
|-----------|--------|------|--------|
| globalThis shared | ✗ | CRITICAL | Middleware sees different state than handlers |
| Module singletons | ✗ | HIGH | Multiple instances of "singleton" possible |
| Memory shared across contexts | ✗ | CRITICAL | Core architectural issue with Next.js |
| Edge/Node share state | ✗ | HIGH | Fundamentally isolated runtimes |
| Promises globally sync | ✗ | HIGH | Each context runs startup independently |
| Timeout protects all | ✗ | MEDIUM | Per-context timeouts, no global protection |
| Module order deterministic | ✗ | MEDIUM | Bundler reorders unpredictably |
| State survives restart | ✗ | CRITICAL | Memory lost on process restart |
| In-memory state is production-safe | ✗ | CRITICAL | Requires single-instance, breaks scaling |

---

## IMPLICATIONS FOR CURRENT ARCHITECTURE

**Current Code**: Uses globalThis as startup truth source
**Reality**: Not shared between middleware and handlers in production
**Outcome**: 
- Middleware returns 503 on protected routes
- Readiness endpoint says ready, but requests still blocked
- Contradiction indicates invalid assumptions

**Root Cause**: Trying to use memory as distributed system truth

**Solution Required**: Move startup truth OUT of memory into something durable and readable by all contexts

---

## NEXT: Design Durable Readiness

See `r1_durable_readiness_design.md`
