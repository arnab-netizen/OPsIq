# X8A: Next Phase Decision Matrix

**Phase:** X8A (Audit + Classification) → X8B or Lane 9  
**Date:** 2026-05-15  
**Status:** DECISION REQUIRED

---

## Summary

Lane 8 workspace/role auth migration cannot proceed without architectural design phase. Two patterns identified require separate decisions:

1. **Workspace Enforcement (~30-40 handlers):** Manual membership validation must be integrated into canonical wrapper
2. **Custom Role Resolution (~5-10 handlers):** Role-based auth requires separate design from capability-based auth

Both are architectural decisions, not route-level migrations.

---

## Decision Options

### Option A: X8B Design Phase (Then X8C Pilot)
**Scope:** Design workspace/role enforcement integration, then pilot migration

**Work:**
- Design workspace membership validation in withCanonicalEnforcement
- Design custom role resolution wrapper (separate from capabilities)
- Create wrapper/service contract specification
- Plan migration recipe
- Select 2-3 safe candidates for X8C pilot

**Timeline:** Design (2-3 days) + Pilot (1-2 days)

**Outcome:** 
- Clear workspace/role architecture
- Ready to migrate ~35-50 handlers
- Reduces design risk for future lanes

**Prerequisite:** None (can start immediately)

**Risk:** Higher initial time investment before migrations begin

---

### Option B: Skip to Lane 9 Contract Blocker Audit (RECOMMENDED)
**Scope:** Audit service/contract blockers, understand service-layer dependencies

**Work:**
- Scan for service-layer contract violations
- Identify which services need canonical-ready interfaces
- Map service-level auth patterns
- Determine service-level design needs

**Timeline:** Audit (2 days) + Classification (1 day)

**Outcome:**
- Service-layer clarity
- Can return to Lane 8 after service decisions
- Enables Lane 9 work to proceed
- Different problem scope (service vs. route)

**Prerequisite:** None

**Benefit:** Forward progress on different scope while Lane 8 design happens in parallel

---

### Option C: Consolidate Workspace/Policy/Role Design
**Scope:** Combined design for all auth integration patterns (Lanes 7, 8, role work)

**Work:**
- Unified auth architecture design (capabilities + policies + roles + workspaces)
- Design how all four dimensions integrate
- Single wrapper contract covering all patterns
- Migration recipe for consolidated approach

**Timeline:** Design (3-4 days)

**Outcome:**
- Cleaner, more cohesive architecture
- Single wrapper for all auth patterns
- Simpler migration path for remaining lanes
- More comprehensive upfront planning

**Risk:** Larger design scope, longer before first migration

---

## Recommendation: Option B (Lane 9 Audit)

**Rationale:**
1. Lane 8 and Lane 9 are independent audit scopes
2. Lane 9 audit provides clarity needed for design decisions later
3. Service-layer understanding informs Lane 8 design
4. Maintains forward momentum while allowing parallel design work
5. Two independent work streams (audit + design) can happen simultaneously

**Path:**
1. Immediately: Start Lane 9 Contract Blocker Audit
2. Parallel: Begin X8B workspace/role design thinking (async)
3. After Lane 9: Return to Lane 8 design with service context
4. Then: Execute X8C pilot migrations

---

## If Option A Selected (X8B Design Phase)

**Design Phase Deliverables:**
1. Workspace Membership Enforcement Design
   - How withCanonicalEnforcement validates membership
   - Service contract for membership validation
   - POST/PATCH handler migration pattern

2. Custom Role Resolution Design
   - Separate wrapper (withCanonicalRoleEnforcement) or integrated?
   - How role-based auth coexists with capability auth
   - Service contract for role resolution

3. Wrapper Contract Specification
   - CanonicalAuthContext for mutations
   - Error handling for workspace/role failures
   - Audit logging for enforcement decisions

4. Migration Recipe
   - Step-by-step pattern for workspace enforcement handlers
   - Step-by-step pattern for role resolution handlers
   - Validation checklist

**X8C Pilot Selection:**
- 2-3 lowest-risk workspace enforcement handlers
- 1 custom role handler (if design completed)
- Validate migration pattern before scaling

---

## Decision Checklist

**To Select Option A (X8B Design):**
- [ ] Prioritize Lane 8 over other work
- [ ] Allocate design resources
- [ ] Estimated start: Immediately
- [ ] Plan X8C pilot after design approval

**To Select Option B (Lane 9 Audit):**
- [ ] Accept forward progress on service scope
- [ ] Plan Lane 9 audit as next phase
- [ ] Schedule Lane 8 design for after Lane 9 clarity
- [ ] Assign parallel work for X8B thinking

**To Select Option C (Consolidated Design):**
- [ ] Pause Lane 8 and Lane 9 for unified planning
- [ ] Coordinate with Lane 7 policy context decisions
- [ ] Allocate design resources for larger scope
- [ ] Plan comprehensive architecture review

---

## Current Status

**Lane 8 Audit:** ✓ COMPLETE - 0 pilots, design required  
**Lane 9:** → NOT YET STARTED  
**Remaining Lanes:** 9 (contract blockers)

**Blocker Summary:**
- Workspace enforcement: Requires wrapper design
- Custom role resolution: Requires separate design
- Both: Architectural decisions, not route-level work

**Next Step:** Select decision option above and proceed accordingly

---

**Status:** DECISION REQUIRED - Select Option A, B, or C
