# PHASE 6: ROUTE CONVERGENCE & MIDDLEWARE ENFORCEMENT
## Route Inventory & Migration Plan

**Generated**: 2026-05-14  
**Status**: INITIAL SCAN COMPLETE

---

## EXECUTIVE SUMMARY

**Total Routes**: 144  
**Estimated Protected Routes**: 120+  
**Current Auth Divergence**: High

Routes currently use:
- `withEnforcementFull()` — Runtime enforcement wrapper
- `withAuth()` — Manual session/policy fetching
- `enforceWorkspaceScoping()` — Workspace checks in handlers
- Direct capability checks in handlers
- Inline error returns (Response.json(401/403))

**Risk**: 120+ routes can diverge from canonical pipeline independently.

---

## CURRENT ROUTE PATTERNS

### Pattern 1: withAuth() + Inline Workspace Scoping
```typescript
export const GET = withEnforcementFull(async (request: NextRequest) => {
  const workspaceId = request.headers.get("x-workspace-id") || "system";
  const { session, policy } = await withAuth(undefined, workspaceId);
  
  // Handler owns workspace validation
  if (!policy.workspace) {
    return Response.json({ error: "Workspace denied" }, { status: 403 });
  }
  
  // Business logic
  return { data: result };
});
```

**Issues**:
- ✗ withAuth() called at handler level (not pipeline)
- ✗ Workspace validation in handler (not centralized)
- ✗ Error Response.json() in handler (not standardized)
- ✗ No guaranteed execution trace
- ✗ Telemetry emitted by handler (inconsistent)

### Pattern 2: Inline Capability Checks
```typescript
if (!policy.capabilities.includes(CAPABILITIES.AUDIT_READ)) {
  throw new ForbiddenError("CAPABILITY_DENIED", "Missing AUDIT_READ");
}
```

**Issues**:
- ✗ Capability checks scattered across handlers
- ✗ No unified capability evaluation
- ✗ Error handling varies by route
- ✗ No guaranteed sampling/stratification

### Pattern 3: Workspace Enforcement Middleware
```typescript
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";

const POST = enforceWorkspaceScoping(async (request) => {
  // Handler assumes workspace validated
  // But still calls withAuth() for session
  const { session } = await withAuth();
  return { data: result };
});
```

**Issues**:
- ✗ Middleware-level enforcement (pre-handler)
- ✗ Still requires handler-level auth calls
- ✗ No integration with pipeline executor
- ✗ Mixed responsibility (middleware + handler)

---

## ROUTE CLASSIFICATION

### TIER A: LOW RISK (Read-Only, Simple)
**Count**: ~40 routes
- GET-only routes
- No mutations
- No external APIs
- No workspace scoping required

**Examples**:
- `/api/me` — Current user info
- `/api/value` — Value calculations
- `/api/readiness` — System readiness
- `/api/health` — Health checks

**Migration**: Straightforward, lowest risk

### TIER B: MEDIUM RISK (Workspace-Scoped)
**Count**: ~60 routes
- Reads from workspace
- Pagination/filtering
- Light mutations (non-critical)
- Workspace-scoped only

**Examples**:
- `/api/actions` — Action queries
- `/api/deliverables` — Deliverable CRUD
- `/api/findings` — Finding queries
- `/api/notifications` — Notification queries

**Migration**: Medium risk, clear dependencies

### TIER C: HIGH RISK (Mutations + External)
**Count**: ~20 routes
- Complex mutations
- Multiple steps
- External API calls
- Billing implications

**Examples**:
- `/api/billing` — Billing operations
- `/api/webhooks` — Webhook handlers
- `/api/execute` — Execution flows
- `/api/override` — Capability overrides

**Migration**: High risk, careful testing required

### TIER D: CRITICAL (Auth-Sensitive)
**Count**: ~4 routes
- Session management
- Subscription state
- Audit exports
- Replay-sensitive endpoints

**Examples**:
- `/api/auth/*` — Auth routes
- `/api/audit/export` — Audit exports
- `/api/subscription` — Subscription state

**Migration**: Highest risk, audit-required

---

## CURRENT AUTH DIVERGENCE PATTERNS

### Auth Call Sites (6+ routes)
Routes that explicitly call `withAuth()`:
- `/api/me`
- `/api/actions`
- `/api/audit`
- `/api/calibration`
- `/api/clients`
- `/api/deliverables`
- (More not listed)

**Risk**: Each route fetches session/policy independently, could diverge from pipeline.

### Workspace Checks (21 routes)
Routes with workspace validation:
- Inline `workspace` checks in handlers
- `enforceWorkspaceScoping()` middleware
- Header-based workspace selection

**Risk**: Inconsistent workspace semantics across routes.

### Capability Checks (24 routes)
Routes with capability validation:
- `policy.capabilities.includes()` checks
- Inline role-based guards
- Capability constants scattered

**Risk**: No unified capability evaluation system.

### Error Returns (22 routes)
Routes returning auth errors:
- `Response.json({ error }, { status: 401/403 })`
- Custom error messages
- Inconsistent status semantics

**Risk**: Auth status codes not standardized through pipeline.

---

## PHASE 6 MIGRATION STRATEGY

### Target State

**ALL 144 routes use canonical executor**:
```typescript
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // ctx = { verifiedActor, verifiedWorkspace, verifiedCapabilities, trace, correlationId }
    // NO auth logic in handler
    // NO workspace checks in handler
    // NO capability checks in handler
    // Business logic only
    return { data: result };
  }
);
```

### Guarantees After Migration

✓ ALL protected routes use canonical pipeline  
✓ NO handler performs auth checks  
✓ NO direct getSession in handlers  
✓ NO direct workspace checks in handlers  
✓ NO direct capability checks in handlers  
✓ NO auth Response.json in handlers  
✓ NO legacy wrappers remain  
✓ ALL routes emit standardized telemetry  
✓ ALL routes generate execution traces  
✓ NO mutations before auth completion  
✓ ALL auth semantics globally identical  

### Migration Tiers (Sequential)

**Phase 6.1**: TIER A (Low Risk, Read-Only)  
- 40 routes, ~2 hours
- Test equivalence immediately

**Phase 6.2**: TIER B (Medium Risk, Workspace)  
- 60 routes, ~4 hours
- Test workspace semantics

**Phase 6.3**: TIER C (High Risk, Mutations)  
- 20 routes, ~3 hours
- Full adversarial testing

**Phase 6.4**: TIER D (Critical, Auth)  
- 4 routes, ~2 hours
- Audit trail verification

---

## NEXT STEPS

1. **STEP 2**: Build migration tier classification (completed above)
2. **STEP 3**: Build `withCanonicalEnforcement()` wrapper
3. **STEP 4**: Implement migration for TIER A routes
4. **STEP 5**: Pre-auth mutation detector and guard
5. **STEP 6**: Route convergence verifier
6. **STEP 7**: Legacy path elimination scanner
7. **STEP 8**: Migration equivalence tests
8. **STEP 9**: Adversarial route tests
9. **STEP 10**: Final convergence report

---

## RISKS & MITIGATIONS

| Risk | Mitigation |
|------|-----------|
| Handler logic divergence | Canonical wrapper enforces context shape |
| Workspace semantics drift | Unified workspace validator in pipeline |
| Capability check inconsistency | Pre-auth guard prevents handler checks |
| Pre-auth mutations | Mutation spy system detects violations |
| Status code divergence | Pipeline returns standardized codes |
| Telemetry bypass | Pipeline emission, not handler emission |
| Trace gaps | Pipeline generates mandatory traces |

---

## KNOWN BLOCKERS

None identified yet. Scan ongoing.

---

## SUCCESS CRITERIA

- [ ] 144/144 routes migrated to canonical executor
- [ ] 0 routes using legacy auth patterns
- [ ] 0 pre-auth mutations detected
- [ ] 100% execution trace generation
- [ ] 100% standardized telemetry emission
- [ ] 100% semantic equivalence tests passing
- [ ] 100% adversarial tests passing
- [ ] Legacy path scanner reports 0 violations
