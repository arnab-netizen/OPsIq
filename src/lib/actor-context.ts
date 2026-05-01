import type { AuthContext } from "@/lib/auth-guard";

/**
 * Safely extracts actorId from authenticated context.
 * This ensures actorId always comes from verified session, preventing spoofing.
 */
export function getVerifiedActorId(authContext: AuthContext): string {
  return authContext.session.user.id;
}

/**
 * DO NOT USE: This type is intentionally never satisfied.
 * Services must accept AuthContext, never raw actorId strings.
 * If you need to pass actorId, use getVerifiedActorId(authContext) instead.
 */
export type RawActorIdForbidden = never;
