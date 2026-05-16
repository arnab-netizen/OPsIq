# X9G-1: closeDecision Governance Design Decision

**Date:** 2026-05-16  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Decision Status:** ✓ SELECTED

---

## Selected Design

**Design:** ADD_DECISION_CLOSE

**Formal Selection:** Add new DECISION_CLOSE capability to governance model.

---

## Rationale

### Primary Reasons for Option B

1. **Consistency with Existing Pattern**
   - create → DECISION_CREATE
   - accept → DECISION_ACCEPT
   - reject → DECISION_REJECT
   - close → DECISION_CLOSE (complete pattern)
   - Pattern is established and understood

2. **Least-Privilege Alignment**
   - Close is a specific operation with strict preconditions
   - Terminal state transition is materially different from general updates
   - Close should not require UPDATE permission (overly broad)
   - Close should have explicit, bounded permission scope

3. **Semantic Clarity**
   - DECISION_CLOSE clearly expresses "close/complete" semantics
   - Distinct from DECISION_UPDATE (which implies modify/edit)
   - Audit trail will show close operations distinctly
   - Governance can control close permissions independently

4. **Future-Proof Design**
   - Workspace role design will need to assign close permissions distinctly
   - Creating capability now provides foundation for role design
   - Avoids rework later
   - Enables progressive governance implementation

5. **Architecture Debt Reduction**
   - Current close route has legacy auth pattern (scanner violations)
   - Moving to capability-based auth improves architecture
   - Aligns close with other decision operations
   - Reduces inconsistency

6. **Implementation Feasibility**
   - Low implementation complexity (add constant, add check)
   - Clear rollback path
   - No service changes required
   - Testable immediately

### Why Not Other Options

#### Option A (DECISION_UPDATE) - Rejected
- **Reason:** Semantic conflation
- Close is not a form of update; it's a terminal state transition
- UPDATE typically means "modify existing data"
- Close means "mark as complete and make immutable"
- Violates principle of least-privilege

#### Option C (Keep Legacy) - Rejected
- **Reason:** Architectural inconsistency
- Create/accept/reject use domain capabilities
- Close uses legacy role/permission
- Increases technical debt
- Makes it harder to implement workspace role design

#### Option D (Owner-Only) - Rejected
- **Reason:** Premature role design
- Requires workspace role design to be complete (it's not)
- May be overly restrictive
- Doesn't align with pattern of other operations
- Should defer to workspace governance phase

#### Option E (Phased) - Considered but Not Selected
- **Reason:** Option B is implementable immediately
- No reason to split if governance can decide now
- Phased approach adds overhead without benefit
- Option B is simple enough for single implementation

---

## Capability Model Decision

### New Capability Addition

**Capability:** DECISION_CLOSE  
**Format:** "decision:close"  
**Pattern:** Follows existing decision capability pattern

### Capability Details

```typescript
// Addition to src/domain/constants/capabilities.ts
DECISION_CLOSE: "decision:close",
```

### When Granted
- Required to close decisions via POST /api/decisions/[decisionId]/close
- Governs transition from OUTCOME_RECORDED to CLOSED state
- Should be restricted to:
  - Decision creators (owner)
  - Team leads/managers
  - Operators with decision management role
  - (Exact role mapping deferred to workspace design)

### Semantic Meaning
- "User can close decisions and transition them to terminal state"
- "User can mark decisions as complete/archived"
- "User has permission to finalize decision records"

---

## Route Implementation Required

### closeDecision Route Changes

**File:** src/app/api/decisions/[decisionId]/close/route.ts

**Changes Required:**
1. Add capability check: `requireCapabilities: ["DECISION_CLOSE"]`
2. Update wrapper from legacy withAuth() to capability-based pattern
3. Migrate from role/permission string to domain capability

**Migration Strategy:**
- Phase 1 (X9G-2): Add DECISION_CLOSE capability check
- Phase 2 (Optional X9G-3): Refactor to verified input pattern

---

## Service Refactor Decision

### closeDecision Service - No Changes Required at This Time

**Service:** src/services/decisions/decision-lifecycle.service.ts::closeDecision

**Decision:** Service logic remains unchanged

**Rationale:**
- Service logic is correct (simple state transition, no auth checking)
- Service refactor to verified input pattern can be done later if desired
- Not blocking on service changes
- Can be deferred to X9G-3 (optional)

**Future Option:** Service refactor (if desired) would follow X9F-4/X9F-6 pattern:
- Add VerifiedClosureInput interface
- Update signature to accept VerifiedClosureInput
- Update route caller to construct verified input
- No behavior change (same as acceptDecision, rejectDecision)

---

## Entitlement Mapping Required

### Who Gets DECISION_CLOSE Permission

**Decision:** Deferred to workspace role design phase

**Recommendation:**
- Close permission should be restricted
- Suggest: owner + senior roles (manager, lead)
- Should not be everyone who has DECISION_UPDATE
- Should be deliberately assigned

**Governance Question for Later:**
- What roles in workspace design should have close permission?
- Is close a "team lead" operation or broader?
- Should close be separate from other decision permissions?
- (Workspace design phase will answer these)

---

## Scanner Impact

**Before X9G-2 Implementation:**
- Close route violations: 4 (auth-guard import, 2 withAuth calls, etc.)
- Total violations: 448

**After X9G-2 Implementation:**
- Close route migrations to capability-based auth
- Legacy auth imports may still be present (if not fully cleaned up)
- Expected: Same 448 violations (no new ones)
- Migration complexity depends on refactor depth

**Scanner Expectation:** 0 new violations from governance design

---

## Next Phase Specification

### Phase Name
**X9G-2** (closeDecision route governance implementation)

### Implementation Authorized
**YES** - X9G-1 (governance design) unblocks X9G-2 implementation

### Files Allowed
- src/app/api/decisions/[decisionId]/close/route.ts (add capability check)
- src/domain/constants/capabilities.ts (add DECISION_CLOSE if needed)
- reports/ (implementation reports)

### Files Forbidden
- Decision services (no service refactor unless explicitly phased)
- Other routes
- Wrappers
- Auth context services

### Route Changes Allowed
- Add DECISION_CLOSE capability check
- Migrate auth pattern (legacy → capability-based)
- Optionally: refactor to verified input pattern (if phased with service refactor)

### Maximum Scope
- Route governance update only
- Capability constant addition
- No service changes (unless bundled service refactor)
- No new capabilities besides DECISION_CLOSE
- No wrapper changes
- No auth context changes

### Validation Commands
After X9G-2:
- npm run build (0 TypeScript errors expected)
- npm test -- governance-capabilities (verify DECISION_CLOSE exists)
- npm test -- policy-wrapper-enforcement (verify enforcement patterns)
- npm test -- phase-d phase-e phase-f (verify close flow works)
- npx tsx src/governance/auth-shadow-read-scanner.ts (expect 448 violations)

### Rollback Rule
If X9G-2 fails validation:
- Revert route capability check
- Revert DECISION_CLOSE constant (if added)
- No service impact (service unchanged)
- Rollback is simple and safe

### Stop Conditions
- If build fails → stop and revert
- If governance tests fail → stop and investigate
- If scanner shows new violations → stop and investigate
- If close flow breaks → stop and investigate

---

## Risk Assessment

**Overall Risk:** LOW

**Primary Risks:**
1. **Entitlement not defined yet** → Mitigation: Document that entitlement mapping is deferred to workspace design
2. **Phased implementation required** → Mitigation: X9G-2 is simple route update, service refactor is optional X9G-3

**Mitigations:**
- Route change is isolated, easy to test
- Service is unchanged, no risk there
- Capability constant is explicit
- Rollback is straightforward

---

## Future Service Refactor (Optional X9G-3)

If desired later, closeDecision can be refactored to use verified input pattern:

1. Add VerifiedClosureInput interface
2. Update closeDecision(decisionId, workspaceId, actorId) to closeDecision(input: VerifiedClosureInput)
3. Update route caller to construct VerifiedClosureInput
4. Follow same pattern as X9F-4 (acceptDecision), X9F-6 (rejectDecision)
5. Would be clean refactor with no risk (same as other decision services)

**Decision:** X9G-3 is optional and can be deferred indefinitely if not needed.

---

## Governance Sign-Off

### Decision Finalized
**✓ ADD_DECISION_CLOSE**

### Implementation Path
**X9G-2:** Route governance update (add capability check)  
**X9G-3 (Optional):** Service refactor (verified input pattern)

### Capability Addition
**✓ DECISION_CLOSE: "decision:close"** approved for addition to domain model

### Entitlement Mapping
**Deferred** to workspace role design phase (will be resolved in future governance work)

### Next Steps
1. X9G-2: Implement route governance change (add DECISION_CLOSE check)
2. Validate with governance tests
3. X9G-3 (optional): Service refactor if desired
4. Workspace design: Define role assignments for DECISION_CLOSE

---

## Summary

**Design Decision:** ADD_DECISION_CLOSE (Option B)

**Rationale:** Follows existing pattern, enables least-privilege, provides semantic clarity, reduces architectural debt, future-proof

**Implementation:** X9G-2 (route governance change)

**Risk:** LOW

**Blocking Issues:** NONE - ready to proceed to X9G-2

**Next Phase:** X9G-2 (closeDecision route implementation)

---

## Appendix: Decision Justification

Why Option B (ADD_DECISION_CLOSE) is the best governance design for closeDecision:

1. **Consistency:** Matches create/accept/reject pattern ✓
2. **Least Privilege:** Close gets explicit, bounded permission ✓
3. **Semantics:** Clear "close/complete" meaning ✓
4. **Architecture:** Reduces technical debt ✓
5. **Future-Proof:** Supports workspace design ✓
6. **Feasible:** Low complexity, high confidence ✓
7. **Testable:** Can validate immediately ✓
8. **Rollback:** Safe and straightforward ✓

All criteria point to Option B as the optimal choice.
