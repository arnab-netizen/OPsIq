import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { hasInternalAccess } from "@/policies/capability-check";
import type { NextRequest } from "next/server";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createEngagement, listEngagements } from "@/services/engagement";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import { SERVICE_TIERS, ENGAGEMENT_MODES, INTERVENTION_MODES } from "@/domain/constants/statuses";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError, UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { logger } from "@/infra/logger";

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

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const correlationId = ctx.correlationId || `unknown-${Date.now()}`;
    let stage = "route_start";

    try {
      // Stage 1: Extract context
      stage = "auth_context";
      const workspaceId = ctx.verifiedWorkspaceId;
      if (!workspaceId) {
        throw new Error("workspace_context_missing");
      }

      // Stage 2: Parse query parameters
      stage = "parse_query";
      const params = parseSearchParams(ctx.request?.url || "", listEngagementsSchema);

      // Stage 3: Call service
      stage = "service_call";
      const hasAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
      const result = await listEngagements(workspaceId, params, hasAccess);

      // Stage 4: Validate response shape
      stage = "response_validation";
      if (!result || typeof result !== "object") {
        throw new Error("invalid_response_shape");
      }
      if (!Array.isArray(result.engagements)) {
        throw new Error("engagements_not_array");
      }
      if (typeof result.total !== "number") {
        throw new Error("total_not_number");
      }

      // Stage 5: Return response
      stage = "response_return";
      return Response.json(result);
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const errorName = errorObj.name || "UnknownError";
      const errorMessage = errorObj.message || "unknown error";

      logger.error("[ENGAGEMENTS_FAILED]", {
        correlationId,
        stage,
        errorName,
        errorMessage,
        workspaceId: ctx.verifiedWorkspaceId,
      });

      // Return safe error response with stage classification
      return Response.json(
        {
          error: "Internal server error",
          correlationId,
          classification: `${stage}_failed`,
          stage,
        },
        { status: 500 }
      );
    }
  },
  { requireCapabilities: ["ENGAGEMENT_VIEW"], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new UnauthorizedError("idempotency-key header required");
    }

    // Check capability: create_engagement
    const capabilityCheck = await assertCapability(workspaceId, "create_engagement");
    if (!capabilityCheck.allowed) {
      throw new PlanLimitError("create_engagement", capabilityCheck.reason || "Plan limit exceeded");
    }

    const body = await parseRequestBody(ctx.request!, createEngagementSchema);

    // Check idempotency
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "createEngagement",
      actorId: ctx.verifiedActorId,
      workspaceId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }

    try {
      const result = await createEngagement(body, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, result, workspaceId);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err, workspaceId);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_CREATE],
    requireWorkspace: true,
  }
);
