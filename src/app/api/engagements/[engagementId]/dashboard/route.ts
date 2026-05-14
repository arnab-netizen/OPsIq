import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getOwnerDashboard } from "@/services/owner-dashboard.service";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import type { NextRequest } from "next/server";

export const GET = withEnforcementFull(async (request, context, params) => {
  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);
  const { session, policy } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  try {
    const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
    const dashboard = await getOwnerDashboard(engagementId, canonicalContext, workspaceId);
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
