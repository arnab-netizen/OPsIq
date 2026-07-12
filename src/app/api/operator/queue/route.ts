import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { BadRequestError, AppError } from "@/infra/errors";
import { requireCapability } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getQueuedItems } from "@/services/operator/store";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { z } from "zod/v4";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const queueParamsSchema = z.object({
  status: z.enum(["pending", "in_progress", "blocked"]).optional(),
  limit: z.number().min(1).max(1000).default(20),
});

/**
 * GET /api/operator/queue
 *
 * Retrieve operator action queue (all queued items with filtering)
 * Wire: operator/store.getQueuedItems()
 * Supports: status filtering, pagination
 */
export const GET = withCanonicalEnforcement(async (ctx) => {
  // Enforce authorization
  if (ctx.policy) {
    requireCapability(ctx.policy, CAPABILITIES.ACTION_VIEW);
  }
  const userId = ctx.verifiedSessionSnapshot.actorId;
  const workspaceId = ctx.verifiedWorkspaceId;

  try {
    // Parse query parameters
    const status = ctx.request?.nextUrl.searchParams.get("status") || undefined;
    const limitParam = ctx.request?.nextUrl.searchParams.get("limit") || "20";
    const limit = Math.min(Math.max(parseInt(limitParam, 10), 1), 1000);

    // Validate limit
    if (isNaN(limit)) {
      throw new BadRequestError("Invalid limit: must be a number between 1 and 1000");
    }

    // Validate status if provided
    if (status && !["pending", "in_progress", "blocked"].includes(status)) {
      throw new BadRequestError("Invalid status: must be one of pending, in_progress, blocked");
    }

    // Fetch queued items
    const items = await getQueuedItems(workspaceId, status, limit);

    // Emit audit event
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OPERATOR_QUEUE_VIEWED,
      actorId: userId,
      entityType: "OperatorQueue",
      entityId: "queue",
      workspaceId,
      payload: {
        itemCount: items.length,
        status: status || "all",
        limit,
      },
    });

    return {
      workspaceId,
      items,
      count: items.length,
      status: status || "all",
      limit,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new BadRequestError(classifyOperatorError(error, { context: "load" }).operatorMessage);
    }

    throw new AppError(
      "INTERNAL_ERROR",
      "Internal server error",
      500,
      {
        telemetryClass: "INTERNAL_ERROR",
        auditClass: "INTERNAL_ERROR",
        severity: "HIGH",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: true,
        mutationAllowed: false,
      }
    );
  }
});
