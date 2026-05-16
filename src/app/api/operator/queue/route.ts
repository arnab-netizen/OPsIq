import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getQueuedItems } from "@/services/operator/store";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

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
export const GET = withEnforcementFull(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ACTION_VIEW,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    // Parse query parameters
    const status = nextRequest.nextUrl.searchParams.get("status") || undefined;
    const limitParam = nextRequest.nextUrl.searchParams.get("limit") || "20";
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
      actorId: session.user.id,
      entityType: "OperatorQueue",
      entityId: "queue",
      workspaceId,
      payload: {
        itemCount: items.length,
        status: status || "all",
        limit,
      },
    });

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
});
