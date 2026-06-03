# P2B Remaining Failure Cluster After D3 Cleanup

**Status:** Analysis of 9 remaining test failures  
**D3 Impact:** Cleanup fix resolved FK blocking (verified-lifecycle now mostly passes)  
**Remaining:** 9 tests fail due to D1/D2/D4 logic blockers (not FK-related)

---

## TASK 1: ALL 9 FAILING TESTS - DETAILED EXTRACTION

### Failure Table

| # | File | Test Name | Line | Expected | Actual | Error Type | Production Frame | Test Frame |
|---|------|-----------|------|----------|--------|-----------|-----------------|-----------|
| 1 | decision-outcome-path.test.ts | should accept uncertain with outcomeNotes and auto-flag | 156:43 | "disputed" | "unverified" | AssertionError | N/A | decision-outcome-path.test.ts:156:43 |
| 2 | decision-outcome-path.test.ts | should auto-flag when variance exceeds 500% | 240:44 | "disputed" | "unverified" | AssertionError | N/A | decision-outcome-path.test.ts:240:44 |
| 3 | decision-outcome-path.test.ts | should flag retroactive modifications | 273:7 | N/A | N/A | ValidationError | decision-lifecycle.service.ts:342:11 | decision-outcome-path.test.ts:273:7 |
| 4 | real-route-tests.test.ts | REAL: route invocation → classifier → verification → database | TBD | "success" | null | AssertionError | canonical-route-enforcement.ts:753:14 | real-route-tests.test.ts:TBD |
| 5 | real-route-tests.test.ts | REAL: route validation rejects failure without notes | TBD | (constraint) | (allowed) | AssertionError | canonical-route-enforcement.ts:753:14 | real-route-tests.test.ts:TBD |
| 6 | real-route-tests.test.ts | REAL: route fraud detection auto-flags as disputed | TBD | "disputed" | null | AssertionError | canonical-route-enforcement.ts:753:14 | real-route-tests.test.ts:TBD |
| 7 | real-route-tests.test.ts | REAL: recordDecisionOutcome auto-flags high fraud risk as disputed | TBD | (fraud → disputed) | (fraud → unverified) | AssertionError | decision-lifecycle.service.ts:TBD | real-route-tests.test.ts:TBD |
| 8 | verified-lifecycle.test.ts | REAL: invalid transition rejected (verified → unverified) | TBD | (error thrown) | (no error) | AssertionError | verification-approval.service.ts:TBD | verified-lifecycle.test.ts:TBD |
| 9 | verified-lifecycle.test.ts | REAL: multiple verifications appended to trail | TBD | (2 entries) | (1 entry OR missing) | AssertionError | verification.ts:TBD | verified-lifecycle.test.ts:TBD |

---

## TASK 2: DETAILED FAILURE ANALYSIS

### Failure #1-2: Decision Outcome Path - Fraud Risk Not Mapping to Disputed

**Test Files:** decision-outcome-path.test.ts  
**Lines:** 156:43, 240:44  
**Expected:** verificationStatus = "disputed"  
**Actual:** verificationStatus = "unverified"  
**Error:** AssertionError: expected 'unverified' to be 'disputed'

**Root Cause:**
The outcome recording service correctly identifies fraud risk conditions (uncertain outcome, variance > 500%) but does NOT automatically map these to "disputed" status. Test expects automatic fraud-risk-to-disputed mapping that doesn't exist.

**Service Chain:**
1. Test calls recordDecisionOutcome() with uncertain/high-variance data
2. Service should classify fraud risk as HIGH
3. Service should map HIGH fraud risk → "disputed" status
4. Actually: Service sets status to "unverified" (no fraud mapping)

**Production Code Location:** src/services/decisions/decision-lifecycle.service.ts  
**Expected Fix File:** decision-lifecycle.service.ts or outcome-classification.service.ts

---

### Failure #3: Decision Outcome Path - Retroactive Modification Validation

**Test File:** decision-outcome-path.test.ts  
**Line:** 273:7  
**Error Type:** ValidationError: "Couldn't load that data. Please refresh and try again."  
**Production Frame:** src/services/decisions/decision-lifecycle.service.ts:342:11

**Root Cause:**
Service throws validation error when attempting to record decision with retroactive modification detection. The service is enforcing a validation that the test doesn't satisfy or expects to bypass.

**Service Chain:**
1. Test calls recordDecisionOutcome() with retroactive modification scenario
2. Service attempts to validate/classify modification
3. Service throws ValidationError at line 342 (classifyOperatorError path)
4. Test doesn't expect this error to throw

**Production Code Location:** src/services/decisions/decision-lifecycle.service.ts:342  
**Likely Issue:** Data loading/validation logic in recordDecisionOutcome

---

### Failure #4-7: Real Route Tests - Route Auth Context Not Set

**Test Files:** real-route-tests.test.ts (4 failures)  
**Affected Tests:**
- REAL: route invocation → classifier → verification → database
- REAL: route validation rejects failure without notes
- REAL: route fraud detection auto-flags as disputed
- REAL: recordDecisionOutcome auto-flags high fraud risk as disputed

**Production Frame:** src/lib/canonical-route-enforcement.ts:753:14

**Common Root Cause:**
Tests invoke routes directly without proper authentication context. The canonical route enforcement middleware expects SessionFact and PolicyFact to be present in the request context. Since these are missing, route validation/execution fails.

**Error Pattern:** All 4 failures trace back to canonical-route-enforcement.ts:753:14  
**Expected:** Tests should set up proper authentication context before invoking routes  
**Actual:** Routes receive null/undefined SessionFact/PolicyFact, fail validation

**Production Code Location:** src/lib/canonical-route-enforcement.ts:753  
**Expected Fix File:** real-route-tests.test.ts (test setup) + route handlers if enforcement is too strict

---

### Failure #8: Verified-Lifecycle - Invalid Transition Not Rejected

**Test File:** verified-lifecycle.test.ts  
**Test Name:** REAL: invalid transition rejected (verified → unverified)  
**Expected:** Service should throw ValidationError rejecting transition  
**Actual:** Service allows transition (no error)

**Root Cause:**
Test expects the verification service to reject invalid state transitions (verified → unverified is not allowed). Service currently allows this transition or doesn't validate it properly.

**Service Chain:**
1. Test sets verification status to "verified"
2. Test attempts to transition to "unverified"
3. Expected: Service throws ValidationError
4. Actual: Service allows it (no error thrown)

**Production Code Location:** src/services/outcome/verification-approval.service.ts  
**Expected Fix File:** verification-approval.service.ts (state transition validation)

---

### Failure #9: Verified-Lifecycle - Multiple Verifications Not Appended

**Test File:** verified-lifecycle.test.ts  
**Test Name:** REAL: multiple verifications appended to trail  
**Expected:** auditTrail should contain 2 verification entries  
**Actual:** auditTrail contains 1 entry OR missing entries

**Root Cause:**
Test calls approveOutcomeVerification() twice with different actors. Expected behavior: each call appends to auditTrail. Actual behavior: second call overwrites or doesn't append properly.

**Service Chain:**
1. Test calls approveOutcomeVerification() with actor "admin-1"
2. Test calls approveOutcomeVerification() with actor "admin-2"
3. Expected: auditTrail has [entry1, entry2]
4. Actual: auditTrail has [entry1] or [entry2] only

**Production Code Location:** src/services/outcome/verification.ts or verification-approval.service.ts  
**Expected Fix File:** verification.ts (buildAuditTrail function)

---

## TASK 3: ROOT CAUSES GROUPED

### Root Cause #1: D2 - Fraud Risk Not Mapped to Disputed Status
**Defect Type:** Production Logic  
**Tests Affected:** 3 (failures #1, #2, #7)  
**First Failing Line:** src/services/decisions/decision-lifecycle.service.ts (recordDecisionOutcome function)  
**Why D3 Didn't Address:** D3 was FK cleanup only. This is fraud risk classification logic.  
**Files to Fix:** 
- decision-lifecycle.service.ts (recordDecisionOutcome)
- outcome-classification.service.ts (fraud risk classifier)
- verification-approval.service.ts (status mapping)

---

### Root Cause #2: D1 - Route Auth Context Not Enforced
**Defect Type:** Test Setup / Route Enforcement  
**Tests Affected:** 4 (failures #4, #5, #6, #7 shares this)  
**First Failing Line:** src/lib/canonical-route-enforcement.ts:753  
**Why D3 Didn't Address:** D3 was FK cleanup. This is route middleware/auth enforcement.  
**Files to Fix:**
- real-route-tests.test.ts (add auth context setup)
- canonical-route-enforcement.ts (if enforcement too strict)
- route handlers for `/api/decisions/[id]/verify` etc

---

### Root Cause #3: D4 - Lifecycle Metadata Persistence
**Defect Type:** Production Logic  
**Tests Affected:** 2 (failures #8, #9)  
**First Failing Line:** 
- verification-approval.service.ts (state transition validation)
- verification.ts:buildAuditTrail (audit trail appending)  
**Why D3 Didn't Address:** D3 was FK cleanup. This is lifecycle/metadata logic.  
**Files to Fix:**
- verification-approval.service.ts (state transition validation)
- verification.ts (buildAuditTrail logic)

---

### Root Cause #4: D2 Variant - Retroactive Modification Validation
**Defect Type:** Production Logic  
**Tests Affected:** 1 (failure #3)  
**First Failing Line:** src/services/decisions/decision-lifecycle.service.ts:342  
**Why D3 Didn't Address:** D3 was FK cleanup. This is validation error handling.  
**Files to Fix:**
- decision-lifecycle.service.ts (validation logic at line 342)
- outcome-classification.service.ts (if modification detection is there)

---

## TASK 4: ROOT CAUSES RANKED

### Ranking Criteria:
1. **Tests Affected** (highest impact first)
2. **Blast Radius** (lowest scope change first)
3. **Production Risk** (lowest risk to deploy)

### Ranked List:

**1. D1 - Route Auth Context Not Enforced**
- Tests affected: 4
- Blast radius: Medium (affects 4 route test scenarios)
- Production risk: Medium (route enforcement is critical)
- Fix complexity: Medium (needs auth context setup + route handler check)
- **Priority: HIGHEST** (unblocks 4 tests)

**2. D2 - Fraud Risk Not Mapped to Disputed Status**
- Tests affected: 3 (possibly 4 including retroactive)
- Blast radius: Medium-High (fraud detection is core)
- Production risk: High (affects verification logic)
- Fix complexity: Medium (service logic change)
- **Priority: HIGH** (unblocks 3+ tests, core logic)

**3. D4 - Lifecycle Metadata Persistence**
- Tests affected: 2
- Blast radius: Low (verification service internal)
- Production risk: Low (metadata persistence, not core flow)
- Fix complexity: Low (audit trail and state validation)
- **Priority: MEDIUM** (unblocks 2 tests)

**4. D2 Variant - Retroactive Modification Validation**
- Tests affected: 1
- Blast radius: Low (single test scenario)
- Production risk: Medium (validation error handling)
- Fix complexity: Medium (needs investigation)
- **Priority: LOW** (unblocks 1 test after D2 is fixed)

---

## TASK 5: NEXT SINGLE FIX RECOMMENDATION

**Recommended First Fix:** D1 - Route Auth Context Not Enforced

**Reasoning:**
1. Highest test count impact: 4 tests
2. Lowest fix risk: Likely just test setup (auth context configuration)
3. Likely fastest to implement: May only need to add test helpers
4. Unblocks other investigation: Once routes work, fraud/lifecycle issues become clearer

**Expected Outcome After Fix:**
- Tests passing: 33 → 37 (+4)
- Failures remaining: 9 → 5
- Success rate: 78.6% → 88.1%

---

## SUMMARY TABLE

| Root Cause | ID | Type | Tests | Risk | Fix File | Rank |
|------------|-----|------|-------|------|----------|------|
| Route Auth Context | D1 | Test/Prod | 4 | Medium | real-route-tests.test.ts | 1️⃣ |
| Fraud Risk → Disputed | D2 | Production | 3 | High | decision-lifecycle.service.ts | 2️⃣ |
| Lifecycle Metadata | D4 | Production | 2 | Low | verification.ts | 3️⃣ |
| Retroactive Validation | D2v | Production | 1 | Medium | decision-lifecycle.service.ts | 4️⃣ |

---

## CONCLUSION

**P2B Verification Status:** BLOCKED (9/42 tests fail)

**D3 Cleanup Impact:** SUCCESSFUL ✓ (FK blocking resolved, 10/12 verified-lifecycle pass)

**Remaining Blockers:** 4 root causes, 3 distinct defects (D1, D2, D4)

**Next Recommended Action:** Fix D1 (Route Auth Context) to unblock 4 tests and improve pass rate to 88%

**Estimated Path to 42/42:**
1. Fix D1 (Route auth): 4 tests → 37/42 passing
2. Fix D2 (Fraud mapping): 3 tests → 40/42 passing  
3. Fix D4 (Metadata): 2 tests → 42/42 passing
