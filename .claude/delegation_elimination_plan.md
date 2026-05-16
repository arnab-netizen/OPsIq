# DELEGATION ELIMINATION PLAN - Path to True Canonical Ownership

## Objective
Convert HYBRID_WRAPPER to TRUE_CANONICAL by eliminating all legacy semantic authority.

## Current Hybrid Dependencies

### 1. Error Classification Dependency
**Current**: Legacy decides error type, wrapper maps to HTTP  
**Risk**: If legacy changes error type, wrapper behavior changes invisibly

**Elimination**:
```
BEFORE (HYBRID):
  requireSession() → throws UnauthorizedError
  wrapper catches → returns 401

AFTER (CANONICAL):
  requireSession() → returns null
  wrapper decides → throws UnauthorizedError → returns 401
```

**Implementation Steps**:
1. Change requireSession() to return SessionInfo | null (not throw)
2. Change requirePolicyContext() to return PolicyContext | null (not throw)
3. Move error decision logic to wrapper
4. Wrapper creates all UnauthorizedError instances
5. Update all callers to handle null instead of catching

**Effort**: Medium (affects 5-6 functions)  
**Risk**: Breaking change to requireAuth() callers  
**Files**: auth.ts, canonical-route-enforcement.ts

---

### 2. Capability Evaluation Dependency
**Current**: Legacy evaluates via canDo(), wrapper only makes allow/deny decision  
**Risk**: Cannot change authorization rules without understanding legacy logic

**Elimination**:
```
BEFORE (HYBRID):
  wrapper calls canDo(policy, capability)
  canDo calls hasCapability (legacy evaluation)
  wrapper makes decision based on result

AFTER (CANONICAL):
  wrapper evaluates capability directly
  no call to legacy hasCapability
  wrapper owns entire decision
```

**Implementation Steps**:
1. Move ROLE_CAPABILITIES to canonical system
2. Move hasCapability logic to canonical evaluator
3. Move scope evaluation logic to canonical
4. Wrapper calls own evaluator, not legacy
5. Deprecate legacy hasCapability()

**Effort**: High (complex authorization logic)  
**Risk**: Must preserve exact semantics  
**Files**: capability-check.ts, canonical-route-enforcement.ts

**Key Code to Move**:
```typescript
// From src/policies/capability-check.ts
export function hasCapability(
  ctx: PolicyContext,
  capability: CapabilityName,
  scope?: { type: string; id: string }
): boolean {
  // Complex role-based authorization logic here
  // Must move completely to wrapper
}
```

---

### 3. Session Validation Dependency  
**Current**: Legacy owns session validation rules (expiration, revocation)  
**Risk**: Cannot change session semantics without modifying legacy

**Elimination**:
```
BEFORE (HYBRID):
  getSession() → validates expiration, revocation, JWT
  wrapper has no control over rules

AFTER (CANONICAL):
  SessionProvider interface → wrapper configures rules
  wrapper owns validation policy
  getSession() is utility function only
```

**Implementation Steps**:
1. Extract session validation rules from getSession()
2. Move to wrapper configuration
3. Wrapper owns: expiration timeout, revocation behavior
4. getSession() becomes dumb session retrieval
5. Wrapper applies validation rules

**Effort**: High (affects security-critical code)  
**Risk**: Session timeout/revocation bugs must not regress  
**Files**: auth.ts, canonical-route-enforcement.ts

---

### 4. Incomplete Capability Derivation
**Current**: deriveCapabilitiesFromPolicy() returns empty Set (stub)  
**Risk**: ctx.verifiedCapabilities unusable

**Elimination**:
```
BEFORE:
  deriveCapabilitiesFromPolicy(policy) → Set<string> // empty

AFTER:
  deriveCapabilitiesFromPolicy(policy) → Set<string> // actual capabilities
  Uses moved ROLE_CAPABILITIES
  Applies scope restrictions
  Context is fully populated
```

**Implementation Steps**:
1. Implement deriveCapabilitiesFromPolicy() fully
2. Use ROLE_CAPABILITIES map (moved from legacy)
3. Apply scope restrictions
4. Return complete capability set
5. Test with all role types

**Effort**: Low (straightforward implementation)  
**Risk**: Must match legacy behavior exactly  
**Files**: canonical-route-enforcement.ts

---

## Additional Issues Found by Agent

### Issue 1: Redundant Session Fetch (Performance)

**Problem**: getSession() called twice per request
- First: requireSession() line 72
- Second: getPolicyContext() line 83 (calls getSession() again)

**Impact**: +1 cookie parse + 1 DB query per request (30-50ms latency)

**Fix**: Pass session to getPolicyContext() instead of re-fetching
```typescript
// BEFORE
const policy = await getPolicyContext(workspaceId);
// getPolicyContext internally calls getSession()

// AFTER
const session = await requireSession(workspaceId);
const policy = await getPolicyContext(workspaceId, session);
// getPolicyContext uses provided session
```

**Effort**: Low  
**Priority**: High (performance improvement)

---

### Issue 2: Unhandled Exception Risk (Correctness)

**Problem**: ForbiddenError from requireCapability() not caught by wrapper

**Code**:
```typescript
// Line 145-164: Only catches UnauthorizedError
try {
  const authContext = await requireAuth(workspaceId);
  // ...
} catch (error) {  // ← Only catches UnauthorizedError
  return 401;
}

// But handlers calling requireCapability() directly throw ForbiddenError
// This falls through to generic catch → 500 instead of 403
```

**Fix**: Catch both error types or use return-based validation

**Effort**: Low  
**Priority**: Critical (security semantics)

---

### Issue 3: Dual Error Handling Patterns (Semantic)

**Problem**: Two patterns used inconsistently
- Pattern A: return null (canDo, getServerAuthContext)
- Pattern B: throw error (requireAuth, requireCapability)

**Risk**: Inconsistent error handling across codebase

**Fix**: Choose one pattern uniformly
- Option 1: All return null (Rust-style Result)
- Option 2: All throw errors (current Node.js style)

**Recommended**: Keep current throw pattern, deprecate null-returning functions

**Effort**: Medium (audit all callers)

---

### Issue 4: Parallel Telemetry Systems (Observability)

**Problem**: Two logging systems
- logger (used by canonical + services)
- runtimeLogger (used by legacy enforceRequest)

**Risk**: Cannot correlate logs across wrapper types

**Fix**: Single unified logger
- Move all telemetry to canonical logger
- Deprecate runtimeLogger
- Add structured fields (correlationId, requestId)

**Effort**: Medium  
**Priority**: Medium (operations/debugging)

---

### Issue 5: Trace Schema Mismatch (Troubleshooting)

**Problem**: Incompatible trace formats
- Canonical: stage-based (WORKSPACE_EXTRACTED, AUTH_VALIDATED)
- Legacy: depth-based (trace_depth increment)

**Risk**: Cannot merge or compare traces

**Fix**: Single canonical trace schema
- Deprecate legacy depth-based traces
- All traces use stage-based format
- Standard fields: stage, timestamp, result, error

**Effort**: High (audit all trace producers)

---

### Issue 6: Correlation ID Generation (Structural)

**Problem**: Multiple systems generate IDs independently
- Canonical generates from headers or creates new
- enforceRequest generates independently
- enforceMiddleware generates independently

**Risk**: Same request has multiple IDs, no deduplication

**Fix**: Central correlation ID management
- Header: x-correlation-id (highest priority)
- Middleware injects before route
- Wrapper uses injected ID
- No duplicate generation

**Effort**: Medium

---

## Elimination Plan Phases

### Phase 1: Quick Wins (0.5 days)
- [ ] Fix redundant session fetch (Issue 1)
- [ ] Fix unhandled ForbiddenError (Issue 2)
- [ ] Complete deriveCapabilitiesFromPolicy()
- [ ] Unify correlation ID generation (Issue 6)

### Phase 2: Error Classification (1 day)
- [ ] Make requireSession() return null instead of throw
- [ ] Make requirePolicyContext() return null instead of throw
- [ ] Move error decision to wrapper
- [ ] Update all callers (5-6 functions)
- [ ] Test error handling paths

### Phase 3: Capability Evaluation (1.5 days)
- [ ] Move ROLE_CAPABILITIES to canonical
- [ ] Move hasCapability() logic to canonical
- [ ] Implement scope restrictions in wrapper
- [ ] Test all role types
- [ ] Verify authorization semantics

### Phase 4: Session Validation (1 day)
- [ ] Extract validation rules from getSession()
- [ ] Move to wrapper configuration
- [ ] Implement wrapper-owned validation
- [ ] Test expiration + revocation scenarios
- [ ] Security review

### Phase 5: Telemetry & Traces (1.5 days)
- [ ] Unify logging systems (Issue 4)
- [ ] Standardize trace schema (Issue 5)
- [ ] Audit all trace producers
- [ ] Fix dual patterns (Issue 3)

### Phase 6: Integration & Testing (1 day)
- [ ] Re-test all 15 Tier A routes
- [ ] Integration testing with new semantics
- [ ] Performance validation
- [ ] Security review

**Total Estimated Effort**: 6-7 days

---

## Rollback Strategy

Each phase is reversible:
1. Phase 1: Feature flags for new behavior
2. Phase 2-5: Parallel implementations, no deletion of legacy
3. Phase 6: Once tested, can deprecate legacy

**Revert cost**: 2-3 days (undo changes, restore legacy)

---

## Success Criteria for TRUE_CANONICAL

After elimination plan completion:

✓ Wrapper makes ALL auth semantics decisions  
✓ Wrapper owns ALL error classification  
✓ Wrapper owns ALL authorization logic  
✓ Wrapper owns ALL session validation  
✓ Zero coupling to legacy auth functions  
✓ All 15 Tier A routes re-tested  
✓ No performance regression  
✓ No security regression  
✓ Unified telemetry and traces  
✓ Tier B migration gates PASS  

---

## Decision Point

**Before Tier B migration, choose**:

1. **Execute full elimination plan** (6-7 days) → TRUE_CANONICAL → safe Tier B
2. **Accept HYBRID risk** (0 days) → document coupling → risky Tier B
3. **Freeze Tier B** (0 days) → no progress → no risk

**Recommendation**: Option 1 (elimination plan) before Tier B

The investment now prevents exponential complexity growth later.
