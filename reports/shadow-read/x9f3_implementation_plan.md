# X9F-3: Implementation Plan for Next Phase

**Date:** 2026-05-16  
**Phase:** X9F-3 Implementation Phase (Ready for authorization)  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Selected Pilot

**Service:** acceptDecision  
**File:** src/services/decision-validation/decision-acceptance.service.ts  
**Route:** src/app/api/decisions/[decisionId]/accept/route.ts

---

## Execution Strategy

This phase will apply the same verified input pattern established in X9F-2 (createDecision refactoring):

1. Create VerifiedAcceptanceInput interface (explicit verified field names)
2. Update acceptDecision signature to accept verified input
3. Update route to construct verified input from verified context
4. Preserve all business logic and response shape

---

## Allowed Changes

### Service Changes (decision-acceptance.service.ts)

**Addition: VerifiedAcceptanceInput Interface**
```typescript
export interface VerifiedAcceptanceInput {
  decisionId: string;           // business data
  engagementId: string;         // business data
  workspaceId: string;          // (unchanged - passed as parameter)
  verifiedActorId: string;      // From session.user.id (verified by withAuth)
  verifiedWorkspaceId: string;  // From x-workspace-id header (verified)
  rationale?: string;           // business data
}
```

**Signature Update:**
```typescript
// Before:
export async function acceptDecision(input: DecisionAcceptanceInput)

// After:
export async function acceptDecision(input: VerifiedAcceptanceInput)
```

**Logic:** Business logic preserved. No canonicalization. Service receives pre-verified input.

### Route Changes (accept/route.ts)

**Construction Point:**
```typescript
// Before:
const result = await acceptDecision({
  decisionId,
  engagementId: parsed.engagementId,
  workspaceId,
  acceptedBy: ctx.verifiedActorId,
  rationale: parsed.rationale,
});

// After:
const verifiedInput: VerifiedAcceptanceInput = {
  decisionId,
  engagementId: parsed.engagementId,
  workspaceId,  // from route context (not verified until service)
  verifiedActorId: ctx.verifiedActorId,    // Explicitly verified
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,  // Explicitly verified
  rationale: parsed.rationale,
};
const result = await acceptDecision(verifiedInput);
```

**No wrapper changes.** No response shape changes.

---

## Forbidden Changes

- ✗ Cannot accept AuthContext in service
- ✗ Cannot perform service-side canonicalization
- ✗ Cannot change response shape (AcceptanceRecord)
- ✗ Cannot change business logic
- ✗ Cannot modify route wrapper (must stay withCanonicalEnforcement)
- ✗ Cannot modify accept route handler pattern
- ✗ Cannot add new capabilities
- ✗ Cannot create dual-format support (not needed)
- ✗ Cannot use any/as any
- ✗ Cannot create fake verified input
- ✗ Cannot skip auth checks
- ✗ Cannot modify other decision services
- ✗ Cannot modify auth context
- ✗ Cannot modify scanner or wrappers

---

## Files Allowed to Change

**ALLOWED (scope):**
- src/services/decision-validation/decision-acceptance.service.ts (service refactoring)
- src/app/api/decisions/[decisionId]/accept/route.ts (route caller update)

**NOT ALLOWED (out of scope):**
- src/app/api/decisions/[decisionId]/reject/route.ts
- src/services/decisions/decision-lifecycle.service.ts
- src/app/api/decisions/[decisionId]/close/route.ts
- Any wrapper files
- Any auth context files
- Any capability definitions
- Any other service files

---

## Validation Plan

### Build Validation
```bash
npm run build
```
Expected: 0 errors, all static pages render

### Test Validation
```bash
npm test -- governance-capabilities
npm test -- policy-wrapper-enforcement
npm test -- g6r-auth-bridge
npm test -- phase-d phase-e phase-f
```
Expected: All 402 tests pass (no regressions)

### Scanner Validation
```bash
npx tsx src/governance/auth-shadow-read-scanner.ts
```
Expected: 448 total violations (baseline maintained, no new violations)

---

## Success Criteria Verification

### Requirement 1: Service Signature Preserves Auth Boundary
✓ **Check:** VerifiedAcceptanceInput must have explicit verifiedActorId and verifiedWorkspaceId fields  
✓ **Check:** Old field names (acceptedBy, workspaceId) must not appear in service input  
✓ **Verification:** Type definition review

### Requirement 2: Route Constructs Verified Input from Verified Context
✓ **Check:** Route must assign ctx.verifiedActorId → verifiedActorId  
✓ **Check:** Route must assign ctx.verifiedWorkspaceId → verifiedWorkspaceId  
✓ **Check:** No raw parameters passed as verified fields  
✓ **Verification:** Route code review

### Requirement 3: No Weak Auth Accepted
✓ **Check:** acceptDecision must not accept old DecisionAcceptanceInput format  
✓ **Check:** acceptDecision must not have fallback logic for raw parameters  
✓ **Verification:** No dual-format support (unlike X9F-2, which had temporary backward compatibility)

### Requirement 4: No Service-Side Canonicalization
✓ **Check:** Service must not call getSession(), withAuth(), or any auth functions  
✓ **Check:** Service must not perform capability checks  
✓ **Check:** Service must not canonicalize input  
✓ **Verification:** Code review - no auth imports

### Requirement 5: Business Logic Preserved
✓ **Check:** validateDecisionForAcceptance still called  
✓ **Check:** Status update to "in_progress" still happens  
✓ **Check:** Audit event still emitted  
✓ **Check:** All database operations unchanged  
✓ **Verification:** Test results (no test changes needed)

### Requirement 6: Response Shape Preserved
✓ **Check:** acceptDecision still returns AcceptanceRecord  
✓ **Check:** Route still returns result unchanged  
✓ **Verification:** No response type changes

### Requirement 7: Tests Pass
✓ **Check:** governance-capabilities: 32/32 pass  
✓ **Check:** policy-wrapper-enforcement: 32/32 pass  
✓ **Check:** g6r-auth-bridge: 14/14 pass  
✓ **Check:** phase-d/e/f: 324/324 pass  
✓ **Total:** 402/402 pass

### Requirement 8: Scanner Result Verified
✓ **Check:** Scanner total violations = 448 (no new violations)  
✓ **Check:** Critical violations = 283 (no new critical violations)  
✓ **Check:** Block-build violations = 165 (no new block-build violations)  
✓ **Verification:** Scanner output review

---

## Expected Changes Summary

| Metric | Value |
|--------|-------|
| Files modified | 2 |
| Lines added | ~25 |
| Lines removed | 0 |
| New tests | 0 |
| Scanner reduction | 0 |
| Risk level | LOW |

---

## Rollback Rule

If validation gates fail:
1. Revert changes to both service and route files
2. No partial rollback
3. Return to baseline (X9F-2R acceptance state)

---

## Stop Conditions

Stop and escalate if:
- Build fails
- Any test fails
- Scanner detects new violations
- acceptDecision signature changes response shape
- Route adds shadow reads
- Service accepts old DecisionAcceptanceInput format
- Any forbidden change pattern detected

---

## Maximum Scope

**Hard limits:**
- Only 1 service: acceptDecision
- Only 1 route: accept/route.ts
- Only 1 input type: VerifiedAcceptanceInput
- Only 1 response type: AcceptanceRecord (unchanged)
- No dual-format support needed
- No new capabilities
- No new tests
- No wrappers changed
- No auth context changed

---

## Next Phase Recommendation

After X9F-3 completion and validation:
- **X9F-4:** rejectDecision refactoring (identical pattern to acceptDecision)
- **X9G:** closeDecision + close route modernization (blocked until governance phase)

