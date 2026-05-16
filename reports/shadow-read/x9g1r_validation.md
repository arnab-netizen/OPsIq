# X9G-1R: Validation Report

**Date:** 2026-05-16  
**Phase:** X9G-1R - DECISION_CLOSE Scope and Entitlement Review  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Status:** ✓ REVIEW COMPLETE - AUTHORIZED FOR X9G-2 WITH ADJUSTED SCOPE

---

## Executive Summary

**X9G-1R Objective:** Review X9G-1 design decision (ADD_DECISION_CLOSE) for safe implementation in X9G-2, with particular focus on whether DECISION_CLOSE capability can be added without concurrent entitlement/role mapping.

**Finding:** ⚠️ Original X9G-2 scope would block all users from closing decisions. **Scope adjusted to eliminate user-blocking scenario.**

**Result:** ✓ **X9G-2 AUTHORIZED WITH MODIFIED SCOPE (Option A)**

---

## Review Phases Completed

### Phase A: Artifact Review ✓
**Reviewed:** 8 X9G-1 artifacts  
**Items Analyzed:**
- X9G-1 validation report (all gates pass)
- Live debt register (3 items closed, 1 in-progress)
- Close decision governance semantics (5 design options)
- Design decision (Option B: ADD_DECISION_CLOSE selected)
- Implementation plan (route governance + optional service refactor)

**Finding:** X9G-1 design complete and clear. Decision well-reasoned.

---

### Phase B: Entitlement Safety Analysis ✓
**Critical Discovery:** Two separate authorization systems exist:

1. **Domain Capabilities** (capabilities.ts)
   - Abstract requirement: "decision:close"
   - Used in route `requireCapabilities` option

2. **Role-to-Capability Mapping** (capability-check.ts → ROLE_CAPABILITIES)
   - Concrete assignment: "role X has capability Y"
   - DECISION_ACCEPT, DECISION_REJECT NOT in any role's mapping
   - DECISION_CLOSE also not in any role's mapping

**The Gap:** Adding capability constant doesn't give users access. Routes also need role mapping.

**User Blocking Scenario Identified:**
```
If X9G-2 adds DECISION_CLOSE constant + requireCapabilities check
But doesn't add DECISION_CLOSE to any role's mapping
Result: All users (even those with existing close permission) get 403
```

**Impact:** CRITICAL - would break existing functionality

**Mitigation:** Scope adjusted to eliminate this scenario (Phase D decision)

---

### Phase C: Implementation Scope Options ✓
**Analyzed 4 Options:**

| Option | Scope | Risk | User Impact |
|---|---|---|---|
| A: Constant + Legacy Auth | Minimal | V.LOW | None (works) |
| B: Constant + Modern Auth + Role Map | Large | MED | None (if roles added) |
| C: Constant Only | Tiny | V.LOW | None (unused) |
| D: Defer Entirely | Zero | V.LOW | None (deferred) |

**Recommendation:** **Option A** selected

---

### Phase D: Final Scope Decision ✓
**Decision:** Implement Option A (Capability Constant + Legacy Route Auth)

**Rationale:**
- ✓ Advances governance design (constant defined)
- ✓ Eliminates user-blocking risk
- ✓ Respects X9G-1 scope (defer entitlements)
- ✓ Minimal changes (3-5 lines, 2 files)
- ✓ Clear path to future modernization

**Authorization:** ✓ **APPROVED FOR X9G-2**

---

## Key Findings

### Finding 1: Authorization Architecture Complexity
**Issue:** Codebase has 3 parallel capability systems, creating confusion about "what it means to add a capability"

**Current State:**
- Domain capabilities defined in capabilities.ts
- Role mappings in capability-check.ts ROLE_CAPABILITIES
- Plan/entitlement mappings in entitlement.ts Capability enum

**Result:** Adding constant is step 1 of 3, not step 1 of 1

**Recommendation:** Future refactoring should consolidate or clarify these systems

---

### Finding 2: Route Authorization Patterns Are Mixed
**Issue:** Different routes use different auth patterns:
- Legacy pattern: withEnforcementFull + withAuth() + hasPermission() + enforceWorkspaceScoping()
- Modern pattern: withCanonicalEnforcement + requireCapabilities option
- But modern pattern incomplete without role mapping

**Current Routes:**
- acceptDecision: Modern pattern (broken without role mapping, works because tests use SYSTEM_ADMIN)
- rejectDecision: Modern pattern (same issue)
- createDecision: Legacy pattern (has explicit assertCapability call)
- close: Legacy pattern (no capability integration yet)

**Recommendation:** Complete modernization should happen together (role mapping + route check)

---

### Finding 3: Test Environment Masks Authorization Issues
**Issue:** Tests likely run as SYSTEM_ADMIN role, which gets all capabilities

**Effect:** Tests pass even though regular users would be blocked by missing role mappings

**Mitigation:** Future work should include non-admin role tests to expose these gaps

**Risk:** Authorization bugs could exist and not be caught by test suite

---

### Finding 4: X9G-1 Design vs Implementation Mismatch
**Issue:** X9G-1 said:
- "Add capability check to route" (suggests requireCapabilities)
- "Defer entitlement mapping" (suggests no role mapping)

These are contradictory. Can't add route check without role mapping.

**Resolution:** X9G-1R clarified that "capability constant" was intended, not "route check."

**Recommendation:** Future STRICT EXECUTION mode phases should be more explicit about what "adding capability" means

---

## Validation Checklist

### Pre-X9G-2 Requirements
✓ X9G-1 design decision clearly documented  
✓ Risk analysis complete (entitlement safety)  
✓ Implementation options evaluated  
✓ Scope decision made and justified  
✓ Modified scope documents prepared  

### X9G-2 Readiness
✓ Modified scope clearly defined (Option A)  
✓ Files to change identified (2 files)  
✓ Behavioral guarantees documented  
✓ Validation plan prepared  
✓ Rollback plan documented  

### Known Issues / Deferred Items
⏳ Role mapping not done (deferred to workspace design)  
⏳ Route capability check not implemented (deferred)  
⏳ Plan-based entitlements not updated (deferred)  
⏳ Service refactor not done (optional X9G-3)  
⏳ Authorization system consolidation (future refactoring)  

---

## Impact Assessment

### Users
✓ **No impact** - Authorization unchanged, close permission works same as before

### Developers
✓ **Positive impact** - DECISION_CLOSE constant available, governance documented, clear path forward

### Architecture
✓ **Positive** - Governance model advances, domain capabilities updated

### Code Quality
⚠️ **Mixed** - Adds constant but doesn't modernize route (deferred work)

### Technical Debt
⏳ **Deferred** - Legacy auth pattern remains (addressed after role design)

---

## Critical Requirements for X9G-2 Implementation

### MUST DO
1. ✓ Add DECISION_CLOSE to capabilities.ts
2. ✓ Reference in close route (import or comment)
3. ✓ Run full validation (build, tests, scanner)

### MUST NOT DO
1. ✗ Add requireCapabilities check to route (user-blocking)
2. ✗ Update role mappings (scope creep, deferred)
3. ✗ Change close route's authorization logic (preserve backward compatibility)

### Should Consider
1. ✓ Add documentation comment about governance
2. ✓ Prepare notes for future role design phase
3. ✓ Update audit trail to show DECISION_CLOSE in governance model

---

## Validation Gates for X9G-2

**After implementing X9G-2 (Option A), MUST verify:**

1. **Build Gate**
   ```bash
   npm run build
   ```
   Expected: ✓ PASS (0 TypeScript errors)

2. **Governance Test Gate**
   ```bash
   npm test -- governance-capabilities
   ```
   Expected: ✓ PASS (DECISION_CLOSE exists and has correct format)

3. **Wrapper Enforcement Test Gate**
   ```bash
   npm test -- policy-wrapper-enforcement
   ```
   Expected: ✓ PASS (32/32, unchanged)

4. **Auth Bridge Test Gate**
   ```bash
   npm test -- g6r-auth-bridge
   ```
   Expected: ✓ PASS (14/14, unchanged)

5. **Integration Test Gate**
   ```bash
   npm test -- phase-d phase-e phase-f
   ```
   Expected: ✓ PASS (324/324, including close flow)

6. **Scanner Baseline Gate**
   ```bash
   npx tsx src/governance/auth-shadow-read-scanner.ts
   ```
   Expected: ✓ STABLE (448 violations, 0 new)

**Stop Condition:** If ANY gate fails, revert and investigate

---

## Rollback Plan

**If any validation gate fails:**

1. Revert src/domain/constants/capabilities.ts (remove DECISION_CLOSE)
2. Revert src/app/api/decisions/[decisionId]/close/route.ts (remove import/comment)
3. Run validation gates again
4. Investigate root cause
5. Document findings
6. Defer X9G-2 to next attempt

**Rollback Risk:** VERY LOW (only 2 files, easy to revert)

---

## Success Criteria

**X9G-2 succeeds when ALL of the following are true:**

✓ Build passes (0 TypeScript errors)  
✓ All 6 validation gates pass  
✓ Only 2 files modified (capabilities.ts, close/route.ts)  
✓ Only ~5 lines added (DECISION_CLOSE constant)  
✓ No behavior changes (authorization identical)  
✓ Users with close_decision permission still work  
✓ Users without permission still blocked  
✓ No new violations introduced  
✓ Scope audit shows no drift  
✓ Documentation prepared for next phases  

---

## Approval

### X9G-1R Review Status
- ✓ Phase A: Artifact Review - COMPLETE
- ✓ Phase B: Entitlement Safety Analysis - COMPLETE
- ✓ Phase C: Implementation Scope Options - COMPLETE
- ✓ Phase D: Final Scope Decision - COMPLETE
- ✓ Phase E: Validation Report - COMPLETE (THIS)

### X9G-2 Authorization
**Status:** ✓ **APPROVED FOR IMPLEMENTATION**

**Scope:** Option A (Capability Constant + Legacy Route Auth)

**Files Modified:** 2 (capabilities.ts, close/route.ts)

**Risk Level:** ✓ VERY LOW

**Expected Duration:** ~15-20 minutes

**Next Action:** Proceed to X9G-2 implementation

---

## Deferred Items (For Future Phases)

### X9G-3 (Optional: Service Refactor)
- Refactor closeDecision to use VerifiedClosureInput pattern
- Matches X9F-4, X9F-6 pattern
- Not required, can be deferred indefinitely

### Workspace Role Design Phase
- Determine which roles should have DECISION_CLOSE capability
- Add DECISION_CLOSE to ROLE_CAPABILITIES mappings
- Update role descriptions and documentation
- **Blockers:** None, can proceed independently

### Route Modernization Phase (After Workspace Design)
- Update close route to use `requireCapabilities: ["DECISION_CLOSE"]`
- Remove legacy hasPermission check
- Match modern pattern of acceptDecision, rejectDecision
- **Blockers:** Workspace role design complete

### Authorization System Refactoring (Future)
- Consolidate domain capabilities, role mappings, and entitlement mappings
- Reduce confusion about "what it means to add a capability"
- Consider unified capability registry
- **Blockers:** None, can be independent refactoring

---

## Lessons Learned

### For Future STRICT EXECUTION Phases

1. **Clarify Terminology**
   - "Add capability" should specify: constant? role mapping? route check? all?
   - Document full lifecycle: constant → role map → route check → users have access

2. **Validate Assumptions**
   - Don't assume "defer entitlements" is compatible with "add route check"
   - Review for sequencing conflicts before authorizing

3. **Test Authorization**
   - Include non-admin role tests to catch authorization gaps
   - Don't rely on SYSTEM_ADMIN tests to validate regular user access

4. **Document Deferred Items**
   - When deferring entitlements, explicitly document what must happen before route check can be added
   - Show dependencies clearly

---

## Conclusion

### X9G-1R Summary

**Original Question:** Is adding DECISION_CLOSE safe without entitlement mapping?

**Answer:** Not if route checks it. But if capability is added and route check is deferred, then yes.

**Resolution:** Adjust scope to eliminate user-blocking scenario. Implement capability constant, defer route check.

**Outcome:** ✓ X9G-2 AUTHORIZED WITH MODIFIED SCOPE

### X9G-2 Next Steps

1. Implement Option A (Capability + Legacy Auth)
2. Run 6 validation gates
3. Verify all tests pass and baseline maintained
4. Document findings in X9G-2 validation report
5. Mark X9G-2 complete

### Path Forward

```
X9G-2: Add DECISION_CLOSE capability constant
        ↓
Workspace Role Design Phase: Map DECISION_CLOSE to roles
        ↓
Route Modernization: Add requireCapabilities check to close route
        ↓
Modern Authorization Complete
```

---

## Sign-Off

**X9G-1R VALIDATION COMPLETE**

**Status:** ✓ AUTHORIZED FOR X9G-2 IMPLEMENTATION

**Approval:** Proceed with Option A scope

**Documentation:** Ready for X9G-2 phase

**Risk Level:** ✓ VERY LOW

**Confidence:** HIGH (analysis thorough, scope clear, safety addressed)

---

## Appendix: File State Summary

### Baseline (Before X9G-2)
- 448 total violations (283 critical, 165 block-build)
- All tests passing (402/402)
- Close route: Legacy auth, working
- DECISION_CLOSE: Not defined

### Expected After X9G-2 (Option A)
- 448 total violations (no change)
- All tests passing (402/402)
- Close route: Legacy auth, working (no change)
- DECISION_CLOSE: Defined in CAPABILITIES, referenced in route

### Authorization Matrix After X9G-2
| User Type | Can Close? | Reason |
|---|---|---|
| SYSTEM_ADMIN | ✓ Yes | Has close_decision permission |
| ADMIN_OR_PORTFOLIO_MANAGER | ✓ Yes | Has close_decision permission |
| CONSULTANT | ✗ No | Lacks close_decision permission |
| OTHER | ✗ No | Lacks close_decision permission |

(Same as before X9G-2)

---

## References

- X9G-1 Close Decision Design Decision: x9g1_close_decision_design_decision.md
- X9G-1 Implementation Plan: x9g1_implementation_plan.md
- X9G-1R Entitlement Safety Analysis: x9g1r_entitlement_safety_analysis.md
- X9G-1R Implementation Scope Options: x9g1r_implementation_scope_options.md
- X9G-1R Final Scope Decision: x9g1r_final_scope_decision.md
