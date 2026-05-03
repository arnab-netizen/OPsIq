import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { detectExecutionDrift } from "@/services/execution-drift/execution-drift.service";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import type { NextRequest } from "next/server";

export const GET = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });

  // Get workspace ID from request
  const nextRequest = request as unknown as any;
  const workspaceId = nextRequest?.headers?.get?.("x-workspace-id") ||
                       nextRequest?.nextUrl?.searchParams?.get?.("workspaceId");

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  try {
    const drift = await detectExecutionDrift(engagementId, workspaceId);
    return Response.json(drift);
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
