import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { getKPIsForEngagement } from "@/services/kpi";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId } = await context.params;
  await withAuth();

  const kpis = await getKPIsForEngagement(engagementId);
  return Response.json(kpis);
});
