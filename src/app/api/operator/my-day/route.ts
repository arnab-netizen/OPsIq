import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { ForbiddenError } from "@/infra/errors";
import { requireCapability } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getQueuedItems } from "@/services/operator/store";
import { getMyDayItems } from "@/services/operator/myday";
import { z } from "zod/v4";

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
export const GET = withCanonicalEnforcement(async (ctx) => {
  // Enforce authorization
  if (ctx.policy) {
    requireCapability(ctx.policy, CAPABILITIES.ACTION_VIEW);
  }

  const workspaceId = ctx.verifiedWorkspaceId;

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
