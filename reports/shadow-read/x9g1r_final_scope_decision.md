# X9G-1R: Final Scope Decision for X9G-2

**Date:** 2026-05-16  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Phase:** X9G-1R Phase D (Final Scope Decision)

---

## Decision

**SELECTED OPTION:** Option A (Capability Constant + Legacy Route Auth)

**Status:** ✓ AUTHORIZED FOR X9G-2 IMPLEMENTATION

---

## Rationale

### Core Conflict Identified
X9G-1 made two related but conflicting statements:
1. **"Route governance update"** → suggests adding capability checks to route
2. **"Entitlement mapping deferred"** → suggests NOT doing role/entitlement work

Adding a route capability check without entitlement mapping creates a **user-blocking condition** (all users denied). This violates the "no breaking changes" principle.

### Why Option A Resolves This
Option A (Capability + Legacy Auth) satisfies BOTH statements:
- ✓ Adds governance constant (governance design complete, in code)
- ✓ Defers route capability check (no user blocking risk)
- ✓ Defers entitlement mapping (as intended)
- ✓ Keeps legacy auth working (users not blocked)

### Safety-First Principle
When design and implementation create tension, **fail-safe** > **fail-fast**.
- Fail-safe: Route governance exists, route works, defer modernization → Option A
- Fail-fast: Route governance exists, route breaks users, defer resolution → Option B/C

**X9G-2 should not ship with known user-blocking scenarios.**

---

## Selected Scope for X9G-2

### What X9G-2 Will Do (Option A)

#### File 1: src/domain/constants/capabilities.ts
**Change:** Add one line
```typescript
export const CAPABILITIES = {
  // ... existing DECISION_CREATE, DECISION_UPDATE, DECISION_ACCEPT, DECISION_REJECT ...
  DECISION_CLOSE: "decision:close",  // NEW: Add this line
  // ... rest of capabilities ...
};
```

**Purpose:** Governance model includes close operation as a distinct capability

**Impact:** Domain model complete, capability available for future use

---

#### File 2: src/app/api/decisions/[decisionId]/close/route.ts
**Change:** Minor update to document governance (optional refactoring)

**Option A-1 (Minimal):**
```typescript
// No code changes, but add one comment:
// Route governed by CAPABILITIES.DECISION_CLOSE (domain capability model)
// Current auth via legacy: hasPermission(membership.role, "close_decision")
// Future migration: will move to modern requireCapabilities pattern (X9G-3)
```

**Option A-2 (Light Refactoring, Recommended):**
```typescript
import { CAPABILITIES } from "@/domain/constants/capabilities";

// Add a reference to show governance alignment:
// Governance: CAPABILITIES.DECISION_CLOSE

// Replace inline string with constant reference (optional):
// OLD: if (!hasPermission(membership.role, "close_decision"))
// NEW: if (!hasPermission(membership.role, "close_decision")) // CAPABILITIES.DECISION_CLOSE
```

**Purpose:** Route internally documents governance constant while maintaining backward compatibility

**Impact:** Code clarity, no behavior change

---

### What X9G-2 Will NOT Do (Deferred)

❌ **NOT adding route capability check**
- Route keeps legacy `hasPermission` pattern
- No `requireCapabilities` in wrapper
- Deferring to future phase (when role mapping ready)

❌ **NOT updating role capability mappings**
- ROLE_CAPABILITIES unchanged
- DECISION_CLOSE not mapped to any roles yet
- Deferred to workspace role design phase

❌ **NOT updating entitlement tier configurations**
- entitlement.ts Capability enum unchanged
- DECISION_CLOSE not in subscription tiers
- Deferred (close is admin operation, unlikely to need quota limits)

❌ **NOT refactoring to verified input pattern**
- closeDecision service unchanged
- This is X9G-3 (optional), not part of X9G-2

---

## Files Modified

| File | Change Type | Scope | Risk |
|---|---|---|---|
| `src/domain/constants/capabilities.ts` | Add constant | 1 line | ✓ V.LOW |
| `src/app/api/decisions/[decisionId]/close/route.ts` | Add import + comment/doc | 2-3 lines | ✓ NONE |
| **Total Impact** | 2 files | ~3-5 lines | ✓ VERY LOW |

---

## Authorization Semantics

### Before X9G-2
```
User with "close_decision" permission → Can close decisions
User without "close_decision" permission → Cannot close decisions
```

### After X9G-2 (Option A)
```
User with "close_decision" permission → Can close decisions (SAME)
User without "close_decision" permission → Cannot close decisions (SAME)
```

**Change:** Zero. All users have same authorization as before.

---

## Governance State After X9G-2

### What's Complete
✓ Governance design decision made (ADD_DECISION_CLOSE selected)  
✓ Capability constant defined in domain model  
✓ Close operation documented in governance framework  
✓ Design ready for role mapping phase  

### What's Deferred
⏳ Route capability check migration (implementation detail)  
⏳ Role mapping in ROLE_CAPABILITIES (workspace design phase)  
⏳ Entitlement tier mappings (workspace design phase)  
⏳ Service refactor to verified input (X9G-3, optional)  

### Path Forward
```
X9G-2 (This Phase)
├─ Add DECISION_CLOSE constant
└─ Document in route

WORKSPACE_ROLE_DESIGN (Future Phase)
├─ Define who should have close permission
└─ Add to ROLE_CAPABILITIES

FUTURE_MIGRATION (After Role Design)
├─ Update route to use requireCapabilities
├─ Remove legacy hasPermission check
└─ Modern authorization complete
```

---

## Validation Plan for X9G-2

### Pre-Implementation
1. Confirm X9G-1 baseline (all tests passing)
2. Verify current close route works
3. Document current behavior

### Implementation (follows Option A)
1. Add DECISION_CLOSE to capabilities.ts
2. Import in close route
3. Add documentation comment

### Post-Implementation Validation

#### 1. Build Verification
```bash
npm run build
```
**Expected:** ✓ PASS (0 TypeScript errors)

#### 2. Governance Test
```bash
npm test -- governance-capabilities
```
**Expected:** ✓ PASS (DECISION_CLOSE constant verified)  
**New test:** Should verify DECISION_CLOSE exists and matches "decision:close" format

#### 3. Integration Test
```bash
npm test -- phase-d phase-e phase-f
```
**Expected:** ✓ PASS (close flow still works)  
**Verification:** All 324/324 tests pass, including close operation

#### 4. Authorization Boundary Test
```bash
npm test -- authorization-boundaries
```
**Expected:** ✓ PASS (users with close_decision perm can close, others cannot)  
**Verification:** No change from pre-implementation (same auth behavior)

#### 5. Scanner Baseline
```bash
npx tsx src/governance/auth-shadow-read-scanner.ts
```
**Expected:** ✓ STABLE (448 violations, no change)  
**Rationale:** Route auth unchanged, no new violations

#### 6. Scope Audit
```bash
git diff main src/domain/constants/capabilities.ts
git diff main src/app/api/decisions/[decisionId]/close/route.ts
```
**Expected:** 
- capabilities.ts: 1 line added (DECISION_CLOSE constant)
- close/route.ts: 1 import + optional comment (no behavior change)

### Rollback Criteria
**Stop and revert if:**
- ✗ Build fails (TypeScript error)
- ✗ Any test fails (governance, integration, authorization)
- ✗ Scanner shows new violations (>448)
- ✗ Files modified beyond scope (checking git diff)

---

## Success Criteria for X9G-2

**All of the following must be true:**

✓ Build passes (0 TypeScript errors)  
✓ All tests pass (402/402 from X9G-1 baseline)  
✓ DECISION_CLOSE constant added to capabilities.ts  
✓ Close route references DECISION_CLOSE (import or comment)  
✓ Authorization unchanged (users with close_decision still work)  
✓ Scanner baseline maintained (448 violations)  
✓ Only 2 files modified (capabilities.ts, close/route.ts)  
✓ Only ~5 lines added total  
✓ No new dependencies  
✓ No breaking changes  

---

## Scope Boundaries

### Must Include (In X9G-2)
✓ DECISION_CLOSE capability constant (domain model)  
✓ Route documentation of governance constant  

### May Include (If Helpful)
✓ Refactor legacy permission string to align with constant  
✓ Add comments explaining deferral path  
✓ Update close route import statement  

### Must NOT Include (Out of Scope)
✗ Route capability check implementation (deferred)  
✗ Role mapping updates (workspace design phase)  
✗ Entitlement tier configurations (workspace design phase)  
✗ Service refactor to verified input (X9G-3, optional)  
✗ Changes to other routes  
✗ Changes to wrapper patterns  

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| **Build failure** | Very Low | High | Run build before commit |
| **Test failure** | Very Low | Medium | Run full test suite |
| **User blocking** | **ELIMINATED** | Critical | Option A avoids this |
| **Scope creep** | Low | Medium | Clear scope boundaries |
| **Auth regression** | Very Low | Critical | Scope limited to constant |
| **Scanner violation** | Very Low | Low | No auth changes |

**Overall Risk Assessment:** ✓ **VERY LOW**

---

## Deployment Impact

### Users
- ✓ No change in behavior
- ✓ Close permission works same as before
- ✓ No migration needed
- ✓ No communication needed

### Developers
- ✓ New governance constant available (DECISION_CLOSE)
- ✓ Clear documentation of intent
- ✓ Path forward documented for future modernization

### Operations
- ✓ No operational changes
- ✓ Monitoring unchanged
- ✓ No new alerts needed

---

## Relationship to Future Phases

### X9G-3 (Optional: closeDecision Service Refactor)
- Depends on: X9G-2 complete (DECISION_CLOSE constant available)
- Can follow immediately after X9G-2
- Would refactor service to VerifiedClosureInput pattern
- Would match X9F-4, X9F-6 pattern

**Blocked By:** ✗ Nothing (X9G-2 enables but doesn't require)

### Workspace Role Design Phase (Future)
- Depends on: X9G-2 complete (DECISION_CLOSE constant defined)
- Will determine: Who should have DECISION_CLOSE capability
- Will update: ROLE_CAPABILITIES mapping
- Will map: Close permission to roles (admin? manager? owner?)

**Enabled By:** ✓ X9G-2 (constant available for role mapping)

### Route Modernization Phase (After Role Design)
- Depends on: Workspace role design complete
- Will implement: `requireCapabilities: ["DECISION_CLOSE"]` check
- Will remove: Legacy `hasPermission("close_decision")` pattern
- Will match: Modern pattern of acceptDecision, rejectDecision

**Blocked By:** Workspace role design completion

---

## Sign-Off

### X9G-1R Review Complete
**Finding:** X9G-2 implementation requires clarification due to conflict between "add route check" and "defer entitlements."

**Resolution:** Option A (Capability + Legacy Auth) selected as safest path forward.

**Justification:**
1. ✓ Completes governance design (constant + domain model)
2. ✓ Eliminates user-blocking risk (legacy auth preserved)
3. ✓ Maintains deferral of entitlements (as X9G-1 intended)
4. ✓ Minimal scope and risk (3-5 lines, 2 files)
5. ✓ Clear path to future modernization

### Authorization
**X9G-2 implementation APPROVED with selected scope (Option A)**

**Status:** Ready to proceed to Phase E (Validation)

---

## Implementation Checklist for X9G-2

### Pre-Implementation
- [ ] Pull latest from main branch
- [ ] Create feature branch from main
- [ ] Confirm X9G-1 validation tests passing

### Implementation
- [ ] Add DECISION_CLOSE to src/domain/constants/capabilities.ts
- [ ] Import CAPABILITIES in src/app/api/decisions/[decisionId]/close/route.ts
- [ ] (Optional) Add documentation comment about governance

### Post-Implementation
- [ ] Run: npm run build (expect 0 errors)
- [ ] Run: npm test -- governance-capabilities (expect PASS)
- [ ] Run: npm test -- policy-wrapper-enforcement (expect PASS)
- [ ] Run: npm test -- g6r-auth-bridge (expect PASS)
- [ ] Run: npm test -- phase-d phase-e phase-f (expect 324/324 PASS)
- [ ] Run: npx tsx src/governance/auth-shadow-read-scanner.ts (expect 448)
- [ ] Review git diff (should show only capabilities.ts and close/route.ts)

### Validation
- [ ] All tests passing
- [ ] Build clean
- [ ] Scanner baseline maintained
- [ ] Scope within limits
- [ ] Documentation updated

### Commit & Sign-Off
- [ ] Create commit with message: "X9G-2: Add DECISION_CLOSE capability constant and document close route governance"
- [ ] Verify tests passing on committed code
- [ ] Create validation report
- [ ] Mark X9G-2 complete

---

## Conclusion

**X9G-1R Final Decision:**

X9G-2 will implement **Option A** (Capability Constant + Legacy Route Auth).

This approach:
- ✓ Advances governance design (constant defined)
- ✓ Eliminates user-blocking risk (legacy auth preserved)
- ✓ Respects X9G-1 scope (minimal changes)
- ✓ Enables future modernization (clear path forward)

**Expected Outcome:**
- All tests pass
- No behavioral change for users
- Governance model updated
- Foundation ready for future work

**Next Step:** X9G-1R Phase E (Validation setup and confirmation)
