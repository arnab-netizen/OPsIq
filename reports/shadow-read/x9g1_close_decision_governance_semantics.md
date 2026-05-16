# X9G-1: closeDecision Governance Semantics Analysis

**Date:** 2026-05-16  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Focus:** Understanding closeDecision semantics and capability requirements

---

## What Does closeDecision Do?

### Business Operation
closeDecision is a **terminal state transition** that moves a decision from `OUTCOME_RECORDED` to `CLOSED`.

**Operation Details:**
- Input: decisionId, workspaceId, actorId
- Precondition: Decision must be in OUTCOME_RECORDED state
- Action: Update decision status to CLOSED
- Side effects:
  - Set completedAt timestamp
  - Set executionStatus to "completed"
  - Emit audit event (DECISION_CLOSED or equivalent)
  - Record lastUpdatedBy
- Output: { id, status }
- Terminal: YES (CLOSED is a terminal state, decision cannot be mutated after)

### State Machine Context
```
DRAFT → SUBMITTED → APPROVED → EXECUTED → OUTCOME_RECORDED → CLOSED (TERMINAL)
                                                             ↓
                                                          REJECTED (TERMINAL)
                                                          FAILED (TERMINAL)
```

The close operation is one of three terminal transitions:
1. OUTCOME_RECORDED → CLOSED (normal completion)
2. OUTCOME_RECORDED → FAILED (failure path, requires reason)
3. SUBMITTED/APPROVED/EXECUTED → REJECTED (rejection path, requires reason)

---

## Is closeDecision Equivalent to DECISION_UPDATE?

**Analysis:**

### DECISION_UPDATE Capability Semantics
The existing DECISION_UPDATE capability appears to be for mid-lifecycle updates:
- Create → DRAFT (DECISION_CREATE)
- Update fields → DRAFT (DECISION_UPDATE implied)
- Approve → APPROVED (likely DECISION_ACCEPT or internal)
- Reject → REJECTED (DECISION_REJECT)

### closeDecision Semantics
closeDecision is a **specific state transition**, not a general "update":
- Only valid from OUTCOME_RECORDED state
- Results in terminal state
- Cannot be reversed or updated after

### Comparison
| Aspect | DECISION_UPDATE | closeDecision |
|--------|---|---|
| Scope | General field updates | Specific state transition |
| Precondition | Flexible (implied) | Strict (must be OUTCOME_RECORDED) |
| Result | Non-terminal state | Terminal state |
| Reversibility | Implied updatable | Final (no mutation after) |
| Semantics | "Modify" | "Complete/Archive" |

**Conclusion:** closeDecision is **NOT equivalent to DECISION_UPDATE** because:
1. It's a specific, constrained operation (not general update)
2. It results in a terminal state (cannot be undone)
3. It has strict precondition (OUTCOME_RECORDED only)
4. It represents semantic "completion" not "modification"

---

## Should closeDecision Use DECISION_UPDATE, DECISION_CLOSE, or Another Capability?

### Option Analysis

#### Option 1: Use DECISION_UPDATE for closeDecision
**Mechanics:**
- Update existing DECISION_UPDATE capability to include close operation
- Route checks DECISION_UPDATE capability to close

**Pros:**
- No new capability constant needed
- Aligns close with other update operations
- Simpler permission model (fewer capabilities)

**Cons:**
- Conflates "modify" and "complete" semantics
- Not least-privilege (DECISION_UPDATE probably includes field edits, close doesn't)
- Doesn't distinguish close from other updates in audit trail
- Future governance design may need to separate them anyway

**Least Privilege Risk:** MEDIUM (if DECISION_UPDATE is broader than close needs)

---

#### Option 2: Add New DECISION_CLOSE Capability
**Mechanics:**
- Add DECISION_CLOSE: "decision:close" to CAPABILITIES
- Route checks DECISION_CLOSE capability to close
- Audit events emitted with DECISION_CLOSE context

**Pros:**
- Least-privilege (close gets its own permission)
- Clear semantic separation (close is not update)
- Matches pattern of other decision operations (create, accept, reject)
- Future role design can assign close permission distinctly
- Audit trail clearly shows close operations

**Cons:**
- Adds new capability constant
- New entitlement mapping needed
- Requires governance decision on who should have close permission
- One more permission to reason about

**Least Privilege Risk:** LOW (explicit, bounded scope)

---

#### Option 3: Keep Legacy Role/Permission Until Workspace/Role Design
**Mechanics:**
- Leave close route using hasPermission(role, "close_decision")
- Defer modernization to when workspace/role design is complete

**Pros:**
- No governance decision needed now
- No capability changes needed
- No entitlement mapping needed
- Defers architectural decision to when workspace design is known

**Cons:**
- Close route stays on legacy auth pattern (scanner violations remain)
- Inconsistent with create/accept/reject (which use domain capabilities)
- Decision still open when closeDecision is implemented in governance refactor
- Not least-privilege (depends on unmodeled workspace/role design)

**Least Privilege Risk:** HIGH (depends on future design choices)

---

#### Option 4: Require Internal Access / Owner-Only for closeDecision
**Mechanics:**
- Check if actorId is owner or has internal role
- Or: check workspace membership level (requires workspace role design)
- Close only allowed for owner or senior roles

**Pros:**
- Clear semantic: close is privileged operation (final state)
- Simpler permission model (role-based, not capability-based)
- Aligns with "end engagement" semantics if close means wrap up

**Cons:**
- Requires workspace/role design to be clear (which it isn't yet)
- Not least-privilege if close permission is broader than "owner"
- Doesn't fit pattern of other decision operations
- Hard to test without workspace role definitions

**Least Privilege Risk:** HIGH (depends on workspace/role design)

---

## Does DECISION_CLOSE Already Exist?

**Answer:** NO

**Evidence:**
- CAPABILITIES.ts defines: DECISION_CREATE, DECISION_UPDATE, DECISION_ACCEPT, DECISION_REJECT
- No DECISION_CLOSE constant
- No DECISION_CLOSE in any entitlement mappings
- No DECISION_CLOSE in existing role definitions

**Implication:** If DECISION_CLOSE is needed, it must be added.

---

## Is Adding DECISION_CLOSE Justified by Current Code?

**Analysis:**

### Current Usage Pattern
- DECISION_CREATE: Required to create decisions ✓
- DECISION_UPDATE: Implied for mid-lifecycle updates ✓
- DECISION_ACCEPT: Required to accept decisions ✓
- DECISION_REJECT: Required to reject decisions ✓
- DECISION_CLOSE: ???

### Justification for DECISION_CLOSE
1. **Consistency:** Other decision operations (create, accept, reject) have own capabilities → close should too
2. **Semantics:** Close is a specific operation with strict precondition and terminal result → deserves own capability
3. **Least Privilege:** Close access may differ from update access → should be separate
4. **Audit Trail:** Close should be clearly marked in audit events → own capability makes this clear
5. **Future Role Design:** Workspace design will need to assign close permissions distinctly → capability foundation needed

**Conclusion:** YES, adding DECISION_CLOSE is justified because:
- It mirrors existing decision operation pattern
- It enables future workspace/role design
- It supports least-privilege model
- It creates clear audit trail
- Current code structure (route using legacy pattern) suggests capability is missing

---

## Does Close Materially Change Business State?

**Answer:** YES, TERMINAL state change

**Business State Changes:**
1. **Decision Lifecycle:** OUTCOME_RECORDED → CLOSED (terminal)
2. **Timestamps:** completedAt set to now
3. **Execution Status:** marked as "completed"
4. **Mutability:** Decision becomes read-only (terminal state)

**Materiality Assessment:**
- **Level:** HIGH (terminal state change is the most material change possible)
- **Reversibility:** None (terminal state)
- **Audit Sensitivity:** HIGH (should be clearly audited)
- **Authorization Sensitivity:** HIGH (should be carefully controlled)

---

## Does Close Require Stronger Permission Than Update?

**Analysis:**

### Comparison
| Operation | State Change | Terminal | Reversible | Risk |
|---|---|---|---|---|
| UPDATE | Non-terminal state | NO | YES | Medium |
| CLOSE | Terminal state | YES | NO | High |

**Conclusion:** YES, close should require stronger or different permission because:
1. Close produces terminal state (irreversible)
2. Update produces non-terminal state (reversible)
3. Close is point-of-no-return operation
4. Update is routine modification

**Permission Model:** Close should either:
- Require higher role level than update
- Require different/separate capability (DECISION_CLOSE)
- Require owner or senior role
- Require additional approval

---

## Does Close Require Audit/Event Distinction?

**Answer:** YES

**Reasoning:**
1. Close is terminal operation (should be clearly marked)
2. Close is distinct from other state transitions (should have own event type)
3. Audit trail should show close vs update vs other transitions
4. Future role design will need to correlate close events with permissions
5. Business intelligence may need to query "when were decisions closed"

**Current Implementation:** Audit event via getAuditEventName(OUTCOME_RECORDED, CLOSED)
- Likely generates distinct event (good)
- But depends on event naming strategy (should verify)

---

## Is This Route-Only Cleanup, Service Refactor, Capability Addition, or Multiple Steps?

**Answer:** MULTIPLE STEPS - Requires both route update AND governance decision

### Decomposition

#### Step 1: Governance Decision (THIS PHASE - X9G-1)
- Decide: DECISION_UPDATE vs DECISION_CLOSE vs legacy vs owner-only
- Required BEFORE implementation

#### Step 2: Route Governance Update (Next Phase - X9G-2)
- Update close route auth requirement based on decision
- Migrate from legacy withAuth() to capability-based check (if DECISION_CLOSE chosen)
- May include verified input pattern adoption

#### Step 3: Service Refactor (Conditional)
- If verified input pattern adopted: refactor closeDecision signature (like X9F-4, X9F-6)
- If service refactor needed: it's separate from route governance

#### Step 4: Capability Addition (If Option 2 Selected)
- Add DECISION_CLOSE to CAPABILITIES
- Create entitlement mapping
- Define who has close permission

### Timeline
1. X9G-1: Governance design (THIS)
2. X9G-2: Route/governance update (NEXT)
3. Potential X9G-3: Service refactor (CONDITIONAL)
4. X9G-4: Entitlement mapping (IF DECISION_CLOSE)

---

## Governance Conclusion

### Summary
closeDecision is a **terminal state operation** that is **materially different** from DECISION_UPDATE. It requires:
1. Clear permission/capability model (not yet defined)
2. Governance decision on authorization level
3. Potential new capability (DECISION_CLOSE)
4. Route modernization to use domain capabilities (instead of legacy role/permission)
5. Possible service refactor to use verified input pattern

### Key Finding
The close route is **blocked on governance** not by technical limitations, but by:
- Lack of workspace/role design clarity (why legacy pattern exists)
- Unresolved question of whether close needs own capability
- Missing DECISION_CLOSE in domain model

### Recommendation
Before implementing close route modernization, governance must decide:
1. **Option A:** Use DECISION_UPDATE for close
2. **Option B:** Add DECISION_CLOSE capability
3. **Option C:** Keep legacy pattern until workspace design complete
4. **Option D:** Require owner/internal access only
5. **Option E:** Split into route design first, service refactor later

---

## Next Step
Proceed to Phase D: Evaluate detailed design options with cost/benefit analysis.
