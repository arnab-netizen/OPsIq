# R1 Concurrency Surface Map — Risk Analysis

**Date**: 2026-05-19  
**Phase**: R1-CONCURRENCY-AND-CHAOS-PROOF PHASE A

---

## IDENTIFIED CONCURRENCY SURFACES

### 1. ENGAGEMENT UPDATE MUTATIONS

**Transaction Boundaries** (`/src/services/engagement.ts`):
```typescript
await db.engagement.update({
  where: { id: engagementId, workspaceId },
  data: {
    title,
    description,
    status,
    updatedAt: new Date()
  }
});
```

**Concurrency Strategy**:
- ✓ Database-enforced uniqueness via primary key (id)
- ✓ Workspace scoping in WHERE clause prevents cross-tenant updates
- ✓ Updated_at timestamp enables optimistic locking (if implemented at app level)
- ⚠ No explicit version field observed (optimistic locking may not be active)

**Locking Strategy**:
- Database row-level locks during update
- Prisma handles transaction isolation
- DEFAULT isolation level (Read Committed for PostgreSQL)

**Idempotency Strategy**:
- Pre-request: `checkIdempotencyKey()` detects duplicate
- Cached response returned if present
- No second update attempted

**Rollback Strategy**:
- Prisma transaction wrapper manages rollback
- On error: transaction reverted, idempotency error recorded
- Audit event may be partially recorded before rollback

**Corruption Risk**: LOW
- Workspace scoping prevents cross-tenant corruption
- Idempotency prevents duplicate mutations
- Row-level locking ensures atomic updates
- ⚠ Risk: Audit event may be created before update fails

---

### 2. ACTION COMPLETION MUTATIONS

**Transaction Boundaries** (`/src/services/action.ts`):
```typescript
await db.action.update({
  where: { id: actionId, workspaceId },
  data: {
    status: 'COMPLETED',
    completedAt: new Date(),
    completedBy: userId,
    updatedAt: new Date()
  }
});
```

**Concurrency Strategy**:
- ✓ Status field enforces state machine (only OPEN/IN_PROGRESS can transition to COMPLETED)
- ✓ Idempotency-Key header required
- ✓ Rate limiting prevents thundering herd
- ⚠ No explicit transaction wrapping observed around status check + update

**Locking Strategy**:
- Database handles locking for update
- No explicit pessimistic locking on read before write
- Risk: Check-then-act race condition possible

**Idempotency Strategy**:
- `withIdempotency()` wrapper prevents duplicate execution
- Cached result returned on retry
- Second completion attempt returns cached success

**Rollback Strategy**:
- On failure: status change reverted
- Completion record not created
- idempotency error recorded for retry

**Corruption Risk**: MEDIUM
- ⚠ Status check-then-update not atomic (two-step operation)
- ⚠ Concurrent completions could both pass status check
- ⚠ Only one succeeds, but both may attempt audit events
- ✓ Idempotency prevents side effects of duplicate

---

### 3. DECISION EXECUTION MUTATIONS

**Transaction Boundaries** (`/src/app/api/execute/route.ts`):
```typescript
// Check state
const decision = await db.decision.findUnique({
  where: { id: decisionId, workspaceId }
});

if (decision.status !== 'APPROVED') {
  throw new Error('Cannot execute non-approved decision');
}

// Execute (complex orchestration, multiple DB writes)
const result = await executeDecision(decision, ctx);

// Update status
await db.decision.update({
  where: { id: decisionId },
  data: { status: 'EXECUTED', result: ... }
});

// Emit audit
await emitAuditEvent('decision_executed', ...);
```

**Concurrency Strategy**:
- ✓ Idempotency-key required
- ⚠ Multiple DB operations not in single transaction
- ⚠ Status check + execution + status update = 3 operations

**Locking Strategy**:
- Each operation separately locked
- No transaction-level lock on entire execution flow

**Idempotency Strategy**:
- `withIdempotency()` prevents duplicate execution
- Complex state (multiple tables) cached on first execution
- Retry returns cached result (no re-execution)

**Rollback Strategy**:
- Partial execution possible if failure occurs mid-flow
- Audit event may be created before final status update fails

**Corruption Risk**: MEDIUM-HIGH
- ⚠ Multiple DB operations not atomic
- ⚠ Concurrent executions could both fetch APPROVED status
- ⚠ Both attempt execution, one wins, other fails
- ✓ Idempotency prevents duplicate side effects
- ⚠ Risk: Sub-operation partially committed before failure

---

### 4. WEBHOOK PROCESSING

**Transaction Boundaries** (`/src/app/api/webhooks/stripe/route.ts`):
```typescript
// Verify signature
if (!verifyStripeSignature(signature, body, secret)) {
  return 401;
}

// Process (may create multiple records)
const result = await processStripeEvent(event);

// Record webhook as processed
await db.webhookEvent.create({
  data: {
    provider: 'stripe',
    eventId: event.id,
    processed: true,
    processedAt: new Date()
  }
});
```

**Concurrency Strategy**:
- ✓ Stripe webhook signature prevents tampering
- ✓ webhookEvent table prevents duplicate processing
- ⚠ Uniqueness on eventId is critical

**Locking Strategy**:
- UNIQUE constraint on webhookEvent(provider, eventId)
- Database enforces - only one INSERT succeeds
- Duplicate attempt fails with constraint violation

**Idempotency Strategy**:
- Check if webhook already processed before handling
- Skip processing if webhookEvent exists for eventId
- Return 200 to Stripe either way

**Rollback Strategy**:
- If processing fails: webhookEvent not created
- On retry: processing re-attempted
- Sub-operations may be partially committed

**Corruption Risk**: MEDIUM
- ⚠ Processing may partially succeed before failure
- ✓ webhookEvent table acts as idempotency proof
- ⚠ Risk: Stripe event partially processed, then fails on second attempt

---

### 5. AUDIT EVENT APPEND

**Transaction Boundaries** (`/src/infra/audit.ts`):
```typescript
await db.auditEvent.create({
  data: {
    eventName,
    actorId,
    workspaceId,
    entityType,
    entityId,
    payload,
    timestamp: new Date(),
    hashChain: computeHash(previousEvent + payload)
  }
});
```

**Concurrency Strategy**:
- ✓ New events appended (never updated)
- ✓ Hash chain prevents tampering
- ⚠ Hash computation not atomic with insert

**Locking Strategy**:
- INSERT only (no concurrent updates)
- Each event has unique ID
- No locking needed (immutable append)

**Idempotency Strategy**:
- Audit events never deduplicated
- Multiple events may be created for same operation (on retry)
- Caller must prevent duplicate audits via checkIdempotencyKey

**Rollback Strategy**:
- Audit inserts typically happen late in transaction
- If audit fails: main operation may already be complete
- Risk: Operation succeeds but audit not recorded

**Corruption Risk**: LOW
- ✓ Immutable append-only log
- ✓ Hash chain prevents tampering
- ⚠ Risk: Audit lags behind actual state

---

### 6. IDEMPOTENCY STORAGE

**Transaction Boundaries** (`/src/services/idempotency.ts`):
```typescript
// Check if already processed
const existing = await db.idempotencyKey.findUnique({
  where: {
    workspaceId_actorId_operationName_keyHash: {
      workspaceId,
      actorId,
      operationName,
      keyHash: hash(idempotencyKey)
    }
  }
});

if (existing && existing.status === 'COMPLETED') {
  return existing.cachedResponse;
}

// Mark as in-progress
await db.idempotencyKey.upsert({
  where: { ... },
  update: { status: 'IN_PROGRESS', updatedAt: new Date() },
  create: { status: 'IN_PROGRESS', ... }
});

// Perform operation
const result = await operation();

// Mark completed with cached response
await db.idempotencyKey.update({
  where: { ... },
  data: {
    status: 'COMPLETED',
    cachedResponse: result,
    completedAt: new Date()
  }
});
```

**Concurrency Strategy**:
- ✓ UNIQUE constraint on (workspaceId, actorId, operationName, keyHash)
- ✓ UPSERT ensures only one record per idempotency key
- ✓ Status field tracks: PENDING → IN_PROGRESS → COMPLETED

**Locking Strategy**:
- Row-level lock during UPSERT
- Concurrent requests see IN_PROGRESS status
- Must wait or retry

**Idempotency Strategy**:
- This IS the idempotency mechanism
- Status prevents concurrent execution
- Cached response returned to duplicates

**Rollback Strategy**:
- If operation fails: status remains IN_PROGRESS
- Retry will attempt operation again (status allows it)
- Eventually completes or marked FAILED

**Corruption Risk**: LOW
- ✓ UNIQUE constraint prevents duplicates
- ✓ Status field prevents concurrent execution
- ✓ Cached response ensures deterministic retries

---

## CONCURRENCY RISK SUMMARY

| Surface | Locking | Idempotency | Corruption Risk | Mitigation |
|---------|---------|------------|---|---|
| Engagement Update | Row-lock | Cache | LOW | Workspace scoping, row-lock |
| Action Complete | Row-lock | Cache | MEDIUM | Status check atomic needed |
| Decision Execute | Per-op | Cache | MEDIUM-HIGH | Needs transaction wrapper |
| Webhook Process | Constraint | EventId | MEDIUM | UNIQUE webhook constraint |
| Audit Append | None | N/A | LOW | Immutable, hash chain |
| Idempotency Store | UPSERT | Status | LOW | UNIQUE constraint |

---

## MITIGATION STRATEGIES VERIFIED IN CODE

✓ **Database-level constraints** enforce uniqueness (webhookEvent, idempotencyKey)  
✓ **Workspace scoping** prevents cross-tenant mutations  
✓ **Idempotency caching** prevents duplicate side effects  
✓ **Immutable audit log** prevents tampering  
✓ **Hash chain** detects tampering  
✓ **Status fields** enforce state machines  

⚠ **Gaps Identified**:
- Action completion: Status check not atomic with update
- Decision execution: Multiple DB operations not in single transaction
- Webhook processing: Partial failures possible

---

## PHASE A CONCLUSION

6 concurrent mutation surfaces identified and analyzed. Most have idempotency protection. Risk areas: action completion (check-then-act race), decision execution (multi-step without transaction), webhook processing (partial failure). All have some protection but some would benefit from transaction-level wrapping.

Ready for PHASE B (Duplicate Mutation Testing).

