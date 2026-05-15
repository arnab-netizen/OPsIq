# X9C-5: Service Refactor Pilot 2 Implementation Plan

**Date:** 2026-05-15  
**Status:** NO PILOT SELECTED - DEFERRED  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Decision: NO PILOT FOR X9C-5

No service refactor pilot will be executed for X9C-5.

**Reason:** Both remaining service blockers (stage.ts and owner-dashboard.service.ts) are blocked on X9D (Governance Design) Phase. Refactoring either without governance clarity would introduce technical debt.

---

## Deferred Services

### Service 1: stage.ts
**Status:** DEFERRED PENDING X9D  
**Functions:** createStage, getStage, getStagesForEngagement, updateStage, blockStage, unblockStage  
**Blockers:**
- No visible route callers (scope unclear)
- Modifies engagement.isBlocked (governance state)
- Validates stage transitions (intervention phase dependent)

**Prerequisite for X9C-5 Resume:**
- X9D must clarify intervention phase lifecycle
- X9D must clarify when stage transitions trigger re-evaluation
- X9D must clarify engagement.isBlocked semantics
- All route callers to stage.ts must be identified

### Service 2: owner-dashboard.service.ts
**Status:** DEFERRED PENDING X9D  
**Function:** getOwnerDashboard  
**Blockers:**
- Depends on 6 governance-aware services
- All dependent services will change during X9D
- Policy contract unclear

**Prerequisite for X9C-5 Resume:**
- X9D must clarify execution certainty framework
- X9D must clarify execution drift detection
- X9D must clarify decision confidence model
- X9D must clarify financial normalization
- X9D must clarify business impact aggregation
- X9D must clarify policy usage in dashboard

---

## Alternate Paths if Governance Needs Service Refactor

If X9D requires service refactor support during governance design (e.g., to support new governance patterns), consider:

### Option A: Auth Boundary Support Service
Create a new lightweight service that performs auth-boundary-only refactoring:
- Candidates: Services called BY stage.ts or dashboard (not stage/dashboard themselves)
- Examples: engagement.ts, client-account.ts (already refactored)
- Risk: LOW (only auth boundary, no governance changes)

### Option B: Read-Only Service Parameter-Based Auth Pilot
If a simple read-only service with parameter-based auth is discovered:
- Requirement: Accepts hasInternalAccess boolean, no auth-guard imports
- Risk: VERY LOW (already correct pattern)
- Value: Validates pattern consistency

---

## When to Resume Service Refactor Pilots

**Trigger:** X9D (Governance Design) completion

**Preconditions:**
1. X9D must clarify intervention phase lifecycle
2. X9D must clarify governance dependencies
3. X9D must clarify policy aggregation requirements
4. X9D must document service tier classification

**Next Phase After X9D + Service Refactoring:**
- X9C-5R (Service Refactor Pilot 2 Reconciliation)
- X9C-6 (Service Refactor Pilot 3)
- X9C-7 (Service Refactor Pilot 4)

---

## Current Service Refactor State Summary

| Phase | Status | Services | Result |
|-------|--------|----------|--------|
| **X9C-4** | COMPLETE | findings.ts, deliverable.ts | ✓ ACCEPTED |
| **X9C-5** | DEFERRED | stage.ts, owner-dashboard.service.ts | — NO PILOT |
| **X9C-6** | BLOCKED | Unknown (depends on X9D) | — PENDING |
| **X9C-7** | BLOCKED | Unknown (depends on X9D) | — PENDING |

---

## Classification Maintained

**Current:** RUNTIME_ENFORCED_HYBRID  
**Change:** None  
**Reason:** No service refactoring in X9C-5, classification unchanged

---

## Files Not Changed

This plan involves NO code changes:
- ✗ No service refactoring
- ✗ No route migration
- ✗ No route caller updates
- ✗ No wrapper changes
- ✗ No auth context changes
- ✗ No scanner changes
- ✗ No governance constant changes

---

## Deferral Justification

### Why Not Force stage.ts?
1. **Unclear scope:** No visible route callers. Cannot test refactoring comprehensively.
2. **Governance mutation:** Modifies engagement.isBlocked. Requires understanding engagement lifecycle.
3. **Unknown dependencies:** Unknown service-to-service callers mean unknown blast radius.
4. **Risk is unacceptable:** Not worth the technical debt for unknown benefit.

### Why Not Force owner-dashboard.service.ts?
1. **High complexity:** 6 service dependencies, all governance-aware.
2. **Governance dependencies:** Will change during X9D (execution certainty, drift, confidence models).
3. **Policy dependency:** All dependent services are policy-aware and subject to policy design changes.
4. **Better approach:** Let governance design clarify these contracts first, then refactor with clarity.

### Risk of Proceeding Without X9D Clarity
- **Technical debt:** Service refactoring without governance clarity creates unmaintainable code
- **Rework:** May need to re-refactor after X9D clarifies governance contracts
- **Logic errors:** Risk of introducing bugs when refactoring governance-dependent aggregation
- **Scope creep:** Governance design may reveal that other services should be refactored together

---

## End of Implementation Plan

**X9C-5 Status:** DEFERRED - NO PILOT SELECTED

**Recommendation:** Proceed to X9D (Governance Design) Phase. Resume service refactoring after X9D completion.

