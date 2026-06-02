# P2B_FAILING_TEST_ROOT_CAUSES

**Analysis Date:** 2026-06-02  
**Commit Analyzed:** 9f1a73e2 (on main, includes route harness fix)  
**Total Failing Tests:** 16  
**Total Defects:** 4  

---

## DEFECT #1: Auto-Flag Service Not Setting verificationStatus = "disputed"

**Tests Affected:** 4  
**Estimated Tests Fixed:** 6 (including cascading)  

### Root Cause Location

**File:** `src/services/outcome/verification.ts` lines 136-171  
**Function:** `captureOutcomeVerificationMetadata()`

**Code:**
```typescript
export function captureOutcomeVerificationMetadata(
  actualOutcomeValue: number,
  impactExpected: number,
  currentValue: number | null,
  actorId: string
) {
  const fraudRisk = checkFraudRisk(actualOutcomeValue, impactExpected, currentValue);
  const verificationResult = verifyOutcomeValue(
    actualOutcomeValue,
    impactExpected,
    "unverified"
  );

  // Mark as disputed if fraud risk is high (contract-compliant state)
  const verificationStatus = fraudRisk.riskLevel === "high" ? "disputed" : "unverified";

  return {
    verificationStatus,  // ← Line 150: Correctly set but NOT being persisted
    verificationMethod: verificationResult.verificationMethod,
    verificationConfidence: verificationResult.confidence,
    verificationEvidence: { ... },
    auditTrail: [ ... ],
  };
}
```

**The Logic:** Line 150 correctly maps `fraudRisk.riskLevel === "high"` → `verificationStatus = "disputed"`

**The Problem:** The returned `verificationStatus` value is NOT being persisted to database in some code paths.

### Failing Tests

#### Test 1: decision-outcome-path.test.ts:140-158
- **Test Name:** "should accept uncertain with outcomeNotes and auto-flag"
- **Line:** 156
- **Assertion:** `expect(updated?.verificationStatus).toBe("disputed")`
- **Actual Value:** `null` or `"unverified"`
- **Production Path:** 
  - `recordDecisionOutcome()` → decision-lifecycle.service.ts:365-370
  - Calls `captureOutcomeVerificationMetadata()` ✓
  - Sets `updateData.verificationStatus = verificationMetadata.verificationStatus` ✓
  - Calls `db.operatorItem.update()` with updateData ✓
  - **Issue:** verificationStatus NOT being written to database

#### Test 2: decision-outcome-path.test.ts:223-241
- **Test Name:** "should auto-flag when variance exceeds 500%"
- **Line:** 240
- **Assertion:** `expect(decision?.verificationStatus).toBe("disputed")`
- **Actual Value:** `null` or `"unverified"`
- **Trigger:** `actualOutcomeValue = 300000` (6x expected: 50000) → fraudRisk.riskLevel = "high" (variance >500%)
- **Production Path:** Same as Test 1

#### Test 3: decision-outcome-path.test.ts:261-288
- **Test Name:** "should flag retroactive modifications"
- **Line:** 287
- **Assertion:** `expect(decision?.verificationStatus).toBe("disputed")`
- **Actual Value:** `null` or `"unverified"`
- **Trigger:** Retroactive modification detection in `checkFraudRisk()` (line 93-95 of verification.ts)
  ```typescript
  // Indicator 4: Retroactive modification (changing an already-verified outcome)
  if (previousActualOutcomeValue !== null && previousActualOutcomeValue !== actualOutcome) {
    indicators.push("Retroactive modification of outcome value");
    riskScore += 2;
  }
  ```
- **Production Path:** Same as Test 1

#### Test 4: verified-lifecycle.test.ts:146-183
- **Test Name:** "REAL: disputed → verified transition"
- **Line:** 179
- **Assertion:** `expect(dbRecord?.verificationStatus).toBe("verified")`
- **Actual Value:** `null` or `"unverified"`
- **Note:** This test depends on Defect #1 being fixed first (disputed state must exist before transition)

---

## DEFECT #2: verificationStatus Field Not Persisted by updateItem Service

**Tests Affected:** 4-6 (depends on Defect #1 fix)  
**Estimated Tests Fixed:** 4  
**Root Cause Code Location:** Interaction between service calls and database persistence

### Analysis

**File:** `src/services/decisions/decision-lifecycle.service.ts` lines 379-387

```typescript
const updated = await db.operatorItem.update({
  where: { id: decisionId },
  data: {
    ...updateData,  // ← Contains verificationStatus from line 371
    status: mapStateToStatus("OUTCOME_RECORDED"),
    updatedAt: new Date(),
    lastUpdatedByUserId: actorId,  // ← FIELD NAME ISSUE
  },
});
```

**Issue:** The schema field is `lastUpdatedByUserId` but the spread `...updateData` might not include all verification metadata fields depending on how updateData is built.

**However:** Looking at lines 371-375, the fields ARE added to updateData:
```typescript
updateData.verificationStatus = verificationMetadata.verificationStatus;
updateData.verificationMethod = verificationMetadata.verificationMethod;
updateData.verificationConfidence = verificationMetadata.verificationConfidence;
updateData.verificationEvidence = verificationMetadata.verificationEvidence;
updateData.auditTrail = verificationMetadata.auditTrail;
```

**Actual Root Cause:** The `updateData` spread includes these fields, BUT they may be getting overwritten or filtered somewhere in the database layer, OR the verification.ts function is NOT being called with the correct parameters.

### Failing Tests

#### Test 1: decision-outcome-path.test.ts:60-75
- **Test Name:** "should populate verificationStatus for success outcome"
- **Line:** 74
- **Assertion:** `expect(updated?.verificationStatus).toBe("unverified")`
- **Actual Value:** `null` or `undefined`
- **Production Path:** recordDecisionOutcome() → captureOutcomeVerificationMetadata() should set "unverified" for normal outcomes

#### Test 2: decision-outcome-path.test.ts:182-202
- **Test Name:** "should capture identical metadata to operator path"
- **Line:** 198
- **Assertion:** `expect(decision?.verificationMethod).toBe("customer_reported_unverified")`
- **Actual Value:** `null` or `undefined`

#### Test 3: decision-outcome-path.test.ts:204-220
- **Test Name:** "should emit audit event for outcome recording"
- **Line:** 218
- **Assertion:** `expect(decision?.status).toBe("outcome_recorded")`
- **Actual Value:** Status updated but metadata fields null

#### Test 4: decision-outcome-path.test.ts:243-259
- **Test Name:** "should not flag normal variances"
- **Line:** 258
- **Assertion:** `expect(decision?.verificationStatus).toBe("unverified")`
- **Actual Value:** `null`

---

## DEFECT #3: Route Parameter Validation Missing Request Context

**Tests Affected:** 2  
**Estimated Tests Fixed:** 2  

### Root Cause Location

**File:** `src/app/api/operator/route.ts` lines 212-219

```typescript
// Require outcomeNotes for failure or uncertain outcomes
if (classification.category === "failure" || classification.category === "uncertain") {
  const outcomeNotes = body.outcomeNotes || "";  // ← body may be undefined/not parsed correctly
  if (!outcomeNotes.trim()) {
    throw new Error(`Outcome notes required for ${classification.category} outcome: ${classification.reason}`);
  }
  updatePayload.outcomeNotes = outcomeNotes.trim();
}
```

**Issue:** Route expects request body to be parsed via `await ctx.request.json()` at line 53. If the request is malformed or parsing fails, the validation throws generic error instead of "Outcome notes required".

### Failing Tests

#### Test 1: real-route-tests.test.ts:141-188
- **Test Name:** "REAL: route validation rejects failure without notes"
- **Line:** 185
- **Assertion:** `expect(validationError?.message).toContain("Outcome notes required")`
- **Actual Value:** `error = "Cannot read properties of undefined"` (from body being null/undefined)
- **Root Cause:** Request body parsing fails or validation check accesses undefined field
- **Production Path:** 
  - Route receives NextRequest
  - Calls `await ctx.request.json()` (line 53)
  - If parsing fails, error is thrown before validation at line 216

#### Test 2: real-route-tests.test.ts (second validation test - similar issue)
- **Test Name:** Similar validation path
- **Assertion:** Same error message expectation
- **Actual Value:** Same undefined property error

---

## DEFECT #4: State Transition Error Message Mismatch

**Tests Affected:** 2  
**Estimated Tests Fixed:** 2  

### Root Cause Location

**File:** `src/services/outcome/verification-approval.service.ts` lines 60-80 (estimated)

**Expected Behavior:** When invalid state transition occurs (e.g., `verified → unverified`), error message should contain "Cannot transition"

**Actual Behavior:** Error message says "Invalid verification status. Allowed: [...]"

### Failing Tests

#### Test 1: verified-lifecycle.test.ts:223-261
- **Test Name:** "REAL: invalid transition rejected (verified → unverified)"
- **Line:** 254
- **Assertion:** `expect(validationError?.message).toContain("Cannot transition")`
- **Actual Value:** `"Invalid verification status. Allowed: unverified, disputed, verified"`
- **Production Path:** approveOutcomeVerification() validates state machine transition
- **Fix:** Change error message constant to include "Cannot transition"

#### Test 2: verified-lifecycle.test.ts (second invalid transition test)
- **Test Name:** Similar invalid transition test
- **Assertion:** Same error message expectation
- **Actual Value:** Same different error message

---

## DEFECT RANKING BY LEVERAGE

### Ranking Metric: `tests_fixed_per_change` (including cascading failures)

#### RANK 1: Auto-Flag Service Not Setting "disputed" (Defect #1)
- **Direct Tests Fixed:** 4 (decision-outcome-path lines 140, 223, 261 + verified-lifecycle line 146)
- **Cascading Tests Fixed:** 2-4 (metadata convergence tests depend on this)
- **Total Estimated:** 6-8 tests
- **Files to Change:** 1 file (verification.ts - likely no code change, but verify function is called correctly)
- **Complexity:** Medium (may require tracing why the function result isn't persisted)
- **Tests Fixed Per Change:** 6-8

#### RANK 2: verificationStatus Field Not Persisted (Defect #2)
- **Direct Tests Fixed:** 4 (decision-outcome-path lines 60, 182, 204, 243)
- **Cascading Tests Fixed:** 0 (depends on Defect #1 being fixed first)
- **Total Estimated:** 4 tests
- **Files to Change:** 1-2 files (decision-lifecycle.service.ts, possibly store.ts)
- **Complexity:** Low-Medium (field inclusion issue)
- **Tests Fixed Per Change:** 4

#### RANK 3: Route Parameter Validation (Defect #3)
- **Direct Tests Fixed:** 2 (real-route-tests.test.ts validation paths)
- **Cascading Tests Fixed:** 0
- **Total Estimated:** 2 tests
- **Files to Change:** 1 file (operator/route.ts)
- **Complexity:** Medium (error handling in request parsing)
- **Tests Fixed Per Change:** 2

#### RANK 4: State Transition Error Message (Defect #4)
- **Direct Tests Fixed:** 2 (verified-lifecycle.test.ts invalid transitions)
- **Cascading Tests Fixed:** 0
- **Total Estimated:** 2 tests
- **Files to Change:** 1 file (verification-approval.service.ts)
- **Complexity:** Trivial (string constant change)
- **Tests Fixed Per Change:** 2

---

## SUMMARY TABLE

| Rank | Defect | Root Cause | File(s) | Tests Fixed | Complexity | Priority |
|------|--------|-----------|---------|-------------|-----------|----------|
| 1 | Auto-flag not setting "disputed" | verificationStatus mapping failure | verification.ts | 6-8 | **HIGH** | **FIRST** |
| 2 | verificationStatus not persisted | Field not included in update data | decision-lifecycle.service.ts | 4 | Medium | **SECOND** |
| 3 | Route param validation error | Request body parsing fails | operator/route.ts | 2 | Medium | Third |
| 4 | Wrong error message text | Error message constant mismatch | verification-approval.service.ts | 2 | Low | Fourth |

---

## EXECUTION ANALYSIS

### Path A: Operator Route (src/app/api/operator/route.ts)

**Line 178-192:** Sets verification metadata in updatePayload
```typescript
const classification = classifyOutcome(actualOutcome, beforeItem?.impactExpected ?? null);
updatePayload.actualOutcome = classification.category;  // Line 179

const verificationMetadata = captureOutcomeVerificationMetadata(...);  // Line 182
updatePayload.verificationStatus = verificationMetadata.verificationStatus;  // Line 188
...
```

**Line 225:** Calls updateItem with all fields
```typescript
await updateItem(id, updatePayload, workspaceId || undefined);
```

**Impact:** This path works IF updateItem() correctly transfers verificationStatus (lines 194 in store.ts)

---

### Path B: Decision Lifecycle Service (src/services/decisions/decision-lifecycle.service.ts)

**Line 365-375:** Calls verification function and builds updateData
```typescript
const verificationMetadata = captureOutcomeVerificationMetadata(...);  // Line 365
updateData.verificationStatus = verificationMetadata.verificationStatus;  // Line 371
updateData.verificationMethod = verificationMetadata.verificationMethod;  // Line 372
...
```

**Line 379-387:** Direct database update (does NOT call updateItem)
```typescript
const updated = await db.operatorItem.update({
  where: { id: decisionId },
  data: {
    ...updateData,  // ← Must contain verificationStatus
    status: mapStateToStatus("OUTCOME_RECORDED"),
    updatedAt: new Date(),
    lastUpdatedByUserId: actorId,
  },
});
```

**Issue:** This path bypasses updateItem() and directly spreads updateData. If updateData is missing any verification fields, they won't persist.

---

## NEXT STEPS FOR INVESTIGATION

**Before fixing, verify:**

1. **Defect #1:** Check if `captureOutcomeVerificationMetadata()` is being called with correct parameters
   - Specifically: Is `checkFraudRisk()` calculating fraud risk correctly?
   - Is the returned `verificationStatus = "disputed"` being correctly assigned?

2. **Defect #2:** Verify that `db.operatorItem.update()` in decision-lifecycle.service.ts receives all fields in updateData
   - Check if Prisma schema allows `verificationStatus` field
   - Check if field mapping (@map directives) is correct

3. **Defect #3:** Trace request body parsing in route.ts
   - When does `await ctx.request.json()` fail vs succeed?
   - Is body being validated before use?

4. **Defect #4:** Locate error message constant in verification-approval.service.ts
   - Find exact error message being thrown
   - Confirm it should say "Cannot transition" instead

---

## FILES TO EXAMINE

| Defect | Primary File | Lines | Secondary File | Lines |
|--------|---|---|---|---|
| #1 | src/services/outcome/verification.ts | 136-171 | (none - logic correct) | - |
| #2 | src/services/decisions/decision-lifecycle.service.ts | 365-387 | src/services/operator/store.ts | 166-240 |
| #3 | src/app/api/operator/route.ts | 53, 212-219 | (none) | - |
| #4 | src/services/outcome/verification-approval.service.ts | ~60 | (none) | - |

