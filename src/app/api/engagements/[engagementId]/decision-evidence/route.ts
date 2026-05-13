import { getDecisionEvidence } from "@/services/decision-evidence/decision-evidence.service";
import type { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withEnforcementFull(async (request, context, params) => {
  const { engagementId } = params;
  parseOrThrow(uuidSchema, engagementId);

  await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  const workspaceId = request.headers.get("x-workspace-id") || "";
  const evidence = await getDecisionEvidence(engagementId, workspaceId);

  return Response.json({
    success: true,
    data: evidence,
  });
});
