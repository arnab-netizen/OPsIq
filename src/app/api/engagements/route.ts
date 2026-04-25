import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { hasInternalAccess } from "@/policies/capability-check";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createEngagement, listEngagements } from "@/services/engagement";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import { SERVICE_TIERS, ENGAGEMENT_MODES, INTERVENTION_MODES } from "@/domain/constants/statuses";

const createEngagementSchema = z.object({
  title: z.string().min(1),
  clientId: z.string().uuid(),
  serviceTier: z.enum(SERVICE_TIERS),
  engagementMode: z.enum(ENGAGEMENT_MODES),
  interventionMode: z.enum(INTERVENTION_MODES),
  description: z.string().optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  assignedConsultantId: z.string().uuid().optional(),
  parentEngagementId: z.string().uuid().optional(),
});

const listEngagementsSchema = paginationSchema.extend({
  status: z.string().optional(),
  clientId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export const GET = withRequestContext(async (request) => {
  const { policy } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });

  const params = parseSearchParams(request.url, listEngagementsSchema);
  const result = await listEngagements(params, hasInternalAccess(policy));

  return Response.json(result);
});

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_CREATE,
    internalOnly: true,
  });

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, createEngagementSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "createEngagement",
    actorId: session.user.id,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await createEngagement(body, session.user.id);
    await recordIdempotencyResponse(idempotencyKey, 201, result);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});
