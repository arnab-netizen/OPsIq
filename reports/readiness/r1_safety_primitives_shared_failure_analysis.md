# R1-SAFETY-PRIMITIVES: Shared Failure Analysis

**Date:** 2026-05-18  
**Phase:** R1-SAFETY-PRIMITIVES Shared Failure Analysis  
**Status:** ✓ ANALYSIS COMPLETE

---

## A. Shared Failure Patterns Across Dangerous Surfaces

### Pattern 1: Replay/Idempotency Gap

**Surfaces Affected:**
1. Decision Execute (4 hours to fix individually)
2. Action Complete (4 hours)
3. Engagement Condition (5 hours, partially)
4. Evidence Validation (2 hours)
5. Engagement Acknowledge (1 hour)
6. Webhook Test (1 hour)

**Total Individual Effort:** 17 hours

**Shared Failure Mechanism:**
```
Request arrives twice (network retry, duplicate)
  ↓
No idempotency-key check
  ↓
Handler executes twice
  ↓
Side effects triggered twice (duplicate completion, double validation, etc)
  ↓
Audit log confused (two entries for one logical operation)
```

**Common Symptom:** "Request X happened twice"
- Decision executed twice = workflow corrupted
- Action completed twice = audit loss
- Validation triggered twice = state inconsistency
- Email sent twice = customer annoyance

**Root Cause:** No deduplication mechanism across surfaces

**Primitive Opportunity:** Single reusable idempotency infrastructure
- Implement ONCE in shared utility
- Apply to 6 surfaces (eliminates 17 hours of individual fixes)

---

### Pattern 2: State Machine / Transition Validation Gap

**Surfaces Affected:**
1. Decision Execute (4 hours, partially)
2. Action Complete (4 hours, partially)
3. Intervention State (6 hours)

**Total Individual Effort:** 14 hours (combined with Pattern 1)

**Shared Failure Mechanism:**
```
Handler called on resource in wrong state
  ↓
No state validation before mutation
  ↓
Invalid transition allowed (PENDING → COMPLETED when status is DRAFT)
  ↓
State machine corrupted
  ↓
Workflow broken (next handler doesn't know what to do)
```

**Common Symptom:** "State transition happened from invalid source"
- Decision executed when in DRAFT (not APPROVED)
- Action completed when in CANCELLED
- Intervention moved backwards (EXECUTION → PLANNING)

**Root Cause:** No shared state machine enforcement

**Primitive Opportunity:** Reusable transition guard
- Define valid transitions centrally (PENDING → COMPLETED, APPROVED → EXECUTED, etc)
- Apply guard to 3 surfaces
- Eliminates 14 hours of individual state machine implementations

---

### Pattern 3: Audit Integrity Gap

**Surfaces Affected:**
1. Evidence Validation (2 hours)
2. Recommendation Rerank (2 hours)
3. Finding Creation (3 hours, partially)

**Total Individual Effort:** 7 hours

**Shared Failure Mechanism:**
```
State change happens
  ↓
No previous state stored
  ↓
No audit event emitted
  ↓
Later: "What changed? When? By whom?"
  ↓
Audit trail incomplete
```

**Common Symptom:** "Audit trail is missing"
- Evidence validation state lost (was it validated before?)
- Recommendation ranking lost (what was the original order?)
- Finding creation history lost (who created it? when?)

**Root Cause:** No shared audit trail enforcement

**Primitive Opportunity:** Reusable audit emitter
- Implement audit event emission in shared utility
- Apply to 3 surfaces
- Eliminates 7 hours of individual audit implementations

---

### Pattern 4: Cross-Aggregate Validation Gap

**Surfaces Affected:**
1. Finding Creation (3 hours, partially)
2. Intervention State (6 hours, partially)

**Total Individual Effort:** 9 hours (combined with other patterns)

**Shared Failure Mechanism:**
```
Handler creates/updates entity
  ↓
References related entity (evidence, recommendations, etc)
  ↓
No validation that related entity exists in workspace
  ↓
Cross-aggregate consistency broken
  ↓
Orphaned records, missing relationships, workspace isolation failure
```

**Common Symptom:** "Cross-aggregate consistency broken"
- Finding created, evidence doesn't belong to workspace
- Intervention transitioned, engagement not found
- Cascade fails (recommendations can't be archived)

**Root Cause:** No shared cross-aggregate validation

**Primitive Opportunity:** Reusable cross-aggregate validator
- Implement workspace-scoped cross-aggregate checks
- Apply to 2 surfaces
- Eliminates 9 hours of individual validation implementations

---

## B. Shared Pattern Summary

| Pattern | Surfaces | Individual Hours | Shared Hours | Savings |
|---------|----------|------------------|--------------|---------|
| **Pattern 1: Idempotency** | 6 | 17h | 4h (design + apply) | 13h |
| **Pattern 2: State Machine** | 3 | 14h | 4h (design + apply) | 10h |
| **Pattern 3: Audit Integrity** | 3 | 7h | 2h (design + apply) | 5h |
| **Pattern 4: Cross-Aggregate** | 2 | 9h | 2h (design + apply) | 7h |
| **Total** | 9 | 47h* | 12h | 35h |

*Some surfaces affected by multiple patterns (Design Execute has patterns 1+2+3, etc)

**Realistic Total Dangerous Surfaces Work:** 28 hours (accounting for overlap)
**Primitive Approach:** 12 hours total
**Net Savings:** 16 hours (57% reduction)

---

## C. Shared Failure Root Causes

### Root Cause 1: No Shared Idempotency Infrastructure
**Current State:** Each surface implements deduplication separately
**Impact:** Code duplication, inconsistent behavior, hard to maintain
**Primitive Solution:** Central idempotency utility with Redis/memory store

### Root Cause 2: No Shared State Machine Registry
**Current State:** State transitions embedded in handler logic
**Impact:** No unified enforcement, transitions scattered across codebase
**Primitive Solution:** Central state machine definitions with guard middleware

### Root Cause 3: No Shared Audit Hook
**Current State:** Each surface implements audit logging separately
**Impact:** Inconsistent audit format, missing audit trails, no observability
**Primitive Solution:** Central audit emitter with standardized event format

### Root Cause 4: No Shared Cross-Aggregate Validator
**Current State:** Each surface validates related entities ad-hoc
**Impact:** Workspace isolation gaps, orphaned records, consistency errors
**Primitive Solution:** Central validator enforcing workspace scoping and foreign keys

---

## D. Primitive Collapse Hypothesis

### If PRIMITIVE_1 (Idempotency) Implemented
**Surfaces Immediately Safe:**
- Engagement Acknowledge ✓
- Webhook Test ✓
- Evidence Validation ✓ (with audit trail)
- Engagement Condition ✓ (partial, with loop prevention)

**Still Dangerous:**
- Decision Execute ✗ (needs state machine)
- Action Complete ✗ (needs state machine)
- Intervention State ✗ (needs state machine)
- Recommendation Rerank ✗ (needs audit trail)
- Finding Creation ✗ (needs cross-aggregate validation)

**Risk Reduction:** ~40% (4 of 9 surfaces safe)

---

### If PRIMITIVE_1 + PRIMITIVE_2 (Idempotency + State Machine) Implemented
**Surfaces Immediately Safe:**
- Decision Execute ✓
- Action Complete ✓
- Intervention State ✓ (with cascade validation)
- Engagement Condition ✓ (fully, loop prevention baked in)
- Plus 4 from PRIMITIVE_1

**Still Dangerous:**
- Recommendation Rerank ✗ (needs audit trail)
- Finding Creation ✗ (needs cross-aggregate validation)

**Risk Reduction:** ~78% (7 of 9 surfaces safe)

---

### If All 4 Primitives Implemented
**Surfaces Immediately Safe:** All 9

**Risk Reduction:** 100%

---

## E. Implementation Leverage Analysis

**Highest Leverage:** PRIMITIVE_1 (Idempotency)
- Affects 6 surfaces
- Closes 4 surfaces fully
- 4 hours design + application
- Eliminates 13 hours of individual work
- **ROI: 3.25x leverage**

**Second Highest:** PRIMITIVE_2 (State Machine)
- Affects 3 surfaces
- Closes 3 surfaces fully
- 4 hours design + application
- Eliminates 10 hours of individual work
- **ROI: 2.5x leverage**

**Third:** PRIMITIVE_3 (Audit Integrity)
- Affects 3 surfaces
- Closes 2 surfaces, enhances 1
- 2 hours design + application
- Eliminates 5 hours of individual work
- **ROI: 2.5x leverage**

**Fourth:** PRIMITIVE_4 (Cross-Aggregate Validation)
- Affects 2 surfaces
- Closes 2 surfaces
- 2 hours design + application
- Eliminates 7 hours of individual work
- **ROI: 3.5x leverage**

---

## F. Critical Insight: Loop Prevention as State Machine

**Special Finding:** Engagement Condition's loop prevention problem
```
Naive approach:
  Update condition
  Trigger re-evaluation immediately
  Re-eval might modify condition
  Triggers re-evaluation again → LOOP

Primitive approach:
  State Machine knows: "Condition change" → "Re-eval in new phase"
  Re-eval is SEPARATE transaction, cannot modify condition
  Loop prevention baked into state machine transition semantics
```

**Implication:** PRIMITIVE_2 (State Machine) automatically solves loop prevention

---

## G. Dangerous Surface Consolidation After Primitives

### Surfaces Affected by PRIMITIVE_1 Only
- Engagement Acknowledge (idempotency)
- Webhook Test (idempotency)

### Surfaces Affected by PRIMITIVE_1 + PRIMITIVE_2
- Decision Execute (idempotency + state machine)
- Action Complete (idempotency + state machine)
- Engagement Condition (idempotency + state machine + loop prevention)

### Surfaces Affected by PRIMITIVE_1 + PRIMITIVE_3
- Evidence Validation (idempotency + audit trail)

### Surfaces Affected by PRIMITIVE_2
- Intervention State (state machine + cascade validation)

### Surfaces Affected by PRIMITIVE_1 + PRIMITIVE_3 + PRIMITIVE_4
- Finding Creation (idempotency + audit + cross-aggregate validation)

### Surfaces Affected by PRIMITIVE_3
- Recommendation Rerank (audit trail)

---

**Status: ✓ R1-SAFETY-PRIMITIVES SHARED FAILURE ANALYSIS COMPLETE**

**Key Findings:**
1. **4 distinct shared failure patterns** across 9 dangerous surfaces
2. **4 reusable primitives** can collapse all surfaces
3. **57% engineering effort savings** through primitive reuse (28h → 12h)
4. **Highest leverage:** Idempotency primitive (3.25x ROI)
5. **Critical insight:** State machine automatically solves loop prevention

**Next Phase:** Design 4 primitives with detailed API, semantics, and failure modes
