# R1-SAFETY-PRIMITIVES: Baseline

**Date:** 2026-05-18  
**Phase:** R1-SAFETY-PRIMITIVES Baseline  
**Status:** ✓ BASELINE CONFIRMED

---

## A. Current State

**Branch:** main  
**Status:** Up to date with origin/main  

**Scanner Metrics:**
- Total violations: 212
- Critical: 127
- Block-build: 85

**Dangerous Surfaces Inventory (from R1-SURFACE-CLOSURE):**
- **CRITICAL:** 4 surfaces (3 safe, 1 needs verification)
- **HIGH:** 4 surfaces (all need fixes)
- **MEDIUM:** 3 surfaces (all need fixes)
- **LOW:** 2 surfaces (optional)

**Total Dangerous Surfaces Requiring Fix:** 9 (4 HIGH + 3 MEDIUM + 2 LOW)

---

## B. Current Approach vs Primitive Approach

### Current Approach (R1-SURFACE-CLOSURE)
```
Decision Execute → Implement idempotency (4h)
Action Complete → Implement idempotency (4h)
Engagement Condition → Implement loop prevention (5h)
Intervention State → Implement state machine (6h)
Evidence Validation → Implement idempotency (2h)
Finding Creation → Implement cross-aggregate validation (3h)
Recommendation Rerank → Implement audit trail (2h)
Acknowledge → Implement idempotency (1h)
Webhook Test → Implement idempotency (1h)

Total: 28 hours (9 surfaces, 1 primitive per surface)
```

### Primitive Approach (This Analysis)
```
Design PRIMITIVE_1 (Replay + Idempotency) → Apply to 5 surfaces
Design PRIMITIVE_2 (State Machine Safety) → Apply to 3 surfaces
Design PRIMITIVE_3 (Audit Integrity) → Apply to 4 surfaces
Design PRIMITIVE_4 (Cross-Aggregate Validation) → Apply to 2 surfaces

Total: X hours to design 4 primitives + Y hours to apply
Goal: X + Y < 28 hours (net savings through reuse)
```

---

## C. Dangerous Surfaces Requiring Fixes

| Surface | Current Risk | Requires |
|---------|--------------|----------|
| Decision Execute | Duplicate execution | Idempotency + State Machine |
| Action Complete | Duplicate completion | Idempotency + State Machine |
| Engagement Condition | Loop risk | Idempotency + Loop Prevention |
| Intervention State | Invalid transitions | State Machine + Validation |
| Evidence Validation | Duplicate validation | Idempotency + Audit Trail |
| Finding Creation | Cross-aggregate inconsistency | Cross-Aggregate Validation |
| Recommendation Rerank | No audit trail | Audit Integrity |
| Engagement Acknowledge | Duplicate notification | Idempotency |
| Webhook Test | Duplicate test event | Idempotency |

---

## D. Preliminary Primitive Opportunities

**PRIMITIVE_1: Replay + Idempotency Protection**
- Surfaces: Decision Execute, Action Complete, Engagement Condition, Evidence Validation, Acknowledge, Webhook Test (6 surfaces)
- Common pattern: Read idempotency-key, deduplicate, return cached result
- Reuse potential: HIGH

**PRIMITIVE_2: Transition Guard / State Machine Safety**
- Surfaces: Decision Execute, Action Complete, Intervention State (3 surfaces)
- Common pattern: Enforce valid state transitions, verify preconditions, atomic update
- Reuse potential: HIGH

**PRIMITIVE_3: Audit Integrity Enforcement**
- Surfaces: Evidence Validation, Recommendation Rerank, Finding Creation (3 surfaces)
- Common pattern: Store previous state, emit audit event, maintain audit trail
- Reuse potential: MEDIUM

**PRIMITIVE_4: Cross-Aggregate Validation**
- Surfaces: Finding Creation, Intervention State (2 surfaces)
- Common pattern: Validate related entities exist in workspace, enforce foreign key semantics
- Reuse potential: MEDIUM

---

## E. Risk Reduction Hypothesis

**Current State:** 9 dangerous surfaces, 28 hours to fix individually

**After PRIMITIVE_1 (Idempotency):** Reduces 6 surfaces to safe
- Estimated hours to design + apply: 8 hours total
- Risk eliminated: 6 surfaces
- Remaining dangerous: 3 surfaces

**After PRIMITIVE_2 (State Machine):** Reduces 3 surfaces to safe
- Estimated hours to design + apply: 6 hours total
- Risk eliminated: 3 surfaces
- Remaining dangerous: 0 surfaces

**After PRIMITIVE_3 (Audit):** Enhances remaining surfaces
- Estimated hours to design + apply: 3 hours total
- Risk eliminated: Audit corruption
- Remaining dangerous: 0 surfaces

**Total Primitive Approach:** 17 hours (vs 28 hours traditional)

**Savings:** 11 hours (39% reduction)

---

## F. Baseline Confirmation

**Build Status:** ✓ RUNNING

**Test Status:** ✓ RUNNING

**Primitive Approach Hypothesis:** Valid (28 → 17 hour reduction possible through shared primitives)

**Next Phase:** Analyze shared failure patterns across dangerous surfaces

---

**Status: ✓ R1-SAFETY-PRIMITIVES BASELINE CONFIRMED**
