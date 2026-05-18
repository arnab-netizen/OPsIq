# R1-SPECIAL-2E: Webhook Isolation Decision

**Date:** 2026-05-18  
**Phase:** R1-SPECIAL-2E Webhook Isolation Assessment  
**Status:** ✓ ANALYSIS COMPLETE - DECISION READY

---

## A. Webhook Handlers Under Analysis

**GROUP_3_WEBHOOKS (2 handlers):**
1. src/app/api/webhooks/stripe (POST)
2. src/app/api/webhooks/subscribe (POST)

**Estimated Violation Reduction:** 6 violations (4 critical, 2 block-build)

---

## B. Webhook Characteristics & Risks

### 1. External System Integration

**Current Model:**
- Stripe sends webhook event to webhooks/stripe endpoint
- Subscribe system sends webhook to webhooks/subscribe endpoint
- Both are idempotent by design (external UUID prevents duplicates)

**Isolation Concerns:**
- External system sends events asynchronously
- No control over retry timing (Stripe retries on 5xx)
- No control over event ordering (if multiple events)
- Cannot validate external system behavior

**Assessment:**
- Risk: MODERATE (external system beyond our control)
- Mitigation: Signature verification + idempotency UUID tracking
- Isolation Impact: Modernization cannot eliminate external risk
- Recommendation: Not a blocking concern for modernization

---

### 2. Idempotency Model

**Current Implementation:**
```
Stripe webhook → stripe ID (UUID) → idempotency check → deduplication
Subscribe webhook → event UUID → idempotency check → deduplication
```

**Pre-Modernization:**
- Idempotency: Handled by service (UUID-based deduplication)
- Handler responsibility: Call service, pass webhook data
- Risk: If duplicate event received, service handles replay

**Post-Modernization:**
- Idempotency: Same service-level deduplication
- Handler responsibility: UNCHANGED (call service)
- Context change: Verified actor instead of unverified session
- Preservation: ✓ Idempotency model unchanged

**Assessment:**
- Risk: LOW (idempotency not dependent on handler modernization)
- Mitigation: Service-level deduplication preserved
- Isolation Impact: Safe to modernize
- Recommendation: No isolation required for idempotency

---

### 3. Replay Safety

**Replay Scenario:**
- Event received → processed → database updated
- Event replayed (duplicate UUID) → service deduplication prevents re-processing
- Result: Idempotent (no double-charge)

**Pre-Modernization:**
- Handler receives request
- Handler calls service with unverified session
- Service checks UUID, deduplicates
- Risk: Unverified actor in request context

**Post-Modernization:**
- Wrapper verifies actor (if needed)
- Handler receives request with verified context
- Handler calls service with verified context
- Service checks UUID, deduplicates
- Risk: ELIMINATED (actor verified by wrapper)

**Assessment:**
- Replay safety: IMPROVED (verified actor prevents spoofing)
- Risk: REDUCED (not increased by modernization)
- Isolation Impact: Safe to modernize
- Recommendation: Modernization strengthens replay safety

---

### 4. Signature Verification

**Current Model:**
```
Webhook signature verification → (Stripe HMAC, custom signature)
Signature validation → error if invalid
```

**Preservation Requirement:**
- Signature verification must be preserved exactly
- Location: Handler-level (before processing)
- Dependency: On HTTP headers (x-stripe-signature, x-subscribe-signature)

**Pre-Modernization:**
- Handler extracts headers
- Handler verifies signature
- Handler processes if valid

**Post-Modernization:**
- Wrapper provides ctx.request (with headers)
- Handler extracts headers from ctx.request
- Handler verifies signature (unchanged)
- Handler processes if valid

**Implementation Detail:**
```typescript
// Before:
const signature = request.headers.get("x-stripe-signature");

// After:
const signature = ctx.request?.headers.get("x-stripe-signature");
```

**Preservation:** ✓ MAINTAINED (headers still accessible via context)

**Assessment:**
- Signature verification: Fully preservable
- Risk: LOW (straightforward header access change)
- Isolation Impact: No isolation needed
- Recommendation: Safe to modernize

---

### 5. External Notification Side-Effects

**Current Model:**
```
Webhook received → payment processed → customer notified → email/SMS sent
```

**Service Responsibilities:**
- Payment processing (local database)
- Notification triggering (external service call)
- Audit logging (local audit table)

**Handler Responsibilities:**
- Authorization (wrapper will handle)
- Validation (handler preserves)
- Service invocation (handler preserves)

**Pre-Modernization:**
- Handler calls service
- Service triggers notifications
- Handler doesn't control notification timing

**Post-Modernization:**
- Handler calls service (unchanged)
- Service triggers notifications (unchanged)
- Handler doesn't control notification timing (unchanged)

**Preservation:** ✓ MAINTAINED (service controls notifications, not handler)

**Assessment:**
- Notification side-effects: Unchanged by handler modernization
- Risk: NOT INCREASED by modernization
- Isolation Impact: No isolation needed for side-effects
- Recommendation: Safe to modernize

---

## C. Webhook-Specific Modernization Challenges

### Challenge 1: Wrapper Capability Enforcement

**Question:** Should webhooks require user capability checking?

**Current Model:**
```
Webhook arrives from external system (no user context)
Handler processes on behalf of system (not user)
Capability check: Not applicable (no user to check)
```

**Modernization Question:**
```
withCanonicalEnforcement requires verified actor
But webhook has no actor (external system triggered)
Should wrapper skip actor verification for webhooks?
```

**Resolution:**
- Option A: Webhook endpoints don't use withCanonicalEnforcement (use old wrapper)
- Option B: withCanonicalEnforcement allows "system" actor for webhooks
- Option C: Webhooks get dedicated wrapper (webhook-specific enforcement)

**Recommendation:**
- Webhooks should be handled by webhook-specific enforcement, not generic wrapper
- Reason: External system trigger, not user-triggered
- Impact: Webhook isolation might be needed for different wrapper
- Decision: Pending architecture review

---

### Challenge 2: Workspace Context

**Question:** Webhook events - which workspace do they belong to?

**Current Model:**
```
Stripe webhook → sent to endpoint (workspace determined by context)
Handler determines workspace (from context)
Service uses workspace for routing
```

**Modernization Question:**
```
Wrapper requires verified workspace (ctx.verifiedWorkspaceId)
But webhook doesn't carry workspace (external system)
How to determine workspace for webhook?
```

**Resolution:**
- Workspace must be extracted from webhook data (Stripe account, subscription, etc.)
- Not from request headers (external system doesn't provide)
- Handler extracts workspace from webhook payload
- Wrapper doesn't provide workspace verification

**Recommendation:**
- Webhook workspace handling: Extract from payload, not wrapper
- Wrapper might need to be optional for webhooks
- Impact: Webhook isolation for custom wrapper logic
- Decision: Pending architecture review

---

## D. Integration Assessment

### With withCanonicalEnforcement Wrapper

**Can webhooks use the standard wrapper?** UNCERTAIN
- Reason 1: No user actor to verify
- Reason 2: No workspace header (must extract from payload)
- Reason 3: Signature verification is pre-processing step

**Option 1: Exclude webhooks from standard wrapper**
- Use: Legacy wrapper for webhooks (or new webhook wrapper)
- Impact: Webhooks stay on old pattern
- Result: Violations for webhooks remain (not reduced)
- Benefit: No risk of webhook breaking changes
- Risk: Webhook handlers remain unmodernized

**Option 2: Create webhook-specific wrapper**
- Use: New wrapper designed for webhook patterns
- Impact: Webhooks modernize with custom enforcement
- Result: Violations reduced (+6)
- Benefit: Webhooks modernized safely
- Risk: Requires new wrapper implementation

**Option 3: Adapt standard wrapper for webhooks**
- Use: Optional actor/workspace in withCanonicalEnforcement
- Impact: Webhooks use standard wrapper with different options
- Result: Violations reduced (+6)
- Benefit: Single wrapper, multiple patterns
- Risk: Adds complexity to standard wrapper

---

## E. Private Beta Implications

**Current Violations:** 215 (down from 260 starting)

**Webhook Group Impact:**
- If included in modernization: 215 - 6 = 209 violations
- If deferred: 215 violations (no reduction)
- Gap to <150: 59 vs 65 violations

**Private Beta Readiness:**
- With webhooks modernized: 209 violations
- Without webhooks modernized: 215 violations
- Difference: 6 violations (2.8% of current violations)

**Assessment:**
- Webhooks contribute 2.8% to violation count
- Webhooks are E2 tier (acceptable for beta)
- Webhooks have external effects (notification risk)
- Webhooks require wrapper integration (architecture decision)

---

## F. Modernization Strategy Decision

### Path A: Modernize Webhooks Now

**Pros:**
- Reduces violations by 6 (-2.8%)
- Strengthens security (verified actor, signature verification)
- Proven pattern (growth metrics batch used similar approach)
- Reduces technical debt early

**Cons:**
- Requires wrapper adaptation (custom options or new wrapper)
- Adds architectural complexity
- External system risk (Stripe retries, async events)
- Requires integration testing with webhook signature verification

**Recommendation:** IF feasible within 2-3 hours

---

### Path B: Defer Webhooks to Post-Beta

**Pros:**
- Reduces architectural complexity now
- Allows focus on simpler batches (auth handlers)
- Webhooks can be addressed post-beta
- Less risk to critical payment flow

**Cons:**
- Leaves 6 violations unresolved pre-beta
- Webhook handlers remain on legacy pattern
- Webhook security posture stays lower

**Recommendation:** IF integration requires significant work

---

## G. Technical Feasibility Assessment

**Time Estimate for Webhook Modernization:**
1. Create webhook-specific wrapper: 2-3 hours
2. Modernize stripe endpoint: 1 hour
3. Modernize subscribe endpoint: 1 hour
4. Test signature verification: 1-2 hours
5. Integration testing: 1-2 hours
6. Total: 6-9 hours

**Complexity Assessment:**
- Signature verification: STRAIGHTFORWARD (header access unchanged)
- Workspace extraction: STRAIGHTFORWARD (from payload)
- Idempotency: STRAIGHTFORWARD (preserved)
- Service calls: STRAIGHTFORWARD (signatures unchanged)
- Testing: MODERATE (webhook patterns, signature verification)

**Risk Assessment:**
- Breaking webhook processing: LOW (straightforward migration)
- Breaking signature verification: LOW (header access preserved)
- Breaking idempotency: LOW (service-level unchanged)
- Breaking payment flow: MODERATE (external system integration, needs testing)

---

## H. Final Decision

**Webhook Isolation Required?** YES

**Reason:** Webhooks require different enforcement pattern than user-triggered handlers

**Recommended Approach:**
1. Create webhook-specific enforcement wrapper (`withWebhookEnforcement`)
2. Keep webhooks isolated from user-triggered authentication
3. Signature verification remains handler-level (unchanged)
4. Workspace extraction from payload (handler-level)
5. Idempotency verification at service level (unchanged)

**Timeline Recommendation:**
- Option 1: Implement webhooks as Batch 4 (after auth batches 2-3)
- Option 2: Defer webhooks to post-beta
- Preferred: Option 1 (if time allows), else Option 2

**Impact on Private Beta:**
- Without webhooks: 215 violations (achievable)
- With webhooks: 209 violations (preferred if feasible)
- Either path acceptable for private beta launch

---

**Status: ✓ R1-SPECIAL-2E WEBHOOK ISOLATION DECISION COMPLETE**

**Final Recommendation:**
- Webhook isolation is achievable
- New wrapper required (webhook-specific enforcement)
- Modernization can proceed if wrapper created
- Alternative: Defer to post-beta (simpler path)
- Decision: Depends on team capacity and timeline
