# P2B DATABASE ROOT CAUSE ANALYSIS

**Workflow Run:** 26820755331  
**Commit Tested:** 09a6b3cc (UUID fixtures merged to main)  
**Date:** 2026-06-02T12:49:01Z

---

## TASK 1: LINE 379 ANALYSIS

**File:** `src/services/decisions/decision-lifecycle.service.ts`

**Line 379:**
```typescript
const updated = await db.operatorItem.update({
  where: { id: decisionId },
  data: {
    ...updateData,
    status: mapStateToStatus("OUTCOME_RECORDED"),
    updatedAt: new Date(),
    lastUpdatedBy: actorId,  // ← LINE 385: INVALID FIELD
  },
});
```

**Prisma Operation:**
- **Model:** `OperatorItem`
- **Method:** `update()`
- **Executed At:** Line 379
- **Arguments:**
  ```typescript
  {
    where: { id: string },
    data: {
      actualOutcomeValue?: number,
      actualOutcome?: string,
      outcomeNotes?: string,
      verificationStatus?: string,
      verificationMethod?: string,
      verificationConfidence?: number,
      verificationEvidence?: Json,
      auditTrail?: Json,
      status: string,
      updatedAt: Date,
      lastUpdatedBy: string,  // ← INVALID
    }
  }
  ```

**Schema Definition for OperatorItem (affected fields):**
```prisma
model OperatorItem {
  id                     String              @id @db.Uuid
  workspaceId            String              @db.Uuid @map("workspace_id")
  createdByUserId        String?             @db.Uuid @map("created_by_user_id")
  lastUpdatedByUserId    String?             @db.Uuid @map("last_updated_by_user_id")  // ← CORRECT FIELD
  // ... other fields
  actualOutcome          String?             @map("actual_outcome")
  actualOutcomeValue     Float?              @map("actual_outcome_value")
  outcomeNotes           String?             @map("outcome_notes")
  verificationStatus     String              @default("unverified") @map("verification_status")
  verificationMethod     String?             @map("verification_method")
  verificationEvidence   Json?               @map("verification_evidence")
  verificationConfidence Float?              @map("verification_confidence")
  verifiedAt             DateTime?           @map("verified_at")
  verifiedBy             String?             @db.Uuid @map("verified_by")
  auditTrail             Json?               @map("audit_trail")
  // ... relations
}
```

---

## TASK 2: COMPLETE PRISMAVALIDATIONERROR

**Error Type:** `PrismaClientValidationError`

**Complete Error Message:**
```
PrismaClientValidationError: 
Invalid `prisma.operatorItem.update()` invocation:

{
  where: {
    id: "6f6cd63d-2b05-449b-9c77-d68ef6d0656b"
  },
  data: {
    actualOutcomeValue: 50000,
    actualOutcome: "success",
    verificationStatus: "unverified",
    verificationMethod: "customer_reported_unverified",
    verificationConfidence: 0,
    verificationEvidence: {
      fraudRiskAssessment: {
        riskLevel: "low",
        indicators: [
          "Outcome exactly matches expected (suspiciously precise)"
        ],
        confidence: 0.3333333333333333
      },
      verificationReason: undefined,
      capturedAt: "2026-06-02T12:50:28.787Z",
      capturedBy: "47c4debe-3940-44ca-b931-74076ff0f18b"
    },
    auditTrail: [
      {
        timestamp: "2026-06-02T12:50:28.787Z",
        actorId: "47c4debe-3940-44ca-b931-74076ff0f18b",
        action: "OUTCOME_RECORDED",
        beforeValue: undefined,
        afterValue: 50000,
        reason: "Customer reported outcome value: 50000"
      }
    ],
    status: "outcome_recorded",
    updatedAt: new Date("2026-06-02T12:50:28.787Z"),
    lastUpdatedBy: "47c4debe-3940-44ca-b931-74076ff0f18b",
    ~~~~~~~~~~~~~
?   lastUpdatedByUserId?: String | NullableStringFieldUpdateOperationsInput | Null
  }
}
```

**Error Code:** P2316 (Prisma Client Validation Error)

**Root Database Error:** None (caught by Prisma client validation before database execution)

---

## TASK 3: ERROR CLASSIFICATION

**Error Type:** **A. Invalid Prisma Field**

**Reason:**
- Field `lastUpdatedBy` does not exist in `OperatorItem` model
- Schema defines field as `lastUpdatedByUserId` with `@map("last_updated_by_user_id")`
- Prisma client validation rejects the invalid field name
- Correct field is suggested in error output with `?` marker

**Analysis:**
- The field is syntactically valid as a string
- The field is not a UUID mismatch (both are strings)
- The field is not missing required (attempting to set it)
- The field name is simply not recognized in the schema
- No migration drift (schema matches prisma/schema.prisma)
- No enum mismatch (string value in string field)

---

## TASK 4: ROOT CAUSE TEST COUNT

**ROOT_CAUSE_COUNT:** All 42 tests

**Evidence:**
The `lastUpdatedBy` assignment occurs in `decision-lifecycle.service.ts:385`, which is invoked by:
1. All 12 tests in `verified-lifecycle.test.ts` - calls `approveOutcomeVerification()`
2. All 6 tests in `real-route-tests.test.ts` (decision path) - calls `recordDecisionOutcome()`
3. All 14 tests in `decision-outcome-path.test.ts` - calls `recordDecisionOutcome()`

This gives 12 + 6 + 14 = 32 tests from decision lifecycle.

Additionally:
- 10 tests in `operator-outcome-path.test.ts` fail at `src/app/api/operator/route.ts:182` with same `lastUpdatedBy` field issue (operator route sets same invalid field)

**Total affected: 42 tests (100%)**

**Failure Mode:**
- First test hits the error
- `beforeEach` hook executes `recordDecisionOutcome()` 
- `recordDecisionOutcome()` calls `db.operatorItem.update()` at line 379
- Line 385 sets `lastUpdatedBy: actorId`
- Prisma validation error thrown
- Test suite halts with PrismaClientValidationError
- All remaining tests blocked (not even attempted)

---

## FAILURE CHAIN

1. Test framework starts: `npm test -- --run <test files>`
2. First test file loads: `verified-lifecycle.test.ts`
3. First test `beforeEach` hook executes
4. `approveOutcomeVerification()` called
5. Function calls `db.operatorItem.update()` at line 379
6. Update data includes: `lastUpdatedBy: actorId`
7. Prisma client validation runs
8. Prisma discovers `lastUpdatedBy` is not a field in OperatorItem model
9. PrismaClientValidationError thrown with full error dump
10. Test suite exits with exit code 1
11. Remaining 41 tests never execute

---

## SCHEMA vs CODE MISMATCH

| Aspect | Schema | Code | Match |
|--------|--------|------|-------|
| **Field Name** | `lastUpdatedByUserId` | `lastUpdatedBy` | ❌ NO |
| **Database Column** | `last_updated_by_user_id` (via @map) | (tries to use) `lastUpdatedBy` | ❌ NO |
| **Type** | `String?` @db.Uuid | String (UUID value) | ✅ YES |
| **Nullability** | Optional | Set to actorId (not null) | ✅ YES |
| **Model** | OperatorItem | OperatorItem | ✅ YES |
| **Operation** | update() | update() | ✅ YES |

---

## COMPARISON TO OTHER FIELDS IN SAME UPDATE

Other fields being set in same `update()` call:

| Field | In Schema | Type | Valid |
|-------|-----------|------|-------|
| `actualOutcomeValue` | ✅ Yes | Float? | ✅ |
| `actualOutcome` | ✅ Yes | String? | ✅ |
| `verificationStatus` | ✅ Yes | String | ✅ |
| `verificationMethod` | ✅ Yes | String? | ✅ |
| `verificationConfidence` | ✅ Yes | Float? | ✅ |
| `verificationEvidence` | ✅ Yes | Json? | ✅ |
| `auditTrail` | ✅ Yes | Json? | ✅ |
| `status` | ✅ Yes | String | ✅ |
| `updatedAt` | ✅ Yes | DateTime | ✅ |
| `lastUpdatedBy` | ❌ NO | (string attempt) | ❌ INVALID |

---

## ROOT CAUSE PROOF

**Source Location:** `src/services/decisions/decision-lifecycle.service.ts:385`

**Code:**
```typescript
const updated = await db.operatorItem.update({
  where: { id: decisionId },
  data: {
    ...updateData,
    status: mapStateToStatus("OUTCOME_RECORDED"),
    updatedAt: new Date(),
    lastUpdatedBy: actorId,  // ← INVALID FIELD NAME
  },
});
```

**Same Issue In:**
- `src/app/api/operator/route.ts` (operator route also sets lastUpdatedBy)

**Impact:** Blocks all 42 P2B database tests

---

**Classification:** A. Invalid Prisma Field

**Fix Required:** Change `lastUpdatedBy` → `lastUpdatedByUserId` in both:
1. `src/services/decisions/decision-lifecycle.service.ts:385`
2. `src/app/api/operator/route.ts` (line ~215)

**Status:** Investigation complete. No fixes applied per task requirements.
