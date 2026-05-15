# X9C-1T: Policy Wrapper Test Coverage Audit

**Phase:** X9C-1T (Policy Wrapper Test Closeout)  
**Date:** 2026-05-15  
**Status:** COVERAGE ASSESSMENT

---

## Test Coverage Assessment

### Direct Test Coverage for withCanonicalPolicyEnforcement

**Current Status:** ❌ NO DIRECT TESTS EXIST

**Evidence:**
```bash
grep -r "withCanonicalPolicyEnforcement" src/__tests__ 
```
Result: No matches found in test files.

### Existing Test Suite Structure

**Found Test Files:**
1. `src/__tests__/phase-g/g6r-auth-bridge.test.ts` (14 tests)
   - Tests: `canonicalizeAuthContext` bridge function
   - Pattern: Helper function testing with fail-closed verification
   - Coverage: Identity preservation, capability extraction, fail-closed behavior

2. `src/__tests__/phase6-route-convergence.test.ts`
   - Tests: Route convergence and wrapper enforcement patterns
   - Pattern: Mutation detection and wrapper verification
   - Coverage: Wrapper behavior at route level

3. `src/__tests__/middleware/request-validation.test.ts`
   - Tests: Request validation with NextRequest mocking
   - Pattern: NextRequest creation, async handler testing
   - Coverage: Request/response handling patterns

### Wrapper Testing Pattern Analysis

**Existing withCanonicalEnforcement Testing:**
- No dedicated functional tests of the wrapper itself
- Wrapper is tested indirectly through route scanning and mutation detection
- No fail-closed policy check tests exist

**Test Infrastructure Available:**
- ✓ NextRequest mocking (pattern from request-validation.test.ts)
- ✓ Fail-closed verification pattern (from g6r-auth-bridge.test.ts)
- ✓ Vitest framework with describe/it/expect
- ✓ Helper function pattern (createAuthContext)

---

## Required Test Cases: Gap Analysis

### Test Case 1: Unauthenticated Request Fails Closed
**Status:** ❌ MISSING
- Required: Wrapper returns 403 for invalid auth
- Pattern: Mock NextRequest with no auth header, verify 403 response

### Test Case 2: Missing Policy Fails Closed (requirePolicyContext=true)
**Status:** ❌ MISSING
- Required: Wrapper returns 403 when ctx.policy is undefined
- Pattern: Valid auth, no policy, requirePolicyContext option enabled

### Test Case 3: Malformed Policy Fails Closed
**Status:** ❌ MISSING
- Required: Wrapper handles null/undefined policy gracefully
- Pattern: Policy with missing required fields (userId, roles)

### Test Case 4: Policy Workspace Mismatch Fails Closed
**Status:** ❌ MISSING
- Required: Wrapper validates policy belongs to request workspace
- Pattern: Policy from different workspace than context

### Test Case 5: requireInternalAccess True / False
**Status:** ❌ MISSING
- Required: Wrapper checks hasInternalAccess(policy) when option enabled
- Pattern: Policy with client role (false) vs admin role (true)

### Test Case 6: Internal Access Explicit True
**Status:** ❌ MISSING
- Required: Only allow handler execution when internal access is explicitly true
- Pattern: Non-permissive fallback, explicit verification

### Test Case 7: Role/Tier Preservation
**Status:** ❌ MISSING
- Required: Context roles preserved when auth passes
- Pattern: Context comparison after successful auth

### Test Case 8: Handler Only Executes After All Checks
**Status:** ❌ MISSING
- Required: Handler never called if any check fails
- Pattern: Mock handler with spy, verify call count

### Test Case 9: Existing withCanonicalEnforcement Unchanged
**Status:** ❌ MISSING
- Required: Verify new wrapper doesn't break existing wrapper behavior
- Pattern: Test routes using withCanonicalEnforcement still work

### Test Case 10: No Permissive Fallback
**Status:** ❌ MISSING
- Required: Policy checks never default to permissive behavior
- Pattern: Verify 403 on missing/invalid policy, never 200

---

## Recommended Test Pattern

Based on existing test infrastructure:

```typescript
describe("withCanonicalPolicyEnforcement", () => {
  // Helper pattern (from g6r-auth-bridge.test.ts)
  function createValidCanonicalContext(overrides?: Partial<CanonicalAuthContext>): CanonicalAuthContext {
    return {
      verifiedActorId: "user-123",
      verifiedActorType: "user",
      verifiedActor: { id: "user-123", email: "test@example.com", ... },
      verifiedWorkspaceId: "workspace-789",
      verifiedCapabilities: new Set(["AUDIT_VIEW"]),
      verifiedSessionSnapshot: { ... },
      policy: {
        userId: "user-123",
        roles: [{ role: "admin", scope: "workspace", scopeId: "workspace-789" }],
        engagementMemberships: [],
      },
      ...overrides,
    };
  }

  // Test pattern (from request-validation.test.ts)
  it("should enforce requireInternalAccess check", async () => {
    const wrapper = withCanonicalPolicyEnforcement(
      async (ctx) => ({ success: true }),
      { requireInternalAccess: true }
    );
    
    const req = new NextRequest("http://localhost/api/test", { method: "GET" });
    const response = await wrapper(req, { params: Promise.resolve({}) });
    
    expect(response.status).toBe(403); // fail-closed
  });
});
```

---

## Implementation Strategy

**Phase 1: Create Test File**
- Location: `src/__tests__/phase-g/policy-wrapper-enforcement.test.ts`
- Pattern: Reuse g6r-auth-bridge + request-validation patterns
- Coverage: 10 required test cases

**Phase 2: Test Helpers**
- Helper: Create valid CanonicalAuthContext
- Helper: Create valid PolicyContext
- Helper: Create invalid PolicyContext variations

**Phase 3: Policy Validation Tests**
- Test: requireInternalAccess enforcement
- Test: requirePolicyContext enforcement
- Test: Handler execution ordering

**Phase 4: Fail-Closed Verification**
- Test: No permissive defaults
- Test: 403 on all failure modes
- Test: Handler never reaches on auth failure

---

## Files to Review for Pattern

✓ `src/__tests__/phase-g/g6r-auth-bridge.test.ts` - Fail-closed pattern
✓ `src/__tests__/middleware/request-validation.test.ts` - NextRequest pattern
✓ `src/lib/canonical-route-enforcement.ts` - Implementation to test
✓ `src/policies/capability-check.ts` - hasInternalAccess function

---

## Test Framework Assessment

✓ Vitest: Configured and working (338/338 tests pass)
✓ NextRequest mocking: Available and tested pattern
✓ Fail-closed verification: Existing pattern in codebase
✓ Helper function pattern: Established in g6r-auth-bridge.test.ts

**Readiness:** ✓ READY FOR IMPLEMENTATION

---

## Conclusion

**Coverage Status:** ❌ NO DIRECT TESTS FOR withCanonicalPolicyEnforcement

**Missing:** All 10 required test cases for policy wrapper enforcement

**Gap Severity:** 🔴 CRITICAL
- Wrapper is new, untested functionality
- Policy checks are security-critical
- Fail-closed behavior must be verified
- Cannot proceed to route migration without test coverage

**Recommended Action:** Implement all 10 test cases using established patterns

---

**Status:** ✓ AUDIT COMPLETE - READY FOR TEST IMPLEMENTATION
