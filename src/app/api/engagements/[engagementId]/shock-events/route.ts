import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError, ValidationError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { hasInternalAccess } from "@/policies/capability-check";
import {
  createShockEvent,
  listShockEventsForEngagement,
} from "@/services/shock-event";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";

const createShockEventSchema = z.object({
  description: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  detectedAt: z.string().datetime(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    await assertEngagementAccess(actorId, engagementId, workspaceId);

    const events = await listShockEventsForEngagement(engagementId, actorId, workspaceId);
    return { events };
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW] }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;
    const { engagementId } = params;

    // internalOnly: only internal users may create shock events
    if (!ctx.policy || !hasInternalAccess(ctx.policy)) {
      throw new ForbiddenError("Internal access required to create shock events");
    }

    parseOrThrow(uuidSchema, engagementId);
    await assertEngagementAccess(actorId, engagementId, workspaceId);

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header required");
    }

    const body = ctx.request ? await ctx.request.json() : {};
    const validated = createShockEventSchema.parse(body);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "createShockEvent",
      actorId,
      payload: { engagementId, ...validated },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      const result = await createShockEvent(
        { engagementId, ...validated },
        ctx,
        workspaceId
      );
      await recordIdempotencyResponse(idempotencyKey, 201, result);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE] }
);
