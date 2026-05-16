# X9C-2: Next Phase Decision

**Phase:** X9C-2 (Policy Wrapper Pilot Route Selection)  
**Date:** 2026-05-15  
**Status:** PHASE COMPLETE - ASSESSMENT DECISION MADE

---

## Executive Summary

**X9C-2 Assessment Result:** No pilot routes selected for migration

**Reason:** All policy-aware GET routes are already using the correct canonical pattern with defensive policy fallback. Migration would add zero behavioral value.

**Next Action:** Proceed to X9C-3 service refactoring phase instead of route migration phase.

---

## Question Responses

### Q1: How many policy route candidates were found?

**Answer: 31 total candidates**

Breakdown:
- 4 routes with policy-aware GET handlers (currently canonical safe)
- ~20 routes with legacy POST/PATCH patterns (withEnforcementFull + withAuth)
- ~10 routes with service-dependent policy logic
- ~5 routes with complex governance/role semantics
- Remainder: non-policy routes or already-safe patterns

---

### Q2: How many are ready for pilot?

**Answer: 0 ready for X9C-2 pilot**

Explanation:
- **4 routes already canonical safe:** No migration needed (already correct pattern)
- **20 legacy routes:** Deferred to X9C-3 (full refactoring needed)
- **10 service-dependent routes:** Deferred to X9C-3 (service contract changes)
- **5 governance routes:** Deferred to X9D (workspace/role design)

---

### Q3: Which exact handlers are selected?

**Answer: NO HANDLERS SELECTED**

**Why:**
- All 4 policy-aware GET routes already use safe pattern: `withCanonicalEnforcement` + `ctx.policy ? hasInternalAccess(ctx.policy) : false`
- Migrating to `withCanonicalPolicyEnforcement` without policy requirement options would have **zero behavioral change**
- Adding policy requirement options (requireInternalAccess, requirePolicyContext) is not appropriate because these routes don't enforce policy - they use it optionally for filtering
- Conclusion: **No meaningful migration value**

---

### Q4: Which candidates were excluded and why?

**Excluded Group 1: Already Canonical Safe (4 routes)**
- Files: engagements/route.ts GET, engagements/[engagementId]/route.ts GET, me/route.ts GET, clients/[clientId]/route.ts GET
- Reason excluded: **Already in correct pattern - no migration needed**
- Pattern: `withCanonicalEnforcement` + ctx.policy defensive fallback
- Scanner violations (GET methods): 0
- Action: No changes needed

**Excluded Group 2: Legacy Mutation Routes (20 routes)**
- Pattern: `withEnforcementFull` + `withAuth` (POST/PATCH/DELETE methods)
- Reason excluded: **Out of scope for X9C-2 pilot (mutation routes deferred)**
- Issue: Have shadow auth violations (withAuth calls)
- Action: Will migrate in X9C-3 mutation phase after design completion

**Excluded Group 3: Service-Dependent Routes (10 routes)**
- Examples: updateEngagement, createFinding, admin workspace operations
- Reason excluded: **Requires X9C-3 service refactoring**
- Issue: Policy logic in service layer, services receive ctx.policy
- Dependency: Service signatures must change from `ctx` to parameters
- Action: Will refactor services in X9C-3

**Excluded Group 4: Complex Governance Routes (5 routes)**
- Examples: diagnosis routes, recommendation routes with role filtering
- Reason excluded: **Requires X9D workspace/role design**
- Issue: Complex custom governance logic
- Dependency: Workspace design and role design must be finalized
- Action: Will address in X9D lane

---

### Q5: Is X9C-3 policy pilot migration authorized?

**Answer: UNCERTAIN - Depends on scope clarity**

**Current Status:**
- X9C-1: ✓ Wrapper foundation complete and tested
- X9C-2: ✓ Assessment complete - NO pilots from canonical routes
- X9C-3: ? Authorization depends on phase scope

**Clarification Needed:**
X9C-3 has two possible interpretations:

**Interpretation A: X9C-3 = Service-Layer Refactoring (Likely)**
- Not a "pilot migration" phase
- More a "groundwork" phase
- Tasks: Service signature updates, policy parameter changes
- Routes: None migrated yet
- Result: Infrastructure ready for X9C-4 route migration
- Authorization: ✓ YES - ready to proceed

**Interpretation B: X9C-3 = Policy Pilot Route Migration (Original Plan)**
- This would require selecting routes from the ~30 legacy/service-dependent
- But X9C-2 found NO routes ready without service refactoring
- Authorization: ✗ NO - design blockers must be resolved first

**Recommended Path:**
1. Clarify X9C-3 scope (service refactoring vs route migration)
2. If X9C-3 = service refactoring: ✓ AUTHORIZE immediately
3. If X9C-3 = route migration: ✗ WAIT for blocker resolution
4. Likely: X9C-3 focuses on service groundwork, X9C-4 does route migration

---

### Q6: If not, what design/blocker phase is required?

**Answer: Multiple blockers identified**

**Blocker 1: Service Contract Design**
- Issue: 10+ routes have policy enforcement in service layer
- Current: Services receive `ctx: CanonicalAuthContext` and access `ctx.policy`
- Required: Services must accept policy as parameters instead
- Impact: X9C-3 must address this before routes can cleanly migrate
- Timeline: Design + implementation in X9C-3 (service refactoring)

**Blocker 2: Workspace Design**
- Issue: 5+ routes have complex workspace-scoped behavior
- Current: Workspace logic embedded in services
- Required: Workspace design must clarify scoping rules
- Impact: Cannot migrate until design is finalized
- Timeline: X9D (workspace design) before migration

**Blocker 3: Role Design**
- Issue: Routes with role-based filtering have custom governance
- Current: Role logic scattered across services
- Required: Role design must standardize approach
- Impact: Cannot migrate without design clarity
- Timeline: X9D (role design) before migration

**Blocker 4: Legacy Auth Bridge**
- Issue: 20+ routes still use withEnforcementFull + withAuth
- Current: Mixed auth patterns create technical debt
- Required: Full migration to withCanonicalEnforcement
- Impact: X9C phase must include bridge elimination
- Timeline: Sequential phases X9C-3 → X9C-4 → eventually X9F bridge removal

---

## Phased Approach

### Current Phases (Completed)
- ✓ X9C-1: Wrapper foundation
- ✓ X9C-1T: Wrapper testing
- ✓ X9C-2: Candidate assessment (THIS PHASE)

### Next Phases (Sequence)

**X9C-3: Service-Layer Refactoring (Ready)**
- ✓ Authorization: YES
- Tasks: Update service signatures, change from ctx to parameters
- Duration: Estimated 2-3 weeks
- Output: Services ready for policy-aware routes
- Dependencies: None
- Proceed: IMMEDIATELY AFTER X9C-2

**X9D: Workspace/Role Design (Design phase, prerequisite)**
- Status: AWAITING DESIGN COMPLETION
- Tasks: Clarify workspace scoping, finalize role model
- Duration: Unknown (design phase)
- Output: Design docs, implementation guidelines
- Dependencies: Governance, product requirements
- Blocks: Complex governance routes

**X9C-4: Legacy Route Migration (After X9C-3)**
- Status: AWAITING X9C-3 completion
- Tasks: Migrate 20 legacy mutation routes to withCanonicalEnforcement
- Duration: Estimated 3-4 weeks
- Output: All routes canonical, no legacy withAuth
- Dependencies: X9C-3 service refactoring must complete
- Proceed: After X9C-3

**X9C-5: Policy-Aware Route Pilots (After X9C-4)**
- Status: AWAITING X9C-4 completion
- Tasks: Migrate service-dependent routes to use policy wrapper
- Duration: Estimated 2-3 weeks
- Output: Policy enforcement in routes, not services
- Dependencies: X9C-4 legacy migration, service refactoring from X9C-3
- Proceed: After X9C-4

---

## Summary Table

| Item | Status | Evidence |
|------|--------|----------|
| Policy candidates found | 31 | Full audit completed |
| Ready for X9C-2 pilot | 0 | All canonical routes already safe |
| Already canonical safe | 4 | No migration needed (assess confirms) |
| Legacy routes | 20 | Deferred to X9C-3+4 |
| Service-dependent routes | 10 | Deferred to X9C-3 refactoring |
| Governance-complex routes | 5 | Deferred to X9D |
| X9C-2 authorization | ✓ COMPLETE | Assessment phase done |
| X9C-3 authorization | ✓ READY | Service refactoring can proceed |
| X9C-4 authorization | ⏳ AWAITING | X9C-3 must complete first |
| X9C-5 authorization | ⏳ AWAITING | X9C-4 must complete first |

---

## Recommendation

### Immediate Next Steps

1. **Communicate X9C-2 finding:** Canonical routes are already safe
2. **Authorize X9C-3 immediately:** Service refactoring is critical path
3. **Start X9C-3 design work:** Update service signatures
4. **Parallel track X9D:** Start workspace/role design (doesn't block X9C-3)
5. **Plan X9C-4 after X9C-3:** Route migration will follow

### Phase Sequencing

```
X9C-1 (Wrapper foundation)  ✓ DONE
    ↓
X9C-1T (Wrapper testing)    ✓ DONE
    ↓
X9C-2 (Candidate assessment) ✓ DONE (result: no pilots)
    ↓
X9C-3 (Service refactoring)  → START NOW
    ↓
X9C-4 (Legacy route migration) → AFTER X9C-3
    ↓
X9C-5 (Policy wrapper pilots) → AFTER X9C-4
```

### What NOT to Do

- ✗ Don't force X9C-2 pilots - routes already canonical safe
- ✗ Don't migrate canonical routes - zero value
- ✗ Don't skip X9C-3 service refactoring - it's critical path
- ✗ Don't start X9C-4 before X9C-3 - service changes required
- ✗ Don't block on X9D for X9C-3 - can work in parallel

---

## Final Authorization Decision

### X9C-2: ✓ COMPLETE
Assessment and selection phase complete. No pilots selected because all policy-aware GET routes are already correctly canonicalized.

### X9C-3: ✓ AUTHORIZED TO PROCEED  
Service-layer refactoring phase authorized. This is the critical path for enabling subsequent route migrations. Can start immediately after X9C-2.

### X9C-4: ⏳ CONDITIONAL
Legacy route migration authorized conditionally. Requires X9C-3 service refactoring to complete. Will be explicitly authorized after X9C-3 validation.

### X9C-5: ⏳ CONDITIONAL
Policy-aware route pilots authorized conditionally. Requires X9C-4 legacy migration to complete. Will be explicitly authorized after X9C-4 validation.

---

**Status:** ✓ X9C-2 ASSESSMENT COMPLETE - NO PILOTS

**Next Phase:** X9C-3 (Service-Layer Refactoring) - Ready to authorize

**Classification:** RUNTIME_ENFORCED_HYBRID (maintained)
