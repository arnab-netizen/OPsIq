# TRACE OWNERSHIP INVENTORY — PHASE D STEP D1

**Date**: 2026-05-14  
**Purpose**: Complete audit of all execution trace lineage  
**Status**: CRITICAL - Split-brain risk identified

---

## TRACE GENERATION POINTS

### 1. CANONICAL WRAPPER EXECUTION TRACE

**Location**: `src/lib/canonical-route-enforcement.ts` (executionTrace array)

```typescript
const executionTrace: Array<{ stage: string; timestamp: number; result: string }> = [];

// Generated points:
// Line 130: WORKSPACE_EXTRACTED
// Line 144: FACTS_GATHERED
// Line 162: AUTH_STATE_BUILT
// Line 184: AUTH_EVALUATED
// Line 205: AUTH_AUTHORIZED
// Line 228: HANDLER_SUCCESS
```

**Ownership**: ✓ CANONICAL

**Issues**:
- Trace stored in CanonicalAuthContext
- Passed to handler (handler could mutate)
- No immutability guarantee
- No trace ID

---

### 2. CANONICAL AUTH FACTS TRACE

**Location**: `src/lib/canonical-auth-facts.ts` (AuthDecisionTrace)

```typescript
export interface AuthDecisionTrace {
  decision: "allow" | "reject";
  reason: string;
  checks: Array<{
    check: string;
    result: boolean | string;
    detail?: string;
  }>;
}
```

**Ownership**: ✓ CANONICAL

**Characteristics**:
- Built during evaluateAuthState()
- Records decision reasoning
- Includes all checks performed
- Included in AuthDecision

**Relationship to executionTrace**:
- DIFFERENT from execution trace
- Records WHY decision made
- executionTrace records WHEN things happened

**Problem**: Two separate trace systems (decision trace vs execution trace)

---

### 3. TELEMETRY LIFECYCLE TRACE

**Location**: `src/lib/canonical-telemetry-lifecycle.ts`

```typescript
export interface CanonicalTelemetryContext {
  traceId?: string;  // ← Optional, not required
  correlationId: string;
  requestId: string;
  timestamp: Date;
  // ... other fields
}
```

**Ownership**: ✓ CANONICAL

**Issues**:
- traceId is optional (not guaranteed)
- Separate from execution trace
- Separate from decision trace
- Three trace systems exist in parallel

---

## TRACE FRAGMENTATION RISK

### Current State (SPLIT-BRAIN)

```
Request arrives
  ├─ Correlation ID: x-correlation-id (canonical)
  ├─ Request ID: x-request-id (canonical)
  │
  ├─ Execution Trace (canonical-route-enforcement.ts):
  │  └─ WORKSPACE_EXTRACTED → FACTS_GATHERED → AUTH_STATE_BUILT → AUTH_EVALUATED → HANDLER_SUCCESS
  │
  ├─ Decision Trace (canonical-auth-facts.ts):
  │  └─ { decision: "allow" | "reject", checks: [...] }
  │
  ├─ Telemetry Trace (canonical-telemetry-lifecycle.ts):
  │  └─ { traceId: optional, correlation_id, request_id, events: [...] }
  │
  └─ No unified lineage
```

**Problem**: Three separate trace systems with different purposes, schemas, and lifecycles

---

## TRACE OWNERSHIP CLASSIFICATION

| Trace System | Owner | Type | Issue |
|--------------|-------|------|-------|
| Execution Trace | CANONICAL | Stage-based | ✓ Owned |
| Decision Trace | CANONICAL | Check-based | ✓ Owned |
| Telemetry Trace | CANONICAL | Event-based | ⚠ Fragmented |
| Correlation ID | CANONICAL | Global | ✓ Unified |
| Request ID | CANONICAL | Request-scoped | ✓ Unified |
| Nested Spans | NONE | None | ✓ Prevented |

---

## SPLIT-BRAIN LINEAGE RISKS

### Risk 1: Three Trace Systems, No Unification

```
Decision: "denied" (from AuthDecisionTrace)
Execution: HANDLER_SUCCESS (from executionTrace)

Conflict! How do we know what actually happened?
```

**Risk Level**: 🔴 HIGH

---

### Risk 2: Trace Not Immutable

```typescript
const verifiedContext: CanonicalAuthContext = {
  executionTrace,  // ← Passed to handler
  // ... other fields
};

// Handler could mutate:
ctx.executionTrace.push({ stage: "MUTATION", ... });

// Now replay can't reconstruct original lineage
```

**Risk Level**: 🔴 CRITICAL

---

### Risk 3: No Trace ID

```
Request 1 trace: [WORKSPACE_EXTRACTED, FACTS_GATHERED, AUTH_EVALUATED]
Request 2 trace: [WORKSPACE_EXTRACTED, FACTS_GATHERED, AUTH_EVALUATED]

Are these the same request? Different requests?
Cannot correlate without trace ID.
```

**Risk Level**: 🔴 HIGH

---

### Risk 4: Optional Trace ID in Telemetry

```typescript
export interface CanonicalTelemetryContext {
  traceId?: string;  // ← Optional!
}

// If traceId is missing, telemetry cannot reference trace
// Unification impossible
```

**Risk Level**: 🔴 HIGH

---

## REQUIRED TRACE FIELDS

To eliminate split-brain, unified trace must include:

```typescript
interface CanonicalExecutionTrace {
  // Identity
  traceId: string;                    // ← REQUIRED (UUID)
  correlationId: string;              // ← REQUIRED (from header)
  requestId: string;                  // ← REQUIRED (from header)
  
  // Request context
  method: string;
  pathname: string;
  
  // Auth state snapshot at trace creation
  sessionSnapshotId?: string;         // ← Reference to session snapshot
  
  // Complete lifecycle stages
  stages: Array<{
    stage: string;
    timestamp: number;
    result: "success" | "skipped" | "failed";
    detail?: string;
  }>;
  
  // Decision trace (embedded)
  decision?: {
    decision: "allow" | "reject";
    reason: string;
    checks: Array<{
      check: string;
      result: boolean | string;
      detail?: string;
    }>;
  };
  
  // Auth state at each stage
  authState?: {
    sessionValid?: boolean;
    policyValid?: boolean;
    workspaceValid?: boolean;
    actorId?: string;
    workspaceId?: string;
  };
  
  // Telemetry references
  telemetryEvents: Array<{
    event: string;
    timestamp: number;
    correlationId: string;
  }>;
  
  // Audit references
  auditEvents?: Array<{
    eventId: string;
    timestamp: number;
  }>;
  
  // Execution barriers
  barriers: {
    mutationBarrier: "before" | "during" | "after";
    executionBarrier: "before" | "during" | "after";
  };
  
  // Final outcome
  finalOutcome: {
    allowed: boolean;
    statusCode: number;
    completedAt: number;
    duration: number;
  };
}
```

---

## IMMUTABILITY REQUIREMENTS

For true trace ownership, trace must be:

```typescript
// AFTER execution trace created, it is:
// - Read-only (no mutations allowed)
// - Immutable reference (cannot change entries)
// - Sealed (no new entries after completion)
// - Finalized (no modifications during handler)

// Current problem:
const trace = [...];  // ← Mutable array
ctx.executionTrace = trace;  // ← Passed to handler
// Handler could do: ctx.executionTrace.push(...)
```

---

## NESTED WRAPPER PROTECTION

Current vulnerability:

```typescript
// Route 1 uses canonical wrapper
export const GET = withCanonicalEnforcement(
  async (ctx) => {
    // Route 2 COULD create nested wrapper
    export const POST = withCanonicalEnforcement(
      async (ctx2) => {
        // Now we have nested traces!
        // Lineage splits
      }
    );
  }
);
```

**Protection needed**: Wrapper must detect and prevent nesting

---

## CORRELATION LINEAGE

Single immutable lineage required:

```
Request Enter
  ├─ Correlation ID: set (immutable)
  ├─ Request ID: set (immutable)
  ├─ Trace ID: generated (immutable)
  │
  └─ No changes to IDs until:
     └─ Request Exit
        └─ Finalize trace (immutable, sealed)
```

---

## CLASSIFICATION MATRIX

| Component | Classification | Status | Work Required |
|-----------|-----------------|--------|-----------------|
| Execution Trace | CANONICAL | Partial | Needs immutability |
| Decision Trace | CANONICAL | Partial | Needs unification |
| Telemetry Trace | CANONICAL | Partial | Needs trace ID |
| Trace ID | MISSING | ❌ | Must create |
| Trace Immutability | NONE | ❌ | Must implement |
| Nested Protection | NONE | ❌ | Must implement |
| Lineage Immutability | PARTIAL | ⚠️ | Must complete |

---

## EXECUTION PLAN

### STEP D2: Build CanonicalExecutionTrace
- Create unified trace type with all required fields
- Include decision trace (embedded)
- Include auth state snapshots
- Assign immutable traceId

### STEP D3: Single Trace Owner
- Wrapper is ONLY trace creator/finalizer
- Handler receives read-only trace reference
- Legacy cannot create nested traces
- Protection against wrapper nesting

### STEP D4: Immutable Execution Lineage
- Trace becomes read-only after created
- No mutations during handler execution
- No changes to correlation/request/trace IDs
- Sealed before handler completion

### STEP D5: Trace Consistency Tests
- Single trace per request
- No nested traces
- Correlation immutable
- Request lineage immutable
- Replay consistency
- Concurrent isolation

---

## SUMMARY

### Current State (SPLIT-BRAIN)
```
✗ Three separate trace systems
✗ No unified trace ID
✗ Trace passed to handler (mutable)
✗ Execution trace vs decision trace fragmented
✗ No replay consistency guarantee
✗ No nested wrapper protection
✗ Correlation lineage mutability risk
```

### Target State (CANONICAL)
```
✓ Single unified execution trace
✓ Immutable trace ID (UUID per request)
✓ Read-only trace reference to handler
✓ Decision trace embedded in execution trace
✓ Complete replay lineage
✓ Nested wrapper detection/prevention
✓ Immutable correlation lineage
```

### Work Required
- Create CanonicalExecutionTrace type
- Make traces read-only (seal after finalization)
- Generate UUID trace IDs
- Embed decision trace
- Implement nest detection
- Build 5+ adversarial tests

---

**Next**: STEP D2 — Build CanonicalExecutionTrace
