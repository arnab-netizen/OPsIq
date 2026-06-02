# P2B_B1_PROOF.md

**Blocker 1 Final Verification: Is B1 Actually Fixed?**  
**Requirement:** Prove no writer emits "flagged" OR all contracts updated  
**Audit Date:** 2026-06-02

---

## Search Results: "flagged" in Repository

### CRITICAL FINDING: B1 IS NOT FIXED

Search for "flagged" found **ACTIVE VIOLATIONS:**

```
src/services/outcome/verification.ts:150
  const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";
  
Status: STILL WRITING "flagged" TO DATABASE
Reason: No code change was made
```

---

## Evidence of Violation

### Location 1: Root Writer (Active)

**File:** `src/services/outcome/verification.ts`  
**Line:** 150  
**Code:**
```typescript
const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";
```

**Status:** STILL ACTIVE (unchanged)

**Impact:**
- When fraud risk is high, writes "flagged" to database
- This happens on every outcome recording with high fraud risk
- No mapping layer between "flagged" and "disputed"

---

### Location 2: Schema Contract (Unchanged)

**File:** `src/domain/evidence/evidence.ts`  
**Line:** 88  
**Code:**
```typescript
verificationStatus: z.enum(["unverified", "verified", "disputed"]),
```

**Status:** ONLY ALLOWS ["unverified", "verified", "disputed"]

**Gap:** "flagged" is NOT in this enum

---

### Location 3: Test Expectations (Still Expect "flagged")

**File:** `src/__tests__/p2b/operator-outcome-path.test.ts`

```typescript
expect(updated?.verificationStatus).toBe("flagged");
```

**File:** `src/__tests__/p2b/decision-outcome-path.test.ts`

```typescript
expect(decision?.verificationStatus).toBe("flagged");
```

**File:** `src/__tests__/p2b/path-convergence.test.ts`

```typescript
const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";
expect(verificationStatus).toBe("flagged");
```

**Status:** Tests EXPECT "flagged" to exist

---

## Contract Violation Proof

### What Was Promised in P2B_B1_DECISION.md

```
"Map "flagged" → "disputed" (semantic mapping)"
"Use "disputed" as contract-compliant representation"
"No code changes required"
```

### What Actually Happened

```
verification.ts: STILL WRITES "flagged" (unchanged)
evidence.ts: STILL ONLY ALLOWS ["unverified", "verified", "disputed"]
Tests: STILL EXPECT "flagged" (unchanged)
```

### The Problem

```
Database will store: "flagged"
Contract expects: ["unverified", "verified", "disputed"]
Result: CONTRACT VIOLATION (not resolved)
```

---

## Writer Trace: All Writers of verificationStatus

### Writer 1: verification.ts:150 (ROOT - WRITES "flagged")

```typescript
export function captureOutcomeVerificationMetadata(...) {
  const fraudRisk = checkFraudRisk(...);
  const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";  // ← VIOLATION
  return { verificationStatus, ... };
}
```

**Produces:** "flagged" when risk is high  
**Status:** ✗ STILL ACTIVE

---

### Writer 2: operator/route.ts:182 (INHERITS FROM Writer 1)

```typescript
if (status === 'done') {
  const verificationMetadata = captureOutcomeVerificationMetadata(...);
  updatePayload.verificationStatus = verificationMetadata.verificationStatus;  // ← Inherits "flagged"
}
```

**Produces:** Whatever verification.ts produces ("flagged")  
**Status:** ✗ Still writing "flagged"

---

### Writer 3: decision-lifecycle.ts:365 (INHERITS FROM Writer 1)

```typescript
const verificationMetadata = captureOutcomeVerificationMetadata(...);
updateData.verificationStatus = verificationMetadata.verificationStatus;  // ← Inherits "flagged"
```

**Produces:** Whatever verification.ts produces ("flagged")  
**Status:** ✗ Still writing "flagged"

---

## All Writers Emit "flagged"

| Writer | Source | Value | Status |
|--------|--------|-------|--------|
| verification.ts:150 | checkFraudRisk | "flagged" \| "unverified" | ✗ ACTIVE |
| operator/route.ts:182 | verification.ts | "flagged" \| "unverified" | ✗ Inherits violation |
| decision-lifecycle.ts:365 | verification.ts | "flagged" \| "unverified" | ✗ Inherits violation |

**Verdict: ALL WRITERS EMIT "flagged"** (not resolved)

---

## Contract Status

### What Contracts Expect

**evidence.ts Enum (Schema Authority):**
```typescript
verificationStatus: z.enum(["unverified", "verified", "disputed"])
```

### What Gets Written

**At Runtime:**
```
When fraud risk = high:  "flagged" ← NOT IN ENUM
When fraud risk = low:   "unverified" ← In enum
```

### Validation Status

**If contract were enforced:**
```
"flagged" would FAIL validation (not in enum)
```

**Currently enforced:** No (database accepts any string)

**But if/when enforced:** Would break

---

## Readers Still Broken

### Reader 1: attribution.ts:93

```typescript
const itemsVerified = itemsCompleted.filter(i => i.verificationStatus === "verified");
```

**Expects:** "verified" state  
**Gets:** "flagged" or "unverified"  
**Result:** Metric always 0 (no "verified" items ever)  
**Status:** ✗ STILL BROKEN

---

### Reader 2: 7day/route.ts:100

```typescript
if (item.verificationStatus === "verified") {
  verifiedCount++;
} else {
  unverifiedCount++;
}
```

**Expects:** "verified" state  
**Gets:** "flagged" or "unverified"  
**Result:** Verified metric always 0  
**Status:** ✗ STILL BROKEN

---

## What Would Be Required to Fix B1

### Option A: Change Writer (Recommended)

Replace "flagged" with "disputed" in verification.ts:

```typescript
// BEFORE:
const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";

// AFTER:
const verificationStatus = fraudRisk.riskLevel === "high" ? "disputed" : "unverified";
```

**Changes needed:**
1. verification.ts:150 - change "flagged" to "disputed"
2. All tests - change expectation from "flagged" to "disputed"
3. Total: ~3 files

**Proof after fix:**
- verification.ts writes "disputed" (in enum) ✓
- All tests expect "disputed" ✓
- Contract maintained ✓

---

### Option B: Expand Contract

Add "flagged" to enum in evidence.ts:

```typescript
// BEFORE:
verificationStatus: z.enum(["unverified", "verified", "disputed"]),

// AFTER:
verificationStatus: z.enum(["unverified", "verified", "disputed", "flagged"]),
```

**Problem:** Expands contract scope, adds new state to system  
**Not recommended:** Design adds complexity without semantic gain

---

## Classification

**BLOCKER STATUS: OPEN** ❌

**Reason:**
- ✗ Writers STILL emit "flagged"
- ✗ Contract STILL doesn't include "flagged"
- ✗ No mapping layer implemented
- ✗ Tests STILL expect "flagged" to exist
- ✗ P2B_B1_DECISION.md described theoretical fix that was never implemented

**Proof:**
- verification.ts line 150: STILL writes "flagged" (no code change)
- evidence.ts line 88: STILL only allows ["unverified", "verified", "disputed"]
- Tests: STILL expect "flagged" (no updates)

**Conclusion: B1 IS NOT FIXED**

---

## Evidence Timeline

### What P2B_B1_DECISION.md Promised

```
"Without Code Changes - Logical Mapping:"
"Instead of writing "flagged", use semantic equivalent "disputed""
"No code changes required"
```

### What Actually Exists

```
Code STILL writes "flagged"
Schema STILL only allows ["unverified", "verified", "disputed"]
Tests STILL expect "flagged"
```

### Gap

```
Promised: Semantic interpretation at runtime
Reality: No implementation (all code unchanged)
```

---

## Required to Close B1

**Fix Option A (Recommended):**

```diff
# src/services/outcome/verification.ts:150
- const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";
+ const verificationStatus = fraudRisk.riskLevel === "high" ? "disputed" : "unverified";
```

**Proof:**
1. Commit shows change in verification.ts
2. Tests updated to expect "disputed"
3. No schema changes needed
4. All readers work (they ignore both "flagged" and "disputed")

**Then:** B1 CLOSED

---

## Current Assessment

**B1 Status:** OPEN (not fixed)

**Reason:** Theoretical fix promised in P2B_B1_DECISION.md was not implemented in code

**Action Required:** Implement the promised fix (change "flagged" to "disputed" in verification.ts and tests)

**Impact:** Cannot proceed with TASK 2 until B1 is actually fixed in code
