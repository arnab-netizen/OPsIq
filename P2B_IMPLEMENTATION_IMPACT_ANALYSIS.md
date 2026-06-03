# P2B Implementation Impact Analysis

**Date:** 2026-06-03  
**Authority:** Decision B (OPTION_B2) + Decision C (OPTION_C3)  
**Scope:** Complete implementation impact before coding  
**Status:** ANALYSIS ONLY — NO CHANGES AUTHORIZED

---

## EXECUTIVE SUMMARY

Implementing Decision B and C requires:

- **Decision B (OPTION_B2):** 2 threshold constant changes in 1 file
- **Decision C (OPTION_C3):** 1 new state, 1 new request model, 3-4 new services, schema migration
- **Total files touched:** 18-22 files
- **Schema changes:** 1 new table, 1 new enum (optional)
- **API changes:** 2 new endpoints for outcome modification workflow
- **Test impact:** 11 currently failing tests → 6 pass (Decision B) + 5 still fail (Decision C needs async approval mocking)
- **Implementation effort:** Decision B (1 day) + Decision C (5-7 days)
- **Risk level:** Decision B (LOW), Decision C (MEDIUM-HIGH due to workflow complexity)

---

# TASK 1 — DECISION B IMPACT ANALYSIS

## Topic: Fraud Risk Auto-Flagging (OPTION_B2 — Balanced)

### Current Implementation

**File:** `src/services/outcome/verification.ts` (Lines 63-112)

| Aspect | Current | After B2 |
|--------|---------|----------|
| **Variance threshold** | `variance > 5` (>500%) | `variance >= 2` (>=200%) |
| **Fraud "high" threshold** | `riskScore >= 2.5` | `riskScore >= 1.5` |
| **Single indicator dispatch** | Only retroactive (2.0 pts) | Retroactive (2.0 pts) + variance combo |
| **Expected test impact** | 2 failures (B1, B2) | Both tests pass |

### Files Affected by Decision B

#### 1. `src/services/outcome/verification.ts`

**Change Type:** LOGIC_CHANGE (2 constants)

| Location | Current Code | Required Behavior | Change Type |
|----------|--------------|-------------------|-------------|
| Line 86 | `if (variance > 5)` | `if (variance >= 2)` | Update condition |
| Line 105 | `riskScore >= 2.5 ? "high"` | `riskScore >= 1.5 ? "high"` | Update threshold |

**Risk Level:** ✅ LOW
- Pure logic change, no schema impact
- Backward compatible with existing audit trail structure
- All 5 indicators continue working identically

**Testing:** Direct unit test of `checkFraudRisk()` function

---

#### 2. `src/__tests__/p2b/decision-outcome-path.test.ts`

**Change Type:** TEST_PASS (2 tests)

| Test | Current Status | After B2 | Reason |
|------|---|---|---|
| Line 160: "accept uncertain with outcomeNotes" | ❌ FAIL | ✅ PASS | 400% variance + round = 1.5 >= threshold |
| Line 243: "auto-flag when variance exceeds 500%" | ❌ FAIL | ✅ PASS | 500% variance + round = 1.5 >= threshold |

**Risk Level:** ✅ LOW
- Tests already written with correct expectations
- No test code modification needed
- Passing is evidence of rule compliance

---

#### 3. `src/__tests__/p2b/outcome-classifier.test.ts`

**Change Type:** TEST_UPDATED (0-2 tests affected)

| Test Name | Current | Impact | Action |
|-----------|---------|--------|--------|
| "classify 5x expected as uncertain" | ✅ PASS | No change | Threshold affects fraud score, not classification |
| "classify 3x expected as uncertain" | ✅ PASS | No change | Classification logic unchanged |

**Risk Level:** ✅ LOW
- `classifyOutcome()` function (lines 63-112) is separate from verification
- Only fraud risk scoring changes; outcome classification unchanged

---

#### 4. `src/__tests__/p2b/real-route-tests.test.ts`

**Change Type:** TEST_UPDATED (0-4 tests affected)

| Test Suite | Tests Checking Fraud | Impact |
|------------|-------------------|--------|
| Operator Route fraud detection | 3 tests | May cause additional tests to pass |
| Route integration tests | 2 tests | Variance-related assertions may change |

**Risk Level:** ⚠️ MEDIUM
- Route tests may have hardcoded expectations about fraud thresholds
- Audit assertions may need review (line 227-230: fraud risk comments)
- Likely no failures, but assertions should be verified

**Example:** Line 227 mentions "5x" variance → may need assertion update if test expects "unverified"

---

#### 5. `src/__tests__/p2b/verified-lifecycle.test.ts`

**Change Type:** TEST_UPDATED (0-3 tests affected)

| Test | Current | After B2 | Reason |
|------|---------|----------|--------|
| Fraud transitions | Some may depend on old thresholds | Re-evaluate | Higher fraud sensitivity |
| Verification state machine | Routes through fraud detection | Audit assertions reviewed | Variance calculations |

**Risk Level:** ⚠️ MEDIUM
- Verification approval flow indirectly dependent on fraud assessment
- If tests assert "unverified" based on old thresholds, need updates
- Likely: Tests assert "disputed" with lower variance, automatic pass

---

#### 6. `src/__tests__/p2b/path-convergence.test.ts`

**Change Type:** TEST_UPDATED (1 test)

| Test | Current Expectation | After B2 |
|------|------------------|----------|
| "should consistently assess fraud risk for extreme variance" | Based on old thresholds | Based on new thresholds |

**Risk Level:** ✅ LOW
- Test compares fraud assessments across different code paths
- All paths updated consistently (single source of truth)
- Test should still pass

---

#### 7. `src/__tests__/p2b/operator-outcome-path.test.ts`

**Change Type:** TEST_REVIEWED (1-2 tests)

| Test | Impact |
|------|--------|
| Outcome-to-verification path | Verifies fraud detection is called; fraud thresholds don't affect path |
| Fraudulent outcome handling | May pass more tests due to higher sensitivity |

**Risk Level:** ✅ LOW

---

#### 8. `src/app/api/operator/route.ts` (Lines 182-192)

**Change Type:** NO_CODE_CHANGE

Current:
```typescript
const verificationMetadata = captureOutcomeVerificationMetadata(
  actualOutcome,
  beforeItem?.impactExpected ?? 0,
  beforeItem?.actualOutcomeValue ?? null,
  actorId || "unknown"
);
```

After:
- **No change to route handler**
- Calls same function with same parameters
- Fraud thresholds are internal to `checkFraudRisk()`
- Route automatically benefits from updated logic

**Risk Level:** ✅ LOW

---

#### 9. `src/services/operator/store.ts`

**Change Type:** NO_CODE_CHANGE

| Function | Impact |
|----------|--------|
| `updateItem()` | No schema changes, same fields stored |
| Outcome persistence | `verificationStatus` field updated by fraud detection, not changed |

**Risk Level:** ✅ LOW

---

#### 10. Database Schema (`prisma/schema.prisma`)

**Change Type:** NO_CHANGE

Current fields sufficient:
- `verificationStatus` (String) — already stores "disputed" | "unverified"
- `verificationEvidence` (Json) — already stores fraud assessment details
- `auditTrail` (Json) — already stores retroactive modification tracking

**Risk Level:** ✅ LOW

---

### Decision B Impact Summary

| Category | Count | Files | Risk |
|----------|-------|-------|------|
| Logic changes | 2 | 1 file (verification.ts) | LOW |
| Tests automatically pass | 2 | 1 file | LOW |
| Tests need review | 4 | 4 files | MEDIUM |
| API changes | 0 | 0 files | — |
| Schema changes | 0 | 0 files | — |

**Expected Result After Decision B:**
- ✅ 2 failing tests (B1, B2) → PASS
- ✅ 0-4 existing tests may need assertion review (should still pass)
- ✅ 0 breaking changes
- ✅ Total: 33/42 tests pass (was 31/42)

---

---

# TASK 2 — DECISION C IMPACT ANALYSIS

## Topic: Outcome Mutability (OPTION_C3 — Editable With Approval Workflow)

### Current Implementation

**Files Involved:**
- `src/domain/decision-lifecycle.ts` (state machine)
- `src/services/decisions/decision-lifecycle.service.ts` (recordDecisionOutcome)
- `src/services/outcome/verification-approval.service.ts` (verification approval)
- `prisma/schema.prisma` (OperatorItem, ApprovalRequest models)

**Current State Transitions:**
```
EXECUTED → OUTCOME_RECORDED → CLOSED
(immutable after OUTCOME_RECORDED)
```

**After Decision C (Option C3):**
```
EXECUTED → OUTCOME_RECORDED
             ↓
        PENDING_MODIFICATION (request created)
             ↓
        OUTCOME_RECORDED (approved) or rejected
             ↓
          CLOSED
```

### Files Affected by Decision C

#### 1. `src/domain/decision-lifecycle.ts`

**Change Type:** STATE_MACHINE_EXPANSION

| Item | Current | After C3 | Action |
|------|---------|----------|--------|
| DECISION_STATES (line 13) | 9 states | 10 states | Add "PENDING_MODIFICATION" |
| ALLOWED_TRANSITIONS (line 51) | 9 entries | 10 entries | Add PENDING_MODIFICATION transitions |
| requireOutcomeRecordable (line 123) | Checks state === "EXECUTED" | Checks state === "EXECUTED" \| "PENDING_MODIFICATION" | Expand to allow re-recording |

**Exact Changes Needed:**

```typescript
// Line 13-23: Add new state
export const DECISION_STATES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "EXECUTED",
  "OUTCOME_RECORDED",
  "PENDING_MODIFICATION",  // ← ADD
  "CLOSED",
  "REJECTED",
  "CANCELLED",
  "FAILED",
] as const;

// Line 51-64: Add new transitions
OUTCOME_RECORDED: ["CLOSED", "PENDING_MODIFICATION"],  // ← MODIFY
PENDING_MODIFICATION: ["OUTCOME_RECORDED", "CLOSED"],  // ← ADD

// Line 123-131: Expand recordable states
export function requireOutcomeRecordable(state: DecisionState): void {
  const outcomeRecordableStates: DecisionState[] = ["EXECUTED", "PENDING_MODIFICATION"];  // ← MODIFY
  // ...
}
```

**Risk Level:** ⚠️ MEDIUM
- Core state machine change
- Affects decision lifecycle assumptions throughout codebase
- Must audit all callers of `requireOutcomeRecordable()`

---

#### 2. `src/services/decisions/decision-lifecycle.service.ts`

**Change Type:** WORKFLOW_EXPANSION

Location: `recordDecisionOutcome()` function (lines 313-421)

**Current Behavior:**
- Only allows outcome recording if state === "EXECUTED"
- Automatically transitions to "OUTCOME_RECORDED"
- Fraud detection runs automatically via `captureOutcomeVerificationMetadata()`

**After Decision C:**

Create new function `requestOutcomeModification()`:
```typescript
export async function requestOutcomeModification(
  decisionId: string,
  workspaceId: string,
  modificationRequest: {
    newActualOutcomeValue: number;
    requestReason: string;  // Required
    evidence?: string;      // Optional
  },
  requestorId: string,
  approverUserId: string
): Promise<{ id: string; modificationRequestId: string }>;
```

Modify `recordDecisionOutcome()`:
```typescript
export async function recordDecisionOutcome(
  decisionId: string,
  workspaceId: string,
  outcomeData: {...},
  actorId: string,
  // NEW: Allow recording from PENDING_MODIFICATION
): Promise<{ id: string; status: string }>;
```

Create new function `approveOutcomeModification()`:
```typescript
export async function approveOutcomeModification(
  decisionId: string,
  modificationRequestId: string,
  approverId: string,
  decision: "APPROVE" | "REJECT",
  approvalReason: string
): Promise<{ id: string; status: string }>;
```

**Implementation Details:**

1. **requestOutcomeModification:**
   - Verify decision is in "OUTCOME_RECORDED" state
   - Create ApprovalRequest with modification details
   - Store beforeValue, afterValue, fraud risk impact in payload
   - Transition state to "PENDING_MODIFICATION"
   - Emit audit event: "outcome.modification.requested"

2. **approveOutcomeModification:**
   - Verify ApprovalRequest exists and approver matches
   - If APPROVE: Call recordDecisionOutcome with new value
   - If REJECT: Revert to "OUTCOME_RECORDED" state
   - Emit audit event: "outcome.modification.approved" or ".rejected"
   - Update ApprovalRequest.approvalStatus and approvalDecision

3. **Modified recordDecisionOutcome:**
   - Accept optional parameter: `modificationRequestId?: string`
   - If modificationRequestId: Mark as approved in ApprovalRequest
   - Else: Current behavior (first-time recording)
   - Fraud detection runs on NEW values
   - Include modification in audit trail

**Risk Level:** ⚠️ HIGH
- Large service expansion (3 new functions)
- Complex state transitions
- Fraud detection must re-run on modified values
- Idempotency must be maintained
- Audit trail complexity increases

---

#### 3. `prisma/schema.prisma`

**Change Type:** SCHEMA_MIGRATION

**Option A: Extend ApprovalRequest (Simpler)**

Current ApprovalRequest (line 1226):
```prisma
model ApprovalRequest {
  id              String       @id
  operatorItemId  String
  requestedBy     String       @db.Uuid
  approverUserId  String       @db.Uuid
  approvalStatus  String       @default("pending")
  approvalDecision String?
  approvedAt      DateTime?
}
```

Add Fields:
```prisma
model ApprovalRequest {
  // ... existing fields ...
  
  // NEW: Outcome modification context
  requestType           String       @default("general")  // "general" | "outcome_modification"
  outcomeBeforeValue    Float?       @map("outcome_before_value")
  outcomeAfterValue     Float?       @map("outcome_after_value")
  outcomeRequestReason  String?      @map("outcome_request_reason")
  outcomeEvidence       String?      @map("outcome_evidence")
  fraudRiskImpactBefore Json?        @map("fraud_risk_impact_before")
  fraudRiskImpactAfter  Json?        @map("fraud_risk_impact_after")
  
  @@unique([operatorItemId, approverUserId, requestType])  // ← UPDATE constraint
}
```

**Option B: Create Separate OutcomeModificationRequest (Cleaner)**

```prisma
model OutcomeModificationRequest {
  id                    String       @id @db.Uuid
  operatorItemId        String       @db.Uuid @map("operator_item_id")
  requestedBy           String       @db.Uuid @map("requested_by")
  requestedAt           DateTime     @default(now()) @map("requested_at")
  approverUserId        String       @db.Uuid @map("approver_user_id")
  
  // Modification details
  outcomeBeforeValue    Float        @map("outcome_before_value")
  outcomeAfterValue     Float        @map("outcome_after_value")
  requestReason         String       @map("request_reason")
  evidenceReference     String?      @map("evidence_reference")
  
  // Fraud impact analysis
  fraudRiskBefore       Json         @map("fraud_risk_before")
  fraudRiskAfter        Json         @map("fraud_risk_after")
  
  // Approval decision
  approvalStatus        String       @default("pending") @map("approval_status")
  approvalDecision      String?      @map("approval_decision")  // "APPROVED" | "REJECTED"
  approvalReason        String?      @map("approval_reason")
  approvedAt            DateTime?    @map("approved_at")
  
  // Relationships
  operatorItem          OperatorItem @relation(fields: [operatorItemId], references: [id], onDelete: Cascade)
  requester             User         @relation("outcome_mod_requested_by", fields: [requestedBy], references: [id])
  approver              User         @relation("outcome_mod_approver", fields: [approverUserId], references: [id])
  
  createdAt             DateTime     @default(now()) @map("created_at")
  updatedAt             DateTime     @map("updated_at")
  
  @@unique([operatorItemId, approverUserId])
  @@index([approvalStatus])
  @@index([requestedAt])
  @@map("outcome_modification_requests")
}
```

**Recommendation:** Use Option B (separate table)
- Cleaner data model
- No constraint conflicts with existing ApprovalRequest
- Audit trail clarity
- Easier future enhancements

**OperatorItem Changes:**

Add field to track modification state:
```prisma
model OperatorItem {
  // ... existing fields ...
  
  // NEW: Modification tracking
  modificationRequestId String?       @db.Uuid @map("modification_request_id")
  modificationApprovedAt DateTime?    @map("modification_approved_at")
  modificationApprovedBy String?      @db.Uuid @map("modification_approved_by")
  
  // Relationships
  modificationRequest OutcomeModificationRequest? @relation(fields: [modificationRequestId], references: [id])
}
```

**User Model Changes:**

Add relations for outcome modification:
```prisma
model User {
  // ... existing fields ...
  
  outcomeMods         OutcomeModificationRequest[] @relation("outcome_mod_requested_by")
  outcomeModApprovals OutcomeModificationRequest[] @relation("outcome_mod_approver")
}
```

**Migration Script Needed:**

```sql
-- Create new table
CREATE TABLE outcome_modification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_item_id UUID NOT NULL REFERENCES operator_items(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  requested_at TIMESTAMP DEFAULT now(),
  approver_user_id UUID NOT NULL REFERENCES users(id),
  outcome_before_value FLOAT NOT NULL,
  outcome_after_value FLOAT NOT NULL,
  request_reason TEXT NOT NULL,
  evidence_reference TEXT,
  fraud_risk_before JSONB,
  fraud_risk_after JSONB,
  approval_status VARCHAR(20) DEFAULT 'pending',
  approval_decision VARCHAR(20),
  approval_reason TEXT,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(operator_item_id, approver_user_id),
  INDEX idx_approval_status (approval_status),
  INDEX idx_requested_at (requested_at)
);

-- Add columns to operator_items
ALTER TABLE operator_items
ADD COLUMN modification_request_id UUID,
ADD COLUMN modification_approved_at TIMESTAMP,
ADD COLUMN modification_approved_by UUID,
ADD FOREIGN KEY (modification_request_id) REFERENCES outcome_modification_requests(id);
```

**Risk Level:** ⚠️ MEDIUM
- Schema migration (downtime risk if production)
- Foreign key constraints (data integrity)
- Backward compatibility (existing code accessing OperatorItem)

---

#### 4. `src/services/outcome/verification-approval.service.ts`

**Change Type:** ENHANCEMENT (No breaking changes)

Current function: `approveOutcomeVerification()` (lines 22-135)

**Impact:** None directly, but related workflow

- Handles verification status transitions (unverified → disputed → verified)
- Will co-exist with new outcome modification workflow
- May be called AFTER modification is approved
- No changes required to this file
- Audit trail integration will reference modification request

**Risk Level:** ✅ LOW

---

#### 5. `src/services/approval/workflow.ts` (Likely exists or needs creation)

**Change Type:** NEW_SERVICE or ENHANCEMENT

**Status:** Need to verify if approval workflow service exists

If not, create:
```typescript
// src/services/approval/outcome-modification-workflow.ts

export async function requestOutcomeModification(
  operatorItemId: string,
  newValue: number,
  requestReason: string,
  requestorId: string,
  approverUserId: string
): Promise<OutcomeModificationRequest>;

export async function getModificationRequest(
  operatorItemId: string
): Promise<OutcomeModificationRequest | null>;

export async function approveModificationRequest(
  operatorItemId: string,
  approverId: string,
  decision: "APPROVE" | "REJECT",
  reason: string
): Promise<OutcomeModificationRequest>;

export async function isModificationPending(
  operatorItemId: string
): Promise<boolean>;
```

**Risk Level:** ⚠️ MEDIUM
- New authorization checks required
- Approver role validation needed
- Notification system integration (optional but recommended)

---

#### 6. `src/app/api/operator/route.ts`

**Change Type:** NO_CHANGE to POST handler

Current POST handler (lines 37-260) already:
- Validates state transitions
- Calls `recordDecisionOutcome()` equivalent via `updateItem()`
- Records verification metadata

**After Decision C:**
- Route stays same
- Underlying `recordDecisionOutcome()` updated to accept modification context
- No API contract change needed

**Risk Level:** ✅ LOW

---

#### 7. NEW API Routes

**Need to create:**

1. **POST /api/outcomes/{decisionId}/modifications**
   ```typescript
   export const POST = withCanonicalEnforcement(async (ctx) => {
     const { decisionId } = ctx.params;
     const { newActualOutcomeValue, requestReason, evidence } = await ctx.request.json();
     
     // Request outcome modification
     return requestOutcomeModification(...);
   });
   ```

2. **POST /api/outcomes/{modificationId}/approve**
   ```typescript
   export const POST = withCanonicalEnforcement(async (ctx) => {
     const { modificationId } = ctx.params;
     const { decision, approvalReason } = await ctx.request.json();
     
     // Approve or reject modification
     return approveModificationRequest(...);
   });
   ```

**Risk Level:** ⚠️ MEDIUM
- Authorization must check workspace membership
- Approver role must be verified
- Idempotency key handling required

---

#### 8. `src/__tests__/p2b/decision-outcome-path.test.ts`

**Change Type:** TEST_UPDATED (1 test fails → needs mocking)

Current Test (line 281):
```typescript
it("should flag retroactive modifications", async () => {
  // First record
  await recordDecisionOutcome(..., 50000, ...);
  
  // Second record with different value (retroactive modification)
  await recordDecisionOutcome(..., 100000, ...);
  
  expect(decision?.verificationStatus).toBe("disputed");
});
```

**After Decision C:**
- Direct second call to `recordDecisionOutcome()` throws ValidationError
- Must change to use new workflow:
  1. First record (50K)
  2. Request modification (100K)
  3. Approve modification (mocked approver)
  4. Verify "disputed" status

**Updated Test:**
```typescript
it("should flag retroactive modifications", async () => {
  // First record
  await recordDecisionOutcome(..., 50000, ...);
  
  // Request modification
  const modRequest = await requestOutcomeModification(
    testDecisionId,
    testWorkspaceId,
    { newActualOutcomeValue: 100000, requestReason: "correction", ... },
    testActorId,
    testApproverId  // ← Mock approver
  );
  
  // Approve modification (mocked with approval)
  await approveOutcomeModification(
    testDecisionId,
    modRequest.id,
    testApproverId,
    "APPROVE",
    "reasonable change"
  );
  
  const decision = await db.operatorItem.findUnique(...);
  expect(decision?.verificationStatus).toBe("disputed");
});
```

**Risk Level:** ⚠️ MEDIUM
- Test refactoring required
- Mocking approver role needed
- Async workflow testing complexity

---

#### 9. `src/__tests__/p2b/real-route-tests.test.ts`

**Change Type:** TEST_UPDATED (1-2 tests)

Tests calling outcome modification endpoints:

| Test | Current | After C3 |
|------|---------|----------|
| Route integration tests | May test direct modification | Must test approval workflow |
| Real-world outcome recording | May expect single POST | Must handle request → approval → final |

**Risk Level:** ⚠️ HIGH
- Complex async workflow testing
- Multiple test fixtures needed
- Mock approver setup required

---

#### 10. `src/__tests__/p2b/verified-lifecycle.test.ts`

**Change Type:** TEST_REVIEWED (2-3 tests)

Tests verifying state transitions:

| Test | Impact |
|------|--------|
| "should flag retroactive modifications" | Must use new approval workflow |
| State transition assertions | May assert PENDING_MODIFICATION state |
| Verification after modification | Fraud detection re-run on new values |

**Risk Level:** ⚠️ MEDIUM

---

#### 11-18. Other P2B Test Files

**Files:**
- `operator-outcome-path.test.ts`
- `path-convergence.test.ts`
- `operator-route.real.test.ts`
- `outcome-classifier.test.ts`

**Impact:** Review for hardcoded state assumptions

| Item | Risk |
|------|------|
| State machine assumptions | MEDIUM — may assume EXECUTED → OUTCOME_RECORDED direct |
| Fraud detection flow | LOW — fraud detection unaffected |
| Outcome classification | LOW — classification logic unchanged |

---

### Decision C Impact Summary

| Category | Count | Files | Risk |
|----------|-------|-------|------|
| State machine changes | 1 | 1 file | MEDIUM |
| Service layer expansion | 3 functions | 2 files | HIGH |
| New API endpoints | 2 | 1 new file | MEDIUM |
| Schema migration | 1 new table | 1 migration | MEDIUM |
| Tests requiring rewrite | 1-3 | 3-4 files | MEDIUM |

**Expected Result After Decision C:**
- ✅ 1 failing test (C1) → PASS (with approval mocking)
- ⚠️ 1-2 tests may need async workflow setup
- ❌ Approval role mocking needs centralized test fixture
- Total impact: 37-39/42 tests pass (was 31-37/42)

---

---

# TASK 3 — DATABASE IMPACT

## Required Schema Changes for Decision C (Option C3)

### New Tables

#### Table 1: `outcome_modification_requests`

```sql
CREATE TABLE outcome_modification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_item_id UUID NOT NULL REFERENCES operator_items(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  requested_at TIMESTAMP DEFAULT now(),
  approver_user_id UUID NOT NULL REFERENCES users(id),
  
  -- Modification details
  outcome_before_value FLOAT NOT NULL,
  outcome_after_value FLOAT NOT NULL,
  request_reason TEXT NOT NULL,
  evidence_reference TEXT,
  
  -- Fraud impact
  fraud_risk_before JSONB,
  fraud_risk_after JSONB,
  
  -- Approval
  approval_status VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected
  approval_decision VARCHAR(20),                   -- APPROVE | REJECT
  approval_reason TEXT,
  approved_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  
  UNIQUE(operator_item_id, approver_user_id),
  INDEX idx_approval_status (approval_status),
  INDEX idx_requested_at (requested_at),
  INDEX idx_operator_item_id (operator_item_id)
);
```

### Modified Tables

#### Table: `operator_items`

**Add Columns:**

```sql
ALTER TABLE operator_items ADD COLUMN (
  modification_request_id UUID,
  modification_approved_at TIMESTAMP,
  modification_approved_by UUID,
  
  FOREIGN KEY (modification_request_id) REFERENCES outcome_modification_requests(id)
);

-- Add index for queries
CREATE INDEX idx_operator_items_mod_request ON operator_items(modification_request_id);
```

#### Table: `users`

**Add Relations (Prisma only, no migration needed):**

Relations in schema handle foreign keys already established through outcome_modification_requests.

### New Enums

**Optional — For Type Safety:**

```prisma
enum OutcomeModificationStatus {
  PENDING
  APPROVED
  REJECTED
}

enum OutcomeModificationDecision {
  APPROVE
  REJECT
}
```

### Migration Summary

| Type | Count | Objects | Impact |
|------|-------|---------|--------|
| New table | 1 | outcome_modification_requests | Schema growth |
| New columns | 3 | operator_items.modification_* | FK relationship |
| New indexes | 3 | Approval status, requested_at, operator_item_id | Query performance |
| Constraints | 1 | UNIQUE(operator_item_id, approver_user_id) | Data integrity |
| Breaking changes | 0 | None | Backward compatible |

### Data Integrity Risks

| Risk | Mitigation |
|------|-----------|
| Orphaned modification requests | CASCADE delete on operator_items |
| Duplicate requests for same item | UNIQUE constraint on (operator_item_id, approver_user_id) |
| Missing fraud assessment | Requires JSONB not null check in code |
| Approval without approver | FOREIGN KEY enforces user_id exists |

---

---

# TASK 4 — API IMPACT

## API Changes Required

### Decision B (OPTION_B2)

**No API contract changes.**

- Fraud thresholds are internal logic
- Same request/response signatures
- No versioning needed
- Client code unaffected

---

### Decision C (OPTION_C3)

#### New Endpoint 1: Request Outcome Modification

**Route:** `POST /api/outcomes/{decisionId}/modifications`

**Request:**
```json
{
  "newActualOutcomeValue": 100000,
  "requestReason": "Measurement error correction",
  "evidence": "Customer clarification email ref #12345"
}
```

**Response (201 Created):**
```json
{
  "modificationRequestId": "550e8400-e29b-41d4-a716-446655440000",
  "operatorItemId": "550e8400-e29b-41d4-a716-446655440001",
  "requestedAt": "2026-06-03T10:30:00Z",
  "previousStatus": "OUTCOME_RECORDED",
  "currentStatus": "PENDING_MODIFICATION",
  "outcomeChange": {
    "before": 50000,
    "after": 100000,
    "variance": 1.0
  },
  "fraudRiskImpact": {
    "beforeAssessment": { "riskLevel": "low", "indicators": [] },
    "afterAssessment": { "riskLevel": "high", "indicators": ["Retroactive modification"] }
  }
}
```

**Authorization:**
- Actor: `assignedToUserId` OR workspace admin
- Scope: Own workspace only

**Errors:**
```
400 Bad Request — Invalid newActualOutcomeValue (negative or non-numeric)
403 Forbidden — Actor not authorized to request modification
404 Not Found — Decision not found or wrong workspace
409 Conflict — Decision not in OUTCOME_RECORDED state
```

**Compatibility Risk:** ⚠️ MEDIUM
- New endpoint, no breaking changes to existing APIs
- Client may need UI update to show modification button
- Backward compatible (old clients can't request, new clients can)

---

#### New Endpoint 2: Approve/Reject Modification

**Route:** `POST /api/outcomes/{modificationRequestId}/approve`

**Request:**
```json
{
  "decision": "APPROVE",
  "approvalReason": "Verified with customer, reasonable adjustment"
}
```

**Response (200 OK):**
```json
{
  "modificationRequestId": "550e8400-e29b-41d4-a716-446655440000",
  "operatorItemId": "550e8400-e29b-41d4-a716-446655440001",
  "decision": "APPROVE",
  "approvedAt": "2026-06-03T10:35:00Z",
  "newVerificationStatus": "disputed",
  "reason": "Verified with customer, reasonable adjustment"
}
```

**Authorization:**
- Actor: Designated approver (workspace admin or reviewer role)
- Scope: Own workspace only

**Errors:**
```
400 Bad Request — Invalid decision (must be "APPROVE" or "REJECT")
403 Forbidden — Actor not authorized as approver
404 Not Found — Modification request not found
409 Conflict — Request already approved/rejected
```

**Compatibility Risk:** ⚠️ MEDIUM
- New endpoint
- No impact on existing outcome recording API
- Backward compatible

---

### Modified Endpoints

#### POST /api/operator (Existing)

**Current:** Records outcome in single call
**After C3:** Same behavior, but underlying logic has modification context

**Request (unchanged):**
```json
{
  "id": "decision-id",
  "status": "done",
  "actualOutcome": 100000
}
```

**Response (unchanged):**
```json
{
  "id": "decision-id",
  "status": "done",
  "verificationStatus": "disputed"
}
```

**Compatibility Risk:** ✅ LOW
- No breaking changes
- First-time outcome recording still works identically
- Modifications use separate endpoints

---

### API Versioning Strategy

**Not Required for Decision C:**
- New endpoints use new paths (`/api/outcomes/...`)
- Existing `/api/operator` endpoint unchanged
- No version header needed
- Clients can opt-in to new workflow

---

### Authorization & Role Changes Required

**New Role/Capability:** "outcome_approver"

Add to authorization service:
```typescript
// src/services/auth/access.ts

export function canApproveOutcomeModification(role: ServerRole): boolean {
  // Only workspace admins or designated approvers
  return role === "admin" || role === "reviewer";
}
```

**Risk:** ⚠️ MEDIUM
- Must verify approver role in new endpoints
- Role-based access control must be enforced
- Need to track who can approve per workspace

---

### API Response Format

**Standard for both Decision B and C endpoints:**

Follow existing OpsIQ patterns:
```typescript
interface OutcomeResponse {
  id: string;
  operatorItemId: string;
  verificationStatus: "unverified" | "disputed" | "verified";
  verificationMethod: string;
  verificationConfidence: number;
  verificationEvidence: {
    fraudRiskAssessment: FraudRiskAssessment;
    verificationReason?: string;
    capturedAt: string;
    capturedBy: string;
  };
  auditTrail: AuditTrailEntry[];
}
```

**Risk:** ✅ LOW
- Uses existing response structures
- No new type definitions needed
- Matches current audit trail format

---

---

# TASK 5 — TEST IMPACT MATRIX

## All P2B Tests (78 total)

### Group A: Currently Passing (31 tests)

These tests should remain passing after both decisions.

**Risk:** ⚠️ LOW-MEDIUM
- Decision B may cause some additional tests to pass
- Decision C may require state machine review
- No breaking changes expected

---

### Group B: Currently Failing Due to Decision B (2 tests)

#### Test B1: "should accept uncertain with outcomeNotes and auto-flag"

| Aspect | Current | After B | After B+C |
|--------|---------|---------|-----------|
| Status | ❌ FAIL | ✅ PASS | ✅ PASS |
| File | decision-outcome-path.test.ts:160 | Same | Same |
| Reason | 400% variance = 0 + 0.5 (round) < 2.5 threshold | 400% variance = 1.0 + 0.5 = 1.5 >= 1.5 | Unchanged |

**Action:** No test change needed — Decision B thresholds make it pass.

---

#### Test B2: "should auto-flag when variance exceeds 500%"

| Aspect | Current | After B | After B+C |
|--------|---------|---------|-----------|
| Status | ❌ FAIL | ✅ PASS | ✅ PASS |
| File | decision-outcome-path.test.ts:243 | Same | Same |
| Reason | 500% variance = 1.0 (variance > 5 false) + 0.5 < 2.5 | 500% variance = 1.0 + 0.5 = 1.5 >= 1.5 | Unchanged |

**Action:** No test change needed — Decision B thresholds make it pass.

---

### Group C: Currently Failing Due to Decision C (1 test)

#### Test C1: "should flag retroactive modifications"

| Aspect | Current | After C |
|--------|---------|---------|
| Status | ❌ FAIL | ⚠️ NEEDS REFACTOR |
| File | decision-outcome-path.test.ts:281 | Same |
| Reason | Second recordDecisionOutcome() call throws ValidationError (state not EXECUTED) | Must use approval workflow |

**Current Code:**
```typescript
await recordDecisionOutcome(..., 50000, ...);
await recordDecisionOutcome(..., 100000, ...);  // ← Throws ValidationError
```

**After C — New Code Required:**
```typescript
await recordDecisionOutcome(..., 50000, ...);
const modReq = await requestOutcomeModification(..., { newValue: 100000, ... });
await approveOutcomeModification(..., modReq.id, ..., "APPROVE", "test approval");
```

**Action:** Modify test to use new workflow.

**Risk:** ⚠️ MEDIUM
- Test must be refactored
- Approver role mocking needed
- Async workflow setup required

---

### Group D: Decision B & C Verification Tests (10-15 tests)

Tests that verify fraud detection and verification status:

#### Tests That May Require Review:

| Test Name | File | Risk | Action |
|-----------|------|------|--------|
| "should not flag normal variances" | decision-outcome-path.test.ts | LOW | Review variance assertions |
| "should populate verificationStatus as disputed" | real-route-tests.test.ts | LOW | Review expected status |
| "should classify uncertain identically" | outcome-classifier.test.ts | LOW | No change |
| "should flag retroactive modifications consistently" | path-convergence.test.ts | MEDIUM | Verify state assumptions |
| "REAL: route fraud detection auto-flags" | real-route-tests.test.ts | MEDIUM | Review hardcoded thresholds |
| "REAL: recordDecisionOutcome auto-flags" | verified-lifecycle.test.ts | MEDIUM | Review expected fraud score |
| "should auto-flag when fraud risk is high" | verified-lifecycle.test.ts | LOW | Thresholds changed, may still pass |
| "should not auto-flag when fraud risk is low" | verified-lifecycle.test.ts | LOW | Thresholds changed, may still pass |
| "should not auto-flag when fraud risk is medium" | verified-lifecycle.test.ts | LOW | Thresholds changed, may still pass |

**Estimated Tests Needing Review:** 5-8 tests

**Action:** Run full test suite after Decision B, review failures.

---

### Group E: State Machine Tests (5-7 tests)

Tests verifying decision lifecycle state transitions:

| Test | Current Status | After Decision C |
|------|---|---|
| "should allow EXECUTED → OUTCOME_RECORDED" | ✅ PASS | ✅ PASS (still allowed) |
| "should not allow direct OUTCOME_RECORDED → CLOSED without outcome" | ✅ PASS | ⚠️ REVIEW (new PENDING_MODIFICATION state) |
| "should block invalid transitions" | ✅ PASS | ⚠️ REVIEW (new transitions added) |
| "should enforce terminal state immutability" | ✅ PASS | ✅ PASS (still enforced) |

**Action:** Review state machine tests after C implementation.

---

### Group F: Audit Trail Tests (3-5 tests)

Tests verifying audit events are emitted:

| Test | Impact | Action |
|------|--------|--------|
| "should emit OUTCOME_RECORDED audit event" | ✅ PASS | No change |
| "should track audit trail changes" | ✅ PASS | May include modification events |
| "should preserve verification evidence in audit" | ✅ PASS | May need to verify fraud assessment after modification |

**Action:** Review audit trail structure after Decision C.

---

### Group G: Fraud Assessment Tests (6-8 tests)

Tests for fraud risk scoring specifically:

#### Tests Definitely Passing After Decision B:
- ✅ "should classify 5x expected as uncertain (400% variance)"
- ✅ "should classify 3x expected as uncertain (201% variance)"
- ✅ "should produce identical fraud risk assessments"
- ✅ "should consistently assess fraud risk for extreme variance"

**Action:** No changes needed for Decision B.

---

### Group H: Integration Tests (4-6 tests)

End-to-end tests combining operator route + decision lifecycle:

| Test | Risk | Action |
|------|------|--------|
| Route integration with outcome | MEDIUM | Review fraud detection assertions |
| Decision path convergence | LOW | No breaking change |
| Verification lifecycle integration | MEDIUM | Review state transitions |

**Action:** Run full integration tests, assess failures.

---

## Test Count Projection

### Current State (31 passing / 11 failing / 36 unknown)

**Known Failures:**
- B1: "should accept uncertain with outcomeNotes" → ❌
- B2: "should auto-flag when variance exceeds 500%" → ❌
- C1: "should flag retroactive modifications" → ❌
- Unknown: 8 additional failing tests

---

### After Decision B Only (No Decision C)

**Expected:**
- B1: ✅ PASS
- B2: ✅ PASS
- C1: ❌ FAIL (still fails, Decision B doesn't affect)
- Unknown: Depends on test content

**Projection: 33+ passing / 1 definite failing / 8 unknown**

---

### After Decision B + C Implementation

**Expected:**
- B1: ✅ PASS (Decision B thresholds)
- B2: ✅ PASS (Decision B thresholds)
- C1: ✅ PASS (Approval workflow enables retroactive modifications)
- Unknown: 5-8 tests require review/refactoring

**Projection: 35-37 passing / 0-3 failing / requires review**

---

### Final Expected Results

| Phase | Passing | Failing | Effort |
|-------|---------|---------|--------|
| Current | 31 | 11 | — |
| After Decision B | 33+ | 9- | Low (1 day) |
| After Decision B+C | 37-39 | 3-5* | Medium (5 days) |

*Failing tests may be fixable with Decision C implementation, or may require clarification on business rules not yet documented.

---

---

# TASK 6 — HIDDEN RISK AUDIT

## Potential Conflicts and Issues

### Risk 1: State Machine Assumption Violations

**Issue:** Code throughout codebase may assume EXECUTED → OUTCOME_RECORDED is one-way

**Locations to Audit:**

1. `src/services/decisions/decision-lifecycle.service.ts`
   - Line 56: `mapStatusToState(decision.status)`
   - Line 446: `if (currentState !== "OUTCOME_RECORDED")`
   - **Risk:** closeDecision() assumes only OUTCOME_RECORDED can be closed
   - **Mitigation:** Verify PENDING_MODIFICATION cannot transition to CLOSED directly

2. `src/domain/decision-lifecycle.ts`
   - Line 30: Terminal states assumption
   - **Risk:** Code assumes OUTCOME_RECORDED → CLOSED is only path
   - **Mitigation:** Add PENDING_MODIFICATION to allowed transitions explicitly

3. `src/services/operator/store.ts`
   - **Risk:** updateItem() may have status assertions
   - **Mitigation:** Search for hardcoded state checks

**Action Items:**
- [ ] Search for `OUTCOME_RECORDED` status checks
- [ ] Verify all status transitions respect new PENDING_MODIFICATION state
- [ ] Test state machine with PENDING_MODIFICATION path

**Risk Level:** ⚠️ HIGH

---

### Risk 2: Fraud Detection Re-evaluation on Modification

**Issue:** When outcome is modified, fraud detection must be re-run on NEW values

**Current Code:** `captureOutcomeVerificationMetadata()` always uses `previousActualOutcomeValue` for retroactive detection

**Problem:** If modifying from 50K → 100K:
- Retroactive modification detected (2 points) ✅
- But variance calculated on NEW value (100K)
- Fraud assessment may change (before: low, after: high)

**Risk:** Inconsistent audit trail if fraud assessment changes between request and approval

**Locations:**
- `src/services/outcome/verification.ts` line 365-374

**Mitigation:**
1. Store fraud assessment at modification request time
2. Store fraud assessment at approval time
3. Include both in audit trail
4. Document fraud risk impact in modification response

**Action Items:**
- [ ] Modify `captureOutcomeVerificationMetadata()` to accept fraud assessment params
- [ ] Update `recordDecisionOutcome()` to include fraud impact in audit trail
- [ ] Test fraud detection on modified values

**Risk Level:** ⚠️ MEDIUM

---

### Risk 3: Idempotency Key Handling for Approval Workflow

**Issue:** Approval operations must be idempotent (only one approval per request)

**Current Code:** `src/app/api/operator/route.ts` uses idempotency keys for POST

**Problem:** New approval endpoint must also respect idempotency

**Locations:**
- New endpoint: `POST /api/outcomes/{modificationId}/approve`
- Must check: idempotency-key header
- Must prevent: duplicate approvals from same actor

**Risk:** If approval is retried (e.g., network failure), outcome modified twice

**Mitigation:**
1. Require idempotency-key header on approval endpoint
2. Check if already approved before processing
3. Return cached response if already approved

**Action Items:**
- [ ] Add idempotency key check to approval endpoint
- [ ] Implement cached response for duplicate approvals
- [ ] Test idempotency with duplicate requests

**Risk Level:** ⚠️ MEDIUM

---

### Risk 4: Backward Compatibility with Existing Data

**Issue:** Existing OperatorItem records won't have modification_request_id

**Problem:** Queries filtering by modification_request_id will exclude legacy records

**Risk:** Inconsistency if legacy outcomes are updated after Decision C

**Mitigation:**
1. Allow NULL modification_request_id (it is already nullable)
2. Legacy first-time recordings → modification_request_id = NULL
3. Modifications → modification_request_id = UUID
4. Queries handle both cases

**Locations:**
- Schema: `operator_items.modification_request_id` should be nullable
- Queries: SELECT should handle NULL case

**Action Items:**
- [ ] Verify schema migration allows NULL
- [ ] Update queries to handle NULL modification_request_id
- [ ] Test with legacy test data

**Risk Level:** ✅ LOW
- Already nullable in proposed schema
- Backward compatible by design

---

### Risk 5: Audit Trail Complexity

**Issue:** Audit trail becomes complex with modifications

**Current:** Single entry per outcome recording
```json
[
  {
    "timestamp": "2026-06-03T10:00:00Z",
    "actorId": "user-1",
    "action": "OUTCOME_RECORDED",
    "beforeValue": null,
    "afterValue": 50000
  }
]
```

**After Modification:**
```json
[
  {
    "timestamp": "2026-06-03T10:00:00Z",
    "actorId": "user-1",
    "action": "OUTCOME_RECORDED",
    "beforeValue": null,
    "afterValue": 50000
  },
  {
    "timestamp": "2026-06-03T10:10:00Z",
    "actorId": "user-1",
    "action": "OUTCOME_MODIFICATION_REQUESTED",
    "beforeValue": 50000,
    "afterValue": 100000,
    "reason": "correction"
  },
  {
    "timestamp": "2026-06-03T10:15:00Z",
    "actorId": "admin-1",
    "action": "OUTCOME_MODIFICATION_APPROVED",
    "beforeValue": 50000,
    "afterValue": 100000,
    "reason": "reasonable adjustment"
  }
]
```

**Risk:** Audit trail grows, but must remain queryable and understandable

**Mitigation:**
1. Keep modifications in separate table (OutcomeModificationRequest)
2. Keep main audit trail clean (OUTCOME_RECORDED only)
3. Link tables via FK and modification_request_id
4. Provide API to query modification history

**Action Items:**
- [ ] Design modification audit structure
- [ ] Create helper to build full modification audit trail
- [ ] Test audit trail queryability

**Risk Level:** ⚠️ MEDIUM

---

### Risk 6: Approval Role Definition

**Issue:** "Approver" role not yet defined in codebase

**Risk:** New approval endpoints need to check authorization

**Locations:**
- `src/services/auth/access.ts` — no canApproveOutcomeModification function
- `src/services/approval/workflow.ts` — may not exist

**Mitigation:**
1. Define approver role/capability
2. Add authorization check in approval endpoint
3. Document who can approve (admin or designated reviewer)
4. Add tests for unauthorized approvals

**Action Items:**
- [ ] Define approver role
- [ ] Add authorization check
- [ ] Document approval requirements
- [ ] Add negative test cases

**Risk Level:** ⚠️ MEDIUM

---

### Risk 7: Foreign Key Constraint Conflicts

**Issue:** OutcomeModificationRequest has FK to OperatorItem, but OperatorItem has FK to OutcomeModificationRequest

**Risk:** Circular FK references may cause constraint violations

**Current Proposal:**
```
OperatorItem
  ├─ modification_request_id → OutcomeModificationRequest.id
  
OutcomeModificationRequest
  ├─ operator_item_id → OperatorItem.id
```

**Problem:** If deleting OperatorItem with pending modification:
- CASCADE delete in OutcomeModificationRequest removes it ✅
- OperatorItem.modification_request_id becomes orphaned ⚠️

**Solution:** Already mitigated by CASCADE delete and ON DELETE CASCADE

**Risk Level:** ✅ LOW
- Migration includes `ON DELETE CASCADE`
- No orphaned records possible

---

### Risk 8: Concurrency Issues

**Issue:** Two users request modifications simultaneously

**Risk:** UNIQUE constraint on (operator_item_id, approver_user_id) prevents duplicates, but race conditions possible

**Scenario:**
1. User A requests modification with approver=admin
2. User B requests modification with approver=admin (same time)
3. Second insert violates UNIQUE constraint

**Mitigation:**
1. UNIQUE constraint already prevents duplicates
2. Client should check if request already pending
3. API returns 409 Conflict if request exists
4. UI disables modification button if request pending

**Action Items:**
- [ ] Add pending check in requestOutcomeModification
- [ ] Return 409 if already pending
- [ ] Test concurrent requests

**Risk Level:** ⚠️ MEDIUM

---

### Risk 9: Fraud Assessment Discrepancy

**Issue:** Fraud assessment at request time vs. approval time may differ

**Scenario:**
1. Request modification: beforeValue=50K, afterValue=100K
   - Fraud assessment: riskScore=0 (only retroactive at request=2pts)
   - Shown to approver: "Retroactive modification detected"

2. Approve modification: Outcome recorded
   - Fraud assessment: riskScore=2.5 (retroactive + variance >= 200%)
   - Result: "disputed" status

3. Discrepancy: Approver saw low fraud risk, actual is high

**Mitigation:**
1. Store fraud risk at both times
2. Show approver the AFTER assessment
3. Flag if fraud assessment worsens during approval
4. Require re-approval if fraud risk increases

**Risk Level:** ⚠️ MEDIUM

---

### Risk 10: Test Isolation Issues

**Issue:** Approval workflow tests need to mock approver role

**Risk:** Test fixtures may not set up approver properly, causing failures

**Mitigation:**
1. Create shared test fixture for approval workflows
2. Define test approver role with permissions
3. Mock authorization checks
4. Document test setup requirements

**Action Items:**
- [ ] Create approval test fixture
- [ ] Document mocking strategy
- [ ] Add negative test cases (unauthorized approvals)

**Risk Level:** ⚠️ MEDIUM

---

## Summary of Hidden Risks

| Risk | Level | Mitigation Effort | Likelihood |
|------|-------|-------------------|-----------|
| State machine assumptions | HIGH | Medium | High |
| Fraud detection re-evaluation | MEDIUM | Medium | High |
| Idempotency handling | MEDIUM | Low | Medium |
| Backward compatibility | LOW | Low | Low |
| Audit trail complexity | MEDIUM | Medium | Medium |
| Approval role definition | MEDIUM | Low | High |
| FK constraint conflicts | LOW | Low | Low |
| Concurrency issues | MEDIUM | Medium | Low |
| Fraud assessment discrepancy | MEDIUM | Medium | High |
| Test isolation | MEDIUM | Medium | High |

**Overall Risk Assessment:** ⚠️ MEDIUM-HIGH
- Decision B: LOW risk
- Decision C: MEDIUM-HIGH risk due to workflow complexity

---

---

# TASK 7 — PHASED EXECUTION PLAN

## Recommended Implementation Sequence

### PHASE 1: Foundation (Days 1-2)

**Objective:** Update fraud detection thresholds (Decision B) before attempting workflow changes

#### Files Touched:
1. `src/services/outcome/verification.ts` (Lines 86, 105)
2. `src/__tests__/p2b/decision-outcome-path.test.ts` (No change, tests will pass)

#### Changes:
```typescript
// src/services/outcome/verification.ts Line 86
- if (variance > 5) {
+ if (variance >= 2) {

// src/services/outcome/verification.ts Line 105
- riskScore >= 2.5 ? "high" : riskScore >= 1.5 ? "medium" : "low";
+ riskScore >= 1.5 ? "high" : riskScore >= 1.0 ? "medium" : "low";
```

#### Tests Expected to Fix:
- ✅ Test B1: "should accept uncertain with outcomeNotes"
- ✅ Test B2: "should auto-flag when variance exceeds 500%"

#### Expected Result:
```
Before: 31 passing / 11 failing
After:  33 passing / 9 failing
```

#### Tests to Run:
```bash
npm test -- src/__tests__/p2b/decision-outcome-path.test.ts
npm test -- src/__tests__/p2b/  # All P2B tests
```

#### Rollback Risk: ✅ LOW
- Single file change
- Purely internal logic
- No schema/API impact
- Easy revert if issues

---

### PHASE 2: Schema & Data Layer (Days 3-4)

**Objective:** Implement database changes for outcome modification tracking (Decision C foundation)

#### Files Touched:
1. `prisma/schema.prisma` (Add OutcomeModificationRequest model, extend OperatorItem)
2. `prisma/migrations/` (New migration file)

#### Schema Changes:

**New Model:**
```prisma
model OutcomeModificationRequest {
  id                      String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  operatorItemId          String       @db.Uuid @map("operator_item_id")
  requestedBy             String       @db.Uuid @map("requested_by")
  approverUserId          String       @db.Uuid @map("approver_user_id")
  
  outcomeBeforeValue      Float        @map("outcome_before_value")
  outcomeAfterValue       Float        @map("outcome_after_value")
  requestReason           String       @map("request_reason")
  evidenceReference       String?      @map("evidence_reference")
  
  fraudRiskBefore         Json         @map("fraud_risk_before")
  fraudRiskAfter          Json         @map("fraud_risk_after")
  
  approvalStatus          String       @default("pending") @map("approval_status")
  approvalDecision        String?      @map("approval_decision")
  approvalReason          String?      @map("approval_reason")
  approvedAt              DateTime?    @map("approved_at")
  
  operatorItem            OperatorItem @relation(fields: [operatorItemId], references: [id], onDelete: Cascade)
  requester               User         @relation("outcome_mod_requested_by", fields: [requestedBy], references: [id])
  approver                User         @relation("outcome_mod_approver", fields: [approverUserId], references: [id])
  
  createdAt               DateTime     @default(now()) @map("created_at")
  updatedAt               DateTime     @map("updated_at")
  
  @@unique([operatorItemId, approverUserId])
  @@index([approvalStatus])
  @@index([requestedAt])
  @@map("outcome_modification_requests")
}
```

**Extend OperatorItem:**
```prisma
model OperatorItem {
  // ... existing fields ...
  
  modificationRequestId   String?      @db.Uuid @map("modification_request_id")
  modificationApprovedAt  DateTime?    @map("modification_approved_at")
  modificationApprovedBy  String?      @db.Uuid @map("modification_approved_by")
  
  modificationRequest     OutcomeModificationRequest? @relation(fields: [modificationRequestId], references: [id])
}
```

**Extend User:**
```prisma
model User {
  // ... existing fields ...
  
  outcomeMods             OutcomeModificationRequest[] @relation("outcome_mod_requested_by")
  outcomeModApprovals     OutcomeModificationRequest[] @relation("outcome_mod_approver")
}
```

#### Tests to Run:
```bash
npm run prisma:migrate -- --name add_outcome_modifications
npm run prisma:generate
npm test -- src/__tests__/p2b/  # Verify no test failures
```

#### Expected Result:
- Schema generated successfully
- Generated types reflect new model
- Existing tests still pass (no data changes)

#### Rollback Risk: ⚠️ MEDIUM
- Database migration
- Can rollback with `prisma migrate resolve --rolled-back add_outcome_modifications`
- No data loss (migration is additive only)

---

### PHASE 3: State Machine & Service Layer (Days 5-6)

**Objective:** Implement decision lifecycle changes and outcome modification workflow

#### Files Touched:
1. `src/domain/decision-lifecycle.ts` (New state, transitions, rules)
2. `src/services/decisions/decision-lifecycle.service.ts` (New functions)
3. `src/services/approval/` (New service or enhancement)

#### Changes in decision-lifecycle.ts:

```typescript
// Add new state
export const DECISION_STATES = [
  // ... existing ...
  "PENDING_MODIFICATION",  // ← ADD
  // ... existing ...
];

// Update transitions
export const ALLOWED_TRANSITIONS: Record<DecisionState, DecisionState[]> = {
  // ... existing ...
  OUTCOME_RECORDED: ["CLOSED", "PENDING_MODIFICATION"],  // ← MODIFY
  PENDING_MODIFICATION: ["OUTCOME_RECORDED", "CLOSED"],  // ← ADD
  // ... existing ...
};

// Expand recordable states
export function requireOutcomeRecordable(state: DecisionState): void {
  const outcomeRecordableStates: DecisionState[] = ["EXECUTED", "PENDING_MODIFICATION"];  // ← MODIFY
  // ... rest unchanged ...
}
```

#### New Functions in decision-lifecycle.service.ts:

1. **requestOutcomeModification()** (50 lines)
2. **approveOutcomeModification()** (70 lines)
3. **rejectOutcomeModification()** (30 lines)
4. Modify **recordDecisionOutcome()** to support modifications (20 line changes)

#### Create New Service: outcome-modification.service.ts

```typescript
export async function requestOutcomeModification(...): Promise<OutcomeModificationRequest>;
export async function getModificationRequest(...): Promise<OutcomeModificationRequest | null>;
export async function isModificationPending(...): Promise<boolean>;
export async function approveModificationRequest(...): Promise<void>;
export async function rejectModificationRequest(...): Promise<void>;
```

#### Tests to Run:
```bash
npm test -- src/__tests__/p2b/  # Should still pass (state machine logic only)
```

#### Expected Result:
- State machine accepts new transitions
- Services handle modification workflow
- No test failures yet (logic not wired to tests)

#### Rollback Risk: ✅ LOW
- Backward compatible (new state, new functions)
- Existing code paths unchanged
- Can disable new functionality if needed

---

### PHASE 4: API Endpoints & Test Wiring (Days 7-8)

**Objective:** Implement approval endpoints and wire tests to use new workflow

#### Files Touched:
1. `src/app/api/outcomes/` (New directory, 2 routes)
2. `src/__tests__/p2b/decision-outcome-path.test.ts` (Refactor test C1)
3. `src/__tests__/p2b/verified-lifecycle.test.ts` (Update retroactive tests)

#### New API Routes:

**src/app/api/outcomes/[decisionId]/modifications/route.ts**
```typescript
export const POST = withCanonicalEnforcement(async (ctx) => {
  const { decisionId } = ctx.params;
  const { newActualOutcomeValue, requestReason, evidence } = await ctx.request.json();
  
  // Validate
  // Create OutcomeModificationRequest
  // Transition state to PENDING_MODIFICATION
  // Return response
});
```

**src/app/api/outcomes/[modificationId]/approve/route.ts**
```typescript
export const POST = withCanonicalEnforcement(async (ctx) => {
  const { modificationId } = ctx.params;
  const { decision, approvalReason } = await ctx.request.json();
  
  // Validate approver authorization
  // Call approveModificationRequest or rejectModificationRequest
  // Return response
});
```

#### Test Updates:

**Test C1: Refactor to use approval workflow**

From:
```typescript
await recordDecisionOutcome(..., 50000, ...);
await recordDecisionOutcome(..., 100000, ...);  // ← Would fail
expect(decision?.verificationStatus).toBe("disputed");
```

To:
```typescript
await recordDecisionOutcome(..., 50000, ...);

const modReq = await requestOutcomeModification(
  testDecisionId,
  testWorkspaceId,
  { newActualOutcomeValue: 100000, requestReason: "correction" },
  testActorId,
  testApproverId
);

await approveOutcomeModification(
  testDecisionId,
  modReq.id,
  testApproverId,
  "APPROVE",
  "test approval"
);

const decision = await db.operatorItem.findUnique(...);
expect(decision?.verificationStatus).toBe("disputed");
```

#### Tests to Run:
```bash
npm test -- src/__tests__/p2b/decision-outcome-path.test.ts
npm test -- src/__tests__/p2b/verified-lifecycle.test.ts
npm test -- src/__tests__/p2b/  # All P2B tests
```

#### Expected Result:
```
Before: 33 passing / 9 failing (after Phase 1)
After:  37-38 passing / 3-4 failing
```

#### Rollback Risk: ⚠️ MEDIUM
- New API routes (can be disabled)
- Test changes are additive
- Rollback requires reverting test changes

---

## Final Validation Phase (Day 9)

### Pre-Deployment Checks:

1. **All P2B Tests:** 37-39 passing / 0-4 failing
2. **Integration Tests:** No regressions in other test suites
3. **Fraud Detection:** Manual verification of Decision B thresholds
4. **Workflow:** Manual approval flow testing
5. **Audit Trail:** Verify modifications recorded correctly
6. **Database:** Verify schema migration on staging
7. **API:** Verify new endpoints return correct responses

### Tests to Run:

```bash
# Full P2B suite
npm test -- src/__tests__/p2b/

# Integration tests
npm test -- src/__tests__/p2b/

# Smoke tests (if available)
npm test -- src/__tests__/smoke/

# Full suite (if feasible)
npm test
```

### Acceptance Criteria:

- [ ] Decision B: 2 tests (B1, B2) now passing
- [ ] Decision C: 1 test (C1) now passing with approval workflow
- [ ] No new failures introduced
- [ ] Audit trail captures all modifications
- [ ] Fraud detection re-runs on modified values
- [ ] Approver authorization enforced
- [ ] Idempotency keys prevent duplicate approvals

---

## Implementation Timeline

| Phase | Duration | Days | Risk |
|-------|----------|------|------|
| Phase 1: Fraud Thresholds (Decision B) | 1-2 days | 1-2 | LOW |
| Phase 2: Schema & Migrations (Decision C) | 1-2 days | 3-4 | MEDIUM |
| Phase 3: State Machine & Services | 2 days | 5-6 | LOW |
| Phase 4: API & Tests | 2 days | 7-8 | MEDIUM |
| Validation & Testing | 1 day | 9 | LOW |
| **Total** | **7-9 days** | **9** | **MEDIUM** |

---

## Rollback Plan

### If Phase 1 Fails:
```bash
git revert <phase-1-commit>
# Reverses verification.ts changes only
# No schema/migration impact
```

### If Phase 2 Fails (Migration):
```bash
prisma migrate resolve --rolled-back add_outcome_modifications
# Rolls back schema changes
# No data loss (additive only)
```

### If Phase 3 Fails (State Machine):
```bash
git revert <phase-3-commit>
# Reverts decision-lifecycle changes
# New functions disabled, old logic restored
```

### If Phase 4 Fails (API):
```bash
git revert <phase-4-commit>
# Removes new routes, reverts test changes
# Existing workflow still works
```

### Full Rollback:
```bash
git revert <all-commits>
prisma migrate resolve --rolled-back add_outcome_modifications
npm run prisma:generate
npm test
```

---

---

# FINAL SUMMARY

## Implementation Impact Overview

| Aspect | Decision B | Decision C | Combined |
|--------|-----------|-----------|----------|
| **Files touched** | 1 | 18-22 | 19-23 |
| **Schema changes** | 0 | 1 table + 3 columns | 1 table + 3 columns |
| **API changes** | 0 | 2 new endpoints | 2 new endpoints |
| **Test changes** | 0 active, 2 auto-pass | 1-3 refactors | 1-3 refactors |
| **Risk level** | ✅ LOW | ⚠️ MEDIUM-HIGH | ⚠️ MEDIUM-HIGH |
| **Timeline** | 1-2 days | 7-8 days | 9 days |
| **Tests fixed** | 2 | 1 | 3 |

## Expected Final Test Status

```
Current:      31 passing / 11 failing
After B:      33 passing / 9 failing
After B+C:    37-39 passing / 1-3 failing
```

Remaining failures (if any) will be unrelated to B or C — likely require additional business rule clarification.

---

**END OF IMPACT ANALYSIS**
