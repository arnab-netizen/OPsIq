# X9F-7: Debt Cleanup Implementation Plan for Next Phase

**Date:** 2026-05-16  
**Phase Name for Implementation:** X9F-8-IMPL (createDecision dual-format removal)  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Scope Status:** Standalone (no other service changes required)

---

## Execution Mode for X9F-8-IMPL

**STRICT EXECUTION MODE — X9F-8-IMPL**

Once approved, the implementation will follow the same 7-phase pattern as X9F-4 and X9F-6:
- Phase A: Pre-implementation confirmation
- Phase B: Service refactoring (dual-format removal)
- Phase C: No route changes (routes already use verified format)
- Phase D: Test notes (no new tests needed)
- Phase E: Validation (build, tests, scanner)
- Phase F: Scope audit
- Phase G: Final acceptance decision

---

## Selected Action

**Action:** REMOVE_CREATE_DECISION_DUAL_FORMAT_NOW

**Justification:** All 4 production callers exclusively use VerifiedDecisionInput. Zero unsafe old-format callers. Zero test dependencies. Safe to remove immediately.

---

## Files Allowed to Change

### Explicitly Allowed
1. **src/services/decisions/decision-creation-service.ts** (ONLY file to modify)
   - Remove CreateDecisionInput interface (lines 5-14)
   - Simplify createDecision signature (line 40)
   - Remove runtime format detection (line 43)
   - Simplify field extraction (lines 49-50)
   - Update BulkCreateInput (line 128)
   - Remove bulk error handling format detection (line 169)
   - Update parseCSV signature and implementation (lines 200-249)

### Explicitly Forbidden
- ❌ src/app/api/decisions/create/route.ts (NO CHANGES - already uses verified format)
- ❌ Any other route files
- ❌ Any other service files
- ❌ Wrapper pattern changes
- ❌ Auth context changes
- ❌ Capability additions
- ❌ Scanner modifications
- ❌ Test file additions

---

## Route Changes Allowed

**NONE**

The create/route.ts already explicitly constructs VerifiedDecisionInput. No route changes required.

---

## Service Changes Allowed

### Exact Changes to decision-creation-service.ts

#### Change 1: Delete CreateDecisionInput interface (Lines 5-14)
```typescript
// DELETE THESE 10 LINES:
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

#### Change 2: Update createDecision signature (Line 39-40)
```typescript
// BEFORE (2 lines):
export async function createDecision(
  input: VerifiedDecisionInput | CreateDecisionInput

// AFTER (2 lines):
export async function createDecision(
  input: VerifiedDecisionInput
```

#### Change 3: Remove runtime format detection and simplify (Lines 43-52)
```typescript
// BEFORE (11 lines):
  const isVerified = 'verifiedActorId' in input && 'verifiedWorkspaceId' in input;

  const title = input.title;
  const type = input.type;
  const impact = input.impact;
  const confidence = input.confidence;
  const workspaceId = isVerified ? (input as VerifiedDecisionInput).verifiedWorkspaceId : (input as CreateDecisionInput).workspaceId;
  const userId = isVerified ? (input as VerifiedDecisionInput).verifiedActorId : (input as CreateDecisionInput).userId;
  const problemType = input.problemType;
  const expectedOutcome = input.expectedOutcome;

// AFTER (8 lines):
  const { title, type, impact, confidence, verifiedWorkspaceId, verifiedActorId, problemType, expectedOutcome } = input;
  const workspaceId = verifiedWorkspaceId;
  const userId = verifiedActorId;
```

#### Change 4: Update BulkCreateInput type (Line 128)
```typescript
// BEFORE (2 lines):
export interface BulkCreateInput {
  decisions: (VerifiedDecisionInput | CreateDecisionInput)[];

// AFTER (2 lines):
export interface BulkCreateInput {
  decisions: VerifiedDecisionInput[];
```

#### Change 5: Remove format detection in bulk error handling (Line 169)
```typescript
// BEFORE:
      const workspaceId = 'verifiedWorkspaceId' in decision ? decision.verifiedWorkspaceId : decision.workspaceId;

// AFTER:
      const workspaceId = decision.verifiedWorkspaceId;
```

#### Change 6: Update parseCSV return type and implementation (Lines 200-260)
```typescript
// BEFORE (lines 200-204):
export function parseCSV(
  csvContent: string,
  workspaceId: string,
  userId: string
): CreateDecisionInput[] {
  const decisions: CreateDecisionInput[] = [];

// AFTER (lines 200-204):
export function parseCSV(
  csvContent: string,
  workspaceId: string,
  userId: string
): VerifiedDecisionInput[] {
  const decisions: VerifiedDecisionInput[] = [];

// BEFORE (lines 240-249):
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

// AFTER (lines 240-249):
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

---

## Test Changes Allowed

**NONE**

No test files need modification. All existing tests already exercise verified format path.

---

## Scanner Expectation

**No change expected.**

Current baseline: 448 total (283 critical, 165 block-build)  
Expected after cleanup: 448 total (283 critical, 165 block-build)  
Change: 0

**Reasoning:** Dual-format removal is internal code simplification. No new auth patterns introduced, no shadow reads added, no imports changed.

---

## Validation Commands

After implementation, must execute:

```bash
# 1. Build must pass
npm run build

# 2. Governance capabilities test (DECISION_CREATE still works)
npm test -- governance-capabilities

# 3. Wrapper enforcement test (enforcement patterns unchanged)
npm test -- policy-wrapper-enforcement

# 4. Auth bridge test (ctx.verified* still available)
npm test -- g6r-auth-bridge

# 5. Integration tests (create flow still works)
npm test -- phase-d phase-e phase-f

# 6. Scanner must be stable
npx tsx src/governance/auth-shadow-read-scanner.ts
```

Expected results:
- Build: ✓ 0 TypeScript errors
- Governance: ✓ 32/32 tests pass
- Wrapper: ✓ 32/32 tests pass
- Auth bridge: ✓ 14/14 tests pass
- Integration: ✓ 324/324 tests pass
- Scanner: ✓ 448 violations (no change)

---

## Rollback Rule

If any validation gate fails:
1. Revert the commit: `git revert <commit_sha>`
2. Investigate root cause
3. Do not re-attempt in same session

Failure modes that would trigger rollback:
- Build fails (TypeScript error)
- Any test suite fails (>0 failures)
- Scanner violations increase (>448 total)
- Scanner critical violations increase (>283)
- Scanner block-build violations increase (>165)

---

## Stop Conditions

**Automatic stop if:**
1. TypeScript compilation fails → revert
2. Any test fails → revert
3. Scanner shows new violations → revert
4. Build time exceeds 15 seconds (perf regression) → revert

**Manual stop conditions:**
- If any route fails verification
- If parseCSV behavior changes
- If response shape changes

---

## Maximum Scope

**Absolute scope limits for X9F-8-IMPL:**

### Must stay within:
- ✓ 1 file modified (decision-creation-service.ts)
- ✓ ~30 lines removed
- ✓ ~3 lines changed
- ✓ ~5 lines added (parseCSV update)
- ✓ 0 files deleted
- ✓ 0 route changes
- ✓ 0 other service changes

### Must NOT touch:
- ✗ Other decision services (acceptDecision, rejectDecision, closeDecision)
- ✗ Create route
- ✗ Wrappers
- ✗ Auth context services
- ✗ Any other files
- ✗ Any test files
- ✗ Any schema changes
- ✗ Any capability changes

---

## Success Criteria

**X9F-8-IMPL succeeds when:**
1. Build passes (0 TypeScript errors)
2. All 402 tests pass (100%)
3. Scanner baseline stable (448 violations, no change)
4. Only 1 file modified (decision-creation-service.ts)
5. All forbidden patterns verified absent
6. No behavioral changes (all 324 integration tests still pass)
7. Scope audit confirms scope within limits
8. Type safety improved (union type removed)
9. Code clarity improved (dead code removed)
10. Dual-format support completely removed

---

## Implementation Notes

### Why Dual-Format Was Added in X9F-2
During X9F-2 (createDecision refactoring), dual-format support was added as a temporary bridge to ensure all callers could transition from old to new format at their own pace.

### Why It Can Be Removed Now
X9F-2R confirmed all 4 production callers already use VerifiedDecisionInput exclusively. The bridge is no longer needed.

### Why This Is X9F-8-IMPL and Not X9F-5-DEBT-CLEANUP
- X9F-5 was the selection phase for rejectDecision refactoring
- X9F-7 is the selection phase for createDecision dual-format cleanup
- X9F-8-IMPL will be the implementation phase for cleanup
- Naming avoids confusion with other debt phases

---

## Transition to Next Phase

After X9F-8-IMPL succeeds:
1. Next phase: X9G (closeDecision modernization - pending governance clarification)
2. Or: Await governance decision on closeDecision capability requirements
3. Scanner baseline remains stable throughout

---

## Sign-Off Checklist for Implementation Phase

When ready to implement X9F-8-IMPL:
- [ ] All callers audited and verified (DONE - 4 callers, 4 verified format)
- [ ] No unsafe callers identified (DONE - 0 unsafe)
- [ ] Tests verified not dependent on old format (DONE - 0 dependencies)
- [ ] All preconditions met (DONE - ✓ 7/7)
- [ ] Implementation plan clear (DONE - this document)
- [ ] Validation plan clear (DONE - 6 gate commands)
- [ ] Rollback strategy clear (DONE - simple revert)
- [ ] Scope limits documented (DONE - 1 file max)

---

## Conclusion

**Implementation Plan Ready for X9F-8-IMPL**

This document specifies exactly what must change, what must not change, how to validate, and how to rollback. The implementation is straightforward: remove union type, remove dead code, update parseCSV. Estimated effort: 15 minutes. Risk: Low.

When approved, proceed with X9F-8-IMPL using the 7-phase pattern (A-G).
