# P2B_TEST_PROOF.md

**Integration Test Requirements and Current Status**  
**Scope:** Proof that outcome recording paths work end-to-end

---

## Test Chain Requirements

For REAL integration test, must prove:

```
1. Request Creation
   ↓
2. Route Handler Invocation
   ↓
3. Service Call (classifier + verification)
   ↓
4. Database Write
   ↓
5. Database Read
   ↓
6. Assertion Validation
```

---

## Current Status: Scaffold Tests

### Test File 1: operator-outcome-path.test.ts

**Location:** `src/__tests__/p2b/operator-outcome-path.test.ts`

**Current Structure:**
```typescript
import { db } from "@/lib/db";
import { POST as operatorPost } from "@/app/api/operator/route";  // Imported but unused!
import { classifyOutcome } from "@/services/operator/outcome-classifier";

describe("P2B: Operator Outcome Path Integration", () => {
  beforeEach(async () => {
    const item = await db.operatorItem.create({...});  // Step 4: DB Write (direct)
    testItemId = item.id;
  });

  it("should classify 100% achievement as success", async () => {
    const item = await db.operatorItem.findUnique({...});  // Step 5: DB Read (direct)
    
    const classification = classifyOutcome(50000, item?.impactExpected ?? null);  // Step 3: Classifier only
    
    await db.operatorItem.update({...});  // Step 4: DB Write (direct)
    
    const updated = await db.operatorItem.findUnique({...});  // Step 5: DB Read
    
    expect(updated?.actualOutcome).toBe("success");  // Step 6: Assertion
  });
});
```

**Missing Steps:**
- ✗ Step 1: Request Creation (no NextRequest/Request mock)
- ✗ Step 2: Route Handler Invocation (POST is imported but never called)
- ✓ Step 3: Service Call (classifier called directly, not via route)
- ✓ Step 4: Database Write (direct db.update calls)
- ✓ Step 5: Database Read (direct db.findUnique calls)
- ✓ Step 6: Assertion (assertions exist)

**Classification: SCAFFOLD_ONLY** ❌

Route logic never tested:
- Request validation (outcomeNotes requirement)
- Error handling
- Idempotency key enforcement
- Route-level context setup
- Authorization checks

---

### Test File 2: decision-outcome-path.test.ts

**Location:** `src/__tests__/p2b/decision-outcome-path.test.ts`

**Current Structure:**
```typescript
import { recordDecisionOutcome } from "@/services/decisions/decision-lifecycle.service";
import { classifyOutcome } from "@/services/operator/outcome-classifier";

describe("P2B: Decision Lifecycle Outcome Path", () => {
  beforeEach(async () => {
    const decision = await db.operatorItem.create({...});  // Step 4: DB Write (direct)
    testDecisionId = decision.id;
  });

  it("should classify and record 100% achievement as success", async () => {
    await recordDecisionOutcome(  // Step 2: Service call (not route!)
      testDecisionId,
      testWorkspaceId,
      {actualOutcomeValue: 50000},
      testActorId
    );

    const updated = await db.operatorItem.findUnique({...});  // Step 5: DB Read
    expect(updated?.actualOutcome).toBe("success");  // Step 6: Assertion
  });
});
```

**Missing Steps:**
- ✗ Step 1: Request Creation
- ✗ Step 2: Route Handler Invocation (calls service directly, bypasses route)
- ✓ Step 3: Service Call (recordDecisionOutcome called directly)
- ✓ Step 4: Database Write (db.update calls inside service)
- ✓ Step 5: Database Read (db.findUnique called)
- ✓ Step 6: Assertion (assertions exist)

**Classification: SCAFFOLD_ONLY** ❌

Route logic never tested:
- HTTP request parsing
- Status code responses
- Error message formatting
- Route-level validation

---

## What Real Integration Tests Would Need

### Test Template: Operator Route (Real Integration)

```typescript
// Step 1: Create request with body
const request = new NextRequest("http://localhost:3000/api/operator", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "idempotency-key": "test-key-" + Date.now(),
  },
  body: JSON.stringify({
    id: existingItem.id,
    status: "done",
    actualOutcome: 50000,
    // No outcomeNotes (will trigger validation error for failure/uncertain)
  }),
});

// Step 2: Invoke route handler
const context = {
  verifiedActorId: "test-actor",
  verifiedWorkspaceId: testWorkspaceId,
  request,
  // ... full canonical context
};

const response = await POST(context);

// Step 3: Service called implicitly by route
// (classifyOutcome called inside route)
// (captureOutcomeVerificationMetadata called inside route)

// Step 4: Database written by route
// (verified by step 5 read)

// Step 5: Route returns updated item
const result = await response.json();

// Step 6: Assertions validate full chain
expect(response.status).toBe(200);
expect(result.actualOutcome).toBe("success");
expect(result.verificationStatus).toBe("unverified"); // or "disputed"
```

---

## What Current Tests Do vs Should Do

| Chain Step | Current | Real Integration | Gap |
|-----------|---------|--------|--------|
| 1. Request | No | Create NextRequest | Missing |
| 2. Route handler | No (imported but unused) | Call POST(context) | Missing |
| 3. Service | Yes (direct call) | Called by route | Different path |
| 4. DB write | Yes (direct) | Via route/service | Same result |
| 5. DB read | Yes (direct) | Via route response | Same result |
| 6. Assertion | Yes | Yes | ✓ |

**Current Tests Prove:**
- Classifier works: ✓
- Database round-trip works: ✓
- Services can call database: ✓

**Current Tests DO NOT Prove:**
- Route handler works: ✗
- Request parsing works: ✗
- Response formatting works: ✗
- Request validation works: ✗
- Error handling works: ✗
- Full chain works: ✗

---

## Coverage Gap Analysis

### Test Coverage Estimate

**Classifier Logic:** 100% (unit tests prove all rules)

**Service Logic:**
- Classification: Tested (via direct calls)
- Verification metadata: Tested (via direct calls)
- Database operations: Tested (via direct calls)
- **Coverage: 75% (missing route-level integration)**

**Route Logic:**
- Request parsing: Untested
- Authorization: Untested
- Validation: Untested
- Error handling: Untested
- Response formatting: Untested
- **Coverage: 0%**

**Database Operations:**
- Schema: Tested (migrations exist)
- Writes: Tested (direct updates work)
- Reads: Tested (direct queries work)
- **Coverage: 100%**

**Total Coverage:** ~60% (missing route layer)

---

## Real Test Requirements

To achieve REAL_INTEGRATION_TEST classification, need:

### For Operator Route

**Test Case 1: Success Path**
```typescript
// Request → Route → Classifier → Verification → DB Write → Response
const request = new NextRequest("http://localhost/api/operator", {
  method: "POST",
  body: JSON.stringify({
    id: item.id,
    status: "done",
    actualOutcome: 50000,  // 100% of expected
  }),
});
const response = await POST(context);
expect(response.status).toBe(200);
expect(response.body).toMatchObject({
  success: true,
  actualOutcome: "success",
  verificationStatus: "unverified",
});
```

**Test Case 2: Failure Path Validation**
```typescript
// Request → Route → Validation → Error Response
const request = new NextRequest("http://localhost/api/operator", {
  method: "POST",
  body: JSON.stringify({
    id: item.id,
    status: "done",
    actualOutcome: 0,  // Failure (no notes provided)
  }),
});
const response = await POST(context);
expect(response.status).toBe(400);
expect(response.body.error).toContain("Outcome notes required");
```

**Test Case 3: Uncertain Path Validation**
```typescript
// Request → Route → Classifier (uncertain) → Validation → Error Response
const request = new NextRequest("http://localhost/api/operator", {
  method: "POST",
  body: JSON.stringify({
    id: item.id,
    status: "done",
    actualOutcome: 250000,  // 5x expected (uncertain, no notes)
  }),
});
const response = await POST(context);
expect(response.status).toBe(400);
expect(response.body.error).toContain("Outcome notes required");
```

### For Decision Lifecycle Route

**Test Case 1: Success Path**
```typescript
// POST /api/decisions/{id}/record-outcome
const request = new NextRequest("http://localhost/api/decisions/123/record-outcome", {
  method: "POST",
  body: JSON.stringify({
    actualOutcomeValue: 50000,
  }),
});
const response = await recordOutcomeRoute(context);
expect(response.status).toBe(200);
const db_record = await db.operatorItem.findUnique({where: {id: "123"}});
expect(db_record.actualOutcome).toBe("success");
```

---

## Current Test Classification

**Both test files: SCAFFOLD_ONLY** ❌

**Reasons:**
1. Don't invoke actual route handlers
2. Don't test request parsing
3. Don't test response formatting
4. Don't test validation at route level
5. Only test service/database layer in isolation

**To Convert to REAL_INTEGRATION_TEST:**

Need to add HTTP layer testing (NextRequest/Response mocking or supertest library)

---

## Recommendation

**Current Situation:**
- Service layer: Well tested (direct calls prove classifier and verification work)
- Route layer: Scaffold only (imported but not called)

**Why This Matters:**
- Routes add validation and error handling
- Tests must prove routes enforce validation
- Current tests skip the validation layer

**Fix Options:**

**Option A (Minimal):** Update scaffold tests to call routes
- Convert direct db.update calls to route invocations
- Test that outcomeNotes validation works
- Test error responses

**Option B (Comprehensive):** Add HTTP test framework
- Use supertest or similar
- Test full request/response cycle
- Test header validation, status codes, etc.

**Recommendation:** Option A (add route invocation to existing tests)
- Lower risk (extends current tests)
- Proves validation works
- Maintains database cleanup

---

## Status

**Current Tests:** SCAFFOLD_ONLY ❌  
**Required for Production:** REAL_INTEGRATION_TEST ✓

**To proceed to deployment:**

Need proof that:
1. Route handler is invoked
2. Request validation occurs
3. Response is properly formatted
4. Full chain works end-to-end

Currently testing only the service layer, not the route layer that wraps it.
