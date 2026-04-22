import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getFindingById } from "@/services/finding";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId, findingId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  parseOrThrow(uuidSchema, findingId);
  await withAuth({ capability: CAPABILITIES.FINDING_VIEW });

  const item = await getFindingById(findingId, engagementId);
  return Response.json(item);
});
