import { getEngagementOutcomes } from "@/services/outcome/outcome.service";
import { withRequestContext } from "@/lib/api-handler";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;

  const result = await getEngagementOutcomes(engagementId);

  return Response.json({
    success: true,
    data: result,
  });
});
