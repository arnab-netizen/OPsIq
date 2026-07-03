import { requireSession, requirePolicyContext } from "@/services/auth";
import type { SessionInfo } from "@/services/auth";
import type { PolicyContext } from "@/policies/capability-check";
import {
  requireCapability,
  hasCapability,
  hasInternalAccess,
} from "@/policies/capability-check";
import type { CapabilityName } from "@/domain/constants/capabilities";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { checkShadowRead } from "@/lib/runtime-shadow-read-enforcer";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

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
  // PHASE F: Check for shadow reads after snapshot finalized
  checkShadowRead("requireAuth");

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
  // PHASE F: Check for shadow reads after snapshot finalized
  checkShadowRead("getServerAuthContext");

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
  // PHASE F: Check for shadow reads after snapshot finalized
  checkShadowRead("withAuth");

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
// `getActorHierarchyLevel` moved to @/policies/capability-check so canonical routes can import it without
// pulling in this legacy auth-guard module (strict-auth). Re-exported here for back-compat.
export { getActorHierarchyLevel } from "@/policies/capability-check";

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
  authContext: AuthContext | { verifiedCapabilities?: Set<string>; policy?: PolicyContext },
  capability: CapabilityName,
  scope?: { type: string; id: string }
): void {
  // Support both AuthContext (legacy, has `policy`) and CanonicalAuthContext (new, has
  // `verifiedCapabilities`). Narrow to the shared structural shape ONCE — a typed view, not `as any` —
  // so property access stays type-checked (both union members are assignable to this shape).
  const ctx = authContext as { policy?: PolicyContext; verifiedCapabilities?: Set<string> };
  if (ctx.policy) {
    requireCapability(ctx.policy, capability, scope);
  } else if (ctx.verifiedCapabilities) {
    // For CanonicalAuthContext, verify capability is in the set
    if (!ctx.verifiedCapabilities.has(capability)) {
      throw new ForbiddenError(`Capability required: ${capability}`);
    }
  }
}

// ─── PHASE G6R: AUTH TYPE BRIDGE ──────────────────────────────────────────

/**
 * PHASE G6R: Bridge canonical auth context.
 *
 * Converts legacy AuthContext (from withAuth()) to CanonicalAuthContext
 * required by service layer.
 *
 * Fails closed if required fields missing.
 * Does not fabricate permissions.
 * Preserves actor identity and workspace scoping.
 *
 * Usage:
 *   const auth = await withAuth();
 *   const ctx = canonicalizeAuthContext(auth, workspaceId);
 *   await service(ctx, workspaceId);
 */
export function canonicalizeAuthContext(
  authContext: AuthContext | null | undefined,
  workspaceId: string
): CanonicalAuthContext {
  if (!authContext) {
    throw new UnauthorizedError("Cannot canonicalize null auth context");
  }

  if (!authContext.session) {
    throw new UnauthorizedError("Cannot canonicalize: missing session");
  }

  if (!authContext.session.user) {
    throw new UnauthorizedError("Cannot canonicalize: missing user");
  }

  const userId = authContext.session.user.id;
  if (!userId) {
    throw new UnauthorizedError("Cannot canonicalize: user ID missing");
  }

  if (!workspaceId || workspaceId.trim() === "") {
    throw new UnauthorizedError("Cannot canonicalize: workspace ID required");
  }

  const capabilities = extractCapabilities(authContext.policy);

  const ctx: CanonicalAuthContext = {
    verifiedActorId: userId,
    verifiedActorType: "user",
    verifiedActor: authContext.session.user,
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: capabilities,
    verifiedSessionSnapshot: {
      snapshotId: `snapshot-${userId}-${Date.now()}`,
      snapshotTimestamp: new Date(),
      snapshotHash: "",
      actorId: userId,
      workspaceId,
      capabilities: Array.from(capabilities),
    },
    // Optional fields intentionally omitted (not needed for service layer)
    // traceId, executionTrace, request, correlationId, requestId
    session: authContext.session,
    policy: authContext.policy,
  };

  return ctx;
}

/**
 * Extract verified capabilities from policy context.
 * Fails closed: returns empty set if policy is missing.
 * Does not fabricate capabilities.
 */
function extractCapabilities(policy: PolicyContext | undefined): Set<string> {
  if (!policy) {
    return new Set();
  }

  const capabilities = new Set<string>();

  if (policy.roles && Array.isArray(policy.roles)) {
    for (const roleAssignment of policy.roles) {
      if (roleAssignment.role) {
        capabilities.add(roleAssignment.role);
      }
    }
  }

  return capabilities;
}
