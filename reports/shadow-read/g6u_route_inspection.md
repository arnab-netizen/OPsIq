# G6U-B: TARGET ROUTE INSPECTION

**Inspection Date**: 2026-05-14T13:45:00Z

---

## ROUTE 1: src/app/api/notifications/preferences/route.ts

### Method Handlers Present
- **GET** `/api/notifications/preferences` - Read preferences
- **PATCH** `/api/notifications/preferences` - Update preferences

### Workspace Source
- **Header**: x-workspace-id (line 40, 73)
- **Validation**: Manual throw if missing (lines 41-43, 74-76)
- **Wrapper compatibility**: ✓ YES (wrapper uses x-workspace-id header by default)

### Auth Pattern
- **Current**: Bridge pattern (withAuth + canonicalizeAuthContext)
- **Wrapper**: withEnforcementFull
- **GET line 38**: `const auth = await withAuth();`
- **PATCH line 71**: `const auth = await withAuth();`

### Service Calls
- **GET**: `getPreferences(workspaceId, userId)`
- **PATCH**: `setPreferences({ workspaceId, userId, ...parsed })`
- **Both**: Non-reverted services (notification-service)
- **Wrapper compatibility**: ✓ YES (services don't require auth context parameter)

### Response Shape
- **GET**: `{ success: true, preferences: { ... } }`
- **PATCH**: `{ success: true, preferences: { ... } }`
- **Structure**: Consistent success wrapper with data
- **Preservable**: ✓ YES

### Status-Code Behavior
- **Success (GET/PATCH)**: 200 with JSON body
- **Auth fail**: wrapper will return 401
- **Workspace fail**: wrapper will return 401
- **Type validation fail (PATCH)**: Zod throws 400
- **Wrapper compatibility**: ✓ YES

### Mutation/Read-Only Status
- **GET**: Read-only
- **PATCH**: Mutation (updates preferences)
- **Wrapper compatibility**: ✓ YES (wrapper supports all methods)

### Risk Level: **LOW**
- ✓ Uses standard header-based workspace (wrapper default)
- ✓ Services are safe (not reverted)
- ✓ Response shapes are simple
- ✓ Both handlers follow same pattern
- ✓ No custom permission logic (wrapper handles auth)

### Blockers: **NONE** ✓

---

## ROUTE 2: src/app/api/entitlement/route.ts

### Method Handlers Present
- **GET** `/api/entitlement/tier` - Get subscription tier
- **POST** `/api/entitlement/check-capability` - Check capability

### Workspace Source
- **Header**: x-workspace-id (line 44, 73)
- **Validation**: Manual throw if missing (lines 45-47, 74-76)
- **Wrapper compatibility**: ✓ YES (wrapper uses x-workspace-id header by default)

### Auth Pattern
- **Current**: Bridge pattern (withAuth + canonicalizeAuthContext)
- **Wrapper**: withEnforcementFull
- **GET line 42**: `const auth = await withAuth();`
- **POST line 71**: `const auth = await withAuth();`

### Service Calls
- **GET**: 
  - `getSubscriptionTier(workspaceId)` - Read tier
  - `getTierConfig(tier)` - Read config
  - `enforceWorkspaceScoping(request, workspaceId)` - Middleware
- **POST**:
  - `hasCapability(workspaceId, parsed.capability)` - Read capability
  - `enforceWorkspaceScoping(request, workspaceId)` - Middleware
- **All services**: Safe (not reverted, workspace-scoped)
- **Wrapper compatibility**: ✓ YES (services don't require auth context parameter)

### Response Shape
- **GET**: `{ success: true, tier, config }`
- **POST**: `{ success: true, allowed: true, capability }`
- **Structure**: Consistent success wrapper with data
- **Preservable**: ✓ YES

### Status-Code Behavior
- **Success (GET/POST)**: 200 with JSON body
- **Auth fail**: wrapper will return 401
- **Workspace fail**: wrapper will return 401
- **Capability denied (POST)**: Currently throws Error 500, wrapper will return consistent error
- **Type validation fail (POST)**: Zod throws 400
- **Wrapper compatibility**: ✓ YES (with minor improvement: consistent error handling)

### Mutation/Read-Only Status
- **GET**: Read-only (subscription tier check, not mutation)
- **POST**: Read-only (capability check, not mutation, line 87)
- **Billing semantics**: PRESERVED - No mutations to subscription/billing data
- **Wrapper compatibility**: ✓ YES

### Risk Level: **LOW**
- ✓ Uses standard header-based workspace (wrapper default)
- ✓ Both handlers are read-only (no subscription mutations)
- ✓ Services are safe (not reverted)
- ✓ Billing semantics preserved (check-only, no update)
- ✓ Response shapes are simple
- ✓ Current enforceWorkspaceScoping middleware can be removed (wrapper handles)

### Blockers: **NONE** ✓

---

## MIGRATION SUMMARY

| Criterion | Route 1 | Route 2 | Status |
|-----------|---------|---------|--------|
| Workspace source | Header | Header | ✓ OK |
| Auth pattern | Bridge | Bridge | ✓ OK |
| Service safety | Safe | Safe | ✓ OK |
| Response preservable | Yes | Yes | ✓ OK |
| Status codes consistent | Yes | Yes | ✓ OK |
| Mutation risk | Low (PATCH) | None (read-only) | ✓ OK |
| No blockers | ✓ YES | ✓ YES | ✓ PROCEED |

---

## VERDICT

✓ **Both routes can be safely migrated to withCanonicalEnforcement**

- No blockers identified
- Both follow same pattern as decisions/list (G6T success)
- Wrapper-compatible workspace sourcing
- Safe service calls
- Preservable response shapes

**Recommendation**: Proceed with migration

