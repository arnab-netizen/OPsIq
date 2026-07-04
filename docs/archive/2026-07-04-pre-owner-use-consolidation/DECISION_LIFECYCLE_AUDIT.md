# Decision Lifecycle Audit Report

**Date**: 2026-05-02  
**Scope**: Complete decision lifecycle - states, transitions, mutations, execution, outcomes, audit events  
**Status**: AUDIT ONLY - No implementations

---

## Executive Summary

Comprehensive audit of OpsIQ decision lifecycle reveals:

- ✅ **Decision States**: Well-defined (pending, in_progress, done, failed, blocked)
- ✅ **Lifecycle Tracking**: Infrastructure in place (DecisionLifecycle model, recordLifecycleStage service)
- ⚠️ **Gaps Identified**: 
  - Lifecycle recording NOT integrated into mutation routes
  - Missing explicit DECISION_* audit events
  - Execution recording partially implemented
  - Outcome recording depends on action completion (not decision-scoped)
  - ROI/Impact tracking depends on multiple disconnected sources
  - No explicit orphaned/skipped decision detection

---

## 1. Current Decision States & Enums

### OperatorItem Status (Primary Decision State)
**Location**: `prisma/schema.prisma` lines 660-731

```typescript
status: String @default("pending")
  // Possible values: "pending" | "in_progress" | "done" | "failed" | "blocked"
```

**Definition Location**: No TypeScript enum defined  
**Gap**: Status values are hardcoded strings, no type safety

### OperatorItem Execution Status (Separate)
```typescript
executionStatus: String @default("not_started")
  // Possible values: "not_started" | "started" | "completed"
```

**Gap**: Two status fields (status + executionStatus) create dual state machine

### Decision Block State
```typescript
blockStage: String? @map("block_stage")
  // Possible values: "dependency_validation" | "decision_gate" | "guardrails"

blockReason: String? @map("block_reason")
```

**Gap**: blockStage only recorded AFTER evaluation, not during initial creation

### DecisionLifecycle Stages (Observability Only)
**Location**: `src/services/lifecycle/decision-lifecycle.ts` lines 8-16

```typescript
type LifecycleStage = 
  | "RECEIVED"
  | "VALIDATED"
  | "NORMALIZED"
  | "GATED"
  | "GUARDRAIL_CHECKED"
  | "APPROVED"
  | "BLOCKED"
  | "ERRORED"

type LifecycleStatus = "success" | "blocked" | "error"
```

**Issue**: These stages describe the processing pipeline, not decision lifecycle

---

## 2. State Transition Paths

### Discovered Transition Paths (OperatorItem)

#### Path 1: Happy Path (Approved → Completed)
```
CREATED (pending)
  ↓
EVALUATED via /api/decisions/[decisionId]/evaluate
  ↓ [if approved, no blockStage]
APPROVED (status=pending → status=approved via PATCH)
  ↓
EXECUTED (executionStatus: not_started → started via executeDecision)
  ↓
COMPLETED (executionStatus: completed via markSuccess)
```

**Routes**: 
- POST /api/decisions/[decisionId]/evaluate (line 82-180)
- PATCH /api/decisions/[decisionId] (line 21-173)
- src/services/execution/execution-service.ts:executeDecision (lines 6-75)

#### Path 2: Blocked Path (BLOCKED)
```
CREATED (pending)
  ↓
EVALUATED via /api/decisions/[decisionId]/evaluate
  ↓ [if blockStage = "decision_gate" | "guardrails"]
BLOCKED (status remains pending, blockStage recorded)
  ↓ [OPTIONAL]
OVERRIDDEN via PATCH with override_reason
  ↓
APPROVED (status=approved)
  ↓
EXECUTED
```

**Issue**: Blocked decisions can be approved via PATCH but status field doesn't reflect blocked state

#### Path 3: External Submission (Unprotected)
```
CREATED via POST /api/decisions/submit-external
  ↓ [No authentication required - VULNERABILITY]
```

**File**: `src/app/api/decisions/submit-external/route.ts`  
**Status**: KNOWN VULNERABILITY - Fixed in prior security audit

#### Path 4: Rejected Path
```
CREATED (pending)
  ↓
EVALUATED
  ↓
REJECTED via PATCH (status=rejected)
  ↓ [Terminal - No further transitions possible]
```

**Issue**: Rejected decisions cannot be re-evaluated or re-approved

#### Path 5: Failed Path
```
CREATED
  ↓
EXECUTED (executionStatus: started)
  ↓
FAILED (status=failed) [Set when execution fails]
```

**Issue**: Failure transition is implicit - no explicit failure route/endpoint

### Gap: Missing Transitions

| From State | To State | Route | Status |
|-----------|----------|-------|--------|
| pending | re-evaluated | ❌ MISSING | Once rejected, cannot re-evaluate |
| blocked | unblocked | ❌ MISSING | No explicit unblock path |
| failed | retried | ❌ MISSING | No retry mechanism |
| pending | cancelled | ❌ MISSING | No cancellation endpoint |
| in_progress | in_progress | ⚠️ IMPLICIT | No explicit monitoring |

---

## 3. All Mutation Routes

### Decision Creation Routes

#### Route: POST /api/decisions/create
**File**: `src/app/api/decisions/create/route.ts`  
**Lines**: 12-136  
**Mutations**:
- Single decision creation via JSON
- Bulk creation via JSON array
- CSV upload parsing and bulk creation

**Authentication**: ✅ withAuth()  
**Workspace Scoping**: ✅ enforceWorkspaceScoping()  
**State Transition**: pending → pending (initial)  
**Audit**: ✅ Logged in route (logger.info)  
**Gap**: No explicit audit event emitted

#### Route: POST /api/decisions/submit-external
**File**: `src/app/api/decisions/submit-external/route.ts`  
**Status**: ❌ VULNERABLE - Fixed in prior audit  
**Issue**: Previously accepted unauthenticated external submissions

---

### Decision Evaluation Routes

#### Route: POST /api/decisions/[decisionId]/evaluate
**File**: `src/app/api/decisions/[decisionId]/evaluate/route.ts`  
**Lines**: 12-180  
**Mutations**:
- Calls external /api/run engine
- Records evaluation result (gateResult, guardrailResult)
- Sets blockStage if blocked
- Stores explanation with evaluated_by, evaluated_at

**State Transition**: pending → pending (evaluation doesn't change status)  
**Audit**: ✅ Emits DECISION_EVALUATED  
**Gap**: Evaluation result not linked to lifecycle stages

---

### Decision Approval Routes

#### Route: PATCH /api/decisions/[decisionId]
**File**: `src/app/api/decisions/[decisionId]/route.ts`  
**Lines**: 21-173  
**Mutations**:
- Approve/reject decision
- Override blocked decision (with override_reason)
- Update status (pending → approved | rejected)
- Track reviewer (reviewedBy field)

**Authentication**: ✅ getSession()  
**Workspace Scoping**: ✅ enforceWorkspaceScoping()  
**State Transitions**:
- pending → approved
- pending → rejected
- blocked → approved (via override)

**Audit**: ✅ Emits DECISION_UPDATED or DECISION_OVERRIDDEN  
**Gaps**:
- No explicit lifecycle stage recorded
- Override path doesn't validate override_approved_at format
- Can approve already-rejected decisions (state machine not enforced)

---

## 4. All Service Functions

### Decision Creation Service
**File**: `src/services/decisions/decision-creation-service.ts`

```typescript
export async function createDecision(input: {
  title: string
  type: string
  impact: number
  confidence: number
  workspaceId: string
  userId: string
  problemType?: string
  expectedOutcome?: string
}): Promise<OperatorItem>

export async function createDecisionsBulk(input: {
  decisions: Array<...>
}): Promise<{
  summary: { succeeded: number; failed: number }
  decisions: OperatorItem[]
  errors: Error[]
}>

export function parseCSV(
  csvContent: string,
  workspaceId: string,
  userId: string
): Decision[]
```

**Gaps**:
- No idempotency (CSV uploads could create duplicates)
- No validation of decision uniqueness
- Bulk create doesn't emit per-decision audit events

---

### Execution Service
**File**: `src/services/execution/execution-service.ts`

```typescript
export async function executeDecision(
  decisionId: string,
  workspaceId: string,
  userId: string
): Promise<OperatorItem>
  // Transitions: not_started → started
  // Uses transaction for concurrency safety

export async function markSuccess(
  decisionId: string,
  workspaceId: string,
  userId: string,
  outcomeValue: number
): Promise<...>
  // Sets: completedAt, actualOutcome, actualOutcomeValue
  // Calculates: decisionAccuracy, decisionError
```

**Gaps**:
- No explicit success event emitted
- Outcome recording happens in this service (mixed concerns)
- No rollback mechanism if outcome recording fails

---

### Outcome Service
**File**: `src/services/outcome/outcome.service.ts`

```typescript
export async function recordOutcome(actionId: string): Promise<ActionOutcome>
  // Computes: confidence, impact, financialDelta
  // Stores: outcomeSnapshot in action record
  // Returns: ActionOutcome with accuracyScore

export async function getEngagementOutcomes(
  engagementId: string
): Promise<EngagementOutcomes>
  // Aggregates outcomes across all actions in engagement
```

**Critical Gap**: Outcomes are recorded at ACTION level, NOT DECISION level
- Decision outcome depends on action completion
- If action is never completed, decision outcome never recorded
- Multiple actions per decision = multiple outcome records

---

### Lifecycle Service (Not Integrated)
**File**: `src/services/lifecycle/decision-lifecycle.ts`

```typescript
export async function recordLifecycleStage(options: {
  workspaceId: string
  decisionId?: string
  actorId?: string
  stage: LifecycleStage
  status: LifecycleStatus
  reason?: string
  durationMs?: number
  occurredAt?: Date
}): Promise<void>
```

**Status**: ❌ DEFINED BUT NOT CALLED IN PRODUCTION CODE
- Only called in tests (`src/services/lifecycle/__tests__/decision-lifecycle.test.ts`)
- Not integrated into any mutation routes
- Not integrated into any service functions

---

## 5. Where Execution Is Recorded

### Execution Recording Points

| Field | Location | Updated By | When |
|-------|----------|-----------|------|
| executionStatus | OperatorItem | executeDecision() | On execution start |
| startedAt | OperatorItem | executeDecision() | On execution start |
| actionTriggered | action-handlers.ts | triggerAction() | Async, non-blocking |
| firstCompletedAt | OperatorItem | markSuccess() | First completion |
| completedAt | OperatorItem | markSuccess() | Each completion |

### Gaps in Execution Recording

- **No execution START event**: executionStatus changes but no audit event
- **No execution FAILURE event**: If action fails, only recorded in action status, not decision
- **No execution TIMEOUT event**: No tracking of stalled executions
- **Implicit failure states**: Decision marked failed but no explicit path

---

## 6. Where Outcome Is Recorded

### Outcome Recording Points

| Field | Location | Updated By | When |
|-------|----------|-----------|------|
| actualOutcome | execution-service.ts | markSuccess() | When action completes |
| actualOutcomeValue | execution-service.ts | markSuccess() | When action completes |
| outcomeSnapshot | action.ts | recordOutcome() | Via outcome service |
| decisionAccuracy | execution-service.ts | markSuccess() | Calculation: actual/expected |
| decisionError | execution-service.ts | markSuccess() | Calculation: actual-expected |

### Outcome Recording Gaps

- **Outcome depends on action completion**: If action abandoned, outcome never recorded
- **Multiple outcomes per decision**: No aggregation, unclear which outcome is "final"
- **Orphaned outcomes**: No tracking of outcomes for decisions without actions
- **Partial completion**: No tracking if some actions complete and others don't

---

## 7. ROI/Impact Dependency on Lifecycle State

### Impact Fields That Depend on Status

```typescript
OperatorItem {
  // Expected Impact (set at creation)
  impactExpected: Float
  impactLow: Float
  impactHigh: Float
  
  // Actual Impact (recorded after completion)
  actualOutcomeValue: Float? // depends on status=done && completedAt != null
  actualOutcome: String?      // depends on status=done
  
  // ROI Calculations
  decisionAccuracy: Float?    // depends on actualOutcomeValue (requires calculation)
  decisionError: Float?       // depends on actualOutcomeValue
  outcomeDelta: Float?        // depends on actualOutcomeValue
}
```

### Impact Calculation Dependencies

| Metric | Depends On | Calculated By | Gap |
|--------|-----------|---------------|-----|
| Expected Impact | impactExpected | Input | No validation |
| Actual Impact | actualOutcomeValue | outcome.service | Requires action completion |
| Accuracy | actual/expected | execution-service | Fails if expected=0 |
| ROI | actualOutcomeValue | outcome.service | Not available until completion |
| Baseline Comparison | projectedWithoutAction | Operator engine | Set at creation only |

### Gap: No Re-evaluation of Impact

- Once decision is created, impact values are frozen
- If business condition changes, no mechanism to recalculate impact
- No alert if actual impact deviates significantly from expected

---

## 8. Identified Gaps Allowing Problematic States

### Gap A: Skipped Decisions (No Execution Trigger)

**Scenario**: Decision approved but never executed

**Current State**:
- PATCH /api/decisions/[decisionId] approves decision
- No automatic execution trigger
- No endpoint to transition approved → in_progress

**Evidence**:
```typescript
// Route approves decision but doesn't execute
const updated = await db.operatorItem.update({
  where: { id: decisionId, workspaceId },
  data: {
    status: input.status,  // "approved"
    // executionStatus NOT updated - remains "not_started"
  }
});
```

**Risk**: Approved decisions silently remain unexecuted (no alert)

---

### Gap B: Duplicated Decisions (No Uniqueness Check)

**Scenario**: Same decision created multiple times via bulk/CSV upload

**Current State**:
- createDecision() checks neither uniqueness nor idempotency
- Bulk CSV upload could create 100 identical decisions
- No deduplication

**Evidence**:
```typescript
// No uniqueness constraint in createDecision
const result = await db.operatorItem.create({
  data: {
    // No unique check on (problem, action, workspaceId)
    problem: input.problem,
    action: input.action,
    workspaceId,
  }
});
```

**Risk**: Duplicate execution, duplicate outcomes, inflated ROI metrics

---

### Gap C: Orphaned Decisions (No Action Binding)

**Scenario**: Decision created but no action ever created to execute it

**Current State**:
- OperatorItem can exist without corresponding Action
- Outcome only recorded if Action completes
- Orphaned decisions have status=approved but never impact business

**Evidence**:
```typescript
// OperatorItem independent of Action table
model OperatorItem { id: String, status: String, ... }
model Action { id: String, engagementId: String, ... }
// No foreign key relationship
```

**Risk**: Decisions with impact=1M$ never executed, outcome never recorded

---

### Gap D: Incomplete Decisions (Partial Execution)

**Scenario**: Multiple actions for one decision, only some complete

**Current State**:
- One OperatorItem can span multiple Actions
- outcome.recordOutcome() operates at ACTION level
- No decision-level outcome aggregation

**Example Flow**:
```
Decision1 approved
  ↓
Action1 created → completed → outcome recorded
Action2 created → abandoned → no outcome
Action3 created → in_progress → no outcome
  ↓
Decision1 status = "done" but 2/3 actions incomplete
```

**Risk**: Decision appears successful (status=done) but objectives not fully met

---

### Gap E: Blocked Decisions Can Be Forced Approved

**Scenario**: Decision fails guardrails but admin overrides

**Current State**:
```typescript
// Route allows override without evidence
if (input.override_reason) {
  // Only checks permission, not reason quality
  if (!hasPermission(membership.role, "override")) {
    // Rejected
  }
  // Allowed - no further validation
}
```

**Risk**: Override reason not validated, no escalation tracking

---

### Gap F: Re-evaluation After Rejection Impossible

**Scenario**: Decision rejected, situation improves, needs re-evaluation

**Current State**:
```typescript
// No transition path from rejected → re-evaluated
if (decision.status !== "pending" && decision.status !== "blocked") {
  return NextResponse.json({
    error: `Cannot update ${decision.status} decision`
  });
}
// Status="rejected" is terminal - cannot transition
```

**Risk**: Business must manually create new decision (duplicate)

---

### Gap G: No Audit Events for Decision Lifecycle

**Missing Events**:
- ❌ DECISION_CREATED (no explicit event)
- ❌ DECISION_EVALUATED (not in AUDIT_EVENTS constant)
- ❌ DECISION_EXECUTED (not in AUDIT_EVENTS)
- ❌ DECISION_FAILED (not in AUDIT_EVENTS)
- ❌ DECISION_OVERRIDDEN (not in AUDIT_EVENTS)
- ❌ DECISION_COMPLETED (not in AUDIT_EVENTS)

**Current Events** (hardcoded in routes):
```typescript
// /api/decisions/[decisionId]/evaluate
eventName: "DECISION_EVALUATED"  // Not in AUDIT_EVENTS constant!

// /api/decisions/[decisionId]
eventName: decision.status === "blocked" && override_reason 
  ? "DECISION_OVERRIDDEN" : "DECISION_UPDATED"
// Neither in AUDIT_EVENTS constant
```

**Risk**: Audit trail uses undefined event names, inconsistent

---

### Gap H: Lifecycle Recording Defined But Unused

**Status**:
- ✅ recordLifecycleStage() function exists
- ✅ DecisionLifecycle table exists
- ❌ recordLifecycleStage() NOT called in ANY production code
- ✅ Only called in test files

**Evidence**:
```bash
$ grep -r "recordLifecycleStage" src/ --include="*.ts" | grep -v test | grep -v ".next"
# Returns: 0 results (no production usage)
```

**Risk**: Infrastructure built but not integrated - lifecycle data never populated

---

### Gap I: Outcome Recording Not Decision-Scoped

**Current Structure**:
```typescript
// Outcome tied to ACTION, not DECISION
async function recordOutcome(actionId: string) {
  const action = await db.action.findUnique({ where: { id: actionId } });
  const engagementId = action.engagementId;  // Works backwards to engagement
  // No connection to decision
}
```

**Problem**:
- Multiple decisions → one engagement
- Multiple actions → one engagement
- Outcomes aggregated at engagement level, not decision level
- Cannot determine ROI of individual decision

**Risk**: Cannot measure success of specific decision, only engagement average

---

### Gap J: Execution Status and Decision Status Are Parallel

**Issue**: Two independent status fields

```typescript
status: "pending" | "in_progress" | "done" | "failed" | "blocked"
executionStatus: "not_started" | "started" | "completed"
```

**Problem**:
```
Decision1:
  status = "approved"        // PATCH was called
  executionStatus = "not_started"  // Never executed
  blockStage = "decision_gate"     // Was blocked but admin overrode
  
// Contradictory state: approved but blocked?
```

**Risk**: State machine is not enforced, inconsistent states possible

---

## Summary Table: Lifecycle Gaps

| Gap | Type | Severity | Impact |
|-----|------|----------|--------|
| A | Skipped execution | HIGH | Approved decisions never run |
| B | Duplicate decisions | HIGH | Inflated metrics, duplicate work |
| C | Orphaned decisions | HIGH | Impact never measured |
| D | Incomplete execution | MEDIUM | Partial success counted as full |
| E | Override validation | MEDIUM | Guardrails bypassed without evidence |
| F | Terminal rejected state | MEDIUM | Cannot re-evaluate rejected decisions |
| G | Missing audit events | MEDIUM | Incomplete audit trail |
| H | Unused lifecycle tracking | MEDIUM | Infrastructure exists but unused |
| I | Action-scoped outcomes | HIGH | Cannot measure decision ROI |
| J | Parallel status fields | MEDIUM | Inconsistent state machine |

---

## Recommendations (Audit Only - Not Implemented)

### Recommended State Machine
```
pending
  ↓ [evaluation triggered]
evaluated
  ↓ [approved by human]
approved
  ↓ [execution triggered]
executing
  ↓ [execution completes]
completed
  ↓ [outcome recorded]
success / failed
```

### Recommended Audit Events
Add to AUDIT_EVENTS constant:
- DECISION_CREATED
- DECISION_EVALUATED
- DECISION_APPROVED
- DECISION_REJECTED
- DECISION_OVERRIDDEN
- DECISION_EXECUTED
- DECISION_COMPLETED
- DECISION_FAILED
- DECISION_CANCELLED

### Recommended Integration Points
1. Call recordLifecycleStage() in mutation routes
2. Link outcomes to decisions (not just actions)
3. Add decision-level ROI aggregation
4. Enforce state machine transitions
5. Add re-evaluation capability for rejected decisions
6. Add idempotency to bulk creation

---

**Audit Status**: COMPLETE - ANALYSIS ONLY  
**Implementation Status**: PENDING USER DECISION

