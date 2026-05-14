# Migration Recipe: getServerAuthContext() - Optional Authentication

## Pattern
Calling `getServerAuthContext()` to handle routes that work with OR without authentication (optional auth).

## Occurrences
14 violations across 5 files

## Representative Files
- src/app/api/public-api/route.ts
- src/app/api/announcements/route.ts
- src/app/api/health/route.ts

## Before
```typescript
import { getServerAuthContext } from "@/lib/auth-guard";

export async function GET(request: Request, context: { params: { workspaceId: string } }) {
  // Optional auth - returns null if not authenticated
  const auth = await getServerAuthContext();
  
  if (auth) {
    // Return user-specific data
    return Response.json(getUserData(auth.session.user.id, workspaceId));
  } else {
    // Return public data
    return Response.json(getPublicData(workspaceId));
  }
}
```

## After
```typescript
import { withOptionalCanonicalEnforcement } from "@/lib/canonical-route-enforcement";

export async function GET(request: Request, context: { params: { workspaceId: string } }) {
  return withOptionalCanonicalEnforcement(request, context, async (ctx) => {
    if (ctx.verifiedSessionSnapshot) {
      // User is authenticated
      return Response.json(getUserData(ctx.verifiedSessionSnapshot.user.id, workspaceId));
    } else {
      // User is not authenticated
      return Response.json(getPublicData(workspaceId));
    }
  });
}
```

## Required Adapters
- IMPORTANT: Requires new optional auth wrapper `withOptionalCanonicalEnforcement`
- This is a CATEGORY_B violation (requires adapter)
- Adapter already partially exists but may need refinement

## Required Tests
- Unit test: Works with authentication
- Unit test: Works without authentication
- Integration test: Correct data returned for both scenarios

## Known Risks
- Optional auth is fundamentally different from required auth
- May leak information to unauthenticated users
- Requires careful data classification (public vs. private)

## Semantic Checks
- Verify `ctx.verifiedSessionSnapshot` null-check is performed
- Ensure no private data is returned when `ctx` is null
- Check data classification in service layer

## Do Not Apply If
- Route actually requires authentication (use recipe 1 instead)
- Route shouldn't return different data based on auth status
- Public data shouldn't be accessible without authentication
