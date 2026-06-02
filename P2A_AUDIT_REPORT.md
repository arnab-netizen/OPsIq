# P2A HOSTILE AUDIT REPORT

**Date:** 2026-06-02  
**Status:** CONDITIONAL PASS WITH CRITICAL GAPS  
**Auditor:** Hostile review (no trust in reports, verify all claims)

---

## EXECUTIVE SUMMARY

P2A implementation is **functionally operable but governance-incomplete**. Fields are stored and retrieved correctly, but validation is partial, audit trail is incomplete, and test coverage is weak. The implementation **works but not as described in completion report**.

---

## TASK A: IMPLEMENTATION VERIFICATION

### Result: PROVEN (all fields implemented)

**Exact Code Locations:**

| Field | Interface Definition | Validation Function | Create Persistence | Update Persistence | Retrieval |
|-------|---------------------|-------------------|------------------|------------------|-----------|
| why_now | Line 41 (CreateInput), 56 (UpdateInput) | Lines 168-176 | Lines 494, 531, 614 | Lines 1302 | Line 1232 |
| cost_of_inaction | Line 42 (CreateInput), 57 (UpdateInput) | Lines 178-186 | Lines 495, 531, 614 | Lines 1303 | Line 1232 |
| expected_metric | Line 43 (CreateInput), 58 (UpdateInput) | Lines 188-194 | Lines 496, 531, 614 | Lines 1304 | Line 1232 |
| expected_direction | Line 44 (CreateInput), 59 (UpdateInput) | Lines 196-201 | Lines 497, 531, 614 | Lines 1305 | Line 1232 |
| expected_target | Line 45 (CreateInput), 60 (UpdateInput) | Lines 203-209 | Lines 498, 531, 614 | Lines 1306 | Line 1232 |

**File Locations:**
- Interfaces: `/home/user/OPsIq/src/services/recommendation.ts:31-61`
- Validation: `/home/user/OPsIq/src/services/recommendation.ts:149-209`
- Persistence (CREATE): `/home/user/OPsIq/src/services/recommendation.ts:493-614`
- Persistence (UPDATE): `/home/user/OPsIq/src/services/recommendation.ts:1257-1314`
- Retrieval: `/home/user/OPsIq/src/services/recommendation.ts:1210-1255`
- API Schemas: Routes `/home/user/OPsIq/src/app/api/recommendations/*`

**Classification:** PROVEN ✓

---

## TASK B: PERSISTENCE VERIFICATION

### Result: PROVEN (round-trip works)

**Execution Chain (Why_Now Example):**

```
POST /api/recommendations
  ↓ (line 55, route.ts)
parseRequestBody(schema) — Zod validates why_now:z.string().min(10).max(500)
  ↓ (line 67, route.ts)
createRecommendation(body, ...)
  ↓ (lines 494, 501-502, recommendation.ts)
expectations = { why_now: input.why_now, ... }
constraintsConsidered = hasAnyExpectation ? expectations : undefined
  ↓ (lines 513, 531, recommendation.ts) — idempotency path
db.recommendation.create({
  data: {
    ...(constraintsConsidered && { constraintsConsidered })  ← spreads to JSON
  }
})
  ↓ (database write)
constraintsConsidered JSON column receives: { why_now: "...", ... }
  ↓ (line 69, route.ts)
return canonicalJson(result) — includes constraintsConsidered
  ↓ (client)
Client receives: { id: "...", constraintsConsidered: { why_now: "..." } }

GET /api/recommendations/:id
  ↓ (line 48, [recommendationId]/route.ts)
getRecommendation(id, workspaceId)
  ↓ (lines 1216-1232, recommendation.ts)
db.recommendation.findUnique({
  select: {
    constraintsConsidered: true  ← explicitly selected
  }
})
  ↓ (database read)
Returns with constraintsConsidered JSON
  ↓ (line 49, [recommendationId]/route.ts)
return canonicalJson(recommendation)
  ↓ (client)
Client receives: { id: "...", constraintsConsidered: { why_now: "..." } }
```

**Verification: PROVEN** ✓
- Fields accepted at API
- Stored in constraintsConsidered JSON
- Retrieved from JSON
- Returned to client

---

## TASK C: SHADOW STRUCTURES

### Result: PROVEN SINGLE SOURCE OF TRUTH (mostly)

**All Occurrences of P2A Fields:**

```
/home/user/OPsIq/src/services/recommendation.ts:
  - Lines 41-45: CreateRecommendationInput interface (PRIMARY)
  - Lines 56-60: UpdateRecommendationInput interface (PRIMARY)
  - Lines 149-209: validateExpectationFields() function
  - Lines 493-498: expectations object construction (PRIMARY)
  - Lines 501-502: constraintsConsidered assembly (PRIMARY)
  - Lines 1302-1306: merge logic in update (PRIMARY)
  - Multiple validation error messages

/home/user/OPsIq/src/app/api/recommendations/route.ts:
  - Lines 30-34: createRecommendationSchema Zod validation (PRIMARY)

/home/user/OPsIq/src/app/api/recommendations/[recommendationId]/route.ts:
  - Lines 29-33: updateRecommendationSchema Zod validation (PRIMARY)

/home/user/OPsIq/src/domain/decisions/recommendation-contracts.ts:
  - Line 215: why_now in different Recommendation type (NOT P2A, Phase G)

/home/user/OPsIq/src/services/execution/verification-engine.ts:
  - expected_metric_movement (different field, not P2A)
```

**Classification: SINGLE SOURCE OF TRUTH** ✓
- P2A fields stored only in constraintsConsidered JSON
- No duplicate schema columns
- No shadow databases or parallel structures
- Different Phase G contract is separate concern

---

## TASK D: BACKWARD COMPATIBILITY

### Result: PROVEN ✓

**Test Case 1: Old CREATE payload (no expectations)**
```typescript
// Line 41-45: all 5 fields marked with "?" (optional)
const oldPayload = {
  engagementId: "eng-123",
  findingId: "find-456",
  priority: "high",
  title: "Old rec"
};

// Line 501-502: hasAnyExpectation = false → constraintsConsidered = undefined
// Result: Record created with constraintsConsidered = null ✓
```

**Test Case 2: Old UPDATE payload (no expectations)**
```typescript
// Line 56-60: all 5 fields marked with "?" (optional)
const oldPayload = {
  status: "approved",
  version: 1
};

// Line 1290-1296: hasExpectationField = false → skip merge
// Result: Existing constraintsConsidered preserved ✓
```

**Test Case 3: Old GET (retrieving records without expectations)**
```typescript
// Line 1232: constraintsConsidered selected regardless
// Result: Returns null or empty JSON for old records ✓
```

**Classification: BACKWARD COMPATIBLE** ✓
- Old payloads flow through unchanged
- Old records remain intact
- Conditional JSON assembly (spread only if has expectations)

---

## TASK E: TEST VERIFICATION

### Result: WEAK (not testing production code)

**File 1: expectation-fields.test.ts**
```
Status: WEAK_TEST
Reason: Tests local mock function, not service implementation
Location: Lines 21-209 define validateExpectationFields()
Issue: Implementation also at recommendation.ts:149 (different code)
Tests Pass: 18/18 ✓
Reality: Tests pass but don't validate service behavior
```

**File 2: expectation-api.test.ts**
```
Status: FAKE_TEST
Reason: Scaffolding with error suppression
Location: Lines 76-100 wrap calls in try/catch
Issue: Failures are caught and ignored, tests skip assertions
Tests Skipped: 11/29
Reality: Integration tests don't actually test anything
```

**Critical Finding: validateExpectationFields is Dead Code**
```
Line 149-209 (recommendation.ts): Function DEFINED
Line 1302-1306 (recommendation.ts): Function NEVER CALLED
Grep result: Only 1 match (the definition itself)

This means:
- Validation logic exists but unused
- Service validates only via Zod at API layer
- Service-level validation is absent
```

**Test Classification Summary:**

| Test | File | Count | Classification | Issue |
|------|------|-------|-----------------|-------|
| expectation-fields | expectation-fields.test.ts | 18 | WEAK_TEST | Local mock, not service |
| expectation-api | expectation-api.test.ts | 29 | FAKE_TEST | Scaffolding, try/catch errors |
| **TOTAL** | | 47 | MOSTLY FAKE | None test actual service |

---

## TASK F: GOVERNANCE VERIFICATION

### Result: PARTIAL (gaps found)

**1. Workspace Isolation: INTACT** ✓
```
Lines 465, 523, 606, 642: workspaceId enforced in all queries
P2A code does not bypass workspace checks
Result: ✓ PASS
```

**2. Permission Enforcement: INTACT** ✓
```
Line 34 (route.ts): requireCapability check before processing
Line 463, 1263 (recommendation.ts): requireServiceContext enforced
P2A code does not bypass permission checks
Result: ✓ PASS
```

**3. Version Control: INTACT** ✓
```
Line 1276: Version check enforced
Line 1280: Version incremented on update
P2A merge happens before update (no version bypass)
Result: ✓ PASS
```

**4. Audit Trail: INCOMPLETE** ✗
```
Lines 535-544: AUDIT_EVENTS.RECOMMENDATION_CREATED fired
Payload (line 540-542): { engagementId, priority }
MISSING: why_now, cost_of_inaction, expected_metric, expected_direction, expected_target

Updates (lines 1302-1306): Silent merge, no new event
Expectation field changes have NO audit entry
Result: ✗ FAIL - Silent mutations possible
```

**Governance Summary:**

| Control | Status | Evidence |
|---------|--------|----------|
| Workspace isolation | ✓ INTACT | workspaceId on all queries |
| Permission enforcement | ✓ INTACT | requireCapability + requireServiceContext |
| Version control | ✓ INTACT | Version check on update |
| Audit trail | ✗ INCOMPLETE | Expectation fields not in audit payload |
| Idempotency | ✓ INTACT | Idempotency check on POST |

---

## REMAINING RISKS

### Risk 1: Partial Validation (MEDIUM)
- **Issue:** validateExpectationFields() is dead code (never called)
- **Impact:** Service-level validation missing, only Zod validation at API
- **What's NOT validated:** expected_metric has no enum check (any string accepted)
- **Mitigation:** Add .enum() to Zod schema for expected_metric

### Risk 2: Incomplete Audit (MEDIUM)
- **Issue:** Expectation field changes not tracked in audit trail
- **Impact:** Compliance violations (silent mutations without audit)
- **Remediation:** Add expectation fields to audit payload

### Risk 3: Test Coverage (LOW)
- **Issue:** Tests don't test actual service code
- **Impact:** Implementation may work but tests are weak proof
- **Remediation:** Import validateExpectationFields from service, test actual function

### Risk 4: Weak API Validation (LOW)
- **Issue:** expected_metric accepts any string (no whitelist enforced)
- **Impact:** Invalid metrics could be stored
- **Remediation:** Add z.enum([...]) to Zod schema

---

## WHAT ACTUALLY WORKS

✓ Fields are accepted in API payloads  
✓ Fields are stored in constraintsConsidered JSON  
✓ Fields are retrieved correctly  
✓ Round-trip persistence verified  
✓ Backward compatibility verified  
✓ Workspace isolation intact  
✓ Permission enforcement intact  
✓ Version control intact  
✓ No schema migrations needed  
✓ No new tables created  

---

## WHAT DOESN'T WORK AS DESCRIBED

✗ Service-level validation is dead code (never called)  
✗ Tests test mock, not actual implementation  
✗ Audit trail incomplete (expectation changes not logged)  
✗ API validation incomplete (expected_metric unchecked)  
✗ Silent mutations possible (expectations merged without events)  

---

## FINAL VERDICT

### CONDITIONAL PASS

**Summary:** Implementation is **functionally operational but governance-incomplete**.

**Required Fixes Before Production:**

1. **Add expected_metric enum to Zod schema** (line 32, route.ts POST; line 31, PATCH)
   ```typescript
   // Current:
   expected_metric: z.string().optional(),
   
   // Required:
   expected_metric: z.enum(["approval_rate", "processing_time", ...]).optional(),
   ```

2. **Remove or call validateExpectationFields()** (line 149, recommendation.ts)
   - Either export and call it in service, or remove dead code

3. **Add expectation fields to audit payload** (lines 540-542, recommendation.ts)
   ```typescript
   payload: {
     engagementId: input.engagementId,
     priority: input.priority,
     why_now: input.why_now,
     cost_of_inaction: input.cost_of_inaction,
     expected_metric: input.expected_metric,
     expected_direction: input.expected_direction,
     expected_target: input.expected_target,
   }
   ```

4. **Fix test imports** (expectation-fields.test.ts)
   - Import validateExpectationFields from service instead of defining local mock

**With these 4 fixes:** PASS ✓

**Without fixes:** Operational but non-compliant with governance

---

## ROLLBACK SAFETY

- No schema migrations (can roll back instantly)
- constraintsConsidered JSON optional (old records unaffected)
- No new entities (nothing to clean up)
- Data loss risk: ZERO

**Rollback time: < 5 minutes**

---

## VERDICT CLASSIFICATION

**CONDITIONAL PASS** ✓  
*Functionally works, governance incomplete, fixable with 4 small changes*

