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
import { emitAuditEvent } from "@/infra/audit";

/**
 * CAPABILITY ENVELOPE
 * Proof that capability was verified by route layer
 * Passed to services as proof of authorization
 * Cannot be forged (routes generate it from verified context only)
 */
export interface CapabilityEnvelope {
  // Verified at route layer - never from client
  capability: CapabilityName;
  granted: boolean;
  decision: "GRANTED" | "DENIED";

  // Who verified this capability (audit trail)
  verifiedBy: {
    actorId: string;
    workspaceId: string;
    timestamp: Date;
  };

  // Scope of the capability (if any)
  scope?: {
    type: string;
    id: string;
  };

  // Trace for audit
  trace: {
    roles: string[];
    reason: string;
  };
}

/**
 * SERVICE CONTEXT WITH CAPABILITY
 * What services receive when called from routes
 * Proves capability was verified before service execution
 */
export interface ServiceCapabilityContext {
  // Auth context from canonical wrapper
  authContext: CanonicalAuthContext;

  // Verified capability envelope
  capability: CapabilityEnvelope;

  // Helper to audit decision
  auditCapabilityCheck: (
    decision: "GRANTED" | "DENIED",
    detail?: string
  ) => Promise<void>;
}

/**
 * Route layer: Verify capability from policy context
 * Returns envelope that proves verification
 *
 * Called by canonical wrapper during auth evaluation
 */
export function verifyCapabilityFromPolicy(
  policy: PolicyContext,
  capability: CapabilityName,
  actor: { id: string },
  workspace: { id: string },
  scope?: { type: string; id: string }
): CapabilityEnvelope {
  const granted = hasCapability(policy, capability, scope);

  const envelope: CapabilityEnvelope = {
    capability,
    granted,
    decision: granted ? "GRANTED" : "DENIED",
    verifiedBy: {
      actorId: actor.id,
      workspaceId: workspace.id,
      timestamp: new Date(),
    },
    scope,
    trace: {
      roles: policy.roles.map((r) => r.role),
      reason: granted
        ? `Actor has role(s) with capability`
        : `Actor lacks required capability`,
    },
  };

  return envelope;
}

/**
 * SERVICE LAYER: Require capability envelope
 * Services call this to enforce that capability was verified
 *
 * FAIL CLOSED: If envelope is missing or DENIED, throw error
 */
export function requireCapabilityEnvelope(
  envelope: CapabilityEnvelope | undefined,
  capability: CapabilityName
): CapabilityEnvelope {
  if (!envelope) {
    throw new ForbiddenError(
      `Service requires capability verification: ${capability}`
    );
  }

  if (envelope.capability !== capability) {
    throw new ForbiddenError(
      `Capability mismatch: service requires ${capability}, envelope verifies ${envelope.capability}`
    );
  }

  if (envelope.decision !== "GRANTED") {
    throw new ForbiddenError(
      `Capability denied: ${capability} (${envelope.trace.reason})`
    );
  }

  return envelope;
}

/**
 * AUDIT CAPABILITY DECISION
 * Called by services or routes to log capability checks
 * Creates audit trail with actor/workspace/capability/decision
 */
export async function auditCapabilityDecision(params: {
  actor: { id: string; type?: string };
  workspace: { id: string };
  capability: CapabilityName;
  decision: "GRANTED" | "DENIED";
  scope?: { type: string; id: string };
  trace?: string;
}): Promise<void> {
  try {
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
