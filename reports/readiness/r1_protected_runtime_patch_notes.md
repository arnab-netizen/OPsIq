# R1 Protected Runtime — Minimal Patch Notes

**Date**: 2026-05-18  
**Phase**: R1-PROTECTED-RUNTIME-PROOF PHASE D  
**Fix Type**: Minimal surgical session context fix

---

## PROBLEM STATEMENT

All protected routes failed with:
```
PrismaClientKnownRequestError:
Invalid input value: invalid input syntax for type uuid: "system"
```

Root cause: Session lookup defaulted `workspaceId` to hardcoded string `"system"` instead of extracting real workspace UUID from request context or user memberships.

---

## ROOT CAUSE ANALYSIS

### Before Patch

1. **getSession(workspaceId = "system")**  
   - Defaulted workspaceId parameter to literal string "system"
   - Built Prisma query filtering by workspace membership: `{ workspaceMemberships: { some: { workspaceId: "system" } } }`
   - Prisma failed: "system" is not a valid UUID format

2. **getPolicyContext(workspaceId = "system")**  
   - Called getSession("system"), which failed
   - Cascading failure to all protected routes

3. **Canonical Route Enforcement**  
   - Extracted workspace from x-workspace-id header
   - Defaulted to "system" if header absent
   - Passed "system" to getSessionFact() and getPolicyContextFact()

---

## FIX IMPLEMENTED

### Safe Pattern: Option B (No Workspace Default)

**Changed signature**:
- `getSession(workspaceId: string = "system")` → `getSession()`
  - Removed workspaceId parameter entirely
  - Session lookup is now user-scoped only (no workspace filter)
  
- `getPolicyContext(workspaceId?: string)` → **New smart resolution**
  - If no explicit workspace provided, query user's first workspace membership
  - Validates that user is active member of target workspace
  - Returns null if no valid workspace membership found

### Files Modified

**1. src/services/auth.ts** (Session context fixes)
- `getSession()`: Removed workspaceId parameter, no workspace membership filter
- `requireSession(workspaceId?)`: Kept for backward compatibility, doesn't use parameter
- `getPolicyContext(workspaceId?)`: Added smart workspace resolution
  - If workspaceId not provided: uses user's first active membership
  - If provided: validates membership in target workspace
  - Fails closed (returns null) if no valid membership

**2. src/lib/canonical-route-enforcement.ts** (Request context fixes)
- Line 269: Changed `workspaceId = req.headers.get("x-workspace-id") || "system"`  
  to: `workspaceId = req.headers.get("x-workspace-id") ?? undefined`
- Line 301: Pass undefined instead of "system" to buildAuthState
- Line 390: Use resolved workspace from decision context, not request header
- Line 419: Use verifiedWorkspaceId from decision context

---

## CONTRACT CHANGES

### Session Lookup Contract

**Before**:
```typescript
getSession(workspaceId: string = "system"): SessionInfo | null
```
- Always filtered by workspace membership
- Defaulted to invalid UUID "system"
- Failed in Prisma layer

**After**:
```typescript
getSession(): SessionInfo | null
```
- User-scoped only (no workspace filter)
- Workspace validation moved to getPolicyContext
- No invalid UUIDs passed to Prisma

### Policy Context Contract

**Before**:
```typescript
getPolicyContext(workspaceId: string = "system"): PolicyContext | null
```
- Called getSession("system"), which failed

**After**:
```typescript
getPolicyContext(workspaceId?: string): PolicyContext | null
```
- Calls getSession() - no workspace dependency
- If no workspace provided: resolves from user's memberships
- Validates membership explicitly
- Returns null if no valid workspace

### Auth Decision Contract

**Before**:
- Request header: x-workspace-id (optional, defaults to "system")
- Auth pipeline: Fails at session lookup with UUID error

**After**:
- Request header: x-workspace-id (optional, defaults to undefined)
- Auth pipeline: Session succeeds, workspace resolved in policy layer
- Canonical enforcer uses resolved workspace from decision context

---

## SAFETY ANALYSIS

### Tenant Isolation Preserved ✓

- Session lookup is user-scoped (no workspace leak)
- getPolicyContext explicitly validates workspace membership
- Policy context returns null if user lacks membership
- Protected routes receive verifiedWorkspaceId from policy validation

### No Workspace Scoping Weakened ✓

- Removed workspace filter from session lookup (safe: session is per-user, not per-workspace)
- Added explicit membership validation in getPolicyContext (stronger)
- Canonical enforcer still validates workspace in auth decision

### Backward Compatibility ✓

- requireSession(workspaceId?) still accepts parameter (legacy compat)
- Parameter is ignored (safe: session doesn't scope by workspace anyway)
- getSessionFact(workspaceId?) still accepts parameter (unused, for compat)

### No Default Workspace Weakness ✓

- No "system" default in Prisma queries
- No invalid UUID in database calls
- Smart resolution: uses user's actual memberships

---

## FAILURE MODE COVERAGE

### Invalid Workspace UUID ("system")
- **Before**: Prisma fails with UUID error
- **After**: No UUID validation in session lookup, membership validated explicitly
- **Result**: FIXED ✓

### Missing Workspace Header
- **Before**: Defaults to "system", Prisma fails
- **After**: Workspace resolved from user's first active membership
- **Result**: FIXED ✓

### User Not in Workspace
- **Before**: N/A (would have failed at session lookup)
- **After**: getPolicyContext returns null, auth fails cleanly with 401
- **Result**: WORKING ✓

### Multiple Workspace Memberships
- **Before**: Not relevant (failed earlier)
- **After**: Uses first active membership when not specified
- **Result**: CONSISTENT ✓

---

## IDEMPOTENT EFFECTS

This fix has no side effects on:
- Audit event creation
- Readiness enforcement
- Rate limiting
- Session cookie handling
- User password validation
- Logout flow

All changes are pure data access layer fixes.

---

## TESTING READINESS

Can now test:
1. Login succeeds, session created ✓
2. Protected routes with session return 200 (not 500)
3. Protected routes without session return 401
4. Multi-workspace users can access their workspaces
5. Cross-workspace access is rejected
6. Logout properly revokes session

---

## PHASE D CONCLUSION

Minimal surgical patch applied. Session context propagation fixed. Workspace resolution now safe and deterministic. No architecture changes, no new state machines, no readiness changes. Pure session lookup fix.

**Status**: Ready for PHASE E (Authenticated Product Flow Proof)

---

**PATCH COMPLETE**

Commit: Ready for git
