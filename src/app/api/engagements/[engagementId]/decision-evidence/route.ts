import { getDecisionEvidence } from "@/services/decision-evidence/decision-evidence.service";
import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
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
