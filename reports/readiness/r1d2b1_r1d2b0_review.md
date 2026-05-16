# R1-D2-B1: R1-D2-B0 Selection Review

**Date:** 2026-05-16  
**Phase:** R1-D2-B1 Planning (Batch Selection Narrowing)  
**Status:** R1-D2-B0 REQUIRES REVISION

---

## A. R1-D2-B0 Selection Summary

**Batch Size:** 12 routes  
**Selection Status:** REJECTED AS TOO BROAD  

### Selected Routes (R1-D2-B0)

1. src/app/api/governance/metrics/route.ts (GET)
2. src/app/api/growth/acquisition-metrics/route.ts (GET)
3. src/app/api/growth/offers/route.ts (GET)
4. src/app/api/growth/pricing-tiers/route.ts (GET)
5. src/app/api/growth/retention-metrics/route.ts (GET)
6. src/app/api/growth/sales-pipeline/route.ts (GET)
7. src/app/api/growth/unit-economics/route.ts (GET)
8. src/app/api/metrics/control-effectiveness/route.ts (GET)
9. src/app/api/metrics/decision-latency/route.ts (GET)
10. **src/app/api/webhooks/[id]/test/route.ts (POST)** ← PROBLEMATIC
11. **src/app/api/webhooks/stripe/route.ts (POST)** ← PROBLEMATIC
12. **src/app/api/webhooks/subscribe/route.ts (POST)** ← PROBLEMATIC

---

## B. R1-D2-B0 Rejection Reasons

### Issue 1: Batch Size Exceeds Maximum

**Constraint:** Maximum safe batch size is 8 routes  
**R1-D2-B0 Size:** 12 routes  
**Excess:** 4 routes over limit  

**Reasoning:** Smaller batches have better testability and rollback control. 12 routes introduces too much change surface area in a single phase.

**Decision:** Narrow to maximum 8 routes

---

### Issue 2: Webhook Routes Are Not Route-Only

**Routes Included:**
- src/app/api/webhooks/[id]/test/route.ts (POST)
- src/app/api/webhooks/stripe/route.ts (POST)
- src/app/api/webhooks/subscribe/route.ts (POST)

**Problem:** Webhook routes have distinct semantics:
- Webhook signature verification (Stripe webhook validation)
- Webhook idempotency requirements (duplicate submission protection)
- Webhook event processing (asynchronous handling)
- Payment system integration (not just route-only)

**Category Mismatch:** Webhooks are payment/event infrastructure, not generic route-only patterns

**Separation Principle:** Webhook routes should be grouped with payment semantics audit, not generic route modernization

**Decision:** Exclude all webhook routes from R1-D2-B; defer to R1-WEBHOOK-0 (payment/webhook semantics phase)

---

### Issue 3: Webhook Routes Require Separate Audit

**R1-WEBHOOK-0 Phase Needed:**
- Webhook signature verification patterns
- Payment system integration semantics
- Event idempotency and duplicate handling
- Stripe/payment provider integration
- Webhook test harness patterns

**Scope:** Webhooks are distinct from generic route modernization

**Decision:** Create R1-WEBHOOK-0 planning phase for webhook-specific patterns

---

## C. R1-D2-B1 Revised Selection Criteria

### Allowed Candidates (9 Metrics/Growth Routes)

1. src/app/api/governance/metrics/route.ts (GET) ✓
2. src/app/api/growth/acquisition-metrics/route.ts (GET) ✓
3. src/app/api/growth/offers/route.ts (GET) ✓
4. src/app/api/growth/pricing-tiers/route.ts (GET) ✓
5. src/app/api/growth/retention-metrics/route.ts (GET) ✓
6. src/app/api/growth/sales-pipeline/route.ts (GET) ✓
7. src/app/api/growth/unit-economics/route.ts (GET) ✓
8. src/app/api/metrics/control-effectiveness/route.ts (GET) ✓
9. src/app/api/metrics/decision-latency/route.ts (GET) ✓

**Selection Rule for R1-D2-B:**
- Choose best 5-8 from these 9 candidates
- All are read-only GET handlers
- All are metrics/growth/intelligence data
- All are route-only (no service coupling)
- All are LOW complexity

### Forbidden Candidates (3 Webhook Routes)

1. ✗ src/app/api/webhooks/[id]/test/route.ts (POST) - Webhook pattern
2. ✗ src/app/api/webhooks/stripe/route.ts (POST) - Payment integration
3. ✗ src/app/api/webhooks/subscribe/route.ts (POST) - Event subscription

**Decision:** DEFER ALL WEBHOOK ROUTES TO R1-WEBHOOK-0

---

## D. R1-D2-B Implementation Status

### Authorization Status

**Current:** NOT AUTHORIZED (R1-D2-B0 batch too broad)  
**Required:** Narrow to 5-8 metrics/growth routes only  
**Webhook Routes:** Deferred to R1-WEBHOOK-0 planning  

### Next Phase (R1-D2-B1)

**Purpose:** Narrow batch selection  
**Expected Outcome:** Select maximum 8 routes (all metrics/growth, no webhooks)  
**Expected Violations:** 32-40 (8 routes × 4-5 violations each)  
**Implementation:** Will be authorized after R1-D2-B1 completes  

---

## E. R1-WEBHOOK-0 Phase

### Purpose

Audit and plan webhook-specific route modernization:
- Webhook signature verification patterns
- Stripe webhook integration
- Webhook idempotency handling
- Event processing semantics
- Webhook test harness patterns

### Routes in R1-WEBHOOK-0

1. src/app/api/webhooks/[id]/test/route.ts
2. src/app/api/webhooks/stripe/route.ts
3. src/app/api/webhooks/subscribe/route.ts

### Timeline

**Depends On:** Nothing (independent track)  
**Can Start:** Immediately after R1-D2-B0 revision  
**Deliverables:** Webhook pattern audit, safe modernization plan  

---

**Status: ✓ R1-D2-B0 REVISION COMPLETE - PROCEED TO R1-D2-B1 NARROWING**
