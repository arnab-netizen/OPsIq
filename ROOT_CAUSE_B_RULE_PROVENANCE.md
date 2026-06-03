# Root Cause B: Business Rule Provenance Audit

**Date:** 2026-06-03  
**Method:** Repository-wide search for fraud risk, variance threshold, and auto-flag rule definitions  
**Status:** Investigation complete

---

## TASK 1: Statements Defining Verification Status States

### Where "disputed" Status Is Documented

#### Source 1: P2B_VERIFICATION_LIFECYCLE.md (Lines 8-25)

**File:** `/home/user/OPsIq/P2B_VERIFICATION_LIFECYCLE.md`

```markdown
## State Transitions

### Possible verificationStatus States

From Schema Contract:
  "unverified" → "verified" → "disputed"

### Transition Map

| From State | To State | Mechanism | Status |
|-----------|---------|-----------|--------|
| (initial) | "unverified" | Database default | ✓ Implemented |
| "unverified" | "verified" | ??? | ❌ MISSING |
| "unverified" | "disputed" | Fraud detection | ✓ Implemented |
| "verified" | "disputed" | ??? | ❓ Unknown |
| "disputed" | "verified" | ??? | ❓ Unknown |
```

**Key Assertion:** Line 23 states transition "unverified" → "disputed" is via "Fraud detection"

**Rule Definition:** IMPLICIT ONLY (fraud detection mechanism not explicitly defined)

---

#### Source 2: P2B_VERIFICATION_LIFECYCLE.md (Lines 42-43)

**File:** `/home/user/OPsIq/P2B_VERIFICATION_LIFECYCLE.md`

```typescript
// Location: verification.ts:150
fraudRisk.riskLevel === "high" → "flagged" (maps to "disputed")
```

**Key Assertion:** When `fraudRisk.riskLevel === "high"`, status becomes "disputed"

**Rule Definition:** IMPLICIT ONLY (what makes riskLevel "high" is not defined here)

---

#### Source 3: P2B_B1_DECISION.md (Lines 33-46)

**File:** `/home/user/OPsIq/P2B_B1_DECISION.md`

```
| P2B Intent | Contract Value | Semantics |
|-----------|--------|-----------|
| Fraud risk = high | "disputed" | Suspicious, requires review |
| Fraud risk = low/medium | "unverified" | Normal, awaiting verification |
| Admin approval | "verified" | Manually confirmed |
```

**Key Assertion:** "Fraud risk = high" maps to "disputed"

**Definition of "disputed"** (Lines 101-106):
```
"disputed" is Semantically Correct
Definition of "disputed":
> Marked as suspicious or conflicting; requires additional review

P2B "flagged" intent:
> Outcome has high fraud risk; requires additional review
```

**Rule Definition:** SEMANTIC MAPPING ONLY (no threshold values defined)

---

#### Source 4: src/services/outcome/verification.ts (Line 150)

**File:** `/home/user/OPsIq/src/services/outcome/verification.ts`

```typescript
// Line 149-150
// Mark as disputed if fraud risk is high (contract-compliant state)
const verificationStatus = fraudRisk.riskLevel === "high" ? "disputed" : "unverified";
```

**Key Assertion:** Only riskLevel === "high" triggers "disputed"

**Comment References:** "contract-compliant state" (refers to the enum contract, not a business rule)

**Rule Definition:** ALGORITHMIC ONLY (no business rule cited)

---

## TASK 2: Statements Defining Fraud Thresholds and Variance Rules

### Search Result: NO BUSINESS RULE DOCUMENT FOUND

**Search Targets:** fraud thresholds, variance thresholds, auto-flag rules, risk scoring rules

**Locations Searched:**
- `/home/user/OPsIq/execution.md` — General execution contract, no fraud rules
- `/home/user/OPsIq/docs/*.md` — 30 operational documents, no fraud thresholds
- ADR files — `v72-adr-ultimate-business-decision-engine.md`, no fraud risk scoring
- P2B implementation contracts — No business rule definitions
- Inline code comments — Only explain algorithm, not the business rationale

---

### Fraud Scoring Algorithm (From verification.ts Lines 63-112)

**This is the ONLY authoritative source of fraud thresholds in the codebase:**

```typescript
// src/services/outcome/verification.ts:63-112
export function checkFraudRisk(
  actualOutcome: number,
  impactExpected: number,
  previousActualOutcomeValue: number | null
): FraudRiskAssessment {
  const indicators: string[] = [];
  let riskScore = 0;

  // Indicator 1: Exact match (Lines 72-75)
  if (impactExpected > 0 && actualOutcome === impactExpected) {
    indicators.push("Outcome exactly matches expected (suspiciously precise)");
    riskScore += 1;
  }

  // Indicator 2: Round numbers (Lines 78-81)
  if (actualOutcome > 0 && actualOutcome % 100000 === 0) {
    indicators.push("Round number outcome (may indicate estimation rather than measurement)");
    riskScore += 0.5;
  }

  // Indicator 3: Extreme variance from expected (Lines 84-90)
  if (impactExpected > 0) {
    const variance = Math.abs(actualOutcome - impactExpected) / impactExpected;
    if (variance > 5) {  // ← THRESHOLD: variance > 500%
      indicators.push("Extreme variance from expected (>500%)");
      riskScore += 1;
    }
  }

  // Indicator 4: Retroactive modification (Lines 93-96)
  if (previousActualOutcomeValue !== null && previousActualOutcomeValue !== actualOutcome) {
    indicators.push("Retroactive modification of outcome value");
    riskScore += 2;
  }

  // Indicator 5: Very high impact (Lines 99-102)
  if (actualOutcome > 1000000 && impactExpected > 1000000) {
    indicators.push("High-impact outcome claimed");
    riskScore += 0.5;
  }

  // Risk level determination (Lines 104-105)
  const riskLevel: "low" | "medium" | "high" =
    riskScore >= 2.5 ? "high" : riskScore >= 1.5 ? "medium" : "low";

  return {
    riskLevel,
    indicators,
    confidence: Math.min(riskScore / 3, 1),
  };
}
```

**Thresholds Found (No Business Rule Citations):**
- Variance threshold: `> 5` (>500%) — Line 86
- "High" risk threshold: `riskScore >= 2.5` — Line 105
- Indicator point values: 1, 0.5, 1, 2, 0.5 — Lines 74, 80, 88, 95, 101
- No comments explaining WHY these thresholds exist
- No citations to business requirements
- No linked ADR or contract

---

### Test Expectations (From decision-outcome-path.test.ts)

**File:** `/home/user/OPsIq/src/__tests__/p2b/decision-outcome-path.test.ts`

#### Test #1 (Line 243)

```typescript
// Line 243: Test name
it("should auto-flag when variance exceeds 500%", async () => {
  // Line 244: Comment
  // 500% variance = actualOutcome 6x expected
  
  // Lines 249-250: Test setup
  actualOutcomeValue: 300000,
  outcomeNotes: "Exceptional",
  
  // Line 260: Assertion
  expect(decision?.verificationStatus).toBe("disputed");
});
```

**Test Expectation:** 500% variance should result in "disputed" status

**Source of This Rule:** TEST ONLY (no cited business requirement)

**Mathematical Check:**
- Test uses actualOutcomeValue = 300000
- impactExpected = 50000 (from beforeEach, line 32)
- variance = (300000 - 50000) / 50000 = 5.0 (exactly 500%)
- Code checks: `if (variance > 5)` — 5.0 does NOT trigger
- Result: riskScore = 0.5 → riskLevel = "low" → verificationStatus = "unverified"
- Test expects: "disputed"
- **MISMATCH** ❌

---

#### Test #2 (Line 160)

```typescript
// Line 160: Test name
it("should accept uncertain with outcomeNotes and auto-flag", async () => {
  // Lines 165-166: Test setup
  actualOutcomeValue: 250000,
  outcomeNotes: "Exceptional result",
  
  // Line 176: Assertion
  expect(updated?.verificationStatus).toBe("disputed");
});
```

**Test Expectation:** 400% variance (250K / 50K) should result in "disputed" status

**Source of This Rule:** TEST ONLY (no cited business requirement)

**Mathematical Check:**
- Test uses actualOutcomeValue = 250000
- impactExpected = 50000 (from beforeEach, line 32)
- variance = (250000 - 50000) / 50000 = 4.0 (exactly 400%)
- Code checks: `if (variance > 5)` — 4.0 does NOT trigger
- Result: riskScore = 0 → riskLevel = "low" → verificationStatus = "unverified"
- Test expects: "disputed"
- **MISMATCH** ❌

---

## TASK 3: Evidence Analysis for Classification

### Question: Does Repository Evidence Support PRODUCTION_DEFECT, TEST_DEFECT, or BUSINESS_RULE_MISSING?

### Evidence Summary Table

| Artifact | Type | Location | States |
|----------|------|----------|--------|
| **Fraud thresholds** | CODE | verification.ts:63-112 | Variance > 5, riskScore >= 2.5, 5 indicators with specific weights |
| **Business rule for thresholds** | DOCUMENT | SEARCH: NOT FOUND | ❌ No business rule document |
| **Test expectations** | TEST | decision-outcome-path.test.ts:243, 160 | Expects 400-500% variance → "disputed" |
| **Test expectations source** | CITATION | None | ❌ No cited business rule |
| **Code comments** | COMMENT | verification.ts:150 | "contract-compliant state" (refers to mapping contract only) |
| **Mapping contract** | DOCUMENT | P2B_B1_DECISION.md | Defines "disputed" semantics, not thresholds |

---

### Critical Finding: Absence of Business Rule

**Search Query Results:**

1. **Search for "fraud risk" + "rule":**
   - Results: Code implementation only
   - No business rule document found

2. **Search for "variance" + "threshold":**
   - Results: Code threshold (variance > 5) only
   - No business rule justifying the threshold

3. **Search for "auto-flag" + "requirement":**
   - Results: Test expectations only
   - No requirements document

4. **Search for "riskScore" + "specification":**
   - Results: Code algorithm only
   - No specification document

5. **Search for "2.5" (the "high" risk threshold):**
   - Results: Code value only (line 105)
   - No cited requirement

---

### What EXISTS in the Codebase

**Code-Level Definition:**
- ✅ Fraud scoring algorithm (lines 63-112)
- ✅ Verification status mapping (line 150)
- ✅ Test expectations (lines 243, 160, 176)

**Business-Level Documentation:**
- ❌ No business rule: "outcomes with > X% variance should auto-flag as disputed"
- ❌ No specification: "fraud risk scoring thresholds are riskScore >= 2.5 for 'high'"
- ❌ No requirement: "extreme variance is defined as > 500%"
- ❌ No ADR explaining WHY these thresholds were chosen
- ❌ No traced decision linking thresholds to business impact

---

### What Tests EXPECT vs What Code DOES

**Test #1: "should auto-flag when variance exceeds 500%"**

| Expectation | Reality | Match |
|---|---|---|
| Input: 300K / 50K expected | Code calculates: variance = 5.0 | ✓ Correct |
| Variance > 500% (the test claim) | Code checks: variance > 5.0 | ✗ Boundary failure |
| Result should be: "disputed" | Code produces: "unverified" | ❌ MISMATCH |
| Reason: high fraud risk | Reason in code: none (no rule cited) | ❌ NO RULE |

**Test #2: "should accept uncertain with outcomeNotes and auto-flag"**

| Expectation | Reality | Match |
|---|---|---|
| Input: 250K / 50K expected | Code calculates: variance = 4.0 | ✓ Correct |
| Variance > 400% should flag | Code checks: variance > 5.0 | ✗ Below threshold |
| Result should be: "disputed" | Code produces: "unverified" | ❌ MISMATCH |
| Reason: high fraud risk | Reason in code: none (no rule cited) | ❌ NO RULE |

---

## TASK 4: Classification Determination

### Classification: BUSINESS_RULE_MISSING

**Evidence:**

1. **No Authoritative Business Rule Document**
   - No file in `/home/user/OPsIq/docs/` or `/home/user/OPsIq/*.md` states:
     - "Outcomes with > X% variance should flag as disputed"
     - "Fraud risk scoring uses points system with threshold of Y"
     - "These are the indicators and their weights for fraud detection"

2. **Code Contains Algorithm Without Justification**
   - verification.ts:63-112 implements specific thresholds (variance > 5, riskScore >= 2.5)
   - No inline comments explain business rationale
   - No comments reference any requirement or ADR

3. **Tests Expect One Rule, Code Implements Another**
   - Tests expect: 400-500% variance → "disputed"
   - Code provides: variance > 500% AND no other indicators → "unverified"
   - No documented business rule resolving this conflict

4. **Mapping Contract Exists, Business Rule Contract Does Not**
   - P2B_B1_DECISION.md defines "disputed" semantic mapping (contract compliance)
   - No document defines when outcomes should be considered "disputed" (business rule)
   - Comment at verification.ts:150 says "contract-compliant" but references mapping, not business rules

5. **Tests Are Aspirational, Not Normative**
   - Test names express intent: "should auto-flag when variance exceeds 500%"
   - Tests do not cite a business requirement or ADR
   - Test expectations conflict with code thresholds
   - This indicates tests were written with HOPED behavior, not documented behavior

---

## Why NOT PRODUCTION_DEFECT

**Argument against PRODUCTION_DEFECT:**
- Code implementation is mathematically consistent
- Fraud thresholds are deliberately conservative
- Would require explicit business requirement to change

**However:**
- From business perspective, 5x variance IS extremely suspicious
- Should warrant manual review (disputed status)
- Conservative thresholds might be intentional (lower false-positive rate)
- Without a business rule, we cannot say the implementation is WRONG

---

## Why NOT TEST_DEFECT

**Argument against TEST_DEFECT:**
- Tests have clear business intent: flag high-variance outcomes
- 400-500% variance is objectively extreme
- Makes sense from fraud detection perspective to auto-flag

**However:**
- No cited business requirement supporting test expectations
- Tests might be speculative about what SHOULD happen
- Tests might be incorrect predictions of business needs

---

## Why BUSINESS_RULE_MISSING

**This classification is correct because:**

1. **The core question is unanswered:**
   - "Should outcomes with 400-500% variance auto-flag as disputed?"
   - Answer in code: NO (requires multiple indicators)
   - Answer in tests: YES (explicit expectation)
   - Answer in business rules: NOT FOUND

2. **No artifact in repository defines:**
   - When fraud detection should trigger
   - What constitutes "high risk"
   - Why the current thresholds exist
   - Why tests expect different behavior

3. **The resolution requires:**
   - Business decision: Should 400-500% variance trigger disputed status?
   - Business rule document: Define fraud risk assessment criteria
   - Alignment: Either update code OR update tests based on rule

4. **No single authority exists to resolve the conflict:**
   - Code authority: Doesn't cite business rule
   - Test authority: Doesn't cite business rule
   - Comment authority: References mapping contract, not business rule
   - Organization: No documented fraud risk policy

---

## FINAL DETERMINATION

### Status: BUSINESS_RULE_MISSING ✓

**The repository contains:**
- ✅ An implementation (fraud risk scoring algorithm)
- ✅ Expectations (tests expressing desired behavior)
- ❌ **NO business rule document that defines:**
  - When outcomes should be disputed
  - What fraud thresholds are appropriate
  - Why the current code implements the thresholds it does
  - Whether tests' expectations align with business intent

**To resolve Root Cause B, requires:**
1. Document the business rule: Define fraud risk criteria
2. Decide: Should 400-500% variance auto-flag as disputed?
3. Align: Update code OR tests based on documented rule
4. Verify: All tests pass with rule-compliant implementation

**Evidence Status:**
- PRODUCTION_DEFECT: ❌ Cannot confirm (no business rule to violate)
- TEST_DEFECT: ❌ Cannot confirm (no business rule to reference)
- BUSINESS_RULE_MISSING: ✅ **CONFIRMED** (no rule document found after exhaustive search)

