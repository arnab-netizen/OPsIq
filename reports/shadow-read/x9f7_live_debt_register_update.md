# X9F-7: Live Debt Register Update

**Date:** 2026-05-16  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Phase:** X9F-7 (Selection and Planning)

---

## Live Debt Items Status

### Debt Item 1: createDecision Dual-Format Support

**Status:** ✓ SELECTED FOR REMOVAL (Now)

#### Current State
- **Debt Type:** Live backwards-compatibility debt (temporary bridge)
- **Created:** X9F-2 (createDecision refactoring)
- **Reason Added:** Temporary bridge to allow callers to transition from old to new format at their own pace
- **Current Location:** 
  - src/services/decisions/decision-creation-service.ts:
    - CreateDecisionInput interface (lines 5-14) - still exported
    - Union type in createDecision signature (line 40)
    - Runtime format detection (line 43)
    - BulkCreateInput union (line 128)

#### Is It Live-Blocking?
**No, not blocking.**
- All 4 production callers use VerifiedDecisionInput exclusively
- No test dependencies on old format
- No other services depend on old format
- Safe to remove anytime

#### Selection for Removal
**✓ SELECTED: REMOVE_CREATE_DECISION_DUAL_FORMAT_NOW**

**Preconditions Met:** 7/7
1. ✓ All production callers audited (4 total)
2. ✓ All callers use verified format (4/4)
3. ✓ Zero unsafe old-format callers
4. ✓ Zero test dependencies on old format
5. ✓ No behavioral impact
6. ✓ No response shape change
7. ✓ Type safety improves

#### Next Phase
- **Phase Name:** X9F-8-IMPL
- **Scope:** Remove dual-format support from createDecision
- **Files:** 1 (decision-creation-service.ts)
- **Expected Changes:** ~30 lines removed, ~8 lines updated
- **Risk:** Low
- **Timeline:** Ready for immediate implementation

#### Removal Impact
- **Code quality:** Improved (removes dead code)
- **Type safety:** Improved (explicit format only)
- **Readability:** Improved (no runtime format detection)
- **Performance:** Negligible improvement (removed runtime check)
- **Behavioral:** No impact (all callers already use new format)

---

### Debt Item 2: closeDecision Refactoring Governance Gap

**Status:** ⏸ DEFERRED (Blocked on Governance)

#### Current State
- **Service:** closeDecision (decision-lifecycle.service.ts)
- **Debt Type:** Governance clarification needed before implementation
- **Current Issue:** closeDecision capability model unclear
  - Currently uses DECISION_REJECT capability (seems incorrect)
  - Should clarify: separate capability? conditional capability? shared with reject?

#### Is It Live-Blocking?
**Yes, partially.**
- closeDecision exists but capability mapping questionable
- X9G planning depends on governance decision
- Scanner shows 4 violations in closeDecision (deferred to next phase)

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

---

## Live Debt Interdependencies

### Debt Chain
```
X9F-2: createDecision refactor → dual-format support added (conditional accept)
  ├─ X9F-2R: All callers verified to use VerifiedDecisionInput
  ├─ X9F-4: acceptDecision refactor → single format (no dual debt)
  ├─ X9F-6: rejectDecision refactor → single format (no dual debt)
  └─ X9F-7: createDecision dual-format cleanup → READY NOW
      └─ X9F-8-IMPL: Remove dual-format support
          └─ X9G: closeDecision modernization (pending governance)
```

### Relationship to Scanner Violations
- Current scanner baseline: 448 total (283 critical, 165 block-build)
- X9F-8-IMPL removal: Expected 0 new violations (internal code simplification)
- X9G closeDecision: Will address ~4 violations in closeDecision service
- Remaining violations after X9G: ~444 (removing 4 from closeDecision refactor)

---

## Recommended Cleanup Schedule

### Phase 1: NOW (Immediate)
**X9F-8-IMPL: Remove createDecision Dual-Format Support**
- Status: Ready
- Dependencies: None
- Blocking: Nothing
- Effort: Small (~30 min)
- Risk: Low
- Action: Implement immediately

### Phase 2: Next (After Governance Input)
**X9G-SELECT: Plan closeDecision Modernization**
- Status: Blocked on governance
- Dependencies: Capability model clarification
- Blocking: Nothing critical
- Effort: TBD (depends on governance decision)
- Risk: Medium (governance dependent)
- Action: Obtain governance input, then proceed

---

## Debt Register Entries

### Entry 1: createDecision Dual-Format Support

```
ID: DEBT-X9F2-001
Title: createDecision dual-format support
Status: SELECTED_FOR_REMOVAL
Severity: LOW (not blocking, safe to remove)
Created: 2026-05-09 (X9F-2 phase)
Reason: Temporary bridge for caller transition
Detection: All 4 production callers verified to use VerifiedDecisionInput
Plan: X9F-8-IMPL (removal implementation)
Blocker: None
Next Action: Remove in X9F-8-IMPL
Timeline: Ready immediately
Owner: Development (Engineering team)
```

### Entry 2: closeDecision Capability Model Gap

```
ID: DEBT-X9F-GAP-001
Title: closeDecision capability model clarification
Status: DEFERRED_ON_GOVERNANCE
Severity: MEDIUM (governance dependent)
Created: 2026-05-16 (X9F-7 phase)
Reason: Unclear whether closeDecision should use DECISION_REJECT or separate capability
Detection: X9F-5/X9F-6 process identified structural similarity, governance gap exposed
Plan: X9G-SELECT (pending governance decision)
Blocker: Governance decision required on capability structure
Next Action: Obtain governance input on:
  - Should closeDecision have separate DECISION_CLOSE capability?
  - Should it share with DECISION_REJECT?
  - Should it be conditional?
Timeline: After governance decision
Owner: Governance (Product/Architecture team)
```

---

## Scanner Baseline Impact

### Before X9F-8-IMPL
- Total violations: 448
- Critical: 283
- Block-build: 165
- Areas: Mostly closeDecision (4), create/accept/reject patterns (rest)

### After X9F-8-IMPL (Expected)
- Total violations: 448 (no change)
- Critical: 283 (no change)
- Block-build: 165 (no change)
- Reason: Dual-format removal is internal code cleanup, no auth patterns changed

### After X9G (Estimated)
- Total violations: ~444 (4 removed from closeDecision)
- Critical: ~281 (maybe 2 removed if closeDecision violations are critical)
- Block-build: ~165 (no change if closeDecision violations not block-build)
- Estimate based on: closeDecision service likely has ~4 violations, composition unknown

---

## Relationship to Authorization Architecture

### Current State
- **Pattern:** RUNTIME_ENFORCED_HYBRID (auth at route level, no tier changes)
- **Verified Input Usage:** 
  - ✓ createDecision: Dual-format (selected for removal)
  - ✓ acceptDecision: Single verified format
  - ✓ rejectDecision: Single verified format
  - ⏳ closeDecision: Old format (needs governance clarification)

### After Cleanup
- **Pattern:** Still RUNTIME_ENFORCED_HYBRID
- **Verified Input Usage:**
  - ✓ createDecision: Single verified format (after X9F-8-IMPL)
  - ✓ acceptDecision: Single verified format
  - ✓ rejectDecision: Single verified format
  - ⏳ closeDecision: Pending X9G decision

### Long-term Architecture Vision
- All decision services should use consistent VerifiedInput pattern
- No service-side auth validation (all at route level)
- Explicit verified field names prevent mistakes
- No dual-format support in production code

---

## Blockers and Dependencies

### Blocking On X9F-8-IMPL
**None.** All preconditions met. Can start immediately.

### Blocking On X9G
**Governance decision required:**
- What is the correct capability model for closeDecision?
- Blocks X9G-SELECT until answered
- Once answered, X9G implementation can proceed
- Not blocking X9F-8-IMPL

---

## Acceptance Criteria for Debt Resolution

### For X9F-8-IMPL Success
- [ ] Build passes (0 TypeScript errors)
- [ ] All 402 tests pass
- [ ] Scanner baseline stable (448 violations, no change)
- [ ] Only 1 file modified (decision-creation-service.ts)
- [ ] CreateDecisionInput interface removed
- [ ] Runtime format detection removed
- [ ] All old format code paths eliminated
- [ ] Scope audit confirms within limits
- [ ] Dual-format debt officially closed

### For X9G Success (After Governance)
- [ ] Governance decision documented (capability model)
- [ ] closeDecision analyzed for refactoring
- [ ] Implementation plan created (7-phase structure)
- [ ] All gates pass (build, tests, scanner)
- [ ] closeDecision uses verified input pattern
- [ ] Close route caller updated
- [ ] Scope audit confirms within limits
- [ ] Scanner shows ~4 fewer violations (if applicable)

---

## Conclusion: Live Debt Status

**createDecision Dual-Format Support:**
- Status: ✓ SELECTED FOR REMOVAL
- Timeline: Ready NOW
- Next Phase: X9F-8-IMPL
- Risk: LOW
- Recommended Action: Implement immediately

**closeDecision Capability Gap:**
- Status: ⏸ DEFERRED ON GOVERNANCE
- Timeline: After governance decision
- Next Phase: X9G-SELECT
- Risk: MEDIUM (governance dependent)
- Recommended Action: Obtain governance input, then proceed

**Overall Debt Register:**
- 1 live debt selected for cleanup (X9F-8-IMPL ready)
- 1 live debt deferred pending governance (X9G blocked)
- No other live debt identified
- Architecture moves toward consistent verified input pattern

---

## Sign-Off

Live debt register updated for X9F-7 phase:
- createDecision dual-format: Ready for X9F-8-IMPL
- closeDecision governance: Pending governance input for X9G
- All preconditions for X9F-8-IMPL met
- All blockers for X9G documented

Register ready for next phase.
