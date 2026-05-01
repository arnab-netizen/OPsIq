# Read Routes Security Patch - Implementation Guide

**Status:** Phase 1 (Critical gaps) COMPLETE | Phase 2 (Systematic patching) IN PROGRESS

## What Has Been Done

### Patched Routes (4 routes - Critical security gaps)

✅ **GET /api/report**
- Status: CRITICAL → FIXED
- Issue: No authentication at all
- Fix: Added `requireAuthForCapability(SYSTEM_VIEW_AUDIT)` + workspace validation
- Workspace: From query param `?workspaceId=`

✅ **GET /api/entity**
- Status: CRITICAL → FIXED  
- Issue: No authentication at all
- Fix: Added `requireAuth()` + workspace validation
- Workspace: From header `x-workspace-id`

✅ **GET /api/leads**
- Status: MEDIUM → FIXED
- Issue: Had auth but no workspace membership re-validation
- Fix: Added `enforceWorkspaceScoping()` to validate user in workspace
- Workspace: From header `x-workspace-id`

✅ **GET /api/clients**
- Status: MEDIUM → FIXED
- Issue: Had auth but no workspace membership re-validation
- Fix: Added `enforceWorkspaceScoping()` to validate user in workspace
- Workspace: From header `x-workspace-id`

### Previously Patched Routes (10 routes)

✅ GET /api/control/today - enforceWorkspaceScoping()
✅ GET /api/business-impact/summary - enforceWorkspaceScoping()
✅ GET /api/business-impact/decision/[id] - enforceWorkspaceScoping()
✅ GET /api/governance/metrics - requireWorkspaceContext()
✅ GET /api/audit - requireWorkspaceContext()
✅ GET /api/decisions/list - enforceWorkspaceScoping()
✅ GET /api/onboarding/** - Intentionally public (signup flow)
✅ GET /api/health - Intentionally public (monitoring)
✅ GET /api/verify - Intentionally public (integrity verification)
✅ POST /api/auth/login - Public (authentication)

---

## What Still Needs To Be Done

### Routes with Auth but No Workspace Isolation (50+ routes)

These routes HAVE authentication (`withAuth()`, `getSession()`, `requireSession()`) but LACK workspace membership validation.

**Pattern 1: Using x-workspace-id header (30+ routes)**

Current pattern:
```typescript
export const GET = withRequestContext(async (request) => {
  const workspaceId = request.headers.get("x-workspace-id") || "";
  await withAuth({ capability: CAPABILITIES.X_VIEW });
  // ❌ Missing: enforceWorkspaceScoping(request, workspaceId)
  const result = await listX(workspaceId, params);
  return Response.json(result);
});
```

Routes needing this fix:
- GET /api/engagements
- GET /api/engagements/[engagementId]/* (nested: actions, findings, recommendations, kpis, condition, etc.)
- GET /api/actions
- GET /api/actions/[actionId]
- GET /api/deliverables
- GET /api/deliverables/[deliverableId]
- GET /api/evidence
- GET /api/evidence/[evidenceId]
- GET /api/evidence-bundles
- GET /api/evidence-bundles/[bundleId]
- GET /api/findings
- GET /api/findings/[findingId]
- GET /api/recommendations
- GET /api/recommendations/[recommendationId]
- GET /api/users
- GET /api/users/[userId]
- GET /api/users/[userId]/memberships
- GET /api/users/[userId]/roles
- GET /api/value
- GET /api/value/7day
- GET /api/value/summary
- GET /api/intelligence/** (insights, patterns, recommendations, summary)
- GET /api/governance/alerts
- GET /api/observability/summary
- GET /api/operator
- GET /api/operator/myday
- GET /api/operator/queue
- GET /api/calibration
- GET /api/decision/export
- GET /api/control/blocked-metrics
- And more...

**Fix Required:**
```typescript
export const GET = withRequestContext(async (request) => {
  await withAuth({ capability: CAPABILITIES.X_VIEW });
  
  // ✅ ADD THIS:
  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }
  
  const membership = await enforceWorkspaceScoping(request, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }
  
  const result = await listX(workspaceId, params);
  return Response.json(result);
});
```

---

## Testing Strategy

### Test Files Created

1. **read-routes-auth-checks.test.ts**
   - Documents security controls in patched routes
   - Proves fail-closed behavior for each control

2. **read-routes-integration.test.ts**
   - Documents comprehensive auth layer architecture
   - Summarizes all three security layers (auth, capability, workspace)
   - Lists patched vs. unpatched routes
   - Documents next steps

### How to Test Your Patches

For each patched route, add a test proving:

```typescript
describe("GET /api/your-route", () => {
  it("fails closed: rejects unauthenticated access", async () => {
    vi.mocked(authService.requireSession).mockRejectedValueOnce(
      new UnauthorizedError("No session")
    );
    const request = createRequest();
    const response = await yourGETHandler(request);
    expect([400, 401, 403]).toContain(response.status);
  });

  it("fails closed: rejects missing workspace ID", async () => {
    vi.mocked(authService.requireSession).mockResolvedValueOnce(session);
    vi.mocked(authService.requirePolicyContext).mockResolvedValueOnce(policy);
    const request = createRequest(); // No workspaceId
    const response = await yourGETHandler(request);
    expect(response.status).toBe(400);
  });

  it("fails closed: rejects cross-tenant access", async () => {
    vi.mocked(authService.requireSession).mockResolvedValueOnce(session);
    vi.mocked(authService.requirePolicyContext).mockResolvedValueOnce(policy);
    vi.mocked(workspaceMiddleware.enforceWorkspaceScoping).mockResolvedValueOnce(null);
    const request = createRequest(differentWorkspaceId);
    const response = await yourGETHandler(request);
    expect(response.status).toBe(403);
  });

  it("succeeds with valid auth + workspace membership", async () => {
    vi.mocked(authService.requireSession).mockResolvedValueOnce(session);
    vi.mocked(authService.requirePolicyContext).mockResolvedValueOnce(policy);
    vi.mocked(workspaceMiddleware.enforceWorkspaceScoping).mockResolvedValueOnce({
      userId: userId,
      role: "admin",
    });
    const request = createRequest(validWorkspaceId);
    const response = await yourGETHandler(request);
    expect(response.status).toBe(200);
  });
});
```

---

## Implementation Checklist

### Phase 2: Patch Remaining Routes (50+ routes)

For each route:

- [ ] Identify workspace source (header or query param)
- [ ] Add workspace validation code
- [ ] Add enforceWorkspaceScoping() call  
- [ ] Verify build succeeds (`npm run build`)
- [ ] Verify tests pass (`npm test`)
- [ ] Add test cases proving fail-closed behavior
- [ ] Commit with clear message

Example commit message:
```
Patch GET routes with workspace isolation: engagements, actions, findings, etc.

- Added enforceWorkspaceScoping() to 5 routes
- All routes now validate user is member of workspace
- Fail-closed: cross-tenant access returns 403
- Added tests proving auth + workspace + capability enforcement
- All 2218 tests pass, build succeeds
```

### Phase 3: Standardize Workspace Parameter Pattern

Once Phase 2 complete:
- [ ] Standardize on query param pattern (better for REST, more testable)
- [ ] Migrate from x-workspace-id headers to ?workspaceId= query params
- [ ] Update all route handlers
- [ ] Update all client code that calls these routes

### Phase 4: Implement Real Multi-Tenancy

- [ ] Add workspace_id to session table schema
- [ ] Update getSession() to include workspace_id
- [ ] Remove workspace parameter from routes (get from session)
- [ ] Simplify all route patterns to not require workspace param
- [ ] Remove temporary userId-as-workspace pattern

---

## Key Files

- **Auth primitives:** `/src/lib/auth-guard.ts`
  - `requireAuth()` - simple auth
  - `requireAuthForCapability(cap)` - capability-based auth
  - `withAuth()` - legacy wrapper

- **Workspace validation:** `/src/middleware/workspace-enforcement.ts`
  - `enforceWorkspaceScoping(request, workspaceId)` - validates membership

- **Role→Capability mapping:** `/src/policies/capability-check.ts`
  - `ROLE_CAPABILITIES` - defines who can do what

- **Session management:** `/src/services/auth.ts`
  - `getSession()` - get session if exists
  - `requireSession()` - require session or throw

---

## Fail-Closed Principle

Every read route should follow this pattern:

```
Request arrives
  ↓
Step 1: Authenticate (fail-closed)
  → No session → error
  → Invalid session → error
  ↓
Step 2: Check capability (fail-closed)
  → User lacks capability → 403
  ↓
Step 3: Validate workspace membership (fail-closed)
  → Not member of workspace → 403
  ↓
Step 4: Execute business logic
  → Return data
```

All failure paths return 4xx errors. No data leaks. No silent failures.

---

## References

- **AUTH_SURFACE.md** - Comprehensive security audit findings
- **AUTH_PATTERNS.md** - Best practices and patterns guide
- **read-routes-auth-checks.test.ts** - Documentation test for patched routes
- **read-routes-integration.test.ts** - Integration test proving security architecture

---

**Next Step:** Pick 5-10 routes from the "Routes with Auth but No Workspace Isolation" list and apply the fix following the pattern above. Commit each batch with clear messages.

