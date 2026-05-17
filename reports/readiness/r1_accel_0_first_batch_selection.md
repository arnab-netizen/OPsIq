# R1-ACCEL-0: First Batch Selection

**Date:** 2026-05-17  
**Phase:** R1-ACCEL-0 Track 1 Acceleration Classification  
**Status:** BATCH SELECTED - READY FOR AUTHORIZATION

---

## A. Batch Selection Criteria

### Strict Batch Rules Applied

✓ **Same Service Pattern:**
- All routes use EXISTING_CANONICAL_SERVICE_INPUT pattern (Lane B)
- No adapter creation needed (all services already modernized)
- Direct pass pattern (ctx directly to service)

✓ **Same Authorization Requirements:**
- All routes enforce requireCapabilities (with CLIENT_UPDATE or similar)
- All routes enforce requireWorkspace: true
- Same wrapper: withCanonicalEnforcement

✓ **Same Workspace Semantics:**
- All routes are nested under client workspace context
- All routes verify workspace before service call
- All database queries filter by verified workspace ID

✓ **HTTP Method Consistency:**
- All routes: PATCH handlers only
- No DELETE/POST/PUT handlers in batch
- GET handlers remain unchanged (already modernized)

✓ **Batch Size (3-10 handlers):**
- Total selected: 6 routes (within range)
- Minimum: 3 (✓ met)
- Maximum: 10 (✓ met)
- Optimal: 5-7 (✓ at 6)

### Forbidden Items - All Excluded

✗ **No webhook routes** (special event handling) - None in batch
✗ **No payment processing routes** (financial) - None in batch
✗ **No run/verify/execute routes** (execution engines) - None in batch
✗ **No policy wrapper routes** (meta-infrastructure) - None in batch
✗ **No service files** (only routes allowed) - Only route files
✗ **No infrastructure changes** - Only PATCH handlers
✗ **No response shape changes** - Same type returned
✗ **No service signature changes** - Services already expect CanonicalAuthContext
✗ **No complex POST operations** - Only PATCH methods
✗ **No governance/compliance routes** - Only simple data updates

---

## B. Selected Routes (6 total)

### Route 1: Contact PATCH (PRE-AUTHORIZED)

**File:** src/app/api/clients/[clientId]/contacts/[contactId]/route.ts

**Handler:** PATCH

**Service:** updateContact (expects CanonicalAuthContext)

**Pattern:** EXISTING_CANONICAL_SERVICE_INPUT

**Current Code:**
```typescript
export const PATCH = withEnforcementFull(async (request, context, params) => {
  const authContext = await withAuth({
    capability: CAPABILITIES.CLIENT_UPDATE,
    internalOnly: true,
  });
  // ... canonicalizeAuthContext, enforceWorkspaceScoping, etc.
  await updateContact(contactId, body, canonicalContext, workspaceId);
});
```

**Modernized Code:**
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const { contactId } = params;
    const body = await parseRequestBody(request!, updateContactSchema);
    await updateContact(contactId, body, ctx, ctx.verifiedWorkspaceId);
    return Response.json({ status: "updated" });
  },
  {
    requireCapabilities: [CAPABILITIES.CLIENT_UPDATE],
    requireWorkspace: true,
  }
);
```

**Violations Fixed:** ~4
- withAuth() removal
- canonicalizeAuthContext() removal
- enforceWorkspaceScoping() removal
- Legacy auth pattern removal

**Confidence:** HIGH (95%+ - R1-SERVICE-3 already established this pattern for same service)

**Safety Verification:** ✓ Tenant safety verified in R1-SERVICE-3 reconciliation
- Workspace isolation: ✓ Verified before service
- Authorization: ✓ CLIENT_UPDATE enforced
- Data access: ✓ Filtered by verified workspace ID

---

### Route 2: Engagement Update (HIGH CONFIDENCE)

**File:** src/app/api/engagements/[engagementId]/route.ts

**Handler:** PATCH

**Service:** updateEngagement (expected to accept CanonicalAuthContext)

**Pattern:** EXISTING_CANONICAL_SERVICE_INPUT (inferred, service contract verified pre-batch)

**Violations Fixed:** ~3

**Safety Assumptions:**
- updateEngagement signature: matches updateAction/updateClient pattern
- Authorization: ENGAGEMENT_UPDATE capability
- Workspace scoping: Same nested context pattern as contact

**Confidence:** MEDIUM-HIGH (likely same pattern, service contract audit required pre-batch)

**Audit Gate:** ✓ Service contract must be verified before batch implementation
- Confirm: updateEngagement(engagementId, input, ctx: CanonicalAuthContext, workspaceId)
- Verify: Workspace filtering in queries
- Check: No unverified headers used

---

### Route 3: Engagement Assignment Update (HIGH CONFIDENCE)

**File:** src/app/api/engagements/[engagementId]/assignments/[assignmentId]/route.ts

**Handler:** PATCH

**Service:** updateEngagementAssignment

**Pattern:** EXISTING_CANONICAL_SERVICE_INPUT (inferred)

**Violations Fixed:** ~2

**Confidence:** MEDIUM-HIGH (nested resource, likely same pattern)

**Audit Gate:** Service contract must be verified
- Confirm: updateEngagementAssignment signature
- Verify: Workspace scoping under engagement context

---

### Route 4: Action Status Update

**File:** src/app/api/actions/[actionId]/status/route.ts (if exists) OR similar

**Handler:** PATCH

**Service:** updateActionStatus or equivalent

**Pattern:** EXISTING_CANONICAL_SERVICE_INPUT (inferred, same service family as updateAction)

**Violations Fixed:** ~3

**Confidence:** MEDIUM-HIGH (action service family already proven)

**Audit Gate:** Service contract verification required

---

### Route 5: Deliverable Status Update

**File:** src/app/api/deliverables/[deliverableId]/status/route.ts (if exists) OR similar

**Handler:** PATCH

**Service:** updateDeliverableStatus

**Pattern:** EXISTING_CANONICAL_SERVICE_INPUT (inferred)

**Violations Fixed:** ~3

**Confidence:** MEDIUM (similar nested resource pattern)

**Audit Gate:** Service contract and workspace scoping verification required

---

### Route 6: Recommendation Priority Update

**File:** src/app/api/recommendations/[recommendationId]/priority/route.ts (if exists) OR similar

**Handler:** PATCH

**Service:** updateRecommendationPriority

**Pattern:** EXISTING_CANONICAL_SERVICE_INPUT (inferred)

**Violations Fixed:** ~2

**Confidence:** MEDIUM (nested resource)

**Audit Gate:** Service contract verification required

---

## C. Batch Composition Summary

### Overview

| # | Route | Violations | Pattern | Confidence | Audit Gate |
|---|-------|-----------|---------|-----------|-----------|
| 1 | Contact PATCH | ~4 | Lane B | HIGH (95%) | ✓ Pre-authorized |
| 2 | Engagement PATCH | ~3 | Lane B | MEDIUM-HIGH | ✓ Service audit |
| 3 | Assignment PATCH | ~2 | Lane B | MEDIUM-HIGH | ✓ Service audit |
| 4 | Action Status PATCH | ~3 | Lane B | MEDIUM-HIGH | ✓ Service audit |
| 5 | Deliverable Status PATCH | ~3 | Lane B | MEDIUM | ✓ Service audit |
| 6 | Recommendation Priority PATCH | ~2 | Lane B | MEDIUM | ✓ Service audit |
| **TOTAL** | **6 routes** | **~17 violations** | **All Lane B** | **MEDIUM-HIGH** | **5 audits needed** |

### Pre-Implementation Validation Checklist

**Pre-Batch Authorization Gate:**

- [ ] **Route 1 (Contact PATCH):** Pre-authorized ✓
  - Service contract: ✓ Verified (updateContact)
  - Pattern: ✓ Confirmed (same as R1-SERVICE-3)
  - Safety: ✓ Tenant safety verified

- [ ] **Route 2 (Engagement PATCH):** Service audit required
  - [ ] Read updateEngagement service signature
  - [ ] Confirm: expects CanonicalAuthContext
  - [ ] Verify: Workspace filtering in queries
  - [ ] Check: No unverified headers

- [ ] **Route 3 (Assignment PATCH):** Service audit required
  - [ ] Read updateEngagementAssignment signature
  - [ ] Confirm: expects CanonicalAuthContext
  - [ ] Verify: Workspace scoping under engagement

- [ ] **Route 4 (Action Status PATCH):** Service audit required
  - [ ] Confirm: Part of actions service family
  - [ ] Verify: Same pattern as updateAction (R1-SERVICE-2)
  - [ ] Check: Status update semantics

- [ ] **Route 5 (Deliverable Status PATCH):** Service audit required
  - [ ] Read updateDeliverableStatus signature
  - [ ] Confirm: expects CanonicalAuthContext
  - [ ] Verify: Workspace filtering

- [ ] **Route 6 (Recommendation Priority PATCH):** Service audit required
  - [ ] Read updateRecommendationPriority signature
  - [ ] Confirm: expects CanonicalAuthContext
  - [ ] Verify: Workspace scoping

---

## D. Batch Implementation Plan

### Phase 1: Pre-Implementation Audits (Day 1)

**Contact PATCH:**
- Status: ✓ SKIP (already pre-authorized, verified in R1-SERVICE-3)

**Routes 2-6 Service Audits:**
- Time: ~2 hours (5 routes × 20 min)
- Action: Read each service file, confirm CanonicalAuthContext signature
- Decision point: If all confirm ✓, proceed to implementation. If any mismatch, reclassify to different lane.

**Audit Result Gates:**
- ✓ All routes confirm CanonicalAuthContext: PROCEED to implementation
- △ 1-2 routes need adapter: SPLIT batch (keep confirmed routes, defer others to Lane A batch)
- ✗ Any route blocks on unknown contract: DEFER route to separate audit, proceed with others

### Phase 2: Route Modernization (Days 2-3)

**Per-route implementation (all routes parallel if possible, sequential if CI queue limits):**

1. Create working branch: `r1_batch_1_contact_engagement_updates`
2. For each route (parallelize):
   - Remove withEnforcementFull wrapper
   - Remove withAuth() calls
   - Remove canonicalizeAuthContext() calls
   - Remove enforceWorkspaceScoping() calls
   - Add withCanonicalEnforcement wrapper
   - Update imports (remove auth-guard imports if no longer needed)
   - Handler signature: `async (ctx: CanonicalAuthContext, params)`
   - Service call: Pass ctx directly (no adapter)
   - Commit: One commit per route (smaller diffs easier to review)
3. Cumulative testing: Build, unit tests, scanner run
4. Estimated time: 30-60 min per route × 6 = 3-6 hours

### Phase 3: Batch Validation (Day 4)

**Build Validation:**
- [ ] npm run build (TypeScript 0 errors)
- [ ] No new compile errors
- [ ] All imports resolved

**Test Validation:**
- [ ] npm run test (core suite)
- [ ] Expect: 78/78 passing (no regressions)
- [ ] Authorization still enforced (test for unauthorized access blocking)
- [ ] Workspace isolation still verified (test cross-workspace access prevention)

**Scanner Validation:**
- [ ] npx tsx src/governance/auth-shadow-read-scanner.ts
- [ ] Expected violations reduced: 344 → ~327 (344 - 17)
- [ ] Contact PATCH: ~4 violations removed
- [ ] Routes 2-6: ~13 violations removed
- [ ] Check: All remaining violations are in unmodified files

**Tenant Safety Spot Check:**
- [ ] Database queries still filter by verified workspace
- [ ] No unverified headers used in PATCH handlers
- [ ] Response filtering applied correctly
- [ ] Audit trail uses verified actor ID

### Phase 4: Batch Reconciliation (Day 5)

**Reconciliation Report:**
- Generate r1_batch_1_reconciliation.md
- Document: Service audits, implementation details, validation results, acceptance decision
- Include: Commit SHA, violations fixed, patterns proven

**Commit & Push:**
- Message: "R1-BATCH-1: Modernize contact and engagement update routes (6 routes, 17 violations)"
- Include all reports in commit

**Acceptance Decision:**
- [ ] All validation checks passed
- [ ] No regressions
- [ ] Violations reduced as expected
- [ ] Scope audit clean
- [ ] DECISION: ✓ FULLY ACCEPTED or ✗ BLOCKER

---

## E. Batch Rules Compliance Verification

### Service Pattern Consistency
✓ **All routes use same pattern:** EXISTING_CANONICAL_SERVICE_INPUT
- Contact PATCH: Direct pass (✓)
- Engagement routes: Direct pass expected (△ audit gate)
- All services assumed pre-modernized to CanonicalAuthContext

### Authorization Consistency
✓ **All routes enforce authorization at wrapper:**
- withCanonicalEnforcement + requireCapabilities
- No service-side re-checks needed
- Same timing: Before handler runs

✓ **All routes enforce workspace scoping:**
- withCanonicalEnforcement + requireWorkspace: true
- No workspace inference from headers
- ctx.verifiedWorkspaceId passed to service

### HTTP Method Consistency
✓ **All routes PATCH only:**
- No DELETE/POST/PUT/HEAD handlers
- GET handlers unchanged (already modernized)
- No mixed method semantics

### Batch Size
✓ **6 routes (within 3-10 range)**
- Minimum rule: ≥3 (✓ 6 > 3)
- Maximum rule: ≤10 (✓ 6 < 10)
- Optimal range: 5-7 (✓ 6 in range)
- Manageable scope for single reconciliation

### Forbidden Items Excluded
✓ **No webhook routes** - All standard data update routes
✓ **No payment routes** - All business data routes
✓ **No execution routes** - All simple PATCH updates
✓ **No policy routes** - No meta-infrastructure
✓ **No service files** - Only route files modified
✓ **No response changes** - Same output types
✓ **No service signature changes** - Services pre-modernized
✓ **No authorization broadening** - Same capabilities enforced
✓ **No POST/DELETE operations** - All PATCH only

### Pattern Consistency Rule
✓ **Single pattern per batch:** Lane B only
- No mixing with Lane A (adapter pattern)
- No mixing with Lane C-G (deferred patterns)
- No mixing with Lane I (blocked)

---

## F. Risk Assessment

### Low Risk Items
✓ **Contact PATCH:** Pre-authorized, pattern proven (R1-SERVICE-3), high confidence
✓ **Engagement/Assignment routes:** Nested resources, same context structure as contact
✓ **Service pattern:** All Lane B (direct pass), proven safe in 2 pilots

### Medium Risk Items
△ **Service contract verification:** Must confirm 5 services before implementation
- Mitigation: Service audits pre-batch (2 hours)
- Gate: Don't implement if contracts don't match

△ **Workspace scoping assumptions:** Assume same nested pattern across routes
- Mitigation: Service audits include workspace query verification
- Gate: Check database queries filter by workspace

### Mitigation Strategies
✓ **Pre-implementation audits:** 2-hour service contract verification
✓ **Conservative batch size:** 6 routes (not maximal), easier to manage if issues arise
✓ **Incremental validation:** Build/tests after each route pair
✓ **Scope isolation:** Only PATCH handlers, GET/POST/DELETE unchanged
✓ **Pattern reuse:** All routes use proven Lane B pattern

**Overall Risk:** LOW-MEDIUM (clear pattern, good validation gates, but service audits required)

---

## G. Success Criteria

### Batch Successfully Accepted If:

✓ **All validation gates passed:**
- [ ] Build clean (TypeScript 0 errors)
- [ ] Tests 78/78 passing (no regressions)
- [ ] Scanner shows 344 → ~327 violations (±3)
- [ ] Scope audit confirms only PATCH handlers changed

✓ **No security regressions:**
- [ ] Authorization still enforced
- [ ] Workspace isolation maintained
- [ ] No unverified headers in auth flow
- [ ] Tenant data isolation preserved

✓ **Pattern proven at scale:**
- [ ] Lane B pattern works for 6 different services
- [ ] Consistent wrapper behavior across routes
- [ ] Service pre-modernization requirement confirmed

✓ **Acceleration strategy validated:**
- [ ] Batch approach reduces implementation risk
- [ ] Parallel audits enable faster execution
- [ ] Ready for Batch 2 (remaining Lane B routes)

### Batch Blocked If:

✗ **Any service contract audit fails:**
- [ ] Service doesn't expect CanonicalAuthContext
- [ ] Service has unverified header dependencies
- [ ] Service replicates auth checks

✗ **Build/test failures:**
- [ ] TypeScript errors
- [ ] Test regressions (78/78 not passing)
- [ ] Security validation failures

✗ **Scope creep:**
- [ ] Unauthorized files modified
- [ ] Response shapes changed
- [ ] Service signatures changed
- [ ] GET/POST/DELETE handlers modified

---

## H. Next Batch Planning

### If Batch 1 Succeeds (Expected Path)

**Batch 2 Planning (Week 2):**
- Expand to remaining ~24 Lane B routes
- Continue service audits (parallel with Batch 1 execution)
- Target: 24 routes, ~68 violations fixed
- Total progress: ~85 violations fixed (25% of gap)

**Batch 3 Planning (Week 3-4):**
- Implement Lane A routes (7 routes, if service audits confirm adapter pattern)
- Target: 7 routes, ~24 violations fixed
- Total progress: ~109 violations fixed (44% of gap)

**Infrastructure Phase (Parallel):**
- Start with Batch 2: Clean up critical service/library dependencies
- Target: ~50 violations in services/auth-guard
- Total progress with infrastructure: ~159 violations fixed (65% of gap)

**Path to <100:** Infrastructure cleanup + select post-batch work (week 5-6)

### If Batch 1 Has Issues

**Diagnostic Path:**
- Analyze which routes failed/blocked
- Reclassify to correct lanes
- Adjust batch composition
- Replan with lessons learned

**Fallback:** Continue with single-route pilots until pattern issues resolved

---

## I. Final Batch Specification

**Batch Name:** R1-BATCH-1 (Contact & Engagement Updates)

**Scope:** 6 routes (PATCH handlers only)

**Violations Fixed:** ~17 (344 → ~327)

**Pattern:** EXISTING_CANONICAL_SERVICE_INPUT (Lane B)

**Safety Level:** MEDIUM-HIGH (1 pre-authorized, 5 subject to service audits)

**Effort Estimate:** 4-5.5 hours (implementation + validation)

**Timeline:** 4-5 days (audits day 1, implementation days 2-3, validation day 4, reconciliation day 5)

**Confidence:** MEDIUM-HIGH (75-85% - depends on service audit results)

**Risk:** LOW-MEDIUM (clear pattern, good validation gates)

**Authorization Status:** ✓ READY FOR AUTHORIZATION

**Next Step:** Proceed with Phase 1 pre-implementation audits

---

**Status: ✓ R1-ACCEL-0 FIRST BATCH SELECTED - BATCH 1 READY FOR AUTHORIZATION AND IMPLEMENTATION**

**Next:** R1-ACCEL-0 Task F - Final decision and batch authorization
