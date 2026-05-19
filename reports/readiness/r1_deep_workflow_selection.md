# R1 Deep Workflow Selection — Lifecycle Flow Analysis

**Date**: 2026-05-19  
**Phase**: R1-DEEP-WORKFLOW-EXECUTION-PROOF PHASE A

---

## SELECTED WORKFLOWS FOR DEEP RUNTIME PROOF

### 1. ENGAGEMENT LIFECYCLE FLOW (PRIMARY)

**State Transitions**:
```
INITIAL → CREATED → ACTIVE → UPDATED → COMPLETED/ARCHIVED
```

**Real Endpoints**:
- POST /api/engagements → CREATE (201)
- GET /api/engagements → LIST (200)
- GET /api/engagements/[id] → RETRIEVE (200)
- PATCH /api/engagements/[id] → UPDATE (200)

**Key Operations**:
1. `Create engagement` with:
   - Idempotency-Key header (must be provided)
   - Required: title, clientId, serviceTier, engagementMode, interventionMode
   - Optional: description, startDate, targetEndDate, ownerId, assignedConsultantId, parentEngagementId

2. `Retrieve engagement` to verify creation persisted

3. `Update engagement` (PATCH) to transition state

4. `Replay create` with same idempotency-key → Should return cached response

**Persistence Points**:
- DB: engagements table
- Audit: audit_events with eventName="engagement_created"

**Safety Requirements**:
- Idempotency-key prevents duplicate creation
- Workspace-scoped queries prevent cross-tenant access
- Audit events created for all mutations

---

### 2. ACTION LIFECYCLE FLOW (SECONDARY)

**State Transitions**:
```
OPEN → ASSIGNED → IN_PROGRESS → COMPLETED/CANCELLED
```

**Real Endpoints**:
- POST /api/actions → CREATE (201)
- GET /api/actions → LIST (200)
- GET /api/actions/[id] → RETRIEVE (200)
- PATCH /api/actions/[id] → UPDATE state/assignment (200)

**Key Operations**:
1. `Create action` with:
   - Idempotency-Key header (must be provided)
   - Required: engagementId, recommendationId, title, priority
   - Optional: description, dueDate, assignedTo

2. `Retrieve action` to verify creation persisted

3. `Update action` to change state or assign to user

4. `Replay create` with same idempotency-key → Should return cached response

**Persistence Points**:
- DB: actions table
- Audit: audit_events with eventName="action_created"

**Safety Requirements**:
- Requires existing engagement
- Requires existing recommendation
- Idempotency-key prevents duplicates
- Rate limiting enforced (requests/hour per workspace)

---

### 3. RECOMMENDATION/DECISION EXECUTION FLOW (TERTIARY)

**State Transitions**:
```
PROPOSED → APPROVED → EXECUTING → EXECUTED/FAILED
```

**Real Endpoints**:
- POST /api/recommendations → CREATE
- POST /api/decisions/[id]/execute → EXECUTE decision
- GET /api/decisions → RETRIEVE
- POST /api/scenarios → RUN scenario (orchestration)

**Key Operations**:
1. `Create recommendation` (or retrieve existing)
2. `Execute recommendation` → triggers workflow
3. `Retrieve execution result` → verify state transition
4. `Replay execution` with same idempotency-key → Should block duplicate

**Persistence Points**:
- DB: decisions/recommendations table
- DB: execution_results table
- Audit: audit_events for all transitions

---

## PREREQUISITE DATA STRUCTURE

For testing, need to establish:

```
Workspace
  ├── User (authenticated)
  ├── Client
  │   └── Engagement
  │       ├── Action (requires Recommendation)
  │       ├── Recommendation
  │       │   └── Decision
  │       └── Deliverable
  └── Audit Events (immutable log)
```

**Test User**: user2@example.com (already created, authenticated)  
**Test Workspace**: 30000000-0000-0000-0000-000000000002 (User 2's workspace)  
**Test Client**: Need to create during PHASE B  
**Test Engagement**: Need to create during PHASE B  

---

## RUNTIME PROOF STRATEGY

**PHASE B - Engagement Lifecycle**:
1. Create engagement with Idempotency-Key-001
2. Retrieve and verify in DB
3. Update engagement (change description)
4. Verify update persisted
5. Query audit trail → verify creation event
6. Replay create with Idempotency-Key-001 → Should get cached 201 response
7. Attempt invalid workspace header → 401/403
8. Attempt without session → 401

**PHASE C - Action Lifecycle**:
1. Create action with Idempotency-Key-002 (requires engagement from PHASE B)
2. Retrieve and verify
3. Update action (assign, change priority, mark done)
4. Verify state transition persisted
5. Query audit trail → verify action events
6. Replay create with Idempotency-Key-002 → Cached response
7. Attempt invalid transition → Proper error
8. Attempt from different workspace → 401

**PHASE D - Decision/Recommendation Execution**:
1. Create recommendation (or use existing)
2. Execute recommendation
3. Verify execution result persisted
4. Verify audit chain
5. Replay execution → Duplicate prevented
6. Attempt invalid execution state → Error

**PHASE E - Consistency Checks**:
- Verify no orphaned records created
- Verify audit consistency across all operations
- Verify workspace-scoping maintained through all mutations
- Verify rollback behavior on failures

---

## EXPECTED OUTCOMES (from code analysis)

**Engagement Lifecycle**: Should complete without 500 errors, persist to DB, create audit events, prevent duplicates via idempotency-key

**Action Lifecycle**: Should require engagement, enforce rate limits, create audit events, prevent duplicates via Idempotency-Key, handle state transitions

**Decision Execution**: Should create execution records, audit all transitions, prevent duplicate executions

**All Workflows**: Should maintain tenant isolation, enforce authorization, preserve audit consistency

---

## PHASE A CONCLUSION

Selected 3 representative workflows spanning different complexity levels:
1. **Engagement** - Fundamental master entity (all features: create, update, retrieve)
2. **Action** - Dependent entity with state transitions (requires engagement)
3. **Decision** - Complex orchestration with execution lifecycle

All workflows have clear state transition paths and audit requirements.
All workflows enforce workspace-scoping, capability checking, and idempotency.

Ready for PHASE B (Real Engagement Lifecycle Testing).

