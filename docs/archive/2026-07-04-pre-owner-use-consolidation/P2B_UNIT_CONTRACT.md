# P2B_UNIT_CONTRACT.md

**Outcome Field Unit Assumptions**  
**Requirement:** Document all unit assumptions for numeric fields  
**No code changes**

---

## Problem Statement

The classifier performs arithmetic on two fields without unit validation:

```typescript
// verification.ts:53
const variance = Math.abs(actualOutcomeValue - impactExpected) / impactExpected
```

**Question:** What units are these values in?

**Risk:** If units don't match, classification is silent-fail incorrect.

**Example:**
```
Stored impactExpected: 50000 (USD cents)
Request actualOutcome: 50000 (USD dollars, 100x larger)
Math: (50000 - 50000) / 50000 = 0 → Classifies as failure (WRONG!)
```

---

## Field Documentation

### Field 1: impactExpected

**Schema Location:** prisma/schema.prisma:658

```
impactExpected         Float
impactLow              Float
impactHigh             Float
```

**Current Documentation:** None

**Usage Pattern 1: Stored at Recommendation Creation**

From schema, impactExpected is set when a recommendation is created. No unit documentation exists at that point.

**Usage Pattern 2: Retrieved During Outcome Recording**

```typescript
// route.ts:172
classifyOutcome(actualOutcome, beforeItem?.impactExpected ?? null)
```

The value comes from the stored item, assumed to be in same units as...?

**Current Unit Assumption:** IMPLICIT (undocumented)

---

### Field 2: actualOutcomeValue

**Schema Location:** prisma/schema.prisma:765

```
actualOutcomeValue     Float?              @map("actual_outcome_value")
```

**Current Documentation:** None

**Usage Pattern 1: From Request Body (Operator Route)**

```typescript
// route.ts:166
updatePayload.actualOutcomeValue = actualOutcome;  // From request body
```

**Usage Pattern 2: From Parameter (Decision Route)**

```typescript
// decision-lifecycle.ts:346
const updateData: any = { ...outcomeData };  // From outcomeData parameter
```

**Semantic Questions:**
- Should be in same units as impactExpected?
- What if user provides in different units?
- Who validates unit consistency?

**Current Unit Assumption:** IMPLICIT (undocumented)

---

## Unit Consistency Analysis

### Current State

**Assumption 1:** Both fields are numeric (Float) ✓
- Checked by database schema
- Verified at Prisma level

**Assumption 2:** Both fields are in same units ✗
- NOT documented
- NOT validated
- NOT enforced

### Where Unit Mismatch Can Occur

**Scenario 1: Request Body Provides Wrong Units**

```
impactExpected stored: 50000 (units unknown)
Request provides: actualOutcome: 50000 (different units?)

No validation → Silent mismatch
```

**Scenario 2: Different Decimal Places**

```
impactExpected: 50000.00 (assuming dollars)
Request: actualOutcome: 50000 (cents? millions?)

No validation → Math is wrong
```

**Scenario 3: Currency Conversion Missing**

```
impactExpected: 50000 USD (stored in USD)
Request: actualOutcome: 45000 EUR (provided in EUR)

No validation → Classification wrong
```

---

## Authoritative Unit Definition

### What We Can Infer

From usage context clues:

**Clue 1: Database Migrations**

```sql
-- migration: add_outcome_verification
ALTER TABLE "operator_items" 
ADD COLUMN "verification_confidence" DOUBLE PRECISION;
```

Confidence is percentage (0-1), but impactExpected and actualOutcomeValue have no such precision requirement.

**Clue 2: Variance Calculation**

```typescript
// variance = (actual - expected) / expected
// Produces percentage (e.g., 2.0 = 200% variance)

// This only makes sense if both are same units
if (variance > 2) {  // variance > 200%
  return "uncertain";
}
```

The logic assumes unit-agnostic percentage calculation.

**Clue 3: Fraud Risk Scoring**

```typescript
// Indicator: round number
if (actualOutcome > 0 && actualOutcome % 100000 === 0) {
  indicators.push("Round number outcome");
}
```

This checks if divisible by 100000. What does this mean?
- If USD cents: 100000 cents = $1000 (reasonable check)
- If USD dollars: 100000 dollars = $100k (also reasonable)
- If mixed units: meaningless check

**Clue 4: Documentation Hints**

No schema comments document units.

```prisma
impactExpected         Float           // ← No unit comment
impactLow              Float           // ← No unit comment
impactHigh             Float           // ← No unit comment
actualOutcomeValue     Float?          // ← No unit comment
confidence             Float           // ← Should be 0-1
```

---

## Contract Specification (What We Should Assume)

### Conservative Approach (Safest)

**Assumption: All numeric values are unit-less scalars**

```
impactExpected: numeric value (unknown unit)
actualOutcomeValue: numeric value (same unknown unit)
impactLow: numeric value (same unknown unit)
impactHigh: numeric value (same unknown unit)

Unit system:
  - No specific unit assumed
  - Values must be in same unit system
  - Variance calculations are relative (unitless)
```

**Enforcement:** Caller must ensure consistency

**Risk:** Silent failure if units mismatch

### Recommended Approach (Most Robust)

**Assumption: All monetary values are in USD (most common case)**

```
impactExpected: USD (dollars as decimal, e.g., 50000.50 = $50,000.50)
actualOutcomeValue: USD (dollars as decimal)
confidence: Percentage (0-1 range, e.g., 0.85 = 85%)

This is ASSUMED but not enforced
```

**Why USD:** Business context (consulting/SaaS), most APIs default to USD

**Risk:** Works if users provide USD, fails silently if not

---

## Unit Validation Requirements

### What's Missing

Current code does NOT validate:

1. **Caller provides actualOutcomeValue in same units as stored impactExpected**
   - No error thrown
   - Math just produces wrong result

2. **Both values are in expected magnitude**
   - Example: 50000 could mean $50k or $0.50 depending on decimals
   - No warning

3. **Values are reasonable**
   - Could be negative (not caught)
   - Could be zero (partially caught - classifies as failure)
   - Could be extreme (fraud risk catches extremes, but not unit errors)

### Validation Code (Hypothetical)

```typescript
// Hypothetical validation (not implemented)
function validateUnitConsistency(
  actualOutcomeValue: number,
  impactExpected: number,
  fieldMetadata?: {unitCode?: string}
): {valid: boolean, error?: string} {
  // Check magnitude similarity
  const ratio = actualOutcomeValue / impactExpected;
  
  // If ratio is 100x or 0.01x, might be unit mismatch
  if (ratio > 100 || ratio < 0.01) {
    return {
      valid: false,
      error: `actualOutcome (${actualOutcomeValue}) is ${Math.round(ratio*100)}% of expected (${impactExpected}). Possible unit mismatch?`
    };
  }
  
  return {valid: true};
}
```

---

## Where Validation Should Occur

### Option 1: At Request Boundary

```typescript
// In POST /api/operator route
const body = await req.json();

const validation = validateUnitConsistency(body.actualOutcome, beforeItem.impactExpected);
if (!validation.valid) {
  throw new ValidationError(validation.error);
}
```

**Pro:** Early validation, prevents bad data entering system  
**Con:** Might reject valid extreme outcomes

### Option 2: In Classifier

```typescript
// In classifyOutcome function
if (!unitsConsistent(actualOutcomeValue, impactExpected)) {
  return {
    category: "uncertain",  // Treat as suspicious
    reason: "Could not validate unit consistency"
  };
}
```

**Pro:** Catches all paths  
**Con:** Treats unit mismatch as fraud risk (might be wrong)

### Option 3: In Verification

```typescript
// In captureOutcomeVerificationMetadata
const unitValidation = validateUnitConsistency(...);
if (!unitValidation.valid) {
  // Flag for review
  indicators.push("Possible unit mismatch detected");
  riskScore += 1;
}
```

**Pro:** Non-breaking, flags for review  
**Con:** Hides problem, could produce wrong metrics

---

## Recommended Unit Contract

**For P2B Deployment:**

### Assumption 1: Unit Consistency
```
All numeric outcome values MUST be in same unit system.

This is caller responsibility.

No validation currently enforced.
```

### Assumption 2: Expected Unit System
```
Inferred: Likely USD dollars (decimal representation)

Why:
  - Business context (consulting)
  - Typical API pattern
  - Decimal places make sense (e.g., 50000.50)
```

### Assumption 3: Magnitude Check
```
Conservative range: 0.01 to 10,000,000

Below 0.01: Likely unit error (cents vs dollars)
Above 10M: Extreme but possible in enterprise
```

### Contract Statement
```
P2B_UNIT_CONTRACT:

1. All monetary outcome fields are in same unit
2. Unit system is caller's responsibility to ensure
3. Recommended unit: USD dollars (decimal)
4. Range: $0.01 to $10,000,000
5. No validation enforced - silent fail if violated
6. Risk: If violated, classification is incorrect
```

---

## Required Before Production

### Documentation

Add to schema comments:

```prisma
model OperatorItem {
  // All impact/outcome fields in same unit system (e.g., USD dollars)
  impactExpected         Float         // Expected outcome in base unit
  impactLow              Float         // Low estimate in base unit
  impactHigh             Float         // High estimate in base unit
  
  actualOutcomeValue     Float?        // Actual outcome in base unit
  // Note: Caller must ensure consistency with impactExpected
}
```

### Validation (Optional but Recommended)

Add unit consistency check at request boundary or as warning in classification reason.

---

## Status

**Contract:** DEFINED (as implicit assumptions)

**Risks Identified:**
- ✗ No enforced unit validation
- ✗ Silent failure if units mismatch
- ✗ No documentation for API consumers
- ✗ Extreme values not caught (0.01 to 10M range not enforced)

**Recommendation:**
1. Document assumption in schema comments
2. Add validation warning in classifier reason
3. Educate API consumers about unit consistency

**No Code Changes Required:** Contract is just documentation of current assumptions
