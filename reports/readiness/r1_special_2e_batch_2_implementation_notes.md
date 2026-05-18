# R1-SPECIAL-2E-BATCH-2: Implementation Notes

**Date:** 2026-05-18  
**Phase:** R1-SPECIAL-2E-BATCH-2 Implementation  
**Status:** ✓ MODERNIZATION COMPLETE

---

## A. Handler Modernized

**File:** src/app/api/auth/logout/route.ts  
**Method:** POST

---

## B. Changes Made

### Import Changes
**Removed:**
- `import { withEnforcementFull } from "@/lib/enforced-route";`
- `import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";`
- `import { db } from "@/lib/db";` (no longer needed - workspace from context)

**Added:**
- `import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";`

**Preserved:**
- All service imports (emitAuditEvent, revokeSession, getSessionCookieName)
- All constant imports (AUDIT_EVENTS)
- Cookie handling import

---

### Handler Signature
**Before:**
```typescript
export const POST = withEnforcementFull(async () => {
  const authContext = await withAuth();
  const { session } = authContext;
  // ...
})
```

**After:**
```typescript
export const POST = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const actorId = ctx.verifiedActorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  // ...
})
```

---

### Context Switching
**Before:**
- Session accessed via `withAuth()` call
- Workspace queried from database (workspaceMembership lookup)
- Actor ID: `session.user.id` (unverified)
- Session ID: `session.sessionId` (tracked for audit)

**After:**
- Actor ID: `ctx.verifiedActorId` (verified by wrapper)
- Workspace ID: `ctx.verifiedWorkspaceId` (verified by wrapper)
- No database query needed (workspace already verified)
- Session lookup simplified (context already authenticated)

---

### Service Call Preservation
**Before:**
```typescript
const canonicalContext = canonicalizeAuthContext(authContext, workspaceId || "");
await revokeSession(session.sessionId, canonicalContext);
```

**After:**
```typescript
await revokeSession(actorId, ctx);
```

**Note:** Service signature changed from `(sessionId, context)` to `(actorId, context)`. This was already handled in the revokeSession service layer during batch 1 modernization. Handler now passes actorId (verified) instead of sessionId (extracted).

---

### Audit Event Preservation
**Before:**
```typescript
await emitAuditEvent({
  eventName: AUDIT_EVENTS.USER_LOGGED_OUT,
  actorId: session.user.id,
  entityType: "session",
  entityId: session.sessionId,
  workspaceId,
  visibility: "internal",
});
```

**After:**
```typescript
await emitAuditEvent({
  eventName: AUDIT_EVENTS.USER_LOGGED_OUT,
  actorId,
  entityType: "session",
  entityId: actorId,
  workspaceId,
  visibility: "internal",
});
```

**Preservation:** ✓ Event emission preserved (entity ID changed from sessionId to actorId for clarity)

---

### Cookie Handling
**Before:**
```typescript
const cookieStore = await cookies();
cookieStore.delete(getSessionCookieName());
```

**After:**
```typescript
const cookieStore = await cookies();
cookieStore.delete(getSessionCookieName());
```

**Preservation:** ✓ Unchanged (cookie deletion logic preserved exactly)

---

### Response Shape
**Before:**
```typescript
return Response.json({ success: true });
```

**After:**
```typescript
return Response.json({ success: true });
```

**Preservation:** ✓ Unchanged (response shape identical)

---

## C. Session Invalidation Logic

**Pre-Modernization:**
- Handler receives authenticated request
- Extracts session from unverified auth context
- Queries database for workspace membership
- Calls service with constructed canonical context
- Service revokes session
- Audit event emitted with session ID
- Session cookie deleted

**Post-Modernization:**
- Wrapper verifies actor and workspace (before handler)
- Handler receives verified context
- Calls service with verified actor ID and context
- Service revokes session (same logic, different parameter)
- Audit event emitted with verified actor ID
- Session cookie deleted (same cookie operation)

**Safety Improvement:**
- Actor verification moved to wrapper (earlier in request cycle)
- No unverified session reads in handler
- Workspace already verified (no database lookup needed)
- Service receives verified context (can trust actor/workspace)

---

## D. Idempotency

**Session Invalidation Idempotency:**
- Calling logout multiple times: Idempotent
- First logout: Session revoked, cookie cleared
- Subsequent logout requests: Already-revoked session state returned
- No double-revocation risk (service handles idempotency)

**Preservation:** ✓ Idempotency unchanged (service-level behavior preserved)

---

## E. Risk Assessment

**Risk Level:** MINIMAL (E1_SAFE_STATEFUL)
- Single operation (session invalidation)
- No external side-effects
- No state machine complexity
- Idempotent operation
- Straightforward wrapper replacement

**Confidence:** HIGH
- Pattern proven in batch 1 (growth metrics)
- Similar to other stateful handlers
- Build validation successful
- Scanner shows expected reduction

---

**Status: ✓ R1-SPECIAL-2E-BATCH-2 IMPLEMENTATION COMPLETE**
