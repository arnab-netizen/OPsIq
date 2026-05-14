# Migration Recipe: withAuth() with Capability Check

## Pattern
Calling `withAuth()` with `{ capability: CAPABILITY_NAME }` to enforce fine-grained permissions.

## Occurrences
36 violations across 35 files

## Representative Files
- src/app/api/decisions/[decisionId]/route.ts
- src/app/api/actions/[actionId]/route.ts
- src/app/api/engagements/[engagementId]/route.ts

## Before
```typescript
import { withAuth } from "@/lib/auth-guard";

export async function PUT(request: Request, context: { params: { workspaceId: string } }) {
  const auth = await withAuth({ capability: "CAPABILITY_UPDATE_DECISION" });
  const body = await parseRequestBody(request);
  
  // Capability already verified by withAuth
  await updateDecision(body, auth, workspaceId);
  
  return Response.json(result);
}
```

## After
```typescript
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";

export async function PUT(request: Request, context: { params: { workspaceId: string } }) {
  return withCanonicalEnforcement(request, context, async (ctx) => {
    const body = await parseRequestBody(request);
    
    // Verify capability in new context (wrapper doesn't enforce, route must verify)
    if (!ctx.verifiedCapabilities?.has("CAPABILITY_UPDATE_DECISION")) {
      throw new ForbiddenError("Capability required");
    }
    
    await updateDecision(body, ctx, workspaceId);
    
    return Response.json(result);
  });
}
```

## Required Adapters
- None for CATEGORY_A (direct replacement)
- Note: withCanonicalEnforcement doesn't auto-enforce capabilities
- Routes must explicitly check `ctx.verifiedCapabilities`

## Required Tests
- Unit test: Route rejects requests without required capability
- Unit test: Route accepts requests with required capability
- Integration test: Capability verification still works end-to-end

## Known Risks
- Capability enforcement responsibility moves from wrapper to route
- Easier to accidentally forget capability check
- Different error handling than legacy withAuth()

## Semantic Checks
- Verify `ctx.verifiedCapabilities` is populated by wrapper
- Verify ForbiddenError is thrown consistently
- Check that service layer doesn't re-check capability

## Do Not Apply If
- Route uses scope-based capability checks (engage ment-scoped)
- Route uses multiple capability checks (use composition instead)
- Route has complex permission logic in service layer
