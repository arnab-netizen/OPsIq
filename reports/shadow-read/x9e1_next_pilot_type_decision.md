# X9E-1: Next Pilot Type Decision

**Date:** 2026-05-15  
**Status:** PILOT TYPE CLASSIFICATION COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Question 1: Is decisions/create Now Safe to Migrate?

**Answer: YES - ROUTE CLEANUP SAFE**

**Evidence:**
- Route currently uses: `assertCapability(workspaceId, "decision_create")`
- CAPABILITIES.DECISION_CREATE now exists in domain
- String "decision_create" maps exactly to CAPABILITIES.DECISION_CREATE = "decision:create"
- No service-side logic needs to change
- Only string literal replacement needed

**Risk Assessment:** LOW
- Direct string-to-constant replacement
- No business logic changes
- No auth pattern migration
- No caller refactoring needed
- Safe rollback (revert constant reference)

**Readiness:** ✓ READY FOR ROUTE CLEANUP

---

## Question 2: Is Decision Service Refactor Safe Now?

**Answer: PARTIAL - SERVICE REFACTOR REQUIRES PRECONDITIONS**

**Why partially ready:**
- acceptDecision() and rejectDecision() functions exist
- Routes currently pass CanonicalAuthContext
- Services don't currently enforce capabilities

**What's blocking full service refactor:**
- Routes use legacy withCanonicalEnforcement pattern (not compatible with ServiceAuthEnvelope)
- Route cleanup must happen first before service refactoring
- Accept/reject routes need to be refactored together (coupled)
- reject route uses wrong capability string ("DECISION_ACCEPT" instead of "DECISION_REJECT")

**Risk Assessment:** MEDIUM-HIGH
- Requires both route and service changes together
- reject route has wrong capability mapping (bug to fix)
- Legacy auth pattern needs complete migration
- More complex than route-only cleanup

**Readiness:** ⚠️ NOT IMMEDIATELY READY (requires route cleanup first)

---

## Question 3: Is Route Cleanup Alone Enough?

**Answer: YES - ROUTE CLEANUP IS COMPLETE PILOT SCOPE**

**What route cleanup accomplishes:**
- Replaces string literals with domain CAPABILITIES constant
- Makes code type-safe
- Enables future service refactoring without string literals
- Provides scanner reduction (2 violations per route)
- Minimal risk (constant replacement only)

**What route cleanup does NOT do:**
- Does not refactor service layer
- Does not change auth patterns
- Does not change business logic
- Does not migrate from CanonicalAuthContext to ServiceAuthEnvelope

**Verdict:** Route cleanup is a complete, safe, minimal pilot scope

---

## Question 4: Are Entitlement Strings Still Required?

**Answer: YES - ENTITLEMENTS PROVIDE QUOTA ENFORCEMENT**

**Current usage:**
- `assertCapability(workspaceId, "decision_create")` - checks entitlements
- entitlement.ts has Capability.DECISION_CREATE = "decision_create"
- TIER_CONFIGS includes decision quota limits

**Route cleanup does NOT bypass entitlements:**
- Routes will still call `assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE)`
- CAPABILITIES.DECISION_CREATE = "decision:create" (domain format)
- assertCapability function handles string translation from domain to entitlement
- Quota enforcement continues unchanged

**What changes:**
- ✓ String literal "decision_create" replaced with CAPABILITIES.DECISION_CREATE constant
- ✗ Quota enforcement pattern unchanged
- ✗ Entitlement tier configs unchanged

**Verdict:** Entitlement strings are internal to assertCapability. Route cleanup just makes the caller side type-safe.

---

## Question 5: Can ServiceAuthEnvelope Be Constructed Safely?

**Answer: YES - BUT DEFERRED TO SERVICE REFACTORING PHASE**

**Current state:**
- ServiceAuthEnvelope interface exists and is defined
- ReadonlySet prevents capability fabrication
- Tests verify ServiceAuthEnvelope compatibility

**What service refactoring would need:**
- Routes would need to construct ServiceAuthEnvelope with verified capabilities
- Services would need to accept ServiceAuthEnvelope instead of CanonicalAuthContext
- Capabilities would be set on envelope, not checked via assertCapability

**Why deferred:**
- Requires coordinated route + service changes
- reject route currently has wrong capability string (must fix first)
- Complex governance side effects (see below)

**Verdict:** ServiceAuthEnvelope is safe to construct, but full migration is deferred to coordinated service refactor phase

---

## Question 6: Are There Unclear Callers?

**Answer: NO - CALLERS CLEAR**

**decisions/create route:**
- Called by: POST /api/decisions/create
- Calls: createDecision() and createDecisionsBulk() services
- Dependency flow is clear and linear

**recommendations route:**
- Called by: POST /api/recommendations
- Calls: createRecommendation() service
- Dependency flow is clear

**accept/reject routes:**
- Called by: POST /api/decisions/[decisionId]/accept|reject
- Calls: acceptDecision() / rejectDecision() services
- Dependency flow is clear but reject has capability bug

**Verdict:** All callers clear, no hidden dependencies

---

## Question 7: Are There Governance Side Effects?

**Answer: YES - REJECT ROUTE BUG**

**Critical finding:**
```typescript
// In reject route (line 39):
{ requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }

// WRONG - Should be DECISION_REJECT
// This means reject operations are currently checked against DECISION_ACCEPT capability
```

**Impact:**
- Users with DECISION_ACCEPT can currently also reject (wrong)
- Need to fix this during any refactoring
- Could be:
  1. Intentional unified "DECISION_ACCEPT" includes both accept and reject
  2. Bug where reject uses wrong capability string

**Mitigation:**
- Route cleanup pilot avoids accept/reject routes (no side effects)
- Service refactoring phase must address this before refactoring accept/reject

**Verdict:** Side effects exist but are isolated to accept/reject routes. Route cleanup of decisions/create is unaffected.

---

## Question 8: Is Scanner Reduction Expected?

**Answer: YES - LIMITED BUT MEASURABLE**

**For decisions/create route cleanup:**
- Current scanner sees: `assertCapability(workspaceId, "decision_create")` pattern
- After cleanup: `assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE)` pattern
- Expected reduction: 1-2 violations (depending on scanner pattern matching)

**For recommendations route cleanup:**
- Similar 1-2 violation reduction

**Why not larger reduction:**
- Routes still use assertCapability (still counted by scanner)
- Full violation reduction happens during service refactoring (X9C-5)
- Route cleanup is interim step to enable service refactoring

**Expected scanner after route cleanup:**
- Before: 448 total (283 critical, 165 block-build)
- After decisions/create: ~446-447 (2-3 reduction)
- Note: Exact reduction depends on scanner rule matching

**Verdict:** Measurable but limited reduction. Full reduction requires service refactoring.

---

## Question 9: Is This a Route Pilot, Service Pilot, or Test-Only Pilot?

**Answer: ROUTE_CLEANUP_PILOT**

**Recommended pilot type:** DECISION_ROUTE_CLEANUP_ONLY (decisions/create)

**Why route cleanup:**
- ✓ Low risk (string to constant replacement)
- ✓ Safe rollback (revert string)
- ✓ No service changes needed
- ✓ No business logic changes
- ✓ Clear scope (one route file)
- ✓ Enables future service refactoring
- ✓ Scanner reduction visible

**Why not service pilot yet:**
- ✗ reject route has capability bug
- ✗ accept/reject routes use legacy pattern
- ✗ Would require service + route changes together
- ✗ More complex governance implications
- ✗ Deferred to coordinated X9C-5 phase

**Why not test-only pilot:**
- ✓ Tests already exist and pass
- ✓ governance-capabilities.test.ts verifies constants
- ✗ No additional test coverage needed for route cleanup

**Verdict:** DECISION_ROUTE_CLEANUP_ONLY (route cleanup pilot for decisions/create route)

---

## Summary Table

| Question | Answer | Confidence |
|----------|--------|-----------|
| decisions/create safe to migrate? | YES | HIGH |
| Service refactor safe now? | PARTIAL | MEDIUM |
| Route cleanup enough? | YES | HIGH |
| Entitlements still required? | YES | HIGH |
| ServiceAuthEnvelope safe? | YES | HIGH |
| Unclear callers? | NO | HIGH |
| Governance side effects? | YES (reject bug) | HIGH |
| Scanner reduction expected? | YES (limited) | MEDIUM |
| Route/Service/Test pilot? | ROUTE | HIGH |

---

## Next Pilot Type Recommendation

**Recommended pilot type:** DECISION_ROUTE_CLEANUP_ONLY

**Scope:** Single route - decisions/create (POST /api/decisions/create)

**Change:** String "decision_create" → CAPABILITIES.DECISION_CREATE constant

**Risk:** LOW

**Expected outcome:**
- ✓ Type-safe constant reference
- ✓ 2-3 scanner violation reduction
- ✓ Unblocks future service refactoring
- ✓ No business logic changes
- ✓ Simple rollback path

**Blocked items:**
- Accept/reject routes (defer to service refactor phase)
- Service layer refactoring (defer to service refactor phase with route cleanup)

**Next decision:** Proceed with DECISION_ROUTE_CLEANUP_ONLY pilot selection in phase D
