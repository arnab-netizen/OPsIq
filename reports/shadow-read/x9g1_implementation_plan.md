# X9G-1: Implementation Plan for Next Phase (X9G-2)

**Date:** 2026-05-16  
**Governance Design:** ADD_DECISION_CLOSE  
**Next Phase Name:** X9G-2 (closeDecision route governance implementation)  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Next Phase Specification

### Phase Name
**X9G-2** - closeDecision Route Governance Implementation

### Whether Implementation Is Authorized
**YES**

All governance decisions made in X9G-1. X9G-2 can proceed immediately.

---

## Files Allowed to Change in X9G-2

### Primary Changes Required
1. **src/app/api/decisions/[decisionId]/close/route.ts**
   - Add DECISION_CLOSE capability check
   - Migrate auth pattern from legacy withAuth() to capability-based

2. **src/domain/constants/capabilities.ts**
   - Add DECISION_CLOSE capability constant

### Reports Only (No Code)
- X9G-2_preimplementation_confirmation.md
- X9G-2_route_update_notes.md
- X9G-2_validation.md
- X9G-2_scope_audit.json
- X9G-2_acceptance_decision.md

### Optionally Allowed (If Service Refactor Bundled)
- src/services/decisions/decision-lifecycle.service.ts (service refactor, if phased with route)
- Additional reports for service refactor

---

## Files Forbidden in X9G-2

- ✗ acceptDecision (unchanged)
- ✗ rejectDecision (unchanged)
- ✗ createDecision (unchanged)
- ✗ Other decision services
- ✗ Other routes
- ✗ Wrapper patterns
- ✗ Auth context services
- ✗ Other capability constants
- ✗ Scanner modifications
- ✗ Business logic changes

---

## Route Changes Allowed in X9G-2

### Allowed Changes to close/route.ts

#### 1. Import DECISION_CLOSE Capability
```typescript
// Add to imports:
import { CAPABILITIES } from "@/domain/constants/capabilities";
```

#### 2. Add Capability Requirement
```typescript
// Add to route handler or wrapper:
requireCapabilities: ["DECISION_CLOSE"],
```

#### 3. Optional: Migrate Auth Pattern
```typescript
// Option A: Keep legacy withAuth(), just add capability check
if (!hasPermission(membership.role, "close_decision")) {
  throw new Error("Insufficient permissions");
}

// Option B: Migrate to enforceCapability (future pattern)
enforceCapability(ctx, "DECISION_CLOSE");
```

#### 4. Optional: Use Verified Input Pattern (If Bundled with Service)
```typescript
// Future refactor (X9G-3 or bundled):
const verifiedInput: VerifiedClosureInput = {
  decisionId,
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,
  verifiedActorId: ctx.verifiedActorId,
};
const result = await closeDecision(verifiedInput);
```

### Not Allowed (Must Stay as-is)
- ✗ Wrapper changes (withEnforcementFull stays)
- ✗ Handler signature changes
- ✗ Response shape changes
- ✗ Business logic changes
- ✗ Logging changes (except auth-related)
- ✗ Error handling changes

---

## Service Refactor Decision for X9G-2

### Service Changes - NOT REQUIRED

**Default for X9G-2:** Service refactor is OPTIONAL

**Decision Points:**

#### Option 1: Route Only (Recommended for X9G-2)
- Add DECISION_CLOSE capability check to route
- Leave service unchanged
- Can be done immediately

**Pros:**
- Smaller scope
- Lower risk
- Clear separation of concerns
- Service refactor can be X9G-3 if desired

**Cons:**
- Service still on old pattern
- Not fully modernized

#### Option 2: Bundle Service Refactor with Route (If Preferred)
- Route adds DECISION_CLOSE capability check
- Service refactored to use VerifiedClosureInput pattern (optional)
- Same pattern as X9F-4 (acceptDecision), X9F-6 (rejectDecision)

**Pros:**
- Fully modernized in one phase
- Service matches other decision operations
- Complete refactor done

**Cons:**
- Larger scope
- More complexity
- Higher risk (service refactor adds variables)

### Recommendation
**Route Only (Option 1)** for X9G-2, with X9G-3 as optional later phase for service refactor

---

## Test Changes Allowed in X9G-2

**No test changes required.**

Existing tests already exercise close functionality:
- Governance tests verify DECISION_CLOSE exists
- Phase tests verify close flow works
- No new test cases needed (no behavior change)

If service refactored, follow X9F-4/X9F-6 pattern (no new tests needed).

---

## Scanner Expectation for X9G-2

**Before:** 448 total violations (283 critical, 165 block-build)

**After X9G-2 Route Update:**
- Expected: 448 total violations (NO change expected)
- Reasoning: Adding capability check doesn't introduce new shadow reads
- Close route currently has legacy auth violations (4 total)
- These violations may remain if legacy pattern partially kept
- Full elimination would require deeper refactor

**Change Expected:** 0 (zero new violations)

**Status:** Baseline stable

---

## Validation Commands for X9G-2

After implementing X9G-2, must run:

```bash
# 1. Build (0 TypeScript errors expected)
npm run build

# 2. Governance capabilities test (verify DECISION_CLOSE exists)
npm test -- governance-capabilities

# 3. Wrapper enforcement test (verify enforcement patterns)
npm test -- policy-wrapper-enforcement

# 4. Auth bridge test (verify auth context)
npm test -- g6r-auth-bridge

# 5. Integration tests (verify close flow still works)
npm test -- phase-d phase-e phase-f

# 6. Scanner baseline (expect 448, no new violations)
npx tsx src/governance/auth-shadow-read-scanner.ts
```

**Expected Results:**
- Build: ✓ PASS (0 errors)
- Governance: ✓ PASS (32/32, DECISION_CLOSE verified)
- Wrapper: ✓ PASS (32/32)
- Auth bridge: ✓ PASS (14/14)
- Integration: ✓ PASS (324/324)
- Scanner: ✓ PASS (448 baseline)

---

## Rollback Rule for X9G-2

If any validation gate fails:

1. **Identify failure:** Which gate failed?
2. **Revert changes:**
   - Remove DECISION_CLOSE from capabilities.ts (if added)
   - Revert route capability check
   - Keep service unchanged (no changes made)
3. **Investigate root cause**
4. **Do not re-attempt** in same session
5. **Document failure** for next session

**Rollback is safe** because:
- Service is unchanged
- Only route and capability constant changed
- No data migration
- No state changes
- Easy to revert both changes

---

## Stop Conditions for X9G-2

**Automatically stop if:**

1. **Build fails** (TypeScript error)
   - Action: Revert, investigate type mismatch
   
2. **Any test suite fails** (>0 failures)
   - Action: Revert, investigate test failure
   
3. **Scanner shows new violations** (>448 total)
   - Action: Revert, investigate violation source
   
4. **Close flow breaks** (integration tests fail)
   - Action: Revert, investigate route changes
   
5. **Governance test fails to recognize DECISION_CLOSE**
   - Action: Revert, verify capability constant added correctly

**For any failure:** Revert and document for next attempt.

---

## Maximum Scope for X9G-2

**Explicitly Limited To:**

### Changes Allowed
- 1 route file modified (close/route.ts)
- 1 capability file modified (capabilities.ts)
- Add 1 capability constant (DECISION_CLOSE)
- Add 1 capability check (requireCapabilities)
- Optional: refactor service (if bundled)

### Changes Forbidden
- No other routes
- No other services
- No wrapper changes
- No auth context changes
- No other capability changes
- No scanner changes
- No test changes
- No business logic changes

### Files Modified Maximum
- 2 files (route + capability)
- Optional: +1 service (if refactor bundled)
- Optional: +8 reports

---

## Implementation Sequence for X9G-2

### Phase A: Pre-Implementation Confirmation
1. Verify X9G-1 governance decision
2. Confirm DECISION_CLOSE was selected
3. Verify baseline (build/tests/scanner)
4. Document preconditions

### Phase B: Route Governance Update
1. Add DECISION_CLOSE import to CAPABILITIES
2. Add capability check to close route
3. Optionally: refactor to verified input pattern
4. Preserve all other functionality

### Phase C: Build Verification
1. Run npm run build
2. Verify 0 TypeScript errors
3. All pages render (99/99)
4. Report build status

### Phase D: Governance Validation
1. Run governance capabilities test
2. Verify DECISION_CLOSE exists
3. Verify governance model updated
4. Report governance test results

### Phase E: Integration Validation
1. Run all integration tests
2. Verify close flow works
3. Verify no regressions
4. Report test results

### Phase F: Scanner Validation
1. Run auth-shadow-read-scanner
2. Verify 448 baseline maintained
3. No new violations
4. Report scanner results

### Phase G: Scope Audit
1. Verify only close/route.ts and capabilities.ts modified
2. Verify no service changes (unless bundled refactor)
3. Verify no unauthorized files
4. Report scope compliance

### Phase H: Final Acceptance
1. Confirm all gates pass
2. Confirm scope within limits
3. Document implementation details
4. Accept X9G-2

---

## Timeline Estimate for X9G-2

| Phase | Task | Estimate | Notes |
|-------|------|----------|-------|
| A | Pre-confirmation | 5 min | Review X9G-1 decision |
| B | Route update | 10 min | Add check, wire capability |
| C | Build verify | 10 min | Compile time |
| D | Governance test | 10 min | Test suite execution |
| E | Integration test | 10 min | Test suite execution |
| F | Scanner | 5 min | Scanner execution |
| G | Scope audit | 5 min | File review |
| H | Final decision | 5 min | Documentation |
| **Total** | | **60 min** | Full X9G-2 cycle |

---

## Success Criteria for X9G-2

**X9G-2 Succeeds When:**

✓ Build passes (0 TypeScript errors)  
✓ All tests pass (402/402)  
✓ Scanner stable (448, no new violations)  
✓ DECISION_CLOSE added to capabilities  
✓ Close route has DECISION_CLOSE check  
✓ Only close/route.ts and capabilities.ts modified (unless service refactored)  
✓ No service changes (unless bundled refactor)  
✓ No wrapper/auth context/other service changes  
✓ No behavioral changes (close still works identically)  
✓ Scope within limits  
✓ All validation gates pass  

---

## Summary

**Next Phase:** X9G-2 (closeDecision route governance implementation)

**Implementation Authorized:** YES

**Files Allowed:** close/route.ts, capabilities.ts, reports

**Maximum Scope:** Route update + capability addition (service optional)

**Validation:** 6 gates (build, 4 tests, scanner)

**Timeline:** ~60 minutes

**Risk:** LOW (isolated change, easy to test)

**Rollback:** Simple (revert 2 files)

**Success:** All gates pass, scope within limits

---

## Next Scheduled Phase

**Following X9G-2 (If Desired):**

**X9G-3:** closeDecision service refactor (optional)
- Add VerifiedClosureInput interface
- Refactor closeDecision to use verified input
- Update route caller to construct verified input
- Same pattern as X9F-4, X9F-6

**Timing:** Can be deferred indefinitely or implemented immediately after X9G-2

**Decision:** Service refactor is OPTIONAL (can skip if satisfied with route governance alone)
