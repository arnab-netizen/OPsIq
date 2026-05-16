# X9F-8: Pre-Implementation Confirmation

**Date:** 2026-05-16  
**Phase:** X9F-8 - Pre-Implementation Confirmation  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Production Callers Audit

### Confirmed All Use VerifiedDecisionInput

#### Caller 1: create/route.ts - Single Decision (Line 78)
```typescript
const verifiedInput: VerifiedDecisionInput = {
  title, type, impact, confidence,
  verifiedActorId: userId,
  verifiedWorkspaceId: workspaceId,
  problemType, expectedOutcome,
};
const decision = await createDecision(verifiedInput);
```
**Status:** ✓ Uses VerifiedDecisionInput explicitly

#### Caller 2: create/route.ts - Bulk JSON (Line 52)
```typescript
const decisions = body.decisions.map((d: any) => ({
  ...d,
  verifiedWorkspaceId: workspaceId,
  verifiedActorId: userId,
}));
const result = await createDecisionsBulk({ decisions });
```
**Status:** ✓ Maps to verified format before bulk call

#### Caller 3: create/route.ts - CSV Upload (Line 109)
```typescript
const parsedDecisions = parseCSV(csvContent, workspaceId, userId);
const verifiedDecisions = parsedDecisions.map((d: any) => ({
  ...d,
  verifiedWorkspaceId: workspaceId,
  verifiedActorId: userId,
}));
const result = await createDecisionsBulk({ decisions: verifiedDecisions });
```
**Status:** ✓ parseCSV output converted to verified format before bulk

#### Caller 4: createDecisionsBulk Internal Loop (Line 162)
```typescript
for (const decision of decisions) {
  const result = await createDecision(decision);
}
```
**Status:** ✓ Receives only verified format from all callers

**Confirmation:** ✓ ALL 4 PRODUCTION CALLERS USE VERIFIED INPUT

---

## Test Callers Audit

**Search performed:** grep -r "createDecision" src/__tests__/ --include="*.test.ts"

**Result:** No test files found that directly call createDecision with old format

**Confirmation:** ✓ NO TEST-ONLY OLD FORMAT CALLERS

---

## What to Remove

### 1. Old Input Type Interface (Lines 5-14)
```typescript
// DELETE THIS:
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
**Lines:** 10 (includes blank lines)  
**Type:** Interface definition  
**Used by:** Dead code only (runtime format detection)

### 2. Union Type in Signature (Line 40)
```typescript
// BEFORE:
export async function createDecision(
  input: VerifiedDecisionInput | CreateDecisionInput
): Promise<CreateDecisionResult>

// AFTER:
export async function createDecision(
  input: VerifiedDecisionInput
): Promise<CreateDecisionResult>
```
**Lines:** 1 (signature change)  
**Type:** Type union removal

### 3. Runtime Format Detection (Lines 43-50)
```typescript
// DELETE THIS:
  const isVerified = 'verifiedActorId' in input && 'verifiedWorkspaceId' in input;

  const title = input.title;
  const type = input.type;
  const impact = input.impact;
  const confidence = input.confidence;
  const workspaceId = isVerified ? (input as VerifiedDecisionInput).verifiedWorkspaceId : (input as CreateDecisionInput).workspaceId;
  const userId = isVerified ? (input as VerifiedDecisionInput).verifiedActorId : (input as CreateDecisionInput).userId;
  const problemType = input.problemType;
  const expectedOutcome = input.expectedOutcome;

// REPLACE WITH:
  const { title, type, impact, confidence, verifiedWorkspaceId, verifiedActorId, problemType, expectedOutcome } = input;
  const workspaceId = verifiedWorkspaceId;
  const userId = verifiedActorId;
```
**Lines:** 11 before → 4 after (saves 7 lines)  
**Type:** Dead code elimination and simplification

### 4. Union Type in BulkCreateInput (Line 128)
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
**Lines:** 1 (interface field change)  
**Type:** Type union removal

### 5. Format Detection in Bulk Error Handling (Line 169)
```typescript
// BEFORE:
      const workspaceId = 'verifiedWorkspaceId' in decision ? decision.verifiedWorkspaceId : decision.workspaceId;

// AFTER:
      const workspaceId = decision.verifiedWorkspaceId;
```
**Lines:** 1 (simplification)  
**Type:** Dead code elimination

### 6. parseCSV Return Type Update (Lines 200-260)

#### Signature Change (Lines 200-204)
```typescript
// BEFORE:
export function parseCSV(
  csvContent: string,
  workspaceId: string,
  userId: string
): CreateDecisionInput[] {
  const decisions: CreateDecisionInput[] = [];

// AFTER:
export function parseCSV(
  csvContent: string,
  workspaceId: string,
  userId: string
): VerifiedDecisionInput[] {
  const decisions: VerifiedDecisionInput[] = [];
```
**Lines:** 2 (return type + array declaration)

#### Implementation Update (Lines 240-249)
```typescript
// BEFORE:
      decisions.push({
        title: row["title"],
        type: row["type"],
        impact: parseFloat(row["impact"]),
        confidence: parseFloat(row["confidence"]),
        workspaceId,
        userId,
        problemType: row["problemtype"] || undefined,
        expectedOutcome: row["expectedoutcome"] || undefined,
      });

// AFTER:
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
```
**Lines:** 2 field name changes (workspaceId→verifiedWorkspaceId, userId→verifiedActorId)

---

## Expected Effect on Routes

### create/route.ts - No Changes Required
**Reason:** Route already constructs VerifiedDecisionInput explicitly before calling createDecision

**Current behavior (will remain identical):**
- Single: Line 78 - Explicit VerifiedDecisionInput construction ✓
- Bulk JSON: Lines 46-50 - Map to verifiedWorkspaceId/verifiedActorId ✓
- CSV: Lines 104-108 - Map parsed decisions to verified format ✓

**Status:** ✓ NO ROUTE CHANGES NEEDED

---

## Expected Scanner Effect

**Before cleanup:** 448 total (283 critical, 165 block-build)  
**After cleanup:** 448 total (283 critical, 165 block-build)  
**Change:** 0 (no new shadow reads, no new auth patterns)

**Reason:** Dual-format removal is internal code simplification. No auth patterns changed, no imports modified, no new withAuth() calls added.

---

## Summary of Changes

| Item | Action | Lines | Type |
|------|--------|-------|------|
| CreateDecisionInput interface | Delete | -10 | Interface removal |
| createDecision signature | Change | 1 | Type simplification |
| Format detection code | Remove | -7 | Dead code elimination |
| Field extraction | Simplify | 7→4 | Code simplification |
| BulkCreateInput type | Change | 1 | Type simplification |
| Bulk error handling | Simplify | -1 | Dead code elimination |
| parseCSV signature | Change | 2 | Return type update |
| parseCSV implementation | Change | 2 | Field name update |
| **Net Change** | | **-8 lines** | **Code cleanup** |

---

## Confirmation Summary

✓ **All production callers verified:** 4/4 use VerifiedDecisionInput  
✓ **No old-format production callers:** 0 unsafe callers  
✓ **No test-only old-format callers:** 0 test dependencies  
✓ **Exact changes documented:** 6 specific modifications  
✓ **Route impacts assessed:** No route changes needed  
✓ **Scanner effect predicted:** 0 new violations expected  

**Status:** ✓ PRECONDITIONS CONFIRMED - READY TO PROCEED WITH REMOVAL

---

## Next Step

Proceed to Phase B: Remove dual-format support from decision-creation-service.ts
