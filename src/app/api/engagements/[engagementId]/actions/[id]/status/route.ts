import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { updateActionStatus } from "@/services/action";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { ACTION_STATUSES } from "@/domain/constants/statuses";

const updateStatusSchema = z.object({
  status: z.enum(ACTION_STATUSES),
  version: z.number(),
});

export const PUT = withRequestContext(async (request, context) => {
  const { engagementId, id } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  parseOrThrow(uuidSchema, id);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateStatusSchema);
  await updateActionStatus(id, body, session.user.id, engagementId);

  return Response.json({ success: true }, { status: 200 });
});
