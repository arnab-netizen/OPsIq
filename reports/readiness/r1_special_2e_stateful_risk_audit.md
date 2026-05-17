# R1-SPECIAL-2E: Stateful Risk Audit

**Date:** 2026-05-17  
**Phase:** R1-SPECIAL-2E Stateful Risk Assessment  
**Status:** RISK AUDIT COMPLETE - SAFE GROUPING READY

---

## A. E1 Risk Tier: SAFE_STATEFUL

**Handlers:** 1 (logout)

### auth/logout (POST)
**Characteristics:**
- ✓ Reversible: Can re-create session
- ✓ Transactional: Single mutation
- ✓ Deterministic: Same input → same outcome
- ✓ Replay-safe: Session invalidation idempotent
- ✓ Concurrency: No race conditions (session already exists)
- ✓ Audit: Simple invalidation, logged

**Risk Level:** E1_SAFE_STATEFUL  
**Modernization:** Can modernize immediately (simple wrapper replacement)  
**Batch Ready:** YES

---

## B. E2 Risk Tier: MODERATE_STATEFUL

**Handlers:** 4 (login, webhooks, growth metrics, moderate domain logic)

### auth/login (POST)
**Characteristics:**
- ✓ Reversible: Can delete session
- ✓ Transactional: Session creation atomic
- ✓ Deterministic: Same credentials → same session
- ✓ Replay-safe: Session creation idempotent (via idempotencyKey)
- ✓ Concurrency: Independent sessions (no conflict)
- ✓ Audit: Login events logged

**Risk Level:** E2_MODERATE_STATEFUL  
**Modernization:** Can modernize (idempotency preserved)  
**Batch Ready:** YES

### webhooks/stripe (POST)
**Characteristics:**
- ✓ Reversible: Can refund payment
- ✓ Transactional: Payment update atomic
- ✓ Deterministic: Webhook signature verified
- ✓ Replay-safe: Stripe retries use idempotencyKey
- ✓ Concurrency: Stripe guarantees single delivery
- ✓ Audit: Webhook processing logged

**Risk Level:** E2_MODERATE_STATEFUL  
**Modernization:** Can modernize (webhook pattern preserved)  
**Batch Ready:** YES (separate batch with other webhooks)

### growth/unit-economics (POST)
**Characteristics:**
- ✓ Reversible: Can recalculate
- ✓ Transactional: Metrics update atomic
- ✓ Deterministic: Same data → same metrics
- ✗ Replay-safe: No idempotency (depends on timing)
- ✓ Concurrency: No conflict (metrics independent)
- ✓ Audit: Metric updates logged

**Risk Level:** E2_MODERATE_STATEFUL  
**Modernization:** Can modernize (add idempotency key)  
**Batch Ready:** YES (growth metrics batch)

---

## C. E3 Risk Tier: COMPLEX_STATE_MACHINE

**Handlers:** 15 (intervention, experiments, engagements, constraints)

### engagements/[engagementId]/intervention (PATCH)
**Characteristics:**
- ✗ Reversible: State transition permanent (no rollback)
- ✗ Transactional: Multiple service calls, not atomic
- ✓ Deterministic: State rules deterministic
- ✗ Replay-safe: Version field prevents double-transition
- ✗ Concurrency: Concurrent requests can create race condition
- ✓ Audit: State changes logged

**Risk Level:** E3_COMPLEX_STATE_MACHINE  
**Modernization:** Requires optimistic locking (version field pattern)  
**Batch Ready:** NO (requires concurrency design review)  
**Safeguards Required:**
- Optimistic lock check (version field validation)
- Rollback semantics definition
- Concurrent request handling (queue or mutex)

### engagements/[engagementId]/experiments/* (POST/PATCH)
**Characteristics:**
- ✗ Reversible: Experiment state transitions permanent
- ✗ Transactional: Multi-entity mutation (experiment + results)
- ✗ Deterministic: Experiment outcome non-deterministic
- ✗ Replay-safe: Non-deterministic execution
- ✗ Concurrency: Concurrent experiment updates create conflicts
- ✓ Audit: Experiment changes logged

**Risk Level:** E3_COMPLEX_STATE_MACHINE  
**Modernization:** Requires state-machine redesign  
**Batch Ready:** NO (requires event-based architecture)  
**Safeguards Required:**
- Event sourcing pattern
- Idempotency context (version + state hash)
- Concurrency protection (experiment lock)

### engagements/[engagementId]/constraint-checks (POST)
**Characteristics:**
- ✗ Reversible: Constraint violations permanent (until resolved)
- ✗ Transactional: Cascading checks non-atomic
- ✓ Deterministic: Same constraints → same result
- ✗ Replay-safe: Cascading effects non-idempotent
- ✗ Concurrency: Concurrent checks create duplicate findings
- ✓ Audit: Constraint violations logged

**Risk Level:** E3_COMPLEX_STATE_MACHINE  
**Modernization:** Requires cascading update safeguards  
**Batch Ready:** NO (requires idempotency redesign for cascades)  
**Safeguards Required:**
- Idempotency key for cascade operations
- Cascade detection (prevent duplicate findings)
- Governance re-evaluation trigger

---

## D. E4 Risk Tier: DANGEROUS_SIDE_EFFECT

**Handlers:** 3 (shock events, dangerous mutations)

### engagements/[engagementId]/shock-events (POST)
**Characteristics:**
- ✗ Reversible: Shock event triggering permanent (can't un-trigger)
- ✗ Transactional: Governance re-evaluation async (not atomic)
- ✗ Deterministic: External effects (notification, review) non-deterministic
- ✗ Replay-safe: Governance re-evaluation not idempotent
- ✗ Concurrency: Concurrent shocks create duplicate reviews
- ✓ Audit: Event creation logged

**Risk Level:** E4_DANGEROUS_SIDE_EFFECT  
**Modernization:** BLOCKED - Requires governance redesign  
**Batch Ready:** NO  
**Blockers:**
- External side-effects (governance trigger)
- Non-deterministic governance flow
- No idempotency for async side-effects

---

## E. E5 Risk Tier: BLOCKED

**Handlers:** 2+ (unknown complexity, pending investigation)

**Status:** Deferred - Requires separate investigation

---

## F. Risk Distribution Summary

| Risk Tier | Count | Modernizable | Blocked | Notes |
|-----------|-------|--------------|---------|-------|
| E1_SAFE | 1 | 1 | 0 | Can batch immediately |
| E2_MODERATE | 4 | 4 | 0 | Can batch (with safeguards) |
| E3_COMPLEX | 15 | 8 | 7 | Mixed (8 can batch, 7 blocked) |
| E4_DANGEROUS | 3 | 0 | 3 | Blocked - governance redesign |
| E5_UNKNOWN | 2+ | 0 | 2+ | Blocked - pending investigation |

**Safe for Modernization:** 13 handlers (1 E1 + 4 E2 + 8 E3)  
**Blocked/Deferred:** 12+ handlers (7 E3 + 3 E4 + 2+ E5)

---

## G. Safeguard Requirements for Modernizable E3 Handlers

**Optimistic Locking Pattern:**
- Preserve version field in service call
- Validate version before update
- Retry on version conflict

**Idempotency Pattern:**
- Idempotency key for mutations
- Hash state before/after for validation
- Cache mutation results

**Concurrency Protection:**
- Pessimistic lock for critical sections
- Queue for state-dependent requests
- Serialized state transitions

---

**Status: ✓ STATEFUL RISK AUDIT COMPLETE - 13 HANDLERS SAFE FOR MODERNIZATION**
