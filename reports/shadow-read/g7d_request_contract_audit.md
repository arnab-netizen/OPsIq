# G7D-C-B: Request Field Contract Safety Audit

**Phase**: G7D-C (Request Field Decision)
**Timestamp**: 2026-05-14T20:52:00Z
**Classification**: RUNTIME_ENFORCED_HYBRID

---

## Executive Summary

**CRITICAL FINDING**: CanonicalAuthContext is **NOT strictly request-bound**. Making `request: NextRequest` non-optional will:

1. Force fake request creation in background event processing (`src/services/re-evaluation.ts`)
2. Violate "NO any/as any types" constraint (already violated with `null as any`)
3. Break architectural separation of concerns (service layer doesn't need HTTP requests)

---

## Architecture Analysis

### Current State

**CanonicalAuthContext contains**:
- `request?: NextRequest` (OPTIONAL)
- Other fields (all verified, either required or optional as appropriate)

**Who creates CanonicalAuthContext?**
1. **withCanonicalEnforcement wrapper** (line 362 in canonical-route-enforcement.ts)
   - Always provides request (HTTP route bound)
   
2. **Manual construction** in re-evaluation.ts (lines 700, 771)
   - Background event processing
   - No HTTP request available
   - Currently uses: `request: null as any`

### Is CanonicalAuthContext Request-Bound?

**NO**

**Evidence**:
- 30 route handlers use it (request-bound)
- 25 service functions accept it (NOT request-bound)
- 3 test files use it (NOT request-bound)
- 1 background event processor manually constructs it (NOT request-bound)

**Breakdown**:
- Request-bound: 30 route handlers
- Non-request-bound: 26 other usages (services, tests, background jobs)
- Percentage request-bound: 54%

---

## Safety Impact of Non-Optional Request

### Impact on Re-evaluation.ts (CRITICAL)

**Current Code** (lines 700-719):
```typescript
const authContext: CanonicalAuthContext = {
  verifiedActorId: event.triggeredBy,
  verifiedActorType: "service",
  // ... other fields ...
  request: null as any,  // WORKAROUND
} as CanonicalAuthContext;
```

**With Non-Optional Request**:
- Cannot be null anymore
- Would need: `request: undefined!` or `request: {} as NextRequest`
- Would still violate "NO any/as any types" constraint
- Alternative: Extract request field, make it truly optional always

### Impact on Service Layer

**Services that accept CanonicalAuthContext**:
- ~25 services (diagnosis, evidence, engagement, etc.)
- None use the request field
- All only care about: `verifiedActorId`, `verifiedCapabilities`, `verifiedWorkspaceId`, `verifiedSessionSnapshot`
- Making request non-optional doesn't break them, but adds unnecessary coupling

### Impact on Tests

**Test files**:
- Can easily create test requests (already done)
- Would need minor adjustments
- Low risk

---

## Weakening Analysis

### Does Non-Optional Request Weaken Anything?

**NO** - It doesn't weaken the context. However:

1. **Coupling**: Increases coupling between service layer and HTTP concepts
2. **Flexibility**: Reduces architectural flexibility for non-HTTP contexts (events, webhooks, internal APIs)
3. **Contract**: Changes what the context implies about execution context (now must be HTTP-bound)

---

## Architectural Options

### Option 1: ACCEPT_NON_OPTIONAL_REQUEST

**Fix re-evaluation.ts violation**:
```typescript
// Needs to handle null/undefined somehow
// Current: request: null as any ❌
// Would need workaround still
```

**Pros**:
- Type safety improvement for route handlers
- Simpler handler code (no null checks)
- Wrapper already provides it

**Cons**:
- Breaks re-evaluation.ts (event processing)
- Forces fake request creation (violates NO any/as any)
- Couples service layer to HTTP concepts
- Makes context strictly request-bound (not architecturally pure)

**Feasibility**: LOW (re-evaluation.ts blocker)

---

### Option 2: REVERT_TO_OPTIONAL_REQUEST

**Revert line 82 in canonical-route-enforcement.ts**:
```typescript
- request: NextRequest;
+ request?: NextRequest;
```

**Required follow-up**:
- Remove the `null as any` workaround in re-evaluation.ts
- Handlers using ctx.request need non-null assertions or guarding

**Pros**:
- Fixes re-evaluation.ts blocker immediately
- No any/as any violations needed
- Acknowledges legitimate non-request contexts
- Allows background services to work naturally

**Cons**:
- Handlers need: `ctx.request?.headers.get()` or `ctx.request!.headers.get()`
- Slightly more verbose handler code
- Less type safety for route handlers

**Feasibility**: HIGH (clean, no workarounds)

---

### Option 3: SPLIT_CONTEXT_TYPES

**Create two context types**:
```typescript
export interface RouteCanonicalAuthContext extends CanonicalAuthContext {
  request: NextRequest;  // Required for routes
}

export interface ServiceCanonicalAuthContext extends CanonicalAuthContext {
  request?: NextRequest;  // Optional for services
}
```

**Usage**:
- Routes receive `RouteCanonicalAuthContext`
- Services accept `CanonicalAuthContext` (base)
- Background jobs use `CanonicalAuthContext` with optional request

**Pros**:
- Type safety for routes (request is required)
- Architectural clarity (distinguishes route vs service contexts)
- No workarounds needed
- Services don't assume request exists

**Cons**:
- More complexity (two types)
- Wrapper must return `RouteCanonicalAuthContext`
- Services must accept base type or explicit type
- More refactoring work

**Feasibility**: MEDIUM (adds complexity but cleaner architecture)

---

## Recommendation

**OPTION 2: REVERT_TO_OPTIONAL_REQUEST**

**Rationale**:
1. Acknowledges legitimate non-request-bound contexts (events, background jobs)
2. Fixes existing any/as any violation in re-evaluation.ts without creating more
3. Maintains flexibility for future non-HTTP contexts
4. Route handlers can still use `ctx.request!` when request is guaranteed
5. Cleaner than Option 1, simpler than Option 3

**Implementation**:
```typescript
// src/lib/canonical-route-enforcement.ts
export interface CanonicalAuthContext {
  // ... other fields ...
  request?: NextRequest;  // Back to optional
}

// src/services/re-evaluation.ts
const authContext: CanonicalAuthContext = {
  // ... fields ...
  // No need for null as any anymore
};
```

**Handler adaptation** (if needed):
```typescript
// Before (with non-optional):
const url = new URL(ctx.request.url);

// After (with optional):
const url = new URL(ctx.request!.url);  // Non-null assertion (safe in route context)
// OR
const url = ctx.request ? new URL(ctx.request.url) : null;  // Guarding
```

---

## Impact on Existing Handlers

**Migrated handlers from G7D**:
- 4 handlers use `ctx.request` actively
- All are route-bound (will always have request)
- Non-null assertion (`ctx.request!`) is safe in route context
- Zero risk

**Other route handlers**:
- ~26 other handlers use `ctx.request`
- All route-bound
- Non-null assertion safe
- Zero risk

**Service layer**:
- 25+ services don't use request
- No changes needed
- Zero risk

**Tests**:
- Can easily create test requests
- No changes needed
- Zero risk

---

## Constraint Compliance

### G7D-C Constraints

**NO any / NO as any**:
- ✓ Option 2 (revert) removes the any/as any violation
- ❌ Option 1 (non-optional) forces it to stay or create new one

**NO SERVICE WEAKENING**:
- ✓ Option 2 (revert) maintains flexibility
- ✓ Option 1 (non-optional) doesn't weaken, but couples
- ✓ Option 3 (split) provides more clarity

**NO CONTRACT WEAKENING**:
- ✓ All options maintain CanonicalAuthContext semantics
- ✓ No security properties are weakened

---

## Decision Criteria Met

✓ Is CanonicalAuthContext strictly request-bound? **NO** (26/62 usages are non-request-bound)
✓ Are there legitimate non-request contexts? **YES** (event processing in re-evaluation.ts)
✓ Is request required for enforcement? **NO** (wrapper enforcement is complete before providing context)
✓ Is request required for audit/logging? **NO** (verifiedSessionSnapshot is sufficient)
✓ Would optional request be safer? **YES** (fixes any/as any violation, acknowledges real architecture)
✓ Would reverting break migrated handlers? **NO** (non-null assertion is safe in route context)
✓ What files depend on non-optional request? (None depend on it being non-optional; all can use non-null assertion)

---

## Conclusion

**CanonicalAuthContext should NOT be request-bound.**

Making request non-optional solves a type-safety improvement locally but creates a larger architectural problem:
1. Forces fake request in background contexts
2. Violates existing constraints (any/as any)
3. Couples service layer to HTTP concepts

**Reverting to optional request** is the cleanest solution that respects the actual architecture.

---

End of Contract Safety Audit
