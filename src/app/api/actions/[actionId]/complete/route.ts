import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getActionById } from "@/services/action";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { recordOutcome } from "@/services/outcome/outcome.service";
import { logger } from "@/infra/logger";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);

    const workspaceId = ctx.verifiedWorkspaceId;

    const action = await getActionById(actionId, workspaceId);
    if (!action) throw new NotFoundError("Action", actionId);

    if (action.status === "completed" || action.status === "verified") {
      throw new ValidationError("Action is already completed");
    }

    // Update status to completed
    const updated = await db.action.updateMany({
      where: {
        id: actionId,
        engagement: { workspaceId },
        version: action.version,
      },
      data: {
        status: "completed",
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });

    if (updated.count === 0) {
      throw new ValidationError("Action has been modified by another process");
    }

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ACTION_COMPLETED,
      actorId: ctx.verifiedActorId,
      entityType: "action",
      entityId: actionId,
      payload: {
        previousStatus: action.status,
        newStatus: "completed",
      },
      visibility: "internal",
    });

    // Record outcome for decision tracking
    try {
      const idempotencyKey = ctx.request?.headers.get("idempotency-key") || undefined;
      await recordOutcome(actionId, ctx.verifiedActorId, idempotencyKey, workspaceId);
    } catch (err) {
      // Log but don't fail the action completion
      const governed = classifyOperatorError(err instanceof Error ? err : new Error(String(err)), { context: 'action' });
      logger.error("Failed to record outcome", {
        actionId,
        error: governed.operatorMessage,
      });
    }

    const result = await getActionById(actionId, workspaceId);
    return result;
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.ACTION_UPDATE],
  }
);
