import { getDecisionEvidence } from "@/services/decision-evidence/decision-evidence.service";
import { withRequestContext } from "@/lib/api-handler";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;

  const evidence = await getDecisionEvidence(engagementId);

  return Response.json({
    success: true,
    data: evidence,
  });
});
