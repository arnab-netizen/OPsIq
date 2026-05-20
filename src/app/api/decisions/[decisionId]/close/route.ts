import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { closeDecision } from "@/services/decisions/decision-lifecycle.service";
import { logger } from "@/infra/logger";

/**
 * POST /api/decisions/[decisionId]/close
 *
 * Close a decision (OUTCOME_RECORDED → CLOSED)
 * Enforces: DECISION_CLOSE capability required
 * Enforces: decision must be in OUTCOME_RECORDED state
 * Returns: 409 Conflict if transition not allowed
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const decisionId = params.decisionId;
    const workspaceId = nextRequest.headers.get("x-workspace-id");
    const userId = ctx.verifiedActorId;

    // Close via lifecycle service
    const updated = await closeDecision(decisionId, workspaceId, userId);

    logger.info("Decision closed via API", {
      decisionId,
      workspaceId,
      userId,
    });

    return {
      decisionId,
      status: updated.status,
      message: "Decision closed successfully",
    };
  },
  { requireCapabilities: ["DECISION_CLOSE"], requireWorkspace: true }
);
