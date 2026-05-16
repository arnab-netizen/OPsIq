import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getQueuedItems } from "@/services/operator/store";
import { getMyDayItems } from "@/services/operator/myday";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const queueParamsSchema = z.object({
  status: z.enum(["pending", "in_progress", "blocked"]).optional(),
  limit: z.number().min(1).max(1000).default(20),
});

/**
 * GET /api/operator/my-day
 *
 * Retrieve top 5 highest-priority actions for today
 * Wire: operator/myday.getMyDayItems()
 * Deterministic priority-based selection for daily action queue
 */
export const GET = withEnforcementFull(async (request, { ctx }) => {
  // Enforce authorization
  const { policy } = ctx.verifiedSessionSnapshot;
  if (!policy.can(CAPABILITIES.ACTION_VIEW)) {
    throw new ForbiddenError('Insufficient permissions to view my-day');
  }

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
    // Get My Day items (top 5 by priority)
    const myDayItems = await getMyDayItems();

    return Response.json(
      {
        workspaceId,
        myDay: myDayItems,
        count: myDayItems.length,
        recommendedItemCount: myDayItems.filter((i: any) => i.recommended).length,
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
