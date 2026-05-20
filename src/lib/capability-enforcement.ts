/**
 * CAPABILITY TRUST CLOSURE (R14)
 *
 * Enforces capability-based access control throughout the application.
 * No bypasses: every operation requires explicit capability verification.
 * Every capability decision is audited.
 *
 * Pattern:
 * 1. Routes declare required capability in withCanonicalEnforcement()
 * 2. Wrapper verifies capability from verified policy context
 * 3. Services receive CapabilityEnvelope (verified capability proof)
 * 4. Services validate envelope before executing logic
 * 5. Every decision is audited with actor/workspace/capability/result
 */

import type { CanonicalAuthContext } from "./canonical-route-enforcement";
import type { CapabilityName } from "@/domain/constants/capabilities";
import { hasCapability, type PolicyContext } from "@/policies/capability-check";
import { ForbiddenError } from "@/infra/errors";
import type { ServiceCapabilityContext, CapabilityEnvelope } from "@/lib/auth-guard";

/**
 * BYPASS DETECTION HELPER
 * Services can call this to detect unauthorized direct calls
 *
 * Example:
 *   const envelope = getCapabilityEnvelope(context);
 *   if (!envelope) throw new Error("Service called without capability verification");
 */
export function getCapabilityEnvelope(
  context: ServiceCapabilityContext | undefined
): CapabilityEnvelope | undefined {
  return context?.capabilityEnvelope;
}

/**
 * CAPABILITY RESOLVER FOR SCOPED ACCESS
 * Handles multi-level scoping: workspace → engagement → custom
 *
 * Example:
 *   - canCreate("ACTION", { type: "engagement", id: engagementId })
 *   - canApprove("RECOMMENDATION", { type: "workspace", id: workspaceId })
 */
export function resolveCapabilityScope(params: {
  policy: PolicyContext;
  capability: CapabilityName;
  scope?: { type: string; id: string };
}): boolean {
  return hasCapability(params.policy, params.capability, params.scope);
}
