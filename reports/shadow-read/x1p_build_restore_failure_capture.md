# X1P Build Restore: Failure Capture

**Date:** 2026-05-14
**Phase:** X1P-BUILD-RESTORE-A

## Build Status

**Build Result:** FAILED (TypeScript errors)
**Compilation:** ✓ Successful (Turbopack)
**Type Check:** ✗ Failed with 3 errors in scope

## TypeScript Errors (Scope-Specific)

### Error 1: clients/[clientId]/contacts/route.ts:76
```
Type error: Argument of type 'AuthContext' is not assignable to parameter of type 'CanonicalAuthContext'.
  Type 'AuthContext' is missing the following properties from type 'CanonicalAuthContext': 
  verifiedActorId, verifiedActorType, verifiedActor, verifiedWorkspaceId, and 2 more.

Location: createContact call
Code: await createContact({ ...body, clientId }, authContext, workspaceId)
Cause: X1P cleanup removed canonicalizeAuthContext() bridge, now passing AuthContext directly
Service signature: createContact(data, authContext: CanonicalAuthContext, workspaceId)
```

### Error 2: clients/[clientId]/route.ts:73
```
Type error: Argument of type '{ session: SessionInfo; policy: PolicyContext; }' is not assignable to parameter of type 'CanonicalAuthContext'.

Location: updateClient call
Code: await updateClient(clientId, body, { session, policy }, workspaceId)
Cause: X1P cleanup removed canonicalizeAuthContext() bridge, now passing auth object directly
Service signature: updateClient(clientId, input, authContext: CanonicalAuthContext, workspaceId)
```

### Error 3: clients/[clientId]/route.ts:128
```
Type error: Argument of type '{ session: SessionInfo; policy: PolicyContext; }' is not assignable to parameter of type 'CanonicalAuthContext'.

Location: archiveClient call (in POST handler)
Code: await archiveClient(clientId, { session, policy }, body.version, workspaceId)
Cause: X1P cleanup removed canonicalizeAuthContext() bridge, now passing auth object directly
Service signature: archiveClient(clientId, authContext: CanonicalAuthContext, version, workspaceId)
```

## Files Changed in X1P Cleanup
- src/app/api/clients/[clientId]/contacts/route.ts
- src/app/api/clients/[clientId]/route.ts
- src/app/api/control/blocked-metrics/route.ts (no errors)

## Test Status
**Cannot run** - Build fails, tests blocked by TypeScript errors

## Scanner Status
**Cannot run** - Build fails, scanner cannot execute without successful build

## Current Git State
- Branch: claude/verify-execution-hardening-LRoqi
- Changes: All staged and committed (d903bed)
- Working directory: Clean
- No uncommitted changes

## Root Cause
X1P_SELECTIVE_CLEANUP_1D24AD1 successfully removed unauthorized canonicalizeAuthContext() bridges from route handlers as directed. This exposed the service-layer type contract: services expect CanonicalAuthContext, routes now provide AuthContext. This is the expected emergence of the X1P_SERVICE_LAYER_PHASE blocker.

## Decision Point
Restore strategy must be determined:
1. **Option A:** Revert X1P cleanup (not allowed - violates user safety rules)
2. **Option B:** Reintroduce canonicalizeAuthContext as quarantined transitional bridges (allowed)
3. **Option C:** Change service signatures to accept AuthContext (NOT ALLOWED - violates no service weakening rule)

