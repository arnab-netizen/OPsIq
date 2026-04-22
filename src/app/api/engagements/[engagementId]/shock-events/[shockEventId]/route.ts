import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getShockEventById } from "@/services/shock-event";
import { parseOrThrow, uuidSchema } from "@/lib/validation";

export const GET = withRequestContext(async (_request, context) => {
  const { engagementId, shockEventId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  parseOrThrow(uuidSchema, shockEventId);
  await withAuth({ capability: CAPABILITIES.INTERVENTION_VIEW });

  const event = await getShockEventById(shockEventId, engagementId);
  return Response.json(event);
});
