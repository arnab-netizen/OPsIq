# R1-SAFETY-PRIMITIVES: Execution Order

**Date:** 2026-05-18  
**Phase:** R1-SAFETY-PRIMITIVES Execution Order  
**Status:** ✓ EXECUTION ORDER DETERMINED

---

## A. Execution Strategy Options

### Option A: Safest-Path-First (Eliminate Highest-Risk First)

```
1. PRIMITIVE_2 (State Machine) - 8 hours
   → Fixes: Decision Execute (highest business risk)
   
2. PRIMITIVE_1 (Idempotency) - 5 hours
   → Fixes: Action Complete, Engagement Condition, + 3 others
   
3. PRIMITIVE_4 (Cross-Aggregate) - 6.5 hours
   → Fixes: Finding Creation, Intervention State
   
4. PRIMITIVE_3 (Audit) - 6 hours
   → Compliance/audit trail

Total: 25.5 hours
```

**Pros:** Highest business-critical surface fixed first  
**Cons:** Slower overall risk reduction, state machine is complex to implement first

---

### Option B: Highest-ROI-First (Primitives That Fix Most Surfaces)

```
1. PRIMITIVE_1 (Idempotency) - 5 hours
   → Fixes: 6 surfaces (Acknowledge, Webhook Test, Evidence Validation, + 3 others)
   → Each surface takes 0.5 hours to apply
   
2. PRIMITIVE_2 (State Machine) - 8 hours
   → Fixes: 3 surfaces (Decision Execute, Action Complete, Intervention State + Condition)
   
3. PRIMITIVE_4 (Cross-Aggregate) - 6.5 hours
   → Fixes: 2 surfaces (Finding Creation, Intervention State)
   
4. PRIMITIVE_3 (Audit) - 6 hours
   → Compliance/audit trail

Total: 25.5 hours
```

**Pros:** Faster bulk risk reduction, idempotency is simpler to implement  
**Cons:** Doesn't directly fix highest-business-risk surfaces first

---

### Option C: MINIMUM-FOR-BETA (Just Enough for Safe Launch)

```
GOAL: Make beta launch safe with minimum work

Dangerous surfaces that MUST close before beta:
  - Decision Execute (HIGH)
  - Action Complete (HIGH)
  - Engagement Condition (HIGH)
  - Intervention State (HIGH)

Can defer to post-beta:
  - Evidence Validation (MEDIUM)
  - Finding Creation (MEDIUM)
  - Recommendation Rerank (MEDIUM)
  - Engagement Acknowledge (LOW)
  - Webhook Test (LOW)

MINIMUM PRIMITIVES:
  1. PRIMITIVE_1 (Idempotency) - 5 hours
     → Fixes Decision Execute, Action Complete, Engagement Condition
     
  2. PRIMITIVE_2 (State Machine) - 8 hours
     → Fixes Decision Execute, Action Complete, Intervention State
     
  3. Application to 4 HIGH surfaces - 2 hours
  
Application Sequence:
  - Week 0: Implement PRIMITIVE_1 (5h)
  - Week 0-1: Implement PRIMITIVE_2 (8h)
  - Week 1: Apply to 4 HIGH surfaces (2h)
  - Week 1: Beta ready

TOTAL: 15 hours (vs 28 individual fixes)

SAVINGS: 13 hours

Risk eliminated: 100% of HIGH surfaces (beta-blocking surfaces)
Risk remaining: MEDIUM + LOW surfaces (post-beta acceptable)
```

**Pros:** Minimum work for beta readiness, 13-hour savings, fast launch  
**Cons:** Still leaves 5 MEDIUM/LOW surfaces for post-beta

---

### Option D: FULL COVERAGE (All 9 Surfaces, All Primitives)

```
1. PRIMITIVE_1 (Idempotency) - 5 hours
2. PRIMITIVE_2 (State Machine) - 8 hours
3. PRIMITIVE_4 (Cross-Aggregate) - 6.5 hours
4. PRIMITIVE_3 (Audit Integrity) - 6 hours
5. Application to 9 surfaces - 4.5 hours

TOTAL: 30 hours

Risk eliminated: 100% of dangerous surfaces
Risk remaining: 0 (all surfaces safe)
```

---

## B. Recommended Strategy: OPTION C + PROGRESSIVE

**Why:** 
- Achieves beta readiness fastest (15 hours)
- Saves most engineering time (13 hours)
- Allows post-beta completion of MEDIUM surfaces
- Provides clear stages for testing/validation

**Execution Plan:**

### STAGE 1: Primitive Infrastructure (Weeks 0-1)

**Week 0: PRIMITIVE_1 (Idempotency) - 5 hours**
```
Day 1-2: Design + implement atomicIdempotent function (2.5h)
Day 2-3: Implement middleware + dedup store (1.5h)
Day 3: Unit + integration tests (1h)

Deliverables:
  - src/lib/primitives/idempotency.ts
  - src/lib/middleware/apply-idempotency.ts
  - Unit tests for dedup logic
  - Integration tests with cache layer

Risk Reduction: ~40% (6 surfaces immediately safer)
```

**Week 0-1: PRIMITIVE_2 (State Machine) - 8 hours**
```
Day 1-2: Design state machine engine + registry (2h)
Day 2-3: Implement enforceTransition + preconditions (2h)
Day 3-4: Define decision/action/intervention state machines (2h)
Day 4-5: Tests (2h)

Deliverables:
  - src/lib/primitives/state-machine.ts
  - src/lib/primitives/machines/*.ts (decision, action, intervention)
  - Tests

Risk Reduction: Additional ~40% (4 HIGH surfaces now safe)
Total Risk Reduction: ~80% (10 of 12 blocker + high surfaces)
```

### STAGE 2: Application to Dangerous Surfaces (Week 1)

**Apply Primitives to 4 HIGH Surfaces - 2 hours**
```
Decision Execute (0.5h):
  - Wrap with withIdempotency
  - Define state machine: DRAFT → PENDING → APPROVED → EXECUTED
  - Done

Action Complete (0.5h):
  - Wrap with withIdempotency
  - Define state machine: PENDING → COMPLETED
  - Done

Engagement Condition (0.5h):
  - Wrap with withIdempotency
  - Define state machine with phase-scoped loop prevention
  - Done

Intervention State (0.5h):
  - Apply state machine with cascade validation
  - Done

Deliverables:
  - 4 modified route handlers
  - Integrated primitives

Risk Reduction: Total 100% of HIGH surfaces (beta-blocking)
```

### STAGE 3: Validation & Beta (Week 1)

```
Integration testing:
  - Duplicate request scenarios
  - State machine enforcement
  - Workspace isolation
  - Audit trail

Beta Launch: ✓ READY

Metrics:
  - Engineering hours: 15 hours
  - Risk eliminated: 100% of HIGH surfaces
  - Engineering time saved vs individual fixes: 13 hours
```

### STAGE 4: Post-Beta Completion (Weeks 2-3)

**PRIMITIVE_4 (Cross-Aggregate) - 6.5 hours**
```
Week 2: Implement cross-aggregate validator
        Apply to Finding Creation + Intervention State

Risk Reduction: MEDIUM surfaces
```

**PRIMITIVE_3 (Audit Integrity) - 6 hours**
```
Week 2-3: Implement audit trail infrastructure
          Integrate into all dangerous surfaces

Risk Reduction: Full compliance + audit trail
```

**Application to MEDIUM + LOW surfaces - 2.5 hours**
```
Evidence Validation (0.5h)
Recommendation Rerank (0.5h)
Finding Creation (0.5h)
Engagement Acknowledge (0.5h)
Webhook Test (0.5h)
```

**Total Post-Beta:** ~15 hours over 2-3 weeks

**Timeline Summary:**
- **Week 0-1:** 15 hours (PRIMITIVE_1 + PRIMITIVE_2 + application) → Beta ready
- **Weeks 2-3:** 15 hours (PRIMITIVE_3 + PRIMITIVE_4 + remaining applications) → Full coverage

---

## C. Timeline to Launch Readiness

### Beta Launch Readiness

**Status:** ✓ **READY** (after Stage 1-2, 15 hours)

**Dangerous Surfaces Safe:** 4 HIGH surfaces (Decision Execute, Action Complete, Engagement Condition, Intervention State)

**Dangerous Surfaces Remaining:** 5 (3 MEDIUM + 2 LOW, acceptable for controlled beta)

**Timeline:** 2 weeks (weeks 0-1)

**Engineering Cost:** 15 hours

---

### Paid Launch Readiness

**Status:** ✗ **NOT READY** (without additional primitives)

**If pursuing minimum (Option C):**
- Requires PRIMITIVE_4 (Cross-Aggregate) + PRIMITIVE_3 (Audit)
- Additional 12 hours
- Total 27 hours to paid readiness
- Timeline: 3-4 weeks total

**If already investing 30 hours for full primitives:**
- ✓ READY after 30 hours
- Timeline: 2-3 weeks
- All 9 surfaces safe

**Recommendation:** If committing to 15 hours for beta, finish all 4 primitives (30 hours) for paid
- Extra 15 hours unlocks full safety coverage
- Avoids rework
- Better long-term infrastructure

---

### Enterprise Launch Readiness

**Status:** ✓ **READY** (after all primitives)

**Audit Compliance:** Full audit trail (PRIMITIVE_3)
**Data Integrity:** Cross-aggregate validation (PRIMITIVE_4)
**Enterprise-Grade:** All surfaces idempotent + state-safe + audited

---

## D. Resource Plan by Option

### Option C (Minimum for Beta)

```
Week 0:     5 hours (PRIMITIVE_1 implementation)
Week 0-1:   8 hours (PRIMITIVE_2 implementation)
Week 1:     2 hours (application to HIGH surfaces)

Total: 15 hours (1 engineer, 2 weeks)

Then post-beta:
Week 2-3:   15 hours (PRIMITIVE_3 + PRIMITIVE_4 + remaining applications)

Total lifecycle: 30 hours (2-3 engineers, 4 weeks)
```

### Option D (Full Coverage from Start)

```
Week 0:     5 hours (PRIMITIVE_1)
Week 0-1:   8 hours (PRIMITIVE_2)
Week 1-2:   6.5 hours (PRIMITIVE_4)
Week 2:     6 hours (PRIMITIVE_3)
Week 2:     4.5 hours (application to all 9 surfaces)

Total: 30 hours (1-2 engineers, 3 weeks)

Benefit: All dangerous surfaces safe before beta
```

---

## E. Risk Reduction by Milestone

| Milestone | Work | Surfaces Safe | Risk Eliminated | Remaining Risk |
|-----------|------|---------------|-----------------|-----------------|
| **Week 0 (5h)** | PRIMITIVE_1 | 6 surfaces | ~40% | 5 surfaces |
| **Week 0-1 (13h)** | +PRIMITIVE_2 | 10 surfaces | ~80% | 2 surfaces (plus 5 already counted) |
| **Week 1 (15h)** | +Application | 4 HIGH surfaces | ✓ 100% HIGH | ✓ BETA READY |
| **Week 2 (21.5h)** | +PRIMITIVE_4 | 2 more surfaces | ✓ 100% HIGH+MEDIUM | ✓ PAID READY |
| **Week 2-3 (30h)** | +PRIMITIVE_3+App | 9 surfaces | ✓ 100% ALL | ✓ ENTERPRISE READY |

---

## F. Critical Success Factors

### Week 0-1 (Primitives)
- [ ] Idempotency infrastructure solid (test concurrent requests)
- [ ] State machine registry complete (all transitions defined)
- [ ] Both primitives thoroughly tested before surface application

### Week 1 (Surface Application)
- [ ] Decision Execute handler integrated successfully
- [ ] Action Complete handler integrated successfully
- [ ] Engagement Condition loop prevention working
- [ ] Intervention State cascade safe
- [ ] Integration tests pass

### Week 1 (Beta Launch Gate)
- [ ] All HIGH surfaces verified safe
- [ ] Monitoring alerts configured
- [ ] Backup/rollback plan ready
- [ ] Payment flow tested with primitives

---

## G. Recommended Path Forward

**RECOMMENDATION: Option C (Minimum for Beta) + Commit to Full Coverage**

**Reasoning:**
1. **Fastest beta launch:** 15 hours gets to safe beta (2 weeks)
2. **Clear stage gates:** Primitive infrastructure → Application → Beta → Expansion
3. **Risk management:** Don't discover issues late (full testing before beta)
4. **Long-term value:** Plan for all 4 primitives from start (avoid rework)
5. **Resource efficiency:** Primitives are infrastructure, pay once, use forever

**Execution:**
- **Week 0-1:** Build PRIMITIVE_1 + PRIMITIVE_2 + apply to 4 HIGH surfaces (15 hours)
- **Week 1:** Beta launch with ✓ 100% HIGH surface safety
- **Week 2-3:** Expand PRIMITIVE_3 + PRIMITIVE_4 for paid launch (15 hours)
- **Week 3:** Paid launch with ✓ 100% surface safety

**Total Investment:** 30 hours  
**Beta Readiness:** 2 weeks  
**Paid Readiness:** 3-4 weeks  
**Risk Reduction:** 0% → 100% over 4 weeks

---

**Status: ✓ R1-SAFETY-PRIMITIVES EXECUTION ORDER COMPLETE**

**Key Decision:**
- ✓ **PRIMITIVE_1 (Idempotency) first** - 5 hours, highest immediate impact
- ✓ **PRIMITIVE_2 (State Machine) second** - 8 hours, enables 4 HIGH surfaces
- ✓ **PRIMITIVES_3+4 (Audit + Cross-Aggregate) post-beta** - 12.5 hours, compliance/robustness

**Recommended Timeline:**
- Week 0-1: 15 hours (beta ready)
- Week 2-3: 15 hours (paid + enterprise ready)
