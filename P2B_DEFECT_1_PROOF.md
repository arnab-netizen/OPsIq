# P2B DEFECT #1: ACTUAL OUTCOME PERSISTENCE FAILURE

## Summary
Tests expecting `actualOutcome` field to be classified and persisted show `null` in database. Root cause: **Missing field handlers in updateItem service prevent verification metadata from being persisted to database.**

## Test Evidence

**File:** `src/__tests__/p2b/real-route-tests.test.ts`

**Test Case:** Line 72-138 (SUCCESS PATH: 100% achievement)
- Request body (line 76-80): `{ id: testItemId, status: "done", actualOutcome: 50000 }`
- Expected assertion (line 130): `expect(dbRecord?.actualOutcome).toBe("success")`
- **Actual result:** `dbRecord?.actualOutcome` is `null`

**Test Case:** Line 141-188 (VALIDATION PATH: Missing outcomeNotes for failure)
- Expected assertion (line 187): `expect(dbRecord?.status).toBe("in_progress")` (unchanged because validation fails)
- **Actual result:** Test passes (validation executes, prevents update)

**Test Case:** Line 191-254 (FRAUD DETECTION PATH: Disputed flagging)
- Expected assertion (line 248): `expect(dbRecord?.verificationStatus).toBe("disputed")`
- **Actual result:** `dbRecord?.verificationStatus` is null or wrong value

## Execution Flow Trace

### 1. Route Handler Entry Point

**File:** `src/app/api/operator/route.ts`

**Line 37-55:** POST handler receives request
```
request body: { id, status: "done", actualOutcome: 50000 }
actualOutcome = 50000 (numeric value from body)
```

### 2. Outcome Classification (Lines 171-179)

**Line 172:** `updatePayload.actualOutcomeValue = actualOutcome;` → stores numeric 50000

**Line 178-179:** Outcome Classification
```typescript
const classification = classifyOutcome(actualOutcome, beforeItem?.impactExpected ?? null);
updatePayload.actualOutcome = classification.category;
```
- Input: `classifyOutcome(50000, 50000)` (100% achievement)
- Output: `classification.category = "success"`
- updatePayload.actualOutcome is set to `"success"` string ✓

### 3. Verification Metadata Capture (Lines 182-192)

**Line 182-192:** Route sets additional fields in updatePayload:
```typescript
updatePayload.verificationStatus = verificationMetadata.verificationStatus;
updatePayload.verificationMethod = verificationMetadata.verificationMethod;
updatePayload.verificationConfidence = verificationMetadata.verificationConfidence;
updatePayload.verificationEvidence = verificationMetadata.verificationEvidence;
updatePayload.auditTrail = verificationMetadata.auditTrail;
```

**updatePayload at point of updateItem call (line 225):**
```
{
  status: "done",
  actualOutcomeValue: 50000,
  completedAt: Date,
  executionStatus: "completed",
  completedBy: actorId,
  actualOutcome: "success",
  verificationStatus: "unverified",
  verificationMethod: "customer_reported_unverified",
  verificationConfidence: number,
  verificationEvidence: { ... },
  auditTrail: [ ... ],
  outcomeDelta: number,
  decisionAccuracy: number,
  decisionError: number,
  outcomeNotes: string (if failure/uncertain)
}
```

### 4. UpdateItem Service (MISSING HANDLERS FOUND)

**File:** `src/services/operator/store.ts` lines 166-233

**Line 171:** `const updateData: Record<string, any> = {};` - Initialize empty object

**Lines 173-193:** Conditional field inclusion
```typescript
if (updates.actualOutcome !== undefined) updateData.actualOutcome = updates.actualOutcome;
if (updates.actualOutcomeValue !== undefined) updateData.actualOutcomeValue = updates.actualOutcomeValue;
if (updates.outcomeDelta !== undefined) updateData.outcomeDelta = updates.outcomeDelta;
if (updates.decisionAccuracy !== undefined) updateData.decisionAccuracy = updates.decisionAccuracy;
if (updates.decisionError !== undefined) updateData.decisionError = updates.decisionError;
if (updates.outcomeNotes !== undefined) updateData.outcomeNotes = updates.outcomeNotes;
if (updates.startedAt !== undefined) updateData.startedAt = updates.startedAt ? new Date(updates.startedAt) : null;
if (updates.completedAt !== undefined) updateData.completedAt = updates.completedAt ? new Date(updates.completedAt) : null;
if (updates.executionStatus !== undefined) updateData.executionStatus = updates.executionStatus;
```

**CRITICAL ISSUE - Missing handlers for fields set by route:**

| Field | Set by Route | Handled by updateItem | Result |
|-------|-------------|----------------------|--------|
| actualOutcome | ✓ (line 179) | ✓ (line 184) | Persists |
| actualOutcomeValue | ✓ (line 172) | ✓ (line 185) | Persists |
| completedBy | ✓ (line 175) | ✗ **MISSING** | **NOT persisted** |
| verificationStatus | ✓ (line 188) | ✗ **MISSING** | **NOT persisted** |
| verificationMethod | ✓ (line 189) | ✗ **MISSING** | **NOT persisted** |
| verificationConfidence | ✓ (line 190) | ✗ **MISSING** | **NOT persisted** |
| verificationEvidence | ✓ (line 191) | ✗ **MISSING** | **NOT persisted** |
| auditTrail | ✓ (line 192) | ✗ **MISSING** | **NOT persisted** |
| outcomeDelta | ✓ (line 198) | ✓ (line 186) | Persists |
| decisionAccuracy | ✓ (line 205) | ✓ (line 187) | Persists |
| decisionError | ✓ (line 208) | ✓ (line 188) | Persists |
| outcomeNotes | ✓ (line 218) | ✓ (line 189) | Persists |

### 5. Prisma Update (Lines 230-232)

**Line 230-232:**
```typescript
await db.operatorItem.update({
  where: { id },
  data: updateData,
});
```

updateData only contains fields that passed the conditional checks at lines 173-193.

**Missing from updateData:**
- completedBy
- verificationStatus
- verificationMethod
- verificationConfidence
- verificationEvidence
- auditTrail

These fields are never added to updateData because updateItem has no conditional checks for them.

### 6. Database Read (Test line 122-123)

**actualOutcome result:** CAN be null if route error occurs BEFORE updateItem, OR actualOutcome persists but verification fields don't

## Root Cause Classification

**Category A: Missing Service Handler Logic**

The `updateItem` function in `src/services/operator/store.ts` is missing conditional handlers for 6 fields that the route attempts to persist:

1. **completedBy** - Actor who completed the decision
2. **verificationStatus** - Verification classification (unverified|disputed|verified)
3. **verificationMethod** - Method used for verification
4. **verificationConfidence** - Confidence score for verification
5. **verificationEvidence** - Detailed evidence JSON
6. **auditTrail** - Audit trail events array

### Why actualOutcome shows as null

While `actualOutcome` field IS handled by updateItem (line 184), the test failures indicate the route may be throwing an error BEFORE the updateItem call. Potential error sources:

1. **Authorization failure:** `resolveServerRole()` returns null (line 58-62)
2. **Capability check:** `assertCapability()` fails (line 88-91)
3. **Status transition:** `getStatusTransitionError()` rejects transition (line 110)
4. **Idempotency:** Earlier request cached with error (line 94-103)

If route throws error before line 225 (`updateItem` call), database is never updated and actualOutcome remains null.

## Schema Verification

**File:** `prisma/schema.prisma` lines 637, 649, 661-666

All target fields are correctly defined in schema with @map directives:
```prisma
actualOutcome          String?             @map("actual_outcome")
actualOutcomeValue     Float?              @map("actual_outcome_value")
verificationStatus     String              @default("unverified") @map("verification_status")
verificationMethod     String?             @map("verification_method")
verificationEvidence   Json?               @map("verification_evidence")
verificationConfidence Float?              @map("verification_confidence")
auditTrail             Json?               @map("audit_trail")
```

Schema is correct. Persistence layer is incomplete.

## Minimum Fixes Required

1. **Add missing field handlers to updateItem (store.ts lines 173-193):**
   ```typescript
   if (updates.completedBy !== undefined) updateData.completedBy = updates.completedBy;
   if (updates.verificationStatus !== undefined) updateData.verificationStatus = updates.verificationStatus;
   if (updates.verificationMethod !== undefined) updateData.verificationMethod = updates.verificationMethod;
   if (updates.verificationConfidence !== undefined) updateData.verificationConfidence = updates.verificationConfidence;
   if (updates.verificationEvidence !== undefined) updateData.verificationEvidence = updates.verificationEvidence;
   if (updates.auditTrail !== undefined) updateData.auditTrail = updates.auditTrail;
   ```

2. **Verify route error handling** - Ensure test has proper authorization context or route doesn't require it for test cases

## Tests Affected by This Defect

**Group A (actualOutcome null):**
- real-route-tests.test.ts line 72-138 (SUCCESS PATH)
- real-route-tests.test.ts line 191-254 (FRAUD DETECTION)
- decision-outcome-path.test.ts line 42-58 (success recording)
- decision-outcome-path.test.ts line 60-75 (verification metadata)

**Estimated fix impact:** 4-8 tests will pass once updateItem field handlers are added

## Secondary Issues (from verification metadata)

Once field handlers are added, tests expecting verification metadata will reveal:

- Group B (4 tests): verificationStatus="unverified" instead of "disputed" → requires fraud detection logic
- Group C (2 tests): Route parameter validation → missing request validation
- Group D (2 tests): Error message mismatch → strings don't match validation text

These are downstream consequences of Defect #1's field handler gap.
