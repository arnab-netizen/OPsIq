# R1-D2-B: Wrapper Signature Confirmation

**Date:** 2026-05-16  
**Phase:** R1-D2-B Implementation - Wrapper Verification  
**Status:** WRAPPER SIGNATURE CONFIRMED

---

## A. withCanonicalEnforcement Signature

**Location:** src/lib/canonical-route-enforcement.ts (lines 148-155)

**Function Signature:**
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

**Handler Type:**
```typescript
export type CanonicalHandler = (ctx: CanonicalAuthContext, params: Record<string, string>) => Promise<any>;
```

---

## B. CanonicalAuthContext Interface

**Key Fields:**
- `verifiedActorId: string` - Authenticated actor ID (required)
- `verifiedActorType: "user" | "service"` - Actor type (required)
- `verifiedActor: AuthenticatedUser` - Actor details (required)
- `verifiedWorkspaceId: string` - Verified workspace (required if requireWorkspace)
- `verifiedCapabilities: Set<string>` - Verified capabilities (set if requireCapabilities)
- `verifiedSessionSnapshot: { snapshotId, snapshotTimestamp, actorId, workspaceId, capabilities }` - Immutable snapshot (required)
- `request?: NextRequest` - Optional raw request access
- `session?: SessionInfo` - Optional session info
- `policy?: PolicyContext` - Optional policy context

---

## C. Pattern for Route Migration

**From (Legacy):**
```typescript
export const GET = withEnforcementFull(async (request: NextRequest) => {
  const { session } = await withAuth();
  const workspaceId = request.headers.get("x-workspace-id");
  // business logic using session.user.id and workspaceId
  return Response.json(result);
});
```

**To (Modern):**
```typescript
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    // business logic using ctx.verifiedActorId and workspaceId
    return Response.json(result);
  },
  { requireWorkspace: true, requireCapabilities: [...] }
);
```

---

## D. Capability Option Placement

**Correct Usage:**
```typescript
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // Handler body
    return Response.json(data);
  },
  {
    requireWorkspace: true,
    requireCapabilities: ["CAPABILITY_NAME"]  // ← In options object
  }
);
```

---

## E. Request Access Pattern (If Query Params Needed)

**For accessing request (e.g., query parameters):**
```typescript
const idempotencyKey = ctx.request?.headers.get("idempotency-key");
const searchParams = new URL(ctx.request!.url).searchParams;
const queryValue = searchParams.get("paramName");
```

---

## F. Successful R1-A/B/C/D/D2-A Route Patterns

**Confirmed to Work:**
- src/app/api/notifications/[id]/route.ts (GET, PATCH) - R1-D modernized
- src/app/api/governance/alerts/route.ts (GET) - R1-D modernized
- src/app/api/entitlement/quota/route.ts (GET, POST) - R1-D modernized
- src/app/api/observability/summary/route.ts (GET) - R1-D modernized
- src/app/api/growth/revenue-streams/route.ts (GET, POST) - R1-D modernized
- src/app/api/actions/[actionId]/start/route.ts (PATCH) - R1-D2-A modernized
- src/app/api/actions/[actionId]/complete/route.ts (PATCH) - R1-D2-A modernized

**Pattern:** All use withCanonicalEnforcement correctly, signature matches expectations

---

**Status: ✓ WRAPPER SIGNATURE CONFIRMED - READY FOR R1-D2-B IMPLEMENTATION**
