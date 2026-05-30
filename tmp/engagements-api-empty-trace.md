# /api/engagements Empty Response Root Cause Trace

## Route Structure
- **Route file**: src/app/api/engagements/route.ts
- **Handler function**: engagementsGetHandler
- **Auth/Canonical wrapper**: withCanonicalEnforcement
- **Wrapper options**: 
  - requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW]
  - requireWorkspace: true
  - errorNamespace: "engagements"

## Workspace Resolution
- **Source**: ctx.verifiedWorkspaceId (from canonical enforcement)
- **Derivation**: WorkspaceMembership lookup by userId + isActive=true
- **Validation**: UUID regex check

## Service Path
- **Service function called**: listEngagements(workspaceId, parsedParams, hasInternalAccess)
- **Service location**: src/services/engagement.ts:427
- **Service version**: ENGAGEMENTS_SERVICE_VERSION

## Prisma Query
- **Database operation**: db.engagement.findMany
- **Where clause construction** (line 447-458):
  ```
  where: {
    workspaceId,                                    // ✓ Correctly scoped
    ...visibilityFilter,                            // ← CRITICAL: This is the issue
    ...(status && { status }),
    ...(clientId && { clientId }),
    ...(search && { OR: [...] })
  }
  ```
- **VisibilityFilter logic** (line 444):
  ```
  const visibilityFilter = hasInternalAccess 
    ? { visibility: { in: ["internal", "client_visible"] } } 
    : { visibility: "client_visible" }
  ```
- **Select fields**: engagementListSelect
- **Order by**: createdAt: "desc"
- **Pagination**: take=limit (default 25), skip=offset (default 0)

## Root Cause Analysis
**VISIBILITY MISMATCH**

1. Demo engagement is created by backfill endpoint with NO explicit visibility set
2. Engagement schema default is `visibility: String @default("internal")`
3. Demo engagement gets visibility = "internal"
4. listEngagements determines hasInternalAccess based on ctx.policy from capabilities
5. Demo user has ENGAGEMENT_VIEW capability but not system admin/internal access
6. Query filters by `{ visibility: "client_visible" }` because hasInternalAccess = false
7. Demo engagement with visibility="internal" is excluded from results
8. Result: Empty array returned even though engagement exists in DB

## Response Shape
- **API returns**: Array of engagement DTOs
- **HTTP status**: 200 OK
- **Response shape**: `[{ id, code, title, status, ... }]` or empty `[]`

## Smoke Parser Path
- **Script location**: scripts/smoke-production-dashboard.ts:387
- **Parser logic**:
  ```typescript
  const engagementCount = Array.isArray(data) 
    ? data.length 
    : data.engagements?.length || 0
  ```
- **Issue**: Parser correctly identifies empty array, but treats it as "no data found"
- **Correct behavior**: Should be "data exists but is filtered out"

## Proof vs API Comparison
- **Proof endpoint query**: `db.engagement.count({ where: { workspaceId } })`
  - Returns: 1 (because no visibility filter)
- **API query**: `db.engagement.findMany({ where: { workspaceId, visibility: "client_visible" } })`
  - Returns: [] (because demo engagement is internal)

## Conclusion
The engagement data exists and is correctly scoped to workspace, but is filtered out by the visibility filter in listEngagements service because the demo engagement was created with the default visibility="internal" instead of visibility="client_visible".

**Fix**: Set visibility="client_visible" when creating demo engagement in backfill endpoint.
