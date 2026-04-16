import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createShockEvent, listShockEventsByEngagement } from "@/services/shock-event";
import { parseRequestBody, parseSearchParams, paginationSchema, parseOrThrow, uuidSchema } from "@/lib/validation";
import { z } from "zod/v4";

const createShockEventSchema = z.object({
  type: z.string().min(1),
  severity: z.string().min(1),
  happenedAt: z.string(),
  notes: z.string().optional(),
});

const listShockEventsSchema = paginationSchema;

export const GET = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  await withAuth({ capability: CAPABILITIES.SHOCK_EVENT_VIEW });

  const params = parseSearchParams(request.url, listShockEventsSchema);

  const result = await listShockEventsByEngagement({
    engagementId,
    limit: params.limit,
    offset: params.offset,
  });

  return Response.json(result);
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);

  const { session } = await withAuth({
    capability: CAPABILITIES.SHOCK_EVENT_CREATE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createShockEventSchema);

  const result = await createShockEvent(
    {
      ...body,
      engagementId,
    },
    session.user.id
  );

  return Response.json(result, { status: 201 });
});
