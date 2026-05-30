import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerDashboard } from "@/services/owner-dashboard.service";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    logger.info("[DASHBOARD_ROUTE] route_start");

    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);
    logger.info("[DASHBOARD_ROUTE] params_resolved", { engagementIdMasked: engagementId.slice(0, 8) + "..." });

    const workspaceId = ctx.verifiedWorkspaceId;
    logger.info("[DASHBOARD_ROUTE] workspace_resolved", { workspaceIdMasked: workspaceId?.slice(0, 8) + "..." });

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    try {
      logger.info("[DASHBOARD_ROUTE] service_call_start");
      const dashboard = await getOwnerDashboard(engagementId, ctx, workspaceId);
      logger.info("[DASHBOARD_ROUTE] service_call_success");
      return dashboard;
    } catch (error) {
      logger.error("[DASHBOARD_ROUTE] service_call_error", {
        errorName: error instanceof Error ? error.name : typeof error,
        safeMessage: (error instanceof Error ? error.message : String(error)).slice(0, 200),
      });
      if (error instanceof Error && error.message.includes("Engagement")) {
        throw new NotFoundError("Engagement", engagementId);
      }
      throw error;
    }
  },
  { requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW], requireWorkspace: true }
);
