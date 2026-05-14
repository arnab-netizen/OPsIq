# G6T-B: CANONICAL WRAPPER INSPECTION

**Wrapper Location**: `src/lib/canonical-route-enforcement.ts`

**Function**: `withCanonicalEnforcement()`

**Status**: ✓ EXISTS and SUITABLE for migration

---

## FUNCTION SIGNATURE

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

## HANDLER CALLBACK TYPE

```typescript
export type CanonicalHandler = (ctx: CanonicalAuthContext, params: Record<string, string>) => Promise<any>;
```

Handler receives:
- `ctx: CanonicalAuthContext` - Verified auth context
- `params: Record<string, string>` - URL route parameters (not query string)

---

## CONTEXT SHAPE (CanonicalAuthContext)

### Required Fields (Always Present if Handler Called)
- `verifiedActorId: string` - User ID
- `verifiedActorType: "user" | "service"` - Actor type
- `verifiedActor: AuthenticatedUser` - Full actor info
- `verifiedWorkspaceId: string` - Workspace ID
- `verifiedCapabilities: Set<string>` - Permission set
- `verifiedSessionSnapshot: {...}` - Immutable snapshot (PHASE E)

### Available Optional Fields
- `request?: NextRequest` - Full NextRequest object (available for query params)
- `session?: SessionInfo` - Session info
- `policy?: PolicyContext` - Policy context
- `traceId?, executionTrace?, correlationId?, requestId?` - Tracing

---

## KEY POINTS FOR MIGRATION

### Actor Identity
From `ctx.verifiedActorId` (line 343 of wrapper)
```typescript
verifiedActorId: session.user.id,
```

### Workspace Extraction
From `ctx.verifiedWorkspaceId` (line 346)
- Source: `req.headers.get("x-workspace-id")` at wrapper level (line 196)
- Handler receives already-extracted value in ctx

### Query Parameter Access
`ctx.request.nextUrl.searchParams` for query params (status, limit, offset)
- Wrapper provides raw NextRequest in ctx.request
- Handler can extract query params as before

### Missing Auth/Workspace Handling
- Lines 275-290: If auth fails, wrapper returns error response
- Line 229: If workspace required but missing, auth fails
- **Fails closed**: Handler never executes if auth failed
- No manual error throwing needed in handler

### Capability Handling
- Wrapper extracts from policy context
- Service layer (auth.ts) handles extraction
- No permission fabrication

---

## SUITABILITY FOR DECISIONS/LIST ROUTE

| Need | Support | Notes |
|------|---------|-------|
| GET method | ✓ YES | Supports all HTTP methods |
| Query parameters | ✓ YES (via ctx.request) | Access via ctx.request.nextUrl.searchParams |
| Workspace scoping | ✓ YES | requireWorkspace: true option |
| Actor ID | ✓ YES | ctx.verifiedActorId |
| Response shape | ✓ YES (decisions, total, limit, offset) | Handler can return any object |

---

## MIGRATION PATH FOR DECISIONS/LIST

**Before**:
```typescript
export const GET = withEnforcementFull(async (request: NextRequest) => {
  const auth = await withAuth();
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const ctx = canonicalizeAuthContext(auth, workspaceId);
  const userId = ctx.verifiedActorId;
  // ... query params, DB, response
});
```

**After**:
```typescript
export const GET = withCanonicalEnforcement(
  async (ctx) => {
    const userId = ctx.verifiedActorId;
    const workspaceId = ctx.verifiedWorkspaceId; // From x-workspace-id header
    // ... query params via ctx.request, DB, response
  },
  { requireWorkspace: true }
);
```

---

## SCANNER IMPACT

**Before Migration**:
- 3 violations in route (2x withAuth() + 1x import)

**After Migration**:
- Expected: 0 violations (handler doesn't call withAuth())
- withCanonicalEnforcement itself is allowlisted (src/lib/canonical-route-enforcement.ts)
- No imports of withAuth/canonicalizeAuthContext in route

---

## BLOCKERS ASSESSMENT

**Are there blockers?** NO

- ✓ Wrapper exists and is production-ready
- ✓ Wrapper handles workspace scoping (requireWorkspace option)
- ✓ Wrapper provides actor ID (ctx.verifiedActorId)
- ✓ Wrapper provides request object (ctx.request for query params)
- ✓ Wrapper handles all auth/workspace failures (fail-closed)
- ✓ Response shape can be preserved (handler returns any object)
- ✓ No custom adapter needed
- ✓ No service layer changes needed
- ✓ No scanner rule changes needed

**Verdict**: SAFE TO MIGRATE

---

## VERIFICATION

Example route already using this wrapper (production-ready):
- `src/app/api/engagements/[engagementId]/decision-evidence/route.ts`
- Uses withCanonicalEnforcement
- Scanner reports zero withAuth() violations for this route

This proves the wrapper is scanner-clean and production-ready.

