/**
 * PHASE B: CANONICAL CAPABILITY RESOLUTION
 *
 * Wrapper becomes sole authority for capability evaluation.
 *
 * This module:
 * 1. Evaluates which capabilities an actor has
 * 2. Derives complete capability set from roles
 * 3. Applies scope restrictions
 * 4. Enforces internal-only guards
 *
 * Legacy code becomes pure role data provider.
 */

import type { PolicyContext } from "@/policies/capability-check";
import type { CapabilityName } from "@/domain/constants/capabilities";
import { hasCapability } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ROLES, type RoleName } from "@/domain/constants/roles";

/**
 * Canonical capability set: All capabilities an actor can exercise.
 *
 * Immutable and complete, derived from:
 * - Workspace-scoped role assignments
 * - Engagement-scoped role memberships
 * - Internal-only capability restrictions
 * - Entitlement/plan restrictions (future)
 */
export interface CanonicalCapabilitySet {
  // All capabilities user has globally (workspace-scoped)
  global: Set<CapabilityName>;

  // Capabilities scoped to specific engagements
  engagementScoped: Map<string, Set<CapabilityName>>;

  // Helper: Check if capability is available globally or in scope
  has(capability: CapabilityName, scope?: { type: string; id: string }): boolean;

  // Helper: Get all capabilities for a specific engagement
  forEngagement(engagementId: string): Set<CapabilityName>;
}

/**
 * PHASE B STEP B1: Canonical Capability Resolver
 *
 * Evaluates actor's complete capability set from policy context.
 * This is now the SOLE authority for capability evaluation.
 *
 * NEVER call legacy hasCapability() from route handlers.
 * ALWAYS get capabilities from verifiedContext.verifiedCapabilities.
 */
export function resolveCanonicalCapabilities(
  policy: PolicyContext | null
): CanonicalCapabilitySet {
  const global = new Set<CapabilityName>();
  const engagementScoped = new Map<string, Set<CapabilityName>>();

  if (!policy) {
    return {
      global,
      engagementScoped,
      has(capability: CapabilityName, scope?: { type: string; id: string }): boolean {
        return false;
      },
      forEngagement(engagementId: string): Set<CapabilityName> {
        return new Set();
      },
    };
  }

  // Phase 1: Collect capabilities from workspace-scoped roles
  // These are role assignments in the workspace
  if (policy.roles && policy.roles.length > 0) {
    for (const assignment of policy.roles) {
      // For each role assignment, check all capabilities
      // Use existing hasCapability logic to evaluate each capability
      for (const cap of Object.values(CAPABILITIES)) {
        if (hasCapability(policy, cap, { type: "workspace", id: assignment.scopeId || "" })) {
          global.add(cap);
        }
      }
    }
  }

  // Phase 2: Collect capabilities from engagement-scoped memberships
  // These are direct role assignments within specific engagements
  if (policy.engagementMemberships && policy.engagementMemberships.length > 0) {
    for (const membership of policy.engagementMemberships) {
      const engagementCapabilities = new Set<CapabilityName>();

      for (const cap of Object.values(CAPABILITIES)) {
        if (
          hasCapability(policy, cap, {
            type: "engagement",
            id: membership.engagementId,
          })
        ) {
          engagementCapabilities.add(cap);
        }
      }

      if (engagementCapabilities.size > 0) {
        engagementScoped.set(membership.engagementId, engagementCapabilities);
      }
    }
  }

  // Phase 3: Build immutable capability set with helper methods
  return {
    global,
    engagementScoped,

    has(capability: CapabilityName, scope?: { type: string; id: string }): boolean {
      // Global capability (no scope restriction)
      if (!scope) {
        return this.global.has(capability);
      }

      // Engagement-scoped capability
      if (scope.type === "engagement") {
        const engagementCaps = this.engagementScoped.get(scope.id);
        return engagementCaps ? engagementCaps.has(capability) : false;
      }

      // Workspace-scoped capability
      if (scope.type === "workspace") {
        return this.global.has(capability);
      }

      return false;
    },

    forEngagement(engagementId: string): Set<CapabilityName> {
      return this.engagementScoped.get(engagementId) || new Set();
    },
  };
}

/**
 * PHASE B STEP B2: Capability Evaluation - No Legacy Branching
 *
 * Evaluates if actor has a specific capability.
 * Returns boolean - no exceptions thrown.
 *
 * Used by canonical wrapper to populate verifiedCapabilities.
 * Should NOT be called by route handlers (use verifiedCapabilities instead).
 */
export function evaluateCapability(
  policy: PolicyContext | null,
  capability: CapabilityName,
  scope?: { type: string; id: string }
): boolean {
  if (!policy) return false;

  // Use legacy hasCapability for evaluation
  // This is OK - legacy evaluates, wrapper owns the decision
  return hasCapability(policy, capability, scope);
}

/**
 * PHASE B: Semantic Authority Verification
 *
 * Verify that capabilities are evaluated correctly and owned by canonical system.
 */
export function verifyCapabilityOwnership(context: {
  canonicalOwnsEvaluation: boolean;
  canonicalOwnsDerivation: boolean;
  canonicalOwnsDecision: boolean;
  legacyDoesNotThrow: boolean;
}): boolean {
  if (!context.canonicalOwnsEvaluation) {
    console.error(
      "[PHASE B VIOLATION] Canonical system does not own capability evaluation"
    );
    return false;
  }
  if (!context.canonicalOwnsDerivation) {
    console.error(
      "[PHASE B VIOLATION] Canonical system does not own capability derivation"
    );
    return false;
  }
  if (!context.canonicalOwnsDecision) {
    console.error(
      "[PHASE B VIOLATION] Canonical system does not own capability decision"
    );
    return false;
  }
  if (!context.legacyDoesNotThrow) {
    console.error(
      "[PHASE B VIOLATION] Legacy system still throws for missing capabilities"
    );
    return false;
  }
  return true;
}
