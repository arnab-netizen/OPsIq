import { requireSession, requirePolicyContext } from "@/services/auth";
import type { SessionInfo } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";
import {
  requireCapability,
  hasCapability,
  highestRole,
  hasInternalAccess,
} from "@/policies/capability-check";
import type { CapabilityName } from "@/domain/constants/capabilities";
import { ROLE_HIERARCHY } from "@/domain/constants/roles";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";

/**
 * PHASE A: Auth Guard Transition (Legacy Code)
 *
 * IMPORTANT: This module is in transition during PHASE A-F.
 * Do NOT use these functions in NEW code.
 *
 * INSTEAD:
 * - Use withCanonicalEnforcement() for protected routes
 * - Use canonical-auth-facts.ts for auth decision logic
 * - Use services/auth.ts fact-returning functions (getSessionFact, getPolicyContextFact)
 *
 * These legacy functions are kept for backward compatibility with existing code.
 * They will be deprecated and removed after PHASE F.
 *
 * What changed:
 * - BEFORE: requireAuth() threw UnauthorizedError → old code caught it
 * - NOW: Canonical wrapper uses facts → makes decisions itself
 * - AFTER (Phase F): All semantic logic removed from legacy helpers
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface AuthContext {
  session: SessionInfo;
  policy: PolicyContext;
}

export interface AuthOptions {
  /** Required capability — request is rejected if the user lacks it */
  capability?: CapabilityName;

  /** Scope for capability check (e.g. engagement-scoped) */
  scope?: { type: string; id: string };

  /** If true, only internal (non-client) users are allowed */
  internalOnly?: boolean;
}

// ─── Core Primitives (Fail-Closed) ─────────────────────────────────────────

/**
 * Require valid authentication (session + policy context).
 * Throws UnauthorizedError if session invalid or missing.
 * Fails closed: null/missing session → throw.
 */
export async function requireAuth(workspaceId: string = "system"): Promise<AuthContext> {
  try {
    const session = await requireSession(workspaceId);
    const policy = await requirePolicyContext(workspaceId);
    return { session, policy };
  } catch (error) {
    throw new UnauthorizedError("Valid session required");
  }
}

/**
 * Require authentication + specific capability.
 * Throws ForbiddenError if capability missing.
 * Fails closed: missing capability → throw.
 */
export async function requireAuthForCapability(
  capability: CapabilityName,
  scope?: { type: string; id: string },
  workspaceId: string = "system"
): Promise<AuthContext> {
  const auth = await requireAuth(workspaceId);
  requireCapability(auth.policy, capability, scope);
  return auth;
}

/**
 * Require authentication + internal-only access.
 * Throws ForbiddenError if user has any client role.
 * Fails closed: client user → throw.
 */
export async function requireAuthInternal(workspaceId: string = "system"): Promise<AuthContext> {
  const auth = await requireAuth(workspaceId);
  if (!hasInternalAccess(auth.policy)) {
    throw new ForbiddenError("Internal access required");
  }
  return auth;
}

/**
 * Get server-derived auth context from cookies (not headers).
 * Does NOT require valid auth (returns null if session invalid).
 * Use for optional auth endpoints.
 */
export async function getServerAuthContext(workspaceId: string = "system"): Promise<AuthContext | null> {
  try {
    const session = await requireSession(workspaceId);
    const policy = await requirePolicyContext(workspaceId);
    return { session, policy };
  } catch {
    return null;
  }
}

// ─── Legacy Wrapper (Backward Compatible) ─────────────────────────────────

/**
 * Authenticates and authorizes the current request (legacy pattern).
 * Prefer requireAuth(), requireAuthForCapability(), etc. for new code.
 */
export async function withAuth(
  options: AuthOptions = {},
  workspaceId: string = "system"
): Promise<AuthContext> {
  const session = await requireSession(workspaceId);
  const policy = await requirePolicyContext(workspaceId);

  if (options.internalOnly && !hasInternalAccess(policy)) {
    throw new ForbiddenError("This action requires internal access");
  }

  if (options.capability) {
    requireCapability(policy, options.capability, options.scope);
  }

  return { session, policy };
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/**
 * Returns the actor's highest role hierarchy level.
 * Used by role-assignment to enforce hierarchy authority.
 */
export function getActorHierarchyLevel(policy: PolicyContext): number {
  const role = highestRole(policy);
  if (!role) return -1;
  return ROLE_HIERARCHY[role] ?? 0;
}

/**
 * Check if a policy context has a specific capability (non-throwing).
 */
export function canDo(
  policy: PolicyContext,
  capability: CapabilityName,
  scope?: { type: string; id: string }
): boolean {
  return hasCapability(policy, capability, scope);
}

/**
 * Require a specific capability within an authenticated context.
 * Throws ForbiddenError if capability missing.
 * Use at the service layer to enforce authorization independent of routes.
 */
export function requireCapabilityForService(
  authContext: AuthContext,
  capability: CapabilityName,
  scope?: { type: string; id: string }
): void {
  requireCapability(authContext.policy, capability, scope);
}
