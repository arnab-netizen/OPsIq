import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getShockEventById } from "@/services/shock-event";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withRequestContext(async (request, context) => {
  const { engagementId, shockEventId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  parseOrThrow(uuidSchema, shockEventId);
  await withAuth({ capability: CAPABILITIES.SHOCK_EVENT_VIEW });

  const result = await getShockEventById(shockEventId, engagementId);

  return Response.json(result);
});
