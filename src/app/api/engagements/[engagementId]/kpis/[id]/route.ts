import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getKPIById } from "@/services/kpi";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withRequestContext(async (request, context) => {
  const { engagementId, id } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  parseOrThrow(uuidSchema, id);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_VIEW,
    internalOnly: true,
  });

  const kpi = await getKPIById(id, engagementId);

  return Response.json({ kpi });
});
