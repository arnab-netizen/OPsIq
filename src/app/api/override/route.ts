/**
 * POST /api/override — override an operator-item decision/action.
 *
 * Governed (GAP-OVR-01): the SERVER decides whether the override is permitted
 * (via the item's stored guardrail result), never a client-supplied flag.
 * Requires the OVERRIDE_DECIDE capability (server-verified, workspace-scoped),
 * an explicit reason and risk acknowledgement, persists a durable OverrideRecord,
 * and writes a hash-chained OVERRIDE_APPROVED audit event fail-closed inside a
 * transaction. All business logic lives in `recordOperatorOverride`.
 */
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { resolveServerRole } from "@/services/auth/server-role";
import { recordOperatorOverride } from "@/services/override/operator-override.service";

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await ctx.request!.json();
    const { operatorItemId, overriddenAction, reason, riskAcknowledged } = body ?? {};

    const role = await resolveServerRole();

    return recordOperatorOverride({
      operatorItemId,
      overriddenAction,
      reason,
      riskAcknowledged,
      workspaceId: ctx.verifiedWorkspaceId,
      actorId: ctx.verifiedActorId,
      role,
    });
  },
  { requireCapabilities: [CAPABILITIES.OVERRIDE_DECIDE], requireWorkspace: true },
);
