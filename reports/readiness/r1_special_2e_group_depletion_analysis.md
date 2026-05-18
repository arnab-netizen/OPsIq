# R1-SPECIAL-2E: Safe Group Depletion Analysis

**Date:** 2026-05-18  
**Phase:** R1-SPECIAL-2E Safe Groups Assessment  
**Status:** ✓ DEPLETION ANALYSIS COMPLETE

---

## A. Current Modernization Progress

**Lane D (Policy/D4):** ✓ COMPLETE
- Handlers modernized: 8
- Violations reduced: -33 cumulative
- Status: Lane complete, no more D4 handlers to modernize

**Lane E Batch 1 (Growth Metrics):** ✓ COMPLETE
- Handlers modernized: 3
- Violations reduced: -12
- Status: Batch accepted, ready for next batch

**Total Progress:**
- Handlers modernized: 11
- Violations reduced: -45 cumulative (from 260 starting point)
- Current violations: 215
- Target: Below 100 (private beta)
- Remaining: 115+ violations

---

## B. Safe Groups Remaining (5 Groups Total)

### GROUP_1_SIMPLE_SESSION
**Name:** Session Lifecycle (E1 Safe)  
**Risk Tier:** E1_SAFE_STATEFUL  
**Handlers:** 1
- auth/logout (POST)

**Characteristics:**
- Idempotency: Session invalidation is idempotent
- Reversibility: Session can be re-created
- Side-effects: None (session state managed internally)
- Concurrency: No conflicts (session is actor-scoped)
- Complexity: Simple (single operation)

**Modernization Pattern:**
- Wrapper replacement: withEnforcementFull → withCanonicalEnforcement
- Context: Use ctx.verifiedActorId instead of session.user.id
- Scope: Handler-only (no service changes)

**Estimated Reduction:**
- Total: 3 violations
- Critical: 2
- Block-build: 1

**Ready Now:** YES ✓  
**Implementation Difficulty:** TRIVIAL (single handler, no service interaction)  
**Risk:** MINIMAL (E1 tier, simple operation, no external effects)

**Recommendation:** Can be first next batch (safest, simplest)

---

### GROUP_2_AUTH_SESSION
**Name:** Authentication (E2 Moderate)  
**Risk Tier:** E2_MODERATE_STATEFUL  
**Handlers:** 1
- auth/login (POST)

**Characteristics:**
- Idempotency: Idempotency key required (login is idempotent with key)
- Reversibility: Session deletion possible (session can be cleared)
- Side-effects: Session creation, audit events
- Concurrency: Independent sessions (no conflict)
- Complexity: Moderate (session creation, validation)

**Modernization Pattern:**
- Wrapper replacement: withEnforcementFull → withCanonicalEnforcement
- Context: Use ctx.verifiedActorId instead of session.user.id
- Idempotency: Extract idempotency-key header (already implemented in batch 1 pattern)
- Scope: Handler-only (no service changes)

**Estimated Reduction:**
- Total: 3 violations
- Critical: 2
- Block-build: 1

**Ready Now:** YES ✓  
**Implementation Difficulty:** EASY (single handler, no service interaction, idempotency pattern proven in batch 1)  
**Risk:** LOW (E2 tier, proven pattern, independent sessions)

**Recommendation:** Second next batch (proven pattern, simple handler)

---

### GROUP_3_WEBHOOKS
**Name:** Webhook Handlers (E2 Moderate)  
**Risk Tier:** E2_MODERATE_STATEFUL  
**Handlers:** 2
- webhooks/stripe (POST)
- webhooks/subscribe (POST)

**Characteristics:**
- Idempotency: Guaranteed by external system (Stripe UUID)
- Reversibility: Refunds/reversals possible (payment reversible)
- Side-effects: Payment processing, notifications (external effects)
- Concurrency: External system serializes (Stripe retries unique)
- Complexity: Moderate-High (webhook pattern, signature verification)

**Modernization Pattern:**
- Wrapper replacement: withEnforcementFull → withCanonicalEnforcement
- Context: Use ctx.verifiedActorId if needed
- Webhook pattern: Preserve signature verification + idempotency tracking
- Scope: Handler-only (no service changes)

**Estimated Reduction:**
- Total: 6 violations
- Critical: 4
- Block-build: 2

**Ready Now:** MAYBE (depends on webhook isolation decision)  
**Implementation Difficulty:** MODERATE (webhook pattern, external system integration)  
**Risk:** MODERATE (E2 tier, external effects, replay/idempotency concerns)

**Special Considerations:**
- Must preserve webhook signature verification
- Must preserve idempotency tracking (external UUID)
- Must handle replay scenarios
- External service (Stripe) controls reliability
- Isolation decision required (see Phase E below)

**Recommendation:** CONDITIONAL - Analyze webhook isolation first (Phase E)

---

### GROUP_5_OPTIMISTIC_LOCK
**Name:** Optimistic Lock State Transitions (E3 Moderate)  
**Risk Tier:** E3_COMPLEX_STATE_MACHINE  
**Handlers:** 5
- engagements/[engagementId]/intervention (PATCH)
- engagements/[engagementId] (PATCH - basic fields)
- clients/[clientId] (PATCH)
- decisions/[decisionId] (PATCH)
- leads/[leadId] (PATCH)

**Characteristics:**
- Idempotency: Version field prevents double-application
- Reversibility: State permanent, no rollback (business decision)
- Side-effects: Audit logging, status tracking
- Concurrency: Version field handles conflicts (retry on mismatch)
- Complexity: High (state machines, version validation, retry logic)

**Modernization Pattern:**
- Wrapper replacement: withEnforcementFull → withCanonicalEnforcement
- Context: Use ctx.verifiedActorId, ctx.verifiedWorkspaceId
- Version handling: Preserve version field check + conflict retry logic
- Scope: Handler-only (no service changes, no state machine redesign)

**Estimated Reduction:**
- Total: 12 violations
- Critical: 8
- Block-build: 4

**Ready Now:** YES ✓  
**Implementation Difficulty:** HARD (5 handlers, state machines, version validation)  
**Risk:** MODERATE-HIGH (E3 tier, state permanent, complex concurrency)

**Special Considerations:**
- Must preserve version field validation
- Must implement version conflict retry
- Must maintain state transition audit
- No rollback capability (business constraint)
- Larger batch size (5 handlers = higher risk)

**Recommendation:** Third or fourth batch (after simpler batches, high reduction potential)

---

## C. Blocked/Deferred Groups (2 Groups Total)

### GROUP_6_BLOCKED_COMPLEX
**Name:** Complex State Machines  
**Risk Tier:** E3_COMPLEX_STATE_MACHINE  
**Status:** BLOCKED (architecture required)  
**Handlers:** 7
- engagements/[engagementId]/experiments/* (all)
- engagements/[engagementId]/constraint-checks (POST)
- engagements/[engagementId]/shock-events (GET)

**Blocking Reason:**
- Non-deterministic execution (external service calls, async processing)
- Cascading updates (experiment changes trigger multiple state changes)
- Async side-effects (notifications, event processing)
- Current architecture doesn't support event sourcing

**Required for Unblocking:**
- Event sourcing redesign
- Async side-effect handling
- Non-deterministic execution framework
- Separate phase dedicated to architecture

**Status:** DEFERRED (post-private-beta optimization)  
**Estimated Violation Impact:** ~20-30 violations  
**Risk:** HIGH (non-deterministic, cascading, async)

---

### GROUP_7_BLOCKED_GOVERNANCE
**Name:** Dangerous Side-Effects  
**Risk Tier:** E4_DANGEROUS_SIDE_EFFECT  
**Status:** BLOCKED (governance required)  
**Handlers:** 3
- engagements/[engagementId]/shock-events (POST)
- Governance triggers
- External effect handlers

**Blocking Reason:**
- Irreversible external side-effects
- Governance re-evaluation async and non-deterministic
- Business-critical decisions (governance changes)
- No safe way to modernize without governance redesign

**Required for Unblocking:**
- Governance architecture redesign
- External service integration pattern
- Approval workflow framework
- Separate phase dedicated to governance

**Status:** DEFERRED (post-private-beta optimization)  
**Estimated Violation Impact:** ~10-20 violations  
**Risk:** CRITICAL (irreversible, governance-critical)

---

## D. Batch Sequencing Recommendation

**Current State:** 227 violations (down from 260)

### Batch Sequencing (Safest to Riskiest)

**BATCH 2 (Recommended Next):** GROUP_1_SIMPLE_SESSION
- Handlers: 1 (auth/logout)
- Estimated reduction: -3 violations
- Difficulty: TRIVIAL
- Risk: MINIMAL (E1)
- Timeline: 2-4 hours
- Projected total: 212 violations

**BATCH 3 (Recommended Third):** GROUP_2_AUTH_SESSION
- Handlers: 1 (auth/login)
- Estimated reduction: -3 violations
- Difficulty: EASY
- Risk: LOW (E2, proven pattern)
- Timeline: 2-4 hours
- Projected total: 209 violations

**BATCH 4 (Conditional):** GROUP_3_WEBHOOKS
- Handlers: 2 (stripe + subscribe)
- Estimated reduction: -6 violations
- Difficulty: MODERATE
- Risk: MODERATE (E2, external effects)
- Timeline: 4-6 hours (depends on isolation decision)
- Projected total: 203 violations
- **REQUIRES:** Phase E webhook isolation decision first

**BATCH 5 (If Deferred):** GROUP_5_OPTIMISTIC_LOCK
- Handlers: 5 (various PATCHes)
- Estimated reduction: -12 violations
- Difficulty: HARD
- Risk: MODERATE-HIGH (E3, state machines)
- Timeline: 8-12 hours
- Projected total: 191 violations

---

## E. Safe Group Exhaustion Projection

**Path to <200:**
- Current: 215 (post-batch-1)
- After batch 2: 212 (-3)
- After batch 3: 209 (-3)
- After batch 4 (if approved): 203 (-6)
- **Projected: ~200 violations (achievable with 3-4 more batches)**

**Path to <150:**
- Post-safe-batches: ~191 (after group 5)
- Blocked groups remain: ~30 violations
- Requires: Architecture redesign for groups 6-7
- **Realistic: ~160-180 violations before architecture redesign**

**Path to <100:**
- Requires: Complete resolution of blocked groups
- Requires: Governance + event sourcing redesign
- Requires: Post-private-beta optimization phase
- **Realistic: ~100-120 violations after full modernization**

---

## F. Critical Decision Points

**Decision 1: Webhook Isolation (GROUP_3)**
- Question: Can webhooks be safely modernized now?
- Impact: +6 violations reduction
- Risk: External effects, replay scenarios
- Decision needed: Phase E analysis

**Decision 2: Optimistic Lock (GROUP_5)**
- Question: Should batch size be limited (5 handlers)?
- Impact: +12 violations reduction
- Risk: State machines, concurrency complexity
- Decision needed: Risk tolerance vs reduction goal

**Decision 3: Private Beta Readiness**
- Current: 215 violations
- Target: <150 for private beta?
- Gap: 65+ violations
- Path: Groups 1-5 = 27 violations, groups 6-7 blocked
- Feasible: 188-191 violations pre-private-beta
- **Question: Is <200 acceptable for private beta, or is <150 required?**

---

**Status: ✓ R1-SPECIAL-2E GROUP DEPLETION ANALYSIS COMPLETE**

**Safe Groups Summary:**
- Ready now: 2 groups (1 trivial, 1 easy)
- Conditional: 1 group (pending isolation decision)
- Ready after simple batches: 1 group (complex, high reduction)
- Blocked: 2 groups (architecture redesign required)

**Batching Recommendation:** Sequence groups 1→2→3→5 (if approved), defer 6-7 to post-beta
