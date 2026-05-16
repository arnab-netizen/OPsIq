# R1-C: Wrapper Signature Confirmation

**Date:** 2026-05-16  
**Phase:** R1-C (Step A - Wrapper Signature Verification)  
**Source:** src/lib/canonical-route-enforcement.ts

---

## Wrapper Definition

**Export:** `withCanonicalEnforcement`

**Handler Signature:**
```typescript
export type CanonicalHandler = (ctx: CanonicalAuthContext, params: Record<string, string>) => Promise<any>;
```

**Wrapper Signature:**
```typescript
export function withCanonicalEnforcement(
  handler: CanonicalHandler,
  options?: {
    requireWorkspace?: boolean;
    requireCapabilities?: string[];
    requireActorType?: "user" | "service" | ("user" | "service")[];
  }
): (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
```

---

## CanonicalAuthContext Interface

### Required Fields (Always Present)

| Field | Type | Purpose | Access Pattern |
|-------|------|---------|-----------------|
| `verifiedActorId` | `string` | Authenticated user/service ID | `ctx.verifiedActorId` |
| `verifiedActorType` | `"user" \| "service"` | Type of authenticated principal | `ctx.verifiedActorType` |
| `verifiedActor` | `AuthenticatedUser` | Full authenticated user object | `ctx.verifiedActor` |
| `verifiedWorkspaceId` | `string` | Workspace scope | `ctx.verifiedWorkspaceId` |
| `verifiedCapabilities` | `Set<string>` | Verified capability set | `ctx.verifiedCapabilities` |

### Session Snapshot (PHASE E)

| Field | Type | Purpose | Access Pattern |
|-------|------|---------|-----------------|
| `verifiedSessionSnapshot.snapshotId` | `string` | Immutable session ID | `ctx.verifiedSessionSnapshot.snapshotId` |
| `verifiedSessionSnapshot.snapshotTimestamp` | `Date` | Snapshot creation time | `ctx.verifiedSessionSnapshot.snapshotTimestamp` |
| `verifiedSessionSnapshot.snapshotHash` | `string` | Hash for verification | `ctx.verifiedSessionSnapshot.snapshotHash` |
| `verifiedSessionSnapshot.actorId` | `string` | Actor ID in snapshot | `ctx.verifiedSessionSnapshot.actorId` |
| `verifiedSessionSnapshot.workspaceId` | `string` | Workspace ID in snapshot | `ctx.verifiedSessionSnapshot.workspaceId` |
| `verifiedSessionSnapshot.capabilities` | `readonly string[]` | Capabilities in snapshot | `ctx.verifiedSessionSnapshot.capabilities` |

### Optional Fields

| Field | Type | Purpose | Access Pattern |
|-------|------|---------|-----------------|
| `traceId` | `string` | PHASE D execution trace ID | `ctx.traceId` |
| `executionTrace` | `Readonly<any>` | Read-only trace reference | `ctx.executionTrace` |
| `correlationId` | `string` | Request correlation ID | `ctx.correlationId` |
| `requestId` | `string` | Request ID | `ctx.requestId` |
| `request` | `NextRequest` | Raw Next.js request | `ctx.request` |
| `session` | `SessionInfo` | Session info object | `ctx.session` |
| `policy` | `PolicyContext` | Policy context object | `ctx.policy` |

---

## Options Configuration

### requireWorkspace

**Type:** `boolean` (optional)  
**Default:** `false`  
**Purpose:** Enforce workspace scoping requirement  
**Usage:**
```typescript
withCanonicalEnforcement(handler, { requireWorkspace: true })
```

### requireCapabilities

**Type:** `string[]` (optional)  
**Default:** `[]`  
**Purpose:** Require specific capabilities for route access  
**Usage:**
```typescript
withCanonicalEnforcement(handler, { requireCapabilities: ["OWNER_VIEW", "OPERATOR_READ"] })
```

**Important:** Capability names are strings in the set. All checks are performed by the wrapper before handler is called.

### requireActorType

**Type:** `"user" | "service" | ("user" | "service")[]` (optional)  
**Purpose:** Restrict route to specific principal types  
**Usage:**
```typescript
withCanonicalEnforcement(handler, { requireActorType: "user" })
```

---

## Confirmation Checklist

| Item | Status | Notes |
|------|--------|-------|
| Wrapper function exists | ✓ YES | `withCanonicalEnforcement` exported from canonical-route-enforcement.ts |
| Handler receives CanonicalAuthContext | ✓ YES | `(ctx: CanonicalAuthContext, params: Record<string, string>) => Promise<any>` |
| ctx.verifiedActorId exists | ✓ YES | `ctx.verifiedActorId: string` (line 53) |
| ctx.verifiedWorkspaceId exists | ✓ YES | `ctx.verifiedWorkspaceId: string` (line 58) |
| ctx.verifiedSessionSnapshot.actorId exists | ✓ YES | Nested in snapshot object (line 73) |
| ctx.verifiedSessionSnapshot.workspaceId exists | ✓ YES | Nested in snapshot object (line 74) |
| requireCapabilities option exists | ✓ YES | `requireCapabilities?: string[]` in options (line 152) |
| requireWorkspace option exists | ✓ YES | `requireWorkspace?: boolean` in options (line 151) |
| Capability option placement | ✓ CORRECT | Passed in options object, not as withAuth parameter |
| Actor field naming | ✓ CONFIRMED | `ctx.verifiedActorId` (not `ctx.verifiedActor.id`) |
| Workspace field naming | ✓ CONFIRMED | `ctx.verifiedWorkspaceId` (not header extraction) |

---

## Implementation Pattern for R1-C Routes

### Before (Legacy withEnforcementFull)
```typescript
export const GET = withEnforcementFull(
  async (request: NextRequest) => {
    const authContext = await withAuth(request, { capabilities: ["OWNER_VIEW"] });
    const workspaceId = request.headers.get("x-workspace-id");
    const userId = authContext.session.user.id;
    // handler logic
  }
);
```

### After (withCanonicalEnforcement)
```typescript
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const userId = ctx.verifiedActorId;  // or ctx.verifiedSessionSnapshot.actorId
    // handler logic (unchanged)
  },
  { requireCapabilities: ["OWNER_VIEW"] }
);
```

---

## Key Differences from Legacy Pattern

| Aspect | Legacy (withEnforcementFull) | Modern (withCanonicalEnforcement) |
|--------|------------------------------|----------------------------------|
| Auth execution | Inside handler | Before handler (guaranteed) |
| Context type | `NextRequest` + `AuthContext` | `CanonicalAuthContext` |
| Actor ID access | `authContext.session.user.id` | `ctx.verifiedActorId` |
| Workspace access | `request.headers.get("x-workspace-id")` | `ctx.verifiedWorkspaceId` |
| Capability check | `await withAuth(request, { capabilities: [...] })` | `{ requireCapabilities: [...] }` in options |
| Params access | Not separate | `params: Record<string, string>` (2nd parameter) |

---

## Service Auth Envelope (For Reference)

Routes may construct `ServiceAuthEnvelope` to pass verified context to services:

```typescript
interface ServiceAuthEnvelope {
  readonly verifiedActorId: string;
  readonly verifiedActorType: "user" | "service";
  readonly verifiedWorkspaceId: string;
  readonly verifiedCapabilities: ReadonlySet<string>;
  readonly hasInternalAccess: boolean;
  readonly verifiedActor?: Readonly<AuthenticatedUser>;
  readonly policy?: Readonly<PolicyContext>;
}
```

**Pattern:**
```typescript
const envelope: ServiceAuthEnvelope = {
  verifiedActorId: ctx.verifiedActorId,
  verifiedActorType: ctx.verifiedActorType,
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,
  verifiedCapabilities: ctx.verifiedCapabilities,
  hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
};
await myService(data, envelope);
```

---

## Conclusion

**Wrapper Signature Status:** ✓ CONFIRMED CORRECT

All required fields and options are present and correctly named.

**Ready for R1-C Implementation:** ✓ YES

Routes may now proceed with modernization using the confirmed wrapper signature.

---

**Next Step:** B - Pre-implementation audit of 4 authorized routes
