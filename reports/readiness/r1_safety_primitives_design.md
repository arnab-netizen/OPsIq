# R1-SAFETY-PRIMITIVES: Primitive Design

**Date:** 2026-05-18  
**Phase:** R1-SAFETY-PRIMITIVES Primitive Design  
**Status:** ✓ DESIGN COMPLETE

---

## A. PRIMITIVE_1: Replay + Idempotency Protection

**Purpose:** Prevent duplicate execution of idempotent operations

**Applies To:** 6 surfaces (Decision Execute, Action Complete, Engagement Condition, Evidence Validation, Acknowledge, Webhook Test)

### API Surface

```typescript
// src/lib/primitives/idempotency.ts

interface IdempotencyResult<T> {
  cached: boolean;        // true if result was cached
  result: T;             // cached or fresh result
  timestamp: Date;       // when operation completed
  actor: string;         // actorId who performed operation
}

async function atomicIdempotent<T>(
  key: string,                        // "surface:resource:idempotencyKey"
  handler: () => Promise<T>,          // operation to deduplicate
  options?: {
    ttl?: number;                     // cache TTL (default 24h)
    onCached?: (result: T) => void;  // callback if cached
    onFresh?: (result: T) => void;   // callback if fresh
  }
): Promise<IdempotencyResult<T>>

async function readIdempotencyKey(request: NextRequest): Promise<string> {
  const key = request.headers.get("idempotency-key");
  if (!key) throw new Error("idempotency-key required", 400);
  return key;
}

async function clearIdempotencyCache(key: string): Promise<void>

async function getIdempotencyResult<T>(key: string): Promise<T | null>
```

### Implementation Details

```
Storage Backend: Redis (or memory store for dev)
Key Format: `{surface}:{resourceId}:{idempotencyKey}`
TTL: 24 hours default
Collision Handling: First writer wins (atomic compare-and-set)
Failure Semantics: 
  - If handler throws: Don't cache, retry on next request
  - If handler returns: Cache result immediately
  - If duplicate arrives during first execution: Queue and return on completion
```

### Middleware Integration

```typescript
// src/lib/middleware/apply-idempotency.ts

export function withIdempotency<T>(
  handler: (ctx: CanonicalAuthContext) => Promise<T>,
  options?: { required?: boolean; ttl?: number }
) {
  return async (ctx: CanonicalAuthContext) => {
    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    
    if (!idempotencyKey && options?.required) {
      throw new Error("idempotency-key required", 400);
    }
    
    if (!idempotencyKey) {
      // No idempotency key, execute normally (non-idempotent)
      return handler(ctx);
    }
    
    const key = `${ctx.surface}:${ctx.resourceId}:${idempotencyKey}`;
    
    return await atomicIdempotent(
      key,
      () => handler(ctx),
      { ttl: options?.ttl }
    );
  };
}
```

### Replay Behavior

```
Request 1 arrives with idempotency-key=xyz
  → Executes handler, stores result
  → Returns 200 + result

Request 2 arrives with idempotency-key=xyz (retry)
  → Looks up cache, finds result
  → Returns 200 + cached result (SAME as Request 1)
  → Handler never re-executes

Network hiccup:
  Request 1 → Response lost
  Request 2 → Returns cached result
  → Client thinks operation succeeded (correct)
  → Handler executed once (correct)
```

### Concurrency Behavior

```
Request 1 + Request 2 arrive simultaneously with same idempotency-key
  → Both race to cache
  → First to CAS wins, executes handler
  → Second waits for first to complete
  → Both return same result
  → Handler executes once (correct)
```

### Failure Semantics

```
Handler throws error:
  → Error is NOT cached
  → Result not stored
  → Retry returns error again
  → No corruption of state

Handler returns value:
  → Value cached immediately
  → Duplicate returns cached value
  → No handler re-execution

Dedup store failure (Redis down):
  → Fall back to handler execution
  → Risk: Possible duplicate execution
  → But fail-safe (works, just not deduped)
```

### Observability Hooks

```typescript
interface IdempotencyHooks {
  onCacheMiss?: (key: string) => void;
  onCacheHit?: (key: string, result: any) => void;
  onDuplicate?: (key: string) => void;
  onStoreFailure?: (key: string, error: Error) => void;
}

// Usage in telemetry
logger.info("idempotency_cache_hit", { key, cacheHit: result.cached });
```

---

## B. PRIMITIVE_2: Transition Guard / State Machine Safety

**Purpose:** Enforce valid state transitions and preconditions

**Applies To:** 3 surfaces (Decision Execute, Action Complete, Intervention State) + provides loop prevention for Engagement Condition

### API Surface

```typescript
// src/lib/primitives/state-machine.ts

interface StateMachine<T extends { status: string }> {
  validTransitions: Record<string, string[]>;    // {DRAFT: [PENDING], PENDING: [APPROVED, CANCELLED]}
  preconditions?: Record<string, (entity: T) => boolean>;  // {APPROVED: (e) => e.hasReviewer}
  postconditions?: Record<string, (entity: T) => Promise<void>>;  // {EXECUTED: async (e) => emitAudit(...)}
  terminal?: string[];  // States that can't transition further
}

async function enforceTransition<T extends { status: string }>(
  entity: T,
  targetStatus: string,
  machine: StateMachine<T>,
  options?: {
    validateOnly?: boolean;  // if true, don't execute postconditions
    actor?: string;          // actorId for audit
    audit?: boolean;         // emit audit event
  }
): Promise<T>

function defineStateMachine<T extends { status: string }>(
  name: string,
  definition: StateMachine<T>
): StateMachine<T>

async function validateTransition<T extends { status: string }>(
  entity: T,
  targetStatus: string,
  machine: StateMachine<T>
): Promise<ValidationError | null>
```

### Implementation Details

```
Transition Enforcement:
  1. Get current status
  2. Check if targetStatus in validTransitions[currentStatus]
  3. If not: throw 409 Conflict
  4. If yes: check preconditions
  5. If precondition fails: throw 409 Conflict
  6. If passes: atomic update to targetStatus
  7. After atomic update: run postconditions

Precondition Validation:
  - Can depend on entity state
  - Example: EXECUTION requires at least one DECISION

Postcondition Execution:
  - Happens AFTER status update (in separate transaction if needed)
  - Can emit audit events, trigger cascades, etc
  - Failures don't rollback status change (idempotent)

Loop Prevention:
  - Define machine with separate phases: ANALYSIS → PLANNING → EXECUTION
  - Postcondition on PLANNING: "trigger re-evaluation in PLANNING phase"
  - Re-evaluation runs in PLANNING phase context, cannot modify status
  - If re-eval tries to trigger PLANNING again: ignored (already in PLANNING)
```

### State Machine Definitions

```typescript
// src/lib/primitives/machines/decision.machine.ts

export const decisionMachine = defineStateMachine<Decision>("decision", {
  validTransitions: {
    DRAFT: ["PENDING"],
    PENDING: ["APPROVED", "REJECTED"],
    APPROVED: ["EXECUTED", "CANCELLED"],
    EXECUTED: [],  // Terminal
    CANCELLED: [],  // Terminal
    REJECTED: []   // Terminal
  },
  preconditions: {
    APPROVED: (decision) => decision.reviewedAt != null,  // must be reviewed
    EXECUTED: (decision) => decision.status === "APPROVED"  // precondition checked above
  },
  postconditions: {
    APPROVED: async (decision) => {
      await emitAuditEvent("DECISION_APPROVED", decision);
      await notifyStakeholders(decision);
    },
    EXECUTED: async (decision) => {
      await emitAuditEvent("DECISION_EXECUTED", decision);
      await createRelatedActions(decision);  // Cascade
    }
  },
  terminal: ["EXECUTED", "CANCELLED", "REJECTED"]
});
```

### Atomicity Guarantees

```
Transaction boundary includes:
  1. Status validation (current status is valid source)
  2. Precondition checks (all pass)
  3. Atomic status update + timestamps
  4. Audit event creation (optional)

If ANY step fails:
  → Entire transaction rolls back
  → Status not changed
  → Return 409 Conflict

If postconditions fail:
  → Status already changed (committed)
  → Postconditions retry next time (idempotent)
```

### Failure Semantics

```
Invalid transition (DRAFT → EXECUTED):
  → Rejected immediately with 409
  → No state change
  → No side effects

Precondition fails (no reviewer):
  → Rejected with 409
  → No state change
  → No side effects

Postcondition fails (audit event creation fails):
  → Status already changed
  → Postcondition retried on next request (idempotent design)
  → No data corruption
```

### Observability Hooks

```typescript
interface TransitionHooks {
  onInvalidTransition?: (from: string, to: string) => void;
  onPreconditionFailed?: (precondition: string) => void;
  onPostconditionFailed?: (postcondition: string, error: Error) => void;
  onSuccess?: (from: string, to: string) => void;
}

// Usage
logger.info("state_transition_attempted", { 
  entity: "decision", 
  from: "DRAFT", 
  to: "PENDING", 
  success: true 
});
```

---

## C. PRIMITIVE_3: Audit Integrity Enforcement

**Purpose:** Maintain complete audit trail for all state changes

**Applies To:** 3 surfaces (Evidence Validation, Recommendation Rerank, Finding Creation)

### API Surface

```typescript
// src/lib/primitives/audit.ts

interface AuditEvent {
  id: string;
  timestamp: Date;
  actor: string;  // actorId
  action: string;  // e.g., "EVIDENCE_VALIDATED", "RECOMMENDATION_RERANKED"
  resourceId: string;
  resourceType: string;
  previousState?: any;  // Before values
  newState?: any;      // After values
  changes?: Record<string, { before: any; after: any }>;
  metadata?: Record<string, any>;
  workspace: string;
}

async function emitAuditEvent(
  action: string,
  resourceId: string,
  resourceType: string,
  actor: string,
  options?: {
    previousState?: any;
    newState?: any;
    changes?: Record<string, { before: any; after: any }>;
    metadata?: Record<string, any>;
    workspace?: string;
  }
): Promise<AuditEvent>

async function getAuditTrail(
  resourceId: string,
  options?: { limit?: number; since?: Date }
): Promise<AuditEvent[]>

async function getAuditTrailForWorkspace(
  workspaceId: string,
  options?: { actor?: string; action?: string; since?: Date; limit?: number }
): Promise<AuditEvent[]>
```

### Implementation Details

```
Storage: Immutable append-only audit log table
Schema:
  id: uuid (primary key)
  timestamp: datetime (indexed)
  actor: string (indexed)
  action: string (indexed)
  resourceId: string (indexed)
  resourceType: string (indexed)
  previousState: jsonb
  newState: jsonb
  metadata: jsonb
  workspace: string (indexed)

Immutability: No UPDATE or DELETE allowed on audit_event table
Append-Only: Only INSERT allowed
Durability: Stored in durable transaction

Failure Semantics:
  If audit event creation fails:
    → Business operation already committed
    → Retry audit event creation separately
    → Flag for ops investigation
    → Never block business logic on audit failure
```

### Audit Trail Patterns

```typescript
// Pattern 1: Simple state change
await emitAuditEvent(
  "EVIDENCE_VALIDATED",
  evidenceId,
  "evidence",
  userId,
  {
    previousState: { status: "UNVALIDATED" },
    newState: { status: "VALIDATED" },
    workspace: workspaceId
  }
);

// Pattern 2: Complex changes with field diffs
await emitAuditEvent(
  "RECOMMENDATIONS_RERANKED",
  engagementId,
  "engagement",
  userId,
  {
    changes: {
      "recommendation_1_priority": { before: 1, after: 3 },
      "recommendation_2_priority": { before: 2, after: 1 },
      "recommendation_3_priority": { before: 3, after: 2 }
    },
    metadata: { rerankedAt: new Date() },
    workspace: workspaceId
  }
);

// Pattern 3: Cascading changes
await emitAuditEvent(
  "FINDING_CREATED",
  findingId,
  "finding",
  userId,
  {
    newState: { title, severity, evidenceId },
    metadata: {
      relatedEvidenceIds: [evidenceId],
      triggeredRecommendations: [rec1, rec2]
    },
    workspace: workspaceId
  }
);
```

### Observability & Compliance

```
Audit query patterns:
  - "Who changed resource X?"
  - "What changed on resource X?"
  - "When was resource X changed?"
  - "Who in workspace Y has permission changes?"
  - "What changes happened between date A and B?"

Compliance requirements:
  - Immutable audit trail (no deletion)
  - Complete state history (before/after values)
  - Actor attribution (who made change)
  - Timestamp (when made)
  - Workspace scoping (per customer isolation)
```

---

## D. PRIMITIVE_4: Cross-Aggregate Validation

**Purpose:** Enforce consistency and isolation across related entities

**Applies To:** 2 surfaces (Finding Creation, Intervention State)

### API Surface

```typescript
// src/lib/primitives/cross-aggregate.ts

interface CrossAggregateValidator {
  validateEntityExists<T>(
    id: string,
    type: string,
    workspace: string,
    options?: { throwOnMissing?: boolean }
  ): Promise<T | null>;

  validateForeignKey<T>(
    sourceId: string,
    sourceType: string,
    targetId: string,
    targetType: string,
    workspace: string
  ): Promise<boolean>;

  validateCascadeOperation(
    sourceId: string,
    sourceType: string,
    operation: "archive" | "delete" | "transition",
    workspace: string,
    options?: { validateChildren?: boolean }
  ): Promise<CascadeValidation>;
}

interface CascadeValidation {
  valid: boolean;
  affectedEntities: { id: string; type: string }[];
  issues?: string[];
}

async function validateCrossAggregate(
  resourceId: string,
  relatedIds: { id: string; type: string }[],
  workspace: string,
  options?: { strict?: boolean }
): Promise<CrossAggregateValidation>
```

### Implementation Details

```
Validation Rules:
  1. Entity existence: Related entity must exist in database
  2. Workspace scoping: Related entity must be in SAME workspace
  3. Workspace isolation: Different workspaces cannot reference each other
  4. Cascade safety: Deleting entity must not orphan children
  5. Foreign key integrity: All references must be valid

Example: Finding Creation
  - Finding references Evidence
  - Validate: Evidence exists
  - Validate: Evidence is in same workspace
  - Validate: Evidence not orphaned (has finding already? depends on cardinality)

Example: Intervention State Change
  - Engagement → Recommendations
  - Validate: All recommendations exist in workspace
  - Validate: All recommendations can transition to new phase
  - Cascade: Archive recommendations from old phase

Failure Semantics:
  If validation fails:
    → Operation rejected with 422 Unprocessable Entity
    → No state change
    → Return validation errors to client
    → No data corruption
```

### Workspace Isolation Enforcement

```
Every cross-aggregate check includes workspace validation:

await validateEntityExists(resourceId, "evidence", workspaceId)
  ↓ 
Query: SELECT * FROM evidence 
       WHERE id = resourceId 
       AND workspace_id = workspaceId
  ↓
If not found: Treat as "entity doesn't exist" (404 equivalent)
Result: Can't create finding linking evidence from different workspace
```

---

## E. Primitive Composition & Failure Modes

### Composition Pattern

```
Handler flow with all primitives:

1. Input validation (schema)
2. PRIMITIVE_1: Check idempotency-key
   → If cached, return cached result
   → If fresh, continue
3. PRIMITIVE_4: Validate cross-aggregate consistency
   → Check all related entities exist in workspace
   → If invalid, return 422
4. PRIMITIVE_2: Validate state machine transition
   → Check current state valid
   → Check preconditions pass
   → If invalid, return 409
5. Atomic update + PRIMITIVE_3: Emit audit event
   → Update state
   → Create audit event
   → Store idempotency result
6. Postconditions (trigger cascades, notifications, etc)

Failure at each step:
  1. Schema validation: 400 Bad Request (client error)
  2. Idempotency: 200 OK + cached result (success)
  3. Cross-aggregate: 422 Unprocessable (data integrity)
  4. State machine: 409 Conflict (invalid state)
  5. Atomic update: 500 (rare, indicates DB issue)
  6. Audit event: Logged, doesn't block business logic
  7. Postconditions: Logged, don't block, retried next time
```

### Atomicity Guarantees

```
Strong guarantees:
  - Idempotency (deduped at cache layer)
  - State machine transitions (atomic DB update)
  - Audit events (always created, even if slow)
  - Workspace isolation (enforced in every query)

Weak guarantees:
  - Postconditions (best effort, idempotent retry)
  - Cascade operations (may be async, eventual consistency)

Failure recovery:
  - Idempotency cache miss → Just retries operation
  - State validation failure → Rejected, no retry
  - Cross-aggregate failure → Rejected, no retry
  - Audit failure → Logged, manual ops investigation
  - Postcondition failure → Retried on next related operation
```

---

## F. Primitive Integration Example: Decision Execute

**Handler implementing all 4 primitives:**

```typescript
export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const { decisionId } = ctx.params;
  
  // PRIMITIVE_1: Idempotency
  const idempotencyKey = await readIdempotencyKey(ctx.request!);
  const dedupKey = `decision_execute:${decisionId}:${idempotencyKey}`;
  
  return await atomicIdempotent(
    dedupKey,
    async () => {
      const decision = await db.decision.findFirst({
        where: { id: decisionId, workspace: ctx.verifiedWorkspaceId }
      });
      
      if (!decision) {
        throw new NotFoundError("Decision not found");
      }
      
      // PRIMITIVE_4: Cross-aggregate validation (implicit via FK)
      // - Decision must belong to engagement in workspace (DB constraint)
      
      // PRIMITIVE_2: State machine enforcement
      await enforceTransition(
        decision,
        "EXECUTED",
        decisionMachine,
        { actor: ctx.verifiedActorId, audit: true }
      );
      // Within enforceTransition:
      //   1. Validate APPROVED → EXECUTED is valid ✓
      //   2. Check preconditions (decision reviewed) ✓
      //   3. Atomic update: status = EXECUTED ✓
      //   4. PRIMITIVE_3: Emit audit event ✓
      //   5. Postconditions: Create related actions, etc ✓
      
      return { decisionId, status: "EXECUTED" };
    },
    { ttl: 24 * 60 * 60 }
  );
}, { requireCapabilities: [CAPABILITIES.DECISION_EXECUTE] });
```

---

**Status: ✓ R1-SAFETY-PRIMITIVES PRIMITIVE DESIGN COMPLETE**

**Key Design Decisions:**
1. **Idempotency at cache layer** (not handler level) → Reusable across all handlers
2. **State machine as registry** (not embedded) → Centralized enforcement
3. **Audit as append-only log** (immutable) → Compliance-safe
4. **Cross-aggregate validation in every mutation** (no opt-out) → Workspace isolation guaranteed

**Next Phase:** Map dangerous surfaces to primitives, estimate actual implementation effort
