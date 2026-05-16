# X9F-8: Live Debt Register Update

**Date:** 2026-05-16  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Phase:** X9F-8 (Debt Cleanup - Completed)

---

## Live Debt Items Status

### Debt Item 1: createDecision Dual-Format Support

**Status:** ✓ REMOVED

#### Previous State
- **Debt Type:** Live backwards-compatibility debt (temporary bridge)
- **Created:** X9F-2 (createDecision refactoring)
- **Reason Added:** Temporary bridge to allow callers to transition from old to new format at their own pace
- **Location:** 
  - CreateDecisionInput interface (REMOVED)
  - Union type in createDecision signature (REMOVED)
  - Runtime format detection (REMOVED)
  - BulkCreateInput union (REMOVED)

#### Removal Completed
- **Phase:** X9F-8
- **Date:** 2026-05-16
- **Action:** REMOVE_CREATE_DECISION_DUAL_FORMAT_NOW (COMPLETED)
- **Status:** ✓ CLOSED

#### Removal Impact
- **Code quality:** Improved (8 lines removed)
- **Type safety:** Improved (single format enforced)
- **Readability:** Improved (no runtime format detection)
- **Performance:** Negligible improvement (removed runtime check)
- **Behavioral:** No impact (all callers already use new format)

#### Preconditions Met (Verified in X9F-8)
1. ✓ All production callers use VerifiedDecisionInput
2. ✓ All callers compile with new signature
3. ✓ Zero unsafe old-format callers
4. ✓ Zero test dependencies on old format
5. ✓ No behavioral changes
6. ✓ No response shape changes
7. ✓ Build passes (0 errors)
8. ✓ All 402 tests pass
9. ✓ Scanner stable (448 violations, no change)

#### Final Confirmation
- **Removal authorized:** YES (X9F-7)
- **Removal executed:** YES (X9F-8)
- **Removal verified:** YES (all gates pass)
- **Debt status:** ✓ CLOSED

---

### Debt Item 2: closeDecision Capability Model Gap

**Status:** ⏸ DEFERRED ON GOVERNANCE (Unchanged)

#### Current State
- **Service:** closeDecision (decision-lifecycle.service.ts)
- **Debt Type:** Governance clarification needed before implementation
- **Current Issue:** closeDecision capability model unclear
  - Currently uses DECISION_REJECT capability (potentially incorrect)
  - Should clarify: separate capability? conditional capability? shared with reject?

#### Is It Live-Blocking?
**Yes, partially.**
- closeDecision exists but capability mapping questionable
- X9G planning depends on governance decision
- Not blocking X9F-8 (debt cleanup) but blocking X9G (modernization)
- Scanner shows ~4 violations in closeDecision (deferred to X9G)

#### Why Deferred
1. closeDecision is structurally similar to acceptDecision/rejectDecision
2. Can follow same verified input refactoring pattern
3. BUT: Requires capability model clarification first
4. Current DECISION_REJECT requirement may be wrong (close is different action)
5. Need governance decision on capability structure

#### Governance Questions Pending
1. Should closeDecision require DECISION_CLOSE (new capability)?
2. Should it share with DECISION_REJECT?
3. Should it be conditional based on decision status?
4. What audit event should it emit?
5. What workspace isolation rules apply?

#### Next Phase
- **Phase Name:** X9G-SELECT (Requires governance input first)
- **Blocking Issue:** Capability model clarification
- **Decision Maker:** Governance team
- **Timeline:** After governance decision made

#### Status After X9F-8
- **Still blocking:** YES (governance dependent)
- **Still deferred:** YES (no new information)
- **Still live debt:** YES
- **Priority:** MEDIUM (not blocking other work, but should be resolved)

---

## Live Debt Summary

### Closed Debt
- ✓ createDecision dual-format: REMOVED (X9F-8 completed)

### Remaining Debt
- ⏳ closeDecision governance gap: DEFERRED (X9G blocked, awaiting governance)

### Total Live Debt Items
- Closed: 1
- Open/Deferred: 1
- **Total:** 2

---

## Scanner Impact of Debt Cleanup

### Before X9F-8
- Total violations: 448
- Critical: 283
- Block-build: 165

### After X9F-8 (Current)
- Total violations: 448
- Critical: 283
- Block-build: 165

### Change
- Total change: 0 (ZERO new violations)
- Critical change: 0
- Block-build change: 0
- Status: STABLE

**Reasoning:** Dual-format removal was internal code cleanup. No new auth patterns introduced, no shadow reads added, no service-side canonicalization.

---

## Relationship to Authorization Architecture

### Current State After X9F-8
- **Pattern:** RUNTIME_ENFORCED_HYBRID (auth at route level, no tier changes)
- **Verified Input Usage:** 
  - ✓ createDecision: Single verified format ONLY (cleanup complete)
  - ✓ acceptDecision: Single verified format (from X9F-4)
  - ✓ rejectDecision: Single verified format (from X9F-6)
  - ⏳ closeDecision: Old format (needs governance clarification)

### After X9G (Estimated)
- **Pattern:** Still RUNTIME_ENFORCED_HYBRID
- **Verified Input Usage:**
  - ✓ createDecision: Single verified format (X9F-8 ✓)
  - ✓ acceptDecision: Single verified format (X9F-4 ✓)
  - ✓ rejectDecision: Single verified format (X9F-6 ✓)
  - ✓ closeDecision: Single verified format (X9G pending)

### Long-term Vision
- All decision services using consistent VerifiedInput pattern
- No service-side auth validation (all at route level)
- Explicit verified field names preventing mistakes
- No dual-format support in production code
- Clear auth boundary between route and service

---

## Blockers and Dependencies

### No Blockers on X9F-8
**X9F-8 cleanup is complete.** No remaining issues or blockers.

### Blockers on X9G
**Governance decision required:**
- What is the correct capability model for closeDecision?
- Once answered, X9G implementation can proceed
- Estimated governance decision timeline: TBD

---

## Cleaned-Up Debt Entry

```
ID: DEBT-X9F2-001
Title: createDecision dual-format support
Status: CLOSED (Removed in X9F-8)
Severity: LOW (was not blocking, safe to remove)
Created: 2026-05-09 (X9F-2 phase)
Closed: 2026-05-16 (X9F-8 phase)
Reason: Temporary bridge for caller transition
Resolution: All 4 production callers verified to use VerifiedDecisionInput
Removed By: X9F-8 debt cleanup
Impact: 8 lines removed, type safety improved, no behavioral changes
Final Status: ✓ CLOSED - No longer tracking as debt
```

---

## Remaining Live Debt Entry

```
ID: DEBT-X9F-GAP-001
Title: closeDecision capability model clarification
Status: DEFERRED_ON_GOVERNANCE
Severity: MEDIUM (governance dependent, not blocking current work)
Created: 2026-05-16 (X9F-7 phase)
Reason: Unclear whether closeDecision should use DECISION_REJECT or separate capability
Detection: X9F-5/X9F-6 process identified structural similarity, governance gap exposed
Plan: X9G-SELECT (pending governance decision)
Blocker: Governance decision required on:
  - Should closeDecision have separate DECISION_CLOSE capability?
  - Should it share with DECISION_REJECT?
  - Should it be conditional?
Timeline: After governance decision
Owner: Governance (Product/Architecture team)
Status: ⏳ DEFERRED (waiting for governance input)
```

---

## Metrics

### Debt Cleanup Progress
- **Started:** X9F-7 (selection)
- **Completed:** X9F-8 (implementation)
- **Debt items addressed:** 1/2 (50% of current live debt)
- **Code quality improved:** YES
- **Type safety improved:** YES
- **Production risk:** NONE

### Timeline
- X9F-2: Dual-format added (2026-05-09)
- X9F-7: Selection and planning (2026-05-16)
- X9F-8: Implementation and cleanup (2026-05-16)
- **Duration:** 7 days total (audit to removal)

---

## Sign-Off

Live debt register updated for X9F-8:
- createDecision dual-format: ✓ REMOVED (debt closed)
- closeDecision governance: ⏸ DEFERRED (still pending governance)
- All preconditions for removal met: YES
- All validation gates passed: YES
- Build/tests/scanner stable: YES

Register ready for next phase (X9G-SELECT, pending governance decision).
