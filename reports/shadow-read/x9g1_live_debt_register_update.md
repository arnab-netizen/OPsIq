# X9G-1: Live Debt Register Update

**Date:** 2026-05-16  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Phase:** X9G-1 (Governance Design)

---

## Live Debt Items Status

### Debt Item 1: createDecision Dual-Format Support

**Status:** ✓ REMOVED (X9F-8 completed)

#### History
- **Created:** X9F-2 (dual-format added)
- **Removed:** X9F-8 (X9F-6 final)
- **Current:** CLOSED

#### Summary
The dual-format support debt for createDecision has been successfully removed. All production callers use VerifiedDecisionInput exclusively. The old CreateDecisionInput interface and runtime format detection have been eliminated. This debt is no longer tracked.

**Status:** ✓ CLOSED - No longer live

---

### Debt Item 2: acceptDecision Verified Input Refactor

**Status:** ✓ COMPLETED (X9F-4 completed)

#### Details
- **Refactored:** X9F-4 (acceptDecision modernized)
- **Pattern:** Single VerifiedAcceptanceInput format
- **Service:** Updated to accept verified input only
- **Route:** Updated to construct verified input
- **Status:** Modernized and stable

**Status:** ✓ CLOSED - Completed

---

### Debt Item 3: rejectDecision Verified Input Refactor

**Status:** ✓ COMPLETED (X9F-6 completed)

#### Details
- **Refactored:** X9F-6 (rejectDecision modernized)
- **Pattern:** Single VerifiedRejectionInput format
- **Service:** Updated to accept verified input only
- **Route:** Updated to construct verified input
- **Status:** Modernized and stable

**Status:** ✓ CLOSED - Completed

---

### Debt Item 4: closeDecision Governance Gap

**Status:** ⏳ DESIGN COMPLETE, IMPLEMENTATION PENDING

#### Current State
- **Identified:** X9F-5 (during rejectDecision selection)
- **Analysis:** X9G-1 (governance design phase - THIS)
- **Design Decision:** ADD_DECISION_CLOSE (Option B selected)
- **Implementation:** X9G-2 (scheduled next)

#### What Was the Gap?
- Close route used legacy auth pattern (hasPermission with role string)
- No domain capability for closing decisions
- Governance model for close operation was unresolved
- Create/accept/reject use domain capabilities, but close did not

#### Governance Design Selected
- **Capability:** Add DECISION_CLOSE: "decision:close"
- **Pattern:** Follows create/accept/reject pattern
- **Least Privilege:** Yes - explicit, bounded scope
- **Future-Proof:** Yes - supports workspace role design
- **Scanner Impact:** No new violations expected

#### Implementation Plan
- **X9G-2:** Route governance update (add DECISION_CLOSE check)
- **X9G-3 (Optional):** Service refactor to verified input pattern
- **Entitlement Mapping:** Deferred to workspace design phase

#### Live-Blocking Status
**Currently:** NOT blocking (governance design is clear)

**Blocking Conditions Before X9G-2:**
- None identified (implementation can proceed)

**Blocking Conditions Before Service Refactor:**
- Workspace role design (if role-based close permission desired)
- But route governance update doesn't require workspace design

**Status:** ⏳ DESIGN COMPLETE - Ready for X9G-2 implementation

---

## Complete Debt Summary

| Debt Item | Status | Completed | Next |
|---|---|---|---|
| createDecision dual-format | ✓ REMOVED | X9F-8 | N/A |
| acceptDecision verified | ✓ COMPLETED | X9F-4 | Stable |
| rejectDecision verified | ✓ COMPLETED | X9F-6 | Stable |
| closeDecision governance | ⏳ DESIGNED | X9G-1 | X9G-2 |

---

## Current Architecture Status

### Decision Service Governance

| Service | Status | Pattern | Verified Input |
|---|---|---|---|
| createDecision | ✓ Modern | Verified-only | YES |
| acceptDecision | ✓ Modern | Verified-only | YES |
| rejectDecision | ✓ Modern | Verified-only | YES |
| closeDecision | 🔄 In Progress | Governance designed | TBD (X9G-3 optional) |

### Overall Assessment
- 3 of 4 decision services modernized ✓
- 1 of 4 pending implementation (X9G-2) 🔄
- No blocking issues identified
- Governance design clear for close operation

---

## Relationship to Scanner Violations

### Current Baseline: 448 violations (283 critical, 165 block-build)

### Close Route Violations
- **Location:** src/app/api/decisions/[decisionId]/close/route.ts
- **Count:** ~4 violations
- **Type:** Legacy auth pattern (withAuth import, withAuth() calls)
- **Status:** Expected to remain during route governance update (X9G-2)

### Violation Reduction Path
1. X9F-4 acceptDecision refactor: 0 new violations (verified pattern)
2. X9F-6 rejectDecision refactor: 0 new violations (verified pattern)
3. X9F-8 createDecision cleanup: 0 new violations (internal cleanup)
4. X9G-2 close route update: 0 new violations (capability check doesn't create shadow reads)
5. X9G-3 close service refactor (optional): 0 new violations (verified pattern)

**Total Violations After X9G (All Phases Completed):** Estimated 448 (same)

**Note:** Violation reduction not the goal of X9F/X9G phases. Goal is governance modernization and verified input pattern. Scanner violations are largely independent of these refactors.

---

## Relationship to Workspace/Role Design

### What Depends on Workspace Design
1. **Entitlement mapping for DECISION_CLOSE** - Who gets close permission?
2. **Role definitions** - Is close an "owner" operation? "Manager" operation?
3. **Permission scope** - How does close permission interact with workspace roles?

### What Doesn't Depend on Workspace Design
1. **Route governance update (X9G-2)** - Can add DECISION_CLOSE check now
2. **Service refactor (X9G-3, optional)** - Can refactor to verified pattern now
3. **Domain capability (DECISION_CLOSE)** - Can add constant now

### Blocking Assessment
- Route governance (X9G-2): NOT BLOCKED (can proceed)
- Service refactor (X9G-3): NOT BLOCKED (can proceed)
- Entitlement mapping: BLOCKED on workspace design (expected, deferred)

---

## Status of Live Blocking Conditions

### Before X9G-2
**Blocking Issues:** NONE

Route governance update can proceed immediately.

### Before Service Refactor (X9G-3)
**Blocking Issues:** NONE (service refactor is optional)

If desired, can proceed immediately. If deferred, no impact.

### For Complete Decision Governance Closure
**Blocking Issues:** Workspace design (not in scope of X9F/X9G phases)

Entitlement mapping for DECISION_CLOSE will be determined by workspace role design.

---

## Governance Debt Closure Path

### Closed Debt
✓ createDecision dual-format (X9F-8)  
✓ acceptDecision verified input (X9F-4)  
✓ rejectDecision verified input (X9F-6)  

### In-Progress Debt
🔄 closeDecision governance (X9G-1 design, X9G-2 implementation)  

### Future Debt
- Workspace/role design (outside X9F/X9G scope)
- Scanner violation reduction (deferred, lower priority)
- Legacy auth pattern cleanup (incremental)

---

## Sign-Off

### Live Debt Status After X9G-1
- createDecision: ✓ CLOSED
- acceptDecision: ✓ CLOSED
- rejectDecision: ✓ CLOSED
- closeDecision: ⏳ DESIGNED (ready for X9G-2)

### No Blocking Issues
All known governance debts are either closed or have clear implementation plans with no blockers.

### Next Phase
X9G-2 (closeDecision route governance implementation) - NOT BLOCKED

### Summary
The four decision operations (create, accept, reject, close) are undergoing systematic governance modernization. Three are complete, one is in active design phase. No blocking issues identified. Architecture is moving toward consistent verified-input pattern across all decision services. Workspace/role design is the next frontier (outside current X9F/X9G scope).

---

## Status by Phase

| Phase | Debt Addressed | Status |
|---|---|---|
| X9F-2 | createDecision dual-format | Added (debt created) |
| X9F-4 | acceptDecision | ✓ Refactored |
| X9F-5 | Selection for rejectDecision | Identified closeDecision gap |
| X9F-6 | rejectDecision | ✓ Refactored |
| X9F-7 | Dual-format cleanup selection | Planning approved |
| X9F-8 | Dual-format cleanup | ✓ Removed |
| X9G-1 | Close governance design | ✓ Design complete (THIS) |
| X9G-2 | Close route update | Scheduled next |
| X9G-3 | Close service refactor | Optional |

---

## Conclusion

**Live Debt Register Status:** UP TO DATE

All four decision service governance debts are tracked and managed:
- Three closed ✓
- One in progress with clear plan 🔄
- No unknowns
- No blocking issues
- Ready for next phase (X9G-2)
