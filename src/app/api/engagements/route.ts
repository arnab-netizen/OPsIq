import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { hasInternalAccess } from "@/policies/capability-check";
import type { NextRequest } from "next/server";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createEngagement, listEngagements, ENGAGEMENTS_SERVICE_VERSION } from "@/services/engagement";
import { parseRequestBody, parseSearchParams } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { paginationSchema } from "@/lib/validation";
import { SERVICE_TIERS, ENGAGEMENT_MODES, INTERVENTION_MODES } from "@/domain/constants/statuses";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError, UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { ClassifiedApiError, hasClassification } from "@/infra/classified-error";

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

// Route version for diagnostics
const ROUTE_VERSION = "engagements-route-debug-v1";
const SERVICE_IMPORT_PATH = "@/services/engagement";
const HANDLER_NAME = "engagementsGetHandler";

// Explicit safe handler function
// Must match wrapper signature: handler(ctx: CanonicalAuthContext, params: Record<string, string>)
async function engagementsGetHandler(
  ctx: CanonicalAuthContext,
  params: Record<string, string>
) {
  let stage = "route_start";

  try {
    // Stage 1: Extract context
    stage = "workspace_context";
    const workspaceId = ctx.verifiedWorkspaceId;
    if (!workspaceId) {
      throw new ClassifiedApiError(
        "workspace context missing",
        "engagements_workspace_context_failed",
        stage,
        403
      );
    }

    // Stage 2: Parse query parameters
    stage = "parse_query";
    let parsedParams;
    try {
      parsedParams = parseSearchParams(
        ctx.request?.url || "",
        listEngagementsSchema
      );
    } catch (error) {
      throw new ClassifiedApiError(
        error instanceof Error ? error.message : "invalid query parameters",
        "engagements_parse_query_failed",
        stage,
        400
      );
    }

    // Stage 3: Before service call
    stage = "before_service_call";

    // Stage 4: Call service
    stage = "service_call";
    let result;
    try {
      const hasAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
      result = await listEngagements(workspaceId, parsedParams, hasAccess);
    } catch (error) {
      // If service throws classified error, preserve it
      if (hasClassification(error)) {
        throw error;
      }
      // Otherwise wrap unknown error with service_call stage
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      const classifiedError = new ClassifiedApiError(
        errorMsg,
        "engagements_service_call_failed",
        stage,
        500,
        error
      );
      // Add route context for diagnostics
      classifiedError.safeDetails = {
        routeVersion: ROUTE_VERSION,
        serviceImportPath: SERVICE_IMPORT_PATH,
        handlerName: HANDLER_NAME,
      };
      throw classifiedError;
    }

    // Stage 5: Validate response shape
    stage = "response_validation";
    if (!result || typeof result !== "object") {
      throw new ClassifiedApiError(
        "service returned invalid response shape",
        "engagements_response_mapping_failed",
        "response_mapping",
        500
      );
    }
    if (!Array.isArray(result.engagements)) {
      throw new ClassifiedApiError(
        "engagements must be array",
        "engagements_response_validation_failed",
        stage,
        500
      );
    }
    if (typeof result.total !== "number") {
      throw new ClassifiedApiError(
        "total must be number",
        "engagements_response_validation_failed",
        stage,
        500
      );
    }

    // Stage 6: Return response
    stage = "response_return";
    return Response.json({
      ...result,
      _routeVersion: ROUTE_VERSION,
    });
  } catch (error) {
    // Catch ANY error that escaped the inner handlers
    // Ensure it's always ClassifiedApiError before throwing to wrapper
    if (hasClassification(error)) {
      // Preserve inner classification and add route context if missing
      const classifiedError = error as any;
      if (!classifiedError.safeDetails) {
        classifiedError.safeDetails = {};
      }
      if (!classifiedError.safeDetails.routeVersion) {
        classifiedError.safeDetails.routeVersion = ROUTE_VERSION;
      }
      if (!classifiedError.safeDetails.handlerName) {
        classifiedError.safeDetails.handlerName = HANDLER_NAME;
      }
      throw classifiedError;
    }
    // Wrap any unexpected raw error
    const msg = error instanceof Error ? error.message : String(error);
    const classifiedError = new ClassifiedApiError(
      `GET /api/engagements failed at ${stage}: ${msg}`,
      `engagements_${stage}_failed`,
      stage,
      500,
      error
    );
    classifiedError.safeDetails = {
      routeVersion: ROUTE_VERSION,
      serviceImportPath: SERVICE_IMPORT_PATH,
      handlerName: HANDLER_NAME,
    };
    throw classifiedError;
  }
}

export const GET = withCanonicalEnforcement(engagementsGetHandler, {
  requireCapabilities: ["ENGAGEMENT_VIEW"],
  requireWorkspace: true,
  errorNamespace: "engagements",
  operationName: "list_engagements",
  routeVersion: "engagements-route-debug-v2",
  serviceImportPath: "@/services/engagement",
  handlerName: "engagementsGetHandler",
  serviceVersion: ENGAGEMENTS_SERVICE_VERSION,
});

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
