import { classifyOperatorError } from "@/lib/operator-error-governance";
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getMyDayItems } from "@/services/operator/myday";

/**
 * GET /api/operator/my-day
 *
 * Retrieve top 5 highest-priority actions for today
 * Wire: operator/myday.getMyDayItems()
 * Deterministic priority-based selection for daily action queue
 */
export const GET = withCanonicalEnforcement(async (ctx) => {
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
      const classified = classifyOperatorError(error, { context: "load" });
      return Response.json({ error: classifyOperatorError(error, { context: "load" }).operatorMessage }, { status: 400 });
    }

    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}, { requireCapabilities: [CAPABILITIES.ACTION_VIEW], requireWorkspace: true });
