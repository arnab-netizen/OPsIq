# QUERY_SCOPE_FIX_REPORT.md

**Date**: 2026-05-02  
**Status**: 🟡 IN PROGRESS (Critical routes partially fixed, systematic work remaining)  
**Severity**: CRITICAL - Cross-tenant data access vulnerability

---

## Executive Summary

Prisma queries across the codebase are missing workspace/tenant scoping, allowing authenticated users to access data from other workspaces by guessing entity IDs.

**Vulnerability Pattern**:
```typescript
// VULNERABLE - No workspace filter
const decision = await db.operatorItem.findUnique({ where: { id: decisionId } });
if (!decision) return notFound;
// If user is from Workspace B and knows Workspace A's decisionId,
// they can access Workspace A's decision
```

**Secure Pattern**:
```typescript
// SECURE - Tenant scoped at DB layer
const decision = await db.operatorItem.findUnique({
  where: { id: decisionId, workspaceId }
});
if (!decision) return notFound;  // Fails if workspace mismatch
```

---

## Scan Results

### Total Unscoped Queries Found: 52+

**By Category**:
- Routes: 18 queries (HIGH RISK - exposed to external users)
- Services: 30+ queries (MEDIUM RISK - internal calls, but shared code path risk)
- Infrastructure: 8 queries (LOW RISK - audit, scheduler, idempotency - non-business logic)
- Tests: 50+ queries (IGNORED - test-only code)

---

## Fixed (✅ DONE)

### Critical Decision Routes
- ✅ `src/app/api/decisions/[decisionId]/route.ts`
  - Line 53-54: findUnique now scoped by workspaceId
  - Line 114-115: update now scoped by workspaceId
  - Impact: Prevents cross-workspace decision access/modification

- ✅ `src/app/api/decisions/[decisionId]/evaluate/route.ts`
  - Line 52-53: findUnique now scoped by workspaceId
  - Line 111-112: update now scoped by workspaceId
  - Impact: Prevents cross-workspace evaluation

### Engagement Routes
- ✅ `src/app/api/engagements/[engagementId]/business-impact/detail/route.ts`
  - Line 46: engagement.findUnique scoped
  - Lines 49-51: finding/recommendation/action findMany scoped
  - Impact: Prevents engagement data leak

**Progress**: 3 routes fixed (HIGH-RISK), 15+ remaining

---

## Remaining High-Risk Routes (Must Fix)

### Action Routes
- [ ] `src/app/api/actions/[actionId]/impact-delta/route.ts:21`
  - Query: `db.action.findUnique({ where: { id: actionId } })`
  - Fix: Add `workspaceId` to where clause
  - Risk: CRITICAL - allows cross-workspace action access

### Decision Routes
- [ ] `src/app/api/decisions/list/route.ts:55`
  - Query: `db.operatorItem.findMany({ where: ... })`
  - Fix: Ensure `where` includes `workspaceId`
  - Risk: CRITICAL - leaks all decisions from workspace

### Engagement Routes
- [ ] `src/app/api/engagements/[engagementId]/acknowledge/route.ts:39`
  - Query: `db.engagement.findUnique({ where: { id: engagementId } })`
  - Fix: Add `workspaceId` filter
  - Risk: CRITICAL - cross-workspace access

- [ ] `src/app/api/engagements/[engagementId]/execution-certainty/route.ts:20,33,36,39,42`
  - Multiple queries: findUnique + findMany calls
  - Fix: Add workspaceId to all WHERE clauses
  - Risk: CRITICAL - multiple exposure points

### Intelligence Routes
- [ ] `src/app/api/intelligence/recommendations/route.ts:32`
  - Query: `db.operatorItem.findUnique({ where: { id: decisionId } })`
  - Fix: Add `workspaceId` filter
  - Risk: HIGH - unauthorized access to decision recommendations

---

## Unfixed Service Queries

These are in shared service files called from multiple routes. Fixing these requires:
1. Adding `workspaceId` parameter to service function signatures
2. Updating all call sites to pass workspaceId
3. Adding workspaceId to all database queries

**Sample affected services** (representative of pattern):
- `src/services/findings.ts` - 5+ unscoped queries
- `src/services/recommendation.ts` - 4+ unscoped queries
- `src/services/evidence.ts` - 3+ unscoped queries
- `src/services/engagement.ts` - 3+ unscoped queries
- `src/services/action.ts` - 3+ unscoped queries
- (10+ more services with similar issues)

---

## Implementation Priority

### Tier 1: CRITICAL (Block production - fix immediately)
1. All findUnique queries without workspaceId filter
2. All update queries without workspaceId filter
3. All delete queries without workspaceId filter
4. Impact: Enables direct cross-tenant access

**Files**:
- decisions/[decisionId]/route.ts ✅ DONE
- decisions/[decisionId]/evaluate/route.ts ✅ DONE
- engagements/[engagementId]/business-impact/detail/route.ts ✅ DONE
- actions/[actionId]/impact-delta/route.ts ⏳ TODO
- decisions/list/route.ts ⏳ TODO
- engagements/[engagementId]/acknowledge/route.ts ⏳ TODO
- engagements/[engagementId]/execution-certainty/route.ts ⏳ TODO
- intelligence/recommendations/route.ts ⏳ TODO

### Tier 2: HIGH (Fix before release)
All findMany queries without workspaceId in where clause
- Impact: Leaks data within routes that check membership, but allows enumeration/scanning

### Tier 3: MEDIUM (Can defer)
Service-layer queries (behind route-level auth, but still need fixing for:
- Internal service-to-service calls
- Future refactoring safety
- Systematic consistency)

---

## Fixing Strategy

### For Routes (Quickest)

Each route needs:
1. Extract `workspaceId` from request (header or query param)
2. Validate it matches authenticated user's workspace (done via `enforceWorkspaceScoping`)
3. Add `workspaceId` to ALL `where` clauses in Prisma queries

**Template Fix**:
```typescript
// Step 1: Get workspaceId from request
const workspaceId = request.nextUrl.searchParams.get("workspaceId") ||
                     request.headers.get("x-workspace-id");
if (!workspaceId) return Response.json({ error: "..." }, { status: 400 });

// Step 2: Validate (usually already done)
const membership = await enforceWorkspaceScoping(request, workspaceId);
if (!membership) return Response.json({ error: "..." }, { status: 403 });

// Step 3: Add workspaceId to queries
const item = await db.entity.findUnique({
  where: { id: itemId, workspaceId }  // ADD THIS
});
```

### For Services

Services would need broader refactoring to accept and pass workspaceId:
1. Add `workspaceId` parameter to service function signatures
2. Update all service-to-service calls to pass workspaceId
3. Add workspaceId to all Prisma queries
4. Update all ~50+ call sites

This is covered in SERVICE_AUTH_REFACTOR.md (for authContext pattern).

---

## Testing Cross-Tenant Access (Must Fail)

For each fixed query, verify cross-tenant access is rejected:

```typescript
test("rejects cross-workspace access", async () => {
  // User A logs into workspace A
  const sessionA = loginAs(userA, workspaceA);
  
  // Get entity from Workspace B
  const entityB = createEntity(workspaceB);
  
  // Try to access entity B with session A credentials
  const response = await fetch(`/api/entities/${entityB.id}`, {
    headers: { "authorization": sessionA.token }
  });
  
  // MUST fail
  expect(response.status).toBe(404); // Treat as "not found"
  // OR 403 Forbidden would also be acceptable
  // But 200 OK is CRITICAL BUG
});
```

---

## Automated Scanning

To find remaining unscoped queries:

```bash
# Find all findUnique calls
grep -r "findUnique.*where.*{" src/app/api src/services --include="*.ts" | \
  grep -v "workspaceId" | \
  grep -v "test\|integration"

# Find all findMany calls
grep -r "findMany.*where.*{" src/app/api src/services --include="*.ts" | \
  grep -v "workspaceId" | \
  grep -v "test\|integration"

# Find all update calls
grep -r "\.update.*where.*{" src/app/api src/services --include="*.ts" | \
  grep -v "workspaceId" | \
  grep -v "test\|integration"
```

---

## Completion Checklist

### Routes (18 total, 3 fixed, 15 remaining)
- ✅ decisions/[decisionId]/route.ts
- ✅ decisions/[decisionId]/evaluate/route.ts
- ✅ engagements/[engagementId]/business-impact/detail/route.ts
- [ ] actions/[actionId]/impact-delta/route.ts
- [ ] decisions/list/route.ts
- [ ] engagements/[engagementId]/acknowledge/route.ts
- [ ] engagements/[engagementId]/execution-certainty/route.ts (5+ queries)
- [ ] intelligence/recommendations/route.ts
- [ ] intelligence/summary/route.ts
- [ ] decisions/submit-external/route.ts (✅ DISABLED, no longer vulnerable)
- [ ] onboarding/workspace/route.ts (workspace creation - lower risk)
- [ ] onboarding/invite/route.ts (multi-user workspace join)
- [ ] auth/login/route.ts (user lookup - acceptable as public)
- [ ] And 5+ more...

### Services (30+ queries in 10+ files)
- Covered in separate SERVICE_AUTH_REFACTOR.md
- Requires more comprehensive refactoring
- Can be done after routes are secured

### Tests
- Not blocking (test-only code)
- Should be updated for consistency
- Many test files manually construct workspaceId

---

## Risks of NOT Fixing

🔴 **CRITICAL RISK**: Cross-workspace data access
- Authenticated user in Workspace A can:
  - Read decisions from Workspace B (if they know the ID)
  - Read engagements from Workspace B
  - Potentially modify data from Workspace B (update endpoints)
  - Enumerate all entities by trying sequential IDs

Example attack:
```typescript
// Attacker in Workspace A
// Workspace B has well-known engagement ID "550e8400-..."
// Attacker calls:
GET /api/engagements/550e8400.../business-impact/detail
// Even without Workspace B credentials, they see B's engagement details
// because the route doesn't scope queries by workspace
```

---

## Timeline & Effort

| Phase | Task | Effort | Risk |
|-------|------|--------|------|
| 1 | Fix 9 high-risk routes | 2-3 hours | BLOCKING |
| 2 | Fix remaining 6 routes | 1 hour | HIGH |
| 3 | Add cross-tenant tests | 1 hour | MEDIUM |
| 4 | Fix services | 4-6 hours | MEDIUM |
| 5 | Full test suite | 1 hour | LOW |

**Total: 9-11 hours** to eliminate all cross-tenant access vulnerabilities

---

## Changes Made This Session

✅ `src/app/api/decisions/[decisionId]/route.ts` - Fixed
✅ `src/app/api/decisions/[decisionId]/evaluate/route.ts` - Fixed
✅ `src/app/api/engagements/[engagementId]/business-impact/detail/route.ts` - Fixed

**Commit**: `5d13f55` - "Add workspace scoping to critical Prisma queries (part 1)"

---

## Next Steps

1. **Immediate** (Next 30 minutes):
   - Fix remaining 6 high-risk routes (actions, decisions/list, engagements, intelligence)
   - All are straightforward `{ id, workspaceId }` additions

2. **Short-term** (Next 1-2 hours):
   - Add integration tests verifying cross-tenant access fails
   - Verify all routes handle missing workspaceId with 400/403

3. **Medium-term** (Next session):
   - Systematically fix service-layer queries
   - Follows pattern from SERVICE_AUTH_REFACTOR.md

---

## Production Impact

Until remaining routes are fixed:
- **CRITICAL**: Any authenticated user can potentially access other workspaces' data
- **Workaround**: Only deploy with single-workspace or fully trusted users
- **Mitigation**: IP-based access control / VPN-only deployment

---

**Status**: 17% complete (3 of 18 critical routes fixed)  
**Blocking**: Production deployment until routes are fully scoped  
**Next**: Fix actions, decisions/list, execution-certainty routes (30-45 minutes)
