# P2B PRE-IMPLEMENTATION AUDIT

**Date:** 2026-06-02  
**Objective:** Destroy P2B contract assumptions against actual code  
**Source:** Repository code inspection only

---

## TASK 1: FIELD CLASSIFICATION VERIFICATION

### Field 1: observed_direction

**P2B Contract Claim:** JSON_EXTENSION

**Audit Result:** ❌ INCORRECT

**Evidence:**

1. **No existing field:** Grep search returns zero results for "observed_direction" or "observedDirection" in OperatorItem model (schema.prisma:618-688)

2. **No derivation logic:** Current code does NOT derive direction. The outcome.ts file calculates `outcomeDelta` (numeric difference) but NOT direction classification.

3. **Not stored anywhere:** 
   - actualOutcomeValue: numeric (stored) ✓
   - actualOutcome: string (exists but NOT populated by current route)
   - outcomeDelta: numeric (stored, from calculateOutcomeDelta)
   - No field for direction classification

**Current Code Flow:**
```typescript
// route.ts:171-176
const verificationMetadata = captureOutcomeVerificationMetadata(...);
updatePayload.verificationStatus = verificationMetadata.verificationStatus;
// No observed_direction captured or derived
```

**Classification:** REQUIRES_SCHEMA (if stored) or NOT_IMPLEMENTED (if derived)

**Recommendation:** 
- If STORING: Need new field `observedDirection` enum (INCREASE|DECREASE|STABILIZE)
- If DERIVING: Need service function to compute direction from actualOutcomeValue vs impactExpected

---

### Field 2: validation_status

**P2B Contract Claim:** EXISTS_NOW

**Audit Result:** ⚠️ PARTIALLY CORRECT

**Evidence:**

1. **Field exists:** verificationStatus in OperatorItem (schema line 661)
   ```typescript
   verificationStatus String @default("unverified") @map("verification_status")
   ```

2. **Current values used:**
   ```
   captureOutcomeVerificationMetadata() returns:
     verificationStatus: "unverified" (line 150 of verification.ts)
   ```

3. **No logic to change status:**
   - ❌ No code sets verificationStatus to "verified"
   - ❌ No code sets verificationStatus to "flagged"
   - ✅ Fraud risk assessment runs (checkFraudRisk), but doesn't change verificationStatus

4. **Gap:** Code checks `verificationStatus === "verified"` (attribution.ts) and `verificationStatus === "verified"` (value/7day/route.ts) but never sets these values.

**Actual Implementation Status:**
```
verificationStatus: always "unverified" (hardcoded in captureOutcomeVerificationMetadata)
verificationMethod: set from verifyOutcomeValue() result (line 151 of verification.ts)
verificationConfidence: set from verifyOutcomeValue() result (line 152)
verificationEvidence: contains fraudRiskAssessment but doesn't affect verificationStatus
```

**Classification:** EXISTS_NOW (field exists, but logic incomplete)

**Gap Identified:** No mechanism to transition verificationStatus from "unverified" to "verified" or "flagged"

---

### Field 3: confounding_factors

**P2B Contract Claim:** JSON_EXTENSION (store in verificationEvidence)

**Audit Result:** ⚠️ PARTIALLY CORRECT

**Evidence:**

1. **verificationEvidence structure:**
   ```typescript
   // verification.ts:153-158
   verificationEvidence: {
     fraudRiskAssessment: fraudRisk,
     verificationReason: verificationResult.reason,
     capturedAt: new Date().toISOString(),
     capturedBy: actorId,
   }
   ```

2. **Current content:** Contains fraudRiskAssessment with indicators, but NO confounding_factors field

3. **No logic to populate:** Current code does NOT capture confounding factors

4. **Available alternatives:**
   - outcomeNotes: string field (can store text explanation)
   - blockReason: string field (explanation for blocking)
   - explanation: JSON field on OperatorItem (currently unused for outcomes)

**Classification:** JSON_EXTENSION (technically feasible) BUT NOT IMPLEMENTED

**Gap Identified:** No data capture mechanism for confounding factors

---

## TASK 2: observed_direction — STORED vs DERIVED?

**Question:** Should observed_direction be computed and stored, or computed on-demand?

### Option A: Derive on Demand

**Derivation Logic:**
```typescript
function getObservedDirection(
  actualOutcomeValue: number,
  impactExpected: number
): "INCREASE" | "DECREASE" | "STABILIZE" {
  if (actualOutcomeValue === null || impactExpected === null) return "STABILIZE";
  
  const delta = actualOutcomeValue - impactExpected;
  if (delta > 0.01 * impactExpected) return "INCREASE";
  if (delta < -0.01 * impactExpected) return "DECREASE";
  return "STABILIZE";
}
```

**Pros:**
- ✓ No schema change
- ✓ Always consistent with latest data
- ✓ Eliminates storage of derived value

**Cons:**
- ✗ Computed on every read
- ✗ Different from predicted direction classification

---

### Option B: Store at Outcome Recording

**Implementation:**
```typescript
// route.ts:185-189
if (deltaResult.valid && deltaResult.delta !== null) {
  updatePayload.outcomeDelta = deltaResult.delta;
  updatePayload.observedDirection = deltaResult.delta > 0 ? "INCREASE" : deltaResult.delta < 0 ? "DECREASE" : "STABILIZE";
}
```

**Requires:** New field `observedDirection` enum in OperatorItem

**Pros:**
- ✓ Stored for audit trail
- ✓ Fast queries (no computation)

**Cons:**
- ✗ Schema migration required
- ✗ Risk of drift if actualOutcomeValue changes after recording

---

### Divergence Risk

**Scenario:** Outcome recorded as +$50K vs expected $100K = INCREASE direction

Later: Outcome adjusted to -$10K (data correction)

**If Stored:** observedDirection still shows INCREASE (misleading)

**If Derived:** observedDirection now shows DECREASE (correct)

**Recommendation:** DERIVE ON DEMAND to avoid audit trail corruption

---

## TASK 3: validation_status — COMPLETE OR INCOMPLETE?

### Current State

**Field Definition:** verificationStatus (String, default "unverified")

**Current Values Set:**
```typescript
verificationStatus: "unverified"  // ALWAYS (line 150 of verification.ts)
```

**Fraud Assessment Performed:**
```typescript
fraudRisk = checkFraudRisk(actualOutcomeValue, impactExpected, currentValue);
// Returns: { riskLevel: "low" | "medium" | "high", indicators: [...], confidence: ... }
// Stored in: verificationEvidence.fraudRiskAssessment
// But: Does NOT change verificationStatus
```

**Explicit Enum Values Needed:**
```
verificationStatus values currently referenced in code:
- "unverified" (set by captureOutcomeVerificationMetadata)
- "verified" (checked in attribution.ts, value/7day/route.ts)
- "flagged" (checked for P2B but NOT implemented)
```

### Gap Analysis

| Status | Where Set | Where Checked | Logic |
|--------|-----------|---------------|-------|
| "unverified" | captureOutcomeVerificationMetadata (always) | implicit | Always set at outcome recording |
| "verified" | NEVER | attribution.ts:?, value/7day/route.ts:? | No logic to verify outcomes |
| "flagged" | NEVER | P2B contract only | No logic to flag suspicious outcomes |

### Missing Logic

**To Implement Full validation_status:**

1. ❌ No endpoint to verify outcome (`POST /api/operator/:id/verify`)
2. ❌ No logic to flag high-risk outcomes (checkFraudRisk runs but verificationStatus not updated)
3. ❌ No persistence of verification action (who verified, when, why)

### Minimum to Complete

**Option 1: Use fraud assessment to auto-flag**
```typescript
const fraudRisk = checkFraudRisk(...);
if (fraudRisk.riskLevel === "high") {
  updatePayload.verificationStatus = "flagged";
} else if (fraudRisk.riskLevel === "medium") {
  updatePayload.verificationStatus = "unverified";  // Keep unverified for manual review
}
```

**Option 2: Add explicit verification endpoint**
```
PATCH /api/operator/:id/verify
{
  "verificationStatus": "verified" | "flagged",
  "reason": "Admin verified against external system"
}
```

---

## TASK 4: ACTUAL OUTCOME RECORDING PATH

### Route: POST /api/operator

**Request Input:**
```typescript
{
  id: string,
  status: "done" | "in_progress",
  actualOutcome: number,  // NUMERIC (validated at line 127)
  approvalRequired?: boolean
}
```

### Path Flow

#### Step 1: Validation (lines 105-158)

```typescript
// Line 106-113: Status transition validation
validateStatusTransition(currentStatus, newStatus);

// Line 127-129: actualOutcome must be numeric
if (typeof actualOutcome !== "number") {
  throw new Error("Missing or invalid field: actualOutcome must be a number");
}

// Line 151-156: Calibration record added
addCalibrationRecord(id, impactExpected, actualOutcome, confidence);
```

#### Step 2: Build Update Payload (lines 160-203)

```typescript
const updatePayload = { status };

if (status === 'done') {
  updatePayload.actualOutcomeValue = actualOutcome;  // LINE 165: NUMERIC
  updatePayload.completedAt = new Date().toISOString();
  updatePayload.executionStatus = 'completed';
  updatePayload.completedBy = actorId;
  
  // LINES 171-181: Capture verification
  const verificationMetadata = captureOutcomeVerificationMetadata(
    actualOutcome,
    beforeItem?.impactExpected ?? 0,
    beforeItem?.actualOutcomeValue ?? null,
    actorId || "unknown"
  );
  updatePayload.verificationStatus = verificationMetadata.verificationStatus;      // "unverified"
  updatePayload.verificationMethod = verificationMetadata.verificationMethod;      // "customer_reported_unverified"
  updatePayload.verificationConfidence = verificationMetadata.verificationConfidence; // 0
  updatePayload.verificationEvidence = verificationMetadata.verificationEvidence;  // { fraudRiskAssessment: {...} }
  updatePayload.auditTrail = verificationMetadata.auditTrail;                      // [{ action: "OUTCOME_RECORDED", ... }]
  
  // LINES 185-188: Calculate delta
  const deltaResult = calculateOutcomeDelta(expectedImpact, actualOutcome);
  if (deltaResult.valid && deltaResult.delta !== null) {
    updatePayload.outcomeDelta = deltaResult.delta;  // NUMERIC (not string!)
  }
  
  // LINES 191-199: Calculate accuracy
  const accuracyResult = calculateDecisionAccuracy(expectedImpact, actualOutcome);
  if (accuracyResult.valid) {
    updatePayload.decisionAccuracy = accuracyResult.accuracy;
    updatePayload.decisionError = accuracyResult.error;
  }
}
```

#### Step 3: Persist (line 205)

```typescript
await updateItem(id, updatePayload, workspaceId || undefined);
```

**store.ts:updateItem() handles:**
- Line 186: `if (updates.outcomeDelta !== undefined) updateData.outcomeDelta = updates.outcomeDelta;`
- Direct pass-through of all fields to db.operatorItem.update()

#### Step 4: Audit (lines 215-225)

```typescript
await logAuditEvent({
  eventName: "COMPLETE",  // Line 212
  entityType: "OperatorItem",
  entityId: id,
  actorId,
  role,
  before: beforeItem ?? null,
  after: afterItem ?? null,
});
```

#### Step 5: Webhooks (lines 227-248)

```typescript
sendWebhook({ event: "action_completed", payload: completedItem });
emitWebhookAsync(webhookUrl, {
  event: "action_completed",
  data: {
    itemId: completedItem.id,
    expectedImpact: Number(completedItem.impactExpected),
    actualOutcome: completedItem.actualOutcomeValue,  // NUMERIC
    outcomeDelta: completedItem.outcomeDelta,         // NUMERIC
    decisionAccuracy: completedItem.decisionAccuracy,
  },
});
```

### Exact Functions Called

| Function | File | Purpose |
|----------|------|---------|
| `validateStatusTransition()` | operator/validate.ts | Validate state transition |
| `validateCompletion()` | policy/engine.ts | Check completion policy |
| `canCompleteWithApprovalStatus()` | approval/workflow.ts | Check approval gates |
| `enforceApprovalRequirement()` | approval/workflow.ts | Create approval record if needed |
| `addCalibrationRecord()` | operator/store.ts | Record prediction accuracy |
| `captureOutcomeVerificationMetadata()` | outcome/verification.ts | Generate verification data |
| `calculateOutcomeDelta()` | operator/outcome.ts | Compute delta (actual - expected) |
| `calculateDecisionAccuracy()` | operator/accuracy.ts | Compute accuracy score |
| `updateItem()` | operator/store.ts | Persist to database |
| `logAuditEvent()` | audit/audit-log.ts | Emit audit event |
| `sendWebhook()` | integration/webhook.ts | Send webhook |
| `emitWebhookAsync()` | integrations/webhook.ts | Emit async webhook |

---

## TASK 5: MINIMAL BACKBONE FOR P2B

### Goal: Prove Success, Failure, or Uncertainty

**Minimum Requirements:**

#### 1. Prove Recommendation Succeeded

**What's Already Stored:**
```
✅ actualOutcomeValue: number (captured from request)
✅ verificationStatus: "unverified" (hardcoded, but stored)
✅ auditTrail: JSON with OUTCOME_RECORDED action
✅ completedAt: timestamp
✅ completedBy: actorId
```

**What's Missing:**
```
❌ Categorical outcome (success/failure/uncertain) — actualOutcome field exists but not populated
❌ Derived direction (INCREASE/DECREASE/STABILIZE) — not stored, not derived
```

**Minimum Implementation:**
1. Populate `actualOutcome` field with categorical value
2. Populate `outcomeDelta` correctly (currently numeric, may be fine for delta tracking)
3. Rely on existing `firstWinAchieved` auto-detection (already implemented)

---

#### 2. Prove Recommendation Failed

**What's Already Stored:**
```
✅ actualOutcomeValue: null (if not achieved)
✅ blockReason: string (explanation if exists)
✅ blockStage: string (where blocked)
✅ auditTrail: JSON with OUTCOME_RECORDED action
```

**What's Missing:**
```
❌ Categorical outcome = "failure" (actualOutcome field)
```

**Minimum Implementation:**
1. Populate `actualOutcome` with "failure" or "blocked"
2. Ensure blockReason or outcomeNotes populated with explanation

---

#### 3. Prove Recommendation Uncertain

**What's Already Stored:**
```
✅ verificationEvidence: JSON with fraudRiskAssessment
✅ verificationEvidence.fraudRiskAssessment.riskLevel: "low" | "medium" | "high"
✅ verificationEvidence.fraudRiskAssessment.indicators: string[]
✅ auditTrail: JSON
```

**What's Missing:**
```
❌ Update verificationStatus from "unverified" to "flagged" when high risk
❌ Categorical outcome = "uncertain"
```

**Minimum Implementation:**
1. Add logic: if fraud risk is "high", set verificationStatus to "flagged"
2. Populate actualOutcome with "uncertain"

---

## P2B_MINIMAL_BACKBONE.md

### Minimal Implementation to Satisfy P2B Goals

**No Schema Changes Required.**

**Changes Needed:**

#### 1. Populate actualOutcome Field (MISSING)

**File:** `src/app/api/operator/route.ts`

**Current:** actualOutcome field not populated

**Add (after line 165):**
```typescript
// Determine categorical outcome
let categoricalOutcome: "success" | "partial" | "failure" | "uncertain" = "success";
if (actualOutcome === null || actualOutcome === 0) {
  categoricalOutcome = "failure";
} else if (actualOutcome > 0 && actualOutcome < (beforeItem?.impactExpected ?? 0) * 0.5) {
  categoricalOutcome = "partial";
} else if (actualOutcome > (beforeItem?.impactExpected ?? 0) * 1.5) {
  categoricalOutcome = "uncertain"; // Suspiciously high
}
updatePayload.actualOutcome = categoricalOutcome;
```

**Impact:**
- ✅ Enables "prove success/failure/uncertain" requirement
- ✅ No schema change
- ✅ Complements existing actualOutcomeValue

---

#### 2. Update verificationStatus Based on Fraud Risk (MISSING)

**File:** `src/services/outcome/verification.ts`

**Current (line 150):**
```typescript
verificationStatus: "unverified",
```

**Change to:**
```typescript
verificationStatus: fraudRisk.riskLevel === "high" ? "flagged" : "unverified",
```

**Impact:**
- ✅ Auto-flags high-risk outcomes
- ✅ Enables "uncertainty" detection
- ✅ No schema change

---

#### 3. Derive observed_direction (OPTIONAL)

**Option A: Don't implement in P2B**
- actualOutcomeValue already shows if achievement increased/decreased
- outcomeDelta shows comparison to expected
- observed_direction is convenience function

**Option B: Add service function (no schema change)**
```typescript
// outcome.ts
export function getObservedDirection(
  actualValue: number | null,
  expectedValue: number | null
): "INCREASE" | "DECREASE" | "STABILIZE" {
  if (!actualValue || !expectedValue) return "STABILIZE";
  const delta = actualValue - expectedValue;
  if (Math.abs(delta) < Math.abs(expectedValue * 0.01)) return "STABILIZE";
  return delta > 0 ? "INCREASE" : "DECREASE";
}
```

**Call on reads:** `const direction = getObservedDirection(item.actualOutcomeValue, item.impactExpected);`

---

### Minimal P2B Success Criteria

#### Test 1: Record Success Outcome

```typescript
POST /api/operator {
  id: "item-1",
  status: "done",
  actualOutcome: 65000,  // Exceeds expected 50000
}

// Result:
// - actualOutcomeValue = 65000 ✅
// - actualOutcome = "success" ✅
// - firstWinAchieved = true ✅ (auto-detected)
// - verificationStatus = "unverified" ✅
// - auditTrail has OUTCOME_RECORDED ✅
```

#### Test 2: Record Failed Outcome

```typescript
POST /api/operator {
  id: "item-2",
  status: "done",
  actualOutcome: 0,  // No achievement
  blockReason: "Stakeholder resistance"
}

// Result:
// - actualOutcomeValue = 0 ✅
// - actualOutcome = "failure" ✅
// - firstWinAchieved = false ✅
// - blockReason preserved ✅
// - auditTrail recorded ✅
```

#### Test 3: Flag Uncertain Outcome

```typescript
POST /api/operator {
  id: "item-3",
  status: "done",
  actualOutcome: 250000  // 5x expected 50000
}

// Result:
// - actualOutcome = "uncertain" ✅ (high variance)
// - verificationStatus = "flagged" ✅ (fraud risk high)
// - verificationEvidence.fraudRiskAssessment.riskLevel = "high" ✅
// - verificationEvidence.fraudRiskAssessment.indicators has "variance" ✅
```

---

## FINDINGS SUMMARY

### Critical Assumptions Destroyed

| Assumption | Status | Finding |
|-----------|--------|---------|
| observed_direction exists | ❌ DESTROYED | Field does not exist, not derivable in current code |
| validation_status exists and works | ⚠️ PARTIAL | Field exists but logic incomplete (never changes from "unverified") |
| confounding_factors stored | ❌ DESTROYED | No code to capture confounding factors |
| outcomeDelta is string | ❌ DESTROYED | calculateOutcomeDelta returns numeric delta, schema says string (type mismatch) |
| actualOutcome is populated | ❌ DESTROYED | Field exists but NOT set by current route |

### Code Gaps Identified

| Gap | Severity | File | Fix Required |
|-----|----------|------|--------------|
| actualOutcome not populated | HIGH | route.ts:165 | Add categorical outcome logic |
| verificationStatus always "unverified" | HIGH | verification.ts:150 | Auto-flag high-risk outcomes |
| No observed_direction field or logic | MEDIUM | N/A | Add derived service function or defer to P2C |
| No confounding_factors capture | MEDIUM | N/A | Add outcomeNotes population or new field |
| outcomeDelta type mismatch | LOW | outcome.ts + schema | Investigate if coercion works |

---

## FINAL VERDICT

**CONTRACT_REQUIRES_REVISION** ⚠️

### Before Implementation

**Must Fix:**
1. ✅ Populate actualOutcome with categorical value (route.ts)
2. ✅ Auto-flag high-risk outcomes (verification.ts)
3. ✅ Clarify observed_direction: defer to derivation or P2C schema change

**Can Defer:**
- Confounding factors (use outcomeNotes for now)
- Observed direction derivation (implement as utility function)

**Implementation Blocker:** 
❌ actualOutcome field is not being populated. Current route only sets actualOutcomeValue.

### Revised P2B Scope

**Minimal P2B (No Schema Changes):**
1. Populate actualOutcome field
2. Auto-flag high-risk outcomes based on fraud assessment
3. Tests for success/failure/uncertain outcomes
4. API contract for outcome recording (no new endpoints)

**Defer to P2C:**
- observed_direction as stored field (requires schema migration)
- Confounding factors as structured data (enhancement)
- Explicit verification endpoint (future workflow)

---

## READY STATUS

**READY_FOR_IMPLEMENTATION:** ✅ (with revisions)

**Contract Revision Actions:**
1. Remove observed_direction from minimal P2B (defer to derived utility or P2C)
2. Clarify actualOutcome as required field to populate
3. Add verificationStatus auto-flagging logic
4. Keep confounding_factors as optional outcomeNotes for MVP

**Revised Contract:** P2B_IMPLEMENTATION_CONTRACT.md (UPDATED)

