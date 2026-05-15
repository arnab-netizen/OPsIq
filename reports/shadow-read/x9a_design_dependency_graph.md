# X9A: Design Dependency Graph

**Phase:** X9A (Lane 9 Contract / Service / Governance Blocker Audit)  
**Date:** 2026-05-15  
**Status:** DESIGN DEPENDENCY MAPPING COMPLETE

---

## Design Decision Nodes

### Node 1: POLICY_CONTEXT_CANONICAL_DESIGN
**Highest Dependency - PREREQUISITE**

**What:** Design how PolicyContext (tier, role, internal-access, capability grants) integrates into CanonicalAuthContext

**Blocks:**
- Lane 7 completion (internal access in GET handlers)
- Service contract modernization
- Role/admin operation handling
- Workspace membership validation

**Unblocks if resolved:**
- 12 scanner violations (Lane 7 GET handlers, auth.ts service)
- Service-level capability design
- Role canonicalization

**Decision questions:**
- Is PolicyContext part of CanonicalAuthContext or separate parameter?
- Which policy data is essential vs. computed?
- How to determine internal access in wrapper without performance cost?
- Should policy be required or optional?

**Risk:** HIGH (foundational - affects all auth)

**Runtime impact:** Must preserve RUNTIME_ENFORCED_HYBRID - policy must be enforced at wrapper level, not silently degraded

---

### Node 2: SERVICE_CANONICAL_CONTEXT_DESIGN
**Depends on:** POLICY_CONTEXT_CANONICAL_DESIGN

**What:** Design service-level auth handling - should services receive CanonicalAuthContext and validate capabilities inline?

**Blocks:**
- 5 critical services (stage.ts, deliverable.ts, findings.ts, owner-dashboard.ts, auth.ts)
- Service contract modernization
- 18 scanner violations

**Unblocks if resolved:**
- Service-level auth-guard imports removal
- Capability validation refactoring
- BLOCK_BUILD violations in services

**Decision questions:**
- Should services validate capabilities or assume caller did?
- Should services receive CanonicalAuthContext or legacy AuthContext?
- How to handle policy context in services (if at all)?
- Should there be service-level auth helper functions?

**Risk:** HIGH (5 critical services)

**Runtime impact:** Must preserve idempotency and audit logging in service mutations

---

### Node 3: WORKSPACE_MEMBERSHIP_CANONICAL_DESIGN
**Depends on:** POLICY_CONTEXT_CANONICAL_DESIGN

**What:** Design workspace membership validation in CanonicalAuthContext - should withCanonicalEnforcement validate workspace membership?

**Blocks:**
- Lane 8 POST/PATCH handler migrations (~30-40 handlers)
- Workspace enforcement wrapper design
- 30+ scanner violations if routes were migrated

**Unblocks if resolved:**
- Workspace mutation pattern (POST/PATCH in workspace-enforced handlers)
- Tenant isolation guarantee in canonical wrapper
- Lane 8 pilot migrations

**Decision questions:**
- Should membership validation happen in wrapper or service layer?
- Should verified workspace membership be part of CanonicalAuthContext?
- How to handle enforceWorkspaceScoping() logic in wrapper?
- What happens if user is not member of workspace?

**Risk:** MEDIUM-HIGH (security-critical - tenant isolation)

**Runtime impact:** CRITICAL - workspace enforcement is security boundary. Cannot weaken checks.

---

### Node 4: ROLE_INTERNAL_ACCESS_CANONICAL_DESIGN
**Depends on:** POLICY_CONTEXT_CANONICAL_DESIGN

**What:** Design custom role-based auth integration - should there be separate wrapper for role-based operations?

**Blocks:**
- Lane 8 custom role handler migrations (~5-10 handlers)
- Admin/special operation pattern design
- 10+ scanner violations if routes migrated

**Unblocks if resolved:**
- Role-based auth pattern (separate from capability-based)
- Admin/workspace disable operations
- Entity operations requiring role checks

**Decision questions:**
- Should custom roles be separate wrapper (withCanonicalRoleEnforcement)?
- How do role-based and capability-based auth coexist?
- Should resolveServerRole() move into wrapper or stay in routes?
- Can roles be expressed as capabilities?

**Risk:** MEDIUM (affects fewer handlers than workspace)

**Runtime impact:** Must distinguish role-based from capability-based auth without weakening either

---

### Node 5: MISSING_CAPABILITY_MODEL_DECISION
**Independent - No dependencies**

**What:** Add DECISION_CREATE to canonical CAPABILITIES constant

**Blocks:**
- Lane 3 decision/create governance blocker (deferred)
- 2 scanner violations

**Unblocks if resolved:**
- Decision/create route migrations
- Canonical capability model completeness

**Decision questions:**
- Is DECISION_CREATE a first-class capability?
- Should it map to entitlement.ts Capability.DECISION_CREATE?
- Any governance model implications?

**Risk:** LOW (isolated governance change)

**Runtime impact:** Minimal - just adds capability constant

---

### Node 6: BACKGROUND_ACTOR_CONTEXT_DESIGN
**Independent - No dependencies**

**What:** Design system actor context (webhooks, background jobs, events)

**Blocks:**
- 0 scanner violations (not in violation count)
- Architecture consistency for system actors

**Unblocks if resolved:**
- Documented pattern for system actors
- Background job context design

**Decision questions:**
- Should system actors have separate wrapper pattern?
- How to construct audit context for system-triggered events?
- Who is the "actor" for webhook events?

**Risk:** LOW (does not affect security enforcement)

**Runtime impact:** None - current pattern (withEnforcementFull for webhooks) is correct

---

### Node 7: AUDIT_IDEMPOTENCY_MUTATION_CONTRACT_DESIGN
**Independent - No dependencies**

**What:** Design mutation contract for services - audit logging, idempotency, re-evaluation triggers

**Blocks:**
- Services with re-evaluation triggers (triggerReEvaluation)
- 3 scanner violations (indirect)

**Unblocks if resolved:**
- Safe mutation semantics
- Re-evaluation guard rails
- Audit/idempotency guarantees

**Decision questions:**
- Should mutation services be idempotent?
- Who can trigger re-evaluation?
- How to audit re-evaluation decisions?
- Should re-evaluation be part of canonical auth context?

**Risk:** MEDIUM (foundational for safe mutations)

**Runtime impact:** Must prevent duplicate mutations and ensure audit trail

---

### Node 8: QUARANTINED_BRIDGE_REMOVAL_STRATEGY
**Depends on:** POLICY_CONTEXT_CANONICAL_DESIGN, SERVICE_CANONICAL_CONTEXT_DESIGN, WORKSPACE_MEMBERSHIP_CANONICAL_DESIGN

**What:** Remove canonicalizeAuthContext() transitional bridges (~31 files)

**Blocks:**
- Transitional technical debt
- 18 scanner violations (bridge-using routes)

**Unblocks if resolved:**
- Clean canonical-only auth patterns
- Reduced legacy code
- Scanner violations from bridge usage

**Decision questions:**
- When should bridge be removed (after all design decisions)?
- Can some routes use bridges while others are direct canonical?
- Should bridge removal happen as part of final design phases or separate cleanup?

**Risk:** LOW (once all design decisions made)

**Runtime impact:** Depends on other design nodes - cannot proceed until they complete

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         POLICY_CONTEXT_CANONICAL_DESIGN (P1)                │
│                           [PREREQUISITE FOR ALL]                            │
│                    (12 violations, affects Lane 7 + services)               │
└─────────────────┬───────────────────────────────────────┬───────────────────┘
                  │                                       │
                  ▼                                       ▼
     ┌────────────────────────┐             ┌─────────────────────────────┐
     │SERVICE_CANONICAL_CONTEXT│             │ WORKSPACE_MEMBERSHIP_        │
     │    DESIGN (P1)          │             │ CANONICAL_DESIGN (P1)       │
     │(5 services, 18 viols)   │             │(30-40 handlers, 30+ viols)  │
     └────────────────────────┘             └──────────┬──────────────────┘
                  │                                    │
                  │                         ┌──────────▼──────────────┐
                  │                         │                         │
                  │                         ▼                         ▼
                  │              ┌────────────────────┐  ┌──────────────────┐
                  │              │ROLE_INTERNAL_ACCESS│  │QUARANTINED_BRIDGE │
                  │              │CANONICAL_DESIGN(P1)│  │REMOVAL_STRATEGY(P2)
                  │              │(5-10 handlers,10v) │  │(31 files, 18 viols)
                  │              └────────────────────┘  └──────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    INDEPENDENT DECISIONS (No dependencies)                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ • MISSING_CAPABILITY_MODEL_DECISION                     [LOW RISK, 2 viols] │
│ • BACKGROUND_ACTOR_CONTEXT_DESIGN                      [LOW RISK, 0 viols] │
│ • AUDIT_IDEMPOTENCY_MUTATION_CONTRACT_DESIGN           [MED RISK, 3 viols] │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Path Analysis

### Highest-Impact Design: POLICY_CONTEXT_CANONICAL_DESIGN
- **Impact:** Blocks ALL other design nodes
- **Violation reduction:** 12 direct + enables 30+ more from downstream decisions
- **Risk level:** HIGH (foundational)
- **Must resolve first:** YES - nothing else can proceed without this

### Second Tier: SERVICE_CANONICAL_CONTEXT_DESIGN + WORKSPACE_MEMBERSHIP_CANONICAL_DESIGN
- **Impact:** Both depend on Policy Context design
- **Can be done in parallel:** YES (independent of each other)
- **Combined reduction:** 18 + 30+ = 48+ violations
- **Timeline:** After Policy Context design

### Bridge Removal: QUARANTINED_BRIDGE_REMOVAL_STRATEGY
- **Depends on:** All other canonical designs
- **Impact:** 18 violations (routes using bridges)
- **Timing:** Final cleanup phase after all design nodes complete
- **Risk:** LOW once prerequisites resolved

### Independent Work:
- MISSING_CAPABILITY_MODEL_DECISION: Can start immediately (2 violations)
- BACKGROUND_ACTOR_CONTEXT_DESIGN: Can start immediately (0 violations)
- AUDIT_IDEMPOTENCY_MUTATION_CONTRACT_DESIGN: Can start immediately (3 violations)

---

## Recommended Sequencing

### Phase X9B-1: POLICY_CONTEXT_CANONICAL_DESIGN (Sequential)
**Start:** Immediately  
**Duration:** 2-3 days  
**Deliverable:** PolicyContext integration design specification  
**Risk:** HIGH (foundational)

**Acceptance criteria:**
- [ ] How policy data flows into CanonicalAuthContext (or stays separate)
- [ ] Internal access determination mechanism
- [ ] Role/tier representation in canonical context
- [ ] Performance impact analysis (policy lookup cost)
- [ ] Compatibility with existing routes using ctx.policy fallback

---

### Phase X9B-2a: SERVICE_CANONICAL_CONTEXT_DESIGN (Parallel with X9B-2b)
**Start:** After X9B-1 completes  
**Duration:** 2 days  
**Deliverable:** Service-level auth pattern specification  
**Dependencies:** X9B-1 (Policy Context design)

**Acceptance criteria:**
- [ ] Should services receive CanonicalAuthContext directly?
- [ ] Inline vs. helper function for capability validation
- [ ] How services access policy context (if needed)
- [ ] Migration pattern for 5 affected services

---

### Phase X9B-2b: WORKSPACE_MEMBERSHIP_CANONICAL_DESIGN (Parallel with X9B-2a)
**Start:** After X9B-1 completes  
**Duration:** 2-3 days  
**Deliverable:** Workspace enforcement wrapper specification  
**Dependencies:** X9B-1 (Policy Context design)

**Acceptance criteria:**
- [ ] Membership validation in wrapper vs. service layer
- [ ] enforceWorkspaceScoping() integration approach
- [ ] CanonicalAuthContext.verifiedWorkspaceId semantics
- [ ] Tenant isolation guarantee mechanism
- [ ] Fallback behavior for non-members

---

### Phase X9B-2c: ROLE_INTERNAL_ACCESS_CANONICAL_DESIGN (Parallel with 2a/2b)
**Start:** After X9B-1 completes  
**Duration:** 1-2 days  
**Deliverable:** Role-based auth wrapper specification  
**Dependencies:** X9B-1 (Policy Context design)

**Acceptance criteria:**
- [ ] Separate wrapper needed (withCanonicalRoleEnforcement)?
- [ ] How role-based and capability-based coexist
- [ ] Admin operation pattern (disable workspace, etc.)
- [ ] Migration pattern for 5-10 role handlers

---

### Phase X9B-3: QUICK_WINS (Independent, can start immediately)
**Start:** In parallel with X9B-1  
**Duration:** 1 day  
**Deliverables:**
- [ ] Add DECISION_CREATE to CAPABILITIES constant
- [ ] Design audit/idempotency mutation contract  
- [ ] Document system actor context pattern

---

### Phase X9B-4: QUARANTINED_BRIDGE_REMOVAL (Sequential)
**Start:** After X9B-2a, 2b, 2c complete  
**Duration:** 1-2 days  
**Deliverable:** Bridge removal completion plan  
**Dependencies:** All canonical design decisions (X9B-1, 2a, 2b, 2c)

**Acceptance criteria:**
- [ ] All routes migrated from canonicalizeAuthContext bridges
- [ ] Bridge function deprecated (marked for deletion)
- [ ] Test suite for bridge updated/deleted

---

## Safety Guarantees

### Runtime Enforcement (Must Preserve)
- ✓ RUNTIME_ENFORCED_HYBRID classification maintained
- ✓ Workspace membership enforcement not weakened
- ✓ Capability checks enforced at wrapper/service layer
- ✓ Policy context not silently omitted
- ✓ Tenant isolation boundaries preserved

### Architectural Constraints
- ✗ No service contract regression
- ✗ No auth-guard imports in routes (only in bridges)
- ✗ No `any` type or type casting to bypass checks
- ✗ No silent auth failures

### Testing Requirements
- [ ] All design decisions include acceptance test criteria
- [ ] Bridge removal includes test coverage verification
- [ ] Service contract changes include integration tests
- [ ] Workspace enforcement includes tenant isolation tests

---

## Timeline Summary

| Phase | Duration | Critical Path? | Parallel Feasible? |
|-------|----------|---------------|--------------------|
| X9B-1: Policy Context | 2-3 days | YES | No (prerequisite) |
| X9B-2a: Service Context | 2 days | YES | With 2b, 2c |
| X9B-2b: Workspace Member | 2-3 days | YES | With 2a, 2c |
| X9B-2c: Role Design | 1-2 days | YES | With 2a, 2b |
| X9B-3: Quick Wins | 1 day | NO | Can start now |
| X9B-4: Bridge Removal | 1-2 days | NO | After all designs |
| **Total** | **~11 days** | - | **~6-8 days parallel** |

---

## Which Design Unlocks Most Violations?

**POLICY_CONTEXT_CANONICAL_DESIGN:** 42 violations
- Direct: 12 (routes + auth.ts)
- Enables Service Design: +18
- Enables Workspace Design: +30+
- Enables Role Design: +10

**WORKSPACE_MEMBERSHIP_CANONICAL_DESIGN (if resolved independently):** 30+ violations
- Enables ~30-40 POST/PATCH handler migrations

**SERVICE_CANONICAL_CONTEXT_DESIGN (if resolved independently):** 18 violations
- Service-level auth violations

---

## Which Decision is Safest to Do First?

**POLICY_CONTEXT_CANONICAL_DESIGN** is both prerequisite AND safest because:
1. Foundational - affects all other decisions
2. No implementation until design is approved
3. Design-only phase - no code risk
4. Must be done before any service/workspace/role code changes

**Quick wins (MISSING_CAPABILITY_MODEL, AUDIT_IDEMPOTENCY_CONTRACT) can happen in parallel** - they have no dependencies

---

## Status

| Design Node | Prerequisite? | Can Start Now? | Risk Level |
|------------|--------------|---|-----------|
| Policy Context | YES | NO (design first) | HIGH |
| Service Context | After Policy | NO (after X9B-1) | HIGH |
| Workspace Member | After Policy | NO (after X9B-1) | HIGH |
| Role Design | After Policy | NO (after X9B-1) | MEDIUM |
| Missing Capability | NO | YES | LOW |
| Background Actor | NO | YES | LOW |
| Audit/Idempotency | NO | YES | MEDIUM |
| Bridge Removal | After all | NO (after all designs) | LOW |

---

**Status:** ✓ Design Dependency Graph Complete - Ready for X9B Design Phase Decision
