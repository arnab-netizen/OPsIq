import { withEnforcementFull } from "@/lib/enforced-route";
import type { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { generateBusinessImpact } from "@/services/business-impact/business-impact.service";

export const GET = withEnforcementFull(async (request, context, params) => {
  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  // Get workspace ID from request
  const nextRequest = request as unknown as any;
  const workspaceId = nextRequest?.headers?.get?.("x-workspace-id") ||
                       nextRequest?.nextUrl?.searchParams?.get?.("workspaceId");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required" },
      { status: 400 }
    );
  }

  const impact = await generateBusinessImpact(engagementId, session.user.id, workspaceId);

  return Response.json({
    success: true,
    data: impact,
  });
});
