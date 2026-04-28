import { getDecisionEvidence } from "@/services/decision-evidence/decision-evidence.service";
import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);

  await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  const evidence = await getDecisionEvidence(engagementId);

  return Response.json({
    success: true,
    data: evidence,
  });
});
