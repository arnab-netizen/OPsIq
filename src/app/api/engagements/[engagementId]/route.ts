import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { withEnforcementFull } from "@/lib/enforced-route";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { hasInternalAccess } from "@/policies/capability-check";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { getEngagementById, updateEngagement } from "@/services/engagement";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import {
  ENGAGEMENT_STATUSES,
  INTERVENTION_MODES,
  SERVICE_TIERS,
  ENGAGEMENT_MODES,
  HEALTH_STATUSES,
} from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const updateEngagementSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  serviceTier: z.enum(SERVICE_TIERS).optional(),
  engagementMode: z.enum(ENGAGEMENT_MODES).optional(),
  startDate: z.string().optional(),
  targetEndDate: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  assignedConsultantId: z.string().uuid().optional(),
  healthStatus: z.enum(HEALTH_STATUSES).optional(),
  status: z.enum(ENGAGEMENT_STATUSES).optional(),
  interventionMode: z.enum(INTERVENTION_MODES).optional(),
  version: z.number().int().min(1),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {

    const workspaceId = ctx.verifiedWorkspaceId;
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, workspaceId);

    const engagement = await getEngagementById(engagementId, workspaceId, ctx.policy ? hasInternalAccess(ctx.policy) : false);
    return engagement;
  },
  { requireCapabilities: ["ENGAGEMENT_VIEW"], requireWorkspace: true }
);

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, ctx.verifiedWorkspaceId);

    // Check for interventionPhase in raw request body to provide clear error
    const rawBody = await ctx.request!.clone().json().catch(() => ({}));
    if ("interventionPhase" in rawBody) {
      return canonicalJson(
        {
          error: "interventionPhase updates are not allowed here. Use PATCH /engagements/[id]/intervention instead.",
        },
        { status: 400 }
      );
    }

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return canonicalJson(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const body = await parseRequestBody(ctx.request!, updateEngagementSchema);

    // Check idempotency
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "updateEngagement",
      actorId: ctx.verifiedActorId,
      payload: { engagementId, ...body },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      await updateEngagement(engagementId, body, ctx, ctx.verifiedWorkspaceId);
      const updated = await getEngagementById(engagementId, ctx.verifiedWorkspaceId, ctx.policy ? hasInternalAccess(ctx.policy) : false);
      await recordIdempotencyResponse(idempotencyKey, 200, updated);
      return updated;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE],
    requireWorkspace: true,
  }
);
