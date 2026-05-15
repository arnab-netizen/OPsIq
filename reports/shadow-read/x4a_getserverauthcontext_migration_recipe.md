# X4A: Lane 4 getServerAuthContext Migration Recipe

**Phase:** X4A (Audit Only)  
**Date:** 2026-05-15  
**Status:** NO CANDIDATES FOUND

---

## Audit Finding

**getServerAuthContext() in Routes:** NOT PRESENT

- **Definition:** `src/lib/auth-guard.ts:107` (exists, defined)
- **Active Usage in Routes:** ZERO
- **Current Classification:** Unused utility function

---

## Why No Migration Recipe

The Lane 4 migration recipe cannot be drafted because there are no route handlers that currently use `getServerAuthContext()`. The function is available in the auth-guard module but not invoked anywhere in the route handler layer.

### What getServerAuthContext() Is

From auth-guard.ts:

```typescript
/**
 * Get server-derived auth context from cookies (not headers).
 * Does NOT require valid auth (returns null if session invalid).
 * Use for optional auth endpoints.
 */
export async function getServerAuthContext(workspaceId: string = "system"): Promise<AuthContext | null>
```

**Pattern:** Fails open (optional auth, returns null if session invalid)  
**Use Case:** Handlers that accept anonymous requests and conditionally use auth context  
**Current Status:** Defined but unused

---

## Remaining Violations Inventory

Current 455 violations are distributed across:
- `withAuth()` calls (multiple patterns)
- `requireAuth()` calls
- `requireSession()` calls
- `getPolicyContext()` calls
- `auth-guard` imports in service/infrastructure layers

None of these are `getServerAuthContext()` calls.

---

## Recommendation

### Do Not Proceed with Lane 4

Lane 4 as scoped (migrate getServerAuthContext() usage in routes) has no actionable candidates in the current codebase.

### Alternative Next Actions

1. **Address withAuth() + service patterns** (Lanes 5-9): Focus on service-level auth patterns that still use legacy withAuth() and require design/refactoring
2. **Infrastructure patterns** (Lanes 9-10): Governance-level and infrastructure-level auth patterns
3. **Gap Analysis:** Complete audit of remaining 455 violations to identify actual next-lane patterns

---

## Constraint Compliance (X4A)

| Constraint | Status | Notes |
|-----------|--------|-------|
| NO_ROUTE_MIGRATION | ✓ PASS | No routes migrated (none available) |
| NO_BULK_REPLACE | ✓ PASS | No bulk operations |
| NO_BRIDGE_EXPANSION | ✓ PASS | No bridges added |
| NO_FEATURE_WORK | ✓ PASS | Audit only |
| NO_NEW_GOVERNANCE | ✓ PASS | No governance added |
| NO_WRAPPER_CHANGE | ✓ PASS | No wrappers modified |
| NO_SCANNER_CHANGE | ✓ PASS | Scanner unchanged |

**Compliance: 7/7** ✓

---

## Next Phase Decision Required

User authorization needed for one of:
1. **X4B (Alternative Gap Analysis):** Audit remaining 455 violations to identify actual next-lane patterns
2. **X5 (Service-Level Refactor):** Proceed to Lanes 5-9 (service/infrastructure patterns)
3. **Defer Lane 4:** Mark Lane 4 as deferred, move to other lanes

---

**Status:** ✓ AUDIT COMPLETE - NO CANDIDATES FOUND
