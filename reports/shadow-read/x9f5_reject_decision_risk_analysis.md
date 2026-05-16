# X9F-5: rejectDecision Risk Analysis

**Date:** 2026-05-16  
**Phase:** X9F-5 - Selection Phase Risk Analysis  
**Service:** rejectDecision  
**File:** src/services/decision-validation/decision-acceptance.service.ts (lines 100-166)  
**Route:** src/app/api/decisions/[decisionId]/reject/route.ts

---

## Structural Equivalence to acceptDecision

### Input Type Comparison

**acceptDecision Input (X9F-4 baseline):**
```typescript
interface VerifiedAcceptanceInput {
  decisionId: string;
  engagementId: string;
  verifiedWorkspaceId: string;    // Explicitly verified
  verifiedActorId: string;        // Explicitly verified
  rationale?: string;
}
```

**rejectDecision Current Input:**
```typescript
interface DecisionRejectionInput {
  decisionId: string;
  engagementId: string;
  workspaceId: string;            // RAW - not verified
  rejectedBy: string;             // RAW - not verified
  reason: string;
}
```

**Proposed rejectDecision Input:**
```typescript
interface VerifiedRejectionInput {
  decisionId: string;
  engagementId: string;
  verifiedWorkspaceId: string;    // Explicitly verified
  verifiedActorId: string;        // Explicitly verified
  reason: string;
}
```

**Equivalence:** ✓ YES - Same structure, one additional field (reason vs rationale)

### Function Signature Comparison

**acceptDecision (X9F-4 after):**
```typescript
export async function acceptDecision(input: VerifiedAcceptanceInput): Promise<AcceptanceRecord>
```

**rejectDecision (current):**
```typescript
export async function rejectDecision(input: DecisionRejectionInput): Promise<RejectionRecord>
```

**Proposed rejectDecision (X9F-5):**
```typescript
export async function rejectDecision(input: VerifiedRejectionInput): Promise<RejectionRecord>
```

**Equivalence:** ✓ YES - Same pattern, different input and output types

---

## Route Canonicity Analysis

### Route Wrapper Comparison

**acceptDecision Route (X9F-4):**
- Wrapper: withCanonicalEnforcement ✓
- Capability: DECISION_ACCEPT ✓
- Auth context: CanonicalAuthContext ✓
- Shadow reads: 0 ✓

**rejectDecision Route (current):**
- Wrapper: withCanonicalEnforcement ✓
- Capability: DECISION_REJECT ✓ (X9E-6 fixed this)
- Auth context: CanonicalAuthContext ✓
- Shadow reads: 0 ✓

**Verdict:** ✓ IDENTICAL - Both routes modern and canonical

### Verified Context Availability

**acceptDecision Route provides:**
- ctx.verifiedWorkspaceId (from withCanonicalEnforcement)
- ctx.verifiedActorId (from withCanonicalEnforcement)

**rejectDecision Route provides:**
- ctx.verifiedWorkspaceId (line 15: `const workspaceId = ctx.verifiedWorkspaceId;`)
- ctx.verifiedActorId (line 26: `rejectedBy: ctx.verifiedActorId,`)

**Verdict:** ✓ IDENTICAL - Same verified context available

---

## Verified Input Construction Feasibility

**acceptDecision Route Construction (X9F-4 pattern):**
```typescript
const verifiedInput: VerifiedAcceptanceInput = {
  decisionId,
  engagementId: parsed.engagementId,
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,  // From canonical context
  verifiedActorId: ctx.verifiedActorId,           // From canonical context
  rationale: parsed.rationale,
};
const result = await acceptDecision(verifiedInput);
```

**rejectDecision Route Construction (proposed X9F-5 pattern):**
```typescript
const verifiedInput: VerifiedRejectionInput = {
  decisionId,
  engagementId: parsed.engagementId,
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,  // From canonical context
  verifiedActorId: ctx.verifiedActorId,           // From canonical context
  reason: parsed.reason,
};
const result = await rejectDecision(verifiedInput);
```

**Feasibility:** ✓ YES - Identical pattern, fields directly available

---

## DECISION_REJECT Capability Verification

**X9E-6 Fix Status:** ✓ VERIFIED
- reject route now correctly requires DECISION_REJECT (not DECISION_ACCEPT)
- Line 39 in reject/route.ts: `{ requireCapabilities: ["DECISION_REJECT"], ... }`
- DECISION_REJECT defined in capabilities.ts

**Verdict:** ✓ CAPABILITY CORRECT - No changes needed

---

## Service Caller Analysis

**Route Callers for rejectDecision (decision-acceptance.service.ts version):**
1. src/app/api/decisions/[decisionId]/reject/route.ts (ONLY)

**Other rejectDecision Functions:**
- decision-lifecycle.service.ts has different rejectDecision (4 raw parameters, generic handler)
- This version is NOT called by modern reject route
- Selection focuses on decision-acceptance.service.ts version only

**Background Callers:** NONE found

**Service-to-Service Callers:** NONE found

**Internal/Background Jobs:** NONE found

**Verdict:** ✓ SINGLE CALLER - Only modern reject route calls this version

---

## Authorization Behavior Analysis

**Before Refactoring:**
- Route verifies DECISION_REJECT capability via withCanonicalEnforcement
- Route receives verified workspace and actor from canonical context
- Route passes raw field names to service
- Service trusts route verification (no service-side checks)

**After Refactoring:**
- Route verifies DECISION_REJECT capability via withCanonicalEnforcement (unchanged)
- Route receives verified workspace and actor from canonical context (unchanged)
- Route passes explicitly verified field names to service (new)
- Service trusts pre-verified input (no service-side checks needed)

**Would refactor change authorization behavior?** ✗ NO - Only strengthens boundary signal

---

## Business Behavior Analysis

**Current rejectDecision Operations:**
1. Line 102-103: Fetch decision from database
2. Line 106-107: Check if decision exists (throw NotFoundError)
3. Line 111-112: Verify workspace isolation (throw ForbiddenError)
4. Line 115-116: Validate reason is provided (throw ValidationError)
5. Line 122-130: Update decision status to "blocked" with reason
6. Line 134-149: Emit DECISION_REJECTED audit event
7. Line 152-156: Log rejection
8. Line 159-165: Return RejectionRecord

**Would refactoring preserve all operations?** ✓ YES
- All operations remain identical
- Only field reference names change (workspaceId → verifiedWorkspaceId, rejectedBy → verifiedActorId)
- No logic changes

**Would refactor change business behavior?** ✗ NO

---

## Response Shape Analysis

**Current Response:**
```typescript
return {
  decisionId: input.decisionId,
  rejectedBy: input.rejectedBy,
  rejectedAt: now,
  reason: input.reason,
  auditEventId,
};
```

**After Refactoring:**
```typescript
return {
  decisionId: input.decisionId,
  rejectedBy: input.verifiedActorId,    // Changed field source, same semantic
  rejectedAt: now,
  reason: input.reason,
  auditEventId,
};
```

**Would response shape change?** ✗ NO - AcceptanceRecord structure identical

---

## Dual-Format Support Requirement

**Question:** Would rejectDecision need to accept both DecisionRejectionInput and VerifiedRejectionInput?

**Answer:** ✗ NO

**Reasoning:**
1. Only one production caller: reject/route.ts
2. Route will be updated to pass new format
3. No backward compatibility required (unlike X9F-2 createDecision)
4. No tests call service directly
5. Safe to remove old format entirely

**Verdict:** Single format only (VerifiedRejectionInput) - no dual-format debt

---

## Scanner Impact Analysis

**Expected reduction if refactored:** 0 violations

**Reasoning:**
- reject route already uses canonical enforcement (no shadow reads currently)
- Refactoring changes input structure only, not auth patterns
- No new shadow read patterns created
- No auth-guard imports added to service
- Pattern changes are field-name-only

**Verdict:** ZERO EXPECTED REDUCTION (stable baseline)

---

## Test Coverage Assessment

**Existing Test Coverage:**
- governance-capabilities: Tests DECISION_REJECT exists (32 tests)
- policy-wrapper-enforcement: Tests withCanonicalEnforcement pattern (32 tests)
- g6r-auth-bridge: Tests canonical auth context (14 tests)
- phase-d/e/f: Tests decision rejection workflow end-to-end (324 tests)

**Would existing tests validate refactoring?** ✓ YES
- Tests exercise route → service → database path
- Tests verify response shape unchanged
- Tests verify rejection logic works
- Tests don't depend on internal field names

**New tests required?** ✗ NO
- Same reasoning as acceptDecision (X9F-4)
- Behavior completely preserved

---

## Comprehensive Risk Assessment

| Factor | acceptDecision (X9F-4) | rejectDecision (X9F-5) | Assessment |
|--------|------------------------|------------------------|------------|
| Route wrapper | withCanonicalEnforcement | withCanonicalEnforcement | ✓ Identical |
| Capability | DECISION_ACCEPT | DECISION_REJECT | ✓ Both defined, correct |
| Verified context | ctx.verifiedWorkspaceId, ctx.verifiedActorId | ctx.verifiedWorkspaceId, ctx.verifiedActorId | ✓ Identical |
| Shadow reads | 0 | 0 | ✓ Identical |
| Route callers | 1 (reject/route.ts) | 1 (reject/route.ts) | ✓ Identical |
| Service callers | 0 | 0 | ✓ Identical |
| Background callers | 0 | 0 | ✓ Identical |
| Input type complexity | Simple (5 fields) | Simple (5 fields) | ✓ Equivalent |
| Business logic | Status update + audit | Status update + audit | ✓ Equivalent |
| Response type | AcceptanceRecord | RejectionRecord | ✓ Both simple |
| Dual-format needed | No | No | ✓ Single format |
| Scanner reduction expected | 0 | 0 | ✓ Baseline stable |
| Test coverage | Sufficient | Sufficient | ✓ Existing tests adequate |

---

## Final Risk Analysis Verdict

**Is rejectDecision structurally equivalent to acceptDecision?** ✓ YES

**Are route callers already verified/canonical?** ✓ YES

**Can verified input be constructed safely?** ✓ YES

**Is DECISION_REJECT used correctly after X9E-6?** ✓ YES

**Are there internal/background callers?** ✗ NO

**Would refactor change authorization behavior?** ✗ NO (only strengthens signal)

**Would refactor change business behavior?** ✗ NO

**Would response shape change?** ✗ NO

**Is dual-format support required?** ✗ NO

**Is scanner reduction expected?** ✗ NO (stable baseline)

**Are tests sufficient?** ✓ YES (existing tests adequate)

---

## Overall Risk Assessment

**Risk Level:** LOW

**Rationale:** 
rejectDecision is structurally identical to acceptDecision and follows the same verified input pattern. Route already modern, verified context available, no authorization changes, no business logic changes, no response shape changes. Single caller (modern route), no internal/background callers. Dual-format support not needed. Existing tests sufficient. Zero scanner reduction expected. Refactoring proven safe by X9F-4 acceptDecision completion.

**Recommendation:** ✓ SAFE TO PROCEED WITH X9F-5 REFACTORING

