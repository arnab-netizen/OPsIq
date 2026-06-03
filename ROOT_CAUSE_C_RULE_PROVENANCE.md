# Root Cause C: Outcome Modification Rule Provenance Audit

**Date:** 2026-06-03  
**Method:** Repository-wide search for outcome modification rules, state machine definitions, and immutability policies  
**Status:** Investigation complete

---

## TASK 1: Repository Evidence Inventory

### Search Results for Outcome Modification References

| Search Term | Files Found | Relevant Content | Evidence Level |
|---|---|---|---|
| `OUTCOME_RECORDED` | 4 files | State name definition and transitions | ⭐⭐⭐ |
| `requireOutcomeRecordable` | 2 files | State validation function | ⭐⭐⭐ |
| `retroactive modification` | 3 files | Fraud risk indicator | ⭐⭐⭐ |
| `outcome modification` | 0 files | — | ❌ NONE |
| `outcome amendment` | 0 files | — | ❌ NONE |
| `outcome correction` | 0 files | — | ❌ NONE |
| `immutable` | 2 files | Closed decision immutability only | ⭐⭐ |

---

### Detailed Evidence Extraction

#### Source 1: Decision Lifecycle State Machine

**File:** `/home/user/OPsIq/src/domain/decision-lifecycle.ts`

**State Definitions (Lines 13-24):**
```typescript
export const DECISION_STATES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "EXECUTED",
  "OUTCOME_RECORDED",  // ← State where outcome is recorded
  "CLOSED",
  "REJECTED",
  "CANCELLED",
  "FAILED",
] as const;
```

**Allowed Transitions (Lines 51-64):**
```typescript
export const ALLOWED_TRANSITIONS: Record<DecisionState, DecisionState[]> = {
  // Happy path
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["EXECUTED", "CANCELLED"],
  EXECUTED: ["OUTCOME_RECORDED", "FAILED"],        // ← Can only record once (no return)
  OUTCOME_RECORDED: ["CLOSED"],                    // ← Terminal for outcomes, leads to CLOSED only
  CLOSED: [],                                       // ← Terminal state
  
  // Alternative paths
  REJECTED: [],
  CANCELLED: [],
  FAILED: [],
};
```

**Key Assertion:** Once in OUTCOME_RECORDED state, only transition is to CLOSED. No transition back to EXECUTED.

**Business Rule Implicity:** Implies outcomes cannot be re-recorded (no path back to EXECUTED).

**Evidence Level:** ⭐⭐⭐ CODE DEFINITION (highly authoritative, no business rule citation)

---

#### Source 2: Outcome Recordability Validation

**File:** `/home/user/OPsIq/src/domain/decision-lifecycle.ts`

**Function: requireOutcomeRecordable (Lines 123-131):**
```typescript
/**
 * Verify decision is in a state where outcome can be recorded
 *
 * @throws {Error} If state does not allow outcome recording
 */
export function requireOutcomeRecordable(state: DecisionState): void {
  const outcomeRecordableStates: DecisionState[] = ["EXECUTED"];

  if (!outcomeRecordableStates.includes(state)) {
    throw new Error(
      `Decision must be EXECUTED before recording outcome, current state: ${state}`
    );
  }
}
```

**Key Assertion:** Outcomes can ONLY be recorded when state is exactly "EXECUTED".

**Enforcement:** Any other state (including "OUTCOME_RECORDED") causes error.

**Business Rule Implicity:** Implies once in OUTCOME_RECORDED state, outcomes cannot be re-recorded (state is no longer EXECUTED).

**Evidence Level:** ⭐⭐⭐ CODE DEFINITION (enforces immutability through state gate)

---

#### Source 3: Record Decision Outcome Implementation

**File:** `/home/user/OPsIq/src/services/decisions/decision-lifecycle.service.ts`

**Function: recordDecisionOutcome (Lines 313-421)**

**State Validation (Lines 335-343):**
```typescript
const currentState = mapStatusToState(decision.status);

// Verify decision is in state where outcome can be recorded
try {
  requireOutcomeRecordable(currentState);  // ← Calls the validation function
} catch (error) {
  const governed = classifyOperatorError(...);
  throw new ValidationError(governed.operatorMessage);
}
```

**State Transition (Line 383):**
```typescript
status: mapStateToStatus("OUTCOME_RECORDED"),  // ← Sets to OUTCOME_RECORDED after recording
```

**Key Assertion:** After outcome recording, status changes from EXECUTED to OUTCOME_RECORDED, making re-recording impossible.

**Flow Diagram:**
```
EXECUTED state
    ↓
recordDecisionOutcome() called
    ↓
requireOutcomeRecordable("EXECUTED") → PASS
    ↓
Update database, set status = "OUTCOME_RECORDED"
    ↓
Second recordDecisionOutcome() call
    ↓
requireOutcomeRecordable("OUTCOME_RECORDED") → FAIL
    ↓
ValidationError thrown: "Decision must be EXECUTED before recording outcome"
```

**Evidence Level:** ⭐⭐⭐ IMPLEMENTATION (confirms state machine enforcement)

---

#### Source 4: Test Expectation for Retroactive Modification

**File:** `/home/user/OPsIq/src/__tests__/p2b/decision-outcome-path.test.ts`

**Test: "should flag retroactive modifications" (Lines 281-308):**
```typescript
it("should flag retroactive modifications", async () => {
  // First record
  await recordDecisionOutcome(
    testDecisionId,
    testWorkspaceId,
    { actualOutcomeValue: 50000 },
    testActorId
  );

  // Second record with different value (retroactive modification)
  await recordDecisionOutcome(
    testDecisionId,
    testWorkspaceId,
    { actualOutcomeValue: 100000, outcomeNotes: "Correction" },
    testActorId
  );

  const decision = await db.operatorItem.findUnique({...});
  
  expect(decision?.verificationStatus).toBe("disputed");  // ← Line 307
});
```

**Test Expectation:** The second call SHOULD SUCCEED and detect fraud (retroactive modification).

**Test Reality:** The second call FAILS at requireOutcomeRecordable (state is now OUTCOME_RECORDED).

**Key Conflict:** Test expects modification to be allowed (with fraud detection), but code prevents modification entirely.

**Evidence Level:** ⭐⭐⭐ TEST INTENT (clearly shows expected behavior: modifications should be detectable)

---

#### Source 5: Fraud Risk Detection for Retroactive Modification

**File:** `/home/user/OPsIq/src/services/outcome/verification.ts`

**Fraud Indicator 4: Retroactive Modification (Lines 93-96):**
```typescript
// Indicator 4: Retroactive modification (changing an already-verified outcome)
if (previousActualOutcomeValue !== null && previousActualOutcomeValue !== actualOutcome) {
  indicators.push("Retroactive modification of outcome value");
  riskScore += 2;  // ← Worth 2 points (significant fraud risk)
}
```

**Function Signature (Line 64-67):**
```typescript
export function checkFraudRisk(
  actualOutcome: number,
  impactExpected: number,
  previousActualOutcomeValue: number | null  // ← Expects previous value to detect modification
): FraudRiskAssessment {
```

**Key Assertion:** Code CAN detect retroactive modifications IF the previous value is passed.

**Business Rule Implication:** The code is DESIGNED to handle modifications (via previousActualOutcomeValue parameter), but the state machine PREVENTS modifications from occurring.

**Evidence Level:** ⭐⭐⭐ CAPABILITY DEFINITION (system has fraud detection for modifications, but state prevents them)

---

#### Source 6: Decision Lifecycle Adversarial Testing

**File:** `/home/user/OPsIq/DECISION_LIFECYCLE_FINAL_VERDICT.md`

**Attack Vector 5: "Record Outcome Twice (Duplicate Outcome)" (Lines 72-82):**
```
### Attack Vector 5: Record Outcome Twice (Duplicate Outcome) ✅ REJECTED
**Attack**: Call `recordImpactWithGating()` twice on same decision  
**Expected Failure**: ConflictError indicating outcome already recorded  
**Result**: ✅ Failed correctly  
**Evidence**:
```
ConflictError: Duplicate outcome: Decision already has recorded outcome.
Cannot re-record after outcome is set.
```
**Root Cause**: recordImpactWithGating() checks `decision.actualOutcomeValue !== null` before allowing update
```

**Verdict on Duplicate Recording:** Documented as a SECURITY TEST that should be REJECTED.

**Caveat:** Uses `recordImpactWithGating()` (ROI recording), not `recordDecisionOutcome()` (outcome recording).

**Key Assertion:** System architecture documents that duplicate outcome recording is an "attack vector" that should be blocked.

**Evidence Level:** ⭐⭐ DESIGN INTENT (adversarial testing shows intent to prevent duplicates, but uses different function)

---

## TASK 2: State Transition Table

### Complete Outcome Recording State Machine

| Current State | Event | Allowed? | Next State | Enforcement | Source |
|---|---|---|---|---|---|
| DRAFT | recordDecisionOutcome() | ❌ NO | (unchanged) | requireOutcomeRecordable() throws | decision-lifecycle.ts:123-131 |
| SUBMITTED | recordDecisionOutcome() | ❌ NO | (unchanged) | requireOutcomeRecordable() throws | decision-lifecycle.ts:123-131 |
| APPROVED | recordDecisionOutcome() | ❌ NO | (unchanged) | requireOutcomeRecordable() throws | decision-lifecycle.ts:123-131 |
| **EXECUTED** | **recordDecisionOutcome()** | **✅ YES** | **OUTCOME_RECORDED** | requireOutcomeRecordable() passes | decision-lifecycle.ts:123-131 |
| **OUTCOME_RECORDED** | **recordDecisionOutcome()** | **❌ NO** | (unchanged) | requireOutcomeRecordable() throws: "Decision must be EXECUTED" | decision-lifecycle.ts:123-131 |
| CLOSED | recordDecisionOutcome() | ❌ NO | (unchanged) | requireOutcomeRecordable() throws | decision-lifecycle.ts:123-131 |
| REJECTED | recordDecisionOutcome() | ❌ NO | (unchanged) | requireOutcomeRecordable() throws | decision-lifecycle.ts:123-131 |
| CANCELLED | recordDecisionOutcome() | ❌ NO | (unchanged) | requireOutcomeRecordable() throws | decision-lifecycle.ts:123-131 |
| FAILED | recordDecisionOutcome() | ❌ NO | (unchanged) | requireOutcomeRecordable() throws | decision-lifecycle.ts:123-131 |

---

### Forbidden Transitions (Explicitly Blocked)

| Forbidden Transition | Blocking Function | Source File | Line |
|---|---|---|---|
| OUTCOME_RECORDED → EXECUTED | requireOutcomeRecordable() | decision-lifecycle.ts | 123 |
| OUTCOME_RECORDED → modify via recordDecisionOutcome() | requireOutcomeRecordable() + state check | decision-lifecycle.service.ts | 339 |
| (ANY STATE except EXECUTED) → record outcome | requireOutcomeRecordable() | decision-lifecycle.ts | 123 |

---

## TASK 3: Provenance Classification Analysis

### Question: Can outcomes be modified after recording?

**Code Evidence:** NO (state machine prevents it)  
**Test Evidence:** YES (test expects modification with fraud detection)  
**Business Rule Evidence:** MISSING (no documented rule)

### Classification Decision Process

#### Option A: PRODUCTION_DEFECT

**Argument:** 
- Repository design shows fraud detection capability for retroactive modifications (verification.ts:93-96)
- Test explicitly expects modification detection to work
- But state machine blocks any second recording attempt
- Therefore, code doesn't match design intent

**Counter-argument:**
- State machine is deliberately designed to prevent re-recording
- Attack Vector 5 documentation shows duplicate recording is a security threat
- No business requirement document says outcomes should be modifiable

**Verdict:** Cannot confirm PRODUCTION_DEFECT without business requirement stating modifications should be allowed

---

#### Option B: TEST_DEFECT

**Argument:**
- Test expects to call recordDecisionOutcome() twice
- State machine prevents this (by design)
- Test scenario violates the designed state transitions
- Test expectations don't match implementation

**Counter-argument:**
- Test name "should flag retroactive modifications" indicates business intent to detect modifications
- Fraud risk code exists specifically to detect modifications (not just document them)
- Why would code have this capability if modifications aren't supposed to happen?

**Verdict:** Cannot confirm TEST_DEFECT without understanding if modification detection is intentional

---

#### Option C: BUSINESS_RULE_MISSING

**Argument:**
- No document in repository defines: "Outcomes shall be immutable after recording"
- No document in repository defines: "Outcomes can be modified with fraud detection"
- State machine is implemented but no business requirement cites it
- Test expectations conflict with code behavior, but no rule resolves the conflict

**Counter-argument:**
- Code implementation IS the rule (state machine design)
- But code design is not explicitly justified by a business rule

**Verdict:** ✅ **BUSINESS_RULE_MISSING** is the correct classification

---

### Evidence Conflicts Documented

**Conflict 1: Fraud Detection Design vs State Machine Block**

| Source | Statement | Implication |
|---|---|---|
| verification.ts:93-96 | Fraud risk code detects retroactive modifications | Modifications expected to occur |
| decision-lifecycle.ts:56-57 | State machine: EXECUTED → OUTCOME_RECORDED (no return) | Modifications blocked by design |
| **Conflict** | Code can detect modifications, but state prevents them | ❓ INTENTIONAL or DEFECT? |

**Resolution Required:** Business rule defining outcome mutability policy

**Evidence:** No rule document found

---

**Conflict 2: Test Expectation vs Implementation Behavior**

| Source | Statement | Result |
|---|---|---|
| decision-outcome-path.test.ts:281-308 | Test: "should flag retroactive modifications" | Expects success on 2nd recording |
| decision-lifecycle.service.ts:339 | requireOutcomeRecordable(currentState) | 2nd call fails (state no longer EXECUTED) |
| **Conflict** | Test expects modification, code prevents it | ❌ TEST FAILS |

**Resolution Required:** Business rule clarifying whether outcomes are modifiable

**Evidence:** No rule document found

---

**Conflict 3: Attack Vector Testing vs Outcome Service Testing**

| Source | Statement | Context |
|---|---|---|
| DECISION_LIFECYCLE_FINAL_VERDICT.md:72-82 | "Record Outcome Twice" is a security attack that should fail | Testing recordImpactWithGating() (ROI recording) |
| decision-outcome-path.test.ts:281-308 | "should flag retroactive modifications" expects success | Testing recordDecisionOutcome() (outcome recording) |
| **Conflict** | Same concept (outcome recording twice), different functions, different expected behaviors | ❓ ARE THEY DIFFERENT INTENTIONALLY? |

**Evidence:** No document clarifies the intentional difference

---

## TASK 4: Direct Question Answer

### "Should a recorded outcome be editable?"

**Answer based on Repository Evidence:**

**According to Code Implementation:**
NO. Recorded outcomes are NOT editable.
- State machine: EXECUTED → OUTCOME_RECORDED (terminal for outcome recording)
- requireOutcomeRecordable() enforces: only EXECUTED state allows recording
- Once state changes to OUTCOME_RECORDED, no transition back to EXECUTED exists
- Second recordDecisionOutcome() call fails with: "Decision must be EXECUTED before recording outcome"

**According to Test Expectations:**
YES. Recorded outcomes SHOULD be editable.
- Test "should flag retroactive modifications" expects to record outcome twice
- Test expects second call to detect fraud and mark as "disputed"
- Test comment: "Second record with different value (retroactive modification)"
- This implies the system should ALLOW modification with FRAUD DETECTION

**According to Fraud Detection Capability:**
YES. System is DESIGNED to detect modifications.
- checkFraudRisk() has specific indicator for "Retroactive modification" (adds 2 points)
- Function parameter previousActualOutcomeValue suggests modifications are expected
- If modifications weren't expected, why have detection for them?

**According to Business Rules:**
UNDEFINED. No business rule document exists.
- No policy states: "Outcomes are immutable after recording"
- No policy states: "Outcomes can be amended with fraud detection"
- No requirement document clarifies the intended behavior
- No ADR discusses outcome modification scenarios

**Definitive Answer:** **The repository evidence is CONFLICTED.** 

Code implementation says: Immutable (no modifications allowed)  
Test expectations say: Mutable (modifications allowed with fraud detection)  
Business rules say: MISSING (no rule defines the policy)

---

## TASK 5: Final Provenance Report

### Classification Decision: BUSINESS_RULE_MISSING

**Confidence Level:** HIGH (95%+)

**Rationale:**
1. ✅ Repository evidence clearly shows implementation choice: immutable outcomes
2. ✅ Repository evidence clearly shows test expectation: mutable outcomes with fraud detection
3. ✅ Repository evidence clearly shows: NO business rule document exists
4. ❌ Cannot classify as PRODUCTION_DEFECT without rule saying outcomes should be mutable
5. ❌ Cannot classify as TEST_DEFECT without rule confirming outcomes should be immutable

**The core problem:** 
- The code makes a business decision (immutability) without documenting the business rule
- The test challenges this decision (expecting mutability) without citing a rule
- Neither code nor test cites any business requirement document
- Therefore, the missing artifact is: **the business rule defining outcome modification policy**

---

### What Evidence Says About Immutability

**Evidence SUPPORTING Immutability:**
1. State machine design: OUTCOME_RECORDED is terminal for recording (no return to EXECUTED)
2. Validation enforcement: requireOutcomeRecordable() blocks all non-EXECUTED states
3. Security test: DECISION_LIFECYCLE_FINAL_VERDICT.md treats duplicate recording as an attack
4. Production design: Post-recording state transition is unidirectional (→ CLOSED only)

**Evidence SUGGESTING Mutability:**
1. Fraud detection code: Specifically detects retroactive modifications (suggests they're possible)
2. Test expectation: "should flag retroactive modifications" implies they happen
3. Test architecture: Attempts to record twice with expectation of fraud flag (suggests designed for this)
4. Function design: captureOutcomeVerificationMetadata includes previousActualOutcomeValue parameter (suggests history tracking)

---

### Critical Finding: Capability Without Permission

The system **CAN** detect modifications (via fraud risk checking) but the state machine **PREVENTS** modifications from occurring.

This suggests:
- **Scenario A (TEST_CORRECT):** System was designed to allow modifications with fraud detection, but state machine implementation is incomplete (PRODUCTION_DEFECT)
- **Scenario B (CODE_CORRECT):** Modifications were intentionally blocked for integrity, but test expectations are aspirational (TEST_DEFECT)
- **Scenario C (NO_AUTHORITY):** Neither scenario is documented (BUSINESS_RULE_MISSING)

**Evidence supports Scenario C: BUSINESS_RULE_MISSING**

---

### Final Verdict

**Status: BUSINESS_RULE_MISSING** ✅

**The repository is missing:** A documented business rule defining whether outcomes may be modified after initial recording.

**Evidence Summary:**
- Code Implementation: Immutable outcomes (enforced by state machine)
- Test Expectation: Mutable outcomes (with fraud detection)
- Business Rule: NOT FOUND

**To Resolve Root Cause C, requires:**
1. Document the business policy: Are outcomes immutable or mutable?
2. If immutable: Confirm code is correct, update test expectations
3. If mutable: Modify state machine to allow OUTCOME_RECORDED → EXECUTED transition
4. If mutable with fraud detection: Ensure fraud detection flag applies to modifications

**Current Status:** Unresolved (no authoritative rule found)

