# X9E-3: Implementation Plan for Next Phase

**Date:** 2026-05-15  
**Status:** IMPLEMENTATION PLAN READY  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Next Phase Designation

**Phase name:** X9E-4 (Decision Route Cleanup - Pilot 2: Recommendations)

**Scope:** Route cleanup only - recommendations route

**Type:** Single route string-to-constant replacement (same pattern as X9E-2)

---

## Selected Pilot Details

### Pilot: DECISION_ROUTE_CLEANUP_PILOT_2

**Target file:** `src/app/api/recommendations/route.ts`

**Handler:** `POST /api/recommendations`

**Change type:** String literal → Domain constant

**Specific changes:**
```typescript
// Line 53 - Change from:
const capabilityCheck = await assertCapability(workspaceId, "decision_create");

// To:
const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);

// Line 55 - Change from:
throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");

// To:
throw new PlanLimitError(CAPABILITIES.DECISION_CREATE, capabilityCheck.reason || "Plan limit exceeded");
```

---

## Files Allowed for Modification

**Authorized to modify:**
1. `src/app/api/recommendations/route.ts` (2 line changes only)

**Optional:**
- Test files (if adding test cases for constant usage)

**Strictly forbidden:**
- Any other route files
- Accept/reject/close/list routes
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

**Before X9E-4:** 448 total violations (283 critical, 165 block-build)

**Expected after X9E-4:** 447 total violations (1 reduction expected)

**Why reduction occurs:**
- Route currently uses string literal "decision_create"
- Scanner pattern recognizes string literals as violations
- After replacement with CAPABILITIES.DECISION_CREATE, pattern changes
- Scanner recognizes domain constant reference as safe pattern
- Result: 1 violation removed (assertCapability reference)

**Note:** Reduction is NOT guaranteed - depends on scanner pattern matching. If no reduction occurs, it's still successful cleanup (pattern improvement).

---

## Validation Commands for X9E-4

**Phase E validation will run:**

1. `npm run build` - Verify TypeScript compilation
2. `npm test -- governance-capabilities` - Verify constant still works in tests
3. `npm test -- policy-wrapper-enforcement` - Ensure no regression in policy tests
4. `npm test -- g6r-auth-bridge` - Ensure no regression in auth bridge tests
5. `npm test -- phase-d phase-e phase-f` - Ensure all phase tests still pass
6. `npx tsx src/governance/auth-shadow-read-scanner.ts` - Verify scanner result

**All tests must pass (402/402 minimum)**

---

## Rollback Rule

**If any validation gate fails during X9E-4:**

1. Revert `src/app/api/recommendations/route.ts` to original state
2. Re-run build - should pass
3. Re-run tests - should return to 402/402 passing
4. Scanner should return to 448 violations

**Cost of rollback:** Minimal (revert 2 line changes)

**Complexity of rollback:** Low (single file, single logical change)

---

## Stop Conditions for X9E-4

**Stop and do NOT proceed if:**

❌ Build fails  
❌ Tests fail (less than 402/402 passing)  
❌ Scanner shows NEW violations (increases beyond 448)  
❌ Governance-capabilities test fails  
❌ Route functionality breaks (recommendation creation no longer works)  

**Expected:** None of these should occur (identical pattern to successful X9E-2)

---

## Maximum Scope for X9E-4

**Absolute limits:**

- ✓ Maximum 1 file modified (recommendations/route.ts)
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

## Timeline Estimate for X9E-4

- 5 min: Make 2 line changes to recommendations/route.ts
- 10 min: Run build and test suite validation
- 5 min: Run scanner and verify result
- 5 min: Document proof requirements
- 5 min: Generate validation report

**Total: ~30 minutes execution time (identical to X9E-2)**

---

## Expected Outcome of X9E-4

**If successful:**
- ✓ String-to-constant replacement complete
- ✓ Code is type-safe for DECISION_CREATE
- ✓ Scanner shows 1 violation reduction (if pattern recognized)
- ✓ Foundation continues for decision governance type safety
- ✓ Route cleanup pattern demonstrated again (proven repeatable)
- ✓ X9E-4 marked as ACCEPTED

**Next steps after X9E-4:**
- [ ] X9E-5 (Additional route cleanups if needed) - if approved
- [ ] X9F (Service refactoring coordination) - after route cleanups
- [ ] Governance clarification on reject route capability bug
- [ ] Close route enhancement design

---

## What Happens if X9E-4 Fails

**Rollback path:**
1. Revert changes to recommendations/route.ts
2. Re-run tests to verify revert
3. File failure report documenting:
   - Which validation gate failed
   - Why it failed
   - Recommended remediation

**No further action needed - pilot deferred for investigation**

---

## Blocking Issue Clarifications Needed Before Service Refactoring

Before proceeding to service refactoring phases (X9F), the following must be clarified:

1. **Reject route capability bug:** Is "DECISION_ACCEPT" in reject route intentional (unified capability) or a bug?
2. **Close route enhancement:** What capability should close operation require?
3. **Service coupling:** Should accept and reject be refactored together or separately?

These clarifications will inform the X9F service refactoring phase design.

---

## Summary

**Phase X9E-4 is ready to proceed with:**
- Single file modification (recommendations/route.ts)
- Two line changes (string → constant)
- Clear validation gates
- Simple rollback path
- Expected 1 violation reduction
- No service changes
- No business logic changes
- Minimal risk
- Clear success criteria
- Proven pattern from X9E-2 success

**Estimated cost:** 30 minutes execution + ~10 minutes review

**Estimated benefit:** Type-safe constant usage + 1 scanner reduction + continued foundation for service refactoring
