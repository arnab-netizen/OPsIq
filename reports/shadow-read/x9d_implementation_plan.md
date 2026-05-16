# X9D: Implementation Plan After Design

**Date:** 2026-05-15  
**Status:** IMPLEMENTATION PLAN READY  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## IMPORTANT: This Phase is DESIGN ONLY

**This is Phase X9D - a design phase. No code will be implemented in X9D.**

Once this design is approved, the **next implementation phase** (to be named) will execute the changes.

---

## Next Phase Name

**Recommended:** X9D-IMPL (Governance Capability Mapping Implementation)

**Structure:**
- Phase X9D: Governance Capability Mapping Design (COMPLETE - THIS DOCUMENT)
- Phase X9D-IMPL: Governance Capability Mapping Implementation (NEXT - DESIGN APPROVED)
- Phase X9C-5: Service Refactor Pilots 2+ (FOLLOWS AFTER X9D-IMPL)

---

## Implementation Authorization Status

**Current Status:** DESIGN PHASE - NO CODE CHANGES AUTHORIZED YET

**Approval Required Before X9D-IMPL:**
- [ ] Design approved (Option A selected and reviewed)
- [ ] Mapping rules validated
- [ ] Capability additions verified
- [ ] Test strategy confirmed

Once approved, X9D-IMPL authorization will include:
- ✓ Add 8 new constants to capabilities.ts
- ✓ Update entitlement tier configs
- ✓ Update 2 routes (decisions/create, recommendations)
- ✓ Add 1 test file

---

## Exact Files Allowed in X9D-IMPL

### Files to Create
- `/reports/shadow-read/x9d_impl_verification.md` (implementation checklist)

### Files to Modify
1. `src/domain/constants/capabilities.ts`
   - Add DECISION_CREATE constant
   - Add DECISION_UPDATE constant
   - Add EXPERIMENT_CREATE constant
   - Add EXPERIMENT_UPDATE constant
   - Add ADMIN_SETTINGS constant
   - Add ADMIN_TEAM constant
   - Add WORKSPACE_CREATE constant (reserved)
   - Add WORKSPACE_INVITE constant (reserved)

2. `src/services/entitlement.ts`
   - Update TIER_CONFIGS to include new capabilities where appropriate
   - Ensure DECISION_CREATE in FREE, PRO, ENTERPRISE tiers

3. `src/app/api/decisions/create/route.ts`
   - Change `assertCapability(workspaceId, "decision_create")` to use CAPABILITIES.DECISION_CREATE
   - Add comment documenting dual check (entitlement + permission)

4. `src/app/api/recommendations/route.ts`
   - Same changes as decisions/create/route.ts

### Test Files to Create
- `src/__tests__/governance/governance-capabilities.test.ts`
  - Test all new capability constants exist
  - Test entitlement tier configs include new capabilities
  - Test routes check correct capabilities

---

## Exact Files FORBIDDEN in X9D-IMPL

- ❌ No service refactoring (that's X9C-5)
- ❌ No route migration (only caller updates for new capabilities)
- ❌ No scanner changes (scanner already handles CAPABILITIES)
- ❌ No wrapper changes
- ❌ No auth context changes
- ❌ No new governance logic
- ❌ No policy changes
- ❌ No workspace design changes
- ❌ No role design changes

---

## First Implementation Pilot Candidate

Once X9D-IMPL completes, the first service refactoring pilot (X9C-5 Pilot 1) should be:

**Recommended:** `decisions/create` route + decision service refactoring

**Why:** 
- ✓ Single route caller (src/app/api/decisions/create/route.ts)
- ✓ Clear scope (decision creation)
- ✓ Manageable complexity
- ✓ Can serve as template for governance service refactoring

**Alternative:** recommendations/route.ts (similar scope, slightly more complex)

---

## Excluded High-Risk Candidates for X9C-5

The following should be deferred PAST initial pilots:

1. **stage.ts** - Too large (6 functions), governance-critical, modifies state
2. **owner-dashboard.service.ts** - Too many dependencies (6 services), unclear governance role
3. **Experiment services** - Entitlement-only (reserved for later)
4. **Admin services** - Admin-level (reserved for later)
5. **Workspace services** - Admin-level (reserved for later)

---

## Tests Required in X9D-IMPL

### Unit Tests: `governance-capabilities.test.ts`

```typescript
describe("Governance Capabilities", () => {
  // 1. All new capabilities exist
  it("DECISION_CREATE exists in CAPABILITIES", () => {
    expect(CAPABILITIES.DECISION_CREATE).toBeDefined();
    expect(CAPABILITIES.DECISION_CREATE).toBe("decision:create");
  });
  
  it("DECISION_UPDATE exists in CAPABILITIES", () => {
    expect(CAPABILITIES.DECISION_UPDATE).toBeDefined();
  });
  
  // 2. Entitlement configs include new capabilities
  it("DECISION_CREATE in FREE tier capabilities", () => {
    expect(TIER_CONFIGS.free.capabilities).toContain(Capability.DECISION_CREATE);
  });
  
  // 3. Routes use correct capabilities
  it("decisions/create checks DECISION_CREATE", async () => {
    // Mock authContext without DECISION_CREATE
    const authContext = { verifiedCapabilities: new Set() };
    // Should throw ForbiddenError
    expect(() => checkCapability(authContext)).toThrow(ForbiddenError);
  });
  
  // 4. ServiceAuthEnvelope integration
  it("ServiceAuthEnvelope can carry DECISION_CREATE", () => {
    const envelope: ServiceAuthEnvelope = {
      verifiedCapabilities: new Set([CAPABILITIES.DECISION_CREATE]),
      // ... other fields
    };
    expect(envelope.verifiedCapabilities.has(CAPABILITIES.DECISION_CREATE)).toBe(true);
  });
});
```

### Integration Tests
- Test decisions/create route with and without DECISION_CREATE
- Test recommendations route with correct capability
- Test entitlement quota check still works alongside capability check

### No New Test Files Beyond governance-capabilities.test.ts

Don't add extensive new tests. Just verify:
- Constants exist and have correct values
- Tier configs updated
- Routes updated
- ServiceAuthEnvelope integration works

---

## Scanner Expectation After X9D-IMPL

**Total violations:** Still 448 (no change)
- Adding CAPABILITIES constants doesn't reduce violations
- Violations come from using old auth-guard patterns
- Violation reduction happens during service refactoring (X9C-5)

**What Scanner Will See:**
- ✓ New CAPABILITIES constants in code
- ✓ Routes using CAPABILITIES.DECISION_CREATE (recognized as safe)
- ✓ Same 448 violations (from route/service layers still using auth-guard)

---

## Rollback Rule for X9D-IMPL

If implementation encounters unexpected issues:

**Simple Rollback:**
1. Remove the 8 new capability constants from capabilities.ts
2. Revert entitlement tier config changes
3. Revert routes back to using entitlement string literals
4. Cost: Low (just reverse the additions)

**Complexity:** Minimal. No system logic depends on new constants yet.

---

## Stop Conditions for X9D-IMPL

Stop and do NOT proceed if:

- ❌ Any capability name conflicts with existing CAPABILITIES
- ❌ Tests fail to pass
- ❌ Build fails
- ❌ Scanner shows new violations (shouldn't happen)
- ❌ Entitlement tier configs can't be updated

**Unlikely:** Option A is straightforward addition, not risky.

---

## Maximum Pilot Size for X9D-IMPL

**Total Changes Allowed:**
- ✓ 1 constant file (capabilities.ts) - ~15 lines added
- ✓ 1 service file (entitlement.ts) - ~10 lines changed
- ✓ 2 route files - ~5 lines changed per file
- ✓ 1 test file - ~100 lines added

**Total:** ~150 lines of code
**Scope:** Isolated to capability definitions and tests

---

## Expected Timeline

**X9D-IMPL:** 1-2 hours
- ~15 min: Add constants
- ~20 min: Update entitlement configs
- ~15 min: Update 2 routes
- ~30 min: Write and run tests
- ~20 min: Review and validation

---

## Success Criteria for X9D-IMPL

- [x] All 8 new capability constants added to capabilities.ts
- [x] All capability names validated (no conflicts)
- [x] DECISION_CREATE format: "decision:create" (consistent with others)
- [x] Entitlement tier configs updated
- [x] decisions/create route updated to use CAPABILITIES
- [x] recommendations route updated to use CAPABILITIES
- [x] governance-capabilities.test.ts written and passing
- [x] No new scanner violations introduced
- [x] Build passes (0 TypeScript errors)
- [x] Tests pass (100%)
- [x] Code review approved

---

## X9C-5 Preconditions (AFTER X9D-IMPL)

Once X9D-IMPL completes, X9C-5 can proceed:

**Required to Have Happened:**
- ✓ DECISION_CREATE added to domain CAPABILITIES
- ✓ Entitlement configs updated
- ✓ Routes updated to use CAPABILITIES
- ✓ Tests passing

**X9C-5 Can Then Refactor:**
- decisions/create route + decision service
- recommendations route + recommendation service
- stage.ts service
- owner-dashboard.service.ts (if ready)

---

## Phase Dependencies

```
X9D (Design) ← YOU ARE HERE
    ↓
X9D-IMPL (Add capabilities to domain)
    ↓
X9C-5 (Service refactoring resumes - now safe)
    ├─ Decisions service refactor
    ├─ Stage.ts refactor
    └─ Owner-dashboard refactor
    ↓
X9C-6 (Additional service refactors)
```

---

## Notes for Implementation Team

When X9D-IMPL is authorized:

1. **Read First:** Read this design document and the gap analysis
2. **Follow the Lists:** Exact files allowed/forbidden are above
3. **Verify Formats:** New constants use `"domain:action"` format
4. **Run Tests:** All tests must pass before approval
5. **Validate Scanner:** Scanner should show no NEW violations
6. **Commit Message:** Reference X9D design when committing

---

## Conclusion

X9D Governance Capability Mapping Design is complete. Option A has been selected and detailed. Implementation plan is ready.

**Next Step:** X9D-IMPL (implementation phase) to add missing capabilities to domain CAPABILITIES.

**Estimated Effort:** ~2 hours for complete implementation and testing.

**Risk Level:** LOW (straightforward addition of constants, no complex logic).

**Benefit:** Unblocks X9C-5 and all subsequent service refactoring by resolving critical capability namespace gap.

