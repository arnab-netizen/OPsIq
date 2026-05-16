# X9C-2R: Service Refactor Risk Decision

**Phase:** X9C-2R (Reconciliation + Service Preflight)  
**Date:** 2026-05-15  
**Status:** RISK ASSESSMENT COMPLETE

---

## Question: Is Direct Service Refactoring Safe Now?

**Answer: NO - NOT SAFE WITHOUT DESIGN WORK FIRST**

**Evidence:**
1. 4 services with auth-guard imports identified
2. 2 services already correctly refactored (template available)
3. 5 services with governance logic (design-dependent)
4. No clear service boundary design documented
5. Signature changes will impact routes, services, and tests
6. Risk of breaking non-migrating routes while changing shared services

---

## Service Refactoring Risk Analysis

### Safe to Refactor Now
**Services:** engagement.ts, client-account.ts  
**Status:** Already use parameter-based approach (hasInternalAccess boolean)  
**Risk:** LOW - Can add more callers safely  
**Action:** Use as templates, no changes needed

### NOT Safe to Refactor Without Design
**Services:** owner-dashboard.service.ts, deliverable.ts, stage.ts, findings.ts  
**Issue:** Import requireCapabilityForService from auth-guard  
**Blocker:** No clear replacement pattern  
**Risk:** HIGH - Breaking changes if done without design  
**Questions:**
- What parameters replace requireCapabilityForService calls?
- How do services validate without auth-guard?
- Can services coexist in mixed canonical/legacy state?
- How do tests validate the new pattern?

### Cannot Refactor Yet (Design Dependency)
**Services:** 5+ with governance/workspace/role logic  
**Blocker:** X9D workspace/role design not complete  
**Risk:** HIGH - Governance semantics unclear  
**When:** After X9D design finalization

---

## Would Service Refactoring Weaken Service Boundary?

**Answer: POSSIBLY YES - IF NOT DESIGNED CAREFULLY**

**Risk Scenario:**
Currently, services are protected by auth-guard imports. If we remove those imports without establishing clear CALLER responsibility for validation, we create a gap:
- Old pattern: Service validates using requireCapabilityForService
- New pattern (if done wrong): Service trusts caller to validate, but caller validation is inconsistent

**Mitigation:**
Service refactoring MUST include:
1. Clear documentation of WHAT each service assumes about caller validation
2. Explicit parameters that encode validation responsibility
3. Tests that verify services are called with correct parameters
4. Gradual transition (don't remove auth-guard imports until all callers updated)

**Example (WRONG):**
```typescript
// Before: Service validates
export function doSomething(data) {
  await requireCapabilityForService("WRITE");
  // do work
}

// After (WRONG): Service trusts caller
export function doSomething(data, hasWriteCapability) {
  // No validation! Assumes caller passed correct parameter
  // do work
}
```

**Example (RIGHT):**
```typescript
// Before
export function doSomething(data) {
  await requireCapabilityForService("WRITE");
  // do work
}

// After (with design)
export function doSomething(data, capabilities: Set<string>) {
  if (!capabilities.has("WRITE")) {
    throw new ForbiddenError("WRITE capability required");
  }
  // do work
}
```

---

## Does Service Refactoring Require Policy Context Contract Changes?

**Answer: YES - BUT IT'S BROADER THAN JUST POLICY**

**Currently:**
- Services accept authContext: CanonicalAuthContext
- Some access authContext.policy directly (need to check)
- Some receive boolean parameters (already refactored)

**After Refactoring (needed):**
- Services MUST NOT receive CanonicalAuthContext directly
- Services receive extracted parameters only:
  - Boolean flags (hasInternalAccess, hasWriteCapability)
  - User IDs (verifiedActorId)
  - Workspace IDs (verifiedWorkspaceId)
  - Capability sets (verifiedCapabilities)
- Services have NO access to optional fields (policy, session, request)

**Challenge:**
Some services might depend on ctx.policy or other optional context fields for complex validation. If so, that's a blocker for moving those fields out of the context object.

---

## Does Service Refactoring Require Workspace/Membership Design?

**Answer: YES - FOR 5+ SERVICES WITH GOVERNANCE LOGIC**

**Scope 1 (X9C-3 compatible):**
- 4 services with simple requireCapabilityForService calls
- These can be refactored using boolean capability parameters
- Do NOT require workspace/role design changes

**Scope 2 (X9D dependent):**
- 5+ services with custom workspace scoping
- 5+ services with role-based filtering
- These require X9D to clarify what workspace/role/membership assumptions services can make
- Cannot be safely refactored until design complete

**Example of Scope 2 blocker:**
```typescript
// Service needs to know: "Is this workspace scoped to this user?"
// But that requires understanding workspace membership model
// Which is X9D scope
export function getWorkspaceData(workspaceId, userId) {
  // Can't refactor safely until X9D clarifies
  // membership/access assumptions
}
```

---

## Does Service Refactoring Require Scanner Changes?

**Answer: NO - But it WILL REDUCE violations**

**Current Scanner Violations from Services:** ~60-80 (auth-guard imports)  
**After X9C-3 Service Refactoring:** Reduced to ~0-20  
**Remaining violations:** ~370-390 (from routes and infrastructure)

**Important:** Service refactoring doesn't require scanner changes, but WILL help validation when routes are migrated.

---

## Should the Next Phase Be Design-Only or Implementation Pilot?

**Answer: DESIGN-ONLY FOR X9C-3**

**X9C-3 Recommended Scope:** Service Boundary Design Phase (NOT implementation)

**Why Design-Only First:**
1. 4 services need parameter-based refactoring (no clear pattern yet)
2. 5 services need governance design before refactoring
3. Signature changes will impact 20+ route files
4. Test strategy unclear
5. Risk of breaking non-migrating routes while changing shared services

**X9C-3 Design Phase Deliverables:**
1. Service boundary design document (which services, which parameters)
2. Parameter specification for each service function
3. Test strategy for parameter-based services
4. Gradual migration plan (which services to refactor first)
5. Co-existence plan (how to handle canonical + legacy callers during transition)

**X9C-4 Pilot Phase:**
After X9C-3 design complete:
1. Select 1-2 "pilot" services to refactor first (proof of concept)
2. Update callers (1-2 route files)
3. Update tests
4. Validate against baseline
5. Rollout to remaining services

---

## Final Risk Decision: Recommended Next Phase

## **SELECTED: X9C-3_SERVICE_BOUNDARY_DESIGN_ONLY**

### Why This Path:

**Strengths:**
- Reduces risk of breaking changes
- Creates clear specification before implementation
- Allows parallel work (X9D governance design doesn't block this)
- Produces reusable patterns (Scope 1 can be template for others)
- Safer for shared services (prevents accidental breakage)

**How It Works:**
1. X9C-3 (months 1-2): Service Boundary Design
   - Design new parameter-based patterns
   - Document service assumptions
   - Create test strategy
   - Plan migration sequence
   
2. X9D (parallel): Workspace/Role Design
   - Clarify governance semantics
   - Unblock Scope 2 services
   
3. X9C-4 (months 3-4): Service Refactor Pilot
   - Refactor Scope 1 services (4 high-priority)
   - Migrate dependent routes
   - Validate against baseline
   
4. X9C-5 (months 5-6): Policy Wrapper Pilots
   - Use refactored services with new wrapper
   - Apply policy enforcement at route level

### Rejected Alternatives:

**X9C-3_SERVICE_REFACTOR_PILOT_SELECTION_ONLY**
- ✗ Skip design, go straight to picking services
- ✗ Too much risk of breaking changes
- ✗ No clear specification for routes to follow

**X9C-3_POLICY_MUTATION_ROUTE_DESIGN**
- ✗ Can't design route mutations without knowing service boundaries
- ✗ Services are the blocker, not routes
- ✗ Puts cart before horse

**X9D_GOVERNANCE_CAPABILITY_MAPPING_DESIGN**
- ✗ Not the right blocker now
- ✗ Scope 1 services don't need governance design
- ✗ Can parallelize instead of sequencing

**X8B_WORKSPACE_MEMBERSHIP_DESIGN** / **X7B_POLICY_MUTATION_DESIGN**
- ✗ Already completed or superseded
- ✗ Focus is too narrow
- ✗ Doesn't address immediate blockers

---

## Recommendation Summary

**Next Phase:** X9C-3_SERVICE_BOUNDARY_DESIGN_ONLY

**Scope:**
- Design parameter-based service refactoring pattern
- Document which services, which functions, which parameters
- Create test strategy
- Plan rollout sequence
- Plan co-existence during transition (canonical + legacy callers)

**Outputs:**
- Service Boundary Design Document (specification)
- Service Refactoring Sequence Plan
- Test Strategy for Parameter-Based Services
- Co-Existence & Transition Plan

**Timeline:** 4-6 weeks

**Blockers Unblocked:** None yet (but sets up X9C-4)

**Parallel Work:** X9D (governance design - doesn't block X9C-3)

**Next After This:** X9C-4 (Refactor Scope 1 services as pilot + migrate dependent routes)

---

## Risk Assessment: Service Boundary Design Phase

**Risk Level:** LOW

**Risks:**
- ✓ MITIGATED: No code changes, only design documentation
- ✓ MITIGATED: Can be reviewed without touching implementation
- ✓ MITIGATED: Parallelize with X9D to keep momentum
- ✓ MITIGATED: Design flaws caught early, before mass refactoring

**Success Criteria:**
- ✓ Clear specification for parameter-based services
- ✓ Unambiguous test strategy
- ✓ Risk assessment for each service
- ✓ Rollout plan with success metrics
- ✓ Mitigation for co-existence period

---

**Decision:** ✓ **X9C-3_SERVICE_BOUNDARY_DESIGN_ONLY**

**Status:** APPROVED FOR NEXT PHASE
