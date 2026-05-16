# X8B-1: Implementation Plan for Next Phase

**Date:** 2026-05-16  
**Design Selected:** TWO-STEP MIGRATION (Option E - Step 1)  
**Next Phase Name:** X9G-3 (DECISION_CLOSE Role Mapping Implementation)  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Implementation Authorization

**Step 1 Implementation:** ✓ AUTHORIZED

**Scope:** Add DECISION_CLOSE to ADMIN_OR_PORTFOLIO_MANAGER role mapping only

---

## Files Allowed to Change in X9G-3 (Step 1)

### Primary File
**File:** `src/policies/capability-check.ts`

**Change:** Add DECISION_CLOSE to ROLE_CAPABILITIES[ROLES.ADMIN_OR_PORTFOLIO_MANAGER]

**Exact Location:** ROLE_CAPABILITIES object, ADMIN_OR_PORTFOLIO_MANAGER role

**Before:**
```typescript
[ROLES.ADMIN_OR_PORTFOLIO_MANAGER]: [
  // ... existing capabilities ...
  CAPABILITIES.RECOMMENDATION_APPROVE,
  CAPABILITIES.RECOMMENDATION_VIEW,
  // ... rest of capabilities ...
],
```

**After:**
```typescript
[ROLES.ADMIN_OR_PORTFOLIO_MANAGER]: [
  // ... existing capabilities ...
  CAPABILITIES.RECOMMENDATION_APPROVE,
  CAPABILITIES.RECOMMENDATION_VIEW,
  // ... rest of capabilities ...
  CAPABILITIES.DECISION_CLOSE,  // ADD THIS LINE
],
```

### Reports Only (No Code)
- X9G-3_preimplementation_confirmation.md
- X9G-3_role_mapping_notes.md
- X9G-3_validation.md
- X9G-3_scope_audit.json
- X9G-3_acceptance_decision.md

---

## Files Forbidden to Change in X9G-3

❌ **ABSOLUTELY FORBIDDEN:**
- ✗ src/app/api/decisions/[decisionId]/close/route.ts (route changes deferred to Step 2)
- ✗ src/services/decisions/decision-lifecycle.service.ts (service unchanged)
- ✗ src/domain/constants/capabilities.ts (already added DECISION_CLOSE in X9G-2)
- ✗ src/services/entitlement.ts (no entitlement changes needed)
- ✗ src/middleware/workspace-enforcement.ts (no middleware changes)
- ✗ src/lib/canonical-route-enforcement.ts (wrapper unchanged)
- ✗ src/lib/auth-guard.ts (auth context unchanged)
- ✗ src/governance/auth-shadow-read-scanner.ts (scanner unchanged)
- ✗ Other routes or services
- ✗ Wrapper patterns
- ✗ Auth context services
- ✗ Other capability constants
- ✗ Any other role mappings

---

## Role Mapping Changes Allowed in X9G-3

**Allowed:**
- Add DECISION_CLOSE to ADMIN_OR_PORTFOLIO_MANAGER only

**Forbidden:**
- Do NOT add DECISION_CLOSE to other roles yet
- Do NOT remove DECISION_CLOSE from ADMIN_OR_PORTFOLIO_MANAGER
- Do NOT change SYSTEM_ADMIN (already gets all)
- Do NOT modify other role capabilities

---

## Entitlement Mapping Changes Allowed in X9G-3

**Allowed:** NONE

**Forbidden:** All entitlement changes (no changes needed for close)

---

## Route Changes Allowed in X9G-3

**Allowed:** NONE (route changes deferred to Step 2)

**The legacy close route checks remain unchanged:**
```typescript
// Route STILL uses:
if (!hasPermission(membership.role, "close_decision")) {
  throw new Error("Insufficient permissions");
}
```

This will now work because DECISION_CLOSE is in roles.

---

## Service Changes Allowed in X9G-3

**Allowed:** NONE

The closeDecision service remains unchanged.

---

## Test Changes Required in X9G-3

**No test code changes required.**

Existing governance test automatically validates DECISION_CLOSE in all DECISION_* roles.

**Verification:**
- Governance test scans all DECISION_* capabilities
- Should pass with DECISION_CLOSE in ADMIN_OR_PORTFOLIO_MANAGER
- No new tests needed

---

## Validation Commands for X9G-3

After implementation, must run:

```bash
# 1. Build (expect 0 TypeScript errors)
npm run build

# 2. Governance test (expect 32/32, validates all DECISION_* in roles)
npm test -- governance-capabilities

# 3. Wrapper enforcement test (expect 32/32, unchanged)
npm test -- policy-wrapper-enforcement

# 4. Auth bridge test (expect 14/14, unchanged)
npm test -- g6r-auth-bridge

# 5. Integration tests (expect 324/324, including close flow)
npm test -- phase-d phase-e phase-f

# 6. Scanner (expect 448 baseline, no new violations)
npx tsx src/governance/auth-shadow-read-scanner.ts
```

**Expected Results:**
- Build: ✓ PASS (0 errors)
- All tests: ✓ PASS (402/402)
- Scanner: ✓ STABLE (448, no change)

---

## Stop Conditions for X9G-3

**Stop and revert if:**

1. **Build fails** (TypeScript error)
   - Action: Revert role mapping change
   - Investigate type mismatch

2. **Any test fails** (>0 failures)
   - Action: Revert role mapping change
   - Investigate test failure

3. **Scanner shows new violations** (>448)
   - Action: Revert role mapping change
   - Investigate violation source

4. **DECISION_CLOSE not in governance test** (capability validation)
   - Action: Revert role mapping change
   - Verify DECISION_CLOSE in ROLE_CAPABILITIES

**For any failure:** Revert and document for next attempt

---

## Rollback Rule for X9G-3

If validation gate fails:

1. **Identify failure:** Which gate failed?
2. **Revert changes:**
   - Remove DECISION_CLOSE from ROLE_CAPABILITIES[ADMIN_OR_PORTFOLIO_MANAGER]
3. **Restore original state**
4. **Investigate root cause**
5. **Do not re-attempt** in same session
6. **Document findings** for next session

**Rollback is safe** because:
- No route changes made
- No service changes
- Only capability mapping changed
- Easy to identify and revert (1 line removal)

---

## Maximum Scope for X9G-3

**Explicitly Limited To:**

### Changes Allowed
- 1 file modified (capability-check.ts)
- 1 line added to ADMIN_OR_PORTFOLIO_MANAGER capabilities
- Add 1 capability reference (CAPABILITIES.DECISION_CLOSE)
- Optional: Comment documenting the addition

### Changes Forbidden
- No other role modifications
- No route changes
- No service changes
- No wrapper changes
- No auth context changes
- No other capability changes
- No entitlement changes
- No scanner changes
- No test code changes
- No business logic changes

### Files Modified Maximum
- 1 file (capability-check.ts)
- Optional: 5 reports

---

## Success Criteria for X9G-3

**X9G-3 succeeds when ALL of:**

✓ DECISION_CLOSE added to ADMIN_OR_PORTFOLIO_MANAGER capabilities  
✓ Build passes (0 TypeScript errors)  
✓ All tests pass (402/402)  
✓ Scanner stable (448, no new violations)  
✓ Only capability-check.ts modified (code)  
✓ Only DECISION_CLOSE added (no other changes)  
✓ SYSTEM_ADMIN still gets all capabilities  
✓ Other roles unchanged  
✓ Route unchanged (legacy still active)  
✓ Service unchanged  
✓ No behavioral changes  
✓ Governance test validates DECISION_CLOSE in roles  

---

## Timeline Estimate for X9G-3

| Phase | Task | Estimate |
|---|---|---|
| Pre | Verification | 5 min |
| Impl | Add DECISION_CLOSE to ADMIN_OR_PORTFOLIO_MANAGER | 2 min |
| Verify | Run build | 10 min |
| Verify | Run test suites | 15 min |
| Verify | Run scanner | 5 min |
| Audit | Scope audit | 5 min |
| Docs | Generate reports | 10 min |
| **Total** | | **52 min** |

---

## Summary

**Next Phase:** X9G-3 (DECISION_CLOSE Role Mapping Implementation)

**Implementation Authorized:** ✓ YES

**Files to Change:** 1 (capability-check.ts)

**Maximum Scope:** Add DECISION_CLOSE to ADMIN_OR_PORTFOLIO_MANAGER only

**Validation Gates:** 6 (build, 4 tests, scanner)

**Timeline:** ~50 minutes

**Risk:** ✓ VERY LOW (isolated change, easy to verify, simple rollback)

**Success:** All gates pass, scope within limits, DECISION_CLOSE in roles
