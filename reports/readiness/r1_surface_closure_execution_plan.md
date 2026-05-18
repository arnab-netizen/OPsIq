# R1-SURFACE-CLOSURE: Execution Plan

**Date:** 2026-05-18  
**Phase:** R1-SURFACE-CLOSURE Execution Plan  
**Status:** ✓ EXECUTION PLAN COMPLETE

---

## A. Execution Overview

**Objective:** Close all dangerous production surfaces to enable safe beta launch, then paid launch, then enterprise

**Approach:** Fix highest-risk, smallest-effort surfaces first. Parallelize with ongoing wrapper modernization (Batches 4-5).

**Timeline:** 
- GROUP 1: Week 0 (1 hour, decision point)
- GROUP 2: Weeks 1-3 (19 hours, parallel with batches)
- GROUP 3: Weeks 4-5 (7 hours, post-beta)
- GROUP 4: Post-launch (2 hours, optional)

---

## B. GROUP 1: VERIFICATION SPRINT (1 hour, Week 0)

**Mission:** Verify billing-upgrade idempotency before beta authorization

### Task 1.1: Read Billing Upgrade Handler
```
File: src/app/api/billing/upgrade/route.ts

Checklist:
  [ ] Handler reads "idempotency-key" header from request
  [ ] Deduplication key is constructed: "checkout:{workspaceId}:{idempotencyKey}"
  [ ] Check if idempotency key already exists in dedup store
  [ ] If exists: return cached Stripe session URL
  [ ] If not: create new Stripe session + store result
  [ ] Stripe session includes unique idempotencyToken (Stripe API)
  [ ] Duplicate requests are rejected or cached (not double-created)
  
If ANY item unchecked: PLAN 2-HOUR IDEMPOTENCY IMPLEMENTATION
If ALL items checked: APPROVE BETA LAUNCH
```

### Task 1.2: Report Findings
```
Output: Single decision
  ✓ IDEMPOTENT: Billing upgrade is safe, beta can launch
  ✗ NOT IDEMPOTENT: Plan 2-hour fix in Week 1, beta launch delayed 1 day
  
Report: reports/readiness/r1_surface_closure_verification_result.md
```

---

## C. GROUP 2: STATE MACHINE IMPLEMENTATION (19 hours, Weeks 1-3)

**Mission:** Close 4 HIGH-risk surfaces with idempotency + state machine

**Team:** 1-2 engineers (parallelize with batches 4-5)

**Execution Strategy:**
- Each surface is independent (no cross-dependencies)
- Can implement in any order (recommend risk-highest first)
- Each surface follows same pattern: idempotency + state validation + atomic update + audit emit
- All share same deduplication infrastructure (implement once, reuse 4x)

### Shared Infrastructure (Pre-Step, 2 hours)

**Setup:** Create reusable idempotency + deduplication system

```
File: src/lib/idempotency-dedup.ts (NEW)

Interface:
  - storeDedup(key: string, result: any, ttl?: seconds) → Promise<void>
  - getDedup(key: string) → Promise<any | null>
  - atomicDedup(key: string, generateFn: () => Promise<any>) → Promise<any>
    (generate if missing, return cached if exists)

Usage:
  const result = await atomicDedup(
    `decision_execute:{decisionId}:{idempotencyKey}`,
    () => executeDecisionLogic(decisionId, workspaceId, userId)
  )

Implementation:
  - Use Redis or memory store (existing infrastructure)
  - TTL: 24 hours default
  - Key format: `{surface}:{resource}:{idempotencyKey}`
  - Handles race condition: first writer wins
```

**Status:** Implement once, reuse in all 4 surfaces

### Surface 2.1: Decision Execute Idempotency + State Machine (4 hours)

**File:** src/app/api/decisions/[decisionId]/execute/route.ts

**Current State:**
```typescript
export const POST = withEnforcementFull(async (request, ctx, params) => {
  const { session } = await withAuth(); // ← UNSAFE
  const userId = session.user.id;
  const decisionId = params.decisionId;
  
  const decision = await db.operatorItem.findFirst(...);
  // NO STATE CHECK
  // NO IDEMPOTENCY
  
  const updated = await executeDecision(decisionId, workspaceId, userId, idempotencyKey);
  return { decisionId, status: updated.status };
});
```

**Target State:**
```typescript
export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const { decisionId } = ctx.params;
  const idempotencyKey = ctx.request!.headers.get("idempotency-key");
  
  if (!idempotencyKey) {
    throw new Error("idempotency-key required");
  }
  
  // IDEMPOTENCY: Use atomicDedup
  const result = await atomicDedup(
    `decision_execute:{decisionId}:{idempotencyKey}`,
    async () => {
      // Verify decision exists and is APPROVED
      const decision = await db.operatorItem.findFirst({
        where: { id: decisionId, workspaceId: ctx.verifiedWorkspaceId }
      });
      
      if (!decision) throw new Error("Decision not found");
      if (decision.status !== "APPROVED") {
        throw new Error("Decision not in APPROVED state");
      }
      
      // ATOMIC UPDATE
      return await executeDecision(decisionId, ctx.verifiedWorkspaceId, ctx.verifiedActorId);
    }
  );
  
  return { decisionId, status: result.status };
}, { requireCapabilities: [CAPABILITIES.DECISION_EXECUTE] });
```

**Acceptance Criteria:**
- [ ] Idempotency-key required (400 if missing)
- [ ] Deduplication works (request 1 executes, request 2 returns cached)
- [ ] State machine verified (409 if not APPROVED)
- [ ] Audit event emitted
- [ ] Workspace isolation enforced
- [ ] Test: duplicate requests return same result, no duplicate execution

---

### Surface 2.2: Action Complete Idempotency + State Machine (4 hours)

**File:** src/app/api/actions/[actionId]/complete/route.ts

**Implementation:** Same pattern as Decision Execute
- Read idempotency-key
- atomicDedup on action completion
- Verify action is PENDING before completion
- Emit audit event with completion timestamp + actor
- Return cached result on duplicate

**Acceptance Criteria:**
- [ ] Idempotency-key required
- [ ] Deduplication works
- [ ] State verified (409 if not PENDING)
- [ ] Audit event emitted
- [ ] Duplicate returns same timestamp + actor
- [ ] Test: duplicate requests show same completion time

---

### Surface 2.3: Engagement Condition Update Idempotency + Loop Prevention (5 hours)

**File:** src/app/api/engagements/[engagementId]/condition/route.ts

**Current Problem:** Re-evaluation can trigger condition update, which triggers re-evaluation = loop

**Solution:** Loop Prevention Pattern
```
Pattern:
  1. Condition change is idempotent (deduped)
  2. Re-evaluation runs ASYNCHRONOUSLY (not in same transaction)
  3. Re-evaluation MUST NOT modify condition (enforced in code)
  4. Separate transaction: condition update vs re-evaluation trigger

Implementation:
  export const POST = withCanonicalEnforcement(async (ctx) => {
    const { engagementId } = ctx.params;
    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    
    const result = await atomicDedup(
      `condition_update:{engagementId}:{idempotencyKey}`,
      async () => {
        // TRANSACTION 1: Update condition atomically
        const engagement = await db.$transaction(async (tx) => {
          const eng = await tx.engagement.findFirst({
            where: { id: engagementId, workspaceId: ctx.verifiedWorkspaceId }
          });
          
          if (!eng) throw new Error("Engagement not found");
          
          // Validate condition for current phase
          validateConditionForPhase(newCondition, eng.interventionPhase);
          
          return await tx.engagement.update({
            where: { id: engagementId },
            data: {
              condition: newCondition,
              conditionChangedAt: new Date(),
              conditionChangedBy: ctx.verifiedActorId
            }
          });
        });
        
        // TRANSACTION 2: Trigger re-evaluation asynchronously
        // This is SEPARATE, so re-eval can't loop back
        queueReEvaluation(engagementId);
        
        return { condition: engagement.condition };
      }
    );
    
    return result;
  });
```

**Acceptance Criteria:**
- [ ] Condition change is idempotent
- [ ] New condition validated for current phase
- [ ] Re-evaluation is async (separate transaction)
- [ ] Re-evaluation code explicitly prevents condition modification
- [ ] Audit event shows previous + new condition
- [ ] Test: condition loop scenario prevented
- [ ] Test: duplicate requests cached

---

### Surface 2.4: Intervention State Change State Machine + Cascade (6 hours)

**File:** src/app/api/engagements/[engagementId]/intervention-state/route.ts

**Challenge:** Enforce phase sequence + validate prerequisites + cascade atomically

**Implementation:** State Machine + Prerequisite Validation
```
VALID SEQUENCE:
  ANALYSIS → PLANNING → EXECUTION → MONITORING → CLOSURE

PREREQUISITES:
  ANALYSIS: engagement created
  PLANNING: engagement has condition
  EXECUTION: engagement has at least one decision
  MONITORING: engagement has executing actions
  CLOSURE: all actions completed

CODE PATTERN:
  export const POST = withCanonicalEnforcement(async (ctx) => {
    const { engagementId } = ctx.params;
    const { newPhase } = await ctx.request!.json();
    
    const engagement = await db.engagement.findFirst({
      where: { id: engagementId, workspaceId: ctx.verifiedWorkspaceId }
    });
    
    if (!engagement) throw new Error("Engagement not found");
    
    // STATE MACHINE: Verify valid transition
    const validTransitions = {
      ANALYSIS: ["PLANNING"],
      PLANNING: ["EXECUTION"],
      EXECUTION: ["MONITORING"],
      MONITORING: ["CLOSURE"],
      CLOSURE: [] // Terminal state
    };
    
    if (!validTransitions[engagement.interventionPhase]?.includes(newPhase)) {
      throw new Error(`Invalid transition: ${engagement.interventionPhase} → ${newPhase}`, 409);
    }
    
    // PREREQUISITES: Validate target phase requirements
    switch (newPhase) {
      case "PLANNING":
        // OK, no special requirements
        break;
      case "EXECUTION":
        const hasDecisions = await db.operatorItem.count({
          where: { engagementId, type: "DECISION" }
        });
        if (hasDecisions === 0) {
          throw new Error("Cannot execute without decisions", 409);
        }
        break;
      case "CLOSURE":
        const incompleteActions = await db.action.count({
          where: { engagementId, status: { not: "COMPLETED" } }
        });
        if (incompleteActions > 0) {
          throw new Error("Cannot close with incomplete actions", 409);
        }
        break;
    }
    
    // ATOMIC TRANSITION + CASCADE
    const result = await db.$transaction(async (tx) => {
      // Step 1: Update phase
      const eng = await tx.engagement.update({
        where: { id: engagementId },
        data: {
          interventionPhase: newPhase,
          phaseChangedAt: new Date(),
          phaseChangedBy: ctx.verifiedActorId
        }
      });
      
      // Step 2: Archive old recommendations
      await tx.recommendation.updateMany({
        where: { engagementId, phase: engagement.interventionPhase },
        data: { archived: true }
      });
      
      // Step 3: Re-evaluate recommendations for new phase
      const recommendations = await tx.recommendation.findMany({
        where: { engagementId }
      });
      
      for (const rec of recommendations) {
        if (isApplicableToPhase(rec.template, newPhase)) {
          await tx.recommendation.update({
            where: { id: rec.id },
            data: { phase: newPhase }
          });
        }
      }
      
      // Step 4: Emit audit event
      await tx.auditEvent.create({
        data: {
          event: "INTERVENTION_PHASE_CHANGED",
          actorId: ctx.verifiedActorId,
          resourceId: engagementId,
          data: {
            previousPhase: engagement.interventionPhase,
            newPhase: newPhase
          }
        }
      });
      
      return eng;
    });
    
    return { phase: result.interventionPhase };
  });
```

**Acceptance Criteria:**
- [ ] Valid transitions enforced (409 on invalid)
- [ ] Phase prerequisites validated
- [ ] Atomic transition (phase + cascade)
- [ ] Old recommendations archived
- [ ] New recommendations created for phase
- [ ] Audit event emitted
- [ ] Workspace isolation enforced
- [ ] Test: invalid transition rejected
- [ ] Test: prerequisites verified
- [ ] Test: cascade atomic (all or nothing)

---

## D. GROUP 3: AUDIT TRAIL IMPLEMENTATION (7 hours, Weeks 4-5)

**Mission:** Close 3 MEDIUM-risk surfaces with audit trail + idempotency

**Timeline:** After beta stability confirmed

### Surface 3.1: Evidence Validation Idempotency + Audit (2 hours)
- Add idempotency-key handling
- Emit audit event: evidence validated (include validator, timestamp, previous status)
- Update finding credibility atomically
- Test: duplicate validation returns same result

### Surface 3.2: Finding Creation Cross-Aggregate Validation (3 hours)
- Validate evidence exists in workspace (foreign key check)
- Prevent duplicate findings (unique constraint: engagementId + evidenceId)
- Trigger recommendation generation atomically
- Emit audit event: finding created + evidence linked
- Test: evidence validation prevents orphans

### Surface 3.3: Recommendation Rerank Idempotency + Audit (2 hours)
- Add idempotency-key handling
- Store previous ranking for audit trail
- Emit audit event: recommendations reranked (include old order)
- Test: original ranking auditable, duplicate requests cached

---

## E. GROUP 4: OPERATIONAL CLEANUP (2 hours, Post-Launch, Optional)

**Mission:** Operational polish, defer acceptable

### Surface 4.1: Engagement Acknowledge Idempotency (1 hour)
- Add idempotency-key
- Cache acknowledgement result
- Prevent duplicate notifications

### Surface 4.2: Webhook Test Idempotency (1 hour)
- Add idempotency-key
- Cache test event result
- Prevent duplicate test events to customer

---

## F. Implementation Sequence

### Week 0 (1 hour)
```
[ ] Task 1.1: Verify billing-upgrade idempotency
[ ] Task 1.2: Report findings (approval gate)
```

### Weeks 1-3 (19 hours, Parallel with Batches 4-5)
```
Batch Week 1:
  [ ] Create idempotency infrastructure (2 hours)
  [ ] Surface 2.1: Decision Execute (4 hours)
  [ ] Surface 2.2: Action Complete (4 hours)
  
Batch Week 2:
  [ ] Surface 2.3: Engagement Condition (5 hours)
  
Batch Week 3:
  [ ] Surface 2.4: Intervention State (6 hours)
  [ ] Integration testing (3 hours)

Gate: All HIGH surfaces closed before beta authorization
```

### Weeks 4-5 (7 hours, After Beta)
```
Week 4:
  [ ] Surface 3.1: Evidence Validation (2 hours)
  [ ] Surface 3.2: Finding Creation (3 hours)
  
Week 5:
  [ ] Surface 3.3: Recommendation Rerank (2 hours)
  [ ] Integration testing (2 hours)

Gate: All MEDIUM surfaces closed before paid launch
```

### Post-Launch (2 hours, Optional)
```
[ ] Surface 4.1: Acknowledge Idempotency (1 hour)
[ ] Surface 4.2: Webhook Test Idempotency (1 hour)
```

---

## G. Testing Strategy

### Unit Tests
```
For each surface:
  - Normal operation: idempotency-key present
  - Idempotent request: same idempotency-key returns cached result
  - State validation: 409 if preconditions not met
  - Audit event: emitted correctly with actor + timestamp
  - Workspace isolation: scoped to verified workspace only
```

### Integration Tests
```
- Duplicate request scenarios (network retries)
- State machine sequence validation
- Cascade atomicity (all or nothing)
- Audit trail completeness
- Concurrent requests (race condition handling)
```

### Load Tests
```
- Deduplication performance (Redis lookup)
- Concurrent idempotent requests
- Cascade performance at scale
```

---

## H. Rollout Strategy

### Controlled Rollout
```
Stage 1: Deploy to staging
  - Run full integration test suite
  - Verify deduplication works
  - Verify audit trail complete
  
Stage 2: Deploy to production
  - Feature flag: surfaces behind feature flag initially
  - Monitor error rates, audit events
  - Gradually enable for all users
  
Stage 3: Validation
  - Monitor duplicate event rates (should be 0)
  - Verify audit trails in production
  - Check for any regression in other endpoints
```

---

## I. Success Metrics

| Metric | Target | Validation |
|--------|--------|-----------|
| Decision Execute Duplicates | 0 | No duplicate executions in audit log |
| Action Complete Duplicates | 0 | No duplicate completions in audit log |
| Condition Update Loops | 0 | No infinite re-evaluation cycles |
| Intervention Phase Violations | 0 | No invalid state transitions |
| Evidence Validation Duplicates | 0 | Single validation per evidence |
| Finding Orphans | 0 | No evidence without finding |
| Audit Coverage | 100% | All state changes audited |
| Idempotency Hit Rate | >50% | > 50% of requests are retries (deduped) |

---

**Status: ✓ R1-SURFACE-CLOSURE EXECUTION PLAN COMPLETE**

**Next Step:** Week 0 - Execute GROUP 1 verification (1 hour decision point)
