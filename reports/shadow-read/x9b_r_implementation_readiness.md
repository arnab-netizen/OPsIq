# X9B-R: Implementation Readiness Check

**Phase:** X9B-R (Policy Design Safety Review)  
**Date:** 2026-05-15  
**Status:** READINESS ASSESSMENT

---

## Is X9C Implementation Authorized?

**Answer: YES, AUTHORIZED**

**With conditions:**
1. ✓ Implement Option D (not Option A)
2. ✓ Wrapper pattern must be enforced (type-system enforcement)
3. ✓ Service layer must never receive CanonicalAuthContext
4. ✓ All tests must pass before merge
5. ✓ Code review with security focus required

---

## Exact Files That MAY Be Modified

### Infrastructure Layer (May Modify)
- `src/lib/canonical-route-enforcement.ts`
  - Add `withCanonicalPolicyEnforcement` function
  - Keep `withCanonicalEnforcement` unchanged
  - Add type definitions for options

- `src/lib/canonical-auth-facts.ts`
  - Add policy-related auth state building
  - No changes to existing capability logic

### Route Layer (May Modify)
- `src/app/api/engagements/route.ts`
  - Switch GET from `withCanonicalEnforcement` to `withCanonicalPolicyEnforcement`
  - Add `{requireInternalAccess: true}` option
  - Remove internal access calculation from handler

- `src/app/api/engagements/[engagementId]/route.ts`
  - Switch GET to policy-aware wrapper
  - Remove internal access calculation

- `src/app/api/me/route.ts`
  - Switch GET to policy-aware wrapper if needed
  - Remove policy checks from handler

- Any other routes using `ctx.policy ? hasInternalAccess : false`
  - Switch to new wrapper
  - Remove redundant checks

### Service Layer (May Modify - Later Phase)
- Any service accepting `ctx: CanonicalAuthContext`
  - Update signature to accept parameters: `(id, workspaceId, hasInternalAccess, verifiedCapabilities)`
  - Remove `ctx.policy` access
  - This happens in X9C-3, not X9C-1

### Test Layer (Must Modify)
- `src/__tests__/phase-g/g6r-auth-bridge.test.ts`
  - Add tests for `withCanonicalPolicyEnforcement`
  - Test policy checks fail-closed

- Route handler tests
  - Update tests to use new wrapper
  - Test policy option behavior

- Service layer tests
  - Update to pass parameters instead of ctx
  - No need to test ctx.policy access (it won't exist)

---

## Exact Files That MUST NOT Be Modified

### Core Identity/Capability Layer (DO NOT TOUCH)
- `src/lib/canonical-route-enforcement.ts` - `withCanonicalEnforcement` function
  - Must not change signature
  - Must not change behavior
  - Only add new function alongside

- `src/domain/constants/capabilities.ts`
  - Must not add DECISION_CREATE (deferred to later)
  - Must not change capability definitions

- `src/services/auth.ts`
  - Must not be refactored
  - Must not change service layer structure
  - Changes deferred to X9C-3

### Workspace/Role Layer (DO NOT TOUCH)
- Any workspace membership logic
  - Deferred to X9D design phase

- Custom role resolution (resolveServerRole)
  - Deferred to X9D design phase

- `src/middleware/workspace-enforcement.ts`
  - Must not be modified in X9C
  - Deferred to later phases

### Scanner Infrastructure (DO NOT TOUCH)
- `src/governance/auth-shadow-read-scanner.ts`
  - Must not be modified
  - X9C should not change violation count

- Scanner configuration
  - No new rule additions
  - No violation counting changes

### Legacy Auth System (DO NOT TOUCH)
- `src/lib/auth-guard.ts`
  - Must not be modified
  - Bridges still work
  - Will be addressed in X9F bridge removal

---

## Tests That Must Be Added/Updated

### New Tests Required (X9C-1)

**Wrapper Function Tests:**
```typescript
// Test withCanonicalPolicyEnforcement
- Test requireInternalAccess: true denies non-internal users (403)
- Test requireInternalAccess: true allows internal users (200)
- Test requirePolicyContext: true denies when policy missing (403)
- Test requireCapabilities combined with policy requirements
- Test fail-closed: all checks must pass before handler executes
```

**Policy Check Tests:**
```typescript
// Test hasInternalAccess computation
- Test client role returns false
- Test internal role returns true
- Test multiple roles picks internal
- Test missing policy defaults to false
```

### Updated Tests (X9C-1/2)

**Route Tests:**
```typescript
// Update GET handler tests
- engagements/route.ts GET
  - Must pass hasInternalAccess boolean
  - Visibility filtering still works
  
- engagements/[engagementId]/route.ts GET
  - Single engagement filtering works
  
- me/route.ts GET
  - User info response correct
```

**Service Tests (X9C-3):**
```typescript
// Update service function signatures
- getEngagementById(id, workspaceId, hasInternalAccess, capabilities)
  - No longer receives ctx
  - Boolean parameter works correctly
  
- getClientById(id, workspaceId, hasInternalAccess, capabilities)
  - Boolean parameter works
  
- Other visibility-filtering services
  - Updated signatures
  - Boolean parameter behavior
```

---

## Routes Available for First Pilot

### Safe Pilots (Ready X9C-1)

**src/app/api/engagements/route.ts - GET**
- Risk: LOW
- Current: `ctx.policy ? hasInternalAccess : false`
- Change: Switch to `withCanonicalPolicyEnforcement(..., {requireInternalAccess: false})` (optional)
- Test: Engagement list visibility filtering
- Proof: Same behavior, clearer wrapper choice

**src/app/api/engagements/[engagementId]/route.ts - GET**
- Risk: LOW
- Current: Uses internal access for visibility
- Change: Switch wrapper
- Test: Single engagement visibility
- Proof: Same behavior

**src/app/api/me/route.ts - GET**
- Risk: LOW
- Current: Returns user profile with isInternal flag
- Change: Switch wrapper (optional - not enforcing)
- Test: Profile response correct
- Proof: Same behavior

### Medium-Risk Pilots (X9C-2/3)

**Service Layer Refactoring** (getEngagementById, getClientById)
- Risk: MEDIUM (service signature changes)
- Current: Accepts ctx, accesses ctx.policy
- Change: Accept boolean parameters
- Test: All service tests with new signature
- Proof: Visibility filtering still works

---

## Routes Excluded from X9C

### Excluded: Workspace Enforcement Handlers
- Reason: Requires X9D workspace design
- Timeline: Later phases
- Example: POST/PATCH handlers in Lane 8

### Excluded: Custom Role Handlers
- Reason: Requires X9D role design
- Timeline: Later phases
- Example: admin/workspaces/[id]/disable

### Excluded: Non-Policy Routes
- Reason: No changes needed
- Timeline: No modifications required
- Example: POST handlers for decisions (capabilities only)

---

## Rollback Rule

### If Tests Fail
```
1. Identify failure (wrapper bug, type error, etc.)
2. Fix wrapper or tests
3. Re-run tests
4. Do NOT merge until all tests pass
```

### If Build Fails
```
1. Identify compilation error
2. Fix code
3. Verify build succeeds
4. Do NOT merge until build passes
```

### If Security Review Fails
```
1. Identify security concern
2. If Option D is fundamentally flawed:
   a. Revert to Option A + verifiedInternalAccess field
   b. Proceed with original plan
3. If specific implementation issue:
   a. Fix implementation
   b. Re-review
   c. Proceed
```

### Pre-Merge Checklist
- [ ] npm run build: PASS
- [ ] npm test -- g6r-auth-bridge: PASS
- [ ] npm test -- phase-d phase-e phase-f: PASS
- [ ] npx tsx src/governance/auth-shadow-read-scanner.ts: 450 violations
- [ ] Security code review: APPROVED
- [ ] All new tests passing
- [ ] No regressions in existing tests

---

## Expected Violation Reduction Timeline

### X9C-1 (Wrapper Creation)
- Violations: 450 (no reduction)
- Reason: New wrapper, no code elimination

### X9C-2 (Route Migration)
- Violations: 450-448 (potential -2)
- Reason: Cleaner patterns, same code

### X9C-3 (Service Parameter Refactoring)
- Violations: 442-445 (reduction -6 to -8)
- Reason: Service policy access eliminated

### Total Reduction
- Option D same as Option A: 6-10 violations
- But Option D achieves cleaner boundaries immediately
- Less risk window (no X9C-1/X9C-2 period with policy access)

---

## Decision Enforceability

**Option D enforcement mechanisms:**

1. **Type System:**
   - Service receives parameters, not CanonicalAuthContext
   - TypeScript compiler prevents access to `ctx.policy`
   - Cannot compile if code tries to access policy in service

2. **Wrapper Dispatch:**
   - Routes choose wrapper: `withCanonicalEnforcement` vs `withCanonicalPolicyEnforcement`
   - Clear distinction at call site
   - Policy-aware routes explicitly marked

3. **Test Coverage:**
   - Tests must pass before merge
   - Policy checks tested fail-closed behavior
   - Service tests verify parameters only

4. **Code Review:**
   - Security-focused review of wrapper implementation
   - Review of service parameter updates
   - No `ctx.policy` access in services (type system prevents)

---

**Status:** ✓ Implementation Readiness Confirmed

**Ready for X9C: Option D Implementation Phase**
