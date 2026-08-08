import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { BadRequestError, AppError } from "@/infra/errors";
import { requireCapability } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getMyDayItems } from "@/services/operator/myday";
import { classifyOperatorError } from "@/lib/operator-error-governance";

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
    const myDayItems = await getMyDayItems(workspaceId);

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
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ACTION_VIEW] });
