# TELEMETRY OWNERSHIP INVENTORY — STEP C1

**Date**: 2026-05-14  
**Purpose**: Complete audit of all telemetry emission paths  
**Status**: ANALYSIS IN PROGRESS

---

## TELEMETRY CATEGORIES

### 1. CORRELATION IDs

#### Generation Points
| Location | Ownership | Pattern | Issue |
|----------|-----------|---------|-------|
| canonical-route-enforcement.ts:108 | CANONICAL | `x-correlation-id` header or generated | ✓ Single source |
| canonical-route-enforcement.ts:109 | CANONICAL | `x-request-id` header or generated | ✓ Single source |

**Status**: CANONICAL OWNS ✓

#### Usage Points
| Location | Usage Type | Ownership |
|----------|-----------|-----------|
| canonical-route-enforcement.ts | Passed to logger | CANONICAL ✓ |
| canonical-route-enforcement.ts | Response headers | CANONICAL ✓ |
| canonical-auth-facts.ts | Stored in AuthState | CANONICAL ✓ |
| logger.ts | Included in context | CANONICAL ✓ |

**Finding**: Correlation IDs properly centralized in canonical wrapper.

---

### 2. LEGACY AUTH TELEMETRY

#### auth.ts Emissions

```
Line 43:  logger.info("Session revoked", { sessionId: session.id })
Line 48:  logger.info("Session expired", { sessionId: session.id })
Line 53:  logger.warn("Inactive user attempted session use", { userId })
Line 141: logger.info("Session revoked", { sessionId, revokedBy: actorId })
```

**Classification**: 🔴 HYBRID (Legacy owns data, but canonical context unknown)

**Problems**:
- Legacy emits telemetry during getSession() calls
- No correlation ID context
- No request ID context
- No actor context (except in revokeSession)
- Emission happens in data layer, not decision layer
- Cannot correlate with auth decision

**Must Remove**: YES

---

### 3. CANONICAL WRAPPER TELEMETRY

#### canonical-route-enforcement.ts Emissions

```
Line 112:  logger.info("Canonical route enforcement started", { correlationId, requestId, method, pathname })
Line 133:  logger.debug("Auth facts gathered", { correlationId, sessionValid, policyValid })
Line 174:  logger.warn("Auth decision: DENIED", { correlationId, statusCode, reason })
Line 193:  logger.debug("Auth decision: ALLOWED", { correlationId })
Line 221:  logger.debug("Canonical handler executing", { correlationId, actorId })
Line 239:  logger.error("Canonical route handler failed", { correlationId })
```

**Classification**: ✓ CANONICAL (Owns context, correlation, decision)

**Strengths**:
- All emissions have correlationId
- All emissions have requestId
- All emissions have decision context
- Single source of truth

**Issues**:
- Missing workspace context
- Missing actor context in some emissions
- Missing auth state in trace
- Missing capability facts in trace

---

### 4. CANONICAL AUTH FACTS TELEMETRY

#### canonical-auth-facts.ts Emissions

**Current Status**: NO EMISSIONS

**Should Emit**:
- ✗ Fact evaluation results
- ✗ Capability check results
- ✗ Internal access evaluation
- ✗ Workspace validation

**Missing**: Telemetry bridge from facts to wrapper

---

## TELEMETRY FLOW ANALYSIS

### Current Flow (HYBRID)

```
Request
  ↓
canonical-route-enforcement.ts
  ├─ logger.info("started")            ← CANONICAL telemetry
  ├─ getSessionFact()
  │  └─ getSession()
  │     ├─ logger.info("revoked")       ← LEGACY telemetry ❌ ORPHANED
  │     ├─ logger.info("expired")       ← LEGACY telemetry ❌ ORPHANED
  │     └─ logger.warn("inactive")      ← LEGACY telemetry ❌ ORPHANED
  ├─ getPolicyContextFact()
  │  └─ getPolicyContext()
  │     └─ getSession()
  │        └─ (telemetry already fired) ← DUPLICATE SESSION CALL ❌
  ├─ buildAuthState()
  │  └─ (no telemetry)
  ├─ evaluateAuthState()
  │  └─ (no telemetry)
  ├─ logger.warn("decision denied")     ← CANONICAL telemetry
  ├─ handler()
  └─ logger.error("handler failed")     ← CANONICAL telemetry
```

**Problems Identified**:
1. Legacy telemetry orphaned (no correlation ID, no decision context)
2. Duplicate session fetch (also causes duplicate telemetry)
3. No telemetry from facts evaluation layer
4. No workspace context in canonical telemetry
5. No actor context in early telemetry
6. No auth state snapshot in telemetry

---

## TELEMETRY CLASSIFICATION MATRIX

| Telemetry | Current Owner | Canonical Owns | Legacy Owns | Duplicate | Orphaned | Must Fix |
|-----------|---------------|-----------------|------------|-----------|----------|----------|
| Correlation ID Gen | CANONICAL | ✓ | | | | NO |
| Request ID Gen | CANONICAL | ✓ | | | | NO |
| Route Start | CANONICAL | ✓ | | | | NO |
| Facts Gathered | CANONICAL | ✓ | | | | NO |
| Auth Decision | CANONICAL | ✓ | | | | NO |
| Handler Execute | CANONICAL | ✓ | | | | NO |
| Session Revoked | LEGACY | Should be | | ✓ | ✓ | YES |
| Session Expired | LEGACY | Should be | | ✓ | ✓ | YES |
| Inactive User | LEGACY | Should be | | ✓ | ✓ | YES |
| Policy Load | LEGACY | Should be | | | | YES |
| Capability Check | LEGACY | Should be | | | | YES |
| Handler Failure | CANONICAL | ✓ | | | | NO |

---

## TELEMETRY TIMING ISSUES

### Issue 1: Premature Session Telemetry

```
Request arrives
  ↓
getSessionFact() called
  ├─ getSession() executes
  │  ├─ Logs "Session revoked" IMMEDIATELY (before decision)
  │  └─ No correlation context available
  ↓
buildAuthState() called (facts assembled)
  ↓
evaluateAuthState() called (decision made)
  ├─ Decides what status code to return
  └─ DECISION happens AFTER telemetry was emitted
```

**Problem**: Telemetry emitted before decision made. Unclear if 401 or 403 in hindsight.

---

### Issue 2: Missing Session Fetch Deduplication

```
getSessionFact(workspaceId)
  └─ getSession(workspaceId)
     ├─ DB query 1: session.findUnique()
     └─ logger.info("Session revoked" | "expired" | "inactive")

getPolicyContextFact(workspaceId)
  └─ getPolicyContext(workspaceId)
     └─ getSession(workspaceId)  ← CALLED AGAIN
        ├─ DB query 2: session.findUnique() ← DUPLICATE
        └─ logger.info() ← DUPLICATE TELEMETRY
```

**Problem**: Session fetched twice = telemetry emitted twice = duplicate events in log

---

## REQUIRED CHANGES

### Phase C Step 2: Single Telemetry Authority

**Canonical wrapper must own all telemetry for auth paths**:
- Session validation results
- Policy loading results
- Capability evaluation results
- Auth decision final state
- Workspace validation results
- Internal access validation results

### Phase C Step 3: Remove Legacy Telemetry

Legacy auth helpers must NOT emit:
- Session revoked notifications
- Session expired notifications
- Inactive user warnings
- Policy loading logs
- Capability evaluation logs

### Phase E Step 4: Deduplicate Session Fetch

Fix before C2 to ensure single session fact per request:
- Fetch session once
- Pass to getPolicyContext()
- No nested session fetches
- No duplicate telemetry

---

## EXECUTION PLAN

### Immediate (PHASE C)
1. Extract all legacy telemetry emissions
2. Convert to fact-based telemetry in canonical wrapper
3. Add correlation/request context to all emissions
4. Add auth state snapshot to telemetry
5. Add workspace context to all emissions
6. Add actor context to all emissions (after auth passes)

### Dependent (PHASE E)
1. Fix duplicate session fetch
2. Ensure single session snapshot per request
3. Remove all downstream session refetches

### Validation (PHASE C4)
1. Build duplicate detection
2. Prove single telemetry emission per auth event
3. Prove single correlation ID per request
4. Prove single request ID per request

---

## TELEMETRY SCHEMA TARGET

```typescript
// What canonical telemetry should emit:
{
  timestamp: Date,
  correlationId: string,        // ← Required
  requestId: string,             // ← Required
  event: "auth_started" | "auth_denied" | "auth_allowed" | "handler_executing" | "handler_failed",
  
  // Auth facts (populated if auth phase reached)
  sessionValid?: boolean,
  policyValid?: boolean,
  workspaceId?: string,
  actorId?: string,              // ← Only after auth passes
  
  // Decision (populated if decision phase reached)
  decision?: "allow" | "deny",
  statusCode?: 401 | 403 | 500,
  reason?: string,
  
  // Route context
  method: string,
  pathname: string,
  
  // Performance
  duration?: number,
  
  // Trace reference
  traceId?: string,
}
```

---

## SUMMARY

### Current State (HYBRID)
```
✓ Canonical: Owns correlation IDs, request IDs, auth decision telemetry
✗ Legacy: Orphaned telemetry (revoked, expired, inactive)
✗ DUPLICATE: Session fetch telemetry emitted twice
✗ MISSING: Fact evaluation telemetry
✗ MISSING: Workspace context in telemetry
✗ MISSING: Actor context in early telemetry
```

### Target State (CANONICAL)
```
✓ Canonical: Owns ALL telemetry for auth paths
✓ Canonical: All telemetry has correlation + request context
✓ Canonical: All telemetry includes auth state snapshot
✓ Canonical: Single telemetry emission per auth event
✓ Legacy: Pure data providers (no telemetry)
```

### Work Required
- Remove 4 logger calls from auth.ts
- Add 5+ logger calls to canonical-route-enforcement.ts
- Fix duplicate session fetch (PHASE E)
- Build duplicate detection tests
- Document telemetry schema

---

**Next**: STEP C2 — Build single telemetry authority
