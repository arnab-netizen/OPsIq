# X9G-1: closeDecision Design Options

**Date:** 2026-05-16  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Analysis:** Evaluating 5 governance design options for closeDecision

---

## Option A: Use DECISION_UPDATE for closeDecision

**Description:** Repurpose existing DECISION_UPDATE capability to include close operation.

### Implementation
- Route checks `requireCapabilities: ["DECISION_UPDATE"]` for close
- No new capability constant
- Audit trail shows DECISION_UPDATE event for close

### Evaluation

| Dimension | Assessment | Details |
|---|---|---|
| **Least Privilege** | MEDIUM | DECISION_UPDATE may be broader than close needs (field updates included), close may be more restricted |
| **Behavior Change Risk** | LOW | Close logic unchanged, only auth requirement changed |
| **Permission Surface Risk** | MEDIUM | Expands DECISION_UPDATE scope to include terminal operation |
| **Entitlement Impact** | LOW | No new entitlement mapping needed |
| **Scanner Impact** | MEDIUM | Route still uses legacy withAuth() pattern, scanner violations remain |
| **Route Migration Complexity** | LOW | Just add capability check |
| **Service Refactor Complexity** | NONE | Service unchanged |
| **Auditability** | MEDIUM | Close events not distinguished from other updates |
| **Rollback Simplicity** | HIGH | Simple: revert auth check |
| **Testability** | HIGH | Can test by granting/revoking DECISION_UPDATE |

### Pros
✓ No new capability constant  
✓ Simple implementation  
✓ Low entitlement mapping burden  
✓ Clear rollback path  
✓ Reuses existing capability  

### Cons
✗ Conflates "update" (modify) with "close" (complete/terminal)  
✗ Not least-privilege if DECISION_UPDATE includes field edits  
✗ Audit trail doesn't distinguish close from updates  
✗ Future governance design may need to separate permissions  
✗ Scanner violations remain (route still uses legacy auth)  

### Risk Assessment
**Overall Risk:** MEDIUM  
**Primary Concern:** Semantic conflation of distinct operations  
**Mitigation:** Document that DECISION_UPDATE includes close operation  

---

## Option B: Add New DECISION_CLOSE Capability

**Description:** Create new `decision:close` capability for closing decisions.

### Implementation
- Add `DECISION_CLOSE: "decision:close"` to CAPABILITIES
- Route checks `requireCapabilities: ["DECISION_CLOSE"]` for close
- Create entitlement mapping for DECISION_CLOSE
- Audit events emitted with DECISION_CLOSE context

### Evaluation

| Dimension | Assessment | Details |
|---|---|---|
| **Least Privilege** | HIGH | Close gets explicit, bounded permission with no side scope |
| **Behavior Change Risk** | LOW | Close logic unchanged, only auth requirement changed |
| **Permission Surface Risk** | LOW | New permission has explicit scope (close only) |
| **Entitlement Impact** | HIGH | New entitlement mapping required, governance must decide who has close |
| **Scanner Impact** | MEDIUM | Route still uses legacy withAuth() pattern, violations remain |
| **Route Migration Complexity** | LOW | Just add capability check |
| **Service Refactor Complexity** | NONE | Service unchanged |
| **Auditability** | HIGH | Close events clearly marked with DECISION_CLOSE |
| **Rollback Simplicity** | HIGH | Simple: remove DECISION_CLOSE, revert capability check |
| **Testability** | HIGH | Can test by granting/revoking DECISION_CLOSE |

### Pros
✓ Least-privilege (explicit, bounded scope)  
✓ Clear semantic separation (close ≠ update)  
✓ Matches other decision operations (create, accept, reject)  
✓ Distinct audit trail  
✓ Future workspace design can handle close distinctly  
✓ Simple implementation  
✓ Clear rollback  

### Cons
✗ Requires entitlement governance decision  
✗ New capability constant to manage  
✗ Scanner violations remain (route still uses legacy auth)  
✗ Entitlement mapping needs to be defined  
✗ One more permission for operators to understand  

### Risk Assessment
**Overall Risk:** LOW  
**Primary Concern:** Entitlement mapping (who should have DECISION_CLOSE)  
**Mitigation:** Governance defines clear close permission rules  

---

## Option C: Keep Legacy Role/Permission Until Workspace/Role Design Complete

**Description:** Leave close route on legacy `hasPermission(role, "close_decision")` pattern until workspace design is finished.

### Implementation
- No changes to close route
- No new capabilities added
- No entitlement mapping changes
- Defer all governance decisions to workspace design phase

### Evaluation

| Dimension | Assessment | Details |
|---|---|---|
| **Least Privilege** | LOW | Depends on unmodeled workspace/role design |
| **Behavior Change Risk** | NONE | No changes made |
| **Permission Surface Risk** | LOW | No new patterns introduced |
| **Entitlement Impact** | NONE | No changes |
| **Scanner Impact** | NONE | Violations remain (expected, deferred) |
| **Route Migration Complexity** | N/A | Deferred |
| **Service Refactor Complexity** | N/A | Deferred |
| **Auditability** | NONE | Unchanged |
| **Rollback Simplicity** | N/A | No changes to roll back |
| **Testability** | NONE | Unchanged |

### Pros
✓ No governance decision needed now  
✓ No code changes  
✓ No implementation effort  
✓ Defer to when workspace design is clear  
✓ Avoids potential rework  

### Cons
✗ Close route stays on legacy pattern (inconsistent with create/accept/reject)  
✗ Scanner violations remain (and are expected)  
✗ Decision still open when service refactor occurs  
✗ Not least-privilege  
✗ Creates technical debt (legacy pattern remains)  
✗ Architectural inconsistency  

### Risk Assessment
**Overall Risk:** MEDIUM-HIGH  
**Primary Concern:** Architectural inconsistency (some operations use capabilities, close uses roles)  
**Mitigation:** Document that close is intentionally deferred  

---

## Option D: Require Internal Access / Owner-Only for closeDecision

**Description:** Restrict close to internal users or workspace owner only.

### Implementation
- Route checks internal flag or owner status
- Or: requires workspace "owner" role (if role design available)
- Close is privileged operation requiring special access

### Evaluation

| Dimension | Assessment | Details |
|---|---|---|
| **Least Privilege** | HIGH | Close is heavily restricted |
| **Behavior Change Risk** | LOW | Close logic unchanged, only authorization changed |
| **Permission Surface Risk** | LOW | Clear scope (internal/owner only) |
| **Entitlement Impact** | HIGH | Requires workspace role design to define owner |
| **Scanner Impact** | MEDIUM | May still use legacy auth patterns |
| **Route Migration Complexity** | MEDIUM | Requires workspace/role integration |
| **Service Refactor Complexity** | NONE | Service unchanged |
| **Auditability** | MEDIUM | Owner actions may be logged separately |
| **Rollback Simplicity** | MEDIUM | Depends on role implementation |
| **Testability** | MEDIUM | Requires test accounts with owner role |

### Pros
✓ Strong security model (close is privileged)  
✓ Clear semantic (only owner/internal can close)  
✓ Aligns with "end engagement" semantics  
✓ Easy to understand (owner approval required)  

### Cons
✗ Requires workspace/role design to be complete  
✗ Not least-privilege if close permission is different from owner scope  
✗ Blocks on workspace governance (not ready yet)  
✗ Doesn't follow pattern of other decision operations  
✗ Harder to test without role framework  
✗ May be overly restrictive (if close doesn't need owner approval)  

### Risk Assessment
**Overall Risk:** HIGH  
**Primary Concern:** Dependency on workspace/role design (which is unresolved)  
**Mitigation:** Defer until workspace design is complete  

---

## Option E: Split Into Route Design Then Service Refactor

**Description:** Implement route governance decision and capability now, service refactor later.

### Implementation - Phase 1 (Now, X9G-2)
- Choose between Option A, B, or C
- Update route auth requirement (capability-based or legacy)
- Leave service unchanged (still accepts raw parameters)

### Implementation - Phase 2 (Later, X9G-3)
- Refactor closeDecision to use VerifiedClosureInput pattern (like X9F-4, X9F-6)
- Update route caller to construct verified input
- Perform same pattern as acceptDecision/rejectDecision

### Evaluation (Focusing on Route Design Phase)

| Dimension | Assessment | Details |
|---|---|---|
| **Least Privilege** | VARIES | Depends on chosen option (A, B, or C) |
| **Behavior Change Risk** | LOW | Route change only, service unchanged |
| **Permission Surface Risk** | VARIES | Depends on chosen option |
| **Entitlement Impact** | VARIES | Depends on chosen option |
| **Scanner Impact** | MEDIUM | Route governance still has legacy auth violations until refactor |
| **Route Migration Complexity** | LOW | Just add/update capability check |
| **Service Refactor Complexity** | DEFERRED | Split to later phase |
| **Auditability** | MEDIUM | Route decision made, service decision deferred |
| **Rollback Simplicity** | HIGH | Route change is isolated, easy to roll back |
| **Testability** | HIGH | Can test route governance change independently |

### Pros
✓ Route governance can be decided now  
✓ Service refactor deferred to clear decisions  
✓ Route and service changes are independent  
✓ Can fix route auth before tackling service pattern  
✓ Aligns route with create/accept/reject patterns first  
✓ Service refactor is optional (can be skipped if not needed)  

### Cons
✗ Two phases instead of one (more planning overhead)  
✗ Service still on old pattern temporarily  
✗ Scanner violations remain until service refactor  
✗ Need to decide which Option (A, B, C) for route phase  
✗ Requires committing to future service work  

### Risk Assessment
**Overall Risk:** LOW-MEDIUM  
**Primary Concern:** Phased approach may feel incomplete short-term  
**Mitigation:** Document that service refactor is planned for later  

---

## Comparison Matrix

| Criterion | Option A | Option B | Option C | Option D | Option E |
|---|---|---|---|---|---|
| Least Privilege | Medium | High | Low | High | Varies |
| Implementation Effort | Low | Low | None | Medium | Low (route) |
| Entitlement Clarity | Medium | High | None | High | Varies |
| Scanner Progress | No | No | No | Maybe | No |
| Consistency | Low | High | Low | Low | High |
| Architectural Debt | Medium | None | High | Medium | Low |
| Risk | Medium | Low | Medium-High | High | Low-Medium |
| Timing | Now | Now | Now | Blocked | Now |

---

## Governance Decision Framework

### Choose Based On:

**Option A (DECISION_UPDATE)** if:
- ✓ Close and update are semantically equivalent
- ✓ Governance accepts close as form of update
- ✓ Least-privilege not a concern
- ✓ Simplicity is highest priority

**Option B (DECISION_CLOSE)** if:
- ✓ Close should have distinct capability
- ✓ Least-privilege is important
- ✓ Want consistency with create/accept/reject pattern
- ✓ Governance ready to define close permissions

**Option C (Keep Legacy)** if:
- ✓ Want to defer all decisions to workspace design
- ✓ Accept architectural inconsistency temporarily
- ✓ Technical debt acceptable
- ✓ Other priorities higher than close governance

**Option D (Owner-Only)** if:
- ✓ Close should be highly restricted
- ✓ Workspace role design is complete (it's not)
- ✓ Owner approval always required
- ✓ Prefer semantic clarity over flexibility

**Option E (Phased)** if:
- ✓ Want to make route decision now, defer service
- ✓ Comfortable with two-phase implementation
- ✓ Service refactor can be optional later
- ✓ Want to unblock route governance immediately

---

## Recommendation for Selection

**Most Aligned with X9F Pattern:** Option B (DECISION_CLOSE)

**Rationale:**
1. Matches pattern of create/accept/reject (each has own capability)
2. Enables least-privilege governance
3. Clear audit trail
4. Lowest technical debt
5. Future-proof for workspace design
6. Consistent architecture

**Alternative if Blocked on Entitlement:** Option E (Route now, service later)

**Not Recommended:**
- Option A: Creates semantic confusion
- Option C: Increases architectural debt
- Option D: Blocks on unresolved workspace design

---

## Next Step
Proceed to Phase E: Select governance design based on this analysis.
