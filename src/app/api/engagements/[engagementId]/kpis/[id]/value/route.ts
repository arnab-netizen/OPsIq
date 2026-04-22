import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { updateKPIValue } from "@/services/kpi";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";

const updateValueSchema = z.object({
  currentValue: z.number(),
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId, id } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  parseOrThrow(uuidSchema, id);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, updateValueSchema);
  await updateKPIValue(id, body.currentValue, session.user.id, engagementId);

  return Response.json({ success: true }, { status: 200 });
});
