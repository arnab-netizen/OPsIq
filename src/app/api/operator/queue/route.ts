import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getQueuedItems } from "@/services/operator/store";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { z } from "zod/v4";

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
  const userId = ctx.verifiedSessionSnapshot.actorId;
  const workspaceId = ctx.verifiedWorkspaceId;

  try {
    // Parse query parameters
    const status = ctx.request?.nextUrl.searchParams.get("status") || undefined;
    const limitParam = ctx.request?.nextUrl.searchParams.get("limit") || "20";
    const limit = Math.min(Math.max(parseInt(limitParam, 10), 1), 1000);

    // Validate limit
    if (isNaN(limit)) {
      return Response.json(
        { error: "Invalid limit: must be a number between 1 and 1000" },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status && !["pending", "in_progress", "blocked"].includes(status)) {
      return Response.json(
        {
          error: "Invalid status: must be one of pending, in_progress, blocked",
        },
        { status: 400 }
      );
    }

    // Fetch queued items
    const items = await getQueuedItems(status, limit);

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
    capability: 'mutation',
    decision: 'operator_queue_viewed',
    requestId: randomUUID(),
    };

    return Response.json(
      {
        workspaceId,
        items,
        count: items.length,
        status: status || "all",
        limit,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}, { requireCapabilities: [CAPABILITIES.ACTION_VIEW], requireWorkspace: true });