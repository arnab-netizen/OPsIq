# X9E-3: Next Pilot Priority Decision

**Date:** 2026-05-15  
**Status:** PILOT TYPE PRIORITIZATION COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Candidate Pilot Types Evaluation

### Candidate 1: RECOMMENDATIONS_ROUTE_CLEANUP

**Description:** Replace string "decision_create" with CAPABILITIES.DECISION_CREATE in recommendations route

**Security impact:** LOW - No authorization behavior change
- Still calls assertCapability with same semantics
- Entitlement tier mapping unchanged
- Quota enforcement unchanged

**Behavior-change risk:** LOW
- String → constant replacement only
- No business logic change
- Response shape unchanged
- Service behavior unchanged

**Scanner impact:** 1 violation reduction expected (if pattern recognized)
- Line 53: `assertCapability(workspaceId, "decision_create")` → `assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE)`

**Testability:** HIGH
- Existing tests will verify behavior
- No new tests required
- Governance-capabilities tests verify constant value

**Rollback simplicity:** HIGH
- Single string replacement
- Revert one line
- No service changes to undo

**Blast radius:** LOW
- Single route file modified
- No service changes
- No cascade effects

**Readiness:** READY NOW
- No blocking issues
- No governance clarification needed
- Similar pattern to X9E-2

**Verdict:** ✓ VIABLE - Safe, ready, low risk

---

### Candidate 2: REJECT_ROUTE_CAPABILITY_BUG_FIX

**Description:** Fix reject route using wrong capability string ("DECISION_ACCEPT" instead of "DECISION_REJECT")

**Security impact:** UNKNOWN - Depends on whether this is a bug or intentional

**Behavior-change risk:** HIGH
- If this is a bug, current behavior is wrong
- If this is intentional unified capability, "fix" would break existing behavior
- Authorization semantics would change

**Scanner impact:** 0 violations reduction
- String replacement doesn't affect scanner patterns
- withCanonicalEnforcement pattern still present

**Testability:** MEDIUM
- Requires understanding existing behavior
- Tests may depend on current (wrong?) behavior
- Fix would require updating tests

**Rollback simplicity:** MEDIUM
- Requires reverting capability check change
- May affect dependent code

**Blast radius:** MEDIUM-HIGH
- Affects reject decision operations
- Potentially affects accept decision (coupled routes)
- Service layer may depend on current behavior

**Readiness:** BLOCKED_PENDING_CLARIFICATION
- Must understand: Is this a bug or intentional unified capability?
- Requires governance decision before proceeding

**Verdict:** ✗ NOT VIABLE - Blocked on governance clarification

---

### Candidate 3: DECISION_SERVICE_AUTH_ENVELOPE_REFACTOR

**Description:** Refactor acceptDecision/rejectDecision services to use ServiceAuthEnvelope

**Security impact:** HIGH - Changes authorization enforcement location
- Moves auth from route to service level
- Requires carefully designed capability passing

**Behavior-change risk:** HIGH
- Service signature changes
- Auth envelope construction needed
- Entitlement-to-domain capability mapping in service

**Scanner impact:** 0 violations reduction
- Service refactoring doesn't reduce violations
- Route-level withAuth still present

**Testability:** MEDIUM
- Requires service-level auth tests
- Integration tests needed
- Complex verification

**Rollback simplicity:** LOW
- Service refactoring requires coordinated changes
- Multiple files involved

**Blast radius:** HIGH
- Affects all callers of acceptDecision/rejectDecision
- Affects both accept and reject routes
- Affects any other service-level callers

**Readiness:** BLOCKED_ON_ROUTE_REFACTORING
- Routes must be cleaned up first
- Reject route bug must be clarified first
- Accept/reject coupling must be understood first

**Verdict:** ✗ NOT VIABLE - Blocked on route cleanup and governance clarification

---

### Candidate 4: CLOSE_ROUTE_DECISION_UPDATE_ENHANCEMENT

**Description:** Add DECISION_UPDATE capability check to decision close operation

**Security impact:** MEDIUM - Adds new capability enforcement

**Behavior-change risk:** MEDIUM-HIGH
- Currently no capability check on close
- Adding check may fail for existing close operations
- Requires audit of who calls close and what capabilities they have

**Scanner impact:** 0 violations reduction
- Adding capability check doesn't reduce violations
- withEnforcementFull still present

**Testability:** LOW
- Unclear what capability close should require
- Requires test-driven design to define expected behavior
- No existing close capability tests

**Rollback simplicity:** MEDIUM
- Can remove capability check if needed
- But requires updating dependent code first

**Blast radius:** MEDIUM
- Affects all decision close operations
- May break existing workflows if users lack DECISION_UPDATE

**Readiness:** BLOCKED_PENDING_GOVERNANCE_DESIGN
- Must clarify: What capability should close require?
- Must design tests that define expected behavior
- Must audit impact on existing workflows

**Verdict:** ✗ NOT VIABLE - Blocked on governance design

---

## Prioritization Summary Table

| Candidate | Security Impact | Behavior Risk | Scanner Impact | Testability | Rollback | Readiness | Verdict |
|-----------|-----------------|---------------|----------------|-------------|----------|-----------|---------|
| Recommendations cleanup | LOW | LOW | 1 reduction | HIGH | HIGH | READY | ✓ VIABLE |
| Reject route bug fix | UNKNOWN | HIGH | 0 | MEDIUM | MEDIUM | BLOCKED | ✗ NOT VIABLE |
| Service refactor | HIGH | HIGH | 0 | MEDIUM | LOW | BLOCKED | ✗ NOT VIABLE |
| Close enhancement | MEDIUM | MEDIUM-HIGH | 0 | LOW | MEDIUM | BLOCKED | ✗ NOT VIABLE |

---

## Decision Rule Application

**Rule:** "If recommendations cleanup is behavior-preserving, it may be selected before service refactor."

**Application:** Recommendations cleanup IS behavior-preserving (string → constant, no logic changes)

**Result:** ✓ RECOMMENDATIONS_ROUTE_CLEANUP selected as next pilot

---

## Recommended Next Pilot

**Type:** RECOMMENDATIONS_ROUTE_CLEANUP

**Rationale:**
- Only fully ready candidate
- Lowest risk (behavior-preserving string replacement)
- Similar pattern to X9E-2 (proven approach)
- Clear expected outcome
- No blocking issues
- Enables foundation for future service refactoring

**Implementation scope:** Single file (recommendations route), 1-2 string replacements

**Expected outcome:** Type-safe constant usage, 1 violation reduction

**Risk level:** LOW

---

## Blocked Candidates and Why

1. **Reject route bug fix**: Requires governance clarification on whether unified accept/reject capability is intentional

2. **Service refactoring**: Blocked on route cleanup completion and reject bug clarification

3. **Close route enhancement**: Blocked on governance design for close operation capability requirements

---

## Conclusion

**Next pilot priority:** RECOMMENDATIONS_ROUTE_CLEANUP

**Status:** Ready for selection and implementation in next phase
