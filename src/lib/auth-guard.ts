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
import { ForbiddenError } from "@/infra/errors";

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

// ─── Guard ─────────────────────────────────────────────────────────────────

/**
 * Authenticates and authorizes the current request.
 * Returns session + policy context, or throws Unauthorized/Forbidden.
 */
export async function withAuth(
  options: AuthOptions = {}
): Promise<AuthContext> {
  const session = await requireSession();
  const policy = await requirePolicyContext();

  if (options.internalOnly && !hasInternalAccess(policy)) {
    throw new ForbiddenError("This action requires internal access");
  }

  if (options.capability) {
    requireCapability(policy, options.capability, options.scope);
  }

  return { session, policy };
}

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
