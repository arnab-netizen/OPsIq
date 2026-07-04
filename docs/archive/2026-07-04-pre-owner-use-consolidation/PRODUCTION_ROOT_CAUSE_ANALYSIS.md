# Production Root Cause Analysis: /api/engagements Returns 0 Engagements

## Status
**Visibility fix (commit 6124e7c5) IS deployed in main (04601ff3)** ✓

Confirmed by code inspection:
- demo-engagement-proof endpoint has full visibility detection and repair logic
- Smoke test includes visibility backfill logic
- engagement.ts applies correct visibility filter based on hasInternalAccess

**Problem: /api/engagements still returns 0 engagements despite demo_data_ready**

---

## Key Code Paths

### 1. Authorization & Policy (canonical-route-enforcement.ts + auth.ts)

```
Request → Canonical Wrapper
  ↓
getSessionFact() → Valid session required
  ↓
getPolicyContextFact() → Queries UserRoleAssignments
  ↓
evaluateAuthState() → Policy must be valid, else 401
  ↓
Handler called with ctx.policy
```

**Critical Issue Found:**
- `getPolicyContext()` queries UserRoleAssignments with:
  - `scope: "workspace"`
  - `scopeId: resolvedWorkspaceId`
  - `isActive: true`
  - `revokedAt: null`
  
- If NO matching assignment found, `getPolicyContext()` returns `null`
- If `null`, `policyFact.valid = false`
- If `policyFact.valid = false`, request REJECTED with 401 before handler executes
- If successful, policy context passed to handler

### 2. Handler: /api/engagements (route.ts)

```typescript
const hasAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
result = await listEngagements(workspaceId, parsedParams, hasAccess);
```

**Issue:** If `ctx.policy` is null, `hasAccess = false`

But this can ONLY happen if:
- Auth decision allowed it (policyFact.valid = true)
- But then `ctx.policy` would be set from decision.context.policy

So if auth passed, `ctx.policy` should exist (unless there's a logic error in canonical wrapper).

### 3. Service: listEngagements (engagement.ts)

```typescript
const visibilityFilter = hasInternalAccess 
  ? { visibility: { in: ["internal", "client_visible"] } } 
  : { visibility: "client_visible" };

const where = {
  workspaceId,
  ...visibilityFilter,
  ...(status && { status }),
  ...(clientId && { clientId }),
  ...(search && { OR: [...] }),
};

const engagements = await db.engagement.findMany({
  where,
  select: engagementListSelect,
  orderBy: { createdAt: "desc" },
  take: limit,
  skip: offset,
});
```

**Filter Logic:**
- If `hasInternalAccess = true`: Allows `visibility: { in: ["internal", "client_visible"] }`
- If `hasInternalAccess = false`: Requires `visibility: "client_visible"` exactly

Both should find engagement if `visibility: "client_visible"` is set.

---

## Root Cause Candidates (in order of likelihood)

### A) **Permission missing (LIKELY)**
- **Symptom:** Returns 0 despite proof showing demo_data_ready
- **Root cause:** Demo user's UserRoleAssignment doesn't exist or inactive
- **Impact:** `hasInternalAccess()` returns false → service filters to `visibility: "client_visible"`
- **But:** Engagement SHOULD be found if visibility is "client_visible"
- **Evidence to look for:** Service returns empty array with correct filter

### B) **Visibility field not set correctly (LESS LIKELY)**
- **Symptom:** Same as A
- **Root cause:** Backfill creates engagement but visibility stays "internal" (schema default)
- **Why unlikely:** We explicitly set `visibility: "client_visible"` in all backfill paths (create, relink, fix-visibility)
- **Evidence to look for:** Demo engagement found with `visibility: "internal"` in raw query

### C) **Workspace ID mismatch (UNLIKELY)**
- **Symptom:** Same
- **Root cause:** Service called with wrong workspace ID
- **Why unlikely:** Workspace ID derived from membership (server-side, fail-closed)
- **Evidence to look for:** Service query uses different workspace than proof endpoint

### D) **Auth rejection (401) not visible to smoke test (POSSIBLE)**
- **Symptom:** Smoke test sees 0 count instead of 401 status
- **Root cause:** Policy invalid, auth fails, but smoke test doesn't check status code properly
- **Why possible but unlikely:** Would require policy to be null
- **Evidence to look for:** Actual HTTP 401 response from /api/engagements

### E) **Response mapping error (LESS LIKELY)**
- **Symptom:** Service returns data but route returns wrong shape
- **Root cause:** Service returns correct data but route.ts response handling breaks
- **Evidence to look for:** Service returns array, route returns 0

---

## How to Verify Each Root Cause

### Run Diagnostic Script
```bash
# Requires OPSIQ_DIAGNOSTIC_KEY environment variable
npm run diagnose-root-cause
```

This calls in sequence:
1. **demo-permission-proof GET** → Shows user permission state
   - If `roleAssignmentFound: false` → Backfill needed
   - If `roleAssignmentActive: false` → Backfill needed

2. **demo-engagement-proof GET** → Shows demo data state
   - If `demoEngagementFound: false` → Backfill needed
   - If `demoEngagementVisibility !== "client_visible"` → Backfill needed

3. **engagements-api-runtime-trace GET** → Shows exact filtering point
   - `proofCount`: Raw engagement count in workspace
   - `rawEngagements`: Engagements from direct query
   - `demoEngagementInRaw`: Is demo engagement found?
   - `userHasAdminRole`: Is `hasInternalAccess()` true?
   - `serviceEngagementCount`: What does service return?
   - `rootCauseClassification`: Exact classification

The trace endpoint's `rootCauseClassification` will be one of:
- `no_engagement_in_database` → engagement doesn't exist
- `raw_query_returns_empty` → count > 0 but query returns empty
- `visibility_filter_excludes_demo_engagement` → engagement exists but visibility wrong
- `service_call_failed` → service threw error
- `service_filters_out_all_engagements` → service returns empty despite raw data
- `service_returns_data_check_response_shape` → service returns data, check route response

---

## Code Inspection Summary

### ✓ Verified Correct
1. **Visibility detection:** demo-engagement-proof detects visibility field correctly
2. **Visibility repair:** All backfill paths set `visibility: "client_visible"`
3. **Workspace derivation:** Canonical wrapper gets workspaceId from membership, never headers
4. **Service filter:** Applies correct visibility filter based on hasInternalAccess

### ⚠️ Potential Issues
1. **Policy context null handling:** If policy is null despite auth passing, hasAccess defaults to false (safe, but may not be intended)
2. **Schema default:** Engagement.visibility has `@default("internal")` - could revert if Prisma mutation doesn't explicitly set
3. **Demo user membership:** If inactive, getPolicyContext returns null → 401 before service called

### ? Requires Runtime Verification
1. **Does demo user's UserRoleAssignment exist?** (permission-proof GET)
2. **Does demo engagement have correct visibility?** (engagement-proof GET)
3. **Where exactly is filtering happening?** (runtime-trace GET)

---

## Next Steps

1. **Run diagnostic script:** `npm run diagnose-root-cause`
2. **Check diagnostic key:** Ensure `OPSIQ_DIAGNOSTIC_KEY` set in environment
3. **Analyze trace output:** Match `rootCauseClassification` to candidates above
4. **Fix only the proven root cause**
5. **Re-run smoke test to verify**
6. **Commit fix with analysis**

---

## Smoking Gun Evidence

If production smoke test shows:
- `demo_data_ready` from engagement-proof ✓
- Permission state valid ✓
- But `/api/engagements` returns 0 ✗

Then the issue MUST be in service layer or route response handling, NOT in data or permissions.

The `engagements-api-runtime-trace` endpoint will definitively pinpoint which.
