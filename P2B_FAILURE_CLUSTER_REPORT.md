# P2B_FAILURE_CLUSTER_REPORT

**Workflow ID:** 26855779484  
**Total Tests:** 42  
**Passed:** 26  
**Failed:** 16  
**Analysis Date:** 2026-06-03

---

## FAILURE SUMMARY

All 16 failing tests grouped into 4 root defects:

| Defect | Category | Tests Affected | Root Cause |
|--------|----------|----------------|-----------|
| D1 | Route Execution | 2 | Operator route handler not executing |
| D2 | Fraud Detection | 5 | Fraud risk not mapped to "disputed" status |
| D3 | Validation | 2 | Route pre-condition failures |
| D4 | Lifecycle/Metadata | 7 | Verification state transitions & evidence persistence |

---

## DEFECT RANKING BY LEVERAGE

| Rank | Defect | Tests Fixed | Files To Change | Priority |
|------|--------|-------------|-----------------|----------|
| 1 | D4: Lifecycle/Metadata | 7 | verification.ts, lifecycle.service.ts | HIGH |
| 2 | D2: Fraud Detection | 5 | verification.ts (checkFraudRisk → captureOutcomeVerificationMetadata) | HIGH |
| 3 | D1: Route Execution | 2 | route.ts, store.ts | MEDIUM |
| 4 | D3: Validation | 2 | route.ts (validation logic) | MEDIUM |

---

## DETAILED DEFECTS

### DEFECT D1: Operator Route Handler Not Executing (2 tests)

**Root Cause:** Route handler (`POST` in `/api/operator/route.ts`) is not executing. The canonical route wrapper is either rejecting the request or not calling the handler properly.

**Affected Tests:**
1. `src/__tests__/p2b/real-route-tests.test.ts`
   - Suite: "P2B: REAL Operator Route Integration"
   - Test: "SUCCESS PATH: 100% achievement - REAL: route invocation → classifier → verification → database"
   - Line: ~166
   - Assertion: `expect(dbRecord?.actualOutcome).toBe('success')`
   - Expected: `"success"`
   - Received: `null`

2. `src/__tests__/p2b/verified-lifecycle.test.ts`
   - Suite: "STATE TRANSITIONS: Valid paths"
   - Test: "REAL: unverified → disputed transition"
   - Assertion: Route handler invocation produces database update
   - Expected: `"success"`
   - Received: `null`

**Analysis:** The `actualOutcome` field is null, indicating the classifier was never invoked, which means the handler never executed.

**Likely Cause:** 
- Canonical wrapper auth rejection (wrapper validates session/policy before calling handler)
- Handler return value not being processed correctly
- Request body serialization issue

**Files to Change:**
- `src/app/api/operator/route.ts` - POST handler invocation
- `src/lib/canonical-route-enforcement.ts` - Auth evaluation logic

---

### DEFECT D2: Fraud Detection Not Setting "Disputed" Status (5 tests)

**Root Cause:** Fraud risk is correctly identified, but `verificationStatus` is set to `"unverified"` instead of `"disputed"` when fraud risk is high.

**Affected Tests:**
1. `src/__tests__/p2b/decision-outcome-path.test.ts`
   - Test: "Uncertain outcome recording - should accept uncertain with outcomeNotes and auto-flag"
   - Assertion: `expect(dbRecord?.verificationStatus).toBe('disputed')`
   - Expected: `"disputed"`
   - Received: `"unverified"`

2. `src/__tests__/p2b/decision-outcome-path.test.ts`
   - Test: "High fraud risk auto-flagging - should auto-flag when variance exceeds 500%"
   - Assertion: `expect(dbRecord?.verificationStatus).toBe('disputed')`
   - Expected: `"disputed"`
   - Received: `"unverified"`

3. `src/__tests__/p2b/real-route-tests.test.ts`
   - Test: "FRAUD DETECTION PATH - REAL: route fraud detection auto-flags as disputed"
   - Assertion: Fraud detection should set status to "disputed"
   - Expected: `"disputed"`
   - Received: `"unverified"`

4. `src/__tests__/p2b/real-route-tests.test.ts`
   - Suite: "P2B: REAL Decision Lifecycle Integration"
   - Test: "FRAUD DETECTION PATH - REAL: recordDecisionOutcome auto-flags high fraud risk as disputed"
   - Assertion: `expect(dbRecord?.verificationStatus).toBe('disputed')`
   - Expected: `"disputed"`
   - Received: `"unverified"`

5. `src/__tests__/p2b/verified-lifecycle.test.ts`
   - Test: "STATE TRANSITIONS - REAL: disputed → verified transition"
   - Assertion: Fraud detection should have set disputed
   - Expected: `"disputed"`
   - Received: `"unverified"`

**Analysis:** The fraud risk assessment is running (tests show fraud is detected), but the mapping from high fraud risk to `"disputed"` status is not happening.

**Mapping Expected:**
```
if (fraudRisk.riskLevel === 'high') {
  verificationStatus = 'disputed'
}
```

**Likely Cause:**
- `captureOutcomeVerificationMetadata` in `src/services/outcome/verification.ts` is not mapping `fraudRiskAssessment.riskLevel === 'high'` to `verificationStatus = 'disputed'`
- Missing handler in `src/services/operator/store.ts` for fraud risk to status mapping

**Files to Change:**
- `src/services/outcome/verification.ts` (lines ~150) - Add/fix mapping: `high` risk → `"disputed"` status

---

### DEFECT D3: Route Validation Pre-Condition Failures (2 tests)

**Root Cause:** Route handler validation is failing with "the given combination of arguments (undefined...)" error.

**Affected Tests:**
1. `src/__tests__/p2b/real-route-tests.test.ts`
   - Suite: "VALIDATION PATH: Missing outcomeNotes for failure"
   - Test: "REAL: route validation rejects failure without notes"
   - Assertion: Validation should throw error
   - Error: "the given combination of arguments (undefined...)"

2. `src/__tests__/p2b/verified-lifecycle.test.ts`
   - Suite: "VALIDATION PATH: Invalid transitions rejected"
   - Test: "REAL: invalid transition rejected (verified → unverified)"
   - Assertion: Validation should reject invalid state transition
   - Expected: "Invalid verification status. Allowed: verified, disputed"
   - Received: "Invalid verification status. Allowed: verified, disputed" (BUT error format differs)

**Analysis:** Validation logic is executing but throwing incorrect error types or validation contract is not met.

**Likely Cause:**
- Zod schema validation failing with different error shape
- Missing parameter in validation check
- Error message format mismatch

**Files to Change:**
- `src/app/api/operator/route.ts` (lines ~214-218) - Input validation logic

---

### DEFECT D4: Lifecycle/Metadata Persistence and State Transitions (7 tests)

**Root Cause:** Verification metadata (auditTrail, verificationEvidence, verificationConfidence) is not persisting correctly. State transitions between unverified/disputed/verified are not working.

**Affected Tests:**
1. `src/__tests__/p2b/decision-outcome-path.test.ts`
   - Test: "High fraud risk auto-flagging - should flag retroactive modifications"
   - Assertion: `expect(dbRecord?.actualOutcome).toBe('success')`
   - Expected: `"success"`
   - Received: `null`

2. `src/__tests__/p2b/verified-lifecycle.test.ts`
   - Test: "STATE TRANSITIONS - REAL: unverified → verified transition"
   - Assertion: State transition should succeed
   - Expected: status update to "verified"
   - Received: No update or wrong status

3. `src/__tests__/p2b/verified-lifecycle.test.ts`
   - Test: "STATE TRANSITIONS - REAL: verified → disputed transition (re-flagging)"
   - Assertion: Should allow re-flagging from verified to disputed
   - Issue: Lifecycle state machine not allowing transition

4. `src/__tests__/p2b/verified-lifecycle.test.ts`
   - Test: "AUDIT TRAIL - REAL: audit trail captures verification metadata"
   - Assertion: `expect(dbRecord?.auditTrail).toBeDefined()`
   - Issue: auditTrail not populated with verification events

5. `src/__tests__/p2b/verified-lifecycle.test.ts`
   - Test: "AUDIT TRAIL - REAL: multiple verifications appended to trail"
   - Assertion: Multiple events should append to auditTrail array
   - Issue: auditTrail not accumulating entries

6. `src/__tests__/p2b/verified-lifecycle.test.ts`
   - Test: "EVIDENCE - REAL: adminVerification metadata captured"
   - Assertion: `expect(dbRecord?.verificationEvidence).toBeDefined()`
   - Issue: verificationEvidence not persisted

7. `src/__tests__/p2b/verified-lifecycle.test.ts`
   - Test: "EVIDENCE - REAL: previous fraud assessment preserved in evidence"
   - Assertion: Evidence should preserve fraud assessment details
   - Issue: Evidence object not capturing assessment history

**Analysis:** The verification metadata capture is either not being called, not being persisted to the database, or the schema doesn't have the fields defined.

**Likely Causes:**
1. `captureOutcomeVerificationMetadata` in `src/services/outcome/verification.ts` returns incomplete metadata
2. `updateItem` in `src/services/operator/store.ts` doesn't have handlers for these fields
3. Prisma schema missing field definitions (unlikely since earlier commits fixed this)
4. State machine validation rejecting valid transitions

**Files to Change:**
- `src/services/outcome/verification.ts` (lines ~136-171) - Complete metadata capture
- `src/services/operator/store.ts` (lines ~184-198) - Add missing field handlers
- `src/services/decisions/decision-lifecycle.service.ts` (lines ~365-387) - Ensure metadata spread into updates

---

## IMPLEMENTATION PRIORITY

### Phase 1 (Highest Leverage - 7 tests fixed)
**DEFECT D4:** Fix lifecycle/metadata persistence
- Add missing field handlers in `store.ts`
- Ensure `captureOutcomeVerificationMetadata` returns complete metadata
- Fix state transition validation logic

### Phase 2 (Medium Leverage - 5 tests fixed)
**DEFECT D2:** Fix fraud detection → "disputed" mapping
- Fix mapping in `captureOutcomeVerificationMetadata`
- Ensure `checkFraudRisk` returns correct data structure

### Phase 3 (Lower Leverage - 2 tests each)
**DEFECT D1:** Fix route handler execution
**DEFECT D3:** Fix validation error handling

---

## CONCLUSION

The P2B test failures cluster around 4 interconnected defects:
1. **Metadata persistence** (7 failures) - requires schema/service updates
2. **Fraud detection mapping** (5 failures) - requires verification.ts fix
3. **Route execution** (2 failures) - requires auth/handler fix
4. **Validation** (2 failures) - requires error handling fix

Fixing D4 (metadata persistence) would resolve 44% of failures and likely unlock D1 and D3 as well.
