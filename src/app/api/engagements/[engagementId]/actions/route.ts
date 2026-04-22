import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createAction, listActions } from "@/services/action";
import { parseRequestBody, parseOrThrow, uuidSchema, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { ACTION_STATUSES } from "@/domain/constants/statuses";
import { paginationSchema } from "@/lib/validation";

const createActionSchema = z.object({
  recommendationId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(ACTION_STATUSES).optional(),
});

const listActionSchema = paginationSchema.extend({
  status: z.string().optional(),
  recommendationId: z.string().uuid().optional(),
});

export const GET = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  await withAuth({ capability: CAPABILITIES.INTERVENTION_VIEW });

  const params = parseSearchParams(request.url, listActionSchema);
  const result = await listActions(engagementId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createActionSchema);
  const result = await createAction(
    { ...body, engagementId },
    session.user.id
  );

  return Response.json(result, { status: 201 });
});
