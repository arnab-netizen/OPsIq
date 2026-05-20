import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerDashboard } from "@/services/owner-dashboard.service";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import type { NextRequest } from "next/server";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);
    const workspaceId = nextRequest.headers.get("x-workspace-id");

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    try {
      const dashboard = await getOwnerDashboard(engagementId, ctx, workspaceId);
      return Response.json(dashboard);
    } catch (error) {
      if (error instanceof Error && error.message.includes("Engagement")) {
        return Response.json(
          { error: "Engagement not found" },
          { status: 404 }
        );
      }
      throw error;
    }
  },
  { requireCapabilities: ["ENGAGEMENT_VIEW"], requireWorkspace: true }
);
