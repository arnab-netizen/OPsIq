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
    await emitAuditEvent({
      timestamp: new Date(),
      eventType: "CAPABILITY_CHECK",
      detail: {
        actor: params.actor.id,
        actorType: params.actor.type || "user",
        workspace: params.workspace.id,
        capability: params.capability,
        decision: params.decision,
        scope: params.scope,
        trace: params.trace,
      },
    });
  } catch (error) {
    // Audit failure shouldn't block request
    console.error("[AUDIT_ERROR] Failed to emit capability audit:", error);
  }
}

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
  return context?.capability;
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
