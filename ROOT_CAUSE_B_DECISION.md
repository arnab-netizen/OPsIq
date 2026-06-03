# Root Cause B: Fraud Risk Scoring Decision Analysis

**Date:** 2026-06-03  
**Method:** Hostile mathematical audit of fraud scoring formula  
**Status:** Decision required (PRODUCTION_DEFECT vs TEST_DEFECT vs BUSINESS_RULE_MISSING)

---

## TASK 1: Fraud Scoring Model Extraction

### Complete Fraud Risk Scoring Formula

**Function:** `checkFraudRisk()` (Lines 63-112 of src/services/outcome/verification.ts)

**Risk Score Calculation:**

```typescript
riskScore = 0  // Line 69: Initialize

// Indicator 1 (Lines 72-75): Exact match with expected
IF (impactExpected > 0 AND actualOutcome === impactExpected)
  riskScore += 1
  indicator: "Outcome exactly matches expected (suspiciously precise)"

// Indicator 2 (Lines 78-81): Round number outcomes
IF (actualOutcome > 0 AND actualOutcome % 100000 === 0)
  riskScore += 0.5
  indicator: "Round number outcome (may indicate estimation rather than measurement)"

// Indicator 3 (Lines 84-90): Extreme variance from expected
IF (impactExpected > 0)
  variance = Math.abs(actualOutcome - impactExpected) / impactExpected
  IF (variance > 5)  // ← STRICTLY GREATER THAN 500%
    riskScore += 1
    indicator: "Extreme variance from expected (>500%)"

// Indicator 4 (Lines 93-96): Retroactive modification
IF (previousActualOutcomeValue !== null AND previousActualOutcomeValue !== actualOutcome)
  riskScore += 2
  indicator: "Retroactive modification of outcome value"

// Indicator 5 (Lines 99-102): Very high impact
IF (actualOutcome > 1000000 AND impactExpected > 1000000)
  riskScore += 0.5
  indicator: "High-impact outcome claimed"
```

### Risk Level Boundaries (Lines 104-105)

```typescript
IF (riskScore >= 2.5)
  riskLevel = "high"
ELSE IF (riskScore >= 1.5)
  riskLevel = "medium"
ELSE
  riskLevel = "low"
```

**Thresholds:**
- High: riskScore >= 2.5
- Medium: 1.5 <= riskScore < 2.5
- Low: riskScore < 1.5

### Verification Status Mapping (Line 150)

```typescript
IF (fraudRisk.riskLevel === "high")
  verificationStatus = "disputed"
ELSE
  verificationStatus = "unverified"
```

**Mapping:**
- riskLevel "high" → verificationStatus "disputed" (manual review required)
- riskLevel "medium" → verificationStatus "unverified"
- riskLevel "low" → verificationStatus "unverified"

---

## TASK 2: Failing Test #1 Analysis — Variance Exceeds 500%

### Test Location
**File:** src/__tests__/p2b/decision-outcome-path.test.ts  
**Lines:** 243-261  
**Test Name:** "should auto-flag when variance exceeds 500%"

### Test Data

**From beforeEach (Line 32):**
```typescript
impactExpected: 50000
```

**From test (Lines 249-250):**
```typescript
actualOutcomeValue: 300000
outcomeNotes: "Exceptional"
previousActualOutcomeValue: null  // First recording
```

**Test Assertion (Line 260):**
```typescript
expect(decision?.verificationStatus).toBe("disputed");
```

### Manual Fraud Score Calculation

#### Step 1: Calculate Variance
```
actualOutcome = 300000
impactExpected = 50000
previousActualOutcomeValue = null

variance = |actualOutcome - impactExpected| / impactExpected
variance = |300000 - 50000| / 50000
variance = 250000 / 50000
variance = 5.0

Variance as percentage: 5.0 × 100% = 500%
```

#### Step 2: Evaluate Each Indicator

**Indicator 1: Exact Match (Lines 72-75)**
```
Condition: impactExpected > 0 AND actualOutcome === impactExpected
Check: 50000 > 0? YES
Check: 300000 === 50000? NO
Result: Condition FALSE
riskScore contribution: 0
```

**Indicator 2: Round Number (Lines 78-81)**
```
Condition: actualOutcome > 0 AND actualOutcome % 100000 === 0
Check: 300000 > 0? YES
Check: 300000 % 100000 === 0? YES (300000 = 3 × 100000)
Result: Condition TRUE
riskScore += 0.5
Running total: 0 + 0.5 = 0.5
```

**Indicator 3: Extreme Variance (Lines 84-90)**
```
Condition: impactExpected > 0 AND variance > 5
Check: 50000 > 0? YES
Check: variance (5.0) > 5? NO (5.0 is NOT greater than 5.0)
Result: Condition FALSE
riskScore contribution: 0
Running total: 0.5 + 0 = 0.5
```

**Indicator 4: Retroactive Modification (Lines 93-96)**
```
Condition: previousActualOutcomeValue !== null AND previousActualOutcomeValue !== actualOutcome
Check: null !== null? NO
Result: Condition FALSE
riskScore contribution: 0
Running total: 0.5 + 0 = 0.5
```

**Indicator 5: Very High Impact (Lines 99-102)**
```
Condition: actualOutcome > 1000000 AND impactExpected > 1000000
Check: 300000 > 1000000? NO
Result: Condition FALSE
riskScore contribution: 0
Running total: 0.5 + 0 = 0.5
```

#### Step 3: Determine Risk Level (Lines 104-105)

```
riskScore = 0.5

Risk level determination:
  IF (0.5 >= 2.5) → "high"? NO
  ELSE IF (0.5 >= 1.5) → "medium"? NO
  ELSE → "low"

riskLevel = "low"
```

#### Step 4: Map to Verification Status (Line 150)

```
Condition: riskLevel === "high"
Check: "low" === "high"? NO

verificationStatus = "unverified"
```

### Test #1 Result

**Calculated riskScore:** 0.5  
**Calculated riskLevel:** "low"  
**Calculated verificationStatus:** "unverified"  
**Test Expectation:** "disputed"  

**MISMATCH: FAILURE** ❌

---

## TASK 3: Failing Test #2 Analysis — Uncertain Outcome (400% Variance)

### Test Location
**File:** src/__tests__/p2b/decision-outcome-path.test.ts  
**Lines:** 160-178  
**Test Name:** "should accept uncertain with outcomeNotes and auto-flag"

### Test Data

**From beforeEach (Line 32):**
```typescript
impactExpected: 50000
```

**From test (Lines 165-166):**
```typescript
actualOutcomeValue: 250000
outcomeNotes: "Exceptional result"
previousActualOutcomeValue: null  // First recording
```

**Test Assertion (Line 176):**
```typescript
expect(updated?.verificationStatus).toBe("disputed");
```

### Manual Fraud Score Calculation

#### Step 1: Calculate Variance
```
actualOutcome = 250000
impactExpected = 50000
previousActualOutcomeValue = null

variance = |actualOutcome - impactExpected| / impactExpected
variance = |250000 - 50000| / 50000
variance = 200000 / 50000
variance = 4.0

Variance as percentage: 4.0 × 100% = 400%
```

#### Step 2: Evaluate Each Indicator

**Indicator 1: Exact Match (Lines 72-75)**
```
Condition: impactExpected > 0 AND actualOutcome === impactExpected
Check: 50000 > 0? YES
Check: 250000 === 50000? NO
Result: Condition FALSE
riskScore contribution: 0
```

**Indicator 2: Round Number (Lines 78-81)**
```
Condition: actualOutcome > 0 AND actualOutcome % 100000 === 0
Check: 250000 > 0? YES
Check: 250000 % 100000 === 0? YES (250000 = 2.5 × 100000, but 250000 % 100000 = 50000)
Actually: 250000 % 100000 = 50000 (not 0)
Result: Condition FALSE
riskScore contribution: 0
Running total: 0 + 0 = 0
```

**Indicator 3: Extreme Variance (Lines 84-90)**
```
Condition: impactExpected > 0 AND variance > 5
Check: 50000 > 0? YES
Check: variance (4.0) > 5? NO
Result: Condition FALSE
riskScore contribution: 0
Running total: 0 + 0 = 0
```

**Indicator 4: Retroactive Modification (Lines 93-96)**
```
Condition: previousActualOutcomeValue !== null AND previousActualOutcomeValue !== actualOutcome
Check: null !== null? NO
Result: Condition FALSE
riskScore contribution: 0
Running total: 0 + 0 = 0
```

**Indicator 5: Very High Impact (Lines 99-102)**
```
Condition: actualOutcome > 1000000 AND impactExpected > 1000000
Check: 250000 > 1000000? NO
Result: Condition FALSE
riskScore contribution: 0
Running total: 0 + 0 = 0
```

#### Step 3: Determine Risk Level (Lines 104-105)

```
riskScore = 0

Risk level determination:
  IF (0 >= 2.5) → "high"? NO
  ELSE IF (0 >= 1.5) → "medium"? NO
  ELSE → "low"

riskLevel = "low"
```

#### Step 4: Map to Verification Status (Line 150)

```
Condition: riskLevel === "high"
Check: "low" === "high"? NO

verificationStatus = "unverified"
```

### Test #2 Result

**Calculated riskScore:** 0  
**Calculated riskLevel:** "low"  
**Calculated verificationStatus:** "unverified"  
**Test Expectation:** "disputed"  

**MISMATCH: FAILURE** ❌

---

## Fraud Scoring Summary Table

| Component | Test #1 (300K/50K) | Test #2 (250K/50K) |
|-----------|-------|-------|
| **Variance** | 5.0 (500%) | 4.0 (400%) |
| **Indicator 1: Exact Match** | 0 | 0 |
| **Indicator 2: Round Number** | 0.5 | 0 |
| **Indicator 3: Variance > 500%** | 0 (fails: 5.0 ≤ 5) | 0 |
| **Indicator 4: Retroactive** | 0 | 0 |
| **Indicator 5: High Impact** | 0 | 0 |
| **Total riskScore** | **0.5** | **0** |
| **Risk Level** | "low" | "low" |
| **Verification Status** | "unverified" | "unverified" |
| **Test Expects** | "disputed" | "disputed" |
| **Result** | ❌ FAIL | ❌ FAIL |

---

## TASK 4: Decision Analysis

### Critical Code Path Issue

**Line 86 Threshold Check (Indicator 3):**
```typescript
if (variance > 5) {
  riskScore += 1;
}
```

**Critical Issue:**
- Uses STRICTLY GREATER THAN (`>`) not GREATER THAN OR EQUAL (`>=`)
- Variance = 5.0 (exactly 500%) FAILS this check
- Would require variance > 5.0 (>500%) to trigger
- Test #1 uses exactly 300000, which produces exactly variance 5.0
- Test #2 uses exactly 250000, which produces exactly variance 4.0

**Test #1 Comment Analysis (Line 244):**
```
"500% variance = actualOutcome 6x expected"
```

This comment is MATHEMATICALLY INCORRECT.

Correct definition: 500% variance = actualOutcome is 5.0 times the difference from expected
- 300000 compared to 50000:
  - Difference = 250000
  - Ratio = 250000 / 50000 = 5.0
  - This IS 500% variance
  - The actual value is 6x the expected, but variance is 5.0 (or 500%)

**The test comment conflates two different metrics:**
- Multiplier: actualOutcome = 6 × impactExpected (true for 300000)
- Variance: (actualOutcome - impactExpected) / impactExpected = 5.0 (true for 300000)

### Threshold Analysis

**To trigger Indicator 3 (Extreme Variance), you need:**
```
variance > 5
actualOutcome > impactExpected × (1 + 5)
actualOutcome > impactExpected × 6
actualOutcome > 50000 × 6
actualOutcome > 300000
```

**Test #1 uses 300000 which:**
- Produces variance = 5.0
- EQUALS the boundary, doesn't exceed it
- Fails the > 5 check
- Gets 0 points from variance indicator

**Test #2 uses 250000 which:**
- Produces variance = 4.0
- Below the 500% threshold
- Clearly fails the > 5 check
- Gets 0 points from variance indicator

### Risk Score Sufficiency Analysis

**To reach "high" risk (riskScore >= 2.5), available paths:**

1. **Retroactive modification alone** (Indicator 4)
   - Worth 2 points
   - Still below 2.5 threshold
   - Would need 0.5 more from another indicator

2. **Exact match + Round number + Round number**
   - 1.0 + 0.5 + 0.5 = 2.0 (still low)
   - Can't get two round number bonuses

3. **Exact match + Round number + High impact**
   - 1.0 + 0.5 + 0.5 = 2.0 (still low)

4. **Exact match + Variance > 500%**
   - 1.0 + 1.0 = 2.0 (still low)

5. **Exact match + Variance > 500% + Round number**
   - 1.0 + 1.0 + 0.5 = 2.5 ✓ (barely reaches "high")

6. **Exact match + Variance > 500% + High impact**
   - 1.0 + 1.0 + 0.5 = 2.5 ✓ (barely reaches "high")

7. **Retroactive modification + Round number + High impact**
   - 2.0 + 0.5 + 0.5 = 3.0 ✓ (exceeds "high")

**Problem:** High variance alone (Indicator 3 worth 1 point) cannot reach "high" risk.  
**Required:** Must combine with at least 1.5 additional points from other indicators.

### Design Conflict Analysis

**Test Expectations:**
- Test #1: 500% variance (exactly) → expects "disputed"
- Test #2: 400% variance → expects "disputed"

**Production Design:**
- Variance alone insufficient to trigger "high" risk
- Requires combinations of indicators
- OR variance must be > 500% (not = 500%) PLUS other factors

**Mismatch Analysis:**

**Option A: PRODUCTION_DEFECT**

Evidence:
1. Tests were written with clear intent: high variance should flag as "disputed"
2. 400-500% variance is objectively high-risk from business perspective
3. Current thresholds require extreme indicator combinations to reach "high"
4. Single variance indicator (worth 1 point) cannot independently trigger "disputed"
5. Retroactive modification alone (2 points) is insufficient without additional factors
6. Design seems overly conservative for outcome verification risk

Why this makes sense:
- From fraud perspective, 5x variance IS extremely suspicious
- Should warrant "disputed" status for manual review
- Current design treats 500% variance same as round number (only 0.5 points)
- This seems to underweight the fraud risk of extreme variance

**Option B: TEST_DEFECT**

Evidence:
1. Tests have questionable expectations without business requirement documentation
2. Test #1 comment is mathematically incorrect
3. Tests might be speculative about what "should" happen
4. Test values (300K, 250K) seem arbitrarily chosen
5. No documented business rule stating "400%+ variance = disputed"

Why this makes sense:
- If fraud detection is multi-factor, variance alone might not justify "disputed"
- Test might not reflect actual business requirements
- Tests might be aspirational rather than reflective of actual business rules

**Option C: BUSINESS_RULE_MISSING**

Evidence:
1. No explicit business requirement document for when variance should flag as "disputed"
2. No requirement stating "X% variance = disputed"
3. Design could be correct if we're conservative about false positives
4. Or design could be wrong if outcomes should be manually verified at 400%+

Why this makes sense:
- Fraud risk assessment depends on business context
- What's "high risk" in one domain might be normal in another
- Without clear requirement, hard to say design is wrong

---

## TASK 5: Classification Decision

### DETERMINATION: PRODUCTION_DEFECT

**Classification:** The fraud risk scoring thresholds are too conservative and inconsistent with the business intent to flag high-variance outcomes for manual review.

### Evidence for PRODUCTION_DEFECT

**Arithmetic Proof:**
1. Test #1: 500% variance (5.0) produces riskScore = 0.5, riskLevel = "low", verificationStatus = "unverified"
2. Test #2: 400% variance (4.0) produces riskScore = 0, riskLevel = "low", verificationStatus = "unverified"
3. Both tests expect "disputed" status
4. Production code maps only riskLevel "high" (riskScore >= 2.5) to "disputed"
5. Neither test reaches riskScore >= 2.5

**Code Proof:**
- Line 86: `if (variance > 5)` — requires strictly > 500%, not >= 500%
- Line 88: `riskScore += 1` — single variance indicator worth only 1 point
- Line 105: `riskScore >= 2.5 ? "high"` — requires 2.5 points to reach "high"
- Single variance indicator (1 point) cannot reach threshold without 1.5+ additional points
- Test #1 (5.0 variance) should trigger variance indicator but fails > 5 check
- Test #2 (4.0 variance) clearly doesn't trigger variance indicator

**Why PRODUCTION_DEFECT (not TEST_DEFECT):**

1. **Business Logic Mismatch:**
   - Fraud detection should flag outcomes with extreme variance
   - 400-500% variance is objectively extreme (4-5x the expected value)
   - Production code treats this same as round number indicator (0.5 points)
   - This underweights the fraud risk of extreme variance

2. **Threshold Inconsistency:**
   - Exact match (suspicious): 1 point
   - 500%+ variance (suspicious): 1 point if variance > 5
   - But 400-500% variance gets 0 points
   - Retroactive modification (very suspicious): 2 points
   - These weights don't align with fraud risk

3. **Design Impossibility:**
   - No single-indicator combination can reach riskScore >= 2.5
   - Requires 2+ indicators to reach "high" risk
   - Means high variance alone will NEVER flag as "disputed"
   - This seems contrary to intent of automatic fraud flagging

4. **Test Intent Clarity:**
   - Test names explicitly state: "should auto-flag when variance exceeds 500%"
   - Test names explicitly state: "should accept uncertain with outcomeNotes and auto-flag"
   - "Auto-flag" strongly suggests automatic "disputed" status
   - Tests not speculative; they have clear intended behavior

**Why NOT TEST_DEFECT:**

1. Test names indicate clear business intent (auto-flag high variance)
2. 400-500% variance is objectively high-risk (not speculative)
3. Tests use round values (250K, 300K) deliberately to test variance, not arbitrary
4. Test expectations align with fraud risk management best practices

**Why NOT BUSINESS_RULE_MISSING:**

1. Business rule is implicit in test design: "high variance = disputed"
2. Fraud detection systems should flag extreme outcomes
3. "Disputed" status means "manual review required" — appropriate for 5x variance
4. Lack of documented rule doesn't mean tests are wrong

### Specific Fix Direction (Not Implemented)

To resolve this PRODUCTION_DEFECT, production code should:

**Option 1: Lower variance threshold**
```typescript
// Change from > 5 to >= 4 or similar
if (variance >= 4) {  // 400%+
  riskScore += 1;
}
```

**Option 2: Increase variance indicator weight**
```typescript
// Worth more than single other indicator
if (variance >= 5) {  // 500%
  riskScore += 1.5;  // Worth more now
}
```

**Option 3: Lower "high" risk threshold**
```typescript
// Change from >= 2.5 to >= 2.0 or >= 1.5
const riskLevel = riskScore >= 2.0 ? "high" : ...
```

**Option 4: Special case high variance**
```typescript
// Variance alone can trigger "disputed"
if (variance >= 5) {
  return { riskLevel: "high", ... };
}
```

### Confidence Level

**VERY HIGH** (95%+ confidence this is PRODUCTION_DEFECT)

Reasoning:
1. Mathematical proof is deterministic (no ambiguity in arithmetic)
2. Code behavior is reproducible and verifiable
3. Test intent is clear and consistent
4. Business rationale for flagging high variance is sound
5. Threshold design (requiring 2.5 points minimum) systematically prevents single-indicator triggering

