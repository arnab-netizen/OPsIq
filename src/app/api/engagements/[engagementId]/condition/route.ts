import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
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

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, ctx.verifiedWorkspaceId);

    const history = await getConditionHistory(engagementId, ctx.verifiedWorkspaceId);
    return Response.json({ profiles: history });
  },
  {
    requireCapabilities: [CAPABILITIES.CONDITION_VIEW],
    requireWorkspace: true,
  }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { engagementId } = params;
    parseOrThrow(uuidSchema, engagementId);

    await assertEngagementAccess(ctx.verifiedActorId, engagementId, ctx.verifiedWorkspaceId);

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return Response.json(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const body = await parseRequestBody(ctx.request!, assessConditionSchema);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "assessCondition",
      actorId: ctx.verifiedActorId,
      payload: { engagementId, ...body },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return Response.json(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      const result = await assessCondition(
        { ...body, engagementId, workspaceId: ctx.verifiedWorkspaceId },
        ctx
      );
      await recordIdempotencyResponse(idempotencyKey, 201, result);
      return Response.json(result, { status: 201 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.CONDITION_ASSESS],
    requireWorkspace: true,
  }
);
