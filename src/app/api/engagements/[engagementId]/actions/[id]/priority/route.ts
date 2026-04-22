import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { setPriority } from "@/services/action";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";
import { ACTION_PRIORITIES } from "@/domain/constants/statuses";

const setPrioritySchema = z.object({
  priority: z.enum(ACTION_PRIORITIES),
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId, id } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  parseOrThrow(uuidSchema, id);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, setPrioritySchema);
  await setPriority(id, body.priority, session.user.id, engagementId);

  return Response.json({ success: true }, { status: 200 });
});
