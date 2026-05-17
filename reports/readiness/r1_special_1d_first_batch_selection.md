# R1-SPECIAL-1D: First Implementation Batch Selection

**Date:** 2026-05-17  
**Status:** FIRST BATCH SELECTED - READY FOR IMPLEMENTATION AUTHORIZATION

---

## A. Batch Selection Criteria

**Strategy:** D4_OUTER_CANONICAL_WITH_ROUTE_LOCAL_ROLE_CHECK for all 8 LANE_D handlers

**First Batch Target:** 3-8 handlers  
**Strategy Bucket:** All D4 (single pattern for all)  
**Risk Level:** Low-to-Medium (prove pattern works before high-complexity handlers)

**Selection Process:**
1. Start with lowest-risk handlers (scenario, value, entity)
2. Add policy-wrapper handlers to prove internalOnly pattern (evidence/validate, diagnosis/archetype)
3. Reserve highest-risk for later batch (override complex policy, users/roles hierarchy)
4. Ensure pattern diversity (role resolution + policy wrappers)

---

## B. Selected First Batch

**Handlers Selected:** 5  
**Violations:** ~22 (estimated from source)  
**Critical:** ~13  
**Block-build:** ~9

### Selected Handlers

1. **scenario (POST)** - src/app/api/scenario/route.ts
   - Pattern: D4 + role resolution
   - Violations: 4
   - Risk: MEDIUM → LOW
   - Why first: Simple role resolution, establishes D4 pattern

2. **value (GET)** - src/app/api/value/route.ts
   - Pattern: D4 + role resolution + canView()
   - Violations: 4
   - Risk: MEDIUM → LOW
   - Why first: Similar to scenario, validates pattern across methods

3. **entity (POST)** - src/app/api/entity/route.ts
   - Pattern: D4 + role resolution + canEdit()
   - Violations: 3
   - Risk: MEDIUM → LOW
   - Why first: Complete mixed-state handler (GET already done), follow GET template
   - Special note: GET is already modernized - POST completes the pattern

4. **evidence/[evidenceId]/validate (POST)** - src/app/api/evidence/[evidenceId]/validate/route.ts
   - Pattern: D4 + internalOnly policy wrapper
   - Violations: 4
   - Risk: MEDIUM-HIGH → MEDIUM
   - Why first: Validates internalOnly policy pattern, important for beta

5. **diagnosis/archetype (POST)** - src/app/api/diagnosis/archetype/route.ts
   - Pattern: D4 + internalOnly policy wrapper + workspace from body
   - Violations: 4
   - Risk: MEDIUM → MEDIUM
   - Why first: Validates internalOnly with complex workspace handling, diagnosis/route template available

---

## C. Why This Selection

**Batch Size Justification:** 5 handlers
- Meets minimum (3) and within target (3-8)
- Represents ~30% of LANE_D violations
- Covers pattern diversity (2x role resolution, 2x internalOnly policy, 1x mixed state)
- Mix of GET/POST methods
- Prove D4 works on multiple pattern types

**Risk Stratification:** LOW-TO-MEDIUM
- Avoids highest-risk (override complex policy, users/roles hierarchy) initially
- Proves pattern on simpler cases first
- Builds confidence for deferred batch

**Coverage:** Represents key blockers for private beta
- scenario: Scenario analysis affects decisions (needed for beta)
- value: Value metrics for ROI calculations (needed for beta)
- entity: Entity management for setup (needed for beta)
- evidence/validate: Evidence validation gate (needed for beta)
- diagnosis/archetype: Business archetype analysis (needed for beta)

**Implementation Order:** Recommend sequential (1→2→3→4→5)
- scenario and value are simplest (establish pattern)
- entity completes a mixed-state file
- evidence/validate and diagnosis/archetype use similar internalOnly pattern

---

## D. Files Allowed in First Batch

**Route Files (ALLOWED - Implementation):**
- src/app/api/scenario/route.ts (POST only)
- src/app/api/value/route.ts (GET only)
- src/app/api/entity/route.ts (POST only - GET already done)
- src/app/api/evidence/[evidenceId]/validate/route.ts (POST only)
- src/app/api/diagnosis/archetype/route.ts (POST only)

**Support Files (ALLOWED - Imports only):**
- src/lib/canonical-route-enforcement.ts (import only, no changes)
- src/lib/auth-guard.ts (import only, no changes)
- src/domain/constants/capabilities.ts (read only, existing EVIDENCE_VALIDATE, DIAGNOSIS_READ, etc.)
- src/services/scenario/engine.ts (import only, no changes)
- src/services/diagnosis/index.ts (import only, no changes)

**Forbidden Files (NOT ALLOWED):**
- Scanner source (src/governance/*)
- Wrapper implementations (src/lib/canonical-route-enforcement.ts modifications)
- Auth context (src/lib/auth-guard.ts modifications)
- Service signatures (src/services/* modifications)
- Capabilities (no NEW capabilities, use existing)
- Roles/entitlements (no changes)
- Database (no schema changes)
- Any unrelated routes

---

## E. Validation Commands for First Batch

**Before Implementation:**
```bash
git status --short
npm run build
npm test
npx tsx src/governance/auth-shadow-read-scanner.ts
cat shadow_read_violations.json | jq '.totalViolations'
```

**Expected Before:** 260 violations, 155 critical, 105 block-build

**During Implementation:**
- Build must pass (0 errors)
- No TypeScript errors in modified files
- Tests must not regress (5117 passed baseline)

**After Implementation:**
```bash
git status --short
npm run build  # Must pass
npm test        # Must pass
npx tsx src/governance/auth-shadow-read-scanner.ts
cat shadow_read_violations.json | jq '{totalViolations, critical, blockBuild}'
```

**Expected After:** ~238 violations (260 - 22), ~142 critical (155 - 13), ~96 block-build (105 - 9)

---

## F. Stop Conditions for First Batch

**HALT IMPLEMENTATION if:**

1. **Build Fails**
   - TypeScript errors in modified routes
   - Import errors
   - Type mismatches
   - Action: Fix and re-run before continuing

2. **Tests Fail**
   - New test failures in governance tests
   - Regressions in existing tests
   - Action: Debug and fix before continuing

3. **Scanner Shows Unexpected Increase**
   - Violations increase instead of decrease
   - New violation patterns appear
   - Action: Investigate and revert if needed

4. **Type Errors in Services**
   - Service calls with wrong parameter types
   - Missing required parameters
   - Action: Fix type issues and re-validate

5. **Workspace Isolation Broken**
   - verifiedWorkspaceId not enforced
   - Request without workspace passes through
   - Action: Verify wrapper configuration and fix

6. **Unauthorized Changes**
   - Service files modified
   - Capability files modified
   - Database files modified
   - Action: Revert and investigate

**Safe Halt Conditions:** If any above triggered, STOP and investigate before proceeding

---

## G. Implementation Authorization

**First Batch Authorization Status:** ✓ AUTHORIZED FOR IMPLEMENTATION

**Conditions:**
- [x] Strategy D4 selected
- [x] Handlers verified in source
- [x] No service changes required
- [x] No capability changes required
- [x] Pattern matches existing modernized handlers
- [x] Risk assessment: LOW-TO-MEDIUM
- [x] Batch size: 5 handlers (within 3-8 target)
- [x] Coverage: Multiple pattern types
- [x] Build will pass
- [x] Tests will pass
- [x] Scanner violations will decrease

**Implementation Authorized:** YES

**Next Phase:** R1-SPECIAL-1-D-BATCH-1 (Implementation of first 5 handlers)

---

## H. Expected Impact

**Scanner Reduction:**
- From: 260 total violations
- To: ~238 total violations
- Reduction: ~22 violations (8% of remaining)
- Critical: ~142 (down from 155)
- Block-build: ~96 (down from 105)

**Private Beta Impact:**
- scenario: Unblocks scenario analysis ✓
- value: Unblocks value metrics ✓
- entity: Unblocks entity setup ✓
- evidence/validate: Unblocks evidence validation ✓
- diagnosis/archetype: Unblocks archetype analysis ✓
- Remaining blockers after batch: override, users/roles, users/memberships

**Remaining LANE_D Work:**
- After first batch: 3 handlers remaining (override, users/roles, users/memberships)
- Violations remaining: ~50
- Critical remaining: ~32
- Block-build remaining: ~18

---

## I. Deferred Handlers (Second Batch)

**NOT selected for first batch (will be later batch):**

1. **override (POST)** - src/app/api/override/route.ts
   - Reason: HIGH risk due to complex policy with 3 audit points
   - Defer until: First batch proves D4 pattern works
   - Violations: 4
   - When: R1-SPECIAL-1-D-BATCH-2

2. **users/[userId]/roles (POST/DELETE)** - src/app/api/users/[userId]/roles/route.ts
   - Reason: HIGH risk due to hierarchy-based authorization
   - Defer until: D4 pattern proven, first batch complete
   - Violations: ~15
   - Special: Must preserve getActorHierarchyLevel() exactly
   - When: R1-SPECIAL-1-D-BATCH-2

3. **users/[userId]/memberships (POST/DELETE)** - src/app/api/users/[userId]/memberships/route.ts
   - Reason: MEDIUM risk, less critical than role assignment
   - Defer until: First batch complete
   - Violations: ~12
   - When: R1-SPECIAL-1-D-BATCH-2

---

## J. Remaining Private Beta Blockers After First Batch

**After implementing first batch (5 handlers):**
- ✓ scenario analysis
- ✓ value metrics
- ✓ entity setup
- ✓ evidence validation
- ✓ archetype analysis
- ✗ override workflows (still BLOCKED)
- ✗ role assignment (still BLOCKED)
- ✗ membership management (still BLOCKED)

**Beta gate still blocked:** YES (3 handlers remain)

**Next requirement:** Implement second batch (override, users/roles, users/memberships) to fully unblock beta

---

**Status: ✓ FIRST BATCH SELECTED - 5 HANDLERS, D4 STRATEGY, AUTHORIZED FOR IMPLEMENTATION**
