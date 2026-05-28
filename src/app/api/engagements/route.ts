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
import { ClassifiedApiError } from "@/infra/classified-error";

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
    // Stage 1: Extract context
    const workspaceId = ctx.verifiedWorkspaceId;
    if (!workspaceId) {
      throw new ClassifiedApiError(
        "workspace context missing",
        "workspace_context_failed",
        "workspace_context"
      );
    }

    // Stage 2: Parse query parameters
    let params;
    try {
      params = parseSearchParams(ctx.request?.url || "", listEngagementsSchema);
    } catch (error) {
      throw new ClassifiedApiError(
        error instanceof Error ? error.message : "invalid query parameters",
        "parse_query_failed",
        "parse_query"
      );
    }

    // Stage 3: Call service
    let result;
    try {
      const hasAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
      result = await listEngagements(workspaceId, params, hasAccess);
    } catch (error) {
      // If service throws ClassifiedApiError, preserve it
      if (error instanceof ClassifiedApiError) {
        throw error;
      }
      // Otherwise wrap unknown error
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      throw new ClassifiedApiError(
        errorMsg,
        "service_call_failed",
        "service_call",
        500,
        error
      );
    }

    // Stage 4: Validate response shape
    if (!result || typeof result !== "object") {
      throw new ClassifiedApiError(
        "service returned invalid response shape",
        "response_mapping_failed",
        "response_mapping"
      );
    }
    if (!Array.isArray(result.engagements)) {
      throw new ClassifiedApiError(
        "engagements must be array",
        "response_validation_failed",
        "response_validation"
      );
    }
    if (typeof result.total !== "number") {
      throw new ClassifiedApiError(
        "total must be number",
        "response_validation_failed",
        "response_validation"
      );
    }

    // Stage 5: Return response
    return Response.json(result);
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
