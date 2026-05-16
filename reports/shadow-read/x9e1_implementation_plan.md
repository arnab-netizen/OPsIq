# X9E-1: Implementation Plan for Next Phase

**Date:** 2026-05-15  
**Status:** IMPLEMENTATION PLAN READY  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Next Phase Designation

**Phase name:** X9E-2 (Decision Route Cleanup - Pilot 1)

**Scope:** Route cleanup only - decisions/create

**Type:** Single route string-to-constant replacement

---

## Selected Pilot Details

### Pilot: DECISION_ROUTE_CLEANUP_PILOT_1

**Target file:** `src/app/api/decisions/create/route.ts`

**Handler:** `POST /api/decisions/create`

**Change type:** String literal → Domain constant

**Specific changes:**
```typescript
// Line 30 - Change from:
const capabilityCheck = await assertCapability(workspaceId, "decision_create");

// To:
const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);

// Line 32 - Change from:
throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");

// To:
throw new PlanLimitError(CAPABILITIES.DECISION_CREATE, capabilityCheck.reason || "Plan limit exceeded");
```

---

## Files Allowed for Modification

**Authorized to modify:**
1. `src/app/api/decisions/create/route.ts` (2 line changes only)

**Optional:**
- Test files (if adding test cases for constant usage)

**Strictly forbidden:**
- Any other route files
- Any service files
- Any test files outside governance scope
- Any middleware or lib files

---

## Route/Service/Test Changes Allowed

### Route changes allowed:
- ✓ Replace "decision_create" with CAPABILITIES.DECISION_CREATE (2 instances)
- ✓ Update error message to use constant
- ✓ No other route logic changes

### Service changes allowed:
- ✗ NONE (service layer unchanged)

### Test changes allowed:
- ✓ Verify constant usage in route tests
- ✓ No new test files created

---

## Scanner Expectation

**Before X9E-2:** 448 total violations (283 critical, 165 block-build)

**Expected after X9E-2:** 446-447 total violations (2-3 reduction)

**Why reduction occurs:**
- Route currently uses string literal "decision_create"
- Scanner pattern recognizes string literals as violations
- After replacement with CAPABILITIES.DECISION_CREATE, pattern changes
- Scanner recognizes domain constant reference as safe pattern
- Result: 2 violations removed (one for each assertCapability reference)

**Note:** Reduction is NOT a code violation. It's a pattern recognition improvement by scanner.

---

## Validation Commands for X9E-2

**Phase E validation will run:**

1. `npm run build` - Verify TypeScript compilation
2. `npm test -- governance-capabilities` - Verify constant still works in tests
3. `npm test -- policy-wrapper-enforcement` - Ensure no regression in policy tests
4. `npm test -- g6r-auth-bridge` - Ensure no regression in auth bridge tests
5. `npm test -- phase-d phase-e phase-f` - Ensure all phase tests still pass
6. `npx tsx src/governance/auth-shadow-read-scanner.ts` - Verify scanner reduction

**All tests must pass (402/402 minimum)**

---

## Rollback Rule

**If any validation gate fails during X9E-2:**

1. Revert `src/app/api/decisions/create/route.ts` to original state
2. Re-run build - should pass
3. Re-run tests - should return to 402/402 passing
4. Scanner should return to 448 violations

**Cost of rollback:** Minimal (revert 2 line changes)

**Complexity of rollback:** Low (single file, single logical change)

---

## Stop Conditions for X9E-2

**Stop and do NOT proceed if:**

❌ Build fails  
❌ Tests fail (less than 402/402 passing)  
❌ Scanner shows NEW violations (increases beyond 448)  
❌ Governance-capabilities test fails  
❌ Route functionality breaks (decision creation no longer works)  

**Expected:** None of these should occur (straight forward string replacement)

---

## Maximum Scope for X9E-2

**Absolute limits:**

- ✓ Maximum 1 file modified (decisions/create/route.ts)
- ✓ Maximum 2 lines changed (2 string literals)
- ✓ Maximum 0 service functions touched
- ✓ Maximum 0 new capabilities
- ✓ Maximum 0 new route files
- ✓ Maximum 0 wrapper changes
- ✓ Maximum 0 auth context changes
- ✓ Maximum 0 response shape changes
- ✓ Maximum 0 business logic changes

**If scope creeps beyond these limits, stop and file a report.**

---

## Guardrails for X9E-2

**Before any code change in X9E-2:**

- [ ] Verify build passes (current state 8.1s compile)
- [ ] Verify all tests pass (current state 402/402)
- [ ] Verify scanner baseline (current state 448 violations)
- [ ] Verify CAPABILITIES.DECISION_CREATE exists in capabilities.ts

**During code change:**

- [ ] Only modify lines 30 and 32 in decisions/create/route.ts
- [ ] No other files touched
- [ ] No logic changes, only string replacement

**After code change:**

- [ ] Verify build still passes
- [ ] Verify all tests still pass (402/402 minimum)
- [ ] Verify scanner shows 2-3 fewer violations (445-446)
- [ ] Verify no NEW violations introduced

---

## Proof Requirements for X9E-2

**Must demonstrate:**

1. **auth_behavior_preserved**
   - assertCapability still called with same arguments
   - Entitlement check still happens
   - Quota enforcement unchanged

2. **capability_mapping_uses_domain_constant**
   - String "decision_create" replaced with CAPABILITIES.DECISION_CREATE
   - Constant value is "decision:create"
   - Mapping is correct and type-safe

3. **no_entitlement_bypass**
   - assertCapability function unchanged
   - Still maps domain constant to entitlement string internally
   - Tier configs still enforced

4. **no_service_side_canonicalization**
   - Service functions unchanged
   - No new AuthContext or canonicalization added
   - Only route-side change

5. **business_logic_preserved**
   - Decision creation logic unchanged
   - CSV parsing unchanged
   - Bulk creation unchanged
   - Response format unchanged

6. **response_shape_preserved**
   - Response building code unchanged
   - Error responses unchanged
   - Response shape identical before and after

7. **tests_pass**
   - All 402 existing tests pass
   - No test modifications (except for test file if adding tests)
   - No regression in any test suite

8. **scanner_result_verified**
   - Scanner runs successfully after change
   - Shows 2-3 fewer violations than baseline 448
   - No new violations introduced

---

## Timeline Estimate for X9E-2

- 5 min: Make 2 line changes to decisions/create/route.ts
- 10 min: Run build and test suite validation
- 5 min: Run scanner and verify reduction
- 5 min: Document proof requirements
- 5 min: Generate validation report

**Total: ~30 minutes execution time**

---

## Expected Outcome of X9E-2

**If successful:**
- ✓ String-to-constant replacement complete
- ✓ Code is type-safe for DECISION_CREATE
- ✓ Scanner shows 2-3 violation reduction
- ✓ Foundation established for future service refactoring
- ✓ Route cleanup pattern demonstrated
- ✓ X9E-2 marked as ACCEPTED

**Next steps after X9E-2:**
- [ ] X9E-3 (recommendations route cleanup) - if approved
- [ ] X9E-4+ (other route cleanups) - if approved
- [ ] X9F (Service refactoring coordination) - after route cleanups complete

---

## If X9E-2 Fails

**Rollback path:**
1. Revert changes to decisions/create/route.ts
2. Re-run tests to verify revert
3. File failure report documenting:
   - Which validation gate failed
   - Why it failed
   - Recommended remediation

**No further action needed - pilot deferred for investigation**

---

## Authorization for X9E-2

**Authorization status:** PENDING APPROVAL

**Authorized scope:** Single route cleanup (decisions/create)

**Authorization level:** LOW RISK - String replacement only

**Approval required before:** X9E-2 can begin implementation

---

## Summary

**Phase X9E-2 is ready to proceed with:**
- Single file modification (decisions/create/route.ts)
- Two line changes (string → constant)
- Clear validation gates
- Simple rollback path
- Expected 2-3 violation reduction
- No service changes
- No business logic changes
- Minimal risk
- Clear success criteria

**Estimated cost:** 30 minutes execution + ~10 minutes review

**Estimated benefit:** Type-safe constant usage + 2-3 scanner reduction + foundation for service refactoring
