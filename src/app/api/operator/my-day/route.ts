import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { ForbiddenError, BadRequestError, AppError } from "@/infra/errors";
import { requireCapability } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getQueuedItems } from "@/services/operator/store";
import { getMyDayItems } from "@/services/operator/myday";
import { z } from "zod/v4";
import { classifyOperatorError } from "@/lib/operator-error-governance";

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

    return {
      workspaceId,
      myDay: myDayItems,
      count: myDayItems.length,
      recommendedItemCount: myDayItems.filter((i: any) => i.recommended).length,
    };
  } catch (error) {
    if (error instanceof Error) {
      const governed = classifyOperatorError(error, { context: "load" });
      throw new BadRequestError(governed.operatorMessage);
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
