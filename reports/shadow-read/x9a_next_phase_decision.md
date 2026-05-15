# X9A: Next Phase Decision

**Phase:** X9A → X9B (Design Phase Sequencing)  
**Date:** 2026-05-15  
**Status:** RECOMMENDED NEXT PHASE SELECTED

---

## Selected Next Phase: X9B_POLICY_CONTEXT_CANONICAL_DESIGN

**Recommendation:** Proceed to **X9B Phase 1: Policy Context Canonical Design**

---

## Why This Decision

### Highest-Impact Decision
- Unblocks ALL other design nodes (SERVICE_CANONICAL_CONTEXT, WORKSPACE_MEMBERSHIP, ROLE_DESIGN)
- Prerequisite for 3 major design decisions that affect 48+ violations
- Policy context data (tier, role, internal access) affects every route and service

### Safest Entry Point
- Design-only phase (no code migration risk)
- No implementation until design approved
- Can be thoroughly reviewed before commitment
- Architectural clarity required before any service/wrapper changes

### Maximum Violation Reduction Path
- X9B-1 (Policy Context): Resolves 12 violations + enables 36+ more
- X9B-2a (Service Context): Additional 18 violations (enabled by X9B-1)
- X9B-2b (Workspace Member): Additional 30+ violations (enabled by X9B-1)
- X9B-2c (Role Design): Additional 10 violations (enabled by X9B-1)
- **Total potential:** 66+ violations resolvable after X9B-1 completes

### Least Risky for Tenant Isolation
- Policy context design does NOT change enforcement (design-only)
- Workspace membership patterns already explicit in code (no new security)
- Clarifies rather than weakens current enforcement boundaries

---

## Why Not Alternatives?

### Alternative A: Start with SERVICE_CANONICAL_CONTEXT_DESIGN
**Rejected because:**
- Depends on POLICY_CONTEXT design (can't complete without it)
- Affects 5 critical services - higher risk if done wrong
- Smaller impact (18 violations vs 12 for Policy Context)
- Services need policy context decisions first

### Alternative B: Start with WORKSPACE_MEMBERSHIP_CANONICAL_DESIGN
**Rejected because:**
- Depends on POLICY_CONTEXT design
- Highest implementation complexity (affects ~30-40 routes)
- Security-critical (tenant isolation) - cannot rush
- Must understand policy context first to avoid design conflicts

### Alternative C: Start with QUICK_WINS (Missing Capability, etc.)
**Rejected as primary because:**
- Only 2-5 violations each (not meaningful impact)
- Should be done IN PARALLEL with X9B-1, not instead of it
- Distracts from critical path
- Smallest architectural value

### Alternative D: Combined POLICY + SERVICE + WORKSPACE Design Phase
**Rejected because:**
- Too large scope for single phase (3 design decisions)
- Higher risk of inconsistent design decisions
- Cannot validate one without understanding the other
- Sequential design (X9B-1 → X9B-2a/2b/2c parallel) is safer

---

## X9B Phase 1 Specification: POLICY_CONTEXT_CANONICAL_DESIGN

### What Is Being Designed
How PolicyContext (tier, role, internal-access, grants, escalations, overrides) integrates into the canonical auth system.

**Current state:**
- Routes using `ctx.policy` as optional fallback
- Some services call `getPolicyContext()` for role/tier info
- Internal access checks rely on policy context
- No canonical representation for policy data

**Target state:**
- Policy context explicitly integrated into auth design
- Decision: part of CanonicalAuthContext or separate parameter?
- Clear integration path for services needing policy info
- Internal access determination mechanism documented

### Design Questions to Resolve

1. **Context Carrier**
   - Should policy be part of CanonicalAuthContext or passed separately?
   - If separate, how do services access it?
   - If part of CanonicalAuthContext, what fields are essential vs. computed?

2. **Policy Data Requirements**
   - Which policy fields must be available to routes/services?
   - What's the minimum policy info needed in CanonicalAuthContext?
   - Can tier/role be computed on-demand or must they be pre-loaded?

3. **Internal Access Mechanism**
   - How to determine "internal access" status in wrapper?
   - Should hasInternalAccess() be baked into CanonicalAuthContext?
   - Is internal access a capability or separate concern?

4. **Role/Tier Information**
   - Should role/tier be part of CanonicalAuthContext?
   - How to represent in canonical way (enum, string, computed)?
   - Impact on role-based route patterns?

5. **Performance Impact**
   - What's the cost of loading policy in wrapper?
   - Should policy loading be lazy or eager?
   - Cache strategy for policy context?

6. **Backward Compatibility**
   - How to support existing routes using ctx.policy fallback?
   - Timeline for migrating away from fallback pattern?
   - Deprecation strategy for getPolicyContext()?

### Scope Boundaries

**IN SCOPE:**
- Design decisions only (no code migration in X9B-1)
- Specification of policy context integration
- Architecture diagram showing policy flow
- Service-level impact analysis
- Route migration patterns (post-design)

**OUT OF SCOPE:**
- Service contract changes (saved for X9B-2a after design approved)
- Workspace membership patterns (handled in X9B-2b)
- Role resolution patterns (handled in X9B-2c)
- Bridge removal (handled in X9B-4 after all designs complete)
- Route migrations (will happen in X5C, X6C, X7C, etc. AFTER design approved)

### Deliverables

1. **X9B-1-policy-context-design.md**
   - Design questions answered
   - Architecture decision: policy in CanonicalAuthContext or separate?
   - Policy data field specifications
   - Internal access mechanism
   - Service integration patterns
   - Route patterns for policy-dependent operations

2. **X9B-1-policy-canonical-interface.ts**
   - Updated CanonicalAuthContext interface (if applicable)
   - Type definitions for policy data
   - Interface documentation

3. **X9B-1-design-rationale.md**
   - Why each decision was made
   - Trade-offs considered
   - Risk mitigation strategies
   - Compatibility assurances

### Acceptance Criteria

**Must resolve:**
- [ ] Decision on policy carrier (part of context or separate)
- [ ] Required vs. optional policy fields
- [ ] Internal access determination mechanism
- [ ] Role/tier representation approach
- [ ] Service access pattern (how services get policy)
- [ ] Route migration pattern (existing ctx.policy → new approach)
- [ ] Performance implications documented
- [ ] Backward compatibility strategy

**Must NOT:**
- ✗ Migrate any routes (design phase only)
- ✗ Change services (will be X9B-2a after design approved)
- ✗ Add new capabilities or governance models
- ✗ Change scanner or wrapper implementations
- ✗ Create any code implementation yet
- ✗ Weaken RUNTIME_ENFORCED_HYBRID classification

### Timeline

**Duration:** 2-3 days  
**Type:** Design phase (no code)  
**Parallel activities:** QUICK_WINS (DECISION_CREATE, background actor design)  
**Following phase:** X9B-2a/2b/2c (SERVICE, WORKSPACE, ROLE designs) - can happen in parallel

### Success Metric

Design phase is complete when:
1. All 6 design questions are answered
2. Architecture diagram is approved
3. Service-level impact analysis is documented
4. Migration patterns are clear
5. No unresolved ambiguities remain
6. Team consensus on approach

---

## Why Parallel Quick-Wins During X9B-1?

While X9B-1 is in progress, these can be done in parallel:
- **MISSING_CAPABILITY_MODEL:** Add DECISION_CREATE to CAPABILITIES (15 min)
- **BACKGROUND_ACTOR_CONTEXT:** Document system actor pattern (30 min)
- **AUDIT_IDEMPOTENCY_CONTRACT:** Design mutation semantics (1-2 hours)

These have no dependencies on X9B-1 and small effort, so running in parallel doesn't create risk.

---

## Expected Outcomes

### After X9B-1 Completes
- Clear specification for policy context integration
- Unblocked decisions for X9B-2a/2b/2c
- Approved migration approach for affected routes
- Team alignment on architectural direction

### Reduction in Violations (Eventually)
- X9B-1 (Policy Context design): 12 violations → 0 (enables service/workspace/role designs)
- X9B-2a (Service Context): 18 violations → 0
- X9B-2b (Workspace Member): 30+ violations → 0
- X9B-2c (Role Design): 10 violations → 0
- **Total achievable:** 70+ violations over 3 parallel design phases

### New Baseline After All X9B Designs Complete
- Service auth-guard imports removed
- Policy context canonicalized
- Workspace membership integrated
- Role-based auth pattern defined
- Ready for Lane 1-8 closure and X9C migration phases

---

## Risks Mitigated

**Risk:** Design decisions are wrong  
**Mitigation:** Design-only phase allows review and iteration before code changes

**Risk:** Policy context design delays other work  
**Mitigation:** Quick-wins happen in parallel; X9B-2 designs happen in parallel after X9B-1

**Risk:** Policy context is too complex  
**Mitigation:** Start with required fields only, deprecate getPolicyContext() gradually

**Risk:** Routes break during policy migration  
**Mitigation:** Design phase includes migration pattern validation before implementation

---

## No Alternative Paths

Any other starting point would:
- Start with deferred/blocked decisions (SERVICE, WORKSPACE, ROLE designs need POLICY first)
- Reduce violation impact (QUICK_WINS only affect 2-5 violations each)
- Increase risk by deferring prerequisite decision
- Extend total timeline (dependencies require sequential start)

**POLICY_CONTEXT_CANONICAL_DESIGN is the only logical start for X9B.**

---

## Status

| Phase | Status |
|-------|--------|
| X9A (Audit) | ✓ COMPLETE |
| X9B-1 (Policy Context Design) | → RECOMMENDED NEXT |
| X9B-2a/2b/2c (Service/Workspace/Role) | Blocked until X9B-1 |
| X9B-3 (Quick Wins) | Can happen in parallel |
| X9B-4 (Bridge Removal) | Blocked until X9B-2 |

---

## Approval Checklist

**To proceed to X9B Phase 1:**
- [ ] Acknowledge recommended next phase is X9B_POLICY_CONTEXT_CANONICAL_DESIGN
- [ ] Confirm allocation of design resources
- [ ] Accept 2-3 day timeline for design phase
- [ ] Agree on design-only scope (no code changes)
- [ ] Ready to proceed after design approval

---

**Status:** ✓ Recommended next phase: X9B_POLICY_CONTEXT_CANONICAL_DESIGN

**Proceed when ready.**
