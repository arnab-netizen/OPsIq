# R1-ACCEL-0R: Lane Normalization

**Date:** 2026-05-17  
**Phase:** R1-ACCEL-0R Acceleration Classification Reconciliation  
**Status:** LANE NAMING NORMALIZED

---

## A. Previous Lane Naming (R1-ACCEL-0)

**Original Classification (6 reports):**
- Lane A: SERVICE_AUTH_ENVELOPE_ADAPTER (8 routes)
- Lane B: EXISTING_CANONICAL_SERVICE_INPUT (34 routes)
- Lane C: EXISTING_SERVICE_AUTH_ENVELOPE (0 routes)
- Lane D: SERVICE_MODERNIZATION_CANDIDATE (6 routes)
- Lane E: SERVICE_DEPENDENCY_BLOCKER (4 routes)
- Lane F: COMPLEX_MUTATION_OPERATIONS (12 routes)
- Lane G: CRITICAL_BUSINESS_DATA_ROUTES (6 routes)
- Lane I: UNKNOWN_STOP (2 routes)

**Total Routes Classified:** 72
**Batch 1 Selected:** 6 routes (1 LANE_B + 5 LANE_B candidates)

---

## B. Normalized Lane Definitions

### LANE_A: EXISTING_CANONICAL_SERVICE_INPUT

**Definition:** Direct pass of CanonicalAuthContext (no adapter required)

**Service Expectation:** Service already modernized to accept CanonicalAuthContext parameter

**Route Implementation:**
- Wrapper: withCanonicalEnforcement
- Handler: async (ctx: CanonicalAuthContext, params)
- Service call: Pass ctx directly (no adapter creation)
- No adapter layer needed

**Service Signature:**
- Expect: `service(id, input, ctx: CanonicalAuthContext, workspaceId: string)`
- Not: ServiceAuthEnvelope
- Not: Legacy types (raw request, session, etc.)

**Safety Profile:** HIGH
- Proven safe: R1-SERVICE-2 (updateAction), R1-SERVICE-3 (updateClient)
- Pattern: 34 routes classified in R1-ACCEL-0 as Lane B

**Batch Eligible:** YES ✓

---

### LANE_B: SERVICE_AUTH_ENVELOPE_ADAPTER

**Definition:** Safe route adapter from CanonicalAuthContext to ServiceAuthEnvelope

**Service Expectation:** Service expects ServiceAuthEnvelope (legacy pre-modernization type)

**Route Implementation:**
- Wrapper: withCanonicalEnforcement
- Handler: async (ctx: CanonicalAuthContext, params)
- Service call: Create ServiceAuthEnvelope adapter from ctx, pass to service
- Adapter includes: verifiedActorId, verifiedActorType, verifiedWorkspaceId, verifiedCapabilities, hasInternalAccess, verifiedActor, policy
- No fallback values for critical fields

**Service Signature:**
- Expect: `service(id, input, auth: ServiceAuthEnvelope, ...)`
- Not: CanonicalAuthContext
- Not: Legacy types

**Adapter Audit:** 10/10 safety score (R1-SERVICE-1 validation)
- All 7 fields verified by wrapper
- No header extraction
- No workspace inference

**Safety Profile:** HIGH
- Proven safe: R1-SERVICE-1 (updateFinding)
- Pattern: 8 routes classified in R1-ACCEL-0 as Lane A

**Batch Eligible:** YES ✓ (if single lane, or with Lane A if service contracts confirmed)

---

### LANE_C: WORKSPACE_SEMANTICS_REQUIRED

**Definition:** Routes with unclear workspace scoping or multi-tenant boundary concerns

**Issue:** Workspace isolation not clear from route analysis

**Resolution Required:** Full audit of workspace filtering in service queries

**Examples:** Organization, Workspace, User, Role routes

**Service Signature:** Unknown (requires service audit)

**Safety Profile:** MEDIUM-LOW (requires verification)

**Batch Eligible:** NO - Requires design audit before batch

**Deferral:** Phase 2+ after core lanes complete

---

### LANE_D: POLICY_WRAPPER_REQUIRED

**Definition:** Routes requiring policy wrapper integration or capability extraction beyond standard requireCapabilities

**Issue:** Service expects policy context or custom capability checking

**Resolution Required:** Determine if policy extraction can happen at wrapper level

**Examples:** Routes calling policy-dependent services

**Service Signature:** Unknown (requires service audit)

**Safety Profile:** MEDIUM (conditional on policy wrapper capability)

**Batch Eligible:** NO - Requires policy audit before batch

**Deferral:** Phase 2+ after core lanes complete

---

### LANE_E: WEBHOOK_PAYMENT_SPECIAL

**Definition:** Routes with special event handling (webhooks) or financial transaction semantics

**Issue:** Cannot batch with standard PATCH operations; different safety model

**Examples:** Webhook handlers, payment processing routes

**Service Signature:** N/A (special event semantics)

**Safety Profile:** HIGH (special handler class), but not batchable

**Batch Eligible:** NO - Separate event handling framework

**Deferral:** Separate webhook/payment audit and implementation

---

### LANE_F: RUN_VERIFY_SPECIAL

**Definition:** Routes for execution engines (run, verify, execute handlers)

**Issue:** State machine semantics, execution guarantees, idempotency requirements

**Examples:** Decision execute, verify routes, execution handlers

**Service Signature:** Complex (state transitions, side effects)

**Safety Profile:** HIGH (with special audit), but not batchable with PATCH

**Batch Eligible:** NO - Execution semantics require separate audit

**Deferral:** Phase 2+ after standard mutations proven safe

---

### LANE_G: SERVICE_REFACTOR_REQUIRED

**Definition:** Services requiring signature changes or modernization before routes can be updated

**Issue:** Service contract not yet modernized to CanonicalAuthContext or ServiceAuthEnvelope

**Examples:** Services expecting raw request, legacy session types, etc.

**Service Signature:** Legacy (needs refactor)

**Safety Profile:** UNKNOWN (requires design)

**Batch Eligible:** NO - Service modernization prerequisite

**Deferral:** Phase 2+ service migration track

---

### LANE_H: FALSE_POSITIVE_OR_DEV_TEST

**Definition:** Routes that look like violations but are actually safe, or dev/test routes

**Issue:** Scanner pattern match false positives

**Examples:** Dev-only routes, test fixtures with auth guard imports

**Service Signature:** N/A (false positive)

**Safety Profile:** N/A (no change needed)

**Batch Eligible:** N/A - Remove from modernization scope

**Action:** Exclude from batch, mark as false positive

---

### LANE_I: UNKNOWN_STOP

**Definition:** Routes with unknown service contracts or unclear requirements

**Issue:** Service file not located, contract unclear, requirements ambiguous

**Examples:** Admin operations, auth infrastructure routes

**Service Signature:** UNKNOWN

**Safety Profile:** UNKNOWN (requires full audit)

**Batch Eligible:** NO - Do not implement without design audit

**Deferral:** Full infrastructure audit required

---

## C. Mapping: Old Names → Normalized Names

| Previous Lane | Previous Name | New Lane | New Name | Routes | Status |
|---|---|---|---|---|---|
| Lane A | SERVICE_AUTH_ENVELOPE_ADAPTER | LANE_B | SERVICE_AUTH_ENVELOPE_ADAPTER | 8 | Batch-eligible (if verified) |
| Lane B | EXISTING_CANONICAL_SERVICE_INPUT | LANE_A | EXISTING_CANONICAL_SERVICE_INPUT | 34 | Batch-eligible ✓ |
| Lane C | EXISTING_SERVICE_AUTH_ENVELOPE | LANE_? | Maps to LANE_C/D/G | 0 | N/A |
| Lane D | SERVICE_MODERNIZATION_CANDIDATE | LANE_G | SERVICE_REFACTOR_REQUIRED | 6 | Deferred |
| Lane E | SERVICE_DEPENDENCY_BLOCKER | LANE_C | WORKSPACE_SEMANTICS_REQUIRED | 4 | Deferred |
| Lane F | COMPLEX_MUTATION_OPERATIONS | LANE_F | RUN_VERIFY_SPECIAL | 12 | Deferred |
| Lane G | CRITICAL_BUSINESS_DATA_ROUTES | LANE_D | POLICY_WRAPPER_REQUIRED | 6 | Deferred |
| Lane I | UNKNOWN_STOP | LANE_I | UNKNOWN_STOP | 2 | Blocked |

---

## D. Batch 1 Lane Classification (Normalized)

**R1-BATCH-1 Selected Routes (6 total):**

1. **Contact PATCH** (Pre-authorized)
   - Previous Lane: B (EXISTING_CANONICAL_SERVICE_INPUT)
   - **Normalized Lane:** LANE_A
   - Service: updateContact (expects CanonicalAuthContext)
   - Status: ✓ Verified

2. **Engagement PATCH**
   - Previous Lane: B (assumed)
   - **Normalized Lane:** LANE_A (if verified)
   - Service: updateEngagement
   - Status: △ Audit required

3. **Assignment PATCH**
   - Previous Lane: B (assumed)
   - **Normalized Lane:** LANE_A (if verified)
   - Service: updateEngagementAssignment
   - Status: △ Audit required

4. **Action Status PATCH**
   - Previous Lane: B (action family)
   - **Normalized Lane:** LANE_A (if verified)
   - Service: updateActionStatus
   - Status: △ Audit required

5. **Deliverable Status PATCH**
   - Previous Lane: B (assumed)
   - **Normalized Lane:** LANE_A (if verified)
   - Service: updateDeliverableStatus
   - Status: △ Audit required

6. **Recommendation Priority PATCH**
   - Previous Lane: B (assumed)
   - **Normalized Lane:** LANE_A (if verified)
   - Service: updateRecommendationPriority
   - Status: △ Audit required

**Batch 1 Summary:**
- All routes: LANE_A (EXISTING_CANONICAL_SERVICE_INPUT) or blocked if audit fails
- Single lane: YES (LANE_A only, no mixing)
- Batch size: 6 (within 3-10)
- Pre-authorized: 1 (Contact PATCH)
- Audit gates: 5 (Engagement, Assignment, Action, Deliverable, Recommendation)

---

## E. Normalization Implications

### Lane Simplification

**Batch-Eligible Lanes (Normalized):**
- ✓ LANE_A: EXISTING_CANONICAL_SERVICE_INPUT (34 routes, proven safe, batch-ready)
- ✓ LANE_B: SERVICE_AUTH_ENVELOPE_ADAPTER (8 routes, proven safe, batch-ready if verified)

**Deferred Lanes (Require Separate Audit):**
- △ LANE_C: WORKSPACE_SEMANTICS_REQUIRED (4 routes)
- △ LANE_D: POLICY_WRAPPER_REQUIRED (6 routes)
- △ LANE_F: RUN_VERIFY_SPECIAL (12 routes)
- △ LANE_G: SERVICE_REFACTOR_REQUIRED (6 routes)

**Blocked Lanes:**
- ✗ LANE_E: WEBHOOK_PAYMENT_SPECIAL (separate event framework)
- ✗ LANE_H: FALSE_POSITIVE_OR_DEV_TEST (exclude from scope)
- ✗ LANE_I: UNKNOWN_STOP (2 routes, infrastructure audit required)

### Batch 1 Authorization

**Normalized Batch 1 Lane:** LANE_A (EXISTING_CANONICAL_SERVICE_INPUT)

**Decision Gate:** All 6 routes must verify as LANE_A (CanonicalAuthContext expected) or be removed from batch

**If all verify:** Proceed with batch (same lane, single pattern)

**If mixed:** Split batch (LANE_A routes with LANE_A, others deferred)

---

**Status: ✓ R1-ACCEL-0R LANE NORMALIZATION COMPLETE - READY FOR BATCH 1 REVALIDATION**
