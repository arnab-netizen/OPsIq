import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createShockEvent, listShockEventsForEngagement } from "@/services/shock-event";
import { parseRequestBody, parseOrThrow, uuidSchema, parseSearchParams } from "@/lib/validation";
import { z } from "zod/v4";
import { SHOCK_EVENT_TYPES, RISK_SEVERITIES } from "@/domain/constants/statuses";
import { paginationSchema } from "@/lib/validation";

const createShockEventSchema = z.object({
  eventType: z.enum(SHOCK_EVENT_TYPES),
  severity: z.enum(RISK_SEVERITIES),
  title: z.string().min(1),
  description: z.string().optional(),
  detectedAt: z.string(),
});

const listShockEventsSchema = paginationSchema.extend({
  severity: z.string().optional(),
  eventType: z.string().optional(),
});

export const GET = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  await withAuth({ capability: CAPABILITIES.INTERVENTION_VIEW });

  const params = parseSearchParams(request.url, listShockEventsSchema);
  const result = await listShockEventsForEngagement(engagementId, params);

  return Response.json(result);
});

export const POST = withRequestContext(async (request, context) => {
  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);
  const { session } = await withAuth({
    capability: CAPABILITIES.INTERVENTION_MANAGE,
    internalOnly: true,
  });

  const body = await parseRequestBody(request, createShockEventSchema);
  const result = await createShockEvent(
    { ...body, engagementId },
    session.user.id
  );

  return Response.json(result, { status: 201 });
});
