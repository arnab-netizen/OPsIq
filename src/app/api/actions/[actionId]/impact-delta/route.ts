import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { calculateImpactDelta } from "@/services/business-impact/impact-delta.service";
import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx, params) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);

    // Fetch action to get engagementId (scoped by verified workspace)
    const action = await db.action.findUnique({
      where: { id: actionId, workspaceId: ctx.verifiedWorkspaceId },
    });

    if (!action) {
      throw new NotFoundError("Action", actionId);
    }

    const delta = await calculateImpactDelta(
      action.engagementId,
      actionId,
      ctx.verifiedActorId,
      ctx.verifiedWorkspaceId
    );

    return {
      success: true,
      data: delta,
    };
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.ACTION_VIEW],
  }
);
