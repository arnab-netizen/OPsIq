import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getDeliverablesForEngagement } from "@/services/deliverable";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import type { NextRequest } from "next/server";

export const GET = withRequestContext(async (request) => {
  const { session } = await withAuth({ capability: CAPABILITIES.DELIVERABLE_VIEW });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const url = new URL(request.url);
  const engagementId = url.searchParams.get("engagementId");

  if (!engagementId) {
    return Response.json(
      { error: "engagementId is required" },
      { status: 400 }
    );
  }

  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId);

  const deliverables = await getDeliverablesForEngagement(engagementId, workspaceId);
  return Response.json(deliverables);
});
