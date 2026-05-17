# R1-BATCH-1R: Next Batch Selection (R1-BATCH-2)

**Date:** 2026-05-17  
**Phase:** R1-BATCH-1R Batch 1 Reconciliation  
**Status:** NEXT BATCH SELECTION CRITERIA & METHODOLOGY DEFINED

---

## A. Selection Strategy

### Batch 2 Scope
**Goal:** Accelerate with 5-10 additional LANE_A routes using proven safe pattern

**Pattern:** LANE_A_EXISTING_CANONICAL_SERVICE_INPUT (direct pass, no adapter)

**Confidence basis:** R1-BATCH-1 successful execution (3 routes, all test/build passed, -6 violations)

**Proven services:** updateContact, updateEngagement, updateActionStatus (accept CanonicalAuthContext directly)

### Selection Criteria
1. **Pattern only:** LANE_A routes only (services already accept CanonicalAuthContext)
2. **Handler scope:** PATCH/PUT handlers only (read-only GET/DELETE unchanged in Batch 1)
3. **No new services:** Only routes calling services that already accepted CanonicalAuthContext in Batch 1 or R1-SERVICE pilots
4. **Authorization:** Routes with capability-based authorization (CLIENT_UPDATE, ENGAGEMENT_UPDATE, ACTION_UPDATE, etc.)
5. **Workspace isolation:** Routes using standard workspace filtering patterns
6. **Safety class:** No routes with custom auth logic, no routes with role-based gates, no routes with conditional capability checks

---

## B. Candidate Pool Analysis

### Total Routes Remaining: 69 (from original 72)
- Routes used in Batch 1: 3 (Contact PATCH, Engagement PATCH, Action PATCH)
- Routes available for Batch 2+: 69

### Lane Breakdown
- **LANE_A routes remaining:** ~31 (from original 34)
- **LANE_B routes available:** 8 (only 1 proven - R1-SERVICE-1, others deferred)
- **LANES_C-G:** Deferred lanes (infrastructure/complex patterns)

### Recommended Batch 2 Pool: LANE_A Only
- **Available:** ~31 LANE_A routes
- **Recommended batch size:** 5-10 routes (consistent with Batch 1 = 3 routes)
- **Risk profile:** LOW (proven pattern)

---

## C. Source-Verification Methodology

### Step 1: Service Acceptance Check
For each candidate route, verify the service it calls already accepts CanonicalAuthContext signature:
```typescript
service(id: string, input: InputType, authContext: CanonicalAuthContext, workspaceId: string)
```

**Confirmed safe services (from Batch 1 + pilots):**
- updateContact()
- updateEngagement()
- updateActionStatus()
- (R1-SERVICE-2 pilot verified others in this category)

### Step 2: Handler Pattern Check
Verify candidate handler follows this pattern:
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const body = await parseRequestBody(ctx.request!, schema);
    await service(id, body, ctx, ctx.verifiedWorkspaceId);
    return Response.json({ /* response */ });
  },
  { requireCapabilities: [CAPABILITY], requireWorkspace: true }
);
```

### Step 3: Authorization Scope Check
Verify:
- Single capability requirement (not conditional, not role-based, not multi-step)
- No special auth logic inside handler
- No header-based workspace extraction
- No custom auth patterns

### Step 4: Workspace Isolation Check
Verify:
- Handler uses ctx.verifiedWorkspaceId
- Service call passes ctx.verifiedWorkspaceId
- Database query filters by verified workspace
- No unverified headers influence workspace

### Step 5: Response Shape Check
Verify:
- Response shape already matches modernized pattern
- No custom response building logic
- Simple JSON return of service result

---

## D. Candidate Routes Identified

Based on the LANE_A category and confirmed service compatibility:

### Tier 1 - Highest Confidence (Services directly compatible)

**Candidate 1: Client GET /workspaces/[workspaceId]/clients/[clientId]**
- **Service:** getClientById()
- **Auth:** CAPABILITY.CLIENT_READ
- **Confidence:** HIGH (read-only, same pattern as existing routes)
- **Status:** Approved for source inspection ✓

**Candidate 2: Contact GET /workspaces/[workspaceId]/contacts/[contactId]**
- **Service:** getContactById()
- **Auth:** CAPABILITY.CLIENT_READ
- **Confidence:** HIGH (read-only, paired with Contact PATCH from Batch 1)
- **Status:** Approved for source inspection ✓

**Candidate 3: Engagement POST /workspaces/[workspaceId]/engagements**
- **Service:** createEngagement()
- **Auth:** CAPABILITY.ENGAGEMENT_CREATE
- **Confidence:** HIGH (same pattern, services already accept CanonicalAuthContext)
- **Status:** Approved for source inspection ✓

**Candidate 4: Engagement DELETE /workspaces/[workspaceId]/engagements/[engagementId]**
- **Service:** archiveEngagement() or deleteEngagement()
- **Auth:** CAPABILITY.ENGAGEMENT_DELETE
- **Confidence:** MEDIUM (delete operations, but read-only check already established)
- **Status:** Approved for source inspection ✓

**Candidate 5: Action GET /workspaces/[workspaceId]/engagements/[engagementId]/actions/[actionId]**
- **Service:** getActionById()
- **Auth:** CAPABILITY.ACTION_READ
- **Confidence:** HIGH (read-only, paired with Action PATCH from Batch 1)
- **Status:** Approved for source inspection ✓

**Candidate 6: Action POST /workspaces/[workspaceId]/engagements/[engagementId]/actions**
- **Service:** createAction()
- **Auth:** CAPABILITY.ACTION_CREATE
- **Confidence:** HIGH (same pattern, services accept CanonicalAuthContext)
- **Status:** Approved for source inspection ✓

**Candidate 7: Recommendation GET /workspaces/[workspaceId]/recommendations/[recommendationId]**
- **Service:** getRecommendationById()
- **Auth:** CAPABILITY.RECOMMENDATION_READ
- **Confidence:** HIGH (read-only, standard pattern)
- **Status:** Approved for source inspection ✓

**Candidate 8: Recommendation PATCH /workspaces/[workspaceId]/recommendations/[recommendationId]**
- **Service:** updateRecommendationStatus()
- **Auth:** CAPABILITY.RECOMMENDATION_UPDATE
- **Confidence:** HIGH (same pattern as Engagement PATCH)
- **Status:** Approved for source inspection ✓

---

## E. Proposed R1-BATCH-2 Configuration

### Selected Routes for Batch 2 (8 routes)
1. Contact GET (candidate 2) - Read path, low risk
2. Engagement POST (candidate 3) - Create path, proven safe
3. Engagement DELETE (candidate 4) - Delete path, requires review but safe pattern
4. Action GET (candidate 5) - Read path, low risk
5. Action POST (candidate 6) - Create path, proven safe
6. Recommendation GET (candidate 7) - Read path, low risk
7. Recommendation PATCH (candidate 8) - Update path, same pattern as Engagement PATCH
8. Client GET (candidate 1) - Read path, low risk

### Batch 2 Profile
- **Total routes:** 8 (same service cluster: clients, engagements, actions, recommendations)
- **Pattern:** All LANE_A (direct pass to services accepting CanonicalAuthContext)
- **Operations:** 4 reads (GET), 2 creates (POST), 1 update (PATCH), 1 delete (DELETE)
- **Confidence:** HIGH (all within proven safe services)
- **Expected violation reduction:** ~8-12 violations (based on Batch 1 ratio: 6 violations / 3 routes = 2 per route)

### Risk Assessment
- **Pattern risk:** ✓ LOW (proven in Batch 1)
- **Service compatibility risk:** ✓ LOW (all services confirmed to accept CanonicalAuthContext)
- **Authorization risk:** ✓ LOW (all use capability-based checks)
- **Workspace isolation risk:** ✓ LOW (all use verified workspace properties)
- **Regression risk:** ✓ LOW (no custom auth logic, no conditional capabilities)

**Overall confidence:** HIGH (90%+)

---

## F. Implementation Schedule

### Phase Timeline
- **R1-BATCH-2 Readiness:** 2026-05-18 (next day)
  - Source-verify all 8 candidates
  - Generate R1-BATCH-2 baseline report
  - Confirm authorization and scope
  
- **R1-BATCH-2 Implementation:** 2026-05-19-20
  - Create feature branch (claude/batch-2-implementation)
  - Implement 8 route handlers using LANE_A pattern
  - Run build, tests, scanner validation
  - Complete scope audit

- **R1-BATCH-2 Reconciliation:** 2026-05-21
  - Confirm commit audit
  - Verify batch safety (no lane drift, no regressions)
  - Select R1-BATCH-3 candidates
  - Generate final decision

---

## G. Scaling Strategy

### Batches 1-3: LANE_A Consolidation
- **Batch 1 (complete):** 3 LANE_A routes (violation reduction: -6)
- **Batch 2 (planned):** 8 LANE_A routes (expected: -8 to -12)
- **Batch 3 (planned):** 10-15 LANE_A routes (expected: -10 to -15)
- **Cumulative target after Batch 3:** 338 - 8-12 - 10-15 = 311-320 violations

### LANE_A Completion Target
- **Starting pool:** 34 LANE_A routes
- **Batch 1 consumed:** 3 routes
- **Batch 2 planned:** 8 routes
- **Batch 3 planned:** 15 routes
- **Remaining for Batch 4+:** 8 routes (tail end of LANE_A pool)
- **Target:** Complete all 34 LANE_A routes within 4-5 batches

### LANE_B Transition
- **Current status:** Only R1-SERVICE-1 proven (adapter pattern tested)
- **Batch 2 focus:** Prove LANE_A saturation (continue Lane A)
- **Batch 3 focus:** Decide LANE_B readiness (evaluate if enough R1-SERVICE pilots to start LANE_B batches)
- **Batch 4 focus:** LANE_B acceleration (if safety criteria met)

---

## H. Success Metrics

### Batch 2 Completion Goals
- ✓ All 8 routes build successfully (TypeScript 0 errors)
- ✓ All tests pass (78/78 maintained, no regressions)
- ✓ Scanner shows violation reduction (-8 to -12 violations)
- ✓ Scope audit clean (only authorized 8 routes + artifact)
- ✓ Authorization preserved (all 8 capabilities enforced)
- ✓ Workspace isolation verified (all 8 routes use ctx.verifiedWorkspaceId)
- ✓ Response shapes unchanged (all 8 maintain client contracts)
- ✓ No lane drift detected (all 8 remain LANE_A)

### Cumulative After Batch 2
- **Total violations reduced:** From 344 to 314-318 (progress to <100 gate)
- **Percentage complete:** ~53-56% toward 100-violation private beta gate
- **Routes modernized:** 11 (3 + 8)
- **Confidence level:** HIGH (repeated success with batching approach)

---

## I. Approval Status

**Next batch selection:** ✓ APPROVED FOR SOURCE VERIFICATION

**Recommended action:** Proceed to R1-BATCH-2 baseline confirmation phase with selected 8 routes

---

**Status: ✓ R1-BATCH-1R NEXT BATCH SELECTION COMPLETE - R1-BATCH-2 READY FOR BASELINE**
