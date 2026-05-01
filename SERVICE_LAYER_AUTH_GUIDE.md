# Service-Layer Auth Pattern Guide

**Status:** Pattern established and implemented for core services

## Pattern Overview

All protected service-layer entry points must:
1. **Require authContext** - Never accept userId as a string parameter
2. **Extract userId from authContext** - Only from authenticated session
3. **Validate workspaceId** - Must be present and non-empty
4. **Fail-closed** - Throw if auth context is missing

## Implementation Pattern

### Service Signature (OLD - DON'T USE)
```typescript
export async function createEngagement(
  input: CreateEngagementInput,
  actorId: string,          // ❌ WRONG: Can be spoofed from request
  workspaceId: string
): Promise<Result>
```

### Service Signature (NEW - FOLLOW THIS)
```typescript
import { requireServiceContext } from "@/lib/service-auth";
import type { AuthContext } from "@/lib/auth-guard";

export async function createEngagement(
  input: CreateEngagementInput,
  authContext: AuthContext,  // ✅ RIGHT: From authenticated handler only
  workspaceId: string
): Promise<Result> {
  // First line: validate and extract userId from authContext
  const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);
  
  // Rest of function uses actorId and validatedWorkspaceId
  // userId guaranteed to come from authenticated session
}
```

## Key Helpers

### `requireServiceAuth(authContext): string`
- Validates authContext is present and valid
- Extracts userId from authContext.session.user.id
- **Throws UnauthorizedError if authContext is null/undefined**
- Returns userId string

### `requireWorkspaceContext(workspaceId): string`
- Validates workspaceId is present and non-empty
- **Throws Error if workspaceId is null/undefined/empty**
- Returns workspaceId string

### `requireServiceContext(authContext, workspaceId): [string, string]`
- Combines both validations
- **Throws if either authContext or workspaceId is invalid**
- Returns `[userId, workspaceId]` tuple
- Use this in 95% of service functions

## Route Handler Changes

When updating route handlers to use the new service signature:

### BEFORE
```typescript
export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({ capability: X });
  const workspaceId = validateWorkspace(request);
  const result = await createEngagement(body, session.user.id, workspaceId);
  return Response.json(result);
});
```

### AFTER
```typescript
export const POST = withRequestContext(async (request) => {
  const { session, policy } = await withAuth({ capability: X });  // ← extract policy too
  const workspaceId = validateWorkspace(request);
  // Pass entire authContext, not just user ID
  const result = await createEngagement(body, { session, policy }, workspaceId);
  return Response.json(result);
});
```

## Services Already Patched

- ✅ `services/engagement.ts`
  - `createEngagement(input, authContext, workspaceId)`
  - `updateEngagement(engagementId, input, authContext, workspaceId)`

## Services Still Needing Patching

Services with protected operations that accept user identity from outside:

- [ ] `services/action.ts` - createAction, updateAction
- [ ] `services/client-account.ts` - createClient, updateClient, archiveClient
- [ ] `services/lead.ts` - createLead, updateLead
- [ ] `services/user.ts` - createUser, updateUser, deactivateUser
- [ ] `services/findings.ts` - createFinding, updateFinding
- [ ] `services/recommendation.ts` - createRecommendation, updateRecommendation
- [ ] `services/evidence.ts` - createEvidence, updateEvidence, validateEvidence
- [ ] And others...

## Implementation Steps for Each Service

1. **Add import**
   ```typescript
   import { requireServiceContext } from "@/lib/service-auth";
   import type { AuthContext } from "@/lib/auth-guard";
   ```

2. **Update function signatures**
   - Change parameter: `actorId: string` → `authContext: AuthContext`
   - Keep: `workspaceId: string`

3. **First line of function**
   ```typescript
   const [actorId, validatedWorkspaceId] = requireServiceContext(authContext, workspaceId);
   ```

4. **Replace all references**
   - Use `actorId` (extracted from authContext, can't be spoofed)
   - Use `validatedWorkspaceId` instead of the original `workspaceId` parameter

5. **Update all call sites in routes**
   - Extract `policy` from authContext in route: `const { session, policy } = await withAuth(...)`
   - Pass authContext to service: `await serviceFunc(input, { session, policy }, workspaceId)`

6. **Add tests**
   - Test that service throws when authContext is null
   - Test that service throws when workspaceId is empty
   - Test that service uses userId from authContext, not from parameters

## Security Properties Guaranteed

✅ **Service cannot be called with spoofed userId**
- Only authenticated route handlers can create authContext
- Service requires authContext to proceed
- userId extracted from authenticated session, not from parameters

✅ **Cross-tenant access prevented**
- Even if attacker calls service with userId="hacker" and workspaceId="victim"
- Service extracts actual userId from authContext
- Database query uses authenticated userId, not "hacker"
- Access check uses authenticated user's workspace membership

✅ **Fail-closed behavior**
- Missing authContext → UnauthorizedError immediately
- Missing workspaceId → Error immediately
- No business logic executes if auth context incomplete
- Error propagates to route handler → 500 Internal Server Error caught and reported

## Testing Pattern

For each patched service, add tests:

```typescript
describe("createEngagement - Service Auth Layer", () => {
  it("rejects missing authContext", async () => {
    expect(() => 
      createEngagement(input, null, "workspace-123")
    ).toThrow(UnauthorizedError);
  });

  it("rejects empty workspaceId", async () => {
    const authContext = { session: { user: { id: "user-123" } }, policy: {} };
    expect(() => 
      createEngagement(input, authContext, "")
    ).toThrow();
  });

  it("uses userId from authContext, not from parameters", async () => {
    const authContext = { 
      session: { user: { id: "authentic-user" } }, 
      policy: {} 
    };
    
    // Even if somehow we passed wrong userId, service wouldn't use it:
    // Service calls: const [actorId] = requireServiceContext(authContext, ...)
    // actorId = "authentic-user" (from authContext, not from function call)
    
    const result = await createEngagement(input, authContext, "workspace-123");
    
    // Verify created by authentic-user, not any other ID
    expect(result.createdBy).toBe("authentic-user");
  });
});
```

## FAQ

**Q: Why not just validate parameters in the service?**
A: Because parameter values come from request body/headers which can be manipulated. AuthContext comes only from authenticated route handlers, so it's trustworthy.

**Q: Why require workspaceId as a separate parameter?**
A: Because workspace_id isn't in the session table yet (Phase 4 future work). Routes validate membership via `enforceWorkspaceScoping()`. Once workspace_id is in session, it can move into authContext.

**Q: What about internal service-to-service calls?**
A: Construct authContext for the caller:
```typescript
// Service A calling Service B
const actorContext: AuthContext = {
  session: { user: { id: callerUserId, ... }, ... },
  policy: { userId: callerUserId, ... }
};
await serviceB.createThing(input, actorContext, workspaceId);
```

**Q: Can services call other services?**
A: Yes. Calling service should construct authContext for the called service. This maintains the guarantee that userId comes from an authenticated source.

## Next Steps

1. Patch remaining high-impact services (action, client, lead, user, findings, recommendations, evidence)
2. Update their route call sites to pass authContext
3. Add service-layer tests for each
4. Phase 4: Move workspaceId into session table and authContext
