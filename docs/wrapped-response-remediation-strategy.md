# Wrapped-Response Violation Remediation Strategy

## Overview

This document outlines the strategy for remediating wrapped-response violations in the codebase. A "wrapped-response violation" occurs when a route handler returns `Response.json()` or `NextResponse.json()` instead of returning plain objects or using the canonical response envelope.

## Phase 1: Success-Only File-Level Remediation (COMPLETED)

**Scope**: Files where ALL Response.json() calls are success-only (no custom status codes).

**Files remediated**:
- `src/app/api/auth/logout/route.ts` ✓
- `src/app/api/users/route.ts` ✓

**Result**: 2 files fully removed from baseline.

**Constraint**: This approach is exhausted. Most remaining routes contain idempotency patterns, error handling, or multiple handlers with varying requirements.

---

## Phase 2: Canonical JSON Response Envelope (CURRENT)

### The Problem

Most remaining violations (53/55) have one or more of:

1. **Idempotency patterns**: Need to return cached responses with status 200, 201, etc.
   ```typescript
   // OLD (violation)
   return Response.json(cachedResult, { status: idempotencyCheck.cachedResponse.status });
   
   // NEW (using envelope)
   return canonicalJson(cachedResult, { status: idempotencyCheck.cachedResponse.status });
   ```

2. **Error handling**: Need to return error responses with custom status codes (400, 404, 500)
   ```typescript
   // OLD (violation)
   return Response.json({ error: "Validation failed" }, { status: 400 });
   
   // NEW (using envelope)
   return canonicalJson({ error: "Validation failed" }, { status: 400 });
   ```

3. **Create operations**: Need to return 201 Created
   ```typescript
   // OLD (violation)
   return Response.json(newResource, { status: 201 });
   
   // NEW (using envelope)
   return canonicalJson(newResource, { status: 201 });
   ```

4. **Multiple handlers**: Some routes have mixed GET (simple) and POST (complex) handlers
   ```typescript
   // GET returns plain object → 200 (works)
   export const GET = withCanonicalEnforcement(async (ctx) => {
     return { data: await getData() };
   });
   
   // POST needs custom status → use envelope
   export const POST = withCanonicalEnforcement(async (ctx) => {
     return canonicalJson(newData, { status: 201 });
   });
   ```

### The Solution: Canonical JSON Response Envelope

The wrapper now recognizes a branded envelope object:

```typescript
interface CanonicalJsonResponse {
  readonly __canonicalJsonResponse: true;
  readonly body: any;
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
}

// Helper function
export function canonicalJson(
  body: any,
  options: { status: number; headers?: Record<string, string> }
): CanonicalJsonResponse
```

**Wrapper behavior**:

- If handler returns `canonicalJson(...)` envelope:
  - Extract `body`, `status`, `headers`
  - Return `NextResponse` with specified status
  - Preserve safe headers (allowlisted only)
  - Add correlation-id and trace-id (override envelope if needed)

- If handler returns plain object:
  - Status defaults to 200
  - Existing behavior unchanged

- If handler throws error:
  - Status determined by error classification
  - Existing behavior unchanged

### Header Safety

Only allowlisted headers can be specified:
- `cache-control`
- `etag`
- `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`
- `x-custom-header`

Explicitly blocked:
- `set-cookie` (use session middleware)
- `authorization`, `proxy-authorization`
- Any other sensitive headers

### Type Safety

- No `as any` casts
- `isCanonicalJsonResponse()` type guard for cross-module boundaries
- TypeScript `readonly` properties prevent mutation at type level
- Headers frozen at runtime with `Object.freeze()`

---

## Phase 2 Implementation Plan

### Step 1: Create Envelope Implementation ✓
- `src/lib/canonical-json-response.ts`
  - `canonicalJson(body, options)` function
  - `isCanonicalJsonResponse(value)` type guard
  - Header validation (safe-list + block-list)

### Step 2: Update Wrapper ✓
- `src/lib/canonical-route-enforcement.ts`
  - Import `isCanonicalJsonResponse`
  - In success path: detect envelope, extract status/headers
  - Preserve error handling behavior
  - Update trace logging with actual response status

### Step 3: Add Tests ✓
- `src/lib/__tests__/canonical-wrapper-contract.test.ts`
  - 30+ test cases covering:
    - Envelope creation and validation
    - Type guard behavior
    - Success path status preservation
    - Error handling unchanged
    - Header safety (allowlist/blocklist)
    - Type safety (no unsafe casts)
    - Immutability guarantees

### Step 4: Update Routes (Future)
For each route with wrapped-response violations:

1. **Success-only paths**: Replace `Response.json(body)` with `return body`
2. **Status 201 paths**: Replace `Response.json(body, { status: 201 })` with `return canonicalJson(body, { status: 201 })`
3. **Status 400+ paths**: Replace `Response.json(error, { status: 400 })` with `return canonicalJson(error, { status: 400 })`
4. **Idempotency paths**: Replace `Response.json(cached, { status: cachedStatus })` with `return canonicalJson(cached, { status: cachedStatus })`

### Remediation Priority

Routes should be remediated in this order:

1. **Single-handler simple routes** (1-2 Response.json calls total)
   - Example: `app/api/public/engagements/route.ts` (GET only)
   - Impact: High (removes from baseline immediately)

2. **Idempotency-only routes** (only cached response handling)
   - Example: `app/api/evidence/[evidenceId]/validate/route.ts`
   - Impact: Medium (pattern-based fix)

3. **Error handling routes** (validation + success)
   - Example: `app/api/findings/route.ts`
   - Impact: Medium (widespread pattern)

4. **Multi-handler routes** (GET + POST/PATCH)
   - Example: `app/api/engagements/[engagementId]/route.ts`
   - Impact: Low (must fix all handlers in file)

### Scanner Updates (NOT IMPLEMENTED YET)

The wrapped-response scanner should:

1. Continue to track violations by file
2. Classify violations as before:
   - `success_only_response_return`
   - `custom_status_response_return`
   - `custom_header_or_cookie_response_return`
   - `redirect_stream_file_response_return`

3. For Phase 2 remediation:
   - Verify routes use `canonicalJson()` instead of `Response.json()`
   - Track remediation status per route
   - Report remaining non-remediable violations (redirects, streams, files)

---

## Phase 3: Non-Remediable Violations

Some violations cannot be remediated using the canonical envelope:

### Redirect Responses
Handlers that need to return HTTP redirects:
- Solution: Throw `RedirectError` that wrapper converts to redirect response
- Status: Not implemented (low priority)

### File/Stream Responses
Handlers that serve files or streams:
- Solution: Use withEnforcementFull wrapper instead
- Status: Identified but intentional (outside scope)

### Payment/Webhook Routes
Routes for Stripe webhooks or payment processing:
- Status: Out of scope (webhook signature validation prevents misuse)

---

## Validation

Each phase should include:

1. **TypeScript**: `npx tsc --noEmit`
2. **Build**: `npm run build`
3. **Tests**: `npm test -- canonical-wrapper-contract`
4. **Scanner**: `npm test -- wrapped-handlers-scanner`
5. **Ratchet**: `npm run audit:wrapped-handlers:ratchet`
6. **Smoke**: Run production smoke tests (dashboard, drift, backfill routes)

---

## Success Criteria

### Phase 2 Complete When:

- [ ] Wrapper recognizes and handles canonical JSON envelope
- [ ] All wrapper tests pass (type safety, header validation, status preservation)
- [ ] No regression in error handling or auth
- [ ] Production smoke tests pass
- [ ] TypeScript compiles without errors
- [ ] No "as any" casts introduced
- [ ] No "|| true" used
- [ ] Headers are validated and allowlisted only

### Future Phase 2 Route Remediation:

- [ ] Routes updated to use `canonicalJson()` instead of `Response.json()`
- [ ] Baseline violations reduced to single-digit count
- [ ] Remaining violations are non-remediable (redirects, streams)
- [ ] All tests continue to pass
- [ ] Production smoke tests pass

---

## Examples: Before and After

### Example 1: Idempotency Pattern

**Before**:
```typescript
export const POST = withCanonicalEnforcement(async (ctx) => {
  const idempotencyKey = ctx.request!.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json({ error: "idempotency-key required" }, { status: 400 });
  }

  const check = await checkIdempotencyKey(...);
  if (!check.isNew && check.cachedResponse) {
    return Response.json(check.cachedResponse.body, {
      status: check.cachedResponse.status, // ← VIOLATION
    });
  }

  const result = await create(...);
  await recordIdempotencyResponse(idempotencyKey, 201, result);
  return Response.json(result, { status: 201 }); // ← VIOLATION
});
```

**After**:
```typescript
export const POST = withCanonicalEnforcement(async (ctx) => {
  const idempotencyKey = ctx.request!.headers.get("idempotency-key");
  if (!idempotencyKey) {
    throw new BadRequestError("idempotency-key required");
  }

  const check = await checkIdempotencyKey(...);
  if (!check.isNew && check.cachedResponse) {
    return canonicalJson(check.cachedResponse.body, {
      status: check.cachedResponse.status, // ← ENVELOPE
    });
  }

  const result = await create(...);
  await recordIdempotencyResponse(idempotencyKey, 201, result);
  return canonicalJson(result, { status: 201 }); // ← ENVELOPE
});
```

### Example 2: Error Handling Pattern

**Before**:
```typescript
export const GET = withEnforcementFull(async (request) => {
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required" },
      { status: 400 } // ← VIOLATION
    );
  }

  try {
    const data = await loadData(workspaceId);
    return Response.json(data, { status: 200 }); // ← VIOLATION
  } catch (error) {
    return Response.json({ error: "Load failed" }, { status: 500 }); // ← VIOLATION
  }
});
```

**After**:
```typescript
export const GET = withEnforcementFull(async (request) => {
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new BadRequestError("Workspace ID required");
  }

  try {
    const data = await loadData(workspaceId);
    return data; // ← PLAIN OBJECT (200)
  } catch (error) {
    throw new AppError("Load failed", 500);
  }
});
```

---

## References

- Implementation: `src/lib/canonical-json-response.ts`
- Wrapper: `src/lib/canonical-route-enforcement.ts` (lines 608-650)
- Tests: `src/lib/__tests__/canonical-wrapper-contract.test.ts`
- Baseline: `qa/baselines/wrapped-response-violations.json`
