import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { recordKPIChange } from "@/services/kpi-event";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";

const recordChangeSchema = z.object({
  newValue: z.number(),
  actionId: z.string().uuid().optional(),
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId, id } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  parseOrThrow(uuidSchema, id);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, recordChangeSchema);
  await recordKPIChange(id, body.newValue, session.user.id, body.actionId, engagementId);

  return Response.json({ success: true }, { status: 201 });
});
