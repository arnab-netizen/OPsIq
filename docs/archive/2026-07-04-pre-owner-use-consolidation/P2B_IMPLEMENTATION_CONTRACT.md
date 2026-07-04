# P2B IMPLEMENTATION CONTRACT
## Outcome Validation Backbone

**Date:** 2026-06-02  
**Phase:** P2B Planning (No Implementation, No Schema Changes)  
**Status:** PLANNING PHASE  
**Based On:** Repository Code Inspection

---

## TASK 1: CURRENT OUTCOME LIFECYCLE

### OperatorItem State Transitions

#### Creation Path
**Service:** `src/services/operator/store.ts:addItems()`

```typescript
Input: OperatorItem[]
Fields Set at Creation:
- id: UUID (from decision engine)
- workspaceId: UUID
- createdByUserId: UUID?
- status: "pending" (default)
- executionStatus: "not_started" (default)
- verificationStatus: "unverified" (default)
- problem: string (what needs to be solved)
- action: string (what to do about it)
- impactExpected: float (predicted value)
- impactLow: float (range low)
- impactHigh: float (range high)
- confidence: float (decision confidence)
- priorityScore: float
- decisionHash: string? (immutable decision record)
- inputsSnapshot: JSON? (decision inputs preserved)
- createdAt: timestamp
- updatedAt: timestamp
- auditTrail: JSON? (initialized empty)
```

**Audit Event:** Not explicitly triggered in addItems() — only on updateItem()

---

#### Execution Phase
**Service:** `src/services/operator/store.ts:updateItem()`

**State Change:**
```
executionStatus: "not_started" → "started"
startedAt: null → now()
```

**Fields Tracked During Execution:**
- `startedAt` — When execution began
- `assignedToUserId` — Who is executing (can change)
- `blockStage` — Where it's blocked (if blocked)
- `blockReason` — Why it's blocked
- `blockingDependencies` — JSON list of blocking items
- `executionStatus` — Can be: "not_started", "in_progress", "paused", "blocked", "completed", "failed"

**Audit Event:** `OPERATOR_ITEM_UPDATED` (emitted in updateItem())

---

#### Completion Phase
**Service:** `src/services/operator/store.ts:updateItem()`

**State Change:**
```
status: any → "done"
executionStatus: any → "completed"
completedAt: null → now()
completedBy: null → actorId
firstCompletedAt: null → now() (auto-set on first completion)
```

**Auto-Capture Behavior:**
```typescript
// Lines 202-206: Auto-capture first completion timestamp
if (updates.status === "done" && updates.completedAt) {
  if (item && !item.firstCompletedAt) {
    updateData.firstCompletedAt = new Date(updates.completedAt);
  }
}
```

**Audit Event:** `OPERATOR_ITEM_UPDATED` (emitted in updateItem())

---

#### Outcome Recording Phase
**Service:** `src/services/operator/store.ts:updateItem()`

**Fields Updated When Recording Outcome:**
```
actualOutcome: string? (qualitative: "success", "partial", "failure", "uncertain")
actualOutcomeValue: float? (numeric outcome, e.g., cost saved in INR)
outcomeNotes: string? (explanation/evidence)
outcomeDelta: string? (comparison to expected)
decisionAccuracy: float? (calculated accuracy score)
firstPositiveOutcomeAt: timestamp (auto-set when actualOutcomeValue > 0)
firstWinAchieved: boolean (auto-set when outcome meets "first win" condition)
```

**Auto-Capture Behavior:**
```typescript
// Lines 208-213: Auto-capture first positive outcome
if (updates.actualOutcomeValue !== undefined && updates.actualOutcomeValue > 0) {
  if (item && !item.firstPositiveOutcomeAt) {
    updateData.firstPositiveOutcomeAt = new Date();
  }
}

// Lines 216-228: Auto-detect first win
if ((updates.actualOutcomeValue || updates.outcomeDelta) && !item.firstWinAchieved) {
  const isFirstWin = isFirstWinConditionMet({...});
  if (isFirstWin) {
    updateData.firstWinAchieved = true;
  }
}
```

**Audit Event:** `OPERATOR_ITEM_UPDATED` (emitted in updateItem())

---

#### Verification Phase
**Service:** `src/services/outcome/verification.ts`

**Function: captureOutcomeVerificationMetadata()**
- Input: `actualOutcomeValue`, `impactExpected`, `currentValue`, `actorId`
- Output: Captures and returns:
  ```typescript
  {
    verificationStatus: "unverified" | "verified" | "flagged",
    verificationConfidence: float (0-1),
    verificationMethod: string,
    verificationEvidence: {
      fraudRiskAssessment: FraudRiskAssessment,
      // flagged outcomes with reasons
    },
    auditTrail: AuditTrailEntry[]
  }
  ```

**Fields Updated in OperatorItem:**
```
verificationStatus: "unverified" (default) 
verificationMethod: string (how verified)
verificationConfidence: float (0.0-1.0)
verificationEvidence: JSON {
  fraudRiskAssessment: {
    riskLevel: "low" | "medium" | "high",
    indicators: string[],
    confidence: float
  }
}
verifiedAt: timestamp? (when verified)
verifiedBy: UUID? (who verified)
```

**Fraud Risk Indicators Checked (in verification.ts:63-112):**
1. Outcome exactly matches expected (suspiciously precise)
2. Round numbers (e.g., 100000, 500000)
3. Extreme variance from expected (>500%)
4. Retroactive modification of outcome
5. Very high impact + high confidence

---

#### Audit Trail Management
**Service:** `src/services/operator/store.ts:updateItem()`

**Fields:**
```
auditTrail: JSON? {
  [
    {
      timestamp: ISO8601,
      actorId: UUID,
      action: "OUTCOME_RECORDED" | "VERIFICATION_INITIATED" | ...
      beforeValue?: number,
      afterValue?: number,
      reason?: string
    }
  ]
}
```

**Building Function:**
```typescript
// src/services/outcome/verification.ts:114-134
export function buildAuditTrail(
  previousTrail: AuditTrailEntry[] | null,
  actorId: string,
  action: string,
  beforeValue?: number,
  afterValue?: number,
  reason?: string
): AuditTrailEntry[]
```

**Audit Events Emitted:**
- `OPERATOR_ITEM_UPDATED` (via updateItem() at line 244)
  - Entity Type: "operator_item"
  - Payload: First 5 updated fields
  - Visibility: "internal"

---

## TASK 2: FIELD CLASSIFICATION FOR P2B REQUIREMENTS

### Requirement: Support `observed_direction`

**Definition:** Direction of change observed (INCREASE/DECREASE/STABILIZE)

| Field Name | Current Status | Classification | Notes |
|------------|---|---|---|
| `outcomeDelta` | EXISTS_NOW | string field | Currently stores delta description (e.g., "improved from high to medium") |
| `actualOutcome` | EXISTS_NOW | string field | Can be "success", "partial", "failure", "uncertain" — could encode direction |
| `actualOutcomeValue` | EXISTS_NOW | float field | Numeric value — direction derivable from comparison to expected |
| New: `observedDirection` | DOES NOT EXIST | JSON_EXTENSION | Could add as: enum value in new JSON extension field |

**Recommendation:** JSON_EXTENSION

**Reason:** Can add to existing `auditTrail` or `verificationEvidence` JSON without schema change. Encode as:
```json
{
  "observedDirection": "INCREASE" | "DECREASE" | "STABILIZE",
  "observedValue": number,
  "expectedValue": number,
  "variance": float
}
```

---

### Requirement: Support `validation_status`

**Definition:** Status of outcome validation (unverified, pending_review, verified, flagged)

| Field Name | Current Status | Classification | Notes |
|------------|---|---|---|
| `verificationStatus` | EXISTS_NOW | string enum field | Stored as: "unverified" (default), "verified", "flagged" |
| `verificationConfidence` | EXISTS_NOW | float field | Confidence score (0.0-1.0) |
| `verificationMethod` | EXISTS_NOW | string field | How verified: "customer_reported_unverified", "system_verified", etc. |

**Recommendation:** EXISTS_NOW

**Reason:** All necessary fields already present in schema (lines 661-665):
```typescript
verificationStatus    String  @default("unverified") @map("verification_status")
verificationMethod    String? @map("verification_method")
verificationEvidence  Json?   @map("verification_evidence")
verificationConfidence Float?  @map("verification_confidence")
verifiedAt            DateTime? @map("verified_at")
```

**No schema change required.** Use existing fields.

---

### Requirement: Support `confounding_factors`

**Definition:** External factors that affected outcome (market change, scope change, resource availability, etc.)

| Field Name | Current Status | Classification | Notes |
|------------|---|---|---|
| `blockingDependencies` | EXISTS_NOW | JSON field | Already stores blocking factors |
| `blockReason` | EXISTS_NOW | string field | Text reason for blocking |
| `outcomeNotes` | EXISTS_NOW | string field | Qualitative notes on outcome |
| `verificationEvidence` | EXISTS_NOW | JSON field | Can store confounding factor assessment |
| `explanation` | EXISTS_NOW | JSON field | Could store detailed reasoning |
| New: `confoundingFactors` | DOES NOT EXIST | JSON_EXTENSION | Could add as JSON field with structured factors |

**Recommendation:** JSON_EXTENSION (using existing `verificationEvidence` or `outcomeNotes`)

**Reason:** Can encode confounding factors in existing JSON fields without schema migration:
```json
verificationEvidence: {
  "fraudRiskAssessment": {...},
  "confoundingFactors": [
    {
      "factor": "market_downturn",
      "impact": "negative",
      "estimatedVariance": -15
    },
    {
      "factor": "scope_change",
      "impact": "positive",
      "estimatedVariance": 25
    }
  ]
}
```

Or use `outcomeNotes` string field for unstructured documentation.

---

## TASK 3: MINIMUM MONETIZABLE OUTCOME BACKBONE

### Core Requirement 1: Prove Recommendation Worked

**Definition:** Demonstrate that the recommended action achieved measurable positive outcome.

**Minimum Data Model:**
```
OperatorItem {
  problem: string                    // What issue was addressed
  action: string                     // What was done
  impactExpected: float              // Predicted value (INR/hours/etc)
  impactLow: float                   // Pessimistic estimate
  impactHigh: float                  // Optimistic estimate
  
  // Outcome captured
  actualOutcomeValue: float?         // Measured result
  actualOutcome: string?             // "success" | "partial" | "failure"
  outcomeDelta: string?              // Comparison to expected
  
  // Verification
  verificationStatus: string         // "unverified" (default)
  verificationMethod: string?        // How we know it worked
  verificationConfidence: float?     // How sure we are (0-1)
}
```

**Minimum Test:**
```
Given: Recommendation for cost reduction ($50k expected)
When: Action executed and outcome recorded ($65k actual)
Then: 
  - actualOutcomeValue = 65000
  - outcomeDelta = "exceeded" (65k vs 50k)
  - verificationStatus = "unverified" (customer reported)
  - firstWinAchieved = true (auto-detected)
```

**Minimum API Contract:**
```
POST /api/operator
{
  id: "item-123",
  status: "done",
  actualOutcomeValue: 65000,
  actualOutcome: "success",
  outcomeDelta: "exceeded",
  completedAt: "2026-06-02T10:00:00Z"
}
```

---

### Core Requirement 2: Prove Recommendation Failed

**Definition:** Document that the recommended action did NOT achieve the intended outcome (or made things worse).

**Minimum Data Model:**
```
OperatorItem {
  // Existing at creation
  problem: string
  action: string
  impactExpected: float              // Expected positive outcome
  
  // Failure documented
  actualOutcomeValue: float? (null/0/-value)
  actualOutcome: "failure"
  outcomeDelta: "failed"             // Or "worsened"
  
  // Explanation required
  outcomeNotes: string               // Why it didn't work
  blockReason: string?               // What blocked it
}
```

**Minimum Test:**
```
Given: Recommendation for approval process automation ($40k expected)
When: Action attempted and outcome recorded
  - actualOutcomeValue = 0 (not achieved)
  - actualOutcome = "failure"
Then:
  - firstWinAchieved = false
  - outcomeNotes contains reason
```

**Minimum API Contract:**
```
POST /api/operator
{
  id: "item-456",
  status: "done",
  actualOutcomeValue: 0,
  actualOutcome: "failure",
  outcomeDelta: "failed",
  outcomeNotes: "Blocked by stakeholder resistance",
  completedAt: "2026-06-02T14:00:00Z"
}
```

---

### Core Requirement 3: Explain Uncertainty

**Definition:** Capture and communicate uncertainty in outcome assessment (market changed, partial success, data quality issues, etc.)

**Minimum Data Model:**
```
OperatorItem {
  // Uncertainty signals
  actualOutcome: "uncertain"         // Mark as uncertain
  outcomeDelta: "indeterminate"      // Cannot determine vs expected
  
  // Explanation
  outcomeNotes: string               // Why uncertain
  verificationStatus: "flagged"      // Mark for manual review
  
  // Fraud risk assessment
  verificationEvidence: {
    fraudRiskAssessment: {
      riskLevel: "medium" | "high",
      indicators: [
        "Outcome variance >200% from expected",
        "Data quality issues in measurement"
      ]
    }
  }
}
```

**Minimum Test:**
```
Given: Recommendation for efficiency improvement ($100k expected)
When: Outcome reported ($250k actual — beyond credibility range)
Then:
  - verificationStatus = "flagged"
  - verificationEvidence.fraudRiskAssessment.riskLevel = "high"
  - verificationEvidence.fraudRiskAssessment.indicators includes variance issue
  - outcomeNotes explains data quality concerns
```

**Minimum API Contract:**
```
POST /api/operator
{
  id: "item-789",
  status: "done",
  actualOutcomeValue: 250000,
  actualOutcome: "uncertain",
  outcomeDelta: "indeterminate",
  outcomeNotes: "Market conditions changed significantly. Unclear which outcome is attributable to this action.",
  completedAt: "2026-06-02T16:00:00Z"
}
```

---

### Minimum Viable Outcome Backbone: Summary

**No New Schemas Required.**

**Use Existing Fields:**
1. ✅ `actualOutcomeValue` — Numeric outcome
2. ✅ `actualOutcome` — Categorical outcome (success/partial/failure/uncertain)
3. ✅ `outcomeDelta` — Comparison to expected
4. ✅ `outcomeNotes` — Explanation/evidence
5. ✅ `verificationStatus` — Validation result
6. ✅ `verificationEvidence` — JSON detail (fraud assessment, confounding factors)
7. ✅ `blockReason` — Blocking explanation
8. ✅ `auditTrail` — Historical record of outcome updates

**Functions to Wire:**
1. `captureOutcomeVerificationMetadata()` — Called on every outcome update
2. `checkFraudRisk()` — Flag suspicious outcomes
3. `buildAuditTrail()` — Record all changes
4. `verifyOutcomeValue()` — Validation checks

---

## TASK 4: EXACT FILES INVOLVED

### Services (Core Outcome Logic)

**Existing Services:**

| File | Purpose | Functions |
|------|---------|-----------|
| `src/services/operator/store.ts` | OperatorItem CRUD | `addItems()`, `getItems()`, `updateItem()`, `getQueuedItems()` |
| `src/services/outcome/outcome.service.ts` | Outcome recording | `recordOutcome()` |
| `src/services/outcome/verification.ts` | Verification logic | `captureOutcomeVerificationMetadata()`, `checkFraudRisk()`, `verifyOutcomeValue()`, `buildAuditTrail()` |
| `src/services/operator/outcome.ts` | Outcome calculations | `calculateOutcomeDelta()` |
| `src/services/operator/accuracy.ts` | Accuracy scoring | `calculateDecisionAccuracy()` |
| `src/services/operator/validate.ts` | Status transitions | `validateStatusTransition()` |
| `src/services/approval/workflow.ts` | Approval gates | `canCompleteWithApprovalStatus()`, `enforceApprovalRequirement()` |
| `src/services/audit/audit-log.ts` | Audit events | `logAuditEvent()` (via emitAuditEvent) |

**Will Need to Create/Modify:**

| Category | Required | Action |
|----------|----------|--------|
| Service Layer | YES | Wire `captureOutcomeVerificationMetadata()` into POST `/api/operator` (currently imported at line 22 of route.ts but may not be fully integrated) |
| Service Layer | YES | Enhance fraud risk assessment with confounding factor detection |
| Service Layer | OPTIONAL | Add observed_direction derivation service |

---

### Routes (API Endpoints)

**Existing Routes:**

| File | Method | Purpose | Current Status |
|------|--------|---------|---|
| `src/app/api/operator/route.ts` | POST | Update operator item (status, outcome) | ✓ Exists, handles outcome updates |
| `src/app/api/operator/route.ts` | GET | List operator items | ✓ Exists |
| `src/app/api/operator/[id]/route.ts` | GET | Get single operator item | Unknown (check if exists) |
| `src/app/api/operator/[id]/route.ts` | PATCH | Update operator item | Unknown (check if exists) |
| `src/app/api/decisions/[decisionId]/route.ts` | GET/PATCH | Decision endpoints | May exist |

**Will Need to Create/Modify:**

| Route | Purpose | Action |
|-------|---------|--------|
| `POST /api/operator` | Record outcome | Ensure outcome fields validated, verification captured |
| `GET /api/operator/:id` | Get item with outcome | Ensure outcome fields returned |
| `POST /api/operator/:id/verify` | Verify outcome | NEW: Explicit verification endpoint (optional) |
| `POST /api/operator/:id/confirm-outcome` | Confirm flagged outcome | NEW: Admin confirmation of flagged outcomes (optional) |

---

### Tests (Verification Coverage)

**Existing Tests:**

| File | Coverage | Status |
|------|----------|--------|
| `src/__tests__/r1-runtime/outcome-verification.test.ts` | Verification service unit tests | ✓ Exists (11 tests) |
| `src/__tests__/phase-g/g4-outcome-tracker.test.ts` | Outcome tracking | Likely exists |
| `src/__tests__/api/operator-queue.test.ts` | Operator queue API | Likely exists |
| `src/__tests__/services/operator/` | Operator service tests | Directory exists |

**Will Need to Create/Modify:**

| Test | Purpose | Required |
|------|---------|----------|
| Integration test: POST outcome with success | Verify success path works | YES |
| Integration test: POST outcome with failure | Verify failure path works | YES |
| Integration test: POST outcome with fraud flags | Verify fraud detection works | YES |
| Integration test: Audit trail recorded | Verify audit events emitted | YES |
| Integration test: First win auto-detection | Verify firstWinAchieved flag | OPTIONAL |
| API contract test: Outcome schema validation | Verify request/response shape | YES |

---

### UI Components (Outcome Presentation)

**Existing Components:**

| Directory | Purpose | Status |
|-----------|---------|--------|
| `src/components/decision/` | Decision display components | Likely outcome-related |
| `src/components/decisions/` | Decisions list/detail | Likely outcome-related |
| `src/components/operator/` | Operator item UI | Likely exists |

**Will Need to Create/Modify:**

| Component | Purpose | Required |
|-----------|---------|----------|
| OutcomeRecorder | Form to record outcome | YES |
| OutcomeDisplay | Show recorded outcome | YES |
| VerificationBadge | Show verification status | YES |
| FraudRiskIndicator | Flag suspicious outcomes | YES |
| ConfoundingFactorsList | Show external factors | OPTIONAL |

---

## TASK 5: P2B IMPLEMENTATION CONTRACT

### Data Model (OperatorItem — No Schema Changes)

**Fields Already Supporting P2B Requirements:**

```typescript
model OperatorItem {
  // Prediction (set at creation)
  id: UUID
  impactExpected: Float           // What we predicted (e.g., 50000 INR)
  impactLow: Float                // Pessimistic case
  impactHigh: Float               // Optimistic case
  confidence: Float               // Decision confidence (0-1)
  
  // Outcome Recording (set when action completes)
  actualOutcomeValue: Float?      // Measured result (e.g., 65000 INR)
  actualOutcome: String?          // Categorical: "success" | "partial" | "failure" | "uncertain"
  outcomeDelta: String?           // Comparison: "exceeded" | "met" | "underperformed" | "failed" | "indeterminate"
  outcomeNotes: String?           // Text explanation/evidence
  
  // Execution Context
  status: String                  // "pending" | "started" | "done" | "blocked"
  executionStatus: String         // "not_started" | "in_progress" | "completed" | "blocked"
  startedAt: DateTime?
  completedAt: DateTime?
  completedBy: UUID?
  firstCompletedAt: DateTime?     // Auto-set on first completion
  firstWinAchieved: Boolean?      // Auto-detected
  
  // Uncertainty & Fraud Assessment
  verificationStatus: String      // "unverified" (default) | "verified" | "flagged"
  verificationMethod: String?     // "customer_reported_unverified" | "system_verified" | "admin_verified"
  verificationConfidence: Float?  // (0-1) How sure we are
  verificationEvidence: JSON? {   // Detailed assessment
    fraudRiskAssessment: {
      riskLevel: "low" | "medium" | "high"
      indicators: string[]        // Why flagged
      confidence: float
    }
    confoundingFactors?: [{       // Can add without schema change
      factor: string
      impact: "positive" | "negative"
      estimatedVariance: number
    }]
  }
  verifiedAt: DateTime?
  verifiedBy: UUID?
  
  // Blocking & Dependencies
  blockReason: String?            // Why blocked/failed
  blockingDependencies: JSON?     // What's blocking progress
  blockStage: String?             // Where blocked
  
  // Audit & Control
  auditTrail: JSON? [{            // Historical changes
    timestamp: ISO8601
    actorId: UUID
    action: string
    beforeValue?: number
    afterValue?: number
    reason?: string
  }]
  createdAt: DateTime
  updatedAt: DateTime
}
```

**Classification:**
- ✅ `actualOutcomeValue`, `actualOutcome` — SUCCESS TRACKING
- ✅ `verificationStatus`, `verificationEvidence` — FAILURE TRACKING & EXPLANATION
- ✅ `verificationEvidence.fraudRiskAssessment` — UNCERTAINTY CAPTURE
- ✅ `blockReason`, `outcomeNotes` — CONFOUNDING FACTORS

**Schema Changes Required:** NONE

---

### API Contracts

#### 1. Record Outcome (Success Path)

**Endpoint:** `POST /api/operator`

**Request:**
```json
{
  "id": "operator-item-123",
  "status": "done",
  "completedAt": "2026-06-02T10:00:00Z",
  "actualOutcomeValue": 65000,
  "actualOutcome": "success",
  "outcomeDelta": "exceeded",
  "outcomeNotes": "Approval time reduced by 40%. Savings achieved through process automation.",
  "verificationMethod": "customer_reported_unverified",
  "completedBy": "user-456"
}
```

**Response:**
```json
{
  "success": true,
  "operatorItem": {
    "id": "operator-item-123",
    "status": "done",
    "executionStatus": "completed",
    "impactExpected": 50000,
    "actualOutcomeValue": 65000,
    "actualOutcome": "success",
    "outcomeDelta": "exceeded",
    "verificationStatus": "unverified",
    "verificationConfidence": 0,
    "verificationMethod": "customer_reported_unverified",
    "verificationEvidence": {
      "fraudRiskAssessment": {
        "riskLevel": "low",
        "indicators": [],
        "confidence": 0
      }
    },
    "firstWinAchieved": true,
    "completedAt": "2026-06-02T10:00:00Z",
    "verifiedAt": null
  },
  "auditEvent": {
    "eventName": "operator_item.updated",
    "entityId": "operator-item-123",
    "payload": {
      "actualOutcomeValue": 65000,
      "actualOutcome": "success",
      "status": "done"
    }
  }
}
```

---

#### 2. Record Outcome (Failure Path)

**Endpoint:** `POST /api/operator`

**Request:**
```json
{
  "id": "operator-item-456",
  "status": "done",
  "completedAt": "2026-06-02T14:00:00Z",
  "actualOutcomeValue": 0,
  "actualOutcome": "failure",
  "outcomeDelta": "failed",
  "blockReason": "Blocked by stakeholder resistance. Leadership rejected proposal.",
  "outcomeNotes": "Unable to implement due to political constraints. Recommendation was technically sound but organizationally infeasible.",
  "completedBy": "user-789"
}
```

**Response:**
```json
{
  "success": true,
  "operatorItem": {
    "id": "operator-item-456",
    "status": "done",
    "executionStatus": "completed",
    "impactExpected": 100000,
    "actualOutcomeValue": 0,
    "actualOutcome": "failure",
    "outcomeDelta": "failed",
    "verificationStatus": "unverified",
    "verificationConfidence": 0,
    "blockReason": "Blocked by stakeholder resistance",
    "firstWinAchieved": false,
    "completedAt": "2026-06-02T14:00:00Z"
  }
}
```

---

#### 3. Record Uncertain Outcome

**Endpoint:** `POST /api/operator`

**Request:**
```json
{
  "id": "operator-item-789",
  "status": "done",
  "completedAt": "2026-06-02T16:00:00Z",
  "actualOutcomeValue": 250000,
  "actualOutcome": "uncertain",
  "outcomeDelta": "indeterminate",
  "outcomeNotes": "Market conditions changed significantly during execution (20% revenue decline across industry). Unclear what portion of result attributable to this action vs. external factors.",
  "completedBy": "user-012"
}
```

**Response:**
```json
{
  "success": true,
  "operatorItem": {
    "id": "operator-item-789",
    "impactExpected": 150000,
    "actualOutcomeValue": 250000,
    "actualOutcome": "uncertain",
    "outcomeDelta": "indeterminate",
    "verificationStatus": "flagged",
    "verificationConfidence": 0.3,
    "verificationEvidence": {
      "fraudRiskAssessment": {
        "riskLevel": "high",
        "indicators": [
          "Outcome variance >200% from expected",
          "Market conditions changed significantly"
        ],
        "confidence": 0.7
      },
      "confoundingFactors": [
        {
          "factor": "market_downturn",
          "impact": "negative",
          "estimatedVariance": -200000
        }
      ]
    }
  }
}
```

---

### Tests (Minimum Acceptance)

#### Test 1: Record Success Outcome

**File:** `src/__tests__/p2b/outcome-success.test.ts`

```typescript
describe("P2B: Outcome Validation — Success Path", () => {
  it("should record successful outcome and auto-detect first win", async () => {
    // Given: Completed operator item with success outcome
    const input = {
      id: "item-1",
      status: "done",
      actualOutcomeValue: 65000,
      actualOutcome: "success",
      impactExpected: 50000,
      completedAt: new Date()
    };
    
    // When: Outcome recorded via POST /api/operator
    const response = await updateItem(input.id, input);
    
    // Then:
    expect(response.actualOutcomeValue).toBe(65000);
    expect(response.actualOutcome).toBe("success");
    expect(response.firstWinAchieved).toBe(true);
    expect(response.verificationStatus).toBe("unverified");
    expect(response.auditTrail).toBeDefined();
    expect(response.auditTrail.length).toBeGreaterThan(0);
  });
});
```

**Expected Pass Criteria:**
- ✅ actualOutcomeValue stored correctly
- ✅ firstWinAchieved auto-set to true
- ✅ verificationStatus initialized to "unverified"
- ✅ Audit event emitted
- ✅ No schema migration needed

---

#### Test 2: Record Failed Outcome

**File:** `src/__tests__/p2b/outcome-failure.test.ts`

```typescript
describe("P2B: Outcome Validation — Failure Path", () => {
  it("should record failed outcome with explanation", async () => {
    const input = {
      id: "item-2",
      status: "done",
      actualOutcomeValue: 0,
      actualOutcome: "failure",
      blockReason: "Organizational resistance",
      completedAt: new Date()
    };
    
    const response = await updateItem(input.id, input);
    
    expect(response.actualOutcome).toBe("failure");
    expect(response.actualOutcomeValue).toBe(0);
    expect(response.firstWinAchieved).toBe(false);
    expect(response.blockReason).toBe("Organizational resistance");
  });
});
```

**Expected Pass Criteria:**
- ✅ Failure outcome recorded
- ✅ firstWinAchieved = false
- ✅ blockReason preserved
- ✅ Audit trail captured

---

#### Test 3: Flag Uncertain Outcome

**File:** `src/__tests__/p2b/outcome-uncertainty.test.ts`

```typescript
describe("P2B: Outcome Validation — Uncertainty & Fraud Detection", () => {
  it("should flag suspicious outcome with high variance", async () => {
    const input = {
      id: "item-3",
      status: "done",
      actualOutcomeValue: 250000,
      impactExpected: 50000,
      actualOutcome: "uncertain",
      completedAt: new Date()
    };
    
    const metadata = captureOutcomeVerificationMetadata(
      input.actualOutcomeValue,
      input.impactExpected,
      null,
      "user-123"
    );
    
    expect(metadata.verificationStatus).toBe("unverified");
    expect(metadata.verificationEvidence).toBeDefined();
    expect(metadata.verificationEvidence.fraudRiskAssessment.riskLevel).toBe("high");
    expect(
      metadata.verificationEvidence.fraudRiskAssessment.indicators.some(
        i => i.includes("variance")
      )
    ).toBe(true);
  });
});
```

**Expected Pass Criteria:**
- ✅ High variance detected
- ✅ Fraud risk assessment returned
- ✅ Outcome flagged for review
- ✅ verificationEvidence.fraudRiskAssessment populated

---

### Acceptance Gates (Minimum Viable)

#### Gate 1: Outcome Recording
**Acceptance Criteria:**
- ✅ `POST /api/operator` accepts outcome fields
- ✅ actualOutcomeValue, actualOutcome, outcomeDelta stored
- ✅ Audit event emitted with outcome payload
- ✅ firstWinAchieved auto-detected when outcome > 0 AND exceeds expectations
- ✅ No schema migration required

#### Gate 2: Verification
**Acceptance Criteria:**
- ✅ `captureOutcomeVerificationMetadata()` called on outcome update
- ✅ verificationStatus, verificationEvidence populated
- ✅ Fraud risk assessment runs automatically
- ✅ High-variance outcomes flagged (>200% deviation)
- ✅ Audit trail recorded for verification changes

#### Gate 3: Uncertainty Handling
**Acceptance Criteria:**
- ✅ "uncertain" actualOutcome supported
- ✅ "indeterminate" outcomeDelta supported
- ✅ verificationStatus can be "flagged"
- ✅ Confounding factors can be stored in verificationEvidence
- ✅ Manual review workflow possible for flagged outcomes

#### Gate 4: API Contract
**Acceptance Criteria:**
- ✅ Request schema: actualOutcomeValue (float), actualOutcome (enum), outcomeDelta (string), outcomeNotes (string) required
- ✅ Response schema: includes verificationStatus, verificationEvidence, verificationConfidence
- ✅ Audit payload includes outcome fields
- ✅ No breaking changes to existing endpoints

---

### Implementation Order (Sequential, No Estimates)

1. **Wire existing services** — Integrate captureOutcomeVerificationMetadata() into POST /api/operator
2. **Test success path** — Verify outcome recording and first win detection work
3. **Test failure path** — Verify failure outcomes recorded with explanations
4. **Test fraud detection** — Verify high-variance outcomes flagged correctly
5. **UI components** — Add outcome recorder, verification badge, fraud indicator
6. **Integration tests** — Full flow: create → execute → complete → verify
7. **Admin workflow** — Optional: add confirmation UI for flagged outcomes

---

## FINAL CLASSIFICATION

**NO_SCHEMA**

**Justification:**
- ✅ All required fields already exist in OperatorItem model
- ✅ verificationStatus, verificationEvidence, auditTrail support all P2B requirements
- ✅ JSON fields (verificationEvidence, auditTrail) allow extension without migration
- ✅ No new scalar fields required
- ✅ No new enums required (actualOutcome, verificationStatus already cover values)
- ✅ First win auto-detection logic already implemented
- ✅ Fraud risk assessment service already exists
- ✅ Audit event emission already in place

**Implementation:** Primarily service and route integration, test coverage, and UI components. No data model changes.

