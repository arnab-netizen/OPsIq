import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
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
  why_now: z.string().min(10).max(500).optional(),
  cost_of_inaction: z.string().min(10).max(500).optional(),
  expected_metric: z.string().optional(),
  expected_direction: z.enum(["INCREASE", "DECREASE", "STABILIZE"]).optional(),
  expected_target: z.string().min(1).optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    // Check entitlement: decision_create (plan-based quota enforcement)
    const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);
    if (!capabilityCheck.allowed) {
      throw new PlanLimitError(CAPABILITIES.DECISION_CREATE, capabilityCheck.reason || "Plan limit exceeded");
    }

    const idempotencyKey = ctx.request!.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return canonicalJson(
        { error: "idempotency-key header required" },
        { status: 400 }
      );
    }

    const body = await parseRequestBody(ctx.request!, createRecommendationSchema);

    // Check idempotency
    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "createRecommendation",
      actorId: ctx.verifiedSessionSnapshot.actorId,
      payload: body,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return canonicalJson(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    try {
      const result = await createRecommendation(body, ctx, workspaceId);
      await recordIdempotencyResponse(idempotencyKey, 201, result);
      return canonicalJson(result, { status: 201 });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  { requireWorkspace: true, requireCapabilities: ['RECOMMENDATION_CREATE'] }
);
