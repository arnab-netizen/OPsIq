# X9D-R: Final Scope Decision

**Date:** 2026-05-15  
**Status:** FINAL DECISION RENDERED  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## SELECTED DECISION

### **APPROVE_X9D_IMPL_MINIMAL_DECISION_CAPABILITIES_ONLY**

---

## Why This Decision

### Security Rationale
- ✓ Minimal permission surface (2 capabilities vs 8)
- ✓ Both capabilities have proven route users
- ✓ No unnecessary permissions added
- ✓ Clear, defensible scope

### Testability Rationale
- ✓ Both DECISION_CREATE and DECISION_UPDATE have immediate test paths
- ✓ decisions/create route can be tested
- ✓ recommendations route can be tested
- ✓ No capabilities added without tests

### Implementation Rationale
- ✓ Fast implementation (2 constants, not 8)
- ✓ Low risk (only decision operations)
- ✓ High confidence (proven code dependencies)
- ✓ Faster approval cycle

### Future-Proofing Rationale
- ✓ Experiment capabilities can be added when experiment routes are created
- ✓ Admin/workspace capabilities can be added in future phases (X9H+)
- ✓ Extensible design (no rework needed)
- ✓ Each phase adds only what's proven necessary

---

## Rejected Alternative Decisions

### NOT APPROVED: APPROVE_X9D_IMPL_ALL_8_CAPABILITIES

**Reason:** 6 of 8 proposed capabilities lack proven route users and active code dependencies.

**Risks:**
- ❌ Adds permission surface unnecessarily
- ❌ 6 capabilities cannot be tested immediately (no routes)
- ❌ Increases chance of implementation errors
- ❌ Creates security debt (unused permissions)

### NOT APPROVED: BLOCK_X9D_IMPL (Pending Entitlement Mapping / Admin-Workspace Design)

**Reason:** Not necessary. DECISION_CREATE and DECISION_UPDATE can be implemented independently. Admin/workspace design deferred to future phases, but decision operations are ready now.

### NOT APPROVED: REPLACE_WITH_ALTERNATIVE_DESIGN

**Reason:** Option A (minimal scope) is the correct design. No alternative needed.

---

## Exact Capabilities Authorized for Implementation

**APPROVED TO ADD:**

1. `DECISION_CREATE` - "decision:create"
   - Required by: src/app/api/decisions/create/route.ts
   - Entitlement mapping: "decision_create" → CAPABILITIES.DECISION_CREATE
   - Route user count: 2 (decisions/create, recommendations)
   - Test path: Clear and immediate

2. `DECISION_UPDATE` - "decision:update"
   - Required by: Decision service + quota enforcement
   - Entitlement mapping: "decision_update" → CAPABILITIES.DECISION_UPDATE
   - Route user count: 1 (recommendations)
   - Test path: Clear and immediate

**Total Approved:** 2 capabilities

---

## Exact Capabilities Deferred/Rejected

**DEFERRED (Until Proven Necessary by Route/Service Code):**
- EXPERIMENT_CREATE (defer until experiment routes created)
- EXPERIMENT_UPDATE (defer until experiment routes created)
- ADMIN_TEAM (defer until admin team management routes created)
- WORKSPACE_CREATE (defer to workspace design phase X9H+)
- WORKSPACE_INVITE (defer to workspace design phase X9H+)

**REJECTED:**
- ADMIN_SETTINGS (redundant with existing SYSTEM_ADMIN)
  - Decision: Use existing SYSTEM_ADMIN capability
  - Action: Fix misleading comments that reference ADMIN_SETTINGS

**Total Deferred:** 5 capabilities  
**Total Rejected:** 1 capability

---

## Allowed Files for X9D-IMPL Implementation

### Files to Modify
1. `src/domain/constants/capabilities.ts`
   - Add DECISION_CREATE constant
   - Add DECISION_UPDATE constant
   - (Only 2 constants, not 8)

2. `src/services/entitlement.ts`
   - Update TIER_CONFIGS to ensure DECISION_CREATE is in appropriate tiers
   - Verify DECISION_UPDATE quota limits if needed

3. `src/app/api/decisions/create/route.ts` (Optional cleanup)
   - Consider updating string literal "decision_create" to use CAPABILITIES.DECISION_CREATE
   - Not required, but improves code consistency

4. `src/app/api/recommendations/route.ts` (Optional cleanup)
   - Same as above

### Files to Create
1. `src/__tests__/governance/governance-capabilities.test.ts`
   - Test DECISION_CREATE and DECISION_UPDATE exist
   - Test entitlement tier configs include them
   - Test route integration

### Files to Update (Optional Comments)
- Admin route files (fix ADMIN_SETTINGS comments to say SYSTEM_ADMIN instead)

---

## Forbidden Files (X9D-IMPL)

- ❌ No experiment capability additions
- ❌ No admin capability additions (use existing SYSTEM_ADMIN)
- ❌ No workspace capability additions
- ❌ No service refactoring (that's X9C-5)
- ❌ No route migrations beyond decision/recommendations
- ❌ No scanner changes
- ❌ No wrapper changes
- ❌ No auth context changes
- ❌ No new governance constants other than DECISION_CREATE/UPDATE
- ❌ No policy changes
- ❌ No workspace/role design implementation

---

## Required Tests for X9D-IMPL

### Test File: `src/__tests__/governance/governance-capabilities.test.ts`

**Required Tests:**

1. **Constant Existence**
   - DECISION_CREATE exists in CAPABILITIES
   - DECISION_UPDATE exists in CAPABILITIES
   - Both have correct values ("decision:create", "decision:update")

2. **Entitlement Tier Mapping**
   - DECISION_CREATE in FREE tier capabilities (or appropriate tier)
   - DECISION_CREATE in PRO tier capabilities
   - DECISION_CREATE in ENTERPRISE tier capabilities
   - Verify other tiers consistent

3. **Route Integration**
   - decisions/create route can check DECISION_CREATE
   - recommendations route can check DECISION_CREATE
   - Both routes fail with ForbiddenError if capability missing

4. **ServiceAuthEnvelope Integration**
   - ServiceAuthEnvelope can carry DECISION_CREATE in verifiedCapabilities
   - Capabilities set can contain new constants

**Test Scope:** ~50-75 lines of test code

---

## Expected Scanner Result After X9D-IMPL

**Total violations:** Still 448 (no change)
- Adding CAPABILITIES constants doesn't reduce violations
- Violations come from route/service layer using old patterns
- Violation reduction happens during service refactoring (X9C-5)

**What scanner sees:**
- ✓ New CAPABILITIES constants in code
- ✓ Routes using CAPABILITIES.DECISION_CREATE (recognized as safe)
- ✓ Same 448 violations (from route/service layers still using auth-guard)

**Scanner won't change because:**
- Constants are added (not violations themselves)
- Route still uses assertCapability (until X9C-5 refactors)
- Service still hasn't migrated to ServiceAuthEnvelope

---

## Rollback Rule

If X9D-IMPL encounters unexpected issues and rollback is needed:

1. Remove DECISION_CREATE constant from capabilities.ts
2. Remove DECISION_UPDATE constant from capabilities.ts
3. Remove or revert entitlement tier config updates
4. Cost: Minimal (just reverse additions)

**Unlikely needed:** Addition of 2 constants is straightforward, low risk.

---

## Next Implementation Phase Name

**Official Name:** X9D-IMPL (Governance Capability Mapping Implementation - Minimal Scope)

**Timeline:** 1-2 hours after approval
- 20 min: Add 2 constants to capabilities.ts
- 20 min: Update entitlement configs
- 30 min: Create test file and verify tests pass
- 10 min: Code review and validation

---

## Stop Conditions for X9D-IMPL

Stop and do NOT proceed if:

- ❌ Build fails
- ❌ Tests fail to pass
- ❌ Scanner shows NEW violations
- ❌ Entitlement tier configs can't be updated
- ❌ Route integration tests can't verify capability checks

**Expected:** None of these should occur (straightforward addition).

---

## Summary

### Scope Decision: ✓ APPROVED
- **Add:** DECISION_CREATE, DECISION_UPDATE (2 capabilities)
- **Defer:** EXPERIMENT_*, ADMIN_TEAM, WORKSPACE_* (5 capabilities)
- **Reject:** ADMIN_SETTINGS (use existing SYSTEM_ADMIN)

### Security Impact: ✓ IMPROVED
- Narrower permission surface (2 vs 8)
- Only proven operations (decision)
- Zero unnecessary permissions

### Implementation Impact: ✓ SIMPLER
- Faster implementation (2 constants vs 8)
- Easier testing (proven route users)
- Lower risk (minimal scope)

### Future Impact: ✓ EXTENSIBLE
- Experiment capabilities easily added when needed (X9C-6+)
- Admin/workspace capabilities deferred to design phases (X9H+)
- No rework required when deferred capabilities are added

---

## FINAL AUTHORIZATION

### ✓ X9D-IMPL IS AUTHORIZED

**Proceed with minimal scope implementation:**
- Add DECISION_CREATE and DECISION_UPDATE to domain CAPABILITIES
- Update entitlement tier configs
- Create governance-capabilities.test.ts
- No other capabilities
- No service refactoring
- No route migration beyond optional cleanup

**Authorization Scope:**
- ✓ 2 new capability constants
- ✓ Entitlement config updates
- ✓ Route optional cleanup
- ✓ 1 new test file
- ✓ Comment corrections (optional)

**Authorization Constraints:**
- ❌ No experiment/admin/workspace capabilities
- ❌ No service refactoring
- ❌ No route migrations
- ❌ No scanner changes
- ❌ No wrapper/auth context changes

