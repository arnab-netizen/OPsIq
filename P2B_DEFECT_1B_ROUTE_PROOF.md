# P2B_DEFECT_1B: ROUTE PRE-UPDATE FAILURE ROOT CAUSE

## TASK 1: Failing Test Extraction

**File:** `src/__tests__/p2b/real-route-tests.test.ts`

**Test:** Line 72-138 (SUCCESS PATH: 100% achievement)

### Request Payload
```javascript
const requestBody = {
  id: testItemId,           // UUID created in beforeEach
  status: "done",           // String: "done"
  actualOutcome: 50000,     // Number: 50000 (100% of impactExpected)
};
```

### Mocked Canonical Context
```javascript
const mockRequest = {
  headers: new Map([
    ["content-type", "application/json"],
    ["idempotency-key", randomUUID()],
  ]),
  json: async () => requestBody,
  method: "POST",
};

const canonicalContext: Partial<CanonicalAuthContext> = {
  verifiedActorId: testActorId,        // UUID (testActorId)
  verifiedWorkspaceId: testWorkspaceId, // UUID (testWorkspaceId)
  request: mockRequest as any,
};
```

### Route Invocation
```javascript
const response = await operatorPost(canonicalContext as CanonicalAuthContext);
```

### Expected Assertion
```javascript
expect(dbRecord?.actualOutcome).toBe("success");    // Line 130
```

### Actual Result
```javascript
dbRecord?.actualOutcome === null  // Test fails - actualOutcome is null
```

### Database State After Route
Item is created in beforeEach with:
- status: "in_progress"
- impactExpected: 50000
- actualOutcome: null (not set)

After route execution (expected): actualOutcome should be "success"
After route execution (actual): actualOutcome remains null

---

## TASK 2: POST Route Execution Trace

**File:** `src/app/api/operator/route.ts`

### Route Export (Line 37)
```typescript
export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
```

**CRITICAL FINDING:** The POST handler is wrapped with `withCanonicalEnforcement`, which returns a function expecting:
```typescript
(req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
```

### Inner Handler vs Wrapper Signatures

**Inner Handler (async function):**
- Receives: `ctx: CanonicalAuthContext`
- Expects: `ctx.request` property to access request data
- Accesses: `ctx.request.headers.get("idempotency-key")` at line 48

**Wrapper (returned by withCanonicalEnforcement):**
- Receives: `req: NextRequest, context: { params }`
- Expects: `req.headers.get()` at line 174 of canonical-route-enforcement.ts
- Builds: verifiedContext (CanonicalAuthContext) and calls inner handler at line 608

---

## TASK 3: First Throw Before updateItem

### Execution Path Analysis

**Line 174 (canonical-route-enforcement.ts):**
```typescript
const correlationId = req.headers.get("x-correlation-id") || `corr-${Date.now()}-${Math.random().toString(36).substring(7)}`;
```

**FAILURE POINT:** When test calls `operatorPost(canonicalContext as CanonicalAuthContext)`:
1. canonicalContext is passed as the `req` parameter
2. Wrapper tries to call `req.headers.get("x-correlation-id")`
3. canonicalContext does NOT have a `headers` property at top level
4. Wrapper tries to access: `canonicalContext.headers` → undefined
5. TypeError thrown: "Cannot read property 'get' of undefined"
6. Test catches error silently at line 114-116
7. updateItem() never called
8. Database never updated
9. actualOutcome remains null

---

## TASK 4: Proof Using Values

### Test Payload Values
```
actualOutcomeValue: 50000
impactExpected: 50000
classification result expected: "success" (50000 / 50000 = 100%)
outcomeNotes: not present (not required for success)
item id used: testItemId (valid UUID)
workspace id used: testWorkspaceId (valid UUID)
actor id used: testActorId (valid UUID in request, but not in Next.js context)
item loaded from DB: YES (exists)
```

### Error Trigger Condition

**Before:** Test calls wrapped handler with canonicalContext as req parameter
```typescript
const response = await operatorPost(canonicalContext as CanonicalAuthContext);
```

**Actual Parameters to Wrapper:**
```
req = canonicalContext (CanonicalAuthContext)  ← WRONG TYPE
context = undefined                             ← MISSING
```

**Expected Parameters to Wrapper:**
```
req = NextRequest                               ← Should be this
context = { params: Promise<...> }             ← Should be this
```

**Wrapper Code (line 174):**
```typescript
const correlationId = req.headers.get("x-correlation-id") || ...
                      ^^^^^^^^^^^^
                      canonicalContext.headers = undefined
                      → TypeError: Cannot read property 'get' of undefined
```

---

## TASK 5: Root Cause Classification

**CLASSIFICATION: B - Test context missing required auth/workspace field**

More precisely: **Test is passing the wrong parameter type to the wrapped handler**

### Evidence

1. **Wrapper Signature:** `(req: NextRequest, context: { params }) => Promise<NextResponse>`
2. **Test Call:** `operatorPost(canonicalContext as CanonicalAuthContext)`
3. **Type Mismatch:** CanonicalAuthContext ≠ NextRequest

### Why actualOutcome is null

The wrapper tries to extract headers from the first parameter at line 174 of canonical-route-enforcement.ts:
```typescript
const correlationId = req.headers.get("x-correlation-id") || ...
```

When `req` is a CanonicalAuthContext (not a NextRequest):
- `req.headers` is undefined
- `undefined.get()` throws TypeError
- Error is caught silently
- Inner handler never executes
- updateItem never called
- Database never updated
- actualOutcome stays null

### Why the test was designed this way

The test's comment says "REAL: route invocation" but the test is actually attempting to:
1. Bypass the wrapper's auth/session verification
2. Call the inner handler directly by injecting a CanonicalAuthContext
3. Use the mock request embedded in the context

But the actual behavior is:
1. Test calls the wrapped handler (not the inner handler)
2. Wrapper's first line (line 174) fails because it expects NextRequest, gets CanonicalAuthContext
3. Error is silently caught
4. Test fails because database wasn't updated

---

## Summary

| Aspect | Value |
|--------|-------|
| **File** | src/app/api/operator/route.ts |
| **Line** | 37 (export), triggered by wrapper line 174 |
| **Exact Condition** | `req.headers.get()` where req is CanonicalAuthContext (undefined.get()) |
| **Exact Fix Location** | Test must either: (A) call inner handler directly, or (B) provide NextRequest to wrapped handler |
| **Production Code or Test** | **TEST IS WRONG** - Calling wrapped handler with wrong parameter type |
| **Tests Fixed if Corrected** | 4-8 tests (all actualOutcome persistence tests) |

---

## Root Cause Proof

**Line 174 of src/lib/canonical-route-enforcement.ts (inside wrapped function):**
```typescript
const correlationId = req.headers.get("x-correlation-id") || `corr-${Date.now()}-${Math.random().toString(36).substring(7)}`;
```

When test calls: `await operatorPost(canonicalContext as CanonicalAuthContext)`
- Parameter `req` = canonicalContext
- Expression becomes: `canonicalContext.headers.get("x-correlation-id")`
- canonicalContext.headers = undefined
- Result: TypeError("Cannot read property 'get' of undefined")
- Caught by: test's try-catch at line 114-116
- Effect: updateItem() never called, actualOutcome never persisted

**Why actualization never happens:**
The wrapper never reaches line 608 where it calls the inner handler:
```typescript
const result = await handler(verifiedContext, params);  // Line 608 - Never reached
```

Because the wrapper fails at line 174, before any auth verification or context building completes.

---

## Fix Classification

**The bug is in the TEST, not production code**

The test should either:

**Option A:** Call the inner handler after manually verifying context
- Would require access to inner handler (not exported)
- Would bypass wrapper's readiness checks

**Option B:** Call wrapped handler with proper NextRequest
- Would require setting up real Next.js context or better mock
- Would require proper session/auth setup
- Would properly test the full execution chain

**Current test design:** Attempts Option A (bypass wrapper) but accidentally calls Option B (wrapped handler) with wrong parameters, causing silent failure.
