import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ValidationError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { runConsultingPipeline } from "@/services/consulting-engine/pipeline";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { assertEngagementAccess } from "@/lib/visibility";
import { checkIdempotencyKey, recordIdempotencyResponse, recordIdempotencyError } from "@/services/idempotency";
import { z } from "zod/v4";
import { classifyOperatorError } from "@/lib/operator-error-governance";

const runConsultingEngineSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID format"),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header required");
    }

    const body = await parseRequestBody(ctx.request!, runConsultingEngineSchema);
    parseOrThrow(uuidSchema, body.engagementId);

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "runConsultingPipeline",
      actorId: ctx.verifiedActorId,
      payload: body,
      workspaceId,
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return Response.json(idempotencyCheck.cachedResponse.body, {
        status: idempotencyCheck.cachedResponse.status,
      });
    }

    await assertEngagementAccess(ctx.verifiedActorId, body.engagementId, workspaceId);

    try {
      const result = await runConsultingPipeline(body.engagementId, ctx, workspaceId);

      const response = {
        success: result.status === "SUCCESS",
        status: result.status,
        data: {
          decisionMemo: result.decisionMemo,
          recommendations: result.recommendations,
          actions: result.actions,
        },
        warnings: result.warnings,
      };

      const statusCode = result.status === "SUCCESS" ? 200 : 400;
      await recordIdempotencyResponse(idempotencyKey, statusCode, response);

      return Response.json(response, { status: statusCode });
    } catch (error) {
      const governed = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: 'action' });
      const message = governed.operatorMessage;

      if (
        message.includes("not found") ||
        message.includes("not exist") ||
        message.includes("does not exist")
      ) {
        const errorResponse = {
          success: false,
          status: "ERROR",
          error: {
            message: "Engagement not found",
            code: "ENGAGEMENT_NOT_FOUND",
          },
          data: { decisionMemo: null, recommendations: [], actions: [] },
          warnings: [],
        };
        await recordIdempotencyError(idempotencyKey, new Error("Engagement not found"));
        return Response.json(errorResponse, { status: 404 });
      }

      const err = error instanceof Error ? error : new Error("Unknown error");
      await recordIdempotencyError(idempotencyKey, err);
      throw error;
    }
  },
  {
    requireCapabilities: [CAPABILITIES.RECOMMENDATION_CREATE],
    requireWorkspace: true,
  }
);
