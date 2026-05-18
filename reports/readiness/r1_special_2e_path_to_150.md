# R1-SPECIAL-2E: Path to <150 Violations

**Date:** 2026-05-18  
**Phase:** R1-SPECIAL-2E Acceleration Path Assessment  
**Status:** ✓ PATH ANALYSIS COMPLETE

---

## A. Current State & Goals

**Starting Violations (Lane E begins):** 227
**Current Violations (After Batch 1):** 215
**Cumulative Reduction:** -12 violations (-5.3%)

**Target Milestones:**
- <200 violations: ACHIEVABLE (next 3-4 batches)
- <150 violations: CHALLENGING (requires architectural decisions)
- <100 violations: BLOCKED (requires governance redesign)

**Private Beta Readiness:**
- Current understanding: <150 violations required
- Alternative: <200 might be acceptable
- Decision needed: Clarify private beta threshold

---

## B. Safe Batch Path (<200)

### Batch 2: GROUP_1_SIMPLE_SESSION
**Handlers:** 1 (auth/logout)  
**Estimated reduction:** -3 violations  
**Duration:** 2-4 hours  
**Difficulty:** TRIVIAL  
**Risk:** MINIMAL (E1, simple operation)

**Projected state:** 212 violations

---

### Batch 3: GROUP_2_AUTH_SESSION
**Handlers:** 1 (auth/login)  
**Estimated reduction:** -3 violations  
**Duration:** 2-4 hours  
**Difficulty:** EASY  
**Risk:** LOW (E2, proven pattern)

**Projected state:** 209 violations

---

### Batch 4: GROUP_3_WEBHOOKS (Conditional)
**Handlers:** 2 (stripe, subscribe)  
**Estimated reduction:** -6 violations  
**Duration:** 4-6 hours (if new wrapper required)  
**Difficulty:** MODERATE  
**Risk:** MODERATE (E2, external effects, requires wrapper decision)

**Projected state:** 203 violations

**Condition:** Requires webhook-specific wrapper implementation (see Phase E)

---

## C. Safe Batch Path (<180)

Continuing from <200 milestone:

### Batch 5: GROUP_5_OPTIMISTIC_LOCK
**Handlers:** 5 (various PATCHes)
- engagements/[engagementId]/intervention (PATCH)
- engagements/[engagementId] (PATCH)
- clients/[clientId] (PATCH)
- decisions/[decisionId] (PATCH)
- leads/[leadId] (PATCH)

**Estimated reduction:** -12 violations  
**Duration:** 8-12 hours  
**Difficulty:** HARD  
**Risk:** MODERATE-HIGH (E3, state machines, version validation)

**Projected state:** 191 violations

**Special requirements:**
- Version field validation preserved
- Version conflict retry logic implemented
- State transition audit preserved
- No service signature changes

**Assessment:**
- Achievable: YES (no architectural barriers)
- Proven pattern: YES (batch 1 demonstrated modernization pattern holds)
- Time investment: SIGNIFICANT (5 handlers × 1.5-2 hours each)

---

## D. Path to <150 (Realistic Assessment)

**Remaining Violations After Batch 5:** 191
**Target:** <150
**Gap:** 41+ violations

**Remaining Safe Groups:**
- GROUP_1-5 (completed): 27 violations resolved
- No more safe groups remain

**Blocked Groups:**
- GROUP_6 (complex state machines): ~20-30 violations
- GROUP_7 (governance side-effects): ~10-20 violations
- Total blocked: ~30-50 violations

**Remaining violations distribution:**
- Safe groups exhausted: 191
- Blocked groups: ~24 violations (blocked, unresolved)
- Unknown handlers: ~0-10 violations (scanned, not yet classified)
- **Realistic floor without architecture redesign: 191 violations**

**Conclusion: <150 NOT achievable without architecture changes**

---

## E. Blocked Group Assessment (Why <150 is Hard)

### GROUP_6: Complex State Machines (BLOCKED)

**Handlers:** 7
- experiments/* (all endpoints)
- constraint-checks
- shock-events (GET variant)

**Violations:** ~20-30
**Blocking issue:** Non-deterministic execution
- External service calls (constraints)
- Async processing (experiment progress)
- Cascading state updates (dependent entities)

**Why blocked:**
```
withCanonicalEnforcement expects deterministic execution
Group 6 has async side-effects and cascading updates
Cannot modernize without event sourcing architecture
```

**Solution required:**
- Event sourcing redesign
- Async/await handling in context
- Cascading update coordination
- Estimated effort: 40-60 hours + architecture review

**Timeline:** Post-private-beta (Q3 2026?)

---

### GROUP_7: Dangerous Side-Effects (BLOCKED)

**Handlers:** 3
- shock-events (POST variant)
- governance triggers
- external effect handlers

**Violations:** ~10-20
**Blocking issue:** Irreversible external side-effects
- Governance re-evaluation triggered
- Business-critical decisions made
- Audit trail required (immutable)

**Why blocked:**
```
withCanonicalEnforcement cannot guarantee governance re-evaluation timing
Cannot modernize without governance architecture redesign
Business risk: premature modernization could break decision flow
```

**Solution required:**
- Governance architecture redesign
- Approval workflow framework
- External integration pattern
- Estimated effort: 30-40 hours + governance review

**Timeline:** Post-private-beta (Q3 2026?)

---

## F. Realistic Acceleration Paths

### Path 1: Safe Batches Only (Conservative)

**Execution:**
- Batch 1: ✓ Complete (215 violations)
- Batch 2: +1 handler → 212
- Batch 3: +1 handler → 209
- Batch 4: +2 handlers → 203
- Batch 5: +5 handlers → 191
- **Final: 191 violations**

**Time investment:** ~25-30 hours
**Risk:** LOW (all safe handlers, proven pattern)
**Achievable:** YES, within 2-3 weeks
**Result:** 16 violations reduction from current state

**Private Beta Readiness:**
- Current: 215 violations (post-batch-1)
- Final: 191 violations (after all safe batches)
- Gap to <150: 41 violations (requires architecture)
- Assessment: <200 achievable, <150 NOT achievable

---

### Path 2: Aggressive with Architecture (Optimistic)

**Execution:**
- Batches 1-5: Complete (191 violations)
- Parallel: Start GROUP_6 architecture redesign
- Q3 2026: Migrate GROUP_6 to event sourcing
  - Experiments redesign: -15 violations
  - Constraints redesign: -8 violations
  - Shock-events redesign: -5 violations
  - Estimated: -28 violations
- Post-GROUP_6: GROUP_7 governance redesign
  - Governance triggers: -12 violations
  - External effects: -8 violations
  - Estimated: -20 violations
- **Projected final: 143 violations (sub-150)**

**Time investment:** ~100-120 hours (25-30 for batches + 75-90 for architecture)
**Risk:** MODERATE-HIGH (requires major refactoring)
**Achievable:** YES, but requires 4-6 month timeline
**Result:** 72 violations reduction total (from 260 starting)

**Private Beta Readiness:**
- Current: 215 violations
- Pre-beta (after safe batches): 191 violations
- Post-beta (after architecture): 143 violations
- Assessment: Can launch private beta at 191, optimize to 143 post-beta

---

## G. Private Beta Gate Decision

**Current Violation Count:** 215 (down from 260)
**Proposed Gate 1:** <200 violations
**Proposed Gate 2:** <150 violations

**Analysis:**

| Metric | Value | Assessment |
|--------|-------|-----------|
| Current | 215 | Safe batches can reduce to 191 |
| Safe path (191) | -24 from current | Achievable in 3-4 weeks |
| Gate option 1 (200) | 15 violations away | Achievable in 1-2 weeks |
| Gate option 2 (150) | 65 violations away | Requires architecture redesign |

**Recommendation:**
- **Gate 1 (<200):** ACHIEVABLE for private beta (batches 1-3)
- **Gate 2 (<150):** NOT achievable pre-beta without architecture work
- **Suggested approach:** Launch private beta at <200, optimize post-beta

**Timeline:**
- Week 1: Batch 1 (✓ done)
- Week 2: Batches 2-3 → 209 violations
- Week 3: Batch 4 (webhooks, optional) → 203-209 violations
- Week 4: Batch 5 (if needed) → 191 violations
- **Private Beta Gate:** <200 achievable by end of week 2-3

---

## H. Remaining Violations by Category

**Post-Safe-Batches (191 violations):**

| Category | Violations | Status | Action |
|----------|-----------|--------|--------|
| Safe handlers | 0 | Modernized | Complete |
| Blocked (architecture) | ~20-30 | Deferred | Post-beta architecture phase |
| Blocked (governance) | ~10-20 | Deferred | Post-beta governance phase |
| Unknown handlers | ~15-25 | Unclassified | Require audit/classification |
| **Total** | **191** | **Resolved to safe limit** | **Achievable** |

---

## I. Post-Beta Optimization Plan

**Phase 1: Unclassified Handler Audit (Weeks 1-2 post-beta)**
- Classify remaining ~15-25 violations
- Determine: Safe, blocked, or new pattern?
- Reduce blocked category if possible

**Phase 2: Architecture Redesign (Weeks 3-8 post-beta)**
- Event sourcing for GROUP_6 (~15 violations)
- Async/await handling framework (~10 violations)
- Estimated: -25 violations → 166

**Phase 3: Governance Redesign (Weeks 9-14 post-beta)**
- Governance framework redesign (~12 violations)
- External integration pattern (~8 violations)
- Estimated: -20 violations → 146

**Phase 4: Final Optimization (Weeks 15+)**
- Remaining handlers classification
- Target: <100 violations (stretch goal)

---

## J. Risk & Timeline Summary

| Milestone | Violations | Timeline | Risk | Achievable |
|-----------|-----------|----------|------|-----------|
| Current (Batch 1) | 215 | 0 weeks | - | ✓ |
| <200 target | 200 | 2-3 weeks | LOW | ✓ |
| Safe batches | 191 | 4-5 weeks | LOW | ✓ |
| <150 target (pre-beta) | 150 | Not achievable | N/A | ✗ |
| <150 target (post-beta) | 150 | 14-16 weeks | MODERATE | ✓ |
| <100 stretch | 100 | 20+ weeks | MODERATE-HIGH | ✓ |

---

**Status: ✓ R1-SPECIAL-2E PATH TO <150 ANALYSIS COMPLETE**

**Key Findings:**
1. <200 violations achievable in 2-3 weeks (via safe batches)
2. <150 violations NOT achievable without architecture redesign
3. Safe batch ceiling: 191 violations (batches 1-5)
4. Blocked groups require separate architecture phases
5. Suggested approach: Private beta at <200, optimize post-beta

**Recommendations:**
- Launch private beta with <200 gate
- Complete safe batches pre-beta (3-4 weeks)
- Defer architecture redesign to post-beta
- Plan 4-6 month post-beta optimization to reach <100
