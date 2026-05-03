import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { listFindingsForEngagement } from "@/services/findings";
import { assertEngagementAccess } from "@/lib/visibility";
import type { NextRequest } from "next/server";

export const GET = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  const { session } = await withAuth();

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id") || "";

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  const findings = await listFindingsForEngagement(engagementId, session.user.id, undefined, workspaceId);
  return Response.json(findings);
});
