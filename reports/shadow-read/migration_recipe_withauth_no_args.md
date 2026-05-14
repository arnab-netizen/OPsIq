# Migration Recipe: withAuth() No Arguments

## Pattern
Calling `withAuth()` with no arguments, which authenticates the request but doesn't enforce any specific capability or permission.

## Occurrences
63 violations across 38 files

## Representative Files
- src/app/api/users/route.ts
- src/app/api/evidence/route.ts
- src/app/api/execute/route.ts
- src/app/api/recommendations/route.ts

## Before
```typescript
import { withAuth } from "@/lib/auth-guard";

export async function POST(request: Request, context: { params: { workspaceId: string } }) {
  const auth = await withAuth();
  const { userId } = auth.session.user;
  
  // Perform mutation using auth context
  await createSomething(input, auth, workspaceId);
  
  return Response.json(result);
}
```

## After
```typescript
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";

export async function POST(request: Request, context: { params: { workspaceId: string } }) {
  return withCanonicalEnforcement(request, context, async (ctx) => {
    const { userId } = ctx.verifiedSessionSnapshot.user;
    
    // Use ctx directly instead of decomposed auth
    await createSomething(input, ctx, workspaceId);
    
    return Response.json(result);
  });
}
```

## Required Adapters
- Service functions must accept `CanonicalAuthContext` (already reverted in G4)
- No new adapters needed (CATEGORY_A safe replacement)

## Required Tests
- Unit test: Route still authenticates unauthenticated requests
- Unit test: Route still passes auth context to services
- Integration test: Service receives correct workspace context

## Known Risks
- withAuth() may have had side effects in auth-guard.ts that aren't replicated in wrapper
- Verify capability enforcement isn't silently being skipped

## Semantic Checks
- Before: `auth.session.user.id` → After: `ctx.verifiedSessionSnapshot.user.id`
- Ensure `verifiedSessionSnapshot` is not null before access
- Verify workspace scoping is still enforced

## Do Not Apply If
- Route uses `withAuth()` with capability argument (use recipe 2 instead)
- Route uses `getServerAuthContext()` for optional auth (requires different wrapper)
- Route has custom permission logic outside withAuth()
