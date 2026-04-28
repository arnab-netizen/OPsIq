import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerDashboard } from "@/services/owner-dashboard.service";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });

  await assertEngagementAccess(session.user.id, engagementId);

  try {
    const dashboard = await getOwnerDashboard(engagementId);
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
});
