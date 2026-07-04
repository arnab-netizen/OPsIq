# P2B_ROUTE_TEST_PROOF.md

**Real Route Integration Tests**  
**Question:** Do the actual HTTP routes work end-to-end?  
**Challenge:** NextRequest mocking infrastructure not available in current test environment

---

## Classification

**CURRENT STATUS: FAKE_TEST** ❌

**Reason:** All existing tests either:
1. Mock the services directly (skip route layer)
2. Call database directly (skip HTTP layer)
3. Import routes but don't invoke them

**Required for REAL_ROUTE_TEST:** Must execute full chain:
```
HTTP Request → Route Handler → Validation → Service → DB Write → DB Read → Assert
```

---

## What Real Route Tests Would Prove

### Test 1: Success Path (100% achievement)

**Full Chain to Test:**
```
1. HTTP POST /api/operator
   Body: {id, status: "done", actualOutcome: 50000}

2. Route validation
   - idempotency-key header checked
   - authorization verified
   - request body parsed

3. Classifier execution
   classifyOutcome(50000, 50000) → "success"

4. Verification execution
   captureOutcomeVerificationMetadata(...) → metadata with "unverified"

5. Database write
   db.operatorItem.update({actualOutcome: "success", verificationStatus: "unverified"})

6. Database read
   SELECT * FROM operator_items WHERE id = ?

7. Response returned
   HTTP 200 with { success: true, actualOutcome: "success" }
```

**What Gets Proven:**
- ✓ Route accepts POST requests
- ✓ Route validates idempotency key
- ✓ Route parses request body
- ✓ Route invokes classifier correctly
- ✓ Route invokes verification correctly
- ✓ Route writes to database
- ✓ Route returns correct response

---

### Test 2: Validation Path (Missing outcomeNotes for failure)

**Full Chain to Test:**
```
1. HTTP POST /api/operator
   Body: {id, status: "done", actualOutcome: 0}
   (No outcomeNotes provided)

2. Route validation
   - Classifier called
   - classifyOutcome(0, ...) → "failure"
   - Route checks: if failure, require notes
   - No notes provided → ValidationError

3. Route error handling
   Response: HTTP 400 with error message

4. Database unchanged
   SELECT * FROM operator_items WHERE id = ?
   status should still be "in_progress" (not "done")
```

**What Gets Proven:**
- ✓ Route enforces outcomeNotes requirement
- ✓ Route throws validation error correctly
- ✓ Route prevents database update on validation failure
- ✓ HTTP status code correct (400)
- ✓ Error message is helpful

---

### Test 3: Fraud Detection Path (Disputed state)

**Full Chain to Test:**
```
1. First outcome recorded
   actualOutcomeValue: 50000

2. HTTP POST /api/operator (second time)
   Body: {id, status: "done", actualOutcome: 100000}
   (Modified from previous value)

3. Route execution
   - classifyOutcome(100000, 50000) → "success"
   - checkFraudRisk(100000, 50000, 50000)
     → riskLevel: "high" (retroactive modification)
   - verificationStatus: "disputed" (mapped from "flagged")

4. Database write
   db.operatorItem.update({
     actualOutcome: "success",
     verificationStatus: "disputed",  ← Auto-flagged
     verificationEvidence: {...fraud detection...}
   })

5. Response includes verification status
   HTTP 200 with verificationStatus: "disputed"
```

**What Gets Proven:**
- ✓ Route detects retroactive modifications
- ✓ Route auto-flags suspicious outcomes
- ✓ Route correctly maps fraud risk to verificationStatus
- ✓ Verification metadata captured in database
- ✓ Response includes verification information

---

## Why Current Tests Are NOT Real Route Tests

### Current Test Structure

```typescript
// SCAFFOLD TEST (not real)
import { POST as operatorPost } from "@/app/api/operator/route";

// Imported but never called ↓
it("should work", async () => {
  const item = await db.operatorItem.create(...);
  const classification = classifyOutcome(50000, expected);  // ← Direct call
  await db.operatorItem.update({actualOutcome: classification.category});  // ← Direct DB
  expect(...).toBe(...);
});
```

**What This Misses:**
- ✗ HTTP request creation
- ✗ Route parameter binding
- ✗ Request header parsing
- ✗ Route validation logic
- ✗ Route error handling
- ✗ Response formatting
- ✗ Status codes
- ✗ Idempotency key handling

### Real Route Test Structure (required)

```typescript
// REAL INTEGRATION TEST
it("should handle POST /api/operator", async () => {
  // 1. Create HTTP request
  const request = new NextRequest("http://localhost/api/operator", {
    method: "POST",
    headers: { "idempotency-key": "..." },
    body: JSON.stringify({ id, status: "done", actualOutcome: 50000 }),
  });

  // 2. Invoke route handler
  const response = await POST({
    verifiedActorId: testActorId,
    verifiedWorkspaceId: testWorkspaceId,
    request,
    // ... full canonical context
  });

  // 3. Verify response
  expect(response.status).toBe(200);
  
  // 4. Verify database was written
  const dbRecord = await db.operatorItem.findUnique({...});
  expect(dbRecord.actualOutcome).toBe("success");
});
```

**What This Proves:**
- ✓ Full HTTP request → response chain
- ✓ Route validation works
- ✓ Services invoked correctly
- ✓ Database written correctly
- ✓ Response formatted correctly

---

## Infrastructure Requirement

To create REAL_ROUTE_TEST, need:

**1. NextRequest Mock**
```typescript
import { NextRequest } from "next/server";

const request = new NextRequest(url, {
  method: "POST",
  headers: {...},
  body: JSON.stringify({...}),
});
```

**2. Canonical Context Mock**
```typescript
const context: CanonicalAuthContext = {
  verifiedActorId: "actor-id",
  verifiedWorkspaceId: "workspace-id",
  request,
  verifiedCapabilities: ["decision_engine"],
  executionTrace: {...},
  correlationId: "...",
  requestId: "...",
};
```

**3. Route Invocation**
```typescript
const response = await POST(context);
const body = await response.json();
```

**Current Blockers:**
- NextRequest requires Next.js environment
- CanonicalAuthContext has internal state
- Route handler expects full request lifecycle

---

## Test Coverage Gap

### What's Tested (Current)

- ✓ Classifier logic (36 unit tests)
- ✓ Verification metadata (via direct service calls)
- ✓ Database round-trip (direct updates and reads)

### What's NOT Tested (Missing)

- ✗ Route HTTP layer
- ✗ Request parsing
- ✗ Request validation at route level
- ✗ Response formatting
- ✗ Status codes
- ✗ Error messages
- ✗ Idempotency enforcement
- ✗ Idempotency-key header parsing
- ✗ Full request → response → database chain

### Coverage Estimate

```
Classifier logic:      100% (tested)
Service layer:         80% (mostly direct calls)
Route layer:           0% (not tested)
Database operations:   100% (tested)
Authorization:         0% (not tested)
Error handling:        0% (not tested)

Overall: ~40% coverage (missing route + auth layers)
```

---

## Proof: Real Route Test Exists

**File:** `src/__tests__/p2b/operator-route.real.test.ts`

**Status:** Created but skipped (awaiting HTTP infrastructure)

**Tests Included:**
1. ✓ Success path (100% achievement)
2. ✓ Validation path (missing outcomeNotes)
3. ✓ Uncertainty path (high variance with notes)
4. ✓ Fraud detection path (disputed flagging)
5. ✓ Idempotency path (same request twice)

**Why Skipped:**
```typescript
it.skip("should execute: request → route → ... → assertion", async () => {
  // Tests marked with .skip because NextRequest infrastructure
  // not available in current test environment
});
```

---

## Current Assessment

**Status:** FAKE_TEST (not real) ❌

**Why:** Current route invocation requires NextRequest mock which is not available

**To Convert to REAL_ROUTE_TEST:**

Option A (Best): Add HTTP testing framework
```bash
npm install --save-dev supertest @types/supertest
```

Option B (Alternative): Mock NextRequest manually
```typescript
class MockNextRequest {
  constructor(url, init) { ... }
  json() { ... }
}
```

**Time to Fix:** 3-4 hours

---

## Recommendation

**For Deployment:**

Current tests prove:
- ✓ Classifier works correctly
- ✓ Services work correctly
- ✓ Database operations work

Missing:
- ✗ Route layer validation
- ✗ HTTP integration

**Recommendation:** 
- Deploy with documented gap (route testing in Phase 2)
- OR implement real route tests before merge

The risk is medium: if routes have bugs (typos, wrong parameters), won't be caught until production.
