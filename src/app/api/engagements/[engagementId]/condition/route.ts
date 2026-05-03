import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  assessCondition,
  getConditionHistory,
} from "@/services/business-condition";
import { assertEngagementAccess } from "@/lib/visibility";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import {
  BUSINESS_CONDITION_RATINGS,
  PRESSURE_LEVELS,
  MATURITY_LEVELS,
} from "@/domain/constants/statuses";
import type { NextRequest } from "next/server";

const assessConditionSchema = z.object({
  businessStatus: z.enum(BUSINESS_CONDITION_RATINGS),
  severityScore: z.number().int().min(1).max(10),
  urgencyLevel: z.enum(PRESSURE_LEVELS),
  cashPressureLevel: z.enum(PRESSURE_LEVELS),
  marginPressureLevel: z.enum(PRESSURE_LEVELS),
  clientConcentrationRisk: z.enum(PRESSURE_LEVELS),
  ownerDependencyRisk: z.enum(PRESSURE_LEVELS),
  keyPersonDependencyRisk: z.enum(PRESSURE_LEVELS),
  processMaturityLevel: z.enum(MATURITY_LEVELS),
  managementMaturityLevel: z.enum(MATURITY_LEVELS),
  executionCapacityLevel: z.enum(MATURITY_LEVELS),
  moraleFragilityLevel: z.enum(MATURITY_LEVELS),
  resilienceLevel: z.enum(MATURITY_LEVELS),
  growthReadinessLevel: z.enum(MATURITY_LEVELS),
  notes: z.string().optional(),
});

export const GET = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session } = await withAuth({ capability: CAPABILITIES.CONDITION_VIEW });

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

  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  const history = await getConditionHistory(engagementId, workspaceId);
  return Response.json({ profiles: history });
});

export const POST = withRequestContext(async (request, context) => {
  // Authenticate + authorize (fail-closed)
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.CONDITION_ASSESS,
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

  const { engagementId } = await context.params;
  parseOrThrow(uuidSchema, engagementId);

  await assertEngagementAccess(session.user.id, engagementId, workspaceId);

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return Response.json(
      { error: "idempotency-key header required" },
      { status: 400 }
    );
  }

  const body = await parseRequestBody(request, assessConditionSchema);

  // Check idempotency
  const idempotencyCheck = await checkIdempotencyKey({
    idempotencyKey,
    operationName: "assessCondition",
    actorId: session.user.id,
    payload: { engagementId, ...body },
  });

  if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
    return Response.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
    });
  }

  try {
    const result = await assessCondition(
      { ...body, engagementId, workspaceId },
      { session, policy }
    );
    await recordIdempotencyResponse(idempotencyKey, 201, result);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const err = error instanceof Error ? error : new Error("Unknown error");
    await recordIdempotencyError(idempotencyKey, err);
    throw error;
  }
});
