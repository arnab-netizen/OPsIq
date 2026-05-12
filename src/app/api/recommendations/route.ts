import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { createRecommendation } from "@/services/recommendation";
import { parseRequestBody } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { assertCapability } from "@/services/entitlement.service";
import { PlanLimitError } from "@/infra/errors";
import { z } from "zod/v4";
import {
  RECOMMENDATION_PRIORITIES,
  RECOMMENDATION_TYPES,
} from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const createRecommendationSchema = z.object({
  engagementId: z.string().uuid(),
  stageId: z.string().uuid().optional(),
  findingId: z.string().uuid(),
  title: z.string().min(1),
  summary: z.string().min(1),
  priority: z.enum(RECOMMENDATION_PRIORITIES),
  type: z.enum(RECOMMENDATION_TYPES),
  rationale: z.string().min(1),
  expectedImpact: z.string().optional(),
  estimatedEffort: z.string().optional(),
  targetMetric: z.string().optional(),
  ownerId: z.string().uuid().optional(),
  dueAt: z.string().optional(),
});

export const POST = withRequestContext(async (request) => {
  // Authenticate + authorize (fail-closed)
  const authContext = await withAuth({
    capability: CAPABILITIES.RECOMMENDATION_CREATE,
    internalOnly: true,
  });

  // Validate workspace membership (fail-closed)
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Check entitlement: decision_create (plan-based quota enforcement)
  // Recommendations consume decision quota in the permission model
  const capabilityCheck = await assertCapability(workspaceId, "decision_create");
  if (!capabilityCheck.allowed) {
    throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");
  }

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, createRecommendationSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "createRecommendation",
    actorId: authContext.session.user.id,
    payload: body,
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await createRecommendation(body, authContext, workspaceId);
    await recordIdempotencyResponse(idempotencyKey, 201, result);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});
