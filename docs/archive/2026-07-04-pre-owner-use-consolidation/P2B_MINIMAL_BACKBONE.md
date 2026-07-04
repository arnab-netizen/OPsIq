# P2B MINIMAL BACKBONE

**Date:** 2026-06-02  
**Status:** READY_FOR_IMPLEMENTATION (with revisions)  
**Scope:** Prove success, failure, uncertainty without schema changes

---

## OBJECTIVE

Enable three core capabilities with zero schema migrations:

1. **Prove Success:** Recommendation achieved intended outcome
2. **Prove Failure:** Recommendation did not work (blocked or ineffective)
3. **Prove Uncertainty:** Outcome validity questionable (fraud risk, external factors)

---

## WHAT ALREADY EXISTS

### Fields Already in Database

| Field | Type | Status | Usage |
|-------|------|--------|-------|
| `actualOutcomeValue` | Float | ✅ Set by route | Numeric outcome |
| `actualOutcome` | String | ⚠️ Exists, not set | Categorical outcome (target for P2B) |
| `outcomeDelta` | String | ⚠️ Numeric assigned | Comparison to expected |
| `verificationStatus` | String | ✅ Set to "unverified" | Validation flag |
| `verificationEvidence` | JSON | ✅ Set with fraud assessment | Risk indicators |
| `verificationConfidence` | Float | ✅ Set to 0 | Confidence in verification |
| `auditTrail` | JSON | ✅ Set with OUTCOME_RECORDED | Historical record |
| `blockReason` | String | ⚠️ Set if blocked | Explanation |
| `firstWinAchieved` | Boolean | ✅ Auto-detected | Win detection |
| `outcomeNotes` | String | ⚠️ Exists, not set | Text explanation |

### Functions Already Implemented

| Function | Status | Purpose |
|----------|--------|---------|
| `captureOutcomeVerificationMetadata()` | ✅ Called | Generates verification data |
| `checkFraudRisk()` | ✅ Called (unused) | Detects suspicious outcomes |
| `calculateOutcomeDelta()` | ✅ Called | Computes actual vs expected |
| `calculateDecisionAccuracy()` | ✅ Called | Scores accuracy |
| `buildAuditTrail()` | ✅ Called | Records changes |

---

## MINIMAL CHANGES REQUIRED

### Change 1: Populate actualOutcome Field

**File:** `src/app/api/operator/route.ts`

**Location:** After line 165 (where actualOutcomeValue is set)

**Code to Add:**

```typescript
// Determine categorical outcome
let categoricalOutcome: "success" | "partial" | "failure" | "uncertain" = "success";

if (actualOutcome === null || actualOutcome === 0) {
  // No value achieved
  categoricalOutcome = "failure";
} else if (beforeItem?.impactExpected && actualOutcome > 0 && actualOutcome < (beforeItem.impactExpected * 0.5)) {
  // Achieved but less than half expected
  categoricalOutcome = "partial";
} else if (beforeItem?.impactExpected && actualOutcome > (beforeItem.impactExpected * 2)) {
  // Suspiciously high (will be flagged below)
  categoricalOutcome = "uncertain";
}

updatePayload.actualOutcome = categoricalOutcome;
```

**Lines Added:** ~12  
**Schema Changes:** 0  
**Impact:** Enables "prove success/failure" capability

---

### Change 2: Auto-Flag High-Risk Outcomes

**File:** `src/services/outcome/verification.ts`

**Location:** Line 150 (where verificationStatus is returned)

**Code to Change:**

```typescript
// BEFORE:
return {
  verificationStatus: "unverified",
  verificationMethod: verificationResult.verificationMethod,
  verificationConfidence: verificationResult.confidence,
  verificationEvidence: {
    fraudRiskAssessment: fraudRisk,
    ...
  },
  ...
};

// AFTER:
return {
  verificationStatus: fraudRisk.riskLevel === "high" ? "flagged" : "unverified",
  verificationMethod: verificationResult.verificationMethod,
  verificationConfidence: verificationResult.confidence,
  verificationEvidence: {
    fraudRiskAssessment: fraudRisk,
    ...
  },
  ...
};
```

**Lines Changed:** 1  
**Schema Changes:** 0  
**Impact:** Enables "prove uncertainty" capability (flagged outcomes indicate risk)

---

### Change 3: Populate outcomeNotes for Blocked Items

**File:** `src/app/api/operator/route.ts`

**Location:** After verificationMetadata population (after line 181)

**Code to Add:**

```typescript
// If action is blocked or failed, ensure explanation is captured
if (status === 'done' && actualOutcome === 0) {
  if (!updatePayload.outcomeNotes && !updatePayload.blockReason) {
    updatePayload.outcomeNotes = "Outcome not achieved. Review blockReason or logs for details.";
  }
}
```

**Lines Added:** 6  
**Schema Changes:** 0  
**Impact:** Enables explanation capability for failures

---

## MINIMAL TEST COVERAGE

### Test 1: Success Outcome

**File:** `src/__tests__/p2b/outcome-success.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { updateItem } from "@/services/operator/store";

describe("P2B: Record Success Outcome", () => {
  it("should record successful outcome with correct fields", async () => {
    await updateItem("item-1", {
      status: "done",
      actualOutcomeValue: 65000,
      completedAt: new Date(),
    });

    const item = await db.operatorItem.findUnique({ where: { id: "item-1" } });

    expect(item?.actualOutcomeValue).toBe(65000);
    expect(item?.actualOutcome).toBe("success");
    expect(item?.verificationStatus).toBe("unverified");
    expect(item?.auditTrail).toBeDefined();
  });
});
```

**Pass Criteria:**
- ✅ actualOutcomeValue stored
- ✅ actualOutcome = "success"
- ✅ verificationStatus = "unverified"
- ✅ auditTrail recorded

---

### Test 2: Failure Outcome

**File:** `src/__tests__/p2b/outcome-failure.test.ts`

```typescript
describe("P2B: Record Failure Outcome", () => {
  it("should record failed outcome with explanation", async () => {
    await updateItem("item-2", {
      status: "done",
      actualOutcomeValue: 0,
      blockReason: "Stakeholder resistance blocked implementation",
      completedAt: new Date(),
    });

    const item = await db.operatorItem.findUnique({ where: { id: "item-2" } });

    expect(item?.actualOutcomeValue).toBe(0);
    expect(item?.actualOutcome).toBe("failure");
    expect(item?.blockReason).toBe("Stakeholder resistance blocked implementation");
    expect(item?.firstWinAchieved).toBe(false);
  });
});
```

**Pass Criteria:**
- ✅ actualOutcomeValue = 0 (or null)
- ✅ actualOutcome = "failure"
- ✅ blockReason captured
- ✅ firstWinAchieved = false

---

### Test 3: Uncertain Outcome

**File:** `src/__tests__/p2b/outcome-uncertainty.test.ts`

```typescript
describe("P2B: Flag Uncertain Outcome", () => {
  it("should flag high-variance outcome as uncertain", async () => {
    // Update with suspicious outcome (5x expected)
    await updateItem("item-3", {
      status: "done",
      actualOutcomeValue: 250000,  // Expected: 50000
      completedAt: new Date(),
    });

    const item = await db.operatorItem.findUnique({ where: { id: "item-3" } });

    expect(item?.actualOutcome).toBe("uncertain");
    expect(item?.verificationStatus).toBe("flagged");
    expect(item?.verificationEvidence).toBeDefined();
    expect(item?.verificationEvidence?.fraudRiskAssessment?.riskLevel).toBe("high");
  });
});
```

**Pass Criteria:**
- ✅ actualOutcome = "uncertain"
- ✅ verificationStatus = "flagged"
- ✅ fraudRiskAssessment.riskLevel = "high"
- ✅ indicators contain variance warning

---

## API CONTRACT

### Record Outcome

**Endpoint:** `POST /api/operator`

**Request:**
```json
{
  "id": "operator-item-123",
  "status": "done",
  "actualOutcome": 75000,
  "completedAt": "2026-06-02T10:00:00Z"
}
```

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "id": "operator-item-123",
    "status": "done",
    "executionStatus": "completed",
    "actualOutcomeValue": 75000,
    "actualOutcome": "success",
    "outcomeDelta": 25000,
    "verificationStatus": "unverified",
    "verificationMethod": "customer_reported_unverified",
    "verificationConfidence": 0,
    "verificationEvidence": {
      "fraudRiskAssessment": {
        "riskLevel": "low",
        "indicators": [],
        "confidence": 0
      }
    },
    "auditTrail": [
      {
        "timestamp": "2026-06-02T10:00:00Z",
        "actorId": "user-123",
        "action": "OUTCOME_RECORDED",
        "afterValue": 75000,
        "reason": "Customer reported outcome value: 75000"
      }
    ],
    "completedAt": "2026-06-02T10:00:00Z",
    "completedBy": "user-123"
  }
}
```

**Response (Failure):**
```json
{
  "success": true,
  "data": {
    "id": "operator-item-456",
    "status": "done",
    "actualOutcomeValue": 0,
    "actualOutcome": "failure",
    "outcomeDelta": null,
    "blockReason": "Stakeholder resistance",
    "verificationStatus": "unverified",
    "firstWinAchieved": false
  }
}
```

**Response (Uncertain):**
```json
{
  "success": true,
  "data": {
    "id": "operator-item-789",
    "status": "done",
    "actualOutcomeValue": 250000,
    "actualOutcome": "uncertain",
    "verificationStatus": "flagged",
    "verificationEvidence": {
      "fraudRiskAssessment": {
        "riskLevel": "high",
        "indicators": [
          "Outcome variance >200% from expected impact"
        ],
        "confidence": 0.8
      }
    }
  }
}
```

---

## FIELDS USED (No New Fields Required)

```
Input (Request Body):
├── id: string
├── status: "done" | "in_progress"
└── actualOutcome: number

Output (Persisted):
├── actualOutcomeValue: float (from actualOutcome input)
├── actualOutcome: string (NEWLY POPULATED: "success"|"partial"|"failure"|"uncertain")
├── outcomeDelta: number (computed: actual - expected)
├── verificationStatus: string (NEWLY CHANGING: "unverified"|"flagged" based on risk)
├── verificationMethod: string
├── verificationConfidence: float
├── verificationEvidence: JSON {
│   ├── fraudRiskAssessment: { riskLevel, indicators, confidence }
│   ├── verificationReason: string
│   ├── capturedAt: timestamp
│   └── capturedBy: uuid
├── blockReason: string (OPTIONALLY POPULATED)
├── outcomeNotes: string (OPTIONALLY POPULATED)
├── auditTrail: JSON array
├── firstWinAchieved: boolean (auto-detected)
└── completedAt, completedBy, verificationStatus, verifiedAt, verifiedBy
```

---

## IMPLEMENTATION ORDER

1. **Change 1: Populate actualOutcome** (route.ts, ~12 lines)
2. **Change 2: Auto-flag high-risk** (verification.ts, 1 line)
3. **Change 3: Populate outcomeNotes** (route.ts, ~6 lines)
4. **Test 1: Success path** (~20 lines)
5. **Test 2: Failure path** (~20 lines)
6. **Test 3: Uncertainty path** (~20 lines)
7. **Integration test** (~30 lines)

**Total Code:** ~150 lines  
**Total Tests:** ~70 lines  
**Schema Changes:** 0  
**Breaking Changes:** 0

---

## DEFERRED TO P2C/FUTURE

### observed_direction

**Status:** NOT IMPLEMENTED (deferred)

**Reason:** 
- Derivable from actualOutcomeValue vs impactExpected
- Not required for P2B minimal backbone
- Can be added as utility function when needed

**If needed:** Create `getObservedDirection(actualValue, expectedValue)` service function

### Confounding Factors

**Status:** NOT IMPLEMENTED (deferred)

**Reason:**
- Can use outcomeNotes (text field) for MVP
- Structured confounding factors require schema extension

**If needed:** Extend verificationEvidence JSON or add new field in P2C

### Explicit Verification Endpoint

**Status:** NOT IMPLEMENTED (deferred)

**Reason:**
- Outcomes auto-flagged based on fraud risk
- Manual verification requires admin workflow (future)

**If needed:** Add `PATCH /api/operator/:id/verify` in P2C

---

## SUCCESS CRITERIA

**Minimal P2B Complete When:**

- ✅ actualOutcome field populated for all outcomes
- ✅ verificationStatus auto-flags high-risk outcomes
- ✅ All three test cases pass (success, failure, uncertain)
- ✅ No regressions in existing outcome recording
- ✅ Audit trail captures all changes
- ✅ No schema migrations required

---

## VERDICT

**READY_FOR_IMPLEMENTATION** ✅

### Why Minimal Backbone Works

1. **All required fields exist** — No schema needed
2. **Existing functions do heavy lifting** — Just wire categorical outcome
3. **Auto-detection works** — firstWinAchieved, fraud risk assessment operational
4. **Clear success criteria** — Three tests define done

### Implementation Path

```
DAY 1: Code changes (3 modifications, ~20 lines total)
DAY 1: Tests (3 test files, ~70 lines total)
DAY 2: Integration test + QA
DAY 3: Deploy to staging
```

### No Blockers

- ✅ No database migration
- ✅ No breaking API changes
- ✅ No dependent services to update
- ✅ Backward compatible with existing outcomes

---

## REVISED P2B SCOPE

### In Scope (Minimal Backbone)
- [x] Prove success (actualOutcome="success")
- [x] Prove failure (actualOutcome="failure")
- [x] Prove uncertainty (verificationStatus="flagged")
- [x] Auto-flag high-risk outcomes
- [x] Capture explanations (blockReason, outcomeNotes)
- [x] Audit trail for all changes

### Out of Scope (Defer to P2C)
- [ ] observed_direction as stored field
- [ ] Confounding factors as structured data
- [ ] Manual verification/review workflow
- [ ] Multi-step approval for flagged outcomes
- [ ] Outcome adjustment/correction flow

---

