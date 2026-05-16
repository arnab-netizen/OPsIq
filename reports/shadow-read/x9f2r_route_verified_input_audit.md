# X9F-2R: Route Verified Input Audit

**Date:** 2026-05-16  
**Status:** ROUTE AUDIT COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Route Enforcement Analysis

### Current Route Pattern

**File:** src/app/api/decisions/create/route.ts

**Wrapper:** `withEnforcementFull` (legacy enforcement wrapper)

**Auth Pattern:**
1. Line 18: `const { session } = await withAuth();` - Get session (shadow read pattern)
2. Line 26: `const membership = await enforceWorkspaceScoping(request, workspaceId);` - Verify workspace
3. Line 32: `await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);` - Verify capability

---

## Verified Input Construction Analysis

### Single Decision Path

**Location:** Lines 61-72

**Code:**
```typescript
const { title, type, impact, confidence, problemType, expectedOutcome } = body;

const verifiedInput: VerifiedDecisionInput = {
  title,
  type,
  impact,
  confidence,
  verifiedActorId: userId,  // From session.user.id (line 38, verified by withAuth)
  verifiedWorkspaceId: workspaceId,  // From x-workspace-id header (verified at line 26)
  problemType,
  expectedOutcome,
};

const decision = await createDecision(verifiedInput);
```

**Verification Status:**
- ✓ userId comes from session.user.id (verified by withAuth at line 18)
- ✓ workspaceId comes from x-workspace-id header (verified by enforceWorkspaceScoping at line 26)
- ✓ DECISION_CREATE capability verified (line 32)
- ✓ VerifiedDecisionInput constructed from verified context only
- ✓ Business data (title, type, etc.) comes directly from user input (not auth-related)

**Verdict:** ✓ VERIFIED_CONTEXT_SAFE

---

### Bulk JSON Path

**Location:** Lines 44-52

**Code:**
```typescript
const decisions = body.decisions.map((d: any) => ({
  ...d,
  verifiedWorkspaceId: workspaceId,  // Verified at line 26
  verifiedActorId: userId,  // From session.user.id (verified by withAuth)
}));

const result = await createDecisionsBulk({ decisions });
```

**Verification Status:**
- ✓ userId from session.user.id (verified by withAuth)
- ✓ workspaceId from x-workspace-id (verified by enforceWorkspaceScoping)
- ✓ Each decision gets verifiedWorkspaceId and verifiedActorId
- ✓ Business data from user input (title, type, etc.)
- ✓ All decisions receive same verified actor and workspace

**Verdict:** ✓ VERIFIED_CONTEXT_SAFE

---

### CSV Upload Path

**Location:** Lines 102-109

**Code:**
```typescript
const parsedDecisions = parseCSV(csvContent, workspaceId, userId);
const verifiedDecisions = parsedDecisions.map((d: any) => ({
  ...d,
  verifiedWorkspaceId: workspaceId,  // Verified at line 26
  verifiedActorId: userId,  // From session.user.id (verified by withAuth)
}));
const result = await createDecisionsBulk({ decisions: verifiedDecisions });
```

**Verification Status:**
- ✓ userId from session.user.id (verified by withAuth)
- ✓ workspaceId from x-workspace-id (verified by enforceWorkspaceScoping)
- ✓ parseCSV converts legacy format to intermediate format
- ✓ Each parsed decision gets verifiedWorkspaceId and verifiedActorId
- ✓ Decisions passed with explicit verified markers

**Verdict:** ✓ VERIFIED_CONTEXT_SAFE

---

## Route Safety Assessment

### Wrapper Analysis

**Wrapper Used:** `withEnforcementFull` (legacy pattern)

**Pattern Status:** LEGACY but SAFE for this route

**Why Legacy:**
- Uses withAuth() instead of canonical enforcement
- Performs manual workspace/capability checks
- Not using CanonicalAuthContext pattern

**Why Still Safe:**
- Checks all required auth properties before using them
- Verifies session exists and has user.id
- Verifies workspace membership
- Verifies capability (DECISION_CREATE)
- All verified data is used to construct explicit VerifiedDecisionInput

**Verdict:** ✓ LEGACY_BUT_EQUIVALENT_SAFE

### Pre-Verification Confirmation

| Check | Status | Evidence |
|-------|--------|----------|
| Actor verification | ✓ YES | withAuth() → session.user.id |
| Workspace verification | ✓ YES | enforceWorkspaceScoping() → membership |
| Capability verification | ✓ YES | assertCapability(DECISION_CREATE) |
| Safe input construction | ✓ YES | VerifiedDecisionInput built from verified fields |
| Response shape unchanged | ✓ YES | Returns CreateDecisionResult (line 82) |
| Business behavior unchanged | ✓ YES | Service logic same, only input format differs |

---

## Response Shape Analysis

**Before Refactoring:**
```typescript
const decision = await createDecision({
  title, type, impact, confidence, workspaceId, userId, ...
});
return decision;
```

**After Refactoring:**
```typescript
const verifiedInput: VerifiedDecisionInput = { ... };
const decision = await createDecision(verifiedInput);
return decision;
```

**Response Shape:** ✓ UNCHANGED

Both return the same CreateDecisionResult type (id, title, problem, decisionType, impactExpected, confidence, createdAt).

---

## Business Behavior Analysis

**Request Parsing:** ✓ UNCHANGED
- Still extracts title, type, impact, confidence from body
- Still handles both JSON and CSV formats
- Still validates content-type

**Execution:**
- Still calls createDecision (now with verified input)
- Still calls createDecisionsBulk (with verified array)
- Still logs operations
- Still catches and reports errors

**Verdict:** ✓ UNCHANGED - No business logic changes

---

## Route Safety Classification

**Classification: VERIFIED_CONTEXT_SAFE**

### Summary

The route creates VerifiedDecisionInput only from pre-verified context:
1. ✓ Actor ID verified by withAuth()
2. ✓ Workspace ID verified by enforceWorkspaceScoping()
3. ✓ Capability verified by assertCapability()
4. ✓ All three call paths follow the same pattern
5. ✓ Response shape and business behavior unchanged

**Risk Assessment:**
- No security risk (all auth verified at route level)
- No behavior risk (logic unchanged)
- Minimal architectural risk (legacy pattern is acceptable because auth is verified)

**Verdict:** ✓ SAFE FOR PRODUCTION

---

## Conclusion

The route safely constructs VerifiedDecisionInput from pre-verified context. All three execution paths (single JSON, bulk JSON, CSV upload) follow the same pattern and provide explicit verified input to the service.

The legacy wrapper pattern (withEnforcementFull) is not ideal architecture, but it is functionally safe for this route because all required auth checks are performed before input construction.

The refactoring successfully strengthens the service's auth boundary at the route caller level.
