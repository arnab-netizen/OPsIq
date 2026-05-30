import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerDashboard } from "@/services/owner-dashboard.service";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { NotFoundError } from "@/infra/errors";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);
    const workspaceId = ctx.verifiedWorkspaceId;

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    try {
      const dashboard = await getOwnerDashboard(engagementId, ctx, workspaceId);
      return dashboard;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Engagement")) {
        throw new NotFoundError("Engagement", engagementId);
      }
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW], requireWorkspace: true }
);
