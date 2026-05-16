# X9F-7: createDecision Dual-Format Debt Analysis

**Date:** 2026-05-16  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Service:** createDecision  
**File:** src/services/decisions/decision-creation-service.ts

---

## What Old Raw Input Support Remains?

### Current State
**Yes, dual-format support is present.**

```typescript
// Line 5-14: Old format interface (still exported)
export interface CreateDecisionInput {
  title: string;
  type: string;
  impact: number;
  confidence: number;
  workspaceId: string;
  userId: string;
  problemType?: string;
  expectedOutcome?: string;
}

// Line 16-27: New format interface (exported)
export interface VerifiedDecisionInput {
  title: string;
  type: string;
  impact: number;
  confidence: number;
  problemType?: string;
  expectedOutcome?: string;
  verifiedActorId: string;
  verifiedWorkspaceId: string;
}

// Line 39-40: Function accepts BOTH formats
export async function createDecision(
  input: VerifiedDecisionInput | CreateDecisionInput
): Promise<CreateDecisionResult>
```

### Runtime Format Detection (Lines 43-50)
```typescript
// Line 43: Runtime check to determine input format
const isVerified = 'verifiedActorId' in input && 'verifiedWorkspaceId' in input;

// Lines 49-50: Conditional field extraction based on format
const workspaceId = isVerified 
  ? (input as VerifiedDecisionInput).verifiedWorkspaceId 
  : (input as CreateDecisionInput).workspaceId;
const userId = isVerified 
  ? (input as VerifiedDecisionInput).verifiedActorId 
  : (input as CreateDecisionInput).userId;
```

### Bulk Operation Support (Lines 128, 162-163)
```typescript
// Line 128: BulkCreateInput also accepts both formats
export interface BulkCreateInput {
  decisions: (VerifiedDecisionInput | CreateDecisionInput)[];
}

// Line 162: Recursive call within bulk loop
const result = await createDecision(decision);
```

---

## Is Old CreateDecisionInput Still Needed?

**No.**

### Evidence
1. **All 4 production callers use VerifiedDecisionInput:**
   - create/route.ts line 78: Explicit VerifiedDecisionInput construction
   - create/route.ts line 52: Maps array to verified format
   - create/route.ts line 109: Maps parsed CSV to verified format
   - createDecisionsBulk line 162: Receives only verified format from all callers

2. **Old format is only used in parseCSV intermediate:**
   - parseCSV (line 200-260) returns CreateDecisionInput[]
   - But this is IMMEDIATELY converted to verified format in the calling route (lines 104-108)
   - Never passed directly to createDecision

3. **No test dependencies on old format:**
   - No tests found that call createDecision with CreateDecisionInput
   - No tests import or use CreateDecisionInput directly

### Safe to Remove:
- ✓ Export declaration of CreateDecisionInput interface (line 5-14)
- ✓ Union type in createDecision signature (line 40)
- ✓ Runtime format detection code (line 43)
- ✓ Conditional field extraction (lines 49-50)
- ✓ Type casts for old format (e.g., `as CreateDecisionInput`)
- ✓ Union type in BulkCreateInput (line 128)
- ✓ Format detection in bulk error handling (line 169)

---

## Is Runtime Format Detection Still Needed?

**No.**

### Current Code (Lines 43-50)
```typescript
const isVerified = 'verifiedActorId' in input && 'verifiedWorkspaceId' in input;
const workspaceId = isVerified ? (input as VerifiedDecisionInput).verifiedWorkspaceId : (input as CreateDecisionInput).workspaceId;
const userId = isVerified ? (input as VerifiedDecisionInput).verifiedActorId : (input as CreateDecisionInput).userId;
```

### Why Not Needed
1. All callers pass VerifiedDecisionInput
2. Simple type narrowing (explicit cast) sufficient
3. Removes 7 lines of dead code
4. Improves code clarity

### After Removal
```typescript
// Direct access without format detection
const { title, type, impact, confidence, verifiedWorkspaceId, verifiedActorId, problemType, expectedOutcome } = input;
const workspaceId = verifiedWorkspaceId;
const userId = verifiedActorId;
```

---

## Are Any Tests Still Using Old Raw Input?

**No.**

### Search Results
- grep "CreateDecisionInput" src/__tests__/ → No matches
- grep "await createDecision.*workspaceId:" → No matches
- All integration tests use verified format or route handlers

### Test Files Affected by Cleanup
- None require format changes
- All existing tests exercise verified format path already
- No dual-format test cases exist

---

## Can Tests Be Updated to Verified Input?

**Not required; tests don't need updating.**

### Why
- Existing tests already use VerifiedDecisionInput (implicitly through verified format)
- Tests that use createDecision import it from service
- Tests don't exercise old format path
- No test changes needed for dual-format removal

---

## What Exact Code Can Be Removed?

### Files to Modify
1. **src/services/decisions/decision-creation-service.ts**

### Exact Deletions/Changes

#### Deletion 1: Remove old CreateDecisionInput interface (Lines 5-14)
```typescript
// DELETE THESE LINES:
export interface CreateDecisionInput {
  title: string;
  type: string;
  impact: number;
  confidence: number;
  workspaceId: string;
  userId: string;
  problemType?: string;
  expectedOutcome?: string;
}
```

#### Change 1: Simplify createDecision signature (Line 39-40)
```typescript
// BEFORE:
export async function createDecision(
  input: VerifiedDecisionInput | CreateDecisionInput
): Promise<CreateDecisionResult> {

// AFTER:
export async function createDecision(
  input: VerifiedDecisionInput
): Promise<CreateDecisionResult> {
```

#### Change 2: Remove runtime format detection and simplify field extraction (Lines 43-50)
```typescript
// BEFORE:
  const isVerified = 'verifiedActorId' in input && 'verifiedWorkspaceId' in input;
  
  const title = input.title;
  const type = input.type;
  const impact = input.impact;
  const confidence = input.confidence;
  const workspaceId = isVerified ? (input as VerifiedDecisionInput).verifiedWorkspaceId : (input as CreateDecisionInput).workspaceId;
  const userId = isVerified ? (input as VerifiedDecisionInput).verifiedActorId : (input as CreateDecisionInput).userId;
  const problemType = input.problemType;
  const expectedOutcome = input.expectedOutcome;

// AFTER:
  const { title, type, impact, confidence, verifiedWorkspaceId, verifiedActorId, problemType, expectedOutcome } = input;
  const workspaceId = verifiedWorkspaceId;
  const userId = verifiedActorId;
```

#### Change 3: Simplify BulkCreateInput type (Line 128)
```typescript
// BEFORE:
export interface BulkCreateInput {
  decisions: (VerifiedDecisionInput | CreateDecisionInput)[];
}

// AFTER:
export interface BulkCreateInput {
  decisions: VerifiedDecisionInput[];
}
```

#### Change 4: Remove format detection in bulk error handling (Line 169)
```typescript
// BEFORE:
      const workspaceId = 'verifiedWorkspaceId' in decision ? decision.verifiedWorkspaceId : decision.workspaceId;

// AFTER:
      const workspaceId = decision.verifiedWorkspaceId;
```

#### Change 5: Keep parseCSV as-is (returns old format for backward compatibility)
- **No change needed** - parseCSV is an internal helper that converts output before calling createDecision
- Removing old CreateDecisionInput would break parseCSV return type, but parseCSV is internal only
- Option A: Update parseCSV to return VerifiedDecisionInput[] (requires adding verified context internally)
- Option B: Keep parseCSV as helper with internal old format (clean separation)
- **Recommendation:** Option B (keep helper internal type, it's private to service)

Actually, on second thought:

#### Change 5 (REVISED): Update parseCSV signature (Line 200-204)
```typescript
// BEFORE:
export function parseCSV(
  csvContent: string,
  workspaceId: string,
  userId: string
): CreateDecisionInput[] {
  const decisions: CreateDecisionInput[] = [];
  // ...
  return decisions; // Still returns old format

// AFTER:
export function parseCSV(
  csvContent: string,
  workspaceId: string,
  userId: string
): VerifiedDecisionInput[] {
  const decisions: VerifiedDecisionInput[] = [];
  // ... modify decision objects to use verifiedWorkspaceId, verifiedActorId
  // Lines 240-249: Update field names in decision push
  decisions.push({
    title: row["title"],
    type: row["type"],
    impact: parseFloat(row["impact"]),
    confidence: parseFloat(row["confidence"]),
    verifiedWorkspaceId: workspaceId,
    verifiedActorId: userId,
    problemType: row["problemtype"] || undefined,
    expectedOutcome: row["expectedoutcome"] || undefined,
  });
  return decisions;
```

This way parseCSV returns verified format directly, eliminating the conversion step in the route.

---

## What Exact Risk Exists If Removed?

### Compilation Risk
- **Low:** Union type removal enforced by TypeScript at compile time
- Any old-format caller would fail type check immediately

### Runtime Risk
- **None:** No production code uses old format
- All callers pass verified format or route handlers

### Behavioral Risk
- **None:** Business logic identical regardless of input format
- Function accepts VerifiedDecisionInput exclusively post-cleanup
- No behavior change

### Test Risk
- **None:** No tests depend on old format
- Format detection code not exercised by tests
- Tests exercise verified format path which remains unchanged

### Rollback Risk
- **Low:** Simple type and code change
- Easy to revert if needed
- No data migration required

---

## Does Removal Change Business Behavior?

**No.**

### Unchanged
- ✓ Database operations identical
- ✓ Validation logic unchanged
- ✓ Audit event emission unchanged
- ✓ Error handling unchanged
- ✓ Response type (CreateDecisionResult) unchanged
- ✓ Logging unchanged

### Changed
- ✗ Code clarity (improved - removed dead code)
- ✗ Type safety (improved - explicit format only)
- ✗ Execution (faster - no runtime format detection)

### Evidence
- Same database.operatorItem.create call (lines 78-96)
- Same validation logic (lines 57-75)
- Same logging (lines 98-105)
- Same return structure (lines 107-115)

---

## Does Removal Change Response Shape?

**No.**

### Response Type
```typescript
// Lines 29-37: CreateDecisionResult - UNCHANGED
export interface CreateDecisionResult {
  id: string;
  title: string;
  problem: string;
  decisionType: string;
  impactExpected: number;
  confidence: number;
  createdAt: Date;
}
```

### Return Statement (Lines 107-115)
```typescript
// No changes needed to return construction
return {
  id: decision.id,
  title: decision.problem,
  problem: decision.problem,
  decisionType: decision.decisionType,
  impactExpected: decision.impactExpected,
  confidence: decision.confidence,
  createdAt: decision.createdAt,
};
```

---

## Does Removal Affect CSV/Bulk/Single Call Paths?

### Single Path (create/route.ts line 78)
- ✓ No change: explicit VerifiedDecisionInput construction preserved
- ✓ No change: type signature supports it

### Bulk JSON Path (create/route.ts line 52)
- ✓ No change: decisions mapped to verified format before bulk call
- ✓ No change: createDecisionsBulk signature simplified but behavior identical

### CSV Path (create/route.ts line 103-109)
- ✓ Change needed: parseCSV return type updated to VerifiedDecisionInput[]
- ✓ No route change: conversion step removed (simpler)
- ✓ Impact: Cleaner, fewer intermediate steps

### Bulk Loop (createDecisionsBulk line 162)
- ✓ No change: receives verified format only
- ✓ Simpler: createDecision signature no longer accepts union type

---

## Summary: Safe to Remove

| Item | Safe | Risk | Effort |
|------|------|------|--------|
| CreateDecisionInput interface | ✓ YES | None | Remove 10 lines |
| Union type in signature | ✓ YES | None | 1 line change |
| Runtime format detection | ✓ YES | None | Remove 7 lines |
| Format detection in bulk | ✓ YES | None | 1 line change |
| parseCSV return type update | ✓ YES | Low | Update 15 lines |
| **Total Removal** | ✓ YES | **None** | **~34 lines** |

---

## Debt Cleanup Preconditions Met

- ✓ All production callers audited (4 total, 4 verified format)
- ✓ No unsafe old-format callers
- ✓ No test dependencies on old format
- ✓ No behavior change
- ✓ No response shape change
- ✓ parseCSV easily updated
- ✓ Type safety improved
- ✓ Code clarity improved
- ✓ No dual-format test cases to worry about

---

## Conclusion

**✓ DEBT CLEANUP IS SAFE AND BENEFICIAL**

The dual-format support in createDecision was a temporary bridge during X9F-2 refactoring. All production callers now exclusively use VerifiedDecisionInput. The old CreateDecisionInput interface and runtime format detection can be safely removed.

**Files to change:** 1 (decision-creation-service.ts)  
**Lines to remove/change:** ~34  
**Risk level:** None  
**Behavior impact:** None  
**Test impact:** None  
**Type safety improvement:** Yes  
**Code clarity improvement:** Yes

Ready for implementation in next phase.
