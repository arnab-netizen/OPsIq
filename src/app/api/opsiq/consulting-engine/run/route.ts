import { withRequestContext } from "@/lib/api-handler";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { runConsultingPipeline } from "@/services/consulting-engine/pipeline";
import { parseRequestBody, parseOrThrow, uuidSchema } from "@/lib/validation";
import { assertEngagementAccess } from "@/lib/visibility";
import { z } from "zod/v4";

const runConsultingEngineSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID format"),
});

export const POST = withRequestContext(async (request) => {
  const { session } = await withAuth({
    capability: CAPABILITIES.RECOMMENDATION_CREATE,
  });

  const body = await parseRequestBody(request, runConsultingEngineSchema);
  parseOrThrow(uuidSchema, body.engagementId);

  await assertEngagementAccess(session.user.id, body.engagementId);

  try {
    const result = await runConsultingPipeline(
      body.engagementId,
      session.user.id
    );

    return Response.json(
      {
        success: result.status === "SUCCESS",
        status: result.status,
        data: {
          decisionMemo: result.decisionMemo,
          recommendations: result.recommendations,
          actions: result.actions,
        },
        warnings: result.warnings,
      },
      { status: result.status === "SUCCESS" ? 200 : 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (
      message.includes("not found") ||
      message.includes("not exist") ||
      message.includes("does not exist")
    ) {
      return Response.json(
        {
          success: false,
          status: "ERROR",
          error: {
            message: "Engagement not found",
            code: "ENGAGEMENT_NOT_FOUND",
          },
          data: { decisionMemo: null, recommendations: [], actions: [] },
          warnings: [],
        },
        { status: 404 }
      );
    }

    throw error;
  }
});
