import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getFindingsForEngagement } from "@/services/finding";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  await withAuth();

  const findings = await getFindingsForEngagement(engagementId);
  return Response.json(findings);
});
