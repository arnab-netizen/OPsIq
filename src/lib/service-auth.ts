import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError } from "@/infra/errors";

/**
 * Service-layer authentication helper.
 * Ensures protected services only accept calls with valid authContext.
 * Enforces that user identity comes from authContext, not from request body/params.
 *
 * IMPORTANT: Services now require CanonicalAuthContext exclusively.
 * Routes that have not been migrated to withCanonicalEnforcement will fail
 * at compile time (intended behavior to force systematic migration).
 */

/**
 * Requires authContext to be present and valid.
 * Throws UnauthorizedError if authContext is missing or invalid.
 * Returns the authenticated userId from the verified session snapshot.
 */
export function requireServiceAuth(authContext: CanonicalAuthContext | null | undefined): string {
  if (!authContext) {
    throw new UnauthorizedError("Service requires authentication context");
  }

  const userId = authContext.verifiedActorId;
  if (!userId) {
    throw new UnauthorizedError("Invalid auth context: missing user ID");
  }

  return userId;
}

/**
 * Requires workspaceId to be present and non-empty.
 * Services should call this to ensure workspace context is provided.
 * Note: Route handlers must have already validated workspace membership via enforceWorkspaceScoping()
 */
export function requireWorkspaceContext(workspaceId: string | null | undefined): string {
  if (!workspaceId || workspaceId.trim() === "") {
    throw new Error("Service requires workspace context");
  }
  return workspaceId;
}

/**
 * Validates that both auth and workspace context are present.
 * Returns tuple of [userId, workspaceId] for convenience.
 */
export function requireServiceContext(
  authContext: CanonicalAuthContext | null | undefined,
  workspaceId: string | null | undefined
): [string, string] {
  const userId = requireServiceAuth(authContext);
  const workspace = requireWorkspaceContext(workspaceId);
  return [userId, workspace];
}
