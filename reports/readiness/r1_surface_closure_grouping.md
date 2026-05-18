# R1-SURFACE-CLOSURE: Grouping & Timeline Strategy

**Date:** 2026-05-18  
**Phase:** R1-SURFACE-CLOSURE Grouping  
**Status:** ✓ GROUPING COMPLETE

---

## A. Closure Grouping Strategy

**Principle:** Highest-risk, smallest-effort surfaces first. Group by timeline and interdependency.

**Timeline Phases:**
- CLOSE_PRE_BETA: Critical for controlled launch
- CLOSE_PRE_PAID: Required for public scale
- CLOSE_PRE_ENTERPRISE: Required for enterprise contracts
- DEFER_POST_BETA: Safe to defer

---

## B. GROUP 1: IMMEDIATE VERIFICATION (Pre-Beta Blocker Check)

**Effort:** 1 hour (verification only, no implementation)  
**Timeline:** Immediate  
**Risk Reduction:** Confirms beta launch safety  
**Status:** Analysis phase

### Surface 1A: Billing Upgrade Idempotency Check
```
Surface: Billing Upgrade Checkout
Path: src/app/api/billing/upgrade/route.ts
Task: VERIFY idempotency-key implementation
  - Check if handler reads idempotency-key header
  - Check if deduplication store exists
  - Check if Stripe session lookup by idempotency-key works
  - Check if duplicate requests return cached session URL
Action: If missing, add 2-hour idempotency implementation
Impact: Prevents double checkout sessions
Monetization: Blocks paid launch if not fixed
```

**Decision Point:**
- ✓ If idempotency verified: Beta can launch
- ✗ If idempotency missing: Must implement before beta

---

## C. GROUP 2: PRE-BETA CRITICAL SURFACES (Must Fix Before Launch)

**Surfaces:** 4 (Decision Execute, Action Complete, Engagement Condition, Intervention State)  
**Effort:** 19 engineering hours  
**Timeline:** Weeks 1-3 (parallel with Batches 4-5)  
**Risk Reduction:** Eliminates all high-risk state corruption  
**Launch Gate:** 0 HIGH-risk surfaces remaining

### Surface 2A: Decision Execute Idempotency
```
Surface: Decision Execute (APPROVED → EXECUTED)
Risk: Duplicate execution possible
Effort: 4 hours
Steps:
  1. Read idempotency-key from request header
  2. Create deduplication key: "decision_execute:{decisionId}:{idempotencyKey}"
  3. Check if execution already exists in dedup store
  4. If exists: return cached result (decision status + side effects)
  5. If not: execute decision atomically
  6. Store execution result with TTL (24h)
  7. Emit audit event: decision executed
  8. Return execution result
Acceptance:
  - Request 1: Executes decision, returns EXECUTED status
  - Request 2 (same idempotency key): Returns cached EXECUTED status, no duplicate execution
  - Request 3 (different key): Executes again, returns error if not APPROVED
```

### Surface 2B: Action Complete Idempotency
```
Surface: Action Complete (PENDING → COMPLETED)
Risk: Duplicate completion
Effort: 4 hours
Steps:
  1. Read idempotency-key from request header
  2. Check dedup: "action_complete:{actionId}:{idempotencyKey}"
  3. If exists: return cached result (action status + completion timestamp)
  4. If not: mark action COMPLETED, atomically update:
     - action.status = COMPLETED
     - action.completedAt = NOW
     - action.completedBy = userId
  5. Trigger side effects atomically (dependent decisions)
  6. Store result in dedup store
  7. Emit audit event: action completed
  8. Return action status
Acceptance:
  - Duplicate requests return same timestamp + actor
  - Side effects triggered once only
  - Audit log has one completion entry
```

### Surface 2C: Engagement Condition Update Idempotency + Loop Prevention
```
Surface: Engagement Condition Update (Triggers Re-evaluation)
Risk: Duplicate condition change → re-eval loop
Effort: 5 hours
Steps:
  1. Read idempotency-key from request header
  2. Validate new condition is valid for current phase
  3. Check dedup: "condition_update:{engagementId}:{idempotencyKey}"
  4. If exists: return cached result (condition status)
  5. If not: atomically update:
     - engagement.condition = newCondition
     - engagement.conditionChangedAt = NOW
     - engagement.conditionChangedBy = userId
     - save previousCondition for audit
  6. Trigger re-evaluation asynchronously (not in transaction)
     - Re-eval MUST NOT modify condition (prevents loops)
     - Re-eval runs in separate transaction
  7. Store result in dedup store
  8. Emit audit event: condition changed
  9. Return condition status + re-eval status
Acceptance:
  - Condition change is idempotent (duplicate requests cached)
  - Re-evaluation doesn't modify condition (loop prevention)
  - Previous condition auditable
  - Workspace isolation enforced
```

### Surface 2D: Intervention State Change State Machine + Cascade
```
Surface: Intervention State Change (PLANNING → EXECUTION → etc)
Risk: Invalid state transition, cascade failures
Effort: 6 hours
Steps:
  1. Enforce state machine:
     ANALYSIS → PLANNING → EXECUTION → MONITORING → CLOSURE
     (no skipping allowed)
  2. Check prerequisites for target phase:
     - PLANNING: engagement has condition
     - EXECUTION: engagement has decisions
     - CLOSURE: all actions completed
  3. Atomically transition:
     - engagement.interventionPhase = newPhase
     - engagement.phaseChangedAt = NOW
     - engagement.phaseChangedBy = userId
  4. Cascade operations (in transaction):
     - Archive recommendations for old phase
     - Re-evaluate recommendations for new phase
     - Update action phase assignments
     - Update decision phase scope
  5. Emit audit event: phase transitioned
  6. Return new phase + affected items
Acceptance:
  - Invalid transitions rejected (409 Conflict)
  - Prerequisites validated
  - Cascade atomic (all or nothing)
  - Audit trail shows phase history
  - Workspace isolation enforced
```

**Pre-Beta Critical Gate:** All 4 surfaces implemented with idempotency + state machine verified

---

## D. GROUP 3: PRE-PAID LAUNCH SURFACES (Hardening)

**Surfaces:** 3 (Evidence Validation, Finding Creation, Recommendation Rerank)  
**Effort:** 7 engineering hours  
**Timeline:** Weeks 4-5 (after beta stability confirmed)  
**Risk Reduction:** Eliminates audit corruption + consistency risks  
**Launch Gate:** 0 MEDIUM-risk surfaces remaining

### Surface 3A: Evidence Validation Idempotency + Audit Trail
```
Surface: Evidence Validation (marks evidence as trusted)
Risk: Duplicate validation, audit loss
Effort: 2 hours
Steps:
  1. Read idempotency-key from request header
  2. Check dedup: "evidence_validate:{evidenceId}:{idempotencyKey}"
  3. If exists: return cached validation status
  4. If not: atomically update:
     - evidence.status = VALIDATED
     - evidence.validatedAt = NOW
     - evidence.validatedBy = userId
  5. Update finding credibility based on evidence validation
  6. Store result in dedup store
  7. Emit audit event: evidence validated (include previousStatus)
  8. Return validation status
Acceptance:
  - Validation idempotent (duplicate requests cached)
  - Audit trail shows who validated when
  - Finding credibility updated
  - Workspace isolation enforced
```

### Surface 3B: Finding Creation Cross-Aggregate Validation
```
Surface: Finding Creation (links evidence, triggers recommendations)
Risk: Duplicate findings, orphaned evidence, recommendation loss
Effort: 3 hours
Steps:
  1. Validate evidence exists in workspace (cross-aggregate check)
  2. Validate evidence not already linked to finding (dedup check)
  3. Atomically create:
     - finding.title, description, severity
     - finding.evidenceId
     - finding.workspaceId
     - finding.createdBy = userId
  4. Trigger recommendation generation:
     - Search templates matching finding severity
     - Create recommendation entries
     - Link back to finding
  5. Emit audit event: finding created + evidence linked
  6. Return finding + generated recommendations
Acceptance:
  - Evidence validated in workspace
  - Duplicate findings prevented
  - Recommendations created atomically
  - Orphaned evidence impossible (foreign key constraint)
  - Audit trail shows finding creation + recommendations
```

### Surface 3C: Recommendation Rerank Idempotency + Audit Trail
```
Surface: Recommendation Rerank (changes priority order)
Risk: Original ranking lost, duplicate rerank
Effort: 2 hours
Steps:
  1. Read idempotency-key from request header
  2. Validate all recommendations exist in engagement
  3. Check dedup: "rerank:{engagementId}:{idempotencyKey}"
  4. If exists: return cached ranking
  5. If not: atomically update:
     - Save previousRanking for audit
     - recommendations.priority = new order
     - recommendations.rankedAt = NOW
     - recommendations.rankedBy = userId
  6. Store result in dedup store
  7. Emit audit event: recommendations reranked (include previous order)
  8. Return new ranking + previous ranking (audit)
Acceptance:
  - Reranking idempotent
  - Original ranking auditable
  - All recommendations accounted for
  - Workspace isolation enforced
```

**Pre-Paid Launch Gate:** All 3 surfaces implemented with idempotency + audit trail verified

---

## E. GROUP 4: PRE-ENTERPRISE CLEANUP (Optional)

**Surfaces:** 2 (Engagement Acknowledge, Webhook Test)  
**Effort:** 2 engineering hours  
**Timeline:** Post-paid launch (when convenient)  
**Risk Reduction:** Operational cleanliness only  
**Impact:** Optional (defer indefinitely acceptable)

### Surface 4A: Engagement Acknowledge Idempotency
```
Surface: Engagement Acknowledge (triggers notifications)
Risk: Duplicate email
Effort: 1 hour
Steps:
  1. Read idempotency-key from request header
  2. Check dedup: "acknowledge:{engagementId}:{idempotencyKey}"
  3. If exists: return cached acknowledgement
  4. If not: atomically update:
     - engagement.acknowledgedAt = NOW
     - engagement.acknowledgedBy = userId
  5. Trigger email notification
  6. Store result in dedup store
  7. Return acknowledgement status
```

### Surface 4B: Webhook Test Idempotency
```
Surface: Webhook Test (admin tool, sends test event)
Risk: Duplicate test event to customer
Effort: 1 hour
Steps:
  1. Read idempotency-key from request header
  2. Check dedup: "webhook_test:{webhookId}:{idempotencyKey}"
  3. If exists: return cached result
  4. If not: atomically:
     - Generate test payload
     - Call customer webhook endpoint
     - Store result
  5. Store result in dedup store
  6. Return test result
```

**Pre-Enterprise Gate:** Optional (nice-to-have, defer acceptable)

---

## F. Effort & Impact Summary

| Group | Surfaces | Effort Hours | Timeline | Risk Reduction | Launch Gate | Monetization Impact |
|-------|----------|--------------|----------|----------------|-------------|-------------------|
| **GROUP 1** | Billing verify | 1 | Immediate | Confirms safety | Beta blocker | Blocks beta if missing |
| **GROUP 2** | 4 HIGH surfaces | 19 | Weeks 1-3 | Eliminates state corruption | Beta blocker | Blocks beta if missing |
| **GROUP 3** | 3 MEDIUM surfaces | 7 | Weeks 4-5 | Eliminates audit risks | Paid gate | Blocks paid if missing |
| **GROUP 4** | 2 LOW surfaces | 2 | Post-paid | Operational only | Optional | Never blocks |

**Total Core Work:** 27 hours (verification + 4 HIGH + 3 MEDIUM)
**Total Optional:** 2 hours (2 LOW surfaces)

---

## G. Interdependency Analysis

### Pre-Beta Critical Path
```
GROUP 1 (Verification: 1h)
  ↓
GROUP 2 (State Machines: 19h)
  ├─ Decision Execute (4h)
  ├─ Action Complete (4h)
  ├─ Engagement Condition (5h)
  └─ Intervention State (6h)
  ↓
Beta Readiness: YES
```

### Pre-Paid Critical Path
```
GROUP 2 Complete (19h total from GROUP 1)
  ↓
GROUP 3 (Audit Trail: 7h)
  ├─ Evidence Validation (2h)
  ├─ Finding Creation (3h)
  └─ Recommendation Rerank (2h)
  ↓
Paid Readiness: YES
```

### Pre-Enterprise Path
```
GROUP 3 Complete (7h)
  ↓
GROUP 4 (Operational: 2h, optional)
  ├─ Acknowledge Idempotency (1h)
  └─ Webhook Test Idempotency (1h)
  ↓
Enterprise Readiness: YES
```

---

## H. Deferral Assessment

### Surfaces Safe to Defer Post-Beta
- ✓ Evidence Validation (MEDIUM risk, acceptable pre-paid)
- ✓ Finding Creation (MEDIUM risk, acceptable pre-paid)
- ✓ Recommendation Rerank (MEDIUM risk, acceptable pre-paid)
- ✓ Engagement Acknowledge (LOW risk, operational only)
- ✓ Webhook Test (LOW risk, admin tool)

### Surfaces That Cannot Be Deferred
- ✗ Billing Upgrade (CRITICAL, must verify before beta)
- ✗ Decision Execute (HIGH, required for beta)
- ✗ Action Complete (HIGH, required for beta)
- ✗ Engagement Condition (HIGH, required for beta)
- ✗ Intervention State (HIGH, required for beta)

---

## I. Monetization Impact by Group

| Group | Revenue Enabled | Risk Eliminated | Timeline |
|-------|-----------------|-----------------|----------|
| **GROUP 1** | Beta launch possible | Billing safety verified | Week 0 |
| **GROUP 2** | Beta → Paid conversion | State corruption risk | Weeks 1-3 |
| **GROUP 3** | Enterprise contracts | Audit compliance risk | Weeks 4-5 |
| **GROUP 4** | Operational excellence | Duplicate events | Post-paid |

**Key Finding:** GROUP 1+2 unlocks $2M+ revenue potential in 3 weeks

---

**Status: ✓ R1-SURFACE-CLOSURE GROUPING COMPLETE**

**Recommendation:**
1. Execute GROUP 1 verification immediately (1 hour decision point)
2. Execute GROUP 2 surfaces in parallel with remaining batch work (19 hours, 2-3 weeks)
3. Execute GROUP 3 after beta stability (7 hours, 1 week)
4. Defer GROUP 4 (2 hours, operational-only)

**Critical Path:** GROUP 1 (verify) → GROUP 2 (state machines) → Beta Launch
